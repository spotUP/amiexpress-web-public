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
  // These are the ACTUAL addresses that the trap handler receives when doors call library functions
  // ExecBase is at 0xFF8000, so negative offsets from there result in these addresses
  //
  // From test trace: Door called JSR -552(A6) with A6=0xFF8000 → 0xFF7DD8
  // So -552 (0xFFFFFDD8) with base 0xFF8000 = 0xFF7DD8
  //
  // Standard Amiga library convention: functions at multiples of 6
  // Let's map common offsets (we'll discover the actual ones through testing)

  private readonly EXEC_BASE = 0xFF8000;  // ExecBase address we use

  // CRITICAL: Map actual addresses, not offsets!
  // When door calls JSR -552(A6), trap handler receives 0xFF8000 - 552 = 0xFF7DD8
  private readonly FUNC_AEPUTS = 0xFF7DD8;        // Offset -552 - Output string (discovered in test!)
  private readonly FUNC_AEGETS = 0xFF7DCE;        // Offset -562 - Input line (guess)
  private readonly FUNC_AEPUTCH = 0xFF7DC4;       // Offset -572 - Output char (guess)
  private readonly FUNC_AEGETCH = 0xFF7DBA;       // Offset -582 - Input char (guess)
  private readonly FUNC_AECLEARSCREEN = 0xFF7DB0; // Offset -592 - Clear screen (guess)
  private readonly FUNC_AEGETUSER = 0xFF7DA6;     // Offset -602 - Get user info (guess)

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
   * Check A0, A1, A2 to find the string pointer (calling convention may vary)
   * Returns: void
   */
  private aePuts(): boolean {
    const a0 = this.emulator.getRegister(CPURegister.A0);
    const a1 = this.emulator.getRegister(CPURegister.A1);
    const a2 = this.emulator.getRegister(CPURegister.A2);
    const stackPtr = this.emulator.getRegister(CPURegister.A7); // SP

    console.log(`[AmiExpress] aePuts() called:`);
    console.log(`  A0=0x${a0.toString(16)}, A1=0x${a1.toString(16)}, A2=0x${a2.toString(16)}, SP=0x${stackPtr.toString(16)}`);

    // Try A1 first (LEA instruction loads into A1 before call)
    let stringPtr = a1;
    if (stringPtr === 0 || stringPtr < 0x1000) {
      // Try A0
      stringPtr = a0;
      if (stringPtr === 0 || stringPtr < 0x1000) {
        // Try A2
        stringPtr = a2;
        if (stringPtr === 0 || stringPtr < 0x1000) {
          console.warn('[AmiExpress] aePuts() called with null/invalid pointer in A0/A1/A2');
          return true;
        }
      }
    }

    console.log(`[AmiExpress] Using string pointer: 0x${stringPtr.toString(16)}`);

    try {
      // DEBUG: Read first 16 bytes from memory to see what's there
      const debugBytes: number[] = [];
      for (let i = 0; i < 16; i++) {
        const byte = this.emulator.readMemory(stringPtr + i);
        debugBytes.push(byte);
      }
      console.log(`[AmiExpress] Memory at 0x${stringPtr.toString(16)}: [${debugBytes.map(b => `0x${b.toString(16).padStart(2, '0')}`).join(', ')}]`);
      console.log(`[AmiExpress] Memory as ASCII: "${debugBytes.map(b => (b >= 32 && b < 127) ? String.fromCharCode(b) : '.').join('')}"`);

      // Check what's in the DATA segment (0x3900-0x3A78)
      console.log('[AmiExpress] Checking DATA segment at 0x3900:');
      const dataBytes: number[] = [];
      for (let i = 0; i < 64; i++) {
        dataBytes.push(this.emulator.readMemory(0x3900 + i));
      }
      console.log(`[AmiExpress] DATA at 0x3900 (hex): [${dataBytes.slice(0, 16).map(b => `0x${b.toString(16).padStart(2, '0')}`).join(', ')}]`);
      console.log(`[AmiExpress] DATA at 0x3900 (ASCII): "${dataBytes.map(b => (b >= 32 && b < 127) ? String.fromCharCode(b) : '.').join('')}"`);

      // Check if this looks like a pointer (first 4 bytes form an address)
      if (debugBytes.length >= 4) {
        const possiblePtr = (debugBytes[0] << 24) | (debugBytes[1] << 16) | (debugBytes[2] << 8) | debugBytes[3];
        if (possiblePtr > 0x1000 && possiblePtr < 0x100000) {
          console.log(`[AmiExpress] First 4 bytes look like pointer: 0x${possiblePtr.toString(16)}`);
          // Read 32 bytes from that address to see if there's a string there
          const derefBytes: number[] = [];
          for (let i = 0; i < 32; i++) {
            derefBytes.push(this.emulator.readMemory(possiblePtr + i));
          }
          console.log(`[AmiExpress] Memory at dereferenced addr 0x${possiblePtr.toString(16)}: [${derefBytes.map(b => `0x${b.toString(16).padStart(2, '0')}`).join(', ')}]`);
          console.log(`[AmiExpress] Dereferenced as ASCII: "${derefBytes.map(b => (b >= 32 && b < 127) ? String.fromCharCode(b) : '.').join('')}"`);
        }
      }

      // CRITICAL: Check if stringPtr is actually within valid segment ranges
      const inCodeSegment = (stringPtr >= 0x1000 && stringPtr < 0x38E8);
      const inDataSegment = (stringPtr >= 0x3900 && stringPtr < 0x3A78);
      console.log(`[AmiExpress] String pointer 0x${stringPtr.toString(16)} is in CODE: ${inCodeSegment}, DATA: ${inDataSegment}`);

      if (!inCodeSegment && !inDataSegment) {
        console.warn(`[AmiExpress] ⚠️ String pointer 0x${stringPtr.toString(16)} is OUTSIDE all loaded segments!`);
        console.warn(`[AmiExpress]    CODE: 0x1000-0x38E8, DATA: 0x3900-0x3A78`);
      }

      // Read string from memory
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
   * Helper: Read string from memory
   * Supports both C-style null-terminated strings and BCPL/AmigaDOS BSTR format
   */
  private readString(address: number, maxLength: number = 1024): string {
    if (address === 0) return '';

    // ALWAYS try C-style null-terminated string first (most common in door code)
    let result = '';
    let offset = 0;
    let hasNullTerminator = false;

    while (offset < maxLength) {
      const byte = this.emulator.readMemory(address + offset);
      if (byte === 0) {
        hasNullTerminator = true;
        break;
      }
      // Accept printable characters and common whitespace
      if (byte >= 32 || byte === 10 || byte === 13 || byte === 9) {
        result += String.fromCharCode(byte);
      }
      offset++;
    }

    // If we found a null-terminated string, return it
    if (result.length > 0 && hasNullTerminator) {
      console.log(`[AmiExpress] Read C-string: "${result}"`);
      return result;
    }

    // If C-string didn't work, try BSTR (BCPL string - first byte is length)
    const firstByte = this.emulator.readMemory(address);
    if (firstByte > 0 && firstByte < 128) {
      const bstrLength = firstByte;
      let bstrResult = '';
      for (let i = 0; i < bstrLength && i < maxLength; i++) {
        const byte = this.emulator.readMemory(address + 1 + i);
        if (byte === 0) break;
        if (byte >= 32 || byte === 10 || byte === 13 || byte === 9) {
          bstrResult += String.fromCharCode(byte);
        }
      }
      if (bstrResult.length > 0) {
        console.log(`[AmiExpress] Read BSTR: length=${bstrLength}, content="${bstrResult}"`);
        return bstrResult;
      }
    }

    // Return whatever we got (may be empty)
    return result;
  }
}
