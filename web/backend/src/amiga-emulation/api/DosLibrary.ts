import { MoiraEmulator, CPURegister } from '../cpu/MoiraEmulator';

/**
 * dos.library - Amiga DOS Library
 * Provides file I/O, console I/O, and file system operations
 *
 * Complete function offset table (all negative from library base):
 * -30 = Open          -36 = Close         -42 = Read          -48 = Write
 * -54 = Input         -60 = Output        -66 = Seek          -72 = DeleteFile
 * -78 = Rename        -84 = Lock          -90 = UnLock        -96 = DupLock
 * -102 = Examine      -108 = ExNext       -114 = Info         -120 = CreateDir
 * -126 = CurrentDir   -132 = IoErr        -138 = CreateProc   -144 = Exit
 * -150 = LoadSeg      -156 = UnLoadSeg    -162 = DeviceProc   -168 = SetComment
 * -174 = SetProtection -180 = DateStamp   -186 = Delay        -192 = WaitForChar
 * -198 = ParentDir    -204 = IsInteractive -210 = Execute
 *
 * IMPORTANT: Standard dos.library uses -192/-198/-204 for DateStamp/Delay/WaitForChar
 * This table may have older/alternate offsets - doors use standard offsets
 *
 * Note: Some doors may also use undocumented/private offsets
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

    // For now, we only support console I/O and NIL:
    let fileId = 0;

    if (filename === '*' || filename === 'CONSOLE:' || filename === 'CON:') {
      // Console handle
      fileId = this.STDOUT_HANDLE;
      this.lastError = this.ERROR_NO_ERROR;
    } else if (filename === 'NIL:' || filename === 'NIL') {
      // NIL: device (like /dev/null) - return a dummy handle that discards output
      fileId = 99;  // Use handle 99 for NIL: device
      this.lastError = this.ERROR_NO_ERROR;
      console.log(`[dos.library] Open: NIL: device opened (handle ${fileId})`);
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
    const pc = this.emulator.getRegister(16); // Program counter
    const sp = this.emulator.getRegister(15); // Stack pointer
    console.log(`[dos.library] Output() called from PC=0x${pc.toString(16)}, SP=0x${sp.toString(16)}`);
    console.log(`  Returning file handle ${this.STDOUT_HANDLE} in D0`);
    this.emulator.setRegister(CPURegister.D0, this.STDOUT_HANDLE);

    // Read return address from stack to see where door will go next
    const retAddr0 = this.emulator.readMemory(sp);
    const retAddr1 = this.emulator.readMemory(sp + 1);
    const retAddr2 = this.emulator.readMemory(sp + 2);
    const retAddr3 = this.emulator.readMemory(sp + 3);
    const returnAddr = (retAddr0 << 24) | (retAddr1 << 16) | (retAddr2 << 8) | retAddr3;
    console.log(`  Door will return to address: 0x${returnAddr.toString(16)}`);
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
   * Implementation: Sets delayUntil timestamp that execution loop checks
   */
  Delay(): void {
    const ticks = this.emulator.getRegister(CPURegister.D1);
    const milliseconds = (ticks / 50) * 1000;

    console.log(`[dos.library] Delay(${ticks} ticks = ${milliseconds}ms)`);

    // Set delay expiration time
    this.delayUntil = Date.now() + milliseconds;
    console.log(`[dos.library] Execution will pause until ${new Date(this.delayUntil).toISOString()}`);
  }

  // Track when delay should end
  private delayUntil: number = 0;

  // Check if execution should be delayed
  isDelayed(): boolean {
    if (this.delayUntil > 0 && Date.now() < this.delayUntil) {
      return true;
    }
    if (this.delayUntil > 0 && Date.now() >= this.delayUntil) {
      console.log(`[dos.library] Delay completed, resuming execution`);
      this.delayUntil = 0;
    }
    return false;
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
   * Seek - Change file position
   * D1 = file handle
   * D2 = position (signed 32-bit offset)
   * D3 = mode (OFFSET_BEGINNING=-1, OFFSET_CURRENT=0, OFFSET_END=1)
   * Returns: D0 = old position (or -1 on error)
   */
  Seek(): void {
    const handle = this.emulator.getRegister(CPURegister.D1);
    const position = this.emulator.getRegister(CPURegister.D2);
    const mode = this.emulator.getRegister(CPURegister.D3);

    console.log(`[dos.library] Seek(handle=${handle}, position=${position}, mode=${mode}) - STUB`);

    // For console handles, seeking doesn't make sense - return error
    if (handle <= 3) {
      this.emulator.setRegister(CPURegister.D0, -1);
      this.lastError = this.ERROR_OBJECT_IN_USE;
    } else {
      // Stub: return success with position 0
      this.emulator.setRegister(CPURegister.D0, 0);
      this.lastError = this.ERROR_NO_ERROR;
    }
  }

  /**
   * DeleteFile - Delete a file
   * D1 = filename (pointer to null-terminated string)
   * Returns: D0 = success (DOSTRUE=-1, DOSFALSE=0)
   */
  DeleteFile(): void {
    const namePtr = this.emulator.getRegister(CPURegister.D1);
    const filename = this.readString(namePtr);

    console.log(`[dos.library] DeleteFile("${filename}") - STUB, returning success`);

    // Stub: always return success
    this.emulator.setRegister(CPURegister.D0, -1);
    this.lastError = this.ERROR_NO_ERROR;
  }

  /**
   * Rename - Rename a file
   * D1 = old filename
   * D2 = new filename
   * Returns: D0 = success (DOSTRUE=-1, DOSFALSE=0)
   */
  Rename(): void {
    const oldNamePtr = this.emulator.getRegister(CPURegister.D1);
    const newNamePtr = this.emulator.getRegister(CPURegister.D2);
    const oldName = this.readString(oldNamePtr);
    const newName = this.readString(newNamePtr);

    console.log(`[dos.library] Rename("${oldName}", "${newName}") - STUB, returning success`);

    // Stub: always return success
    this.emulator.setRegister(CPURegister.D0, -1);
    this.lastError = this.ERROR_NO_ERROR;
  }

  /**
   * Lock - Obtain a lock on a file or directory
   * D1 = name (pointer to null-terminated string)
   * D2 = access mode (ACCESS_READ=-2, ACCESS_WRITE=-1)
   * Returns: D0 = lock (or 0 on failure)
   */
  Lock(): void {
    const namePtr = this.emulator.getRegister(CPURegister.D1);
    const mode = this.emulator.getRegister(CPURegister.D2);
    const name = this.readString(namePtr);

    console.log(`[dos.library] Lock("${name}", mode=${mode}) - STUB, returning fake lock`);

    // Return a fake lock value (non-zero)
    this.emulator.setRegister(CPURegister.D0, 0x1000);
    this.lastError = this.ERROR_NO_ERROR;
  }

  /**
   * UnLock - Release a lock
   * D1 = lock
   */
  UnLock(): void {
    const lock = this.emulator.getRegister(CPURegister.D1);

    console.log(`[dos.library] UnLock(lock=0x${lock.toString(16)}) - STUB`);

    // Nothing to do for stub
    this.lastError = this.ERROR_NO_ERROR;
  }

  /**
   * DupLock - Duplicate a lock
   * D1 = lock to duplicate
   * Returns: D0 = new lock (or 0 on failure)
   */
  DupLock(): void {
    const lock = this.emulator.getRegister(CPURegister.D1);

    console.log(`[dos.library] DupLock(lock=0x${lock.toString(16)}) - STUB, returning same lock`);

    // Return the same lock value
    this.emulator.setRegister(CPURegister.D0, lock);
    this.lastError = this.ERROR_NO_ERROR;
  }

  /**
   * Examine - Get information about a file/directory
   * D1 = lock
   * D2 = FileInfoBlock pointer
   * Returns: D0 = success (DOSTRUE=-1, DOSFALSE=0)
   */
  Examine(): void {
    const lock = this.emulator.getRegister(CPURegister.D1);
    const fibPtr = this.emulator.getRegister(CPURegister.D2);

    console.log(`[dos.library] Examine(lock=0x${lock.toString(16)}, fib=0x${fibPtr.toString(16)}) - STUB`);

    // Stub: fill in minimal FileInfoBlock structure
    // Clear the structure (260 bytes)
    for (let i = 0; i < 260; i++) {
      this.emulator.writeMemory(fibPtr + i, 0);
    }

    this.emulator.setRegister(CPURegister.D0, -1);
    this.lastError = this.ERROR_NO_ERROR;
  }

  /**
   * ExNext - Get next directory entry
   * D1 = lock
   * D2 = FileInfoBlock pointer
   * Returns: D0 = success (DOSTRUE=-1, DOSFALSE=0)
   */
  ExNext(): void {
    const lock = this.emulator.getRegister(CPURegister.D1);
    const fibPtr = this.emulator.getRegister(CPURegister.D2);

    console.log(`[dos.library] ExNext(lock=0x${lock.toString(16)}, fib=0x${fibPtr.toString(16)}) - STUB, returning no more entries`);

    // Stub: return no more entries
    this.emulator.setRegister(CPURegister.D0, 0);
    this.lastError = this.ERROR_NO_ERROR;
  }

  /**
   * Info - Get information about a volume
   * D1 = lock
   * D2 = InfoData pointer
   * Returns: D0 = success (DOSTRUE=-1, DOSFALSE=0)
   */
  Info(): void {
    const lock = this.emulator.getRegister(CPURegister.D1);
    const infoPtr = this.emulator.getRegister(CPURegister.D2);

    console.log(`[dos.library] Info(lock=0x${lock.toString(16)}, info=0x${infoPtr.toString(16)}) - STUB`);

    // Stub: fill in minimal InfoData structure
    for (let i = 0; i < 36; i++) {
      this.emulator.writeMemory(infoPtr + i, 0);
    }

    this.emulator.setRegister(CPURegister.D0, -1);
    this.lastError = this.ERROR_NO_ERROR;
  }

  /**
   * CreateDir - Create a directory
   * D1 = name (pointer to null-terminated string)
   * Returns: D0 = lock on new directory (or 0 on failure)
   */
  CreateDir(): void {
    const namePtr = this.emulator.getRegister(CPURegister.D1);
    const name = this.readString(namePtr);

    console.log(`[dos.library] CreateDir("${name}") - STUB, returning fake lock`);

    // Return a fake lock value
    this.emulator.setRegister(CPURegister.D0, 0x2000);
    this.lastError = this.ERROR_NO_ERROR;
  }

  /**
   * CurrentDir - Change/get current directory
   * D1 = lock (or 0 to get current)
   * Returns: D0 = old directory lock
   */
  CurrentDir(): void {
    const lock = this.emulator.getRegister(CPURegister.D1);

    console.log(`[dos.library] CurrentDir(lock=0x${lock.toString(16)}) - STUB`);

    // Return a fake "previous directory" lock
    this.emulator.setRegister(CPURegister.D0, 0x3000);
    this.lastError = this.ERROR_NO_ERROR;
  }

  /**
   * CreateProc - Create a new process
   * D1 = name
   * D2 = priority
   * D3 = segList
   * D4 = stackSize
   * Returns: D0 = MsgPort pointer (or 0 on failure)
   */
  CreateProc(): void {
    const namePtr = this.emulator.getRegister(CPURegister.D1);
    const name = this.readString(namePtr);

    console.log(`[dos.library] CreateProc("${name}") - STUB, returning NULL`);

    // Stub: not supported
    this.emulator.setRegister(CPURegister.D0, 0);
    this.lastError = this.ERROR_NO_FREE_STORE;
  }

  /**
   * Exit - Exit program with return code
   * D1 = return code
   */
  Exit(): void {
    const returnCode = this.emulator.getRegister(CPURegister.D1);

    console.log(`[dos.library] Exit(returnCode=${returnCode})`);

    // Just log it - don't actually exit
  }

  /**
   * LoadSeg - Load an executable file
   * D1 = name
   * Returns: D0 = segList (or 0 on failure)
   */
  LoadSeg(): void {
    const namePtr = this.emulator.getRegister(CPURegister.D1);
    const name = this.readString(namePtr);

    console.log(`[dos.library] LoadSeg("${name}") - STUB, returning NULL`);

    // Stub: not supported
    this.emulator.setRegister(CPURegister.D0, 0);
    this.lastError = this.ERROR_OBJECT_NOT_FOUND;
  }

  /**
   * UnLoadSeg - Unload a segment list
   * D1 = segList
   * Returns: D0 = success (DOSTRUE=-1, DOSFALSE=0)
   */
  UnLoadSeg(): void {
    const segList = this.emulator.getRegister(CPURegister.D1);

    console.log(`[dos.library] UnLoadSeg(segList=0x${segList.toString(16)}) - STUB`);

    this.emulator.setRegister(CPURegister.D0, -1);
    this.lastError = this.ERROR_NO_ERROR;
  }

  /**
   * DeviceProc - Get handler process for a device
   * D1 = name
   * Returns: D0 = MsgPort pointer (or 0 on failure)
   */
  DeviceProc(): void {
    const namePtr = this.emulator.getRegister(CPURegister.D1);
    const name = this.readString(namePtr);

    console.log(`[dos.library] DeviceProc("${name}") - STUB, returning fake MsgPort`);

    // Return fake MsgPort address
    this.emulator.setRegister(CPURegister.D0, 0x4000);
    this.lastError = this.ERROR_NO_ERROR;
  }

  /**
   * SetComment - Set file comment
   * D1 = name
   * D2 = comment
   * Returns: D0 = success (DOSTRUE=-1, DOSFALSE=0)
   */
  SetComment(): void {
    const namePtr = this.emulator.getRegister(CPURegister.D1);
    const commentPtr = this.emulator.getRegister(CPURegister.D2);
    const name = this.readString(namePtr);
    const comment = commentPtr ? this.readString(commentPtr) : '';

    console.log(`[dos.library] SetComment("${name}", "${comment}") - STUB`);

    this.emulator.setRegister(CPURegister.D0, -1);
    this.lastError = this.ERROR_NO_ERROR;
  }

  /**
   * SetProtection - Set file protection bits
   * D1 = name
   * D2 = protection bits
   * Returns: D0 = success (DOSTRUE=-1, DOSFALSE=0)
   */
  SetProtection(): void {
    const namePtr = this.emulator.getRegister(CPURegister.D1);
    const protect = this.emulator.getRegister(CPURegister.D2);
    const name = this.readString(namePtr);

    console.log(`[dos.library] SetProtection("${name}", 0x${protect.toString(16)}) - STUB`);

    this.emulator.setRegister(CPURegister.D0, -1);
    this.lastError = this.ERROR_NO_ERROR;
  }

  /**
   * ParentDir - Get parent directory lock
   * D1 = lock
   * Returns: D0 = parent lock (or 0 if none)
   */
  ParentDir(): void {
    const lock = this.emulator.getRegister(CPURegister.D1);

    console.log(`[dos.library] ParentDir(lock=0x${lock.toString(16)}) - STUB`);

    // Return 0 (no parent - we're at root)
    this.emulator.setRegister(CPURegister.D0, 0);
    this.lastError = this.ERROR_NO_ERROR;
  }

  /**
   * IsInteractive - Check if file handle is interactive
   * D1 = file handle
   * Returns: D0 = TRUE (-1) if interactive, FALSE (0) if not
   */
  IsInteractive(): void {
    const handle = this.emulator.getRegister(CPURegister.D1);

    console.log(`[dos.library] IsInteractive(handle=${handle})`);

    // Console handles (1,2,3) are interactive
    if (handle >= 1 && handle <= 3) {
      this.emulator.setRegister(CPURegister.D0, -1);
    } else {
      this.emulator.setRegister(CPURegister.D0, 0);
    }
    this.lastError = this.ERROR_NO_ERROR;
  }

  /**
   * Execute - Execute a command
   * D1 = command name
   * D2 = input file handle
   * D3 = output file handle
   * Returns: D0 = success (DOSTRUE=-1, DOSFALSE=0)
   */
  Execute(): void {
    const namePtr = this.emulator.getRegister(CPURegister.D1);
    const name = this.readString(namePtr);

    console.log(`[dos.library] Execute("${name}") - STUB, returning failure`);

    // Stub: not supported
    this.emulator.setRegister(CPURegister.D0, 0);
    this.lastError = this.ERROR_OBJECT_NOT_FOUND;
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
   *
   * NOTE: Offset -28 does NOT exist in standard dos.library!
   * If door is calling -28, it may be a calculation error.
   * Adding stub handler to catch it.
   */
  handleCall(offset: number): boolean {
    // SPECIAL: Handle non-standard offset -28 that some doors call
    if (offset === -28) {
      console.log(`[dos.library] WARNING: Offset -28 is NOT a standard dos.library function!`);
      console.log(`[dos.library] This may indicate an offset calculation error.`);
      console.log(`[dos.library] Returning success anyway to let door proceed.`);
      this.emulator.setRegister(CPURegister.D0, -1); // Return success
      return true;
    }

    switch (offset) {
      // File operations
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
      case -66:
        this.Seek();
        return true;
      case -72:
        this.DeleteFile();
        return true;
      case -78:
        this.Rename();
        return true;

      // Console I/O
      case -54:
        this.Input();
        return true;
      case -60:
        this.Output();
        return true;

      // File/directory locking
      case -84:
        this.Lock();
        return true;
      case -90:
        this.UnLock();
        return true;
      case -96:
        this.DupLock();
        return true;

      // File/directory information
      case -102:
        this.Examine();
        return true;
      case -108:
        this.ExNext();
        return true;
      case -114:
        this.Info();
        return true;

      // Directory operations
      case -120:
        this.CreateDir();
        return true;
      case -126:
        this.CurrentDir();
        return true;

      // Error handling
      case -132:
        this.IoErr();
        return true;

      // Process management
      case -138:
        this.CreateProc();
        return true;
      case -144:
        this.Exit();
        return true;

      // Segment loading
      case -150:
        this.LoadSeg();
        return true;
      case -156:
        this.UnLoadSeg();
        return true;

      // Device/handler
      case -162:
        this.DeviceProc();
        return true;

      // File attributes
      case -168:
        this.SetComment();
        return true;
      case -174:
        this.SetProtection();
        return true;

      // Date/time (STANDARD Amiga offsets from Amiga include files)
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
