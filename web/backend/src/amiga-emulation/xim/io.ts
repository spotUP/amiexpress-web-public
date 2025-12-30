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
import { ArrowKeyCodes, BBSSessionData, XIMMessage, XIMState } from './types';
import { XIMMessageParser } from './messages';
import { ExecLibrary } from '../api/ExecLibrary';
import { AnsiUtil } from '../../utils/ansi.util';
import { BBSPaths } from '../../utils/bbs-paths.util';
import { SysopDebugUtil } from '../../utils/sysop-debug.util';
import { looksLikeAsciiArt } from '../../utils/ascii-art.util';
import { ximLogger } from '../../utils/XIMLogger';

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

  // ANSI sequence buffer for handling split escape sequences across JH_SM calls
  // RTW and other doors may split ANSI sequences like ESC[34m across multiple messages
  private ansiBuffer: string = '';

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
   *
   * IMPORTANT: ANSI escape sequences (arrow keys, etc.) must be kept intact.
   * xterm.js sends arrow keys as escape sequences: \x1b[A (up), \x1b[B (down), etc.
   */
  queueInput(data: string): void {
    console.log(`[XIMIOHandler] Queuing input: "${data}" (len=${data.length})`);

    if (this.state.carrierDropped) {
      console.warn('[XIMIOHandler] Carrier already dropped, ignoring input');
      return;
    }

    // Parse input into tokens, preserving ANSI escape sequences
    const tokens = this.parseInputTokens(data);
    console.log(`[XIMIOHandler] Parsed into ${tokens.length} token(s)`);

    for (const token of tokens) {
      if (this.waitingForPause && this.pauseReply) {
        console.log('[XIMIOHandler] Pause acknowledged, resuming output');
        this.finishPause();
        continue;
      }

      if (this.waitingForHotkey && this.hotkeyMessage) {
        // For hotkeys, if it's an escape sequence, pass the full sequence
        this.completeHotkey(token);
        continue;
      }

      if (this.waitingForLineInput) {
        if (token === '\r' || token === '\n') {
          console.log(
            `[XIMIOHandler] Enter pressed, completing line input: "${this.lineInputBuffer}"`
          );
          this.completeLineInput();
          continue;
        }

        if (token === '\b' || token === '\x7f') {
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

        // For line input, add token to buffer (even if it's an escape sequence)
        if (this.lineInputBuffer.length < this.lineInputMaxLen) {
          this.lineInputBuffer += token;
          console.log(
            `[XIMIOHandler] Token added, buffer now: "${this.lineInputBuffer}"`
          );
          // Echo typed character (only for single visible characters)
          if (token.length === 1 && token >= ' ' && token <= '~') {
            this.socket.emit('ansi-output', token);
          }
        }
        continue;
      }

      // Not waiting for special input - queue for GETKEY/quick key
      // Keep entire token as single queue entry (preserves escape sequences)
      this.inputQueue.push(token);
      console.log(`[XIMIOHandler] Queued token: "${token}" (len=${token.length})`);
    }

    if (!this.waitingForLineInput) {
      console.log(`[XIMIOHandler] Input queue size: ${this.inputQueue.length}`);
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
          console.log(`[XIMIOHandler] Parsed escape sequence: ${JSON.stringify(seq)}`);
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
      `[XIMIOHandler] Waiting for user to type line (max ${maxLen} chars), pausing emulator`
    );
    this.emulator.pause();
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

    console.log('[XIMIOHandler] Line input completed, resuming emulator');
    this.emulator.resume();
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

    // Use door-specific pagination setting (PAGINATION tooltype)
    // If autoPauseEnabled=true, XIM will pause after pauseLines
    // If autoPauseEnabled=false (default), door handles its own pagination
    const bytesWritten = this.emitText(text, addNewline, true, this.state.autoPauseEnabled, msg);

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
   *
   * IMPORTANT: Doors control their own line endings by:
   * 1. Setting msg.data=0 for text WITHOUT newline (e.g., partial line, prompt)
   * 2. Setting msg.data=1 for text WITH newline (or sending empty string with data=1)
   *
   * Example: Bulls sends ASCII art as:
   *   "line content" (data=0) + "_" (data=0) + "" (data=1) <- newline only at end
   *
   * We MUST trust msg.data - overriding it causes double newlines.
   */
  handleSendMessage(msg: XIMMessage): void {
    const text = this.getMessageString(msg);

    // express.e:3406-3411: IF msg.data THEN aePuts('\b\n')
    // Trust msg.data exactly - doors control their own line endings
    const shouldAddNewline = msg.data !== 0;

    // DEBUG: Show hex bytes if string contains control characters
    const hasControlChars = /[\x00-\x1f]/.test(text);
    const hexBytes = hasControlChars ? ' hex=' + Array.from(text.slice(0, 20)).map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join(' ') : '';
    console.log(`[XIMIOHandler] JH_SM: "${text.substring(0, 40)}${text.length > 40 ? '...' : ''}" (msg.data=${msg.data}, addNewline=${shouldAddNewline})${hexBytes}`);

    // Use door-specific pagination setting (PAGINATION tooltype)
    // Most doors handle their own pagination (e.g. AquaScan shows "More? (Y/n/ns)")
    // but doors with PAGINATION tooltype set will use XIM auto-pause
    this.emitText(text, shouldAddNewline, true, this.state.autoPauseEnabled, msg);

    this.reply(msg, 1);
  }

  /**
   * Handle JH_SMPTR (Send Message via Pointer)
   * From E sources (express.e:3412-3417)
   *
   * Like JH_SM but uses msg.strptr instead of msg.string embedded buffer.
   * This allows doors to pass longer strings via a separate memory pointer.
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

    console.log(`[XIMIOHandler] JH_SMPTR: "${text.substring(0, 40)}${text.length > 40 ? '...' : ''}" (msg.data=${msg.data}, addNewline=${shouldAddNewline})`);

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
      this.emitText(prompt, false, false, false, msg);
    }

    console.log(
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
    // Single character - return as-is
    if (token.length === 1) {
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
      console.log(`[XIMIOHandler] Arrow key: ${JSON.stringify(token)} -> code ${arrowCode}`);
      return String.fromCharCode(arrowCode);
    }

    // For other escape sequences, return just first char
    // (shouldn't happen in normal operation, but be safe)
    if (token.length > 1) {
      console.log(`[XIMIOHandler] Multi-char token, returning first: ${token.charCodeAt(0)}`);
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

    console.log('[XIMIOHandler] JH_HK: Hotkey input request');
    this.state.lineCount = 0;

    if (this.state.carrierDropped) {
      this.reply(msg, -1, '');
      return;
    }

    // Express.e (line 3438): aePuts(msg.string) - display prompt before reading input
    if (prompt.length > 0) {
      console.log(`[XIMIOHandler] JH_HK: Displaying prompt: "${prompt}"`);
      this.emitText(prompt, false, false, false, msg);
    }

    if (this.inputQueue.length > 0) {
      const token = this.inputQueue.shift()!;
      const keyData = this.processHotkeyToken(token);

      this.messageParser.writeCommand(msg.msgAddr, this.getXimPort());
      const keyCode = keyData.charCodeAt(0);
      const keyName = keyCode === 13 ? 'ENTER' : keyCode === 4 ? 'UP' : keyCode === 5 ? 'DOWN' : keyCode === 2 ? 'LEFT' : keyCode === 3 ? 'RIGHT' : `char '${keyData}'`;
      console.log(`[XIMIOHandler] JH_HK: Got key code ${keyCode} (0x${keyCode.toString(16)}) = ${keyName}`);
      this.reply(msg, 1, keyData);
      return;
    }

    // No input available - pause emulator and wait for user input
    console.log('[XIMIOHandler] JH_HK: No input available, pausing emulator');
    this.waitingForHotkey = true;
    this.hotkeyMessage = msg;
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

    const msg = this.hotkeyMessage;
    const keyData = this.processHotkeyToken(char);

    const keyCode = keyData.charCodeAt(0);
    const keyName = keyCode === 13 ? 'ENTER' : keyCode === 4 ? 'UP' : keyCode === 5 ? 'DOWN' : keyCode === 2 ? 'LEFT' : keyCode === 3 ? 'RIGHT' : `char '${keyData}'`;

    console.log('========================================');
    console.log(`[XIMIOHandler] JH_HK COMPLETE:`);
    console.log(`  Input char: ${JSON.stringify(char)} (charCode=${char.charCodeAt(0)})`);
    console.log(`  Processed keyData: ${JSON.stringify(keyData)} (charCode=${keyCode})`);
    console.log(`  Key name: ${keyName}`);
    console.log(`  Data reply: ${this.state.carrierDropped ? -1 : 1}`);
    console.log('========================================');

    this.messageParser.writeCommand(msg.msgAddr, this.getXimPort());
    this.reply(msg, this.state.carrierDropped ? -1 : 1, keyData);

    this.waitingForHotkey = false;
    this.hotkeyMessage = null;

    // Resume emulator execution now that we have input
    console.log('[XIMIOHandler] JH_HK: Resuming emulator');
    this.emulator.resume();
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
      case 9: // User line length (screen height in lines, NOT character width)
        // express.e:4462: doormsg.data:=userLineLen
        // userLineLen = number of lines on screen for pagination
        resultData = bbsSession.pauseLines || bbsSession.user?.linesPerScreen || bbsSession.user?.pageLength || 24;
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
    // Prepend any buffered content from previous incomplete ANSI sequence
    // RTW and other doors may split ESC[34m across multiple JH_SM calls
    const hadBuffer = this.ansiBuffer.length > 0;
    let fullText = this.ansiBuffer + text;
    if (hadBuffer) {
      console.log(`[emitText] Prepending buffered ANSI: "${this.ansiBuffer.replace(/\x1b/g, 'ESC')}" to text starting with "${text.substring(0, 10).replace(/\x1b/g, 'ESC')}..."`);
    }
    this.ansiBuffer = '';

    // Convert Amiga CSI (0x9B) to standard ANSI ESC+[ (0x1B 0x5B)
    // Amiga uses a single-byte CSI character for ANSI codes, but modern terminals
    // expect the two-byte ESC+[ sequence. Without this conversion, colors appear
    // as "[36m" instead of actual colored text.
    let converted = fullText.replace(/\x9b/g, '\x1b[');

    // Convert bare ANSI sequences (without ESC prefix) to proper ANSI
    // Some Amiga doors output bare "[32m" sequences without ESC prefix,
    // relying on Amiga console.device's ability to accept these directly.
    // For proper terminal output, we need to add the ESC prefix.
    // Pattern: [ followed by optional params (digits/semicolons/?) and command letter
    // Examples: [32m -> ESC[32m, [0m -> ESC[0m, [2J -> ESC[2J, [1;33m -> ESC[1;33m
    // Only convert if not already preceded by ESC
    converted = converted.replace(/(?<!\x1b)\[(\d*(?:;\d*)*[?]?[A-Za-z])/g, '\x1b[$1');

    // Check for incomplete ANSI escape sequence at end of text
    // CSI format: ESC [ (params) (letter) where letter terminates the sequence
    // If we end mid-sequence, buffer it for the next message
    const incompleteAnsiMatch = converted.match(/\x1b(\[[\d;?]*)?$/);
    if (incompleteAnsiMatch) {
      // Store the incomplete sequence and remove from current output
      this.ansiBuffer = incompleteAnsiMatch[0];
      converted = converted.slice(0, -this.ansiBuffer.length);
      console.log(`[emitText] Buffering incomplete ANSI: "${this.ansiBuffer.replace(/\x1b/g, 'ESC')}" (${this.ansiBuffer.length} chars)`);
      // If nothing left to emit after buffering, return early
      if (converted.length === 0) {
        console.log(`[emitText] Nothing left to emit after buffering, returning early`);
        return 0;
      }
    }

    // Normalize CRLF to LF, but DON'T convert standalone CR to LF!
    // RTW and other doors use \r (carriage return) to move cursor to column 0
    // for in-place updates. Converting \r to \n would cause double line breaks.
    let normalized = converted.replace(/\r\n/g, '\n');

    // CRITICAL: Only add newline if text doesn't already end with one
    // Some doors send data=1 with a string that already contains a trailing \n
    // Adding another would cause double line breaks (RTW does this)
    //
    // NOTE: express.e:3406-3411 does aePuts('\b\n') - backspace+newline.
    // We skip the backspace as it's typically a no-op when at start of line.
    const alreadyHasNewline = normalized.endsWith('\n');
    if (addNewline && !alreadyHasNewline) {
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
        // DEBUG: Log first 50 chars of what we're actually emitting
        if (output.length > 0 && output.length < 200) {
          const displayOutput = output.replace(/\x1b/g, 'ESC').replace(/\r/g, '\\r').replace(/\n/g, '\\n');
          console.log(`[emitText] EMIT: "${displayOutput}"`);
        }
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
   * Properly handles:
   * - Tab characters (expand to next 8-column tab stop)
   * - ANSI escape sequences (don't count toward visible width)
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
      // Handle ANSI escape sequences (don't count toward visible width)
      if (line[i] === '\x1b') {
        const remainder = line.slice(i);
        const escMatch = remainder.match(/^\x1b\[[0-9;]*[A-Za-z]/);
        if (escMatch) {
          current += escMatch[0];
          i += escMatch[0].length;
          continue;
        }
      }

      // Handle tab characters - expand to next 8-column tab stop
      if (line[i] === '\t') {
        const tabWidth = 8 - (visibleCount % 8);
        // Check if tab would cause overflow
        if (visibleCount + tabWidth > width) {
          flushCurrent();
        }
        current += line[i];
        visibleCount += tabWidth;
        i += 1;
        if (visibleCount >= width) {
          flushCurrent();
        }
        continue;
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
      const content = amigafs.readFileSync(filePath, 'utf-8') as string;

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
    // CRITICAL: Always set strPtr before replying - doors dereference it
    const stringAddr = msg.msgAddr + DoorConstants.MESSAGE_STRING_OFFSET;
    this.messageParser.writeStringPointer(msg.msgAddr, stringAddr);
    this.messageParser.writeFiller1(msg.msgAddr, stringAddr);
    this.messageParser.writeFiller2(msg.msgAddr, stringAddr);

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
