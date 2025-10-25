import { MoiraEmulator, CPURegister } from '../cpu/MoiraEmulator';

/**
 * AmiExpress BBS Library
 * Handles BBS-specific I/O and utility functions for doors
 *
 * This implements the AmiExpress BBS API that doors use for terminal I/O,
 * user information, file operations, etc.
 */

export class AmiExpressLibrary {
  private emulator: MoiraEmulator;
  private outputCallback: ((data: string) => void) | null = null;
  private inputQueue: string[] = [];

  // AmiExpress library function offsets
  // These are custom BBS functions, not standard AmigaDOS
  private readonly AMIEXPRESS_BASE = 0xff0000;
  private readonly FUNC_AEPUTS = 0xff0000;      // aePuts() - Write string to terminal
  private readonly FUNC_AEGETS = 0xff0002;      // aeGets() - Read line from terminal
  private readonly FUNC_AEPUTCH = 0xff0004;     // aePutCh() - Write single character
  private readonly FUNC_AEGETCH = 0xff0006;     // aeGetCh() - Read single character
  private readonly FUNC_AECLEARSCREEN = 0xff0008; // Clear screen
  private readonly FUNC_AEGETUSER = 0xff000a;   // Get user information

  constructor(emulator: MoiraEmulator) {
    this.emulator = emulator;
    console.log('[AmiExpress Library] Initialized');
  }

  /**
   * Set callback for terminal output
   */
  setOutputCallback(callback: (data: string) => void): void {
    this.outputCallback = callback;
  }

  /**
   * Queue input from user
   */
  queueInput(data: string): void {
    this.inputQueue.push(data);
    console.log(`[AmiExpress Library] Input queued: "${data}"`);
  }

  /**
   * Handle library call
   */
  handleCall(offset: number): boolean {
    console.log(`[AmiExpress Library] Checking offset: 0x${offset.toString(16)}`);

    switch (offset) {
      case this.FUNC_AEPUTS:
        return this.aePuts();

      case this.FUNC_AEGETS:
        return this.aeGets();

      case this.FUNC_AEPUTCH:
        return this.aePutCh();

      case this.FUNC_AEGETCH:
        return this.aeGetCh();

      case this.FUNC_AECLEARSCREEN:
        return this.aeClearScreen();

      case this.FUNC_AEGETUSER:
        return this.aeGetUser();

      default:
        return false;
    }
  }

  /**
   * aePuts() - Write string to terminal
   * A0 = Pointer to null-terminated string
   * Returns: void
   */
  private aePuts(): boolean {
    const stringPtr = this.emulator.getRegister(CPURegister.A0);
    console.log(`[AmiExpress] aePuts() called, string at: 0x${stringPtr.toString(16)}`);

    if (stringPtr === 0) {
      console.warn('[AmiExpress] aePuts() called with null pointer');
      return true;
    }

    try {
      // Read null-terminated string from memory
      const text = this.readString(stringPtr);
      console.log(`[AmiExpress] aePuts() output: "${text}"`);

      // Send to terminal
      if (this.outputCallback) {
        this.outputCallback(text);
      }
    } catch (error) {
      console.error('[AmiExpress] aePuts() error:', error);
    }

    return true;
  }

  /**
   * aeGets() - Read line from terminal
   * A0 = Buffer pointer
   * D0 = Max length
   * Returns: D0 = length read, -1 on error
   */
  private aeGets(): boolean {
    const bufferPtr = this.emulator.getRegister(CPURegister.A0);
    const maxLength = this.emulator.getRegister(CPURegister.D0);

    console.log(`[AmiExpress] aeGets() called, buffer at: 0x${bufferPtr.toString(16)}, maxlen: ${maxLength}`);

    if (this.inputQueue.length === 0) {
      // No input available, return 0 (non-blocking)
      this.emulator.setRegister(CPURegister.D0, 0);
      console.log('[AmiExpress] aeGets() no input available');
      return true;
    }

    try {
      const input = this.inputQueue.shift()!;
      const length = Math.min(input.length, maxLength - 1);

      // Write input to buffer
      for (let i = 0; i < length; i++) {
        this.emulator.writeMemory(bufferPtr + i, input.charCodeAt(i));
      }
      // Null terminate
      this.emulator.writeMemory(bufferPtr + length, 0);

      // Return length
      this.emulator.setRegister(CPURegister.D0, length);
      console.log(`[AmiExpress] aeGets() returned: "${input}" (${length} bytes)`);
    } catch (error) {
      console.error('[AmiExpress] aeGets() error:', error);
      this.emulator.setRegister(CPURegister.D0, -1);
    }

    return true;
  }

  /**
   * aePutCh() - Write single character
   * D0 = Character code
   */
  private aePutCh(): boolean {
    const charCode = this.emulator.getRegister(CPURegister.D0) & 0xFF;
    console.log(`[AmiExpress] aePutCh() called: 0x${charCode.toString(16)} ('${String.fromCharCode(charCode)}')`);

    if (this.outputCallback) {
      this.outputCallback(String.fromCharCode(charCode));
    }

    return true;
  }

  /**
   * aeGetCh() - Read single character (non-blocking)
   * Returns: D0 = character code, -1 if no input
   */
  private aeGetCh(): boolean {
    console.log('[AmiExpress] aeGetCh() called');

    if (this.inputQueue.length === 0) {
      this.emulator.setRegister(CPURegister.D0, -1);
      console.log('[AmiExpress] aeGetCh() no input available');
      return true;
    }

    const input = this.inputQueue.shift()!;
    const charCode = input.charCodeAt(0);

    // Put remaining characters back in queue
    if (input.length > 1) {
      this.inputQueue.unshift(input.substring(1));
    }

    this.emulator.setRegister(CPURegister.D0, charCode);
    console.log(`[AmiExpress] aeGetCh() returned: 0x${charCode.toString(16)} ('${String.fromCharCode(charCode)}')`);

    return true;
  }

  /**
   * aeClearScreen() - Clear terminal screen
   */
  private aeClearScreen(): boolean {
    console.log('[AmiExpress] aeClearScreen() called');

    if (this.outputCallback) {
      // Send ANSI clear screen sequence
      this.outputCallback('\x1b[2J\x1b[H');
    }

    return true;
  }

  /**
   * aeGetUser() - Get user information
   * Returns: A0 = pointer to user structure (stub)
   */
  private aeGetUser(): boolean {
    console.log('[AmiExpress] aeGetUser() called (stub)');

    // Return null pointer for now (stub)
    this.emulator.setRegister(CPURegister.A0, 0);

    return true;
  }

  /**
   * Helper: Read null-terminated string from memory
   */
  private readString(address: number, maxLength: number = 1024): string {
    let result = '';
    let offset = 0;

    while (offset < maxLength) {
      const byte = this.emulator.readMemory(address + offset);
      if (byte === 0) break;
      result += String.fromCharCode(byte);
      offset++;
    }

    return result;
  }
}
