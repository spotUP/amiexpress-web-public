/**
 * XIM I/O Operations
 *
 * Handles input/output operations for the XIM protocol including:
 * - Terminal output (write, console, serial)
 * - Keyboard input (hotkey, line input, getkey)
 * - Input queue management
 */

import { Socket } from 'socket.io';
import { MoiraEmulator } from '../cpu/MoiraEmulator';
import { XIMMessage } from './types';
import { XIMMessageParser } from './messages';
import { ExecLibrary } from '../api/ExecLibrary';

export class XIMIOHandler {
  private emulator: MoiraEmulator;
  private execLibrary: ExecLibrary;
  private socket: Socket;
  private messageParser: XIMMessageParser;
  private inputQueue: string[] = [];

  // Line input state
  private waitingForLineInput: boolean = false;
  private lineInputMessage: XIMMessage | null = null;
  private lineInputBuffer: string = '';

  constructor(
    emulator: MoiraEmulator,
    execLibrary: ExecLibrary,
    socket: Socket,
    messageParser: XIMMessageParser
  ) {
    this.emulator = emulator;
    this.execLibrary = execLibrary;
    this.socket = socket;
    this.messageParser = messageParser;
  }

  /**
   * Check if waiting for line input from user
   */
  isWaitingForLineInput(): boolean {
    return this.waitingForLineInput;
  }

  /**
   * Queue input from terminal for door to read via GETKEY or JH_LI
   * Called from AmigaDoorSession when 'door:input' event received
   */
  queueInput(data: string): void {
    console.log(`[XIMIOHandler] Queuing input: "${data}"`);

    // If waiting for line input, handle specially
    if (this.waitingForLineInput) {
      for (const char of data) {
        if (char === '\r' || char === '\n') {
          // User pressed Enter - complete the line input
          console.log(`[XIMIOHandler] Enter pressed, completing line input: "${this.lineInputBuffer}"`);
          this.completeLineInput();
          return;
        } else if (char === '\b' || char === '\x7f') {
          // Backspace - remove last character
          if (this.lineInputBuffer.length > 0) {
            this.lineInputBuffer = this.lineInputBuffer.slice(0, -1);
            console.log(`[XIMIOHandler] Backspace, buffer now: "${this.lineInputBuffer}"`);
          }
        } else {
          // Normal character - add to buffer
          this.lineInputBuffer += char;
          console.log(`[XIMIOHandler] Character added, buffer now: "${this.lineInputBuffer}"`);
        }
      }
    } else {
      // Not waiting for line input - queue for GETKEY
      for (const char of data) {
        this.inputQueue.push(char);
      }
      console.log(`[XIMIOHandler] Input queue size: ${this.inputQueue.length}`);
    }
  }

  /**
   * Handle line input request (JH_LI)
   * From E sources (express.e:3425)
   */
  handleLineInput(msg: XIMMessage): void {
    const promptAddr = msg.data;

    console.log('[XIMIOHandler] Door requesting line input');

    // Display prompt if provided
    if (promptAddr !== 0) {
      const prompt = this.messageParser.readString(promptAddr);
      if (prompt.length > 0) {
        console.log(`[XIMIOHandler] Prompt: "${prompt}"`);
        this.socket.emit('ansi-output', prompt);
      }
    }

    // Don't reply immediately - wait for user to type line and press Enter
    console.log('[XIMIOHandler] Waiting for user to type line and press Enter...');
    this.waitingForLineInput = true;
    this.lineInputMessage = msg;
    this.lineInputBuffer = '';
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
    const stringAddr = this.emulator.readMemory32(msg.msgAddr + 22 + 4);

    console.log(`[XIMIOHandler] Completing line input with: "${this.lineInputBuffer}"`);

    if (stringAddr !== 0) {
      // Write the buffered line to memory
      for (let i = 0; i < this.lineInputBuffer.length; i++) {
        this.emulator.writeMemory(stringAddr + i, this.lineInputBuffer.charCodeAt(i));
      }
      // Null terminate
      this.emulator.writeMemory(stringAddr + this.lineInputBuffer.length, 0);

      console.log(`[XIMIOHandler] Wrote ${this.lineInputBuffer.length} characters to memory at 0x${stringAddr.toString(16)}`);
    }

    // Reply with success (1)
    this.sendReply(msg, 1);

    // Reset state
    this.waitingForLineInput = false;
    this.lineInputMessage = null;
    this.lineInputBuffer = '';

    console.log('[XIMIOHandler] Line input completed, waiting for next command');
  }

  /**
   * Handle door write request (JH_WRITE)
   * From E sources (express.e:1085)
   */
  handleWrite(msg: XIMMessage): void {
    const stringAddr = msg.data;
    let text = '';
    let bytesWritten = 0;

    if (stringAddr !== 0) {
      text = this.messageParser.readString(stringAddr);
      console.log('[XIMIOHandler] Door writing to terminal:', JSON.stringify(text));

      console.log(`🔊 [XIM OUTPUT] Emitting ${text.length} chars: "${text.substring(0, 80)}"`);
      this.socket.emit('ansi-output', text);
      bytesWritten = text.length;

      console.log(`[XIMIOHandler] Sent ${bytesWritten} bytes to terminal`);
    }

    this.sendReply(msg, bytesWritten);
  }

  /**
   * Handle keyboard input request (GETKEY)
   * From E sources (express.e:3811)
   */
  handleGetKey(msg: XIMMessage): void {
    const stringAddr = msg.data;

    if (stringAddr === 0) {
      console.log('[XIMIOHandler] GETKEY: No string buffer provided');
      this.sendReply(msg, 0);
      return;
    }

    // Check if we have queued input
    if (this.inputQueue.length > 0) {
      const char = this.inputQueue.shift()!;
      const charCode = char.charCodeAt(0);

      console.log(`[XIMIOHandler] GETKEY: Returning key '${char}' (0x${charCode.toString(16)})`);

      // Write "1<char>\0" to string buffer (E sources format)
      this.emulator.writeMemory(stringAddr, 0x31);      // '1' - key available
      this.emulator.writeMemory(stringAddr + 1, charCode); // the key character
      this.emulator.writeMemory(stringAddr + 2, 0);     // null terminator

      this.sendReply(msg, 1);
    } else {
      console.log('[XIMIOHandler] GETKEY: No input queued');

      // Write "0\0" to string buffer
      this.emulator.writeMemory(stringAddr, 0x30);      // '0' - no key
      this.emulator.writeMemory(stringAddr + 1, 0);     // null terminator

      this.sendReply(msg, 0);
    }
  }

  /**
   * Handle JH_SM (Send Message)
   * From E sources (express.e:3406-3411)
   */
  handleSendMessage(msg: XIMMessage): void {
    const text = msg.string || '';

    console.log(`[XIMIOHandler] JH_SM: "${text}"`);

    if (text) {
      this.socket.emit('ansi-output', text);
    }

    if (msg.data !== 0) {
      this.socket.emit('ansi-output', '\r\n');
      console.log('[XIMIOHandler] JH_SM: Added newline (msg.data non-zero)');
    }

    this.sendReply(msg, 1);
  }

  /**
   * Handle JH_PM (Prompt Message)
   * From E sources (express.e:3418-3424)
   */
  handlePromptMessage(msg: XIMMessage): void {
    const stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
    const maxLength = msg.data;

    console.log('[XIMIOHandler] JH_PM: Prompt message with line input');

    if (stringAddr !== 0) {
      const prompt = this.messageParser.readString(stringAddr);
      if (prompt.length > 0) {
        console.log(`[XIMIOHandler] JH_PM: Prompt: "${prompt}"`);
        this.socket.emit('ansi-output', prompt);
      }
    }

    console.log(`[XIMIOHandler] JH_PM: Waiting for user input (max ${maxLength} chars)...`);
    this.waitingForLineInput = true;
    this.lineInputMessage = msg;
    this.lineInputBuffer = '';
  }

  /**
   * Handle JH_HK (Hotkey)
   * From E sources (express.e:3436-3447)
   */
  handleHotkey(msg: XIMMessage): void {
    const stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);

    console.log('[XIMIOHandler] JH_HK: Hotkey input request');

    if (stringAddr !== 0) {
      const prompt = this.messageParser.readString(stringAddr);
      if (prompt.length > 0) {
        console.log(`[XIMIOHandler] JH_HK: Prompt: "${prompt}"`);
        this.socket.emit('ansi-output', prompt);
      }
    }

    if (this.inputQueue.length > 0) {
      const char = this.inputQueue.shift()!;
      const charCode = char.charCodeAt(0);

      console.log(`[XIMIOHandler] JH_HK: Got hotkey '${char}' (0x${charCode.toString(16)})`);

      if (stringAddr !== 0) {
        this.emulator.writeMemory(stringAddr, charCode);
        this.emulator.writeMemory(stringAddr + 1, 0);
      }

      this.emulator.writeMemory16(msg.msgAddr + 20, 1);
      this.sendReply(msg, 1);
    } else {
      console.log('[XIMIOHandler] JH_HK: No input available (timeout)');
      this.sendReply(msg, -1);
    }
  }

  /**
   * Handle extended hotkey (JH_ExtHK)
   * From E sources (express.e:3432-3435)
   */
  handleExtendedHotkey(msg: XIMMessage): void {
    console.log('[XIMIOHandler] JH_ExtHK - Extended hotkey with signal');

    if (this.inputQueue.length > 0) {
      const char = this.inputQueue.shift()!;
      const charCode = char.charCodeAt(0);

      this.emulator.writeMemory16(msg.msgAddr + 20, charCode);
      this.emulator.writeMemory32(msg.msgAddr + 22, 1);

      console.log(`  [READ] Extended hotkey: '${char}' (code ${charCode})`);
    } else {
      this.emulator.writeMemory16(msg.msgAddr + 20, -1);
      this.emulator.writeMemory32(msg.msgAddr + 22, -1);

      console.log('  [TIMEOUT] No input available');
    }

    this.sendReply(msg, 1);
  }

  /**
   * Handle fetch key (JH_FetchKey)
   * From E sources (express.e:3465-3472)
   */
  handleFetchKey(msg: XIMMessage): void {
    console.log('[XIMIOHandler] JH_FetchKey - Non-blocking key check');

    if (this.inputQueue.length > 0) {
      const char = this.inputQueue.shift()!;
      const charCode = char.charCodeAt(0);

      this.emulator.writeMemory16(msg.msgAddr + 20, charCode);
      this.emulator.writeMemory32(msg.msgAddr + 22, 1);

      console.log(`  [READ] Key available: '${char}' (code ${charCode})`);
    } else {
      this.emulator.writeMemory16(msg.msgAddr + 20, 0);
      this.emulator.writeMemory32(msg.msgAddr + 22, 1);

      console.log('  [NO INPUT] No key available');
    }

    this.sendReply(msg, 1);
  }

  /**
   * Handle quick key (JH_20, QUICK_KEY)
   * From E sources (express.e:3448-3455)
   */
  handleQuickKey(msg: XIMMessage): void {
    console.log('[XIMIOHandler] QUICK_KEY - Quick key input');

    if (this.inputQueue.length > 0) {
      const char = this.inputQueue.shift()!;
      const charCode = char.charCodeAt(0);

      this.emulator.writeMemory32(msg.msgAddr + 22, charCode);
      this.emulator.writeMemory16(msg.msgAddr + 20, 1);

      console.log(`  [READ] Quick key: '${char}' (code ${charCode})`);
    } else {
      this.emulator.writeMemory32(msg.msgAddr + 22, -1);
      this.emulator.writeMemory16(msg.msgAddr + 20, 1);

      console.log('  [TIMEOUT] No input available');
    }

    this.sendReply(msg, 1);
  }

  /**
   * Handle JH_CO (Console Output)
   * From E sources (express.e:3395-3400)
   */
  handleConsoleOutput(msg: XIMMessage): void {
    const stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);

    if (stringAddr === 0) {
      console.log('[XIMIOHandler] JH_CO: No string address provided');
      this.sendReply(msg, 0);
      return;
    }

    const text = this.messageParser.readString(stringAddr);
    this.socket.emit('ansi-output', text);

    if (msg.data !== 0) {
      this.socket.emit('ansi-output', '\r\n');
      console.log('[XIMIOHandler] JH_CO: Added newline');
    }

    this.sendReply(msg, 1);
  }

  /**
   * Handle JH_SO (Serial Output)
   * From E sources (express.e:3401-3405)
   */
  handleSerialOutput(msg: XIMMessage): void {
    const stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);

    if (stringAddr === 0) {
      console.log('[XIMIOHandler] JH_SO: No string address provided');
      this.sendReply(msg, 0);
      return;
    }

    const text = this.messageParser.readString(stringAddr);
    console.log(`[XIMIOHandler] JH_SO (Serial): "${text}"`);

    this.socket.emit('ansi-output', text);

    if (msg.data !== 0) {
      this.socket.emit('ansi-output', '\r\n');
      console.log('[XIMIOHandler] JH_SO: Added newline');
    }

    this.sendReply(msg, 1);
  }

  /**
   * Send reply to door via ReplyMsg
   */
  private sendReply(msg: XIMMessage, data: number): void {
    console.log('[XIMIOHandler] Sending reply to door:');
    console.log(`  Message: 0x${msg.msgAddr.toString(16)}`);
    console.log(`  Data: ${data}`);

    this.emulator.writeMemory32(msg.msgAddr + 22, data);
    this.execLibrary.replyMsg(msg.msgAddr);

    console.log('[XIMIOHandler] Reply sent via ReplyMsg');
  }
}
