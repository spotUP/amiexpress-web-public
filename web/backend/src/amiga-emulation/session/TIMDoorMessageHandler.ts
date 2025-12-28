/**
 * TIMDoorMessageHandler.ts
 * Handles TIM door protocol (DoorControl port with doorMsg and PG_* commands)
 * Reference: express.e lines 4371-4525
 *
 * TIM doors use a simpler message structure (doorMsg) than XIM doors (jhMessage).
 * They communicate via DoorControl{n} port instead of AEDoorPort{n}.
 */

import { MoiraEmulator } from "../cpu/MoiraEmulator.js";
import { Socket } from "socket.io";
import { DoorConfig, TIMDoorCommand, TIMDoorConstants } from "../DoorTypes.js";
import * as fs from "fs";
import * as path from "path";
import * as amigafs from "../../utils/amigafs.js";

export class TIMDoorMessageHandler {
  private emulator: MoiraEmulator;
  private socket: Socket;
  private config: DoorConfig;

  // Door display state
  private lineCount: number = 0;
  private nonStopDisplayFlag: boolean = false;
  private rawArrow: boolean = false;
  private doorTimeout: number = 300; // 5 minute default timeout

  // Input handling (similar to XIM protocol)
  private inputQueue: string[] = [];
  private waitingForLineInput: boolean = false;
  private waitingForHotkey: boolean = false;
  private waitingForPause: boolean = false;
  private lineInputBuffer: string = '';
  private lineInputMaxLen: number = 0;
  private pendingMsgAddr: number = 0;

  constructor(
    emulator: MoiraEmulator,
    socket: Socket,
    config: DoorConfig
  ) {
    this.emulator = emulator;
    this.socket = socket;
    this.config = config;
  }

  /**
   * Check if waiting for user input
   */
  isWaitingForInput(): boolean {
    return this.waitingForLineInput || this.waitingForHotkey || this.waitingForPause;
  }

  /**
   * Queue user input for processing
   */
  queueInput(data: string): void {
    if (this.waitingForPause) {
      // Handle pause input
      const firstChar = data.charAt(0).toUpperCase();
      if (firstChar === 'N') {
        const secondChar = data.charAt(1).toUpperCase();
        if (secondChar === 'S') {
          // NS = Non-Stop mode
          this.nonStopDisplayFlag = true;
        }
        // N alone would abort, but we just continue for TIM doors
      }
      this.waitingForPause = false;
      this.socket.emit('ansi-output', '\x1b[1A\x1b[K'); // Clear pause prompt
      console.log(`[TIMDoorHandler] Pause input received: "${data}"`);
      return;
    }

    if (this.waitingForHotkey) {
      // Single key input
      const char = data.charAt(0);
      if (this.pendingMsgAddr) {
        this.setString(this.pendingMsgAddr, char);
        this.setCarrier(this.pendingMsgAddr, false);
      }
      this.waitingForHotkey = false;
      console.log(`[TIMDoorHandler] Hotkey input received: "${char}"`);
      return;
    }

    if (this.waitingForLineInput) {
      // Line input - accumulate or complete on Enter
      if (data === '\r' || data === '\n' || data.includes('\r') || data.includes('\n')) {
        // Enter pressed - complete input
        const input = this.lineInputBuffer.slice(0, this.lineInputMaxLen);
        if (this.pendingMsgAddr) {
          this.setString(this.pendingMsgAddr, input);
          this.setCarrier(this.pendingMsgAddr, false);
        }
        this.waitingForLineInput = false;
        this.lineInputBuffer = '';
        console.log(`[TIMDoorHandler] Line input completed: "${input}"`);
      } else {
        // Accumulate input
        this.lineInputBuffer += data;
        this.socket.emit('ansi-output', data); // Echo
      }
      return;
    }

    // Not waiting for anything special - queue for later
    this.inputQueue.push(data);
    console.log(`[TIMDoorHandler] Input queued: "${data}"`);
  }

  /**
   * Read doorMsg structure from memory
   * Reference: express.e lines 4374-4376
   */
  private readDoorMsg(msgAddr: number): {
    carrier: boolean;
    command: number;
    data: number;
    str: string;
  } {
    const carrier = this.emulator.readMemory16(msgAddr + TIMDoorConstants.DOORMSG_CARRIER_OFFSET) !== 0;
    const command = this.emulator.readMemory16(msgAddr + TIMDoorConstants.DOORMSG_COMMAND_OFFSET);
    const data = this.emulator.readMemory32(msgAddr + TIMDoorConstants.DOORMSG_DATA_OFFSET);
    const str = this.emulator.readString(msgAddr + TIMDoorConstants.DOORMSG_STRING_OFFSET, TIMDoorConstants.DOORMSG_STRING_CAPACITY);

    return { carrier, command, data, str };
  }

  /**
   * Write carrier flag to doorMsg
   */
  private setCarrier(msgAddr: number, carrier: boolean): void {
    this.emulator.writeMemory16(msgAddr + TIMDoorConstants.DOORMSG_CARRIER_OFFSET, carrier ? 1 : 0);
  }

  /**
   * Write data field to doorMsg
   */
  private setData(msgAddr: number, data: number): void {
    this.emulator.writeMemory32(msgAddr + TIMDoorConstants.DOORMSG_DATA_OFFSET, data);
  }

  /**
   * Write string to doorMsg
   */
  private setString(msgAddr: number, str: string): void {
    const maxLen = TIMDoorConstants.DOORMSG_STRING_CAPACITY;
    const truncated = str.slice(0, maxLen - 1);
    for (let i = 0; i < maxLen; i++) {
      this.emulator.writeMemory(msgAddr + TIMDoorConstants.DOORMSG_STRING_OFFSET + i,
        i < truncated.length ? truncated.charCodeAt(i) : 0);
    }
  }

  /**
   * checkForPause() - Pause after screen is full
   * Reference: express.e lines 5181-5201
   *
   * Behavior from express.e:
   * - If no user logged on, return success
   * - Get user's line length (default 22)
   * - If not in non-stop mode, increment line count
   * - If line count >= line length and not in non-stop mode:
   *   - Reset line count to 0
   *   - Display "(Pause)...More(y/n/ns)? "
   *   - Wait for input (lineInput with 3 char max)
   *   - If N: abort (return failure) unless NS (set nonStopDisplayFlag)
   *   - Send "[1A[K" to clear the pause prompt
   * - Return success
   */
  private async checkForPause(): Promise<number> {
    if (!this.config.bbsSession?.user) {
      return 0; // RESULT_SUCCESS
    }

    const lineLen = this.config.bbsSession.user.linesPerScreen || 22;

    if (!this.nonStopDisplayFlag) {
      this.lineCount++;
    }

    if (!this.nonStopDisplayFlag && this.lineCount >= lineLen) {
      this.lineCount = 0;

      // Check if we have queued input from previous pause
      if (this.inputQueue.length > 0) {
        const input = this.inputQueue.shift()!;
        const firstChar = input.charAt(0).toUpperCase();
        if (firstChar === 'N') {
          const secondChar = input.charAt(1).toUpperCase();
          if (secondChar === 'S') {
            this.nonStopDisplayFlag = true;
          } else {
            return -1; // RESULT_FAILURE - user wants to abort
          }
        }
        // Y or other = continue
        return 0;
      }

      // Display pause prompt exactly as express.e does
      this.socket.emit('ansi-output', '(Pause)...More(y/n/ns)? ');

      // Set waiting state - input will be processed by queueInput()
      this.waitingForPause = true;

      // Wait for pause response with a reasonable timeout
      // In a web environment, we can't truly block, but we signal that we're waiting
      // The DoorLifecycleManager will extend loop guard while we wait
      await this.waitForPauseResponse();

      // Clear the pause prompt line (ANSI: cursor up 1, clear line)
      this.socket.emit('ansi-output', '\x1b[1A\x1b[K');
    }

    return 0; // RESULT_SUCCESS
  }

  /**
   * Wait for pause response with timeout
   * Returns when user provides input or timeout expires
   */
  private async waitForPauseResponse(): Promise<void> {
    const timeout = 30000; // 30 second timeout for pause
    const startTime = Date.now();

    while (this.waitingForPause) {
      if (Date.now() - startTime > timeout) {
        // Timeout - auto-continue
        this.waitingForPause = false;
        console.log('[TIMDoorHandler] Pause timeout - auto-continuing');
        break;
      }
      // Yield to event loop to allow input processing
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  /**
   * Wait for line input with timeout
   * Returns when user presses Enter or timeout expires
   */
  private async waitForLineInput(): Promise<void> {
    const timeout = this.doorTimeout * 1000; // doorTimeout is in seconds
    const startTime = Date.now();

    while (this.waitingForLineInput) {
      if (Date.now() - startTime > timeout) {
        // Timeout - set carrier flag to indicate timeout/disconnect
        this.waitingForLineInput = false;
        if (this.pendingMsgAddr) {
          this.setCarrier(this.pendingMsgAddr, true); // Carrier lost = timeout
          this.setString(this.pendingMsgAddr, this.lineInputBuffer);
        }
        console.log('[TIMDoorHandler] Line input timeout');
        break;
      }
      // Yield to event loop to allow input processing
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  /**
   * Wait for hotkey input with timeout
   * Returns when user presses a key or timeout expires
   */
  private async waitForHotkey(): Promise<void> {
    const timeout = this.doorTimeout * 1000; // doorTimeout is in seconds
    const startTime = Date.now();

    while (this.waitingForHotkey) {
      if (Date.now() - startTime > timeout) {
        // Timeout - set carrier flag to indicate timeout/disconnect
        this.waitingForHotkey = false;
        if (this.pendingMsgAddr) {
          this.setCarrier(this.pendingMsgAddr, true); // Carrier lost = timeout
          this.setString(this.pendingMsgAddr, '');
        }
        console.log('[TIMDoorHandler] Hotkey timeout');
        break;
      }
      // Yield to event loop to allow input processing
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  /**
   * Handle a TIM door message
   * Reference: express.e lines 4377-4520
   */
  async handleMessage(msgAddr: number): Promise<{ exit: boolean }> {
    const msg = this.readDoorMsg(msgAddr);
    console.log(`[TIMDoorHandler] PG_* command: ${msg.command}, data: ${msg.data}, str: "${msg.str}"`);

    // Initialize carrier to false (express.e:4375)
    this.setCarrier(msgAddr, false);

    let exit = false;

    switch (msg.command) {
      case TIMDoorCommand.PG_SHUTDOWN:
        // express.e:4378-4382: Shutdown door
        console.log(`[TIMDoorHandler] PG_SHUTDOWN: Exiting door`);
        this.socket.emit('ansi-output', '\r\n');
        this.rawArrow = false;
        exit = true;
        break;

      case TIMDoorCommand.PG_SO:
        // express.e:4384-4385: Serial output (character)
        console.log(`[TIMDoorHandler] PG_SO: Serial char ${msg.data}`);
        if (msg.data >= 0 && msg.data <= 255) {
          this.socket.emit('ansi-output', String.fromCharCode(msg.data));
        }
        break;

      case TIMDoorCommand.PG_CC:
        // express.e:4386-4387: Console output (character)
        console.log(`[TIMDoorHandler] PG_CC: Console char ${msg.data}`);
        if (msg.data >= 0 && msg.data <= 255) {
          this.socket.emit('ansi-output', String.fromCharCode(msg.data));
        }
        break;

      case TIMDoorCommand.PG_CH:
        // express.e:4388-4390: Both serial and console output (character)
        console.log(`[TIMDoorHandler] PG_CH: Both char ${msg.data}`);
        if (msg.data >= 0 && msg.data <= 255) {
          this.socket.emit('ansi-output', String.fromCharCode(msg.data));
        }
        break;

      case TIMDoorCommand.PG_CO:
        // express.e:4391-4394: Console puts (string)
        console.log(`[TIMDoorHandler] PG_CO: Console puts "${msg.str}"`);
        this.socket.emit('ansi-output', msg.str);
        if (msg.data) {
          this.socket.emit('ansi-output', '\r\n');
        }
        await this.checkForPause();
        break;

      case TIMDoorCommand.PG_SM:
        // express.e:4396-4399: Send message (string) - both serial and console
        console.log(`[TIMDoorHandler] PG_SM: Send message "${msg.str}"`);
        this.socket.emit('ansi-output', msg.str);
        if (msg.data) {
          this.socket.emit('ansi-output', '\r\n');
        }
        await this.checkForPause();
        break;

      case TIMDoorCommand.PG_PM:
        // express.e:4401-4408: Prompt message (with input)
        // lineInput(msg.string,'',msg.data,doorTimeout,tempstring)
        console.log(`[TIMDoorHandler] PG_PM: Prompt "${msg.str}" maxlen=${msg.data}`);
        this.socket.emit('ansi-output', msg.str);

        // Check if we have queued input
        if (this.inputQueue.length > 0) {
          const input = this.inputQueue.shift()!;
          const trimmed = input.replace(/[\r\n]+$/, '').slice(0, msg.data);
          this.setString(msgAddr, trimmed);
          this.setCarrier(msgAddr, false);
          console.log(`[TIMDoorHandler] PG_PM: Immediate input "${trimmed}"`);
        } else {
          // Wait for line input
          this.waitingForLineInput = true;
          this.lineInputBuffer = '';
          this.lineInputMaxLen = msg.data || 80;
          this.pendingMsgAddr = msgAddr;
          await this.waitForLineInput();
        }
        break;

      case TIMDoorCommand.PG_SC:
        // express.e:4409-4416: Serial input
        // Similar to PG_PM but for serial-only
        console.log(`[TIMDoorHandler] PG_SC: Serial input "${msg.str}" maxlen=${msg.data}`);
        this.socket.emit('ansi-output', msg.str);

        // Check if we have queued input
        if (this.inputQueue.length > 0) {
          const input = this.inputQueue.shift()!;
          const trimmed = input.replace(/[\r\n]+$/, '').slice(0, msg.data);
          this.setString(msgAddr, trimmed);
          this.setCarrier(msgAddr, false);
          console.log(`[TIMDoorHandler] PG_SC: Immediate input "${trimmed}"`);
        } else {
          // Wait for line input
          this.waitingForLineInput = true;
          this.lineInputBuffer = '';
          this.lineInputMaxLen = msg.data || 80;
          this.pendingMsgAddr = msgAddr;
          await this.waitForLineInput();
        }
        break;

      case TIMDoorCommand.PG_HK:
        // express.e:4417-4427: Hot key
        // readChar(doorTimeout) - single character input
        console.log(`[TIMDoorHandler] PG_HK: Hot key "${msg.str}"`);
        this.lineCount = 0;
        this.socket.emit('ansi-output', msg.str);

        // Check if we have queued input
        if (this.inputQueue.length > 0) {
          const input = this.inputQueue.shift()!;
          const char = input.charAt(0);
          this.setString(msgAddr, char);
          this.setCarrier(msgAddr, false);
          console.log(`[TIMDoorHandler] PG_HK: Immediate key "${char}"`);
        } else {
          // Wait for single key
          this.waitingForHotkey = true;
          this.pendingMsgAddr = msgAddr;
          await this.waitForHotkey();
        }
        break;

      case TIMDoorCommand.PG_SG:
        // express.e:4428-4432: Security screen (display screen file)
        console.log(`[TIMDoorHandler] PG_SG: Security screen "${msg.str}"`);
        this.nonStopDisplayFlag = false;
        // Find and display security screen
        await this.displaySecurityScreen(msg.str);
        break;

      case TIMDoorCommand.PG_SF:
        // express.e:4433-4437: Show file
        console.log(`[TIMDoorHandler] PG_SF: Show file "${msg.str}"`);
        this.nonStopDisplayFlag = false;
        await this.displayFile(msg.str);
        break;

      case TIMDoorCommand.PG_EF:
        // express.e:4438-4443: Edit file
        console.log(`[TIMDoorHandler] PG_EF: Edit file "${msg.str}" (not fully implemented)`);
        // File editing requires full editor integration
        break;

      case TIMDoorCommand.PG_UD:
        // express.e:4444-4463: User data (numeric)
        console.log(`[TIMDoorHandler] PG_UD: User data request ${msg.data}`);
        this.handleUserDataRequest(msgAddr, msg.data);
        break;

      case TIMDoorCommand.PG_US:
        // express.e:4464-4494: User string
        console.log(`[TIMDoorHandler] PG_US: User string request ${msg.data}`);
        this.handleUserStringRequest(msgAddr, msg.data);
        break;

      case TIMDoorCommand.PG_RD:
        // express.e:4499-4502: Random number
        console.log(`[TIMDoorHandler] PG_RD: Random number max=${msg.data}`);
        if (msg.data !== 0) {
          this.setData(msgAddr, Math.floor(Math.random() * msg.data));
        }
        break;

      case TIMDoorCommand.PG_TM:
        // express.e:4505-4509: Time modify
        console.log(`[TIMDoorHandler] PG_TM: Time modify ${msg.data} minutes`);
        if (this.config.bbsSession?.user) {
          const minutes = msg.data;
          // Adjust time used/limit
          this.config.bbsSession.user.timeUsed = Math.max(0,
            (this.config.bbsSession.user.timeUsed || 0) - (minutes * 60));
          this.config.bbsSession.timeLimit = Math.max(0,
            (this.config.bbsSession.timeLimit || 0) + (minutes * 60));
        }
        break;

      case TIMDoorCommand.PG_FF:
        // express.e:4510-4515: File find
        console.log(`[TIMDoorHandler] PG_FF: File find "${msg.str}"`);
        {
          const exists = amigafs.existsSync(msg.str);
          this.setData(msgAddr, exists ? 1 : -1);
        }
        break;

      case TIMDoorCommand.BB_TASKPRI:
        // express.e:4516-4518: Task priority
        console.log(`[TIMDoorHandler] BB_TASKPRI: Get task priority`);
        {
          const taskPri = this.config.priority || '0';
          this.setString(msgAddr, taskPri);
        }
        break;

      default:
        console.log(`[TIMDoorHandler] Unknown PG_* command: ${msg.command}`);
        break;
    }

    return { exit };
  }

  /**
   * Handle PG_UD (User Data) numeric requests
   * Reference: express.e:4444-4463
   */
  private handleUserDataRequest(msgAddr: number, dataType: number): void {
    const user = this.config.bbsSession?.user;
    let value = 0;

    switch (dataType) {
      case 1: // Security status / 10
        value = Math.floor((user?.secLevel || 0) / 10);
        break;
      case 2: // Expert mode
        value = user?.expert ? 1 : 0;
        break;
      case 3: // Unknown (returns 0)
        value = 0;
        break;
      case 4: // Times called
      case 5: // Times called (duplicate)
        value = user?.calls || 0;
        break;
      case 6: // Returns 1
        value = 1;
        break;
      case 7: // Time limit in minutes
        value = Math.floor((this.config.bbsSession?.timeLimit || 0) / 60);
        break;
      case 8: // Screen width (80)
        value = 80;
        break;
      case 9: // Lines per screen
        value = user?.linesPerScreen || 24;
        break;
      default:
        value = 0;
    }

    this.setData(msgAddr, value);
    console.log(`[TIMDoorHandler] PG_UD type=${dataType} -> ${value}`);
  }

  /**
   * Handle PG_US (User String) requests
   * Reference: express.e:4464-4494
   */
  private handleUserStringRequest(msgAddr: number, dataType: number): void {
    const user = this.config.bbsSession?.user;
    const bbsRoot = this.config.bbsSession?.bbsRoot || process.cwd();
    let value = '';

    switch (dataType) {
      case 1: // User name (21 chars max)
        value = (user?.username || user?.name || '').slice(0, 21);
        break;
      case 2: // Empty string
        value = '';
        break;
      case 3: // Location (39 chars max)
        value = (user?.location || '').slice(0, 39);
        break;
      case 4: // Location (29 chars max)
        value = (user?.location || '').slice(0, 29);
        break;
      case 5: // Location (2 chars - state code?)
        value = (user?.location || '').slice(0, 2);
        break;
      case 6: // Location (7 chars)
        value = (user?.location || '').slice(0, 7);
        break;
      case 7: // PGDOORS: path
        value = 'PGDOORS:';
        break;
      case 8: // BBS location path
        value = bbsRoot;
        break;
      case 9: // Current date (long format)
        value = new Date().toLocaleDateString('en-US', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
        break;
      case 10: // Current time (long format)
        value = new Date().toLocaleTimeString('en-US', {
          hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
        break;
      default:
        value = '';
    }

    this.setString(msgAddr, value);
    console.log(`[TIMDoorHandler] PG_US type=${dataType} -> "${value}"`);
  }

  /**
   * Display a security screen file
   * Reference: express.e:4428-4432 (findSecurityScreen + displayFile)
   */
  private async displaySecurityScreen(screenName: string): Promise<void> {
    const bbsRoot = this.config.bbsSession?.bbsRoot || process.cwd();
    const screensDir = path.join(bbsRoot, 'Screens');

    // Try various extensions
    const extensions = ['', '.txt', '.ans', '.TXT', '.ANS'];
    for (const ext of extensions) {
      const filePath = path.join(screensDir, screenName + ext);
      if (amigafs.existsSync(filePath)) {
        await this.displayFile(filePath);
        return;
      }
    }

    console.log(`[TIMDoorHandler] Security screen not found: ${screenName}`);
  }

  /**
   * Display a file
   * Reference: express.e:4433-4437
   */
  private async displayFile(filePath: string): Promise<void> {
    try {
      if (!amigafs.existsSync(filePath)) {
        console.log(`[TIMDoorHandler] File not found: ${filePath}`);
        return;
      }

      const content = amigafs.readFileSync(filePath, 'utf8') as string;
      const lines = content.split(/\r?\n/);

      for (const line of lines) {
        this.socket.emit('ansi-output', line + '\r\n');
        await this.checkForPause();
      }
    } catch (error) {
      console.error(`[TIMDoorHandler] Error displaying file ${filePath}:`, error);
    }
  }
}
