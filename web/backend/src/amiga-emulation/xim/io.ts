/**
 * XIM I/O Operations
 *
 * Handles input/output operations for the XIM protocol including:
 * - Terminal output (write, console, serial)
 * - Keyboard input (hotkey, line input, getkey)
 * - Input queue management
 */

import * as fs from 'fs';
import * as path from 'path';
import { Socket } from 'socket.io';
import { MoiraEmulator } from '../cpu/MoiraEmulator';
import { DoorConstants } from '../DoorTypes';
import { BBSSessionData, XIMMessage, XIMState } from './types';
import { XIMMessageParser } from './messages';
import { ExecLibrary } from '../api/ExecLibrary';
import { AnsiUtil } from '../../utils/ansi.util';
import { BBSPaths } from '../../utils/bbs-paths.util';
import { SysopDebugUtil } from '../../utils/sysop-debug.util';
import { looksLikeAsciiArt } from '../../utils/ascii-art.util';

export class XIMIOHandler {
  private emulator: MoiraEmulator;
  private execLibrary: ExecLibrary;
  private socket: Socket;
  private messageParser: XIMMessageParser;
  private bbsSession: BBSSessionData;
  private state: XIMState;
  private inputQueue: string[] = [];
  private keyState: Record<string, boolean> = {}; // Simultaneous key state tracking

  // Line input state
  private waitingForLineInput: boolean = false;
  private lineInputMessage: XIMMessage | null = null;
  private lineInputBuffer: string = '';
  private lineInputMaxLen: number = DoorConstants.MESSAGE_STRING_CAPACITY;

  // Hotkey/pause state
  private waitingForHotkey: boolean = false;
  private hotkeyMessage: XIMMessage | null = null;
  private waitingForPause: boolean = false;
  private pauseReply: { msg: XIMMessage; data: number } | null = null;

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
   * Check if waiting for line input from user
   */
  isWaitingForLineInput(): boolean {
    return (
      this.waitingForLineInput || this.waitingForHotkey || this.waitingForPause
    );
  }

  /**
   * Update key state for simultaneous input (from keys:state event)
   */
  updateKeyState(data: { key: string; pressed: boolean; keyState: Record<string, boolean> }): void {
    console.log(`[XIMIOHandler] Key state update: ${data.key} = ${data.pressed}`);
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
   */
  queueInput(data: string): void {
    console.log(`[XIMIOHandler] Queuing input: "${data}"`);

    if (this.state.carrierDropped) {
      console.warn('[XIMIOHandler] Carrier already dropped, ignoring input');
      return;
    }

    for (const char of data) {
      if (this.waitingForPause && this.pauseReply) {
        console.log('[XIMIOHandler] Pause acknowledged, resuming output');
        this.finishPause();
        continue;
      }

      if (this.waitingForHotkey && this.hotkeyMessage) {
        this.completeHotkey(char);
        continue;
      }

      if (this.waitingForLineInput) {
        if (char === '\r' || char === '\n') {
          console.log(
            `[XIMIOHandler] Enter pressed, completing line input: "${this.lineInputBuffer}"`
          );
          this.completeLineInput();
          continue;
        }

        if (char === '\b' || char === '\x7f') {
          if (this.lineInputBuffer.length > 0) {
            this.lineInputBuffer = this.lineInputBuffer.slice(0, -1);
            console.log(
              `[XIMIOHandler] Backspace, buffer now: "${this.lineInputBuffer}"`
            );
            // Echo backspace to terminal
            this.socket.emit('ansi-output', '\b \b');
          }
          continue;
        }

        if (this.lineInputBuffer.length < this.lineInputMaxLen) {
          this.lineInputBuffer += char;
          console.log(
            `[XIMIOHandler] Character added, buffer now: "${this.lineInputBuffer}"`
          );
          // Echo typed character
          this.socket.emit('ansi-output', char);
        }
        continue;
      }

      // Not waiting for special input - queue for GETKEY/quick key
      this.inputQueue.push(char);
    }

    if (!this.waitingForLineInput) {
      console.log(`[XIMIOHandler] Input queue size: ${this.inputQueue.length}`);
    }
  }

  /**
   * Handle line input request (JH_LI)
   * From E sources (express.e:3425)
   */
  handleLineInput(msg: XIMMessage): void {
    console.log('[XIMIOHandler] Door requesting line input');

    if (this.state.carrierDropped) {
      this.reply(msg, -1, '');
      return;
    }

    const maxLen = Math.min(
      msg.data && msg.data > 0 ? msg.data : DoorConstants.MESSAGE_STRING_CAPACITY,
      DoorConstants.MESSAGE_STRING_CAPACITY
    );
    const defaultText = this.getMessageString(msg).slice(0, maxLen);

    if (defaultText.length > 0) {
      this.socket.emit('ansi-output', defaultText);
    }

    this.waitingForLineInput = true;
    this.lineInputMessage = msg;
    this.lineInputBuffer = defaultText;
    this.lineInputMaxLen = maxLen;

    console.log(
      `[XIMIOHandler] Waiting for user to type line (max ${maxLen} chars)`
    );
  }

  /**
   * Complete line input and send reply to door
   */
  private completeLineInput(): void {
    if (!this.lineInputMessage) {
      console.log('[XIMIOHandler] ERROR: completeLineInput called but no pending message!');
      return;
    }

    const msg = this.lineInputMessage;
    const result = this.lineInputBuffer.slice(0, this.lineInputMaxLen);

    console.log(
      `[XIMIOHandler] Completing line input with: "${result}"`
    );

    // Ensure stringPtr points to embedded buffer if missing
    if (!msg.stringPtr) {
      const strPtr = msg.msgAddr + DoorConstants.MESSAGE_STRING_OFFSET;
      this.messageParser.writeStringPointer(msg.msgAddr, strPtr);
      msg.stringPtr = strPtr;
    }

    // Write into embedded buffer
    this.messageParser.writeMessageString(msg.msgAddr, result);
    // If a string pointer was provided, mirror there too
    if (msg.stringPtr) {
      this.messageParser.writeString(
        msg.stringPtr,
        result,
        DoorConstants.MESSAGE_STRING_CAPACITY
      );
    }

    // Reply with length (or -1 on carrier drop) and mirror into Command like the earlier working path
    const lenVal = this.state.carrierDropped ? -1 : result.length;
    this.messageParser.writeCommand(msg.msgAddr, lenVal);
    this.messageParser.writeLineNumber(msg.msgAddr, 0);
    this.reply(msg, lenVal);

    // Reset state
    this.waitingForLineInput = false;
    this.lineInputMessage = null;
    this.lineInputBuffer = '';
    this.lineInputMaxLen = DoorConstants.MESSAGE_STRING_CAPACITY;

    console.log('[XIMIOHandler] Line input completed, waiting for next command');
  }

  /**
   * Handle door write request (JH_WRITE)
   * From E sources (express.e:1085)
   */
  handleWrite(msg: XIMMessage): void {
    const text = this.getMessageString(msg);
    const addNewline = msg.data === 1;

    console.log(
      '[XIMIOHandler] Door writing to terminal:',
      JSON.stringify(text)
    );

    // Disable autoPause - doors handle their own pagination
    const bytesWritten = this.emitText(text, addNewline, true, false, msg);

    console.log(`[XIMIOHandler] Sent ${bytesWritten} bytes to terminal`);
    this.reply(msg, bytesWritten);
  }

  /**
   * Handle keyboard input request (GETKEY)
   * From E sources (express.e:3811)
   */
  handleGetKey(msg: XIMMessage): void {
    // Check if we have queued input
    if (this.inputQueue.length > 0) {
      const char = this.inputQueue.shift()!;
      const charCode = char.charCodeAt(0);

      console.log(`[XIMIOHandler] GETKEY: Returning key '${char}' (0x${charCode.toString(16)})`);

      // Write "1<char>\0" to embedded string buffer (E sources format)
      this.messageParser.writeMessageString(
        msg.msgAddr,
        String.fromCharCode(0x31, charCode)
      );

      this.reply(msg, 1);
    } else {
      console.log('[XIMIOHandler] GETKEY: No input queued');

      // Write "0\0" to string buffer
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

    // Don't add newline for:
    // 1. Messages that are only ANSI color codes (prevents blank lines)
    // 2. Messages ending with ": " or ":" followed by ANSI codes (keeps label+value on same line)
    const isOnlyAnsiCodes = /^\x1b\[[0-9;]*m$/.test(text);
    const endsWithColonAndAnsi = /:\s*(\x1b\[[0-9;]*m)*\s*$/.test(text);
    const shouldAddNewline = (msg.data !== 0) && !isOnlyAnsiCodes && !endsWithColonAndAnsi;

    console.log(`[XIMIOHandler] JH_SM: "${text}" (msg.data=${msg.data}, addNewline=${shouldAddNewline}, isOnlyAnsi=${isOnlyAnsiCodes}, endsWithColon=${endsWithColonAndAnsi})`);

    // Disable autoPause - doors handle their own pagination (e.g. AquaScan shows "More? (Y/n/ns)")
    // autoPause was interfering with door pagination and causing output to be lost
    this.emitText(text, shouldAddNewline, true, false, msg);

    this.reply(msg, 1);
  }

  /**
   * Handle JH_PM (Prompt Message)
   * From E sources (express.e:3418-3424)
   */
  handlePromptMessage(msg: XIMMessage): void {
    const prompt = this.getMessageString(msg);
    const maxLength = Math.min(
      msg.data && msg.data > 0 ? msg.data : DoorConstants.MESSAGE_STRING_CAPACITY,
      DoorConstants.MESSAGE_STRING_CAPACITY
    );

    if (this.state.carrierDropped) {
      this.reply(msg, -1, '');
      return;
    }

    console.log('[XIMIOHandler] JH_PM: Prompt message with line input');
    if (prompt.length > 0) {
      console.log(`[XIMIOHandler] JH_PM: Prompt: "${prompt}"`);
      this.socket.emit('ansi-output', prompt);
    }

    console.log(
      `[XIMIOHandler] JH_PM: Waiting for user input (max ${maxLength} chars)...`
    );
    this.waitingForLineInput = true;
    this.lineInputMessage = msg;
    this.lineInputBuffer = '';
    this.lineInputMaxLen = maxLength;
  }

  /**
   * Handle JH_HK (Hotkey)
   * From E sources (express.e:3436-3447)
   */
  handleHotkey(msg: XIMMessage): void {
    const prompt = this.getMessageString(msg);

    console.log('[XIMIOHandler] JH_HK: Hotkey input request');
    this.state.lineCount = 0;

    if (prompt.length > 0) {
      console.log(`[XIMIOHandler] JH_HK: Prompt: "${prompt}"`);
      this.socket.emit('ansi-output', prompt);
    }

    if (this.state.carrierDropped) {
      this.reply(msg, -1, '');
      return;
    }

    if (this.inputQueue.length > 0) {
      const char = this.inputQueue.shift()!;
      this.messageParser.writeCommand(msg.msgAddr, this.getXimPort());
      console.log(
        `[XIMIOHandler] JH_HK: Got hotkey '${char}' (0x${char
          .charCodeAt(0)
          .toString(16)})`
      );
      this.reply(msg, 1, char);
      return;
    }

    this.waitingForHotkey = true;
    this.hotkeyMessage = msg;
  }

  /**
   * Complete a pending hotkey prompt
   */
  private completeHotkey(char: string): void {
    if (!this.hotkeyMessage) {
      return;
    }

    const msg = this.hotkeyMessage;
    const keyChar = char.length > 0 ? char[0] : '';

    this.messageParser.writeCommand(msg.msgAddr, this.getXimPort());
    this.reply(msg, this.state.carrierDropped ? -1 : 1, keyChar);

    this.waitingForHotkey = false;
    this.hotkeyMessage = null;
  }

  /**
   * Handle extended hotkey (JH_ExtHK)
   * From E sources (express.e:3432-3435)
   */
  handleExtendedHotkey(msg: XIMMessage): void {
    console.log('[XIMIOHandler] JH_ExtHK - Extended hotkey with signal');
    this.state.lineCount = 0;

    if (this.inputQueue.length > 0) {
      const char = this.inputQueue.shift()!;
      this.messageParser.writeCommand(msg.msgAddr, char.charCodeAt(0));
      this.messageParser.writeMessageString(msg.msgAddr, char);
      console.log(`  [READ] Extended hotkey: '${char}'`);
      this.reply(msg, 1);
    } else {
      this.messageParser.writeCommand(msg.msgAddr, 0);
      this.messageParser.writeMessageString(msg.msgAddr, '');
      console.log('  [TIMEOUT] No input available');
      this.reply(msg, -1);
    }
  }

  /**
   * Handle fetch key (JH_FetchKey)
   * From E sources (express.e:3465-3472)
   */
  handleFetchKey(msg: XIMMessage): void {
    console.log('[XIMIOHandler] JH_FetchKey - Non-blocking key check');

    if (this.state.carrierDropped) {
      this.messageParser.writeCommand(msg.msgAddr, 0);
      this.reply(msg, -1);
      return;
    }

    if (this.inputQueue.length > 0) {
      const char = this.inputQueue.shift()!;
      this.messageParser.writeCommand(msg.msgAddr, char.charCodeAt(0));
      console.log(`  [READ] Key available: '${char}'`);
      this.reply(msg, 1, char);
      return;
    }

    this.messageParser.writeCommand(msg.msgAddr, 0);
    console.log('  [NO INPUT] No key available');
    this.reply(msg, 1, '');
  }

  /**
   * Handle JH_CK (QuickKey check) - non-blocking, include port in Command
   * From express.e JH_CK case
   */
  handleCheckKey(msg: XIMMessage): void {
    console.log('[XIMIOHandler] JH_CK - QuicKey check');

    if (this.state.carrierDropped) {
      this.messageParser.writeCommand(msg.msgAddr, 0);
      this.reply(msg, -1);
      return;
    }

    if (this.inputQueue.length > 0) {
      const char = this.inputQueue.shift()!;
      this.messageParser.writeCommand(msg.msgAddr, this.getXimPort());
      console.log(`  [READ] QuicKey: '${char}'`);
      this.reply(msg, 1, char);
      return;
    }

    this.messageParser.writeCommand(msg.msgAddr, 0);
    console.log('  [NO INPUT] No key available');
    this.reply(msg, 1, '');
  }

  /**
   * Handle quick key (JH_20, QUICK_KEY)
   * From E sources (express.e:3448-3455)
   */
  handleQuickKey(msg: XIMMessage): void {
    console.log('[XIMIOHandler] QUICK_KEY - Quick key input');

    if (this.state.carrierDropped) {
      this.messageParser.writeCommand(msg.msgAddr, this.getXimPort());
      this.reply(msg, -1);
      return;
    }

    const char = this.inputQueue.shift();
    const charCode = typeof char === 'string' ? char.charCodeAt(0) : -1;
    this.messageParser.writeCommand(msg.msgAddr, this.getXimPort());

    if (char) {
      console.log(`  [READ] Quick key: '${char}' (code ${charCode})`);
      this.reply(msg, charCode);
    } else {
      console.log('  [TIMEOUT] No input available');
      this.reply(msg, -1);
    }
  }

  /**
   * Handle JH_CO (Console Output)
   * From E sources (express.e:3395-3400)
   */
  handleConsoleOutput(msg: XIMMessage): void {
    const text = this.getMessageString(msg);

    this.emitText(text, msg.data !== 0, true, true, msg);

    this.reply(msg, 1);
  }

  /**
   * Handle JH_SO (Serial Output)
   * From E sources (express.e:3401-3405)
   */
  handleSerialOutput(msg: XIMMessage): void {
    const text = this.getMessageString(msg);

    console.log(`[XIMIOHandler] JH_SO (Serial): "${text}"`);

    this.emitText(text, msg.data !== 0, true, true, msg);

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
   * Processes MCI codes in the message string and outputs to terminal
   */
  async handleMCI(msg: XIMMessage): Promise<void> {
    console.log(`[XIMIOHandler] JH_MCI: Processing MCI codes`);

    const inputString = this.getMessageString(msg).trim();

    try {
      // Import parseMciCodes dynamically since it's async
      const { parseMciCodes } = await import('../../handlers/screen.handler.js');

      // Get BBS session info for MCI processing
      const bbsSession = this.bbsSession || {};
      const bbsName = bbsSession.bbsName || 'AmiExpress-Web';
      const sysopName = bbsSession.sysopName || 'Sysop';
      const location = bbsSession.user?.location || 'The Internet';

      // Process MCI codes
      const result = await parseMciCodes(inputString, bbsSession as any, bbsName, sysopName, location);

      // Output parsed content to terminal (express.e: processMci outputs to terminal)
      this.socket.emit('ansi-output', result.parsed);

      // If data flag is set, output backspace + newline (express.e:3459-3461)
      if (msg.data) {
        this.socket.emit('ansi-output', '\b\n');
        // Note: checkForPause() not implemented yet
      }

      console.log(`[XIMIOHandler] JH_MCI: Processed successfully`);
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

    console.log(`[XIMIOHandler] PG_UD: Request type ${msg.data}`);

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
      case 9: // User line length
        resultData = bbsSession.user?.lineLen || 80;
        break;
      default:
        resultData = 0;
    }

    console.log(`[XIMIOHandler] PG_UD: Returning ${resultData}`);
    this.reply(msg, resultData);
  }

  /**
   * Handle PG_US (User String)
   * From E sources (express.e:4464-4494)
   * Returns string user information based on msg.data field
   */
  handleUserString(msg: XIMMessage, bbsSession: any): void {
    let resultString = '';

    console.log(`[XIMIOHandler] PG_US: Request type ${msg.data}`);

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
        resultString = bbsSession.bbsPath || '~/Code/amiexpress-web/reference-boardBBS';
        break;
      case 9: // Long date format
        const date = new Date();
        resultString = date.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
        break;
      case 10: // Long time format
        const time = new Date();
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

    console.log(`[XIMIOHandler] PG_US: Returning "${resultString}"`);

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
    console.log('[XIMIOHandler] PG_SM: Redirecting to Serial Output handler');
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
    let normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (addNewline) {
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
        : this.wrapLine(line, this.state.lineWrap);

      for (let s = 0; s < segments.length; s++) {
        const segment = segments[s];
        const isLastSegment = s === segments.length - 1;
        const suffix = isLastSegment && !shouldAddLineBreak ? '' : '\r\n';
        const output = `${segment}${suffix}`;

        // Emit output BEFORE checking pause
        this.socket.emit('ansi-output', output);
        bytesSent += output.length;

        const shouldTrackLine = trackLines;
        if (shouldTrackLine) {
          this.state.lineCount += 1;

          // Check pause AFTER emitting current line
          if (
            autoPause &&
            !this.state.nonStopText &&
            pendingMsg &&
            this.state.lineCount >= this.state.pauseLines
          ) {
            this.waitingForPause = true;
            this.pauseReply = { msg: pendingMsg, data: 1 };
            this.socket.emit(
              'ansi-output',
              '\r\npress <RETURN> to continue\r\n'
            );
            return bytesSent;
          }
        }
      }
    }

    return bytesSent;
  }

  /**
   * Simple fixed-width wrapper for a single line (no line breaks)
   */
  private wrapLine(line: string, width: number): string[] {
    if (width <= 0 || line.length === 0) {
      return [line];
    }

    const segments: string[] = [];
    let current = '';
    let visibleCount = 0;

    const flushCurrent = () => {
      segments.push(current);
      current = '';
      visibleCount = 0;
    };

    let i = 0;
    while (i < line.length) {
      if (line[i] === '\x1b') {
        const remainder = line.slice(i);
        const escMatch = remainder.match(/^\x1b\[[0-9;]*[A-Za-z]/);
        if (escMatch) {
          current += escMatch[0];
          i += escMatch[0].length;
          continue;
        }
      }

      current += line[i];
      visibleCount += 1;
      i += 1;

      if (visibleCount >= width) {
        flushCurrent();
      }
    }

    if (current.length > 0 || segments.length === 0) {
      segments.push(current);
    }

    return segments;
  }

  /**
   * Determine XIM port code (CONSOLE_PORT=1, SERIAL_PORT=2)
   */
  private getXimPort(): number {
    const logonType = this.bbsSession?.logonType;
    // Treat non-local (numeric logonType 1) connections as serial
    return logonType === 1 ? 2 : 1;
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
      const content = fs.readFileSync(filePath, 'utf-8');

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
      if (fs.existsSync(candidate)) {
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
   * Finish a pending pause prompt.
   */
  private finishPause(): void {
    if (!this.pauseReply) {
      return;
    }

    const { msg, data } = this.pauseReply;

    this.waitingForPause = false;
    this.pauseReply = null;
    this.state.lineCount = 0;

    this.reply(msg, data);
  }

  /**
   * Send reply to door via ReplyMsg
   */
  private reply(msg: XIMMessage, data: number, stringValue?: string): void {
    console.log('[XIMIOHandler] Sending reply to door:');
    console.log(`  Message: 0x${msg.msgAddr.toString(16)}`);
    console.log(`  Data: ${data}`);

    if (typeof stringValue === 'string') {
      this.messageParser.writeMessageString(msg.msgAddr, stringValue);
    }
    this.messageParser.writeData(msg.msgAddr, data);
    this.execLibrary.replyMsg(msg.msgAddr);

    console.log('[XIMIOHandler] Reply sent via ReplyMsg');
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

    if (this.waitingForPause && this.pauseReply) {
      this.reply(this.pauseReply.msg, -1);
      this.waitingForPause = false;
      this.pauseReply = null;
    }
  }
}
