import { MoiraEmulator, CPURegister } from '../cpu/MoiraEmulator';
import * as fs from 'fs';
import * as path from 'path';

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

// Amiga DOS mode constants (from dos/dos.h)
const MODE_OLDFILE = 1005;    // Open existing file for reading
const MODE_NEWFILE = 1006;    // Create new file or overwrite existing
const MODE_READWRITE = 1004;  // Open existing file for read/write

// Seek modes (from dos/dos.h)
const OFFSET_BEGINNING = -1;  // Seek from start of file
const OFFSET_CURRENT = 0;     // Seek from current position
const OFFSET_END = 1;         // Seek from end of file

interface FileHandle {
  id: number;
  name: string;
  mode: number;          // MODE_OLDFILE, MODE_NEWFILE, etc.
  position: number;
  isConsole: boolean;
  buffer?: Buffer;       // File contents in memory
  realPath?: string;     // Actual filesystem path
}

interface Lock {
  id: number;
  path: string;          // Real filesystem path
  mode: number;          // ACCESS_READ=-2, ACCESS_WRITE=-1
}

export class DosLibrary {
  private emulator: MoiraEmulator;
  private openFiles: Map<number, FileHandle> = new Map();
  private nextFileId: number = 4;  // Start after STDIN/STDOUT/STDERR
  private outputCallback: ((data: string) => void) | null = null;
  private inputBuffer: string = '';
  private lastError: number = 0;

  // Standard file handles
  private readonly STDIN_HANDLE = 1;
  private readonly STDOUT_HANDLE = 2;
  private readonly STDERR_HANDLE = 3;
  private readonly NIL_HANDLE = 99;  // Special handle for NIL: device

  // DOS error codes
  private readonly ERROR_NO_ERROR = 0;
  private readonly ERROR_OBJECT_NOT_FOUND = 205;
  private readonly ERROR_OBJECT_IN_USE = 202;
  private readonly ERROR_NO_FREE_STORE = 103;
  private readonly ERROR_READ_PROTECTED = 204;
  private readonly ERROR_WRITE_PROTECTED = 214;
  private readonly ERROR_NO_MORE_ENTRIES = 232;

  // Base path for BBS: logical device
  private readonly BBS_BASE_PATH = '~/Code/amiexpress-web';

  // Directory and lock management for door support
  private currentDirectory: string = this.BBS_BASE_PATH;
  private doorDirectory: string = '';  // Set by AmigaDoorSession for PROGDIR: device
  private locks: Map<number, Lock> = new Map();
  private nextLockId: number = 1;

  // Directory iteration for ExNext()
  private dirIterators: Map<number, string[]> = new Map();
  private dirIteratorIndex: Map<number, number> = new Map();

  constructor(emulator: MoiraEmulator) {
    this.emulator = emulator;

    // Initialize standard I/O handles
    this.openFiles.set(this.STDIN_HANDLE, {
      id: this.STDIN_HANDLE,
      name: 'STDIN',
      mode: MODE_OLDFILE,
      position: 0,
      isConsole: true
    });

    this.openFiles.set(this.STDOUT_HANDLE, {
      id: this.STDOUT_HANDLE,
      name: 'STDOUT',
      mode: MODE_NEWFILE,
      position: 0,
      isConsole: true
    });

    this.openFiles.set(this.STDERR_HANDLE, {
      id: this.STDERR_HANDLE,
      name: 'STDERR',
      mode: MODE_NEWFILE,
      position: 0,
      isConsole: true
    });

    // NIL: device (like /dev/null)
    this.openFiles.set(this.NIL_HANDLE, {
      id: this.NIL_HANDLE,
      name: 'NIL:',
      mode: MODE_OLDFILE,
      position: 0,
      isConsole: false
    });
  }

  /**
   * Resolve Amiga path to real filesystem path
   * Supports:
   * - PROGDIR:path/file -> ~/Code/amiexpress-web/Doors/DoorName/path/file
   * - Doors:path/file -> ~/Code/amiexpress-web/Doors/path/file
   * - BBS:path/file -> ~/Code/amiexpress-web/path/file
   * - Relative paths -> resolved from current directory
   * - Absolute paths starting with / -> used as-is
   */
  private resolvePath(amigaPath: string): string | null {
    console.log(`[dos.library] Resolving Amiga path: "${amigaPath}"`);

    // Handle PROGDIR: device - door's own directory
    if (amigaPath.toUpperCase().startsWith('PROGDIR:')) {
      const relativePath = amigaPath.substring(8);
      const resolved = path.join(this.doorDirectory, relativePath);
      console.log(`[dos.library] PROGDIR: device -> ${resolved}`);
      return resolved;
    }

    // Handle Doors: device - doors directory root
    if (amigaPath.toUpperCase().startsWith('DOORS:')) {
      const relativePath = amigaPath.substring(6);
      const resolved = path.join(this.BBS_BASE_PATH, 'Doors', relativePath);
      console.log(`[dos.library] Doors: device -> ${resolved}`);
      return resolved;
    }

    // Handle BBS: device - BBS system files
    if (amigaPath.toUpperCase().startsWith('BBS:')) {
      const relativePath = amigaPath.substring(4);
      const resolved = path.join(this.BBS_BASE_PATH, relativePath);
      console.log(`[dos.library] BBS: device -> ${resolved}`);
      return resolved;
    }

    // Handle absolute paths
    if (amigaPath.startsWith('/')) {
      console.log(`[dos.library] Absolute path -> ${amigaPath}`);
      return amigaPath;
    }

    // Handle relative paths - resolve from current directory
    const resolved = path.join(this.currentDirectory, amigaPath);
    console.log(`[dos.library] Relative path from ${this.currentDirectory} -> ${resolved}`);
    return resolved;
  }

  /**
   * Set the door directory for PROGDIR: device
   * Called by AmigaDoorSession when starting a door
   */
  setDoorDirectory(doorPath: string): void {
    this.doorDirectory = doorPath;
    console.log(`[dos.library] PROGDIR: device set to ${doorPath}`);

    // Set current directory to door directory by default
    this.currentDirectory = doorPath;
    console.log(`[dos.library] Current directory set to ${doorPath}`);
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
   * D2 = access mode (MODE_OLDFILE=1005, MODE_NEWFILE=1006, MODE_READWRITE=1004)
   * Returns: D0 = file handle (or 0 if failed)
   */
  Open(): number {
    const namePtr = this.emulator.getRegister(CPURegister.D1);
    const mode = this.emulator.getRegister(CPURegister.D2);

    const filename = this.readString(namePtr);

    console.log(`[dos.library] Open(filename="${filename}", mode=${mode})`);

    let fileId = 0;

    // Handle special devices
    // Check if filename starts with "con:" (case-insensitive) - handles all console specifications
    // Examples: "", "*", "CON:", "CONSOLE:", "con:10/10/320/80/Output/auto/close/wait"
    // Empty string "" means current console (standard output)
    const isConsoleDevice = filename === '' ||
                           filename === '*' ||
                           filename.toUpperCase() === 'CONSOLE:' ||
                           filename.toUpperCase().startsWith('CON:');

    if (isConsoleDevice) {
      // Explicitly opened console - allocate a new handle (not the standard stdout)
      // The door can and should close this handle
      fileId = this.nextFileId++;
      this.openFiles.set(fileId, {
        id: fileId,
        name: filename,
        mode: mode,
        position: 0,
        isConsole: true,
        buffer: undefined,
        realPath: undefined
      });
      this.lastError = this.ERROR_NO_ERROR;
      console.log(`[dos.library] Open: Console device "${filename}" -> handle ${fileId}`);
    } else if (filename === 'NIL:' || filename === 'NIL') {
      // NIL: device - allocate a new handle
      fileId = this.nextFileId++;
      this.openFiles.set(fileId, {
        id: fileId,
        name: filename,
        mode: mode,
        position: 0,
        isConsole: false,
        buffer: undefined,
        realPath: undefined
      });
      this.lastError = this.ERROR_NO_ERROR;
      console.log(`[dos.library] Open: NIL: device -> handle ${fileId}`);
    } else {
      // Real file - resolve path and attempt to open
      const realPath = this.resolvePath(filename);

      if (!realPath) {
        console.error(`[dos.library] Open: Failed to resolve path "${filename}"`);
        fileId = 0;
        this.lastError = this.ERROR_OBJECT_NOT_FOUND;
      } else {
        try {
          let buffer: Buffer | undefined;

          if (mode === MODE_OLDFILE || mode === MODE_READWRITE) {
            // Read mode - file must exist
            if (!fs.existsSync(realPath)) {
              console.error(`[dos.library] Open: File not found: ${realPath}`);
              fileId = 0;
              this.lastError = this.ERROR_OBJECT_NOT_FOUND;
            } else {
              // Load entire file into memory
              buffer = fs.readFileSync(realPath);
              fileId = this.nextFileId++;
              console.log(`[dos.library] Open: File opened for reading (${buffer.length} bytes) -> handle ${fileId}`);
            }
          } else if (mode === MODE_NEWFILE) {
            // Write mode - create new file or truncate existing
            buffer = Buffer.alloc(0);
            fileId = this.nextFileId++;
            console.log(`[dos.library] Open: File opened for writing -> handle ${fileId}`);
          } else {
            console.error(`[dos.library] Open: Unknown mode ${mode}`);
            fileId = 0;
            this.lastError = this.ERROR_OBJECT_NOT_FOUND;
          }

          if (fileId > 0) {
            // Store file handle
            this.openFiles.set(fileId, {
              id: fileId,
              name: filename,
              mode: mode,
              position: 0,
              isConsole: false,
              buffer: buffer,
              realPath: realPath
            });
            this.lastError = this.ERROR_NO_ERROR;
          }
        } catch (error) {
          console.error(`[dos.library] Open: Error opening file ${realPath}:`, error);
          fileId = 0;
          this.lastError = this.ERROR_OBJECT_NOT_FOUND;
        }
      }
    }

    console.log(`[dos.library] Open returned: ${fileId}`);
    return fileId;
  }

  /**
   * Close - Close a file
   * D1 = file handle
   * Returns: D0 = success (DOSTRUE=-1, DOSFALSE=0)
   *
   * From AmigaDOS spec:
   * - Close(0) does nothing and returns success (V47+)
   * - Standard handles should not be closed
   * - If Close() fails, the file handle is STILL deallocated
   * - On success: restores IoErr() to value before call
   * - On failure: sets IoErr() to error code
   */
  Close(): number {
    const handle = this.emulator.getRegister(CPURegister.D1);

    console.log(`[dos.library] Close(handle=${handle})`);

    // V47+ behavior: Close(0) does nothing and returns success
    if (handle === 0) {
      console.log(`[dos.library] Close(0): No-op, returning success`);
      return -1;  // DOSTRUE
    }

    // Standard handles should not be closed
    if (handle <= 3 || handle === this.NIL_HANDLE) {
      console.log(`[dos.library] Close: Standard handle ${handle}, returning success without closing`);
      return -1;  // DOSTRUE
    }

    const fileHandle = this.openFiles.get(handle);
    if (!fileHandle) {
      console.error(`[dos.library] Close: Invalid handle ${handle}`);
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
      return 0;  // DOSFALSE
    }

    // Save previous IoErr value (will restore on success)
    const previousIoErr = this.lastError;
    let success = true;

    // If file was opened for writing, flush buffer to disk
    if (fileHandle.mode === MODE_NEWFILE || fileHandle.mode === MODE_READWRITE) {
      if (fileHandle.realPath && fileHandle.buffer) {
        try {
          fs.writeFileSync(fileHandle.realPath, fileHandle.buffer);
          console.log(`[dos.library] Close: Wrote ${fileHandle.buffer.length} bytes to ${fileHandle.realPath}`);
        } catch (error) {
          console.error(`[dos.library] Close: Error writing file ${fileHandle.realPath}:`, error);
          this.lastError = this.ERROR_WRITE_PROTECTED;
          success = false;
          // NOTE: Still deallocate handle below (per spec)
        }
      }
    }

    // ALWAYS deallocate the handle, even on failure (per AmigaDOS spec)
    this.openFiles.delete(handle);

    if (success) {
      // On success: restore IoErr() to previous value (per spec)
      this.lastError = previousIoErr;
      console.log(`[dos.library] Close: File closed successfully, IoErr restored to ${previousIoErr}`);
      return -1;  // DOSTRUE
    } else {
      // On failure: IoErr already set above
      console.log(`[dos.library] Close: Failed but handle deallocated, IoErr=${this.lastError}`);
      return 0;  // DOSFALSE
    }
  }

  /**
   * Read - Read from a file
   * D1 = file handle
   * D2 = buffer address
   * D3 = length
   * Returns: D0 = actual length read (or -1 on error)
   */
  Read(): number {
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
      console.log(`[dos.library] Read returned: ${bytesToRead} bytes from STDIN`);
      return bytesToRead;
    }

    // Handle real file
    const fileHandle = this.openFiles.get(handle);
    if (!fileHandle) {
      console.error(`[dos.library] Read: Invalid handle ${handle}`);
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
      return -1;
    }

    // NIL: device always returns 0 bytes
    if (handle === this.NIL_HANDLE) {
      this.lastError = this.ERROR_NO_ERROR;
      console.log(`[dos.library] Read: NIL: device -> 0 bytes`);
      return 0;
    }

    // Check if file has a buffer
    if (!fileHandle.buffer) {
      console.error(`[dos.library] Read: No buffer for handle ${handle}`);
      this.lastError = this.ERROR_READ_PROTECTED;
      return -1;
    }

    // Calculate how many bytes we can read
    const available = fileHandle.buffer.length - fileHandle.position;
    const bytesToRead = Math.min(length, available);

    console.log(`[dos.library] Read: position=${fileHandle.position}, available=${available}, requested=${length}, reading=${bytesToRead}`);

    // Copy bytes from file buffer to emulator memory
    for (let i = 0; i < bytesToRead; i++) {
      const byte = fileHandle.buffer[fileHandle.position + i];
      this.emulator.writeMemory(bufferAddr + i, byte);
    }

    // Update file position
    fileHandle.position += bytesToRead;

    this.lastError = this.ERROR_NO_ERROR;
    console.log(`[dos.library] Read returned: ${bytesToRead} bytes (position now ${fileHandle.position})`);
    return bytesToRead;
  }

  /**
   * Write - Write to a file
   * D1 = file handle
   * D2 = buffer address
   * D3 = length
   * Returns: D0 = actual length written (or -1 on error)
   */
  Write(): number {
    const handle = this.emulator.getRegister(CPURegister.D1);
    const bufferAddr = this.emulator.getRegister(CPURegister.D2);
    const length = this.emulator.getRegister(CPURegister.D3);

    // Read data from emulated memory
    const bytes: number[] = [];
    for (let i = 0; i < length; i++) {
      bytes.push(this.emulator.readMemory(bufferAddr + i));
    }

    // Check if this is a console/stdout/stderr handle
    const fileHandle = this.openFiles.get(handle);
    const isConsoleHandle = (handle === this.STDOUT_HANDLE || handle === this.STDERR_HANDLE ||
                            (fileHandle && fileHandle.isConsole));

    if (isConsoleHandle) {
      const text = String.fromCharCode(...bytes);

      // DEBUG: Log WHO2 door output
      console.log(`[dos.library] Write: Console output (${length} bytes): ${JSON.stringify(text)}`);

      // Send to output callback
      if (this.outputCallback) {
        console.log(`[dos.library] Write: Sending to socket callback`);
        this.outputCallback(text);
      } else {
        console.log(`[dos.library] Write: WARNING - No output callback set!`);
      }

      this.lastError = this.ERROR_NO_ERROR;
      return length;
    }

    // Check if it's NIL: device (discards output)
    const isNilDevice = (handle === this.NIL_HANDLE ||
                        (fileHandle && fileHandle.name &&
                         (fileHandle.name === 'NIL:' || fileHandle.name === 'NIL')));

    if (isNilDevice) {
      this.lastError = this.ERROR_NO_ERROR;
      console.log(`[dos.library] Write: NIL: device -> ${length} bytes discarded`);
      return length;
    }

    // Handle real file - fileHandle already retrieved above
    if (!fileHandle) {
      console.error(`[dos.library] Write: Invalid handle ${handle}`);
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
      return -1;
    }

    // Check if file is writable
    if (fileHandle.mode !== MODE_NEWFILE && fileHandle.mode !== MODE_READWRITE) {
      console.error(`[dos.library] Write: File not opened for writing (mode=${fileHandle.mode})`);
      this.lastError = this.ERROR_WRITE_PROTECTED;
      return -1;
    }

    // Check if file has a buffer
    if (!fileHandle.buffer) {
      console.error(`[dos.library] Write: No buffer for handle ${handle}`);
      this.lastError = this.ERROR_WRITE_PROTECTED;
      return -1;
    }

    console.log(`[dos.library] Write: Writing ${length} bytes at position ${fileHandle.position}`);

    // Expand buffer if necessary
    const neededSize = fileHandle.position + length;
    if (fileHandle.buffer.length < neededSize) {
      const newBuffer = Buffer.alloc(neededSize);
      fileHandle.buffer.copy(newBuffer);
      fileHandle.buffer = newBuffer;
    }

    // Write bytes to buffer
    for (let i = 0; i < length; i++) {
      fileHandle.buffer[fileHandle.position + i] = bytes[i];
    }

    // Update file position
    fileHandle.position += length;

    this.lastError = this.ERROR_NO_ERROR;
    console.log(`[dos.library] Write returned: ${length} bytes (position now ${fileHandle.position})`);
    return length;
  }

  // Inherited input/output handles from parent process
  // AmiExpress sets SYS_INPUT=0, SYS_OUTPUT=0 (or doorTrapFH) when launching doors
  // Per AmigaDOS spec: "Input() is used to identify the initial input stream allocated when
  // the program was initiated. Never close the filehandle returned by Input!"
  private inheritedInput: number = 0;   // 0 = NIL for doors
  private inheritedOutput: number = 0;  // 0 = NIL for doors

  /**
   * Set inherited stdin/stdout handles for the process
   * Called when door session is initialized
   */
  setInheritedHandles(input: number, output: number): void {
    this.inheritedInput = input;
    this.inheritedOutput = output;
    console.log(`[dos.library] Set inherited handles: Input=${input}, Output=${output}`);
  }

  /**
   * Input - Get standard input file handle
   * Returns: D0 = inherited stdin handle
   *
   * From AmigaDOS spec:
   * "Input() is used to identify the initial input stream allocated when
   * the program was initiated. Never close the filehandle returned by Input!"
   */
  Input(): number {
    console.log(`[dos.library] Input() returning inherited handle ${this.inheritedInput}`);
    return this.inheritedInput;
  }

  /**
   * Output - Get standard output file handle
   * Returns: D0 = inherited stdout handle
   *
   * From AmigaDOS spec:
   * "Output() is used to identify the initial output stream allocated when
   * the program was initiated."
   */
  Output(): number {
    console.log(`[dos.library] Output() returning inherited handle ${this.inheritedOutput}`);
    return this.inheritedOutput;
  }

  /**
   * IoErr - Get last DOS error code
   * Returns: D0 = error code
   */
  IoErr(): number {
    console.log(`[dos.library] IoErr() returning ${this.lastError}`);
    return this.lastError;
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
  DateStamp(): number {
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

    return dateStampPtr;
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
  WaitForChar(): number {
    const handle = this.emulator.getRegister(CPURegister.D1);
    const timeout = this.emulator.getRegister(CPURegister.D2);

    console.log(`[dos.library] WaitForChar(handle=${handle}, timeout=${timeout})`);

    if (handle === this.STDIN_HANDLE) {
      // Check if data available in input buffer
      const hasData = this.inputBuffer.length > 0;
      console.log(`[dos.library] WaitForChar returned: ${hasData ? 'data available' : 'no data'}`);
      return hasData ? -1 : 0;
    } else {
      return 0;
    }
  }

  /**
   * Seek - Change file position
   * D1 = file handle
   * D2 = position (signed 32-bit offset)
   * D3 = mode (OFFSET_BEGINNING=-1, OFFSET_CURRENT=0, OFFSET_END=1)
   * Returns: D0 = old position (or -1 on error)
   */
  Seek(): number {
    const handle = this.emulator.getRegister(CPURegister.D1);
    const offset = this.emulator.getRegister(CPURegister.D2);
    const mode = this.emulator.getRegister(CPURegister.D3);

    console.log(`[dos.library] Seek(handle=${handle}, offset=${offset}, mode=${mode})`);

    // Console handles and NIL: don't support seeking
    if (handle <= 3 || handle === this.NIL_HANDLE) {
      console.error(`[dos.library] Seek: Cannot seek on console/NIL handles`);
      this.lastError = this.ERROR_OBJECT_IN_USE;
      return -1;
    }

    const fileHandle = this.openFiles.get(handle);
    if (!fileHandle) {
      console.error(`[dos.library] Seek: Invalid handle ${handle}`);
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
      return -1;
    }

    if (!fileHandle.buffer) {
      console.error(`[dos.library] Seek: No buffer for handle ${handle}`);
      this.lastError = this.ERROR_OBJECT_IN_USE;
      return -1;
    }

    // Save old position
    const oldPosition = fileHandle.position;

    // Calculate new position based on mode
    let newPosition = 0;
    if (mode === OFFSET_BEGINNING) {
      newPosition = offset;
    } else if (mode === OFFSET_CURRENT) {
      newPosition = fileHandle.position + offset;
    } else if (mode === OFFSET_END) {
      newPosition = fileHandle.buffer.length + offset;
    } else {
      console.error(`[dos.library] Seek: Invalid mode ${mode}`);
      this.lastError = this.ERROR_OBJECT_IN_USE;
      return -1;
    }

    // Clamp to valid range
    if (newPosition < 0) {
      newPosition = 0;
    } else if (newPosition > fileHandle.buffer.length) {
      newPosition = fileHandle.buffer.length;
    }

    fileHandle.position = newPosition;

    this.lastError = this.ERROR_NO_ERROR;
    console.log(`[dos.library] Seek: Moved from ${oldPosition} to ${newPosition}`);
    return oldPosition;
  }

  /**
   * DeleteFile - Delete a file
   * D1 = filename (pointer to null-terminated string)
   * Returns: D0 = success (DOSTRUE=-1, DOSFALSE=0)
   */
  DeleteFile(): void {
    const namePtr = this.emulator.getRegister(CPURegister.D1);
    const filename = this.readString(namePtr);

    console.log(`[dos.library] DeleteFile("${filename}")`);

    const realPath = this.resolvePath(filename);
    if (!realPath) {
      console.error(`[dos.library] DeleteFile: Failed to resolve path "${filename}"`);
      this.emulator.setRegister(CPURegister.D0, 0);
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
      return;
    }

    // Check if file exists
    if (!fs.existsSync(realPath)) {
      console.error(`[dos.library] DeleteFile: File not found: ${realPath}`);
      this.emulator.setRegister(CPURegister.D0, 0);
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
      return;
    }

    // Check if it's a directory (DeleteFile should only delete files)
    if (fs.statSync(realPath).isDirectory()) {
      console.error(`[dos.library] DeleteFile: Cannot delete directory with DeleteFile: ${realPath}`);
      this.emulator.setRegister(CPURegister.D0, 0);
      this.lastError = this.ERROR_OBJECT_IN_USE;
      return;
    }

    try {
      // Delete the file
      fs.unlinkSync(realPath);
      console.log(`[dos.library] DeleteFile: Deleted file ${realPath}`);

      this.emulator.setRegister(CPURegister.D0, -1);  // DOSTRUE
      this.lastError = this.ERROR_NO_ERROR;
    } catch (error) {
      console.error(`[dos.library] DeleteFile: Error deleting file ${realPath}:`, error);
      this.emulator.setRegister(CPURegister.D0, 0);
      this.lastError = this.ERROR_WRITE_PROTECTED;
    }
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

    console.log(`[dos.library] Lock("${name}", mode=${mode})`);

    const realPath = this.resolvePath(name);
    if (!realPath) {
      console.error(`[dos.library] Lock: Failed to resolve path "${name}"`);
      this.emulator.setRegister(CPURegister.D0, 0);
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
      return;
    }

    // Check if path exists
    if (!fs.existsSync(realPath)) {
      console.error(`[dos.library] Lock: Path does not exist: ${realPath}`);
      this.emulator.setRegister(CPURegister.D0, 0);
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
      return;
    }

    // Create lock
    const lockId = this.nextLockId++;
    this.locks.set(lockId, {
      id: lockId,
      path: realPath,
      mode: mode
    });

    console.log(`[dos.library] Lock: Created lock ${lockId} for path ${realPath}`);
    this.emulator.setRegister(CPURegister.D0, lockId);
    this.lastError = this.ERROR_NO_ERROR;
  }

  /**
   * UnLock - Release a lock
   * D1 = lock
   */
  UnLock(): void {
    const lockId = this.emulator.getRegister(CPURegister.D1);

    // Lock ID 0 is special (means "no lock")
    if (lockId === 0) {
      console.log(`[dos.library] UnLock: Lock ID 0 (no-op)`);
      return;
    }

    if (this.locks.has(lockId)) {
      console.log(`[dos.library] UnLock: Released lock ${lockId}`);
      this.locks.delete(lockId);
    } else {
      console.warn(`[dos.library] UnLock: Invalid lock ID ${lockId}`);
    }

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
   *
   * FileInfoBlock structure (260 bytes):
   * fib_DiskKey (4), fib_DirEntryType (4), fib_FileName (108 BCPL),
   * fib_Protection (4), fib_EntryType (4), fib_Size (4), fib_NumBlocks (4),
   * fib_Date (12 DateStamp), fib_Comment (80 BCPL), fib_OwnerUID (2), fib_OwnerGID (2)
   */
  Examine(): void {
    const lockId = this.emulator.getRegister(CPURegister.D1);
    const fibPtr = this.emulator.getRegister(CPURegister.D2);

    console.log(`[dos.library] Examine(lock=${lockId}, fib=0x${fibPtr.toString(16)})`);

    const lock = this.locks.get(lockId);
    if (!lock) {
      console.error(`[dos.library] Examine: Invalid lock ID ${lockId}`);
      this.emulator.setRegister(CPURegister.D0, 0);
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
      return;
    }

    try {
      const stats = fs.statSync(lock.path);
      const fileName = path.basename(lock.path);

      // Clear FileInfoBlock (260 bytes)
      for (let i = 0; i < 260; i++) {
        this.emulator.writeMemory(fibPtr + i, 0);
      }

      // fib_DiskKey (4 bytes)
      this.writeLong(fibPtr, 0);

      // fib_DirEntryType (4 bytes) - negative = file, positive = dir
      this.writeLong(fibPtr + 4, stats.isDirectory() ? 2 : -3);

      // fib_FileName (108 bytes BCPL string)
      this.writeBCPLString(fibPtr + 8, fileName, 107);

      // fib_Protection (4 bytes)
      this.writeLong(fibPtr + 116, 0);

      // fib_EntryType (4 bytes)
      this.writeLong(fibPtr + 120, stats.isDirectory() ? 2 : -3);

      // fib_Size (4 bytes)
      this.writeLong(fibPtr + 124, stats.isFile() ? stats.size : 0);

      // fib_NumBlocks (4 bytes)
      this.writeLong(fibPtr + 128, 0);

      // fib_Date (12 bytes DateStamp)
      const mtime = stats.mtime;
      const epoch = new Date('1978-01-01T00:00:00Z');
      const days = Math.floor((mtime.getTime() - epoch.getTime()) / (1000 * 60 * 60 * 24));
      const minutes = mtime.getHours() * 60 + mtime.getMinutes();
      const ticks = mtime.getSeconds() * 50;

      this.writeLong(fibPtr + 132, days);
      this.writeLong(fibPtr + 136, minutes);
      this.writeLong(fibPtr + 140, ticks);

      // fib_Comment (80 bytes BCPL string)
      this.writeBCPLString(fibPtr + 144, '', 79);

      console.log(`[dos.library] Examine: ${fileName} (${stats.isDirectory() ? 'dir' : 'file'}, ${stats.size} bytes)`);

      // Initialize directory iterator for this lock if it's a directory
      if (stats.isDirectory()) {
        const files = fs.readdirSync(lock.path);
        this.dirIterators.set(lockId, files);
        this.dirIteratorIndex.set(lockId, 0);
        console.log(`[dos.library] Examine: Initialized directory iterator (${files.length} entries)`);
      }

      this.emulator.setRegister(CPURegister.D0, -1);  // DOSTRUE
      this.lastError = this.ERROR_NO_ERROR;
    } catch (error) {
      console.error(`[dos.library] Examine: Error examining path ${lock.path}:`, error);
      this.emulator.setRegister(CPURegister.D0, 0);
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
    }
  }

  /**
   * ExNext - Get next directory entry
   * D1 = lock
   * D2 = FileInfoBlock pointer
   * Returns: D0 = success (DOSTRUE=-1, DOSFALSE=0)
   */
  ExNext(): void {
    const lockId = this.emulator.getRegister(CPURegister.D1);
    const fibPtr = this.emulator.getRegister(CPURegister.D2);

    console.log(`[dos.library] ExNext(lock=${lockId}, fib=0x${fibPtr.toString(16)})`);

    const lock = this.locks.get(lockId);
    if (!lock) {
      console.error(`[dos.library] ExNext: Invalid lock ID ${lockId}`);
      this.emulator.setRegister(CPURegister.D0, 0);
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
      return;
    }

    // Get or create directory iterator
    if (!this.dirIterators.has(lockId)) {
      // Examine() should have been called first, but we'll initialize here too
      try {
        const files = fs.readdirSync(lock.path);
        this.dirIterators.set(lockId, files);
        this.dirIteratorIndex.set(lockId, 0);
      } catch (error) {
        console.error(`[dos.library] ExNext: Error reading directory ${lock.path}:`, error);
        this.emulator.setRegister(CPURegister.D0, 0);
        this.lastError = this.ERROR_OBJECT_NOT_FOUND;
        return;
      }
    }

    const files = this.dirIterators.get(lockId)!;
    const index = this.dirIteratorIndex.get(lockId)!;

    if (index >= files.length) {
      // No more entries
      console.log(`[dos.library] ExNext: No more entries`);
      this.emulator.setRegister(CPURegister.D0, 0);
      this.lastError = this.ERROR_NO_MORE_ENTRIES;

      // Clean up iterator
      this.dirIterators.delete(lockId);
      this.dirIteratorIndex.delete(lockId);
      return;
    }

    const fileName = files[index];
    const filePath = path.join(lock.path, fileName);

    try {
      const stats = fs.statSync(filePath);

      // Clear FileInfoBlock (260 bytes)
      for (let i = 0; i < 260; i++) {
        this.emulator.writeMemory(fibPtr + i, 0);
      }

      // fib_DiskKey (4 bytes)
      this.writeLong(fibPtr, index);

      // fib_DirEntryType (4 bytes)
      this.writeLong(fibPtr + 4, stats.isDirectory() ? 2 : -3);

      // fib_FileName (108 bytes BCPL string)
      this.writeBCPLString(fibPtr + 8, fileName, 107);

      // fib_Protection (4 bytes)
      this.writeLong(fibPtr + 116, 0);

      // fib_EntryType (4 bytes)
      this.writeLong(fibPtr + 120, stats.isDirectory() ? 2 : -3);

      // fib_Size (4 bytes)
      this.writeLong(fibPtr + 124, stats.isFile() ? stats.size : 0);

      // fib_NumBlocks (4 bytes)
      this.writeLong(fibPtr + 128, 0);

      // fib_Date (12 bytes DateStamp)
      const mtime = stats.mtime;
      const epoch = new Date('1978-01-01T00:00:00Z');
      const days = Math.floor((mtime.getTime() - epoch.getTime()) / (1000 * 60 * 60 * 24));
      const minutes = mtime.getHours() * 60 + mtime.getMinutes();
      const ticks = mtime.getSeconds() * 50;

      this.writeLong(fibPtr + 132, days);
      this.writeLong(fibPtr + 136, minutes);
      this.writeLong(fibPtr + 140, ticks);

      // fib_Comment (80 bytes BCPL string)
      this.writeBCPLString(fibPtr + 144, '', 79);

      console.log(`[dos.library] ExNext: ${fileName} (${stats.isDirectory() ? 'dir' : 'file'}, ${stats.size} bytes)`);

      // Increment iterator
      this.dirIteratorIndex.set(lockId, index + 1);

      this.emulator.setRegister(CPURegister.D0, -1);  // DOSTRUE
      this.lastError = this.ERROR_NO_ERROR;
    } catch (error) {
      console.error(`[dos.library] ExNext: Error reading file ${filePath}:`, error);
      this.emulator.setRegister(CPURegister.D0, 0);
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
    }
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

    console.log(`[dos.library] CreateDir("${name}")`);

    const realPath = this.resolvePath(name);
    if (!realPath) {
      console.error(`[dos.library] CreateDir: Failed to resolve path "${name}"`);
      this.emulator.setRegister(CPURegister.D0, 0);
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
      return;
    }

    // Check if directory already exists
    if (fs.existsSync(realPath)) {
      console.error(`[dos.library] CreateDir: Path already exists: ${realPath}`);
      this.emulator.setRegister(CPURegister.D0, 0);
      this.lastError = this.ERROR_OBJECT_IN_USE;
      return;
    }

    try {
      // Create directory (recursive = true to create parent dirs)
      fs.mkdirSync(realPath, { recursive: true });
      console.log(`[dos.library] CreateDir: Created directory ${realPath}`);

      // Return lock to new directory
      const lockId = this.nextLockId++;
      this.locks.set(lockId, {
        id: lockId,
        path: realPath,
        mode: -2  // ACCESS_READ
      });

      this.emulator.setRegister(CPURegister.D0, lockId);
      this.lastError = this.ERROR_NO_ERROR;
    } catch (error) {
      console.error(`[dos.library] CreateDir: Error creating directory ${realPath}:`, error);
      this.emulator.setRegister(CPURegister.D0, 0);
      this.lastError = this.ERROR_WRITE_PROTECTED;
    }
  }

  /**
   * CurrentDir - Change/get current directory
   * D1 = lock (or 0 to get current)
   * Returns: D0 = old directory lock
   */
  CurrentDir(): void {
    const lockId = this.emulator.getRegister(CPURegister.D1);

    console.log(`[dos.library] CurrentDir(lock=${lockId})`);

    // Create lock for current directory (to return as "old directory")
    const oldDirLockId = this.nextLockId++;
    this.locks.set(oldDirLockId, {
      id: oldDirLockId,
      path: this.currentDirectory,
      mode: -2  // ACCESS_READ
    });

    if (lockId === 0) {
      // D1=0 means "just get current directory lock, don't change"
      console.log(`[dos.library] CurrentDir: Returning current directory lock ${oldDirLockId} for ${this.currentDirectory}`);
      this.emulator.setRegister(CPURegister.D0, oldDirLockId);
      this.lastError = this.ERROR_NO_ERROR;
      return;
    }

    // Get the lock being set as current directory
    const newLock = this.locks.get(lockId);
    if (!newLock) {
      console.error(`[dos.library] CurrentDir: Invalid lock ID ${lockId}`);
      this.emulator.setRegister(CPURegister.D0, 0);
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
      return;
    }

    // Verify the lock points to a directory
    if (!fs.existsSync(newLock.path) || !fs.statSync(newLock.path).isDirectory()) {
      console.error(`[dos.library] CurrentDir: Lock ${lockId} does not point to a directory: ${newLock.path}`);
      this.emulator.setRegister(CPURegister.D0, 0);
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
      return;
    }

    // Change current directory
    const oldDir = this.currentDirectory;
    this.currentDirectory = newLock.path;
    console.log(`[dos.library] CurrentDir: Changed from ${oldDir} to ${this.currentDirectory}`);

    // Return lock for old directory
    this.emulator.setRegister(CPURegister.D0, oldDirLockId);
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
   *
   * CRITICAL: This function MUST set PC to the exit trap address (0xFFFF00)
   * to signal the emulation loop to terminate the door session cleanly.
   *
   * Reference: AmigaOS autodoc - Exit() terminates the current process.
   * For door programs, we simulate this by jumping to an exit trap address
   * that the emulation loop recognizes as program termination.
   */
  Exit(): void {
    const returnCode = this.emulator.getRegister(CPURegister.D1);

    console.log(`[dos.library] Exit(returnCode=${returnCode})`);
    console.log(`[dos.library] Setting PC to exit trap address 0xFFFF00 to terminate door`);

    // Set PC to exit trap address - this signals the emulation loop to terminate
    const EXIT_TRAP_ADDRESS = 0xFFFF00;
    this.emulator.setRegister(16, EXIT_TRAP_ADDRESS);  // PC = exit trap

    console.log(`[dos.library] Door will now exit cleanly`);
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
   * Helper: Write BCPL string to memory
   * BCPL strings have a length byte followed by characters (no null terminator)
   */
  private writeBCPLString(address: number, str: string, maxLen: number): void {
    const len = Math.min(str.length, maxLen);

    // Write length byte
    this.emulator.writeMemory(address, len);

    // Write string characters
    for (let i = 0; i < len; i++) {
      this.emulator.writeMemory(address + 1 + i, str.charCodeAt(i));
    }

    // Pad remaining bytes with zeros
    for (let i = len; i < maxLen; i++) {
      this.emulator.writeMemory(address + 1 + i, 0);
    }
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
