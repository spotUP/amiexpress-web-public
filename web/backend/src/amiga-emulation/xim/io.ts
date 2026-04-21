/**
 * XIM I/O Operations
 *
 * Handles input/output operations for the XIM protocol including:
 * - Terminal output (write, console, serial)
 * - Keyboard input (hotkey, line input, getkey)
 * - Input queue management
 */

import * as fs from 'fs';
import * as amigafs from '../../utils/amigafs';
import * as path from 'path';
import { Socket } from 'socket.io';
import { MoiraEmulator } from '../cpu/MoiraEmulator';
import { DoorConstants } from '../DoorTypes';
import { ArrowKeyCodes, BBSSessionData, XIMCommand, XIMMessage, XIMState } from './types';
import { XIMMessageParser } from './messages';
import { ExecLibrary } from '../api/ExecLibrary';
import { AnsiUtil } from '../../utils/ansi.util';
import { BBSPaths } from '../../utils/bbs-paths.util';
import { resolveAssignPath } from '../../utils/path-util';
import { SysopDebugUtil } from '../../utils/sysop-debug.util';
import { looksLikeAsciiArt } from '../../utils/ascii-art.util';
import { wrapLine } from './line-wrap.util';
import { getNewlineMode, normalizeNewlines } from './newline-mode.util';
import { ximLogger } from '../../utils/XIMLogger';
import { getSystemTime } from '../../utils/date-time.util';
import { debugLog } from '../../utils/debug-log';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const iconv = require('iconv-lite');

export class XIMIOHandler {
  private emulator: MoiraEmulator;
  private execLibrary: ExecLibrary;
  private socket: Socket;
  private messageParser: XIMMessageParser;
  private bbsSession: BBSSessionData;
  private state: XIMState;
  private inputQueue: string[] = [];
  private keyState: Record<string, boolean> = {}; // Simultaneous key state tracking
  private ximPort?: number; // Address of AEDoorPort for bidirectional XIM protocol detection

  // Line input state
  private waitingForLineInput: boolean = false;
  private lineInputMessage: XIMMessage | null = null;
  private lineInputBuffer: string = '';
  private lineInputMaxLen: number = DoorConstants.MESSAGE_STRING_CAPACITY;

  // Hotkey/pause state
  private waitingForHotkey: boolean = false;
  private hotkeyMessage: XIMMessage | null = null;
  private hotkeyTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private waitingForExtHotkey: boolean = false;
  private extHotkeyMessage: XIMMessage | null = null;
  private waitingForPause: boolean = false;
  private pauseReply: { msg: XIMMessage; data: number } | null = null;
  private pauseInputBuffer: string = '';
  private readUserKeysPending: boolean = false;

  // ANSI sequence buffer for handling split escape sequences across JH_SM calls
  // RTW and other doors may split ANSI sequences like ESC[34m across multiple messages
  private ansiBuffer: string = '';

  // File display serialization - prevent overlapping JH_SF requests
  // Doors may send multiple JH_SF requests in quick succession (e.g., dRE!WAll)
  // Without serialization, outputs interleave causing display corruption
  private fileDisplayLock: Promise<void> = Promise.resolve();

  constructor(
    emulator: MoiraEmulator,
    execLibrary: ExecLibrary,
    socket: Socket,
    messageParser: XIMMessageParser,
    state: XIMState,
    bbsSession: BBSSessionData
  ) {
    this.emulator = emulator;
    this.execLibrary = execLibrary;
    this.socket = socket;
    this.messageParser = messageParser;
    this.state = state;
    this.bbsSession = bbsSession || {};
  }

  /**
   * Direct emit that bypasses modem emulator throttling
   * Doors should output at full speed regardless of user's modem speed preference
   * Must check _directEmit at call time since modem emulator may install after XIM handler
   */
  /**
   * Direct emit that bypasses modem emulator throttling
   * Doors output at full speed regardless of user's modem speed preference
   */
  private directEmit(event: string, ...args: any[]): boolean {
    const socket = this.socket as any;
    // Use the direct emit stored by modem emulator, or call emit on prototype
    if (socket._directEmit) {
      return socket._directEmit(event, ...args);
    }
    // No modem emulator installed, use regular emit
    return this.socket.emit(event, ...args);
  }

  /**
   * Check if waiting for line input from user
   */
  isWaitingForLineInput(): boolean {
    return (
      this.waitingForLineInput || this.waitingForHotkey || this.waitingForExtHotkey || this.waitingForPause
    );
  }

  /**
   * Check if there's queued input available for immediate processing
   */
  hasQueuedInput(): boolean {
    return this.inputQueue.length > 0;
  }

  /**
   * Clear any queued input from before the door started.
   * Called when a new door session begins to prevent leftover keystrokes
   * (e.g., Enter presses during login) from auto-responding to door prompts.
   */
  clearQueuedInput(): void {
    const queueSize = this.inputQueue.length;
    if (queueSize > 0) {
      debugLog(`[XIMIOHandler] Clearing ${queueSize} queued inputs from before door started`);
      this.inputQueue.length = 0;
    }
  }

  /**
   * Update key state for simultaneous input (from keys:state event)
   */
  updateKeyState(data: { key: string; pressed: boolean; keyState: Record<string, boolean> }): void {
    this.keyState = data.keyState;
  }

  /**
   * Get current key state (for doors that need to check multiple keys at once)
   */
  getKeyState(): Record<string, boolean> {
    return { ...this.keyState };
  }

  /**
   * Check if a specific key is currently pressed
   */
  isKeyPressed(key: string): boolean {
    return this.keyState[key] === true;
  }

  /**
   * Queue input from terminal for door to read via GETKEY or JH_LI
   * Called from AmigaDoorSession when 'door:input' event received
   *
   * IMPORTANT: ANSI escape sequences (arrow keys, etc.) must be kept intact.
   * xterm.js sends arrow keys as escape sequences: \x1b[A (up), \x1b[B (down), etc.
   */
  queueInput(data: string): void {
    if (this.state.carrierDropped) {
      return;
    }

    // CRITICAL: Filter out mouse event JSON that leaks through from frontend
    // These are JSON objects like {"type":"mouse"...} that shouldn't be treated as text input
    if (data.startsWith('{"type":"mous') || data.startsWith('{"type":"key')) {
      debugLog(`[XIMIOHandler] Ignoring mouse/key event JSON: ${data.substring(0, 30)}...`);
      return;
    }

    // Parse input into tokens, preserving ANSI escape sequences
    const tokens = this.parseInputTokens(data);
    debugLog(`[XIMIOHandler] queueInput: data="${data.replace(/\r/g, '\\r').replace(/\n/g, '\\n')}" waitingForPause=${this.waitingForPause} tokens=${tokens.length}`);

    for (const token of tokens) {
      // Handle input during pause
      if (this.waitingForPause) {
        debugLog(`[XIMIOHandler] Pause active - received token: "${token.replace(/\r/g, '\\r').replace(/\n/g, '\\n')}"`);
        this.pauseInputBuffer += token;
        // Check for completion (Enter or space typically resumes)
        if (token === '\r' || token === '\n' || token === ' ') {
          debugLog('[XIMIOHandler] Pause completion key received - calling completePauseInput()');
          this.completePauseInput();
        }
        continue;
      }

      if (this.waitingForHotkey && this.hotkeyMessage) {
        // For hotkeys, if it's an escape sequence, pass the full sequence
        this.completeHotkey(token);
        continue;
      }

      if (this.waitingForExtHotkey && this.extHotkeyMessage) {
        // For extended hotkeys, pass the character/sequence
        this.completeExtHotkey(token);
        continue;
      }

      if (this.waitingForLineInput) {
        if (token === '\r' || token === '\n') {
          this.completeLineInput();
          continue;
        }

        if (token === '\b' || token === '\x7f') {
          if (this.lineInputBuffer.length > 0) {
            this.lineInputBuffer = this.lineInputBuffer.slice(0, -1);
            // Echo backspace to terminal
            this.directEmit('ansi-output', '\b \b');
          }
          continue;
        }

        // For line input, add token to buffer (even if it's an escape sequence)
        if (this.lineInputBuffer.length < this.lineInputMaxLen) {
          this.lineInputBuffer += token;
          // Echo typed character (only for single visible characters)
          if (token.length === 1 && token >= ' ' && token <= '~') {
            this.directEmit('ansi-output', token);
          }
        }
        continue;
      }

      // Not waiting for special input - queue for GETKEY/quick key
      this.inputQueue.push(token);
    }
  }

  /**
   * Parse input string into tokens, preserving ANSI escape sequences
   * Returns array of tokens: single chars or complete escape sequences
   */
  private parseInputTokens(data: string): string[] {
    const tokens: string[] = [];
    let i = 0;

    while (i < data.length) {
      // Check for ANSI escape sequence: ESC [ ... <letter>
      if (data[i] === '\x1b' && i + 1 < data.length && data[i + 1] === '[') {
        // Find the end of the CSI sequence (terminated by letter A-Z or a-z)
        let end = i + 2;
        while (end < data.length && !/[A-Za-z~]/.test(data[end])) {
          end++;
        }
        if (end < data.length) {
          // Include the terminating character
          const seq = data.slice(i, end + 1);
          tokens.push(seq);
          i = end + 1;
          continue;
        }
      }
      // Single character
      tokens.push(data[i]);
      i++;
    }

    return tokens;
  }

  /**
   * Handle line input request (JH_LI)
   * From E sources (express.e:3425)
   *
   * IMPORTANT: Pause emulator to wait for user input.
   */
  handleLineInput(msg: XIMMessage): void {
    // Mark that this door uses XIM input commands - prevents native input injection
    debugLog(`[XIMIOHandler] JH_LI (Line Input) received - setting usedXimInput=true`);
    this.state.usedXimInput = true;

    if (this.state.carrierDropped) {
      this.reply(msg, -1, '');
      // NOTE: reply() already calls replyMsg() for native doors
      this.emulator.resume();  // CRITICAL: Resume after early return
      return;
    }

    const maxLen = Math.min(
      msg.data && msg.data > 0 ? msg.data : DoorConstants.MESSAGE_STRING_CAPACITY,
      DoorConstants.MESSAGE_STRING_CAPACITY
    );
    const fullString = this.getMessageString(msg);  // Keep original for file path check
    const defaultText = fullString.slice(0, maxLen);

    // CRITICAL FIX: If door sends JH_LI with empty string and maxLen is large (64K+),
    // it's likely just polling/initializing, not requesting actual line input yet.
    // Send immediate empty reply to let door continue (it will use JH_HK/JH_PM later).
    // This prevents the stuck polling issue with quicklogon and similar doors.
    if (defaultText.length === 0 && maxLen >= 65536) {
      this.reply(msg, 1, '');
      // NOTE: reply() already calls replyMsg() for native doors
      this.emulator.resume();  // CRITICAL: Resume after early return
      return;
    }

    // FIX: If door sends JH_LI with data=0 (maxLen=0), it's a confirm-only prompt.
    // In express.e lineInput, maxLen=0 means user can only press Enter (can't add chars).
    // Reference: express.e:2335 - (ch>31) AND (EstrLen(outputString)<maxLen) - no chars can be added when maxLen=0
    if (msg.data === 0) {
      // When data=0 and string is empty, door just wants to sync/continue - auto-respond
      if (defaultText.length === 0) {
        this.reply(msg, 1, '');
        // NOTE: reply() already calls replyMsg() for native doors
        this.emulator.resume();
        return;
      }
      // When data=0 and string has content, handle as confirm prompt or file path
      // Check if string is a temp file path (RAM: or T:) that doors use for output display
      // Doors like zOOsTAT write to temp files then send the path via JH_LI expecting display
      const upperText = defaultText.toUpperCase();
      if (upperText.startsWith('RAM:') || upperText.startsWith('T:')) {
        const resolved = resolveAssignPath(defaultText);
        if (amigafs.existsSync(resolved)) {
          try {
            let content = amigafs.readFileSync(resolved, 'utf-8') as string;
            // Strip form feed (0x0C) which can cause display issues
            content = content.replace(/\x0c/g, '');
            // Normalize line endings: Amiga uses \n, terminal needs \r\n
            content = content.replace(/\r?\n/g, '\r\n');
            this.directEmit('ansi-output', content);
          } catch {
            // Silent fail - don't output file path
          }
        }
        // Don't output file path as fallback - it's not meant to be displayed
      } else {
        // Per express.e:2202-2203: StrCopy(outputString,defaultOutput) then aePuts(outputString)
        // The BBS always outputs the default text, even with maxLen=0
        // If door sends garbage (e.g., uninitialized buffer), express.e would display it too
        this.directEmit('ansi-output', defaultText);
      }
      // CRITICAL FIX: For confirm-only prompts (data=0), door expects empty confirmation response
      // NOT the file path echoed back. Door writes file → sends path via JH_LI → expects empty/Enter.
      // Echoing the path back causes door to loop (e.g., zOOsTAT repeatedly sends JH_LI).
      const confirmResponse = '';
      this.messageParser.writeMessageString(msg.msgAddr, confirmResponse);
      if (msg.stringPtr) {
        this.messageParser.writeString(msg.stringPtr, confirmResponse, DoorConstants.MESSAGE_STRING_CAPACITY);
      }
      this.reply(msg, 1);
      // NOTE: reply() already calls replyMsg() for native doors
      this.emulator.resume();  // CRITICAL: Resume after early return (zOOsTAT fix)
      return;
    }

    // For normal line input, display the default text as a prompt
    // But skip if it looks like a file path (RAM:, T:) - those aren't prompts
    // Check the FULL string, not sliced version (maxLen=1 would slice "RAM:..." to "R")
    if (defaultText.length > 0) {
      const upperFull = fullString.toUpperCase();
      if (upperFull.startsWith('RAM:') || upperFull.startsWith('T:')) {
        // File path detected - show a "press Enter" prompt instead
        this.directEmit('ansi-output', '(Press Enter to continue)');
      } else {
        this.directEmit('ansi-output', defaultText);
      }
    }

    this.waitingForLineInput = true;
    this.lineInputMessage = msg;
    this.lineInputBuffer = '';  // Don't pre-fill with file path
    this.lineInputMaxLen = maxLen;

    // CRITICAL FIX 2026-01-15: Drain any queued input into the line buffer.
    // Due to async socket events, user input can arrive BEFORE we set waitingForLineInput.
    // Such input ends up in inputQueue instead of being captured for line input.
    // This caused 5D-Edit and other doors to ignore typed characters.
    while (this.inputQueue.length > 0 && this.lineInputBuffer.length < maxLen) {
      const token = this.inputQueue.shift()!;
      if (token === '\r' || token === '\n') {
        // Enter key - complete line input immediately
        this.completeLineInput();
        return;
      }
      if (token === '\b' || token === '\x7f') {
        // Backspace
        if (this.lineInputBuffer.length > 0) {
          this.lineInputBuffer = this.lineInputBuffer.slice(0, -1);
          this.directEmit('ansi-output', '\b \b');
        }
        continue;
      }
      // Add to buffer and echo
      this.lineInputBuffer += token;
      if (token.length === 1 && token >= ' ' && token <= '~') {
        this.directEmit('ansi-output', token);
      }
    }

    // CRITICAL FIX 2026-01-15: Pause emulator while waiting for line input!
    // Without this, the door continues executing and may send JH_HK requests,
    // which then take precedence in queueInput() causing characters to be
    // treated as hotkey responses instead of accumulating in line buffer.
    // This caused Dre!Wall and other doors to "submit after 1-2 characters".
    this.emulator.pause();
  }

  /**
   * Complete line input and send reply to door
   */
  private completeLineInput(): void {
    if (!this.lineInputMessage) {
debugLog('[XIMIOHandler] ERROR: completeLineInput called but no pending message!');
      return;
    }

    const msg = this.lineInputMessage;
    const result = this.lineInputBuffer.slice(0, this.lineInputMaxLen);

debugLog(
      `[XIMIOHandler] Completing line input with: "${result}"`
    );

    // DEBUG: Log message details before writing
    debugLog(`[DEBUG JH_LI] msgAddr=0x${msg.msgAddr.toString(16)} stringPtr=${msg.stringPtr ? '0x' + msg.stringPtr.toString(16) : 'NULL'}`);
    debugLog(`[DEBUG JH_LI] Writing result: "${result}" (${result.length} chars)`);
    debugLog(`[DEBUG JH_LI] MESSAGE_STRING_OFFSET=0x${DoorConstants.MESSAGE_STRING_OFFSET.toString(16)} (${DoorConstants.MESSAGE_STRING_OFFSET} decimal)`);

    // Write into embedded buffer
    this.messageParser.writeMessageString(msg.msgAddr, result);

    // DEBUG: Verify write to embedded buffer
    const stringAddr = msg.msgAddr + DoorConstants.MESSAGE_STRING_OFFSET;
    const verifyBuf = [];
    for (let i = 0; i < Math.min(result.length + 1, 40); i++) {
      verifyBuf.push(this.emulator.readMemory(stringAddr + i));
    }
    debugLog(`[DEBUG JH_LI] Embedded buffer at 0x${stringAddr.toString(16)}: ${verifyBuf.map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
    debugLog(`[DEBUG JH_LI] As ASCII: "${verifyBuf.filter(b => b >= 32 && b < 127).map(b => String.fromCharCode(b)).join('')}"`);

    // If a string pointer was provided by the door, mirror there too
    if (msg.stringPtr) {
      this.messageParser.writeString(
        msg.stringPtr,
        result,
        DoorConstants.MESSAGE_STRING_CAPACITY
      );
      debugLog(`[DEBUG JH_LI] Also wrote to stringPtr at 0x${msg.stringPtr.toString(16)}`);
    }

    // JH_LI/JH_PM reply: Data = 1 on success, -1 on timeout/carrier; String carries the input
    const dataVal = this.state.carrierDropped ? -1 : 1;
    this.reply(msg, dataVal);
    // NOTE: reply() already calls replyMsg() for native doors

    // Reset state
    this.waitingForLineInput = false;
    this.lineInputMessage = null;
    this.lineInputBuffer = '';
    this.lineInputMaxLen = DoorConstants.MESSAGE_STRING_CAPACITY;

debugLog('[XIMIOHandler] Line input completed, reply sent, resuming emulator');
    this.emulator.resume();
  }

  /**
   * Handle door write request (JH_WRITE)
   * From E sources (express.e:3382-3385)
   */
  handleWrite(msg: XIMMessage): void {
    const text = this.getMessageString(msg);
    // NOTE: msg.data is NOT a newline flag - express.e just calls aePuts(msg.string)
    // with no newline logic. aePuts outputs text as-is without adding newlines.

debugLog(
      '[XIMIOHandler] Door writing to terminal (JH_WRITE):',
      JSON.stringify(text)
    );

    // express.e:3382-3385 - JH_WRITE checks transfering and doorSilent flags
    // CASE JH_WRITE
    //   IF (transfering=FALSE) AND (doorSilent=FALSE)
    //     aePuts(msg.string)
    //   ENDIF
    let bytesWritten = 0;
    if (!this.state.transfering && !this.state.doorSilent) {
      // aePuts does NOT add newlines - output text as-is
      bytesWritten = this.emitText(text, false, false, false, msg);
    }

    this.reply(msg, bytesWritten);
    // NOTE: reply() already calls replyMsg() for native doors
  }

  /**
   * Handle keyboard input request (GETKEY)
   * From E sources (express.e:3811-3813):
   *   CASE GETKEY
   *     IF checkInput() THEN msg.string[0]:="1" ELSE msg.string[0]:="0"
   *     msg.string[1]:=0
   *
   * IMPORTANT: GETKEY only checks if input is available - does NOT consume.
   * The actual character is consumed by JH_FetchKey (cmd 17).
   */
  handleGetKey(msg: XIMMessage): void {
    // Check if we have queued input - do NOT consume (just peek)
    if (this.inputQueue.length > 0) {
      // Write "1\0" to string buffer - input is available
      this.messageParser.writeMessageString(msg.msgAddr, '1');
      this.reply(msg, 1);
    } else {
      // Write "0\0" to string buffer - no input available
      this.messageParser.writeMessageString(msg.msgAddr, '0');
      this.reply(msg, 0);
    }
  }

  /**
   * Handle JH_SM (Send Message)
   * From E sources (express.e:3406-3411)
   */
  handleSendMessage(msg: XIMMessage): void {
    const text = this.getMessageString(msg);
    const shouldAddNewline = msg.data !== 0;
    const trimmed = text.trim();

    // AmiExpress doors sometimes send "bbs:" paths via JH_SM for file display.
    if (trimmed.toLowerCase().startsWith('bbs:')) {
      const patched: XIMMessage = { ...msg, string: trimmed };
      this.handleShowFile(patched);
      return;
    }

    // DEBUG: Log raw bytes from message string buffer
    const rawBytes: number[] = [];
    const stringAddr = msg.msgAddr + DoorConstants.MESSAGE_STRING_OFFSET;
    for (let i = 0; i < 80; i++) {
      const byte = this.emulator.readMemory(stringAddr + i);
      if (byte === 0) break;
      rawBytes.push(byte);
    }
    const rawStr = rawBytes.map(b => b >= 32 && b < 127 ? String.fromCharCode(b) : `.`).join('');
debugLog(`[XIMIOHandler] JH_SM DEBUG: msgAddr=0x${msg.msgAddr.toString(16)} stringAddr=0x${stringAddr.toString(16)}`);
debugLog(`[XIMIOHandler] JH_SM DEBUG: rawBytes[0..${rawBytes.length}] = "${rawStr}"`);
debugLog(`[XIMIOHandler] JH_SM DEBUG: msg.string="${msg.string}" msg.stringPtr=0x${(msg.stringPtr || 0).toString(16)}`);
debugLog(`[XIMIOHandler] JH_SM: "${text.substring(0, 40)}${text.length > 40 ? '...' : ''}" (msg.data=${msg.data}, len=${text.length})`);

    // express.e:3406-3411: IF msg.data THEN aePuts('\b\n'); checkForPause()
    this.emitText(text, shouldAddNewline, true, this.state.autoPauseEnabled, msg);

    this.reply(msg, 1);
  }

  /**
   * Handle JH_SMPTR (Send Message via Pointer)
   * From E sources (express.e:3412-3417)
   */
  handleSendMessagePtr(msg: XIMMessage): void {
    // Read text from strptr (filler1 field contains the string pointer)
    let text = '';
    if (msg.stringPtr && msg.stringPtr > 0) {
      text = this.messageParser.readString(msg.stringPtr, 255);
    } else if (msg.filler1 && msg.filler1 > 0) {
      text = this.messageParser.readString(msg.filler1, 255);
    } else {
      // Fall back to embedded string
      text = this.getMessageString(msg);
    }

    const shouldAddNewline = msg.data !== 0;

debugLog(`[XIMIOHandler] JH_SMPTR: "${text.substring(0, 40)}${text.length > 40 ? '...' : ''}" (msg.data=${msg.data})`);

    // express.e:3412-3417: IF msg.data THEN aePuts('\b\n'); checkForPause()
    this.emitText(text, shouldAddNewline, true, this.state.autoPauseEnabled, msg);

    this.reply(msg, 1);
  }

  /**
   * Handle JH_PM (Prompt Message)
   * From E sources (express.e:3418-3424)
   *
   * IMPORTANT: Pause emulator to wait for user input.
   */
  handlePromptMessage(msg: XIMMessage): void {
    // Mark that this door uses XIM input commands - prevents native input injection
    debugLog(`[XIMIOHandler] JH_PM (Prompt Message) received - setting usedXimInput=true`);
    this.state.usedXimInput = true;

    const prompt = this.getMessageString(msg);
    const maxLength = Math.min(
      msg.data && msg.data > 0 ? msg.data : DoorConstants.MESSAGE_STRING_CAPACITY,
      DoorConstants.MESSAGE_STRING_CAPACITY
    );

    if (this.state.carrierDropped) {
      this.reply(msg, -1, '');
      // NOTE: reply() already calls replyMsg() for native doors
      this.emulator.resume();  // CRITICAL: Resume after early return
      return;
    }

debugLog('[XIMIOHandler] JH_PM: Prompt message with line input');
    if (prompt.length > 0) {
debugLog(`[XIMIOHandler] JH_PM: Prompt: "${prompt}"`);
      this.emitText(prompt, false, false, false, msg);
    }

debugLog(
      `[XIMIOHandler] JH_PM: Waiting for user input (max ${maxLength} chars), pausing emulator`
    );
    this.waitingForLineInput = true;
    this.lineInputMessage = msg;
    this.lineInputBuffer = '';
    this.lineInputMaxLen = maxLength;
    this.emulator.pause();
  }

  /**
   * Convert an escape sequence to arrow key code.
   * Per express.e lines 7514-7528, arrow keys are ALWAYS converted to internal codes:
   *   ESC[A -> UPARROW (4)
   *   ESC[B -> DOWNARROW (5)
   *   ESC[C -> RIGHTARROW (3)
   *   ESC[D -> LEFTARROW (2)
   *
   * The rawArrow flag only affects whether BBS line editor consumes them (wasControl),
   * but for JH_HK (door hotkey), we always pass the codes to the door.
   *
   * @returns Single character code to return to door
   */
  private processHotkeyToken(token: string): string {
    // Single character - convert web terminal codes to Amiga codes
    if (token.length === 1) {
      const code = token.charCodeAt(0);

      // DEL (0x7F) -> BS (0x08): Web terminals send DEL for backspace, Amiga expects BS
      if (code === 0x7f) {
        debugLog(`[XIMIOHandler] Converting DEL (0x7f) to BS (0x08) for Amiga`);
        return '\x08';
      }

      // NOTE: Do NOT convert CR to LF for hotkeys!
      // express.e expects CR (0x0d) for Enter - see doPause() at line 5147:
      //   UNTIL (ch=13) OR (ch=32) OR (ch<0)
      // Converting CR to LF breaks Enter key in doors like AquaScan and Bulls.

      return token;
    }

    // Check for arrow key escape sequences - ALWAYS convert to codes
    // This matches express.e behavior where ch:=UPARROW etc regardless of rawArrow
    const arrowMap: { [key: string]: number } = {
      '\x1b[A': ArrowKeyCodes.UPARROW,    // 4
      '\x1b[B': ArrowKeyCodes.DOWNARROW,  // 5
      '\x1b[C': ArrowKeyCodes.RIGHTARROW, // 3
      '\x1b[D': ArrowKeyCodes.LEFTARROW,  // 2
    };

    if (arrowMap[token] !== undefined) {
      const arrowCode = arrowMap[token];
debugLog(`[XIMIOHandler] Arrow key: ${JSON.stringify(token)} -> code ${arrowCode}`);
      return String.fromCharCode(arrowCode);
    }

    // Ignore unrecognized escape sequences (Home, End, Insert, Delete, Page Up/Down, etc.)
    // These would confuse 68K doors if we passed ESC or partial sequences
    // Terminal sequences we ignore:
    //   \x1b[H, \x1b[1~ (Home), \x1b[F, \x1b[4~ (End)
    //   \x1b[2~ (Insert), \x1b[3~ (Delete)
    //   \x1b[5~ (Page Up), \x1b[6~ (Page Down)
    //   \x1bOP-\x1bOS, \x1b[15~-\x1b[24~ (Function keys - handled by BBS, not doors)
    if (token.length > 1 && token.startsWith('\x1b')) {
debugLog(`[XIMIOHandler] Ignoring unrecognized escape sequence: ${JSON.stringify(token)}`);
      return '';  // Return empty to skip this input
    }

    // For other multi-char tokens (shouldn't happen), return first char
    if (token.length > 1) {
debugLog(`[XIMIOHandler] Multi-char token, returning first: ${token.charCodeAt(0)}`);
    }
    return token[0];
  }

  /**
   * Handle JH_HK (Hotkey)
   * From E sources (express.e:3436-3447)
   *
   * IMPORTANT: When no input is available, we must PAUSE the emulator
   * to prevent the door from busy-looping on GetMsg. The emulator will
   * resume when input arrives via queueInput() -> completeHotkey().
   *
   * The door receives a SINGLE character code in msg.string[0]:
   * - rawArrow=FALSE: Arrow keys converted to codes (2=LEFT, 3=RIGHT, 4=UP, 5=DOWN)
   * - rawArrow=TRUE: Raw bytes (27 for ESC, then '[', then 'A'/'B'/'C'/'D' on subsequent calls)
   */
  handleHotkey(msg: XIMMessage): void {
    const prompt = this.getMessageString(msg);

debugLog('[XIMIOHandler] JH_HK: Hotkey input request');
    this.state.lineCount = 0;

    // Mark that this door uses XIM input commands - prevents native input injection
    debugLog(`[XIMIOHandler] JH_HK (Hotkey) received - setting usedXimInput=true`);
    this.state.usedXimInput = true;

    // DEBUG: Comprehensive message address tracing
    debugLog(`[DEBUG JH_HK] ===== MESSAGE ADDRESS TRACE =====`);
    debugLog(`[DEBUG JH_HK] msg.msgAddr = 0x${msg.msgAddr.toString(16)}`);
    debugLog(`[DEBUG JH_HK] msg.stringPtr = ${msg.stringPtr ? '0x' + msg.stringPtr.toString(16) : 'NULL'}`);
    debugLog(`[DEBUG JH_HK] Expected string offset 0x14 = 0x${(msg.msgAddr + 0x14).toString(16)}`);

    // Dump current A4 register (door's data base)
    const a4 = this.emulator.getRegister(12);  // A4 = register 12
    debugLog(`[DEBUG JH_HK] A4 (door data base) = 0x${a4.toString(16)}`);

    // Read what door stored at 0x714(a4) - should be the message address
    if (a4 > 0x1000) {
      const doorMsgAddr = this.emulator.readMemory32(a4 + 0x714);
      debugLog(`[DEBUG JH_HK] Door's msg at 0x714(A4) = 0x${doorMsgAddr.toString(16)}`);
      if (doorMsgAddr !== msg.msgAddr) {
        console.error(`[DEBUG JH_HK] *** MISMATCH! Door's msg addr != our msg addr! ***`);
      }
    }

    if (this.state.carrierDropped) {
      this.reply(msg, -1, '');
      // NOTE: reply() already calls replyMsg() for native doors
      this.emulator.resume();  // CRITICAL: Resume after early return
      return;
    }

    // Express.e (line 3438): aePuts(msg.string) - display prompt before reading input
    if (prompt.length > 0) {
debugLog(`[XIMIOHandler] JH_HK: Displaying prompt: "${prompt}"`);
      this.emitText(prompt, false, false, false, msg);
    }

    if (this.inputQueue.length > 0) {
      const token = this.inputQueue.shift()!;
      const keyData = this.processHotkeyToken(token);

      // Skip ignored escape sequences (Home, End, Page Up/Down, etc.)
      if (keyData === '') {
debugLog(`[XIMIOHandler] JH_HK: Skipping ignored key sequence, waiting for next input`);
        // Don't reply yet - wait for more input
        return;
      }

      // TEST 2026-01-23: Try CR instead of LF - maybe door expects CR?
      // Amiga uses LF for Enter/newline, not CR. Web terminals send CR when Enter is pressed.
      // But some doors might expect CR - testing this hypothesis.
      let keyCode = keyData.charCodeAt(0);
      if (keyCode === 13) {
        debugLog(`[DEBUG JH_HK handleHotkey] Sending CR (0x0D) as-is - testing if door expects CR`);
        // keyCode = 10;  // DISABLED: Don't convert CR to LF
      }

      // CRITICAL FIX 2026-01-20: Character goes to msg.string[0], NOT msg.command!
      // express.e:3445: msg.string[0]:=ch
      // express.e:3447: msg.command:=ximPort
      // Doors read character from msg.string[0], with msg.command = XIM port (1 or 2)

      // Write character to msg.string[0] (and null-terminate at msg.string[1])
      const stringAddr = msg.msgAddr + 0x14;  // MESSAGE_STRING_OFFSET
      this.emulator.writeMemory(stringAddr, keyCode);
      this.emulator.writeMemory(stringAddr + 1, 0);  // Null terminator

      // FIX 2026-01-30: Also update strPtr to point to embedded buffer
      // Some doors (like dRE!WAll) may read characters via strPtr for storage
      const strPtrUpdated = this.messageParser.writeStringPointer(msg.msgAddr, stringAddr);
debugLog(`[DEBUG JH_HK handleHotkey] Updated strPtr to 0x${stringAddr.toString(16)}: ${strPtrUpdated ? 'OK' : 'FAILED (msg too small)'}`);

      // DEBUG: Check if door has stringPtr (separate buffer from embedded msg.string)
      const stringPtr = msg.stringPtr || 0;
debugLog(`[DEBUG JH_HK handleHotkey] Original msg.stringPtr=${stringPtr ? '0x' + stringPtr.toString(16) : 'NULL'} embedded=0x${stringAddr.toString(16)}`);

      // If door has stringPtr, write character there too
      if (stringPtr && stringPtr !== stringAddr) {
        this.emulator.writeMemory(stringPtr, keyCode);
        this.emulator.writeMemory(stringPtr + 1, 0);
debugLog(`[DEBUG JH_HK handleHotkey] ALSO wrote to original stringPtr at 0x${stringPtr.toString(16)}`);
      }

      // Write XIM port to msg.command (express.e line 3447)
      const ximPort = this.getXimPort();
      this.messageParser.writeCommand(msg.msgAddr, ximPort);

      const keyName = keyCode === 10 ? 'ENTER(LF)' : keyCode === 13 ? 'CR' : keyCode === 4 ? 'UP' : keyCode === 5 ? 'DOWN' : keyCode === 2 ? 'LEFT' : keyCode === 3 ? 'RIGHT' : `char '${keyData}'`;
debugLog(`[XIMIOHandler] JH_HK: Got key code ${keyCode} (0x${keyCode.toString(16)}) = ${keyName}`);
debugLog(`[XIMIOHandler] JH_HK: Wrote keyCode=${keyCode} (${keyName}) to msg.string[0] at 0x${stringAddr.toString(16)}`);
debugLog(`[XIMIOHandler] JH_HK: Wrote ximPort=${ximPort} to msg.command`);

      // CRITICAL FIX 2026-01-20: DON'T pass empty string to reply() - it overwrites msg.string!
      // Door needs to read the character from msg.string[0], so we must preserve it.
      // Passing undefined for stringValue skips writeMessageString() call.
debugLog(`[DEBUG JH_HK] BEFORE reply(): msg.string[0]=0x${this.emulator.readMemory(stringAddr).toString(16)} keyCode=${keyCode}`);
      this.reply(msg, 1);
debugLog(`[DEBUG JH_HK] AFTER reply(): msg.string[0]=0x${this.emulator.readMemory(stringAddr).toString(16)}`);

      // DEBUG: Also dump entire msg.string buffer (32 bytes) - SHOW HEX!
      const msgStrBuf = [];
      for (let i = 0; i < 32; i++) {
        msgStrBuf.push(this.emulator.readMemory(stringAddr + i));
      }
      const msgStrHex = msgStrBuf.map(b => b.toString(16).padStart(2, '0')).join(' ');
      const msgStrAscii = msgStrBuf.map(b => (b >= 32 && b < 127) ? String.fromCharCode(b) : '.').join('');
debugLog(`[DEBUG JH_HK] msg.string[0-31] HEX: ${msgStrHex}`);
debugLog(`[DEBUG JH_HK] msg.string[0-31] ASCII: "${msgStrAscii}"`);

      // NOTE: reply() already calls replyMsg() for native doors, so we don't need to call it again here.
      // Double-calling replyMsg corrupts door state and prevents input from being saved.
      this.emulator.resume();  // CRITICAL: Resume when input was queued (pre-paused by callback)
      return;
    }

    // No input available - pause emulator and wait for user input
    // express.e:3438-3448 shows readChar(doorTimeout) which BLOCKS until input
    // CRITICAL: express.e uses a timeout (doorTimeout), we must too!
debugLog('[XIMIOHandler] JH_HK: No input available, pausing emulator to wait');
    this.waitingForHotkey = true;
    this.hotkeyMessage = msg;

    // Get doorTimeout from state (in seconds), default 30 seconds for screen commands, 300 for interactive
    // express.e line 125: doorTimeout=INPUT_TIMEOUT (default ~300 seconds)
    // For doors run via ~CC_ during screen display, use shorter timeout
    const isScreenCommand = this.bbsSession?.executingScreenCommand || false;
    const defaultTimeout = isScreenCommand ? 30 : 300; // 30s for screen commands, 5min for interactive
    const doorTimeout = (this.state as any).doorTimeout || defaultTimeout;
debugLog(`[XIMIOHandler] JH_HK: Setting timeout ${doorTimeout}s (isScreenCommand=${isScreenCommand})`);

    // Set up timeout - when it expires, return msg.data=-1 (timeout/carrier drop)
    // express.e:3440-3441: IF (ch<0) THEN msg.data:=-1
    //
    // Guard every emulator access: if the door exits (clean or crash) while
    // this timer is armed, the emulator has been deinitialized by the time
    // the timer fires. `writeMemory` / `resume` throw in that state. Drop
    // the timer silently when we detect it.
    this.hotkeyTimeoutId = setTimeout(() => {
      if (!this.waitingForHotkey || !this.hotkeyMessage) {
        return;
      }
      if (!this.emulator.isInitialized?.()) {
        // Door already gone — silently clear waiting state and bail.
        this.waitingForHotkey = false;
        this.hotkeyMessage = null;
        this.hotkeyTimeoutId = null;
        return;
      }
debugLog(`[XIMIOHandler] JH_HK: Timeout expired after ${doorTimeout}s, returning -1`);
      const timeoutMsg = this.hotkeyMessage;
      this.waitingForHotkey = false;
      this.hotkeyMessage = null;
      this.hotkeyTimeoutId = null;

      try {
        // Write empty string to msg.string (ch=-1 means no character)
        const stringAddr = timeoutMsg.msgAddr + 0x14;  // MESSAGE_STRING_OFFSET
        this.emulator.writeMemory(stringAddr, 0);  // Null byte = no character

        // Reply with data=-1 to indicate timeout
        this.reply(timeoutMsg, -1);
        this.emulator.resume();
      } catch (err) {
        // Emulator teardown raced this callback — nothing actionable.
debugLog(`[XIMIOHandler] JH_HK: Timeout callback skipped (emulator gone): ${(err as Error).message}`);
      }
    }, doorTimeout * 1000);

    this.emulator.pause();
  }

  /**
   * Complete a pending hotkey prompt
   * Called when input arrives while waitingForHotkey is true.
   * Sends the reply and resumes the emulator.
   */
  private completeHotkey(char: string): void {
    if (!this.hotkeyMessage) {
      return;
    }

    // Clear the timeout since we got input
    if (this.hotkeyTimeoutId) {
      clearTimeout(this.hotkeyTimeoutId);
      this.hotkeyTimeoutId = null;
    }

    const msg = this.hotkeyMessage;
    const keyData = this.processHotkeyToken(char);

    // Skip ignored escape sequences (Home, End, Page Up/Down, etc.)
    if (keyData === '') {
debugLog(`[XIMIOHandler] JH_HK completeHotkey: Skipping ignored key sequence, waiting for more input`);
      // Don't complete the hotkey - keep waiting for valid input
      return;
    }

    // TEST 2026-01-23: Try CR instead of LF - maybe door expects CR?
    // Amiga uses LF for Enter/newline, not CR. Web terminals send CR when Enter is pressed.
    // But some doors might expect CR - testing this hypothesis.
    let keyCode = keyData.charCodeAt(0);
    if (keyCode === 13) {
      debugLog(`[DEBUG JH_HK completeHotkey] Sending CR (0x0D) as-is - testing if door expects CR`);
      // keyCode = 10;  // DISABLED: Don't convert CR to LF
    }
    const keyName = keyCode === 10 ? 'ENTER(LF)' : keyCode === 13 ? 'CR' : keyCode === 4 ? 'UP' : keyCode === 5 ? 'DOWN' : keyCode === 2 ? 'LEFT' : keyCode === 3 ? 'RIGHT' : `char '${keyData}'`;

debugLog('========================================');
debugLog(`[XIMIOHandler] JH_HK COMPLETE:`);
debugLog(`  Input char: ${JSON.stringify(char)} (charCode=${char.charCodeAt(0)})`);
debugLog(`  Processed keyData: ${JSON.stringify(keyData)} (charCode=${keyCode})`);
debugLog(`  Key name: ${keyName}`);
debugLog(`  Data reply: ${this.state.carrierDropped ? -1 : 1}`);
debugLog('========================================');

    // DEBUG: Comprehensive message address tracing for completeHotkey
    debugLog(`[DEBUG JH_HK completeHotkey] ===== MESSAGE ADDRESS TRACE =====`);
    debugLog(`[DEBUG JH_HK completeHotkey] msg.msgAddr = 0x${msg.msgAddr.toString(16)}`);
    debugLog(`[DEBUG JH_HK completeHotkey] msg.stringPtr = ${msg.stringPtr ? '0x' + msg.stringPtr.toString(16) : 'NULL'}`);
    debugLog(`[DEBUG JH_HK completeHotkey] Expected string offset 0x14 = 0x${(msg.msgAddr + 0x14).toString(16)}`);

    // Dump current registers for debugging
    const a4 = this.emulator.getRegister(12);  // A4 = register 12
    const a5 = this.emulator.getRegister(13);  // A5 = register 13 (buffer in input func)
    const sp = this.emulator.getRegister(15);  // A7/SP = register 15
    const d4 = this.emulator.getRegister(4);   // D4 = buffer index in input func
    const d5 = this.emulator.getRegister(5);   // D5 = character in input func
    debugLog(`[DEBUG JH_HK completeHotkey] A4 (door data base) = 0x${a4.toString(16)}`);
    debugLog(`[DEBUG JH_HK completeHotkey] A5 = 0x${a5.toString(16)}, D4 = ${d4}, D5 = 0x${d5.toString(16)}`);
    debugLog(`[DEBUG JH_HK completeHotkey] SP (A7) = 0x${sp.toString(16)}`);

    // Read what door stored at 0x714(a4) - should be the message address
    if (a4 > 0x1000) {
      const doorMsgAddr = this.emulator.readMemory32(a4 + 0x714);
      debugLog(`[DEBUG JH_HK completeHotkey] Door's msg at 0x714(A4) = 0x${doorMsgAddr.toString(16)}`);
      if (doorMsgAddr !== msg.msgAddr) {
        console.error(`[DEBUG JH_HK completeHotkey] *** MISMATCH! Door's msg addr (0x${doorMsgAddr.toString(16)}) != our msg addr (0x${msg.msgAddr.toString(16)})! ***`);
      } else {
        debugLog(`[DEBUG JH_HK completeHotkey] Message addresses MATCH - writing char '${keyData}' (0x${keyCode.toString(16)}) to 0x${(msg.msgAddr + 0x14).toString(16)}`);
      }
    }

    // CRITICAL FIX 2026-01-20: Character goes to msg.string[0], NOT msg.command!
    // express.e:3445: msg.string[0]:=ch
    // express.e:3447: msg.command:=ximPort
    // This matches the handleHotkey() code path above.
    const stringAddr = msg.msgAddr + 0x14;  // MESSAGE_STRING_OFFSET
    this.emulator.writeMemory(stringAddr, keyCode);
    this.emulator.writeMemory(stringAddr + 1, 0);  // Null terminator

    // FIX 2026-01-30: Also update strPtr to point to embedded buffer
    // Some doors (like dRE!WAll) may read characters via strPtr for storage
    // while reading from embedded buffer for echo. Without this, strPtr stays NULL.
    const strPtrUpdated = this.messageParser.writeStringPointer(msg.msgAddr, stringAddr);
debugLog(`[DEBUG JH_HK completeHotkey] Updated strPtr to 0x${stringAddr.toString(16)}: ${strPtrUpdated ? 'OK' : 'FAILED (msg too small)'}`);

    // DEBUG: Check if door has stringPtr (separate buffer from embedded msg.string)
    const stringPtr = msg.stringPtr || 0;
debugLog(`[DEBUG JH_HK completeHotkey] Original msg.stringPtr=${stringPtr ? '0x' + stringPtr.toString(16) : 'NULL'} embedded=0x${stringAddr.toString(16)}`);

    // If door has stringPtr, write character there too
    if (stringPtr && stringPtr !== stringAddr) {
      this.emulator.writeMemory(stringPtr, keyCode);
      this.emulator.writeMemory(stringPtr + 1, 0);
debugLog(`[DEBUG JH_HK completeHotkey] ALSO wrote to original stringPtr at 0x${stringPtr.toString(16)}`);
    }

    // Write XIM port to msg.command (express.e line 3447)
    const ximPort = this.getXimPort();
    this.messageParser.writeCommand(msg.msgAddr, ximPort);

    this.reply(msg, this.state.carrierDropped ? -1 : 1);

    // DEBUG: Verify character is still there after reply
    const verifyChar = this.emulator.readMemory(stringAddr);
    debugLog(`[DEBUG JH_HK completeHotkey] AFTER reply: msg.string[0] = 0x${verifyChar.toString(16)} (expected 0x${keyCode.toString(16)})`);
    if (verifyChar !== keyCode) {
      console.error(`[DEBUG JH_HK completeHotkey] *** CORRUPTION! Character was overwritten during reply! ***`);
    }

    // DEBUG: Dump msg.string area after reply
    const strBuf = [];
    for (let i = 0; i < 16; i++) {
      strBuf.push(this.emulator.readMemory(stringAddr + i));
    }
    const strHex = strBuf.map(b => b.toString(16).padStart(2, '0')).join(' ');
    const strAscii = strBuf.map(b => (b >= 32 && b < 127) ? String.fromCharCode(b) : '.').join('');
    debugLog(`[DEBUG JH_HK completeHotkey] msg.string[0-15] HEX: ${strHex}`);
    debugLog(`[DEBUG JH_HK completeHotkey] msg.string[0-15] ASCII: "${strAscii}"`);

    // NOTE: reply() already calls replyMsg() for native doors, so we don't need to call it again here.
    // Double-calling replyMsg corrupts door state and prevents input from being saved.

    this.waitingForHotkey = false;
    this.hotkeyMessage = null;

    // Resume emulator execution now that we have input
    debugLog(`[DEBUG JH_HK completeHotkey] About to resume emulator, char=${keyData} (0x${keyCode.toString(16)}) at msg.string[0]=0x${stringAddr.toString(16)}`);
    this.emulator.resume();
  }

  /**
   * Complete a pending extended hotkey prompt
   * Called when input arrives while waitingForExtHotkey is true.
   * Sends the reply and resumes the emulator.
   *
   * CRITICAL: Returns character code in msg.command field, NOT msg.data!
   */
  private completeExtHotkey(char: string): void {
    if (!this.extHotkeyMessage) {
      return;
    }

    const msg = this.extHotkeyMessage;
    const charCode = char.charCodeAt(0);

debugLog('========================================');
debugLog(`[XIMIOHandler] JH_ExtHK COMPLETE:`);
debugLog(`  Input char: ${JSON.stringify(char)} (charCode=${charCode})`);
debugLog(`  Data reply: ${this.state.carrierDropped ? -1 : 1}`);
debugLog('========================================');

    // CRITICAL: Character code goes in msg.command field, NOT msg.data!
    this.messageParser.writeCommand(msg.msgAddr, charCode);
    this.reply(msg, this.state.carrierDropped ? -1 : 1);
    // NOTE: reply() already calls replyMsg() for native doors

    this.waitingForExtHotkey = false;
    this.extHotkeyMessage = null;

    // Resume emulator execution now that we have input
debugLog('[XIMIOHandler] JH_ExtHK: Reply sent, resuming emulator');
    this.emulator.resume();
  }

  /**
   * Handle extended hotkey (JH_ExtHK)
   * From E sources (express.e:3432-3435)
   *
   * CRITICAL: This command BLOCKS until input or timeout, like JH_HK!
   * express.e: msg.command:=readChar(doorTimeout,Shl(1,msg.signal))
   *
   * Returns character code in msg.command field (NOT msg.data!)
   * Returns data=1 on success, data=-1 on timeout
   */
  handleExtendedHotkey(msg: XIMMessage): void {
debugLog('[XIMIOHandler] JH_ExtHK - Extended hotkey with signal (BLOCKS)');
    this.state.lineCount = 0;

    // Mark that this door uses XIM input commands - prevents native input injection
    debugLog(`[XIMIOHandler] JH_ExtHK (Extended Hotkey) received - setting usedXimInput=true`);
    this.state.usedXimInput = true;

    if (this.state.carrierDropped) {
      this.messageParser.writeCommand(msg.msgAddr, -1);
      this.reply(msg, -1);
      // NOTE: reply() already calls replyMsg() for native doors
      this.emulator.resume();  // CRITICAL: Resume after early return
      return;
    }

    if (this.inputQueue.length > 0) {
      // Input available - return immediately
      const char = this.inputQueue.shift()!;
      const charCode = char.charCodeAt(0);
      this.messageParser.writeCommand(msg.msgAddr, charCode);
debugLog(`  [READ] Extended hotkey: '${char}' (code=${charCode})`);
      this.reply(msg, 1);
      // NOTE: reply() already calls replyMsg() for native doors
      this.emulator.resume();  // CRITICAL: Resume when input was queued (pre-paused by callback)
      return;
    }

    // No input - PAUSE emulator and wait (implements blocking!)
debugLog('  [WAITING] No input, pausing emulator');
    this.waitingForExtHotkey = true;
    this.extHotkeyMessage = msg;
    this.emulator.pause();
  }

  /**
   * Handle fetch key (JH_FetchKey)
   * From E sources (express.e:3465-3472)
   */
  handleFetchKey(msg: XIMMessage): void {
    if (this.state.carrierDropped) {
      this.messageParser.writeCommand(msg.msgAddr, 0);
      this.reply(msg, -1);
      return;
    }

    if (this.inputQueue.length > 0) {
      const char = this.inputQueue.shift()!;
      this.messageParser.writeCommand(msg.msgAddr, char.charCodeAt(0));
      this.reply(msg, 1, char);
      return;
    }

    this.messageParser.writeCommand(msg.msgAddr, 0);
    this.reply(msg, 1, '');
  }

  /**
   * Handle JH_CK / GETKEY (command 500) - check if input is available
   * From express.e:3811-3813:
   *   CASE GETKEY
   *     IF checkInput() THEN msg.string[0]:="1" ELSE msg.string[0]:="0"
   *     msg.string[1]:=0
   *
   * IMPORTANT: This only checks availability - does NOT consume input.
   * JH_FetchKey (cmd 17) is used to actually get the character.
   */
  handleCheckKey(msg: XIMMessage): void {
    const hasInput = this.inputQueue.length > 0;

    if (this.state.carrierDropped) {
      this.messageParser.writeMessageString(msg.msgAddr, '0');
      this.reply(msg, -1);
      return;
    }

    if (hasInput) {
      // Input available - write "1" to string, do NOT consume
      this.messageParser.writeMessageString(msg.msgAddr, '1');
      this.reply(msg, 1);
    } else {
      // No input - write "0" to string
      this.messageParser.writeMessageString(msg.msgAddr, '0');
      this.reply(msg, 0);
    }
  }

  /**
   * Handle quick key (JH_20, QUICK_KEY)
   * From E sources (express.e:3448-3455)
   */
  handleQuickKey(msg: XIMMessage): void {
debugLog('[XIMIOHandler] QUICK_KEY - Quick key input');

    if (this.state.carrierDropped) {
      this.messageParser.writeCommand(msg.msgAddr, this.getXimPort());
      this.reply(msg, -1);
      return;
    }

    const char = this.inputQueue.shift();
    const charCode = typeof char === 'string' ? char.charCodeAt(0) : -1;
    this.messageParser.writeCommand(msg.msgAddr, this.getXimPort());

    if (char) {
debugLog(`  [READ] Quick key: '${char}' (code ${charCode})`);
      this.reply(msg, charCode);
    } else {
debugLog('  [TIMEOUT] No input available');
      this.reply(msg, -1);
    }
  }

  /**
   * Handle JH_CO (Console Output)
   * From E sources (express.e:3395-3400)
   */
  handleConsoleOutput(msg: XIMMessage): void {
    const text = this.getMessageString(msg);

    // express.e:3395-3400: IF msg.data THEN conPuts('\b\n'); checkForPause()
    this.emitText(text, msg.data !== 0, true, true, msg);

    this.reply(msg, 1);
  }

  /**
   * Handle JH_SO (Serial Output)
   * From E sources (express.e:3401-3405)
   */
  handleSerialOutput(msg: XIMMessage): void {
    const text = this.getMessageString(msg);

debugLog(`[XIMIOHandler] JH_SO (Serial): "${text}"`);

    // express.e:3401-3405: IF msg.data THEN serPuts('\b\n') (No checkForPause!)
    this.emitText(text, msg.data !== 0, false, false, msg);

    this.reply(msg, 1);
  }

  /**
   * Handle JH_SG (Show GFile with ACS/language lookup)
   */
  async handleShowGFile(msg: XIMMessage): Promise<void> {
    const partName = this.getMessageString(msg).trim();
    const forceNonStop = msg.data === 1;

    if (!partName) {
      this.reply(msg, 0);
      return;
    }

    const resolvedBase = this.resolvePath(partName);
    const parsed = path.parse(resolvedBase);
    const baseWithoutExt = path.join(parsed.dir, parsed.name);
    const language = (this.state.language || '').trim();
    const secLevel = this.bbsSession?.user?.secLevel ?? 0;

    const candidates = this.buildGFileCandidates(
      baseWithoutExt,
      parsed.ext,
      language,
      secLevel
    );

    const target = this.findFirstExisting(candidates);
    if (!target) {
console.warn(`[XIMIOHandler] JH_SG: No gfile found for base ${partName}`);
      this.reply(msg, 0);
      return;
    }

    const displayed = await this.displayTextFile(target, forceNonStop, msg);
    if (!displayed) {
      this.reply(msg, 0);
      return;
    }

    if (!this.waitingForPause) {
      this.reply(msg, 1);
    }
  }

  /**
   * Handle JH_SF (Show File - full path)
   */
  async handleShowFile(msg: XIMMessage): Promise<void> {
    // Serialize file display requests to prevent output interleaving
    // Doors like dRE!WAll send multiple JH_SF requests in quick succession
    const doDisplay = async () => {
      const targetPath = this.getMessageString(msg).trim();
      const forceNonStop = msg.data === 1;

      if (!targetPath) {
        this.reply(msg, 0);
        return;
      }

      const resolved = this.resolvePath(targetPath);
      const parsed = path.parse(resolved);
      const candidates =
        parsed.ext && parsed.ext.length > 0
          ? [resolved]
          : [
              resolved, // Try exact path first (no extension)
              `${resolved}.txt`,
              `${resolved}.TXT`,
              `${resolved}.txt.gr`,
              `${resolved}.GR1`,
            ];

      const target = this.findFirstExisting(candidates);
      if (!target) {
console.warn(`[XIMIOHandler] JH_SF: File not found: ${targetPath}`);
        this.reply(msg, 0);
        return;
      }

      const displayed = await this.displayTextFile(target, forceNonStop, msg);
      if (!displayed) {
        this.reply(msg, 0);
        return;
      }

      if (!this.waitingForPause) {
        this.reply(msg, 1);
      }
    };

    // Chain onto the file display lock to ensure serialization
    this.fileDisplayLock = this.fileDisplayLock.then(doDisplay).catch(err => {
      console.error('[XIMIOHandler] JH_SF error:', err);
      this.reply(msg, 0);
    });
    await this.fileDisplayLock;
  }

  /**
   * Handle DISPLAY_FILE (non-stop file display)
   */
  handleDisplayFileNonStop(msg: XIMMessage): void {
    const patched: XIMMessage = { ...msg, data: 1 };
    this.handleShowFile(patched);
  }

  /**
   * Handle CHECK_TO_DISPLAY (non-stop gfile/ACS search)
   */
  handleCheckToDisplay(msg: XIMMessage): void {
    const patched: XIMMessage = { ...msg, data: 1 };
    this.handleShowGFile(patched);
  }

  /**
   * Handle JH_MCI (Process MCI codes)
   * From E sources (express.e:3456-3462)
   */
  async handleMCI(msg: XIMMessage): Promise<void> {
debugLog(`[XIMIOHandler] JH_MCI: Processing MCI codes`);

    const inputString = this.getMessageString(msg).trim();

    try {
      // Import parseMciCodes dynamically since it's async
      const { parseMciCodes } = await import('../../handlers/screen.handler.js');

      // Get BBS session info for MCI processing
      const bbsSession = this.bbsSession || {};
      const bbsName = bbsSession.bbsName || 'AmiExpress-Web';
      const sysopName = bbsSession.sysopName || 'Sysop';
      const location = bbsSession.user?.location || 'The Internet';

      // express.e:3457 - processMci(msg.string)
      // Pass socket to enable inline emission and command execution
      const result = await parseMciCodes(inputString, bbsSession as any, bbsName, sysopName, location, this.socket);

      // express.e:3459-3461 - IF msg.data THEN aePuts('\b\n'); checkForPause()
      if (msg.data) {
        this.emitText('', true, true, true, msg);
      }

debugLog(`[XIMIOHandler] JH_MCI: Processed successfully`);
      this.reply(msg, 1);
    } catch (error: any) {
console.error(`[XIMIOHandler] JH_MCI: Error processing MCI codes:`, error.message || error);
      this.reply(msg, 0);
    }
  }

  /**
   * Handle PG_UD (User Data)
   * From E sources (express.e:4444-4463)
   * Returns numeric user information based on msg.data field
   */
  handleUserData(msg: XIMMessage, bbsSession: any): void {
    let resultData = 0;

debugLog(`[XIMIOHandler] PG_UD: Request type ${msg.data}`);

    // express.e:4445-4463 - Map data field to user info
    switch (msg.data) {
      case 1: // Security level (divided by 10)
        resultData = Math.floor((bbsSession.user?.secLevel || 0) / 10);
        break;
      case 2: // Expert mode flag ('X' = expert)
        resultData = (bbsSession.user?.expert === 'X') ? 1 : 0;
        break;
      case 3: // Reserved
        resultData = 0;
        break;
      case 4: // Times called
      case 5: // Times called (duplicate in original)
        resultData = bbsSession.user?.timesCalled || 0;
        break;
      case 6: // Node number (always 1 for web version)
        resultData = 1;
        break;
      case 7: // Time limit in minutes
        resultData = Math.floor((bbsSession.timeLimit || 3600) / 60);
        break;
      case 8: // Screen width
        resultData = 80;
        break;
      case 9: // User line length (screen height in lines, NOT character width)
        // express.e:4462: doormsg.data:=userLineLen
        // userLineLen = number of lines on screen for pagination
        resultData = bbsSession.pauseLines || bbsSession.user?.linesPerScreen || bbsSession.user?.pageLength || 24;
        break;
      default:
        resultData = 0;
    }

debugLog(`[XIMIOHandler] PG_UD: Returning ${resultData}`);
    this.reply(msg, resultData);
  }

  /**
   * Handle PG_US (User String)
   * From E sources (express.e:4464-4494)
   * Returns string user information based on msg.data field
   */
  handleUserString(msg: XIMMessage, bbsSession: any): void {
    let resultString = '';

debugLog(`[XIMIOHandler] PG_US: Request type ${msg.data}`);

    // express.e:4465-4494 - Map data field to user string
    switch (msg.data) {
      case 1: // Username (max 21 chars)
        resultString = (bbsSession.user?.name || '').substring(0, 21);
        break;
      case 2: // Empty string
        resultString = '';
        break;
      case 3: // Location (max 39 chars)
        resultString = (bbsSession.user?.location || '').substring(0, 39);
        break;
      case 4: // Location (max 29 chars)
        resultString = (bbsSession.user?.location || '').substring(0, 29);
        break;
      case 5: // State code (max 2 chars)
        resultString = (bbsSession.user?.location || '').substring(0, 2);
        break;
      case 6: // Zip code (max 7 chars)
        resultString = (bbsSession.user?.location || '').substring(0, 7);
        break;
      case 7: // Door path
        resultString = 'PGDOORS:';
        break;
      case 8: // BBS location path
        resultString = bbsSession.bbsPath || process.env.BBS_DATA_DIR || process.cwd();
        break;
      case 9: // Long date format
        const date = getSystemTime();
        resultString = date.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
        break;
      case 10: // Long time format
        const time = getSystemTime();
        resultString = time.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        });
        break;
      default:
        resultString = '';
    }

debugLog(`[XIMIOHandler] PG_US: Returning "${resultString}"`);

    this.messageParser.writeMessageString(
      msg.msgAddr,
      resultString.substring(0, 80)
    );

    this.reply(msg, 1);
  }

  /**
   * Handle PG_SM (Serial/Screen Message)
   * From E sources (express.e:4396-4399)
   * Displays message to both serial and console (web: same as PG_SO)
   */
  handleScreenMessage(msg: XIMMessage): void {
debugLog('[XIMIOHandler] PG_SM: Redirecting to Serial Output handler');
    // In web version, screen and serial are the same (both go to socket)
    this.handleSerialOutput(msg);
  }

  /**
   * Emit text to the terminal with optional wrapping and pagination.
   * Returns the number of characters sent (approximate).
   */
  private emitText(
    text: string,
    addNewline: boolean,
    trackLines: boolean,
    autoPause: boolean = false,
    pendingMsg?: XIMMessage
  ): number {
    // Prepend any buffered content from previous incomplete ANSI sequence
    // RTW and other doors may split ESC[34m across multiple JH_SM calls
    let fullText = this.ansiBuffer + text;
    this.ansiBuffer = '';

    // Convert Amiga CSI (0x9B) to standard ANSI ESC+[ (0x1B 0x5B)
    // Amiga uses a single-byte CSI character for ANSI codes, but modern terminals
    // expect the two-byte ESC+[ sequence. Without this conversion, colors appear
    // as "[36m" instead of actual colored text.
    let converted = fullText.replace(/\x9b/g, '\x1b[');

    // Convert Form Feed (0x0C) to ANSI clear screen + home cursor (ESC[2J ESC[H).
    // On Amiga console.device, 0x0C (FF) is "Clear screen and home cursor" — doors
    // like dRE!WAll send \f\n\r as their first output to clear the terminal before
    // drawing at absolute positions [5;0H, [22;0H, [23;1H. xterm.js treats 0x0C as
    // plain line-feed, so without this translation the door overlays its banner on
    // top of whatever BBS content was on screen. See console.device docs and
    // Documentation/6-Progress/dRE_WALL_HANDOFF.md.
    converted = converted.replace(/\f/g, '\x1b[2J\x1b[H');

    // Filter out Amiga console.device specific codes that aren't standard ANSI:
    // - ESC[0 p = cursor off (Amiga-specific, not valid ANSI)
    // - ESC[1 p = cursor on (Amiga-specific, not valid ANSI)
    // - ESC[ p = toggle cursor (Amiga-specific)
    // These have a space before the 'p' which makes them Amiga-specific.
    // Standard ANSI cursor codes don't have a space (e.g., [?25h, [?25l).
    // The regex MUST include the leading ESC (\x1b) byte — stripping only
    // "[0 p" leaves an orphaned ESC, which the incomplete-ANSI buffer at the
    // bottom of this function captures and prepends to the NEXT JH_WRITE,
    // corrupting sequences like ESC[5;0H into \x1b\x1b[5;0H and breaking
    // absolute cursor positioning in doors like dRE!WAll.
    const amigaCursorMatches = converted.match(/\x1b\[(\d*)\s+p/gi);
    if (amigaCursorMatches) {
console.log(`[XIM-DEBUG] Filtering Amiga cursor codes: ${JSON.stringify(amigaCursorMatches)}`);
    }
    converted = converted.replace(/\x1b\[(\d*)\s+p/gi, '');

    // Handle @READUSERKEYS directive from MultiTop and similar doors
    // This directive should trigger a pause and wait for user keypress
    const hasReadUserKeys = /@READUSERKEYS\s*/gi.test(converted);
    if (hasReadUserKeys) {
      // Strip the directive from output
      converted = converted.replace(/@READUSERKEYS\s*/gi, '');
      // Trigger a pause after emitting any remaining text
      // We'll do this by setting a flag and checking after the text is emitted
      if (pendingMsg && !this.state.nonStopText) {
        // Queue a pause to happen after this text is fully output
        this.readUserKeysPending = true;
      }
    }

    // Convert bare ANSI sequences (without ESC prefix) to proper ANSI
    // Some Amiga doors output bare "[32m" sequences without ESC prefix,
    // relying on Amiga console.device's ability to accept these directly.
    // For proper terminal output, we need to add the ESC prefix.
    // Pattern: [ followed by optional ? (DEC private), params (digits/semicolons), and command letter
    // Examples: [32m -> ESC[32m, [0m -> ESC[0m, [2J -> ESC[2J, [?25l -> ESC[?25l
    // Only convert if not already preceded by ESC
    // IMPORTANT: Require at least one digit (\d+) to avoid matching text like "[zOOROPA"
    // which would incorrectly become ESC[z (eaten by terminal) + "OOROPA"
    converted = converted.replace(/(?<!\x1b)\[([?]?\d+(?:;\d*)*[A-Za-z])/g, '\x1b[$1');

    // Check for incomplete ANSI escape sequence at end of text
    // CSI format: ESC [ (params) (letter) where letter terminates the sequence
    // If we end mid-sequence, buffer it for the next message
    const incompleteAnsiMatch = converted.match(/\x1b(\[[\d;?]*)?$/);
    if (incompleteAnsiMatch) {
      // Store the incomplete sequence and remove from current output
      this.ansiBuffer = incompleteAnsiMatch[0];
      converted = converted.slice(0, -this.ansiBuffer.length);
      // If nothing left to emit after buffering, return early
      if (converted.length === 0) {
        return 0;
      }
    }

    // DOOR_NEWLINE_STRICT: preserve bytes verbatim (see newline-mode.util).
    const newlineMode = getNewlineMode();

    // Normalize CRLF to LF, but DON'T convert standalone CR to LF!
    // RTW and other doors use \r to move cursor to column 0.
    let normalized = normalizeNewlines(converted, newlineMode);

    // CRITICAL: Only add newline if text doesn't already end with one
    // Some doors send data=1 with a string that already contains a trailing \n
    // Adding another would cause double line breaks (RTW does this)
    //
    // NOTE: express.e:3406-3411 does aePuts('\b\n') - backspace+newline.
    // We skip the backspace as it's typically a no-op when at start of line.
    //
    // TARGETED FIX (task #8): if the message ends with a cursor-positioning
    // escape (CUU/CUD/CUF/CUB/CUP/HVP), skip the auto-newline — the door
    // just moved the cursor deliberately and an injected \r\n would consume
    // the next column the door expects. Matches WarOLM's ESC[11A line-editor
    // redraw. Other doors that don't end in a cursor move keep the old
    // auto-newline behavior.
    const alreadyHasNewline = normalized.endsWith('\n');
    const endsWithCursorMove = /\x1b\[[0-9;]*[ABCDHf]$/.test(normalized);
    if (!newlineMode.strict && addNewline && !alreadyHasNewline && !endsWithCursorMove) {
      normalized += '\n';
    }

    const rawLines = normalized.split('\n');
    const hasTrailingNewline = normalized.endsWith('\n');

    // Remove trailing empty string from split if text ended with newline
    // to prevent double line breaks
    if (hasTrailingNewline && rawLines.length > 0 && rawLines[rawLines.length - 1] === '') {
      rawLines.pop();
    }

    let bytesSent = 0;

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      const isLastLine = i === rawLines.length - 1;
      const shouldAddLineBreak = !isLastLine || hasTrailingNewline;

      const visibleLine = AnsiUtil.stripAnsiForPlainText(line);
      const lineLooksLikeArt = looksLikeAsciiArt(visibleLine);
      const segments = lineLooksLikeArt
        ? [line]
        : wrapLine(line, this.state.lineWrap);

      for (let s = 0; s < segments.length; s++) {
        const segment = segments[s];
        const isLastSegment = s === segments.length - 1;
        const endsInNewline = !isLastSegment || shouldAddLineBreak;
        const suffix = endsInNewline ? newlineMode.lineSuffix : '';
        const output = `${segment}${suffix}`;

        // Emit output BEFORE checking pause
        this.directEmit('ansi-output', output);
        bytesSent += output.length;

        // express.e only increments lineCount and checks pause if a newline was emitted
        if (trackLines && endsInNewline) {
          this.state.lineCount += 1;
          if (autoPause && this.checkForPause(pendingMsg)) {
            return bytesSent;
          }
        }
      }
    }

    // Handle @READUSERKEYS - trigger a pause after outputting all text
    if (this.readUserKeysPending && pendingMsg) {
      this.readUserKeysPending = false;
      debugLog('[XIMIOHandler] @READUSERKEYS triggered pause - setting waitingForPause=true');
      debugLog('[XIMIOHandler] @READUSERKEYS triggered pause');
      this.waitingForPause = true;
      this.pauseReply = { msg: pendingMsg, data: 1 };
      this.pauseInputBuffer = '';
      this.directEmit('ansi-output', '(Pause)...Space To Resume: ');
      this.emulator.pause();
      // Don't return bytesSent here - let the caller handle the pause state
    }

    return bytesSent;
  }

  /**
   * Simple fixed-width wrapper for a single line (no line breaks)
   * Properly handles:
   * - Tab characters (expand to next 8-column tab stop)
   * - ANSI escape sequences (don't count toward visible width)
   */
  /**
   * Determine XIM port code (CONSOLE_PORT=1, SERIAL_PORT=2)
   *
   * Per express.e line 28730: IF logonType=LOGON_TYPE_REMOTE THEN ximPort:=SERIAL_PORT
   *
   * For a web-based BBS, ALL users are remote (telnet/SSH/websocket).
   * Return SERIAL_PORT (2) by default. Only local sysop console would use CONSOLE_PORT (1),
   * but we don't have that - all our connections are remote.
   */
  private getXimPort(): number {
    // Web BBS: all users are remote, so always return SERIAL_PORT (2)
    // This matches what express.e does for LOGON_TYPE_REMOTE connections
    return 2;  // SERIAL_PORT - express.e comment: "XIMPort=1 for console, 2 for serial"
  }

  private getMessageString(msg: XIMMessage): string {
    if (msg.string && msg.string.length > 0) {
      return msg.string;
    }
    if (msg.stringPtr) {
      const ptrStr = this.messageParser.readString(
        msg.stringPtr,
        DoorConstants.MESSAGE_STRING_CAPACITY
      );
      if (ptrStr) {
        return ptrStr;
      }
    }
    return '';
  }

  /**
   * Display a text file with optional pagination
   */
  private async displayTextFile(
    filePath: string,
    forceNonStop: boolean,
    msg: XIMMessage
  ): Promise<boolean> {
    try {
      // Read file as binary buffer first to handle encoding properly
      // Amiga files use ISO-8859-1 encoding, not UTF-8
      const rawBuffer = amigafs.readFileSync(filePath) as Buffer;
      // Convert from ISO-8859-1 (Amiga standard) to UTF-8 for display
      const content = iconv.decode(rawBuffer, 'iso-8859-1');

      // Process MCI codes in file contents (express.e:6790-6820)
      try {
        const { parseMciCodes } = await import('../../handlers/screen.handler.js');
        const bbsSession = this.bbsSession || {};
        const bbsName = bbsSession.bbsName || 'AmiExpress-Web';
        const sysopName = bbsSession.sysopName || 'Sysop';
        const location = bbsSession.user?.location || 'The Internet';

        const result = await parseMciCodes(content, bbsSession as any, bbsName, sysopName, location);
        const autoPause = !forceNonStop;
        this.emitText(result.parsed, false, true, autoPause, msg);
      } catch (mciError: any) {
console.warn(`[XIMIOHandler] MCI processing failed, displaying raw: ${mciError.message}`);
        // Fallback to raw display if MCI processing fails
        const autoPause = !forceNonStop;
        this.emitText(content, false, true, autoPause, msg);
      }

      return true;
    } catch (err) {
      SysopDebugUtil.debugFileError(this.socket, this.bbsSession, 'read', filePath, err as Error);
console.error(`[XIMIOHandler] Failed to display file ${filePath}:`, err);
      return false;
    }
  }

  /**
   * Resolve an Amiga-style path (BBS:, NODE#:, DOORS:) to host filesystem
   */
  private resolvePath(amigaPath: string): string {
    const paths = new BBSPaths(this.getBbsRoot());
    return paths.resolveAmigaPath(
      amigaPath,
      this.bbsSession?.nodeId ?? 0,
      undefined
    );
  }

  private getBbsRoot(): string {
    return (
      this.bbsSession?.bbsPath ||
      process.env.BBS_DATA_DIR ||
      path.resolve(process.cwd())
    );
  }

  private findFirstExisting(candidates: string[]): string | null {
    for (const candidate of candidates) {
      if (amigafs.existsSync(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  /**
   * Build candidate list for showgfile ACS/language search
   */
  private buildGFileCandidates(
    basePath: string,
    explicitExt: string,
    language: string,
    secLevel: number
  ): string[] {
    const candidates: string[] = [];
    const seen = new Set<string>();
    const add = (p: string) => {
      const normalized = path.normalize(p);
      if (!seen.has(normalized)) {
        seen.add(normalized);
        candidates.push(normalized);
      }
    };

    const lang = language?.trim();
    const langExts =
      lang && lang.toLowerCase() !== 'txt'
        ? [`.${lang}`, `.${lang}.gr`]
        : [];

    const baseExts =
      explicitExt && explicitExt.length > 0
        ? [explicitExt]
        : ['.txt', '.txt.gr', '.GR1'];

    const exts = [...langExts, ...baseExts];

    const rounded =
      secLevel >= 5 ? secLevel - (secLevel % 5) : Math.max(secLevel, 0);
    for (let level = rounded; level >= 5; level -= 5) {
      for (const ext of exts) {
        add(`${basePath}${level}${ext}`);
      }
    }

    for (const ext of exts) {
      add(`${basePath}${ext}`);
    }

    return candidates;
  }

  /**
   * Check if a pause is required based on current line count.
   * Returns true if paused, false otherwise.
   */
  private checkForPause(pendingMsg?: XIMMessage): boolean {
    if (this.state.nonStopText || !pendingMsg) {
      return false;
    }

    if (this.state.lineCount >= this.state.pauseLines) {
debugLog(`[XIMIOHandler] Pause triggered (lineCount=${this.state.lineCount})`);
      this.waitingForPause = true;
      this.pauseReply = { msg: pendingMsg, data: 1 };
      this.pauseInputBuffer = '';
      
      // Notify user - Match express.e:5192 exactly
      this.directEmit('ansi-output', '(Pause)...More(y/n/ns)? ');
      
      // Pause emulator while waiting for user to acknowledge pause
      this.emulator.pause();
      return true;
    }

    return false;
  }

  /**
   * Complete a pending pause when user acknowledges it.
   */
  private completePauseInput(): void {
    debugLog(`[XIMIOHandler] completePauseInput called - waitingForPause=${this.waitingForPause} hasPauseReply=${!!this.pauseReply}`);
    if (!this.waitingForPause || !this.pauseReply) return;

    debugLog('[XIMIOHandler] completePauseInput - sending reply and resuming emulator');
debugLog('[XIMIOHandler] Pause acknowledged, resuming');
    
    const { msg, data } = this.pauseReply;
    this.waitingForPause = false;
    this.pauseReply = null;
    this.state.lineCount = 0;
    
    // Handle 'ns' (non-stop) input
    if (this.pauseInputBuffer.toLowerCase().includes('ns')) {
      this.state.nonStopText = true;
    }
    
    this.pauseInputBuffer = '';

    // Reply to the message that triggered the pause
    this.reply(msg, data);
    // NOTE: reply() already calls replyMsg() for native doors

    // Resume emulator
debugLog('[XIMIOHandler] Pause complete, reply sent, resuming');
    this.emulator.resume();
  }

  /**
   * Finish a pending pause prompt (legacy handler).
   */
  private finishPause(): void {
    this.completePauseInput();
  }

  /**
   * Send reply to door via bidirectional XIM protocol
   *
   * CRITICAL FIX 2026-01-20: Detect if door uses native AEDoor.library or direct XIM
   * - Native AEDoor.library doors: Set mn_ReplyPort to their own reply port → use replyMsg()
   * - Direct XIM doors (RTW, Bulls): Set mn_ReplyPort to AEDoorPort → use bidirectional mode
   */
  private reply(msg: XIMMessage, data: number, stringValue?: string): void {
debugLog('[XIMIOHandler] Sending reply to door:');
debugLog(`  Message: 0x${msg.msgAddr.toString(16)}`);
debugLog(`  Data: ${data}`);

    // Mark reply as handled so callers (XIMProcessor / polling loop) skip their
    // fallback replyMsg and we avoid double-delivering the same msg to the
    // door's reply port queue.
    this.state.replyHandled = true;

    if (typeof stringValue === 'string') {
      this.messageParser.writeMessageString(msg.msgAddr, stringValue);
    }
    this.messageParser.writeData(msg.msgAddr, data);
    // express.e replies only set msg.string/msg.data; do not modify strptr/fillers.

    // Log outgoing reply to XIM structured logger
    const humanName = this.messageParser.getCommandName(msg.command);
    ximLogger.log('debug', 'send', this.state.doorCommand || 'UNKNOWN', this.bbsSession?.nodeId || 1, {
      type: `${humanName}_REPLY`,
      typeCode: msg.command,
      param: data,
      data: stringValue,
    }, {
      msgAddr: `0x${msg.msgAddr.toString(16)}`,
      message: 'Reply to door I/O request',
    });

    // CRITICAL: Detect if door is using native AEDoor.library or direct XIM protocol
    // Native aedoor.library sets mn_ReplyPort to door's own reply port (NOT AEDoorPort)
    // Direct XIM doors (RTW, Bulls) set mn_ReplyPort to AEDoorPort for bidirectional flow
    const replyPortAddr = this.emulator.readMemory32(msg.msgAddr + 14); // mn_ReplyPort offset
    const ximPortAddr = this.ximPort || 0;
    const useBidirectional = (replyPortAddr === ximPortAddr || replyPortAddr === 0);

    if (useBidirectional && ximPortAddr !== 0) {
      // Direct XIM door - use bidirectional protocol (reply to AEDoorPort)
      const NT_REPLYMSG = 6;
      this.emulator.writeMemory(msg.msgAddr + 8, NT_REPLYMSG);
      this.execLibrary.putMsg(ximPortAddr, msg.msgAddr, { suppressDoorCallback: true });
      debugLog(`[XIMIOHandler] Reply sent via PutMsg to ximPort=0x${ximPortAddr.toString(16)} (bidirectional XIM)`);
    } else {
      // Native AEDoor.library door - use standard reply mechanism
      // The door set mn_ReplyPort to its own reply port, so use replyMsg()
      this.execLibrary.replyMsg(msg.msgAddr);
      debugLog(`[XIMIOHandler] Reply sent via ReplyMsg to replyPort=0x${replyPortAddr.toString(16)} (native aedoor.library)`);
    }
  }

  /**
   * Mark carrier drop for input commands
   */
  markCarrierDropped(): void {
    this.state.carrierDropped = true;

    if (this.waitingForLineInput && this.lineInputMessage) {
      this.reply(this.lineInputMessage, -1, '');
      this.waitingForLineInput = false;
      this.lineInputMessage = null;
      this.lineInputBuffer = '';
    }

    if (this.waitingForHotkey && this.hotkeyMessage) {
      this.reply(this.hotkeyMessage, -1, '');
      this.waitingForHotkey = false;
      this.hotkeyMessage = null;
    }
    // Clear the timeout armed by handleHotkey so its callback (which
    // writes emulator memory + calls resume) can't fire against a
    // deinitialized emulator after teardown. See io.ts:829 timeout arm.
    if (this.hotkeyTimeoutId) {
      clearTimeout(this.hotkeyTimeoutId);
      this.hotkeyTimeoutId = null;
    }

    if (this.waitingForExtHotkey && this.extHotkeyMessage) {
      this.messageParser.writeCommand(this.extHotkeyMessage.msgAddr, -1);
      this.reply(this.extHotkeyMessage, -1);
      this.waitingForExtHotkey = false;
      this.extHotkeyMessage = null;
    }

    if (this.waitingForPause && this.pauseReply) {
      this.reply(this.pauseReply.msg, -1);
      this.waitingForPause = false;
      this.pauseReply = null;
    }
  }

  /**
   * Handle BB_PURGELINE commands
   * Per doordocs.txt (AmiExpress 2.20 Module Interface):
   * - BB_PURGELINE (522): aborts serial input, flushes buffer, requests more input
   * - BB_PURGELINESTART (523): clears buffer, requests more input
   * - BB_PURGELINEEND (524): clears buffer only
   */
  handlePurgeLine(msg: XIMMessage): void {
debugLog('[XIMIOHandler] Purge line command');

    let requestMoreInput = false;

    switch (msg.command) {
      case XIMCommand.BB_PURGELINE:
        // Aborts serial input, flushes buffer, requests more input
debugLog('  BB_PURGELINE: Abort input, flush buffer, request more');
        requestMoreInput = true;
        break;

      case XIMCommand.BB_PURGELINESTART:
        // Clear buffer, request more input
debugLog('  BB_PURGELINESTART: Clear buffer, request more');
        requestMoreInput = true;
        break;

      case XIMCommand.BB_PURGELINEEND:
        // Clear buffer only
debugLog('  BB_PURGELINEEND: Clear buffer only');
        requestMoreInput = false;
        break;
    }

    this.clearInputBuffer(requestMoreInput);
    this.reply(msg, 1);
  }

  /**
   * Clear input buffer helper
   * Called by handlePurgeLine
   */
  private clearInputBuffer(requestMoreInput: boolean = false): void {
debugLog(`[XIMIOHandler] Clearing input buffer (requestMore=${requestMoreInput})`);

    // Clear the input queue
    const queueSize = this.inputQueue.length;
    this.inputQueue.length = 0;

    // Clear any line input in progress
    this.lineInputBuffer = '';

    // If we were waiting for input, we need to abort it
    if (this.waitingForLineInput && this.lineInputMessage) {
debugLog('[XIMIOHandler] Aborting pending line input');
      this.waitingForLineInput = false;
      this.lineInputMessage = null;
    }

    if (this.waitingForHotkey && this.hotkeyMessage) {
debugLog('[XIMIOHandler] Aborting pending hotkey');
      this.waitingForHotkey = false;
      this.hotkeyMessage = null;
    }

    if (this.waitingForExtHotkey && this.extHotkeyMessage) {
debugLog('[XIMIOHandler] Aborting pending extended hotkey');
      this.waitingForExtHotkey = false;
      this.extHotkeyMessage = null;
    }

    if (this.waitingForPause) {
debugLog('[XIMIOHandler] Aborting pending pause');
      this.waitingForPause = false;
      this.pauseInputBuffer = '';
      this.pauseReply = null;
    }

debugLog(`[XIMIOHandler] Cleared ${queueSize} queued inputs`);

    // On a real Amiga BBS, "request more input" would signal the serial port
    // In our web context, the frontend is always ready to send more input
    if (requestMoreInput) {
debugLog('[XIMIOHandler] Ready for more input');
    }
  }
}
