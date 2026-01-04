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
  private outputRawCallback: ((data: Buffer) => void) | null = null;
  private inputQueue: string[] = [];
  private rawInputQueue: Buffer[] = [];
  private session: any; // Session data from BBS

  // AEDoor.library interface structure
  private difacePointer: number = 0;  // Pointer to door interface structure
  private stringBufferPointer: number = 0;  // Pointer to shared string buffer
  private readonly STRING_BUFFER_SIZE = 512;

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
  private readonly AEDOOR_BASE = 0xFF4000; // AEDoor.library base

  // AEDoor.library high-level function offsets (standard Amiga library convention)
  // Functions start at offset -30 and go down by 6 each
  private readonly LF = 1;     // Linefeed mode for WriteStr
  private readonly NOLF = 0;   // No linefeed mode

  // CRITICAL: Map actual addresses, not offsets!
  // When door calls JSR -552(A6), trap handler receives 0xFF8000 - 552 = 0xFF7DD8
  private readonly FUNC_AEPUTS = 0xFF7DD8;        // Offset -552 - Output string (discovered in test!)
  private readonly FUNC_AEGETS = 0xFF7DCE;        // Offset -562 - Input line (guess)
  private readonly FUNC_AEPUTCH = 0xFF7DC4;       // Offset -572 - Output char (guess)
  private readonly FUNC_AEGETCH = 0xFF7DBA;       // Offset -582 - Input char (guess)
  private readonly FUNC_AECLEARSCREEN = 0xFF7DB0; // Offset -592 - Clear screen (guess)
  private readonly FUNC_AEGETUSER = 0xFF7DA6;     // Offset -602 - Get user info (guess)

  constructor(emulator: MoiraEmulator, session?: any) {
    this.emulator = emulator;
    this.session = session || { user: { username: 'Guest', location: 'Unknown' } };
console.log('[AmiExpress Library] Initialized');
  }

  /**
   * Set callback for terminal output
   */
  setOutputCallback(callback: (data: string) => void): void {
    this.outputCallback = callback;
  }

  setOutputRawCallback(callback: (data: Buffer) => void): void {
    this.outputRawCallback = callback;
  }

  /**
   * Queue input from user
   */
  queueInput(data: string | Buffer): void {
    if (Buffer.isBuffer(data)) {
      this.rawInputQueue.push(data);
      this.inputQueue.push(data.toString('latin1'));
console.log(`[AmiExpress Library] Raw input queued: <buffer ${data.length}>`);
    } else {
      this.inputQueue.push(data);
console.log(`[AmiExpress Library] Input queued: "${data}"`);
    }
  }

  /**
   * Handle library call
   */
  handleCall(offset: number): boolean {
console.log(`[AmiExpress Library] Checking offset: 0x${offset.toString(16)} (decimal: ${offset})`);

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

      // DISCOVERED OFFSETS from AquaWho door testing (2025-10-30)
      // Pattern: -16657, -16655, 0xFF0000, 0xFF0002 repeating
      // Door calls 4 different offsets in sequence - they're likely DIFFERENT functions

      case 0xFF0000:    // 16711680 - Maybe WriteChar
console.log(`[AmiExpress Library] Offset 0xFF0000 - treating as NOP (return success)`);
        return true;  // Just return success, don't output

      case 0xFF0001:    // 16711681 - Discovered during door testing
console.log(`[AmiExpress Library] Offset 0xFF0001 - treating as NOP (return success)`);
        return true;  // Just return success

      case 0xFF0002:    // 16711682 - Maybe another function
console.log(`[AmiExpress Library] Offset 0xFF0002 - treating as NOP (return success)`);
        return true;  // Just return success

      case 0xFF0003:    // 16711683 - Discovered during door testing
console.log(`[AmiExpress Library] Offset 0xFF0003 - treating as NOP (return success)`);
        return true;  // Just return success

      case 0xFF0005:    // 16711685 - Another discovered offset
console.log(`[AmiExpress Library] Offset 0xFF0005 - treating as NOP (return success)`);
        return true;  // Just return success

      // Additional offsets discovered during door testing - batch add
      case 16743716:    // 0xFF7D04
      case 16743718:    // 0xFF7D06
      case 16743898:    // 0xFF7DDA
      case 16744034:    // 0xFF7E62
      case 16744036:    // 0xFF7E64
      case 16744142:    // 0xFF7ECE
      case 16744144:    // 0xFF7ED0
console.log(`[AmiExpress Library] Offset ${offset} (0x${offset.toString(16)}) - treating as NOP (return success)`);
        this.emulator.setRegister(CPURegister.D0, 0);  // Return 0 for success
        return true;

      case -28:
console.log(`[AmiExpress Library] Offset -28 - treating as NOP (return success)`);
        this.emulator.setRegister(CPURegister.D0, 0);
        return true;

      case -16655:      // 0xFFFFBEF1 - ReadChar (non-blocking)
console.log(`[AmiExpress Library] Offset -16655 - calling aeGetCh()`);
        return this.aeGetCh();

      case -16657:      // 0xFFFFBEEF - CheckInput (returns chars available)
        const charsAvailable = this.inputQueue.length > 0 ? 1 : 0;
console.log(`[AmiExpress Library] Offset -16657 - CheckInput returns ${charsAvailable}`);
        this.emulator.setRegister(CPURegister.D0, charsAvailable);
        return true;

      // HIGH-LEVEL AEDoor.library functions (2025-10-30)
      case -30:         // CreateComm - Initialize door interface
console.log('[AEDoor.library] CreateComm() called');
        return this.CreateComm();

      case -36:         // DeleteComm - Cleanup door interface
console.log('[AEDoor.library] DeleteComm() called');
        return this.DeleteComm();

      case -72:         // GetString - Get string buffer pointer
console.log('[AEDoor.library] GetString() called');
        return this.GetString();

      case -84:         // WriteStr - Output text with optional linefeed
console.log('[AEDoor.library] WriteStr() called');
        return this.WriteStr();

      case -108:        // GetDT - Get user/system data
console.log('[AEDoor.library] GetDT() called');
        return this.GetDT();

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

      // Read string from memory as raw bytes
      const bytes: number[] = [];
      for (let i = 0; i < 0x1000; i++) {
        const b = this.emulator.readMemory(stringPtr + i);
        if (b === 0) break;
        bytes.push(b);
      }
      const rawBuf = Buffer.from(bytes);
      const text = rawBuf.toString('latin1');
console.log(`[AmiExpress] aePuts() output: "${text}"`);

      // Send to terminal (raw preferred)
      if (this.outputRawCallback) {
        this.outputRawCallback(rawBuf);
      } else if (this.outputCallback) {
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

    // Get ALL registers to understand calling convention
    const d0 = this.emulator.getRegister(CPURegister.D0);
    const d1 = this.emulator.getRegister(CPURegister.D1);
    const a0 = this.emulator.getRegister(CPURegister.A0);
    const a1 = this.emulator.getRegister(CPURegister.A1);
    const a6 = this.emulator.getRegister(CPURegister.A6);
    const pc = this.emulator.getRegister(CPURegister.PC);

console.log(`[AmiExpress] aePutCh() called:`);
console.log(`  Char: 0x${charCode.toString(16)} ('${String.fromCharCode(charCode)}')`);
console.log(`  D0=0x${d0.toString(16)}, D1=0x${d1.toString(16)}`);
console.log(`  A0=0x${a0.toString(16)}, A1=0x${a1.toString(16)}, A6=0x${a6.toString(16)}`);
console.log(`  PC=0x${pc.toString(16)}`);

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
   * Returns: A0 = pointer to user structure
   *
   * User structure (simplified):
   * +0: username (30 bytes, null-terminated)
   * +30: location (30 bytes, null-terminated)
   * +60: security level (4 bytes, long)
   * +64: time limit (4 bytes, long)
   * Total: 68 bytes
   */
  private aeGetUser(): boolean {
console.log('[AmiExpress] aeGetUser() called');

    // Allocate user structure in memory (use area after string buffer)
    const USER_STRUCT_ADDR = this.stringBufferPointer + this.STRING_BUFFER_SIZE + 256;
    const userStructSize = 68;

    // Clear structure
    for (let i = 0; i < userStructSize; i++) {
      this.emulator.writeMemory(USER_STRUCT_ADDR + i, 0);
    }

    // Get user data from session
    const username = this.session?.user?.username || 'Guest';
    const location = this.session?.user?.location || 'Unknown';
    const secLevel = this.session?.user?.secLevel || 30;
    const timeLimit = this.session?.user?.timeLimit || -1;

    // Write username (max 29 chars + null)
    for (let i = 0; i < Math.min(username.length, 29); i++) {
      this.emulator.writeMemory(USER_STRUCT_ADDR + i, username.charCodeAt(i));
    }

    // Write location (max 29 chars + null)
    for (let i = 0; i < Math.min(location.length, 29); i++) {
      this.emulator.writeMemory(USER_STRUCT_ADDR + 30 + i, location.charCodeAt(i));
    }

    // Write security level (big-endian long)
    this.emulator.writeMemory32(USER_STRUCT_ADDR + 60, secLevel);

    // Write time limit (big-endian long)
    this.emulator.writeMemory32(USER_STRUCT_ADDR + 64, timeLimit);

console.log(
      `[AmiExpress] aeGetUser: username="${username}", location="${location}", ` +
      `secLevel=${secLevel}, timeLimit=${timeLimit}`
    );

    // Return pointer to structure
    this.emulator.setRegister(CPURegister.A0, USER_STRUCT_ADDR);
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

  // ========================================================================
  // HIGH-LEVEL AEDoor.library FUNCTIONS (2025-10-30)
  // ========================================================================

  /**
   * CreateComm - Initialize door communication interface
   * Parameters: A0 = node string pointer (e.g., "0", "1", "2")
   * Returns: D0 = interface pointer (diface)
   *
   * This allocates a communication interface structure in emulated memory
   * and returns a pointer that the door will use for all subsequent calls.
   */
  private CreateComm(): boolean {
    const nodeStringPtr = this.emulator.getRegister(CPURegister.A0);

console.log('[AEDoor.library] CreateComm() initializing door interface');
console.log(`  Node string pointer: 0x${nodeStringPtr.toString(16)}`);

    // Read node number (usually passed as argv[1])
    let nodeStr = '';
    if (nodeStringPtr > 0 && nodeStringPtr < 0x100000) {
      try {
        nodeStr = this.readString(nodeStringPtr);
console.log(`  Node number: "${nodeStr}"`);
      } catch (e) {
console.warn('  Could not read node string, using default');
      }
    }

    // Allocate interface structure at a fixed address (simplified)
    // In real implementation, would allocate via exec.library AllocMem
    // Must be outside door code range (0x1000-0x80000)
    this.difacePointer = 0x098000;  // After Task structure at 0x090000
console.log(`  Allocated interface at: 0x${this.difacePointer.toString(16)}`);

    // Initialize interface structure fields (simplified)
    // Real structure would have many fields, we'll add them as needed

    // Return interface pointer in D0
    this.emulator.setRegister(CPURegister.D0, this.difacePointer);
console.log(`[AEDoor.library] CreateComm() returned: 0x${this.difacePointer.toString(16)}`);

    return true;
  }

  /**
   * DeleteComm - Cleanup door communication interface
   * Parameters: D0 = interface pointer (diface)
   * Returns: void
   *
   * Frees the interface structure and cleans up resources.
   */
  private DeleteComm(): boolean {
    const difacePtr = this.emulator.getRegister(CPURegister.D0);

console.log('[AEDoor.library] DeleteComm() cleaning up door interface');
console.log(`  Interface pointer: 0x${difacePtr.toString(16)}`);

    // Cleanup (simplified - in real implementation would free memory)
    this.difacePointer = 0;
    this.stringBufferPointer = 0;

console.log('[AEDoor.library] DeleteComm() complete');
    return true;
  }

  /**
   * GetString - Get pointer to shared string buffer
   * Parameters: D0 = interface pointer (diface)
   * Returns: D0 = string buffer pointer
   *
   * Returns a pointer to a buffer where GetDT() and other functions
   * store their string results. The door copies from this buffer
   * to its own storage.
   */
  private GetString(): boolean {
    const difacePtr = this.emulator.getRegister(CPURegister.D0);

console.log('[AEDoor.library] GetString() getting string buffer pointer');
console.log(`  Interface pointer: 0x${difacePtr.toString(16)}`);

    // Allocate string buffer if not already allocated
    if (this.stringBufferPointer === 0) {
      this.stringBufferPointer = 0x10200;  // Fixed address after interface
console.log(`  Allocated string buffer at: 0x${this.stringBufferPointer.toString(16)}`);
    }

    // Return buffer pointer in D0
    this.emulator.setRegister(CPURegister.D0, this.stringBufferPointer);
console.log(`[AEDoor.library] GetString() returned: 0x${this.stringBufferPointer.toString(16)}`);

    return true;
  }

  /**
   * WriteStr - Write string to terminal
   * Parameters:
   *   D0 = interface pointer (diface)
   *   A0 = string pointer
   *   D1 = mode (LF=1 for linefeed, NOLF=0 for no linefeed)
   * Returns: void
   *
   * This is the high-level output function that wraps our low-level aePuts().
   */
  private WriteStr(): boolean {
    const difacePtr = this.emulator.getRegister(CPURegister.D0);
    const stringPtr = this.emulator.getRegister(CPURegister.A0);
    const mode = this.emulator.getRegister(CPURegister.D1);

console.log('[AEDoor.library] WriteStr() called');
console.log(`  Interface: 0x${difacePtr.toString(16)}`);
console.log(`  String ptr: 0x${stringPtr.toString(16)}`);
console.log(`  Mode: ${mode} (${mode === this.LF ? 'LF' : 'NOLF'})`);

    if (stringPtr === 0 || stringPtr < 0x1000) {
console.warn('[AEDoor.library] WriteStr() invalid string pointer');
      return true;
    }

    try {
      // Read string from memory
      const text = this.readString(stringPtr);
console.log(`[AEDoor.library] WriteStr() output: "${text}"`);

      // Send to terminal via outputCallback
      if (this.outputCallback) {
        this.outputCallback(text);

        // Add linefeed if LF mode
        if (mode === this.LF) {
          this.outputCallback('\r\n');
        }
      }
    } catch (error) {
console.error('[AEDoor.library] WriteStr() error:', error);
    }

    return true;
  }

  /**
   * GetDT - Get user/system data
   * Parameters:
   *   D0 = interface pointer (diface)
   *   D1 = data type constant (DT_NAME, DT_LOCATION, etc.)
   *   A0 = destination string pointer (or 0 to use string buffer)
   * Returns: void (result stored in destination or string buffer)
   *
   * Data type constants (from aedoor.m):
   * DT_NAME = 100, DT_PASSWORD = 101, DT_LOCATION = 102,
   * DT_PHONENUMBER = 103, DT_SLOTNUMBER = 104, etc.
   */
  private GetDT(): boolean {
    const difacePtr = this.emulator.getRegister(CPURegister.D0);
    const dataType = this.emulator.getRegister(CPURegister.D1);
    const destPtr = this.emulator.getRegister(CPURegister.A0);

console.log('[AEDoor.library] GetDT() called');
console.log(`  Interface: 0x${difacePtr.toString(16)}`);
console.log(`  Data type: ${dataType}`);
console.log(`  Dest ptr: 0x${destPtr.toString(16)}`);

    // Determine destination address (use string buffer if destPtr is 0)
    const targetAddr = destPtr || this.stringBufferPointer;
console.log(`  Target address: 0x${targetAddr.toString(16)}`);

    // Get data value based on type
    let value = '';
    switch (dataType) {
      case 100:  // DT_NAME
        value = this.session?.user?.username || 'Guest';
console.log(`  DT_NAME: "${value}"`);
        break;

      case 102:  // DT_LOCATION
        value = this.session?.user?.location || 'Unknown';
console.log(`  DT_LOCATION: "${value}"`);
        break;

      case 103:  // DT_PHONENUMBER
        value = this.session?.user?.phoneNumber || 'N/A';
console.log(`  DT_PHONENUMBER: "${value}"`);
        break;

      case 104:  // DT_SLOTNUMBER
        value = String(this.session?.user?.slotNumber || 1);
console.log(`  DT_SLOTNUMBER: "${value}"`);
        break;

      case 115:  // DT_TIMELIMIT
        value = String(this.session?.user?.timeLimit || 60);
console.log(`  DT_TIMELIMIT: "${value}"`);
        break;

      default:
        value = '';
console.log(`  Unknown data type ${dataType}, returning empty string`);
        break;
    }

    // Write value to target address
    if (targetAddr > 0 && targetAddr < 0x100000) {
      try {
        this.writeString(targetAddr, value);
console.log(`  Wrote "${value}" to 0x${targetAddr.toString(16)}`);
      } catch (error) {
console.error('[AEDoor.library] GetDT() write error:', error);
      }
    }

    return true;
  }

  /**
   * Helper: Write null-terminated string to memory
   */
  private writeString(address: number, text: string): void {
    for (let i = 0; i < text.length && i < 255; i++) {
      this.emulator.writeMemory(address + i, text.charCodeAt(i));
    }
    // Null terminator
    this.emulator.writeMemory(address + text.length, 0);
  }
}
