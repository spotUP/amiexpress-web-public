import { MoiraEmulator, CPURegister } from '../cpu/MoiraEmulator';

/**
 * dos.library - Amiga DOS Library
 * Provides file I/O, console I/O, and file system operations
 *
 * Function offsets (negative values):
 * -30 = Open
 * -36 = Close
 * -42 = Read
 * -48 = Write
 * -54 = Input (get stdin handle)
 * -60 = Output (get stdout handle)
 * -132 = IoErr (get last error code)
 * -192 = DateStamp (get current date/time)
 * -198 = Delay (delay execution)
 * -204 = WaitForChar (wait for character input with timeout)
 */

interface FileHandle {
  id: number;
  name: string;
  mode: string;
  position: number;
  isConsole: boolean;
}

export class DosLibrary {
  private emulator: MoiraEmulator;
  private openFiles: Map<number, FileHandle> = new Map();
  private nextFileId: number = 100;
  private outputCallback: ((data: string) => void) | null = null;
  private inputBuffer: string = '';
  private lastError: number = 0;

  // Standard file handles
  private readonly STDIN_HANDLE = 1;
  private readonly STDOUT_HANDLE = 2;
  private readonly STDERR_HANDLE = 3;

  // DOS error codes
  private readonly ERROR_NO_ERROR = 0;
  private readonly ERROR_OBJECT_NOT_FOUND = 205;
  private readonly ERROR_OBJECT_IN_USE = 202;
  private readonly ERROR_NO_FREE_STORE = 103;

  constructor(emulator: MoiraEmulator) {
    this.emulator = emulator;

    // Initialize standard I/O handles
    this.openFiles.set(this.STDIN_HANDLE, {
      id: this.STDIN_HANDLE,
      name: 'STDIN',
      mode: 'r',
      position: 0,
      isConsole: true
    });

    this.openFiles.set(this.STDOUT_HANDLE, {
      id: this.STDOUT_HANDLE,
      name: 'STDOUT',
      mode: 'w',
      position: 0,
      isConsole: true
    });

    this.openFiles.set(this.STDERR_HANDLE, {
      id: this.STDERR_HANDLE,
      name: 'STDERR',
      mode: 'w',
      position: 0,
      isConsole: true
    });
  }

  /**
   * Set callback for stdout/stderr output
   */
  setOutputCallback(callback: (data: string) => void): void {
    this.outputCallback = callback;
  }

  /**
   * Queue input data from user
   */
  queueInput(data: string): void {
    this.inputBuffer += data;
  }

  /**
   * Open - Open a file
   * D1 = filename (pointer to BCPL string or C string)
   * D2 = access mode (MODE_OLDFILE=1005, MODE_NEWFILE=1006)
   * Returns: D0 = file handle (or 0 if failed)
   */
  Open(): void {
    const namePtr = this.emulator.getRegister(CPURegister.D1);
    const mode = this.emulator.getRegister(CPURegister.D2);

    const filename = this.readString(namePtr);

    console.log(`[dos.library] Open(filename="${filename}", mode=${mode})`);

    // For now, we only support console I/O
    let fileId = 0;

    if (filename === '*' || filename === 'CONSOLE:' || filename === 'CON:') {
      // Console handle
      fileId = this.STDOUT_HANDLE;
      this.lastError = this.ERROR_NO_ERROR;
    } else {
      console.warn(`[dos.library] Open: File system not implemented, file="${filename}"`);
      fileId = 0;
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
    }

    this.emulator.setRegister(CPURegister.D0, fileId);
    console.log(`[dos.library] Open returned: ${fileId}`);
  }

  /**
   * Close - Close a file
   * D1 = file handle
   */
  Close(): void {
    const handle = this.emulator.getRegister(CPURegister.D1);

    console.log(`[dos.library] Close(handle=${handle})`);

    // Don't actually close standard handles
    if (handle > 3) {
      this.openFiles.delete(handle);
    }
  }

  /**
   * Read - Read from a file
   * D1 = file handle
   * D2 = buffer address
   * D3 = length
   * Returns: D0 = actual length read (or -1 on error)
   */
  Read(): void {
    const handle = this.emulator.getRegister(CPURegister.D1);
    const bufferAddr = this.emulator.getRegister(CPURegister.D2);
    const length = this.emulator.getRegister(CPURegister.D3);

    console.log(`[dos.library] Read(handle=${handle}, buffer=0x${bufferAddr.toString(16)}, length=${length})`);

    if (handle === this.STDIN_HANDLE) {
      // Read from input buffer
      const bytesToRead = Math.min(length, this.inputBuffer.length);

      for (let i = 0; i < bytesToRead; i++) {
        this.emulator.writeMemory(bufferAddr + i, this.inputBuffer.charCodeAt(i));
      }

      // Remove read data from buffer
      this.inputBuffer = this.inputBuffer.substring(bytesToRead);

      this.lastError = this.ERROR_NO_ERROR;
      this.emulator.setRegister(CPURegister.D0, bytesToRead);
      console.log(`[dos.library] Read returned: ${bytesToRead} bytes`);
    } else {
      console.warn(`[dos.library] Read: File system not implemented`);
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
      this.emulator.setRegister(CPURegister.D0, -1);
    }
  }

  /**
   * Write - Write to a file
   * D1 = file handle
   * D2 = buffer address
   * D3 = length
   * Returns: D0 = actual length written (or -1 on error)
   */
  Write(): void {
    const handle = this.emulator.getRegister(CPURegister.D1);
    const bufferAddr = this.emulator.getRegister(CPURegister.D2);
    const length = this.emulator.getRegister(CPURegister.D3);

    console.log(`[dos.library] Write(handle=${handle}, buffer=0x${bufferAddr.toString(16)}, length=${length})`);

    if (handle === this.STDOUT_HANDLE || handle === this.STDERR_HANDLE) {
      // Read data from emulated memory
      const bytes: number[] = [];
      for (let i = 0; i < length; i++) {
        bytes.push(this.emulator.readMemory(bufferAddr + i));
      }

      const text = String.fromCharCode(...bytes);
      console.log(`[dos.library] Write output: "${text}"`);

      // Send to output callback
      if (this.outputCallback) {
        this.outputCallback(text);
      }

      this.lastError = this.ERROR_NO_ERROR;
      this.emulator.setRegister(CPURegister.D0, length);
    } else {
      console.warn(`[dos.library] Write: File system not implemented`);
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
      this.emulator.setRegister(CPURegister.D0, -1);
    }
  }

  /**
   * Input - Get standard input file handle
   * Returns: D0 = stdin handle
   */
  Input(): void {
    console.log(`[dos.library] Input()`);
    this.emulator.setRegister(CPURegister.D0, this.STDIN_HANDLE);
  }

  /**
   * Output - Get standard output file handle
   * Returns: D0 = stdout handle
   */
  Output(): void {
    console.log(`[dos.library] Output()`);
    this.emulator.setRegister(CPURegister.D0, this.STDOUT_HANDLE);
  }

  /**
   * IoErr - Get last DOS error code
   * Returns: D0 = error code
   */
  IoErr(): void {
    console.log(`[dos.library] IoErr() returning ${this.lastError}`);
    this.emulator.setRegister(CPURegister.D0, this.lastError);
  }

  /**
   * DateStamp - Get current date/time
   * D1 = pointer to DateStamp structure (3 longs: days, minutes, ticks)
   * Returns: D0 = pointer to DateStamp (same as input)
   *
   * DateStamp structure:
   * - ds_Days: days since Jan 1, 1978
   * - ds_Minute: minutes past midnight (0-1439)
   * - ds_Tick: ticks past minute (0-2999, 50 ticks/sec)
   */
  DateStamp(): void {
    const dateStampPtr = this.emulator.getRegister(CPURegister.D1);

    // Get current time
    const now = new Date();

    // Calculate days since Jan 1, 1978
    const epoch = new Date('1978-01-01T00:00:00Z');
    const daysSinceEpoch = Math.floor((now.getTime() - epoch.getTime()) / (1000 * 60 * 60 * 24));

    // Calculate minutes past midnight
    const minutesPastMidnight = now.getHours() * 60 + now.getMinutes();

    // Calculate ticks past minute (50 ticks/sec)
    const ticksPastMinute = now.getSeconds() * 50 + Math.floor(now.getMilliseconds() / 20);

    console.log(`[dos.library] DateStamp() days=${daysSinceEpoch}, minutes=${minutesPastMidnight}, ticks=${ticksPastMinute}`);

    // Write DateStamp structure (3 x 32-bit longs, big-endian)
    this.writeLong(dateStampPtr, daysSinceEpoch);
    this.writeLong(dateStampPtr + 4, minutesPastMidnight);
    this.writeLong(dateStampPtr + 8, ticksPastMinute);

    this.emulator.setRegister(CPURegister.D0, dateStampPtr);
  }

  /**
   * Delay - Delay execution for specified ticks
   * D1 = number of ticks to delay (50 ticks = 1 second)
   *
   * Note: In our implementation, we can't actually block,
   * so this is a no-op. Real implementation would need async/await.
   */
  Delay(): void {
    const ticks = this.emulator.getRegister(CPURegister.D1);
    const milliseconds = (ticks / 50) * 1000;

    console.log(`[dos.library] Delay(${ticks} ticks = ${milliseconds}ms) - no-op in sync mode`);

    // In a real async implementation, we would:
    // await new Promise(resolve => setTimeout(resolve, milliseconds));
  }

  /**
   * WaitForChar - Wait for character input with timeout
   * D1 = file handle
   * D2 = timeout in microseconds (0 = no wait, -1 = wait forever)
   * Returns: D0 = -1 if char available, 0 if timeout
   */
  WaitForChar(): void {
    const handle = this.emulator.getRegister(CPURegister.D1);
    const timeout = this.emulator.getRegister(CPURegister.D2);

    console.log(`[dos.library] WaitForChar(handle=${handle}, timeout=${timeout})`);

    if (handle === this.STDIN_HANDLE) {
      // Check if data available in input buffer
      const hasData = this.inputBuffer.length > 0;
      this.emulator.setRegister(CPURegister.D0, hasData ? -1 : 0);
      console.log(`[dos.library] WaitForChar returned: ${hasData ? 'data available' : 'no data'}`);
    } else {
      this.emulator.setRegister(CPURegister.D0, 0);
    }
  }

  /**
   * Helper: Read null-terminated string from memory
   */
  private readString(address: number, maxLen: number = 256): string {
    const bytes: number[] = [];
    for (let i = 0; i < maxLen; i++) {
      const byte = this.emulator.readMemory(address + i);
      if (byte === 0) break;
      bytes.push(byte);
    }
    return String.fromCharCode(...bytes);
  }

  /**
   * Helper: Write 32-bit long to memory (big-endian)
   */
  private writeLong(address: number, value: number): void {
    this.emulator.writeMemory(address, (value >> 24) & 0xFF);
    this.emulator.writeMemory(address + 1, (value >> 16) & 0xFF);
    this.emulator.writeMemory(address + 2, (value >> 8) & 0xFF);
    this.emulator.writeMemory(address + 3, value & 0xFF);
  }

  /**
   * Handle library function call by offset
   */
  handleCall(offset: number): boolean {
    switch (offset) {
      case -30:
        this.Open();
        return true;
      case -36:
        this.Close();
        return true;
      case -42:
        this.Read();
        return true;
      case -48:
        this.Write();
        return true;
      case -54:
        this.Input();
        return true;
      case -60:
        this.Output();
        return true;
      case -132:
        this.IoErr();
        return true;
      case -192:
        this.DateStamp();
        return true;
      case -198:
        this.Delay();
        return true;
      case -204:
        this.WaitForChar();
        return true;
      default:
        return false; // Unknown function
    }
  }
}
