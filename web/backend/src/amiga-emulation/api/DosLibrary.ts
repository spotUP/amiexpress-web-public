import { MoiraEmulator, CPURegister } from '../cpu/MoiraEmulator';
import * as fs from 'fs';
import * as path from 'path';
import { FileManager } from './FileManager';
import { PathManager } from './PathManager';
import { AmigaFileCache } from './AmigaFileCache';

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
  amigaPath: string;     // Original AmigaDOS path (for CurrentDir/fixFilename)
}

interface ReadArgsTemplateEntry {
  displayName: string;
  namesUpper: string[];
  required: boolean;
  isSwitch: boolean;
  isKeyword: boolean;
  isNumeric: boolean;
  isMultiple: boolean;
  isRest: boolean;
  isToggle: boolean;
}

interface ReadArgsContext {
  rdArgsPtr: number;
  bufferPtr: number;
  bufferSize: number;
  bufferOffset: number;
  ownsBuffer: boolean;
  ownsStruct: boolean;
}

interface ReadArgsToken {
  raw: string;
  value: string;
  normalizedValue: string;
  key?: string;
  keyUpper?: string;
  consumed: boolean;
}

interface ReadArgsTokenResult {
  tokens: ReadArgsToken[];
  error?: number;
}

interface ReadArgsContextInfo {
  rdArgsPtr: number;
  context: ReadArgsContext;
}

interface ReadArgsInputInfo {
  input: string;
  sourcePtr: number;
  length: number;
}

export class DosLibrary {
  private emulator: MoiraEmulator;
  private openFiles: Map<number, FileHandle> = new Map();
  private nextFileId: number = 4;  // Start after STDIN/STDOUT/STDERR
  private outputCallback: ((data: string) => void) | null = null;
  private inputBuffer: string = '';
  private lastError: number = 0;

  // NEW: File I/O management system (phase 3)
  private fileManager: FileManager | null = null;
  private pathManager: PathManager | null = null;
  private fileCache: AmigaFileCache | null = null;
  private useNewFileSystem: boolean = false;  // Feature flag for gradual migration

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
  private readonly ERROR_SEEK_ERROR = 219;  // Seek not possible (console/device)
  private readonly ERROR_BAD_TEMPLATE = 114;
  private readonly ERROR_BAD_NUMBER = 115;
  private readonly ERROR_REQUIRED_ARG_MISSING = 116;
  private readonly ERROR_KEY_NEEDS_ARG = 117;
  private readonly ERROR_TOO_MANY_ARGS = 118;
  private readonly ERROR_UNMATCHED_QUOTES = 119;
  private readonly ERROR_LINE_TOO_LONG = 120;

  // Base paths for logical devices
  private readonly rootPath: string;
  private readonly bbsDataPath: string;

  // Directory and lock management for door support
  private currentDirectory: string;
  private currentDirectoryAmiga: string = 'BBS:';
  private lastLockPath: string = '';
  private doorDirectory: string = '';  // Set by AmigaDoorSession for PROGDIR: device
  private locks: Map<number, Lock> = new Map();
  private nextLockId: number = 1;

  // Directory iteration for ExNext()
  private dirIterators: Map<number, string[]> = new Map();
  private dirIteratorIndex: Map<number, number> = new Map();

  // CLI support (for GetArgStr, GetProgramName)
  private argStringPtr: number = 0;     // Pointer to argument string
  private programName: string = '';     // Program name
  private readonly READARGS_DEFAULT_BUFFER_SIZE = 4096;
  private readonly READARGS_HEAP_BASE = 0x140000;
  private readArgsHeapPtr: number = this.READARGS_HEAP_BASE;
  private readArgsContexts: Map<number, ReadArgsContext> = new Map();
  private readArgsBufferPool: number[] = [];

  constructor(emulator: MoiraEmulator) {
    this.emulator = emulator;
    this.rootPath = process.env.BBS_ROOT || path.resolve(process.cwd(), '../..');
    this.bbsDataPath = path.join(this.rootPath, 'BBS');
    this.currentDirectory = this.bbsDataPath;
    this.ensureDirectory(this.bbsDataPath);
    this.ensureDirectory('/tmp/ram/ENV');
    this.readArgsHeapPtr = this.READARGS_HEAP_BASE;

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
   * Enable the new file system with FileManager and PathManager
   * Called by AmigaDoorSession during initialization
   */
  enableNewFileSystem(baseDir: string): void {
    console.log('[dos.library] Enabling new file system with FileManager/PathManager');
    this.pathManager = new PathManager(baseDir);
    this.fileCache = new AmigaFileCache(this.pathManager);
    this.fileManager = new FileManager(baseDir, this.pathManager, this.fileCache);
    this.useNewFileSystem = true;
    this.currentDirectory = this.bbsDataPath;
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

    if (this.useNewFileSystem && this.pathManager) {
      const currentDir = this.getCurrentDirectoryForResolution();
      const normalized = this.normalizeAmigaPath(amigaPath);
      const resolved = this.pathManager.amiToSysPath(normalized, currentDir);
      if (resolved) {
        console.log(`[dos.library] PathManager resolved "${normalized}" -> ${resolved}`);
        return resolved;
      }
    }

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
      const resolved = path.join(this.rootPath, 'doors', relativePath);
      console.log(`[dos.library] Doors: device -> ${resolved}`);
      return resolved;
    }

    // Handle BBS: device - BBS system files
    if (amigaPath.toUpperCase().startsWith('BBS:')) {
      const relativePath = amigaPath.substring(4);
      const resolved = path.join(this.bbsDataPath, relativePath);
      console.log(`[dos.library] BBS: device -> ${resolved}`);
      return resolved;
    }

    // Handle S: device - Amiga system scripts/config (maps to BBS root /S)
    if (amigaPath.toUpperCase().startsWith('S:')) {
      const relativePath = amigaPath.substring(2);
      const resolved = path.join(this.rootPath, 'S', relativePath);
      console.log(`[dos.library] S: device -> ${resolved}`);
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
    this.currentDirectoryAmiga = 'PROGDIR:';
    console.log(`[dos.library] Current directory set to ${doorPath}`);

    if (this.pathManager) {
      this.pathManager.setProgDir(doorPath);
    }

    if (this.fileManager) {
      this.fileManager.setCurrentDir('progdir:');
    }
  }

  private getCurrentDirectoryForResolution(): string {
    if (this.fileManager) {
      return this.fileManager.getCurrentDirSysPath();
    }
    return this.currentDirectory;
  }

  private ensureDirectory(dir: string): void {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (error) {
      console.warn(`[dos.library] ⚠️ Unable to create directory ${dir}:`, error);
    }
  }

  /**
   * UADE compatibility: doors often pass relative filenames after calling
   * CurrentDir(). Classic AmigaDOS prepends the current directory text so
   * open() sees an absolute path. We mimic that behavior here so doors like
   * Bulls see the same semantics even without modifying their strings.
   */
  private normalizeAmigaPath(amigaPath: string): string {
    if (amigaPath.includes(':') || amigaPath.startsWith('/')) {
      return amigaPath;
    }

    if (!this.currentDirectoryAmiga) {
      console.warn('[dos.library] ⚠️ fixFilename: no current directory set, returning relative path unchanged');
      return amigaPath;
    }

    console.warn(`[dos.library] ⚠️ fixFilename: prefixing "${amigaPath}" with current dir "${this.currentDirectoryAmiga}"`);
    const separator = this.currentDirectoryAmiga.endsWith('/') ? '' : '/';
    return `${this.currentDirectoryAmiga}${separator}${amigaPath}`;
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
    console.log(`[dos.library] queueInput: ${JSON.stringify(data)}`);
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

    // NEW: Use FileManager if enabled
    if (this.useNewFileSystem && this.fileManager) {
      const bptr = this.fileManager.open(filename, mode);
      if (bptr > 0) {
        this.lastError = this.ERROR_NO_ERROR;
        console.log(`[dos.library] Open (FileManager) returned BPTR: ${bptr}`);
      } else {
        this.lastError = this.ERROR_OBJECT_NOT_FOUND;
        console.error(`[dos.library] Open (FileManager) failed for "${filename}"`);
      }
      return bptr;
    }

    // LEGACY: Old implementation (backward compatibility)
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

    // NEW: Use FileManager if enabled
    if (this.useNewFileSystem && this.fileManager) {
      const success = this.fileManager.close(handle);
      if (success) {
        console.log(`[dos.library] Close (FileManager) succeeded for handle ${handle}`);
        return -1;  // DOSTRUE
      } else {
        console.error(`[dos.library] Close (FileManager) failed for handle ${handle}`);
        this.lastError = this.ERROR_OBJECT_NOT_FOUND;
        return 0;  // DOSFALSE
      }
    }

    // LEGACY: Old implementation (backward compatibility)

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

    // Console handles and NIL: don't need to flush to disk
    if (fileHandle.isConsole || fileHandle.name === 'NIL:' || fileHandle.name === 'NIL') {
      console.log(`[dos.library] Close: Console/NIL handle ${handle}, closing without disk flush`);
      // Console output is already flushed via Write(), just close the handle
    } else {
      // Regular file - flush buffer to disk if it was opened for writing
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

    // NEW: Use FileManager if enabled
    if (this.useNewFileSystem && this.fileManager) {
      const dataBuffer = this.fileManager.read(handle, length);
      const bytesRead = dataBuffer.length;

      // Copy data to emulator memory
      for (let i = 0; i < bytesRead; i++) {
        this.emulator.writeMemory(bufferAddr + i, dataBuffer[i]);
      }

      this.lastError = this.ERROR_NO_ERROR;
      console.log(`[dos.library] Read (FileManager) returned: ${bytesRead} bytes`);
      return bytesRead;
    }

    // LEGACY: Old implementation (backward compatibility)
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

    // NEW: Use FileManager if enabled
    if (this.useNewFileSystem && this.fileManager) {
      const dataBuffer = Buffer.from(bytes);
      const result = this.fileManager.write(handle, dataBuffer);

      if (result.bytesWritten < 0) {
        console.error(`[dos.library] Write (FileManager) failed for handle ${handle}`);
        this.lastError = this.ERROR_WRITE_PROTECTED;
        return -1;
      }

      // If console output, send to callback
      if (result.consoleData) {
        const text = result.consoleData.toString();
        console.log(`[dos.library] Write (FileManager): Console output (${length} bytes): ${JSON.stringify(text)}`);
        if (this.outputCallback) {
          this.outputCallback(text);
        }
      }

      this.lastError = this.ERROR_NO_ERROR;
      console.log(`[dos.library] Write (FileManager) returned: ${result.bytesWritten} bytes`);
      return result.bytesWritten;
    }

    // LEGACY: Old implementation (backward compatibility)
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
  // Per AmigaDOS spec: "Input() is used to identify the initial input stream allocated when
  // the program was initiated. Never close the filehandle returned by Input!"
  // XIM/AIM doors expect standard console I/O, so we default to STDIN/STDOUT
  private inheritedInput: number = 1;   // STDIN_HANDLE
  private inheritedOutput: number = 2;  // STDOUT_HANDLE

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
    // NEW: Use FileManager if enabled
    if (this.useNewFileSystem && this.fileManager) {
      const bptr = this.fileManager.getStdinBptr();
      console.log(`[dos.library] Input (FileManager) returning BPTR ${bptr}`);
      return bptr;
    }

    // LEGACY: Old implementation
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
    // NEW: Use FileManager if enabled
    if (this.useNewFileSystem && this.fileManager) {
      const bptr = this.fileManager.getStdoutBptr();
      console.log(`[dos.library] Output (FileManager) returning BPTR ${bptr}`);
      return bptr;
    }

    // LEGACY: Old implementation
    console.log(`[dos.library] Output() returning inherited handle ${this.inheritedOutput}`);
    return this.inheritedOutput;
  }

  /**
   * IoErr - Get last DOS error code
   * Returns: D0 = error code
   */
  IoErr(): number {
    if (this.lastError !== 0) {
      console.log(`[dos.library] 🔴 IoErr() = ${this.lastError} (${this.getErrorMessage(this.lastError)})`);
    }
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
   * Seek - Change file position
   * D1 = file handle
   * D2 = position (signed 32-bit offset)
   * D3 = mode (OFFSET_BEGINNING=-1, OFFSET_CURRENT=0, OFFSET_END=1)
   * Returns: D0 = old position (or -1 on error)
   */
  Seek(): number {
    const handle = this.emulator.getRegister(CPURegister.D1);
    const rawOffset = this.emulator.getRegister(CPURegister.D2);
    const rawMode = this.emulator.getRegister(CPURegister.D3);
    const offset = rawOffset | 0;
    const mode = rawMode | 0;

    console.log(`[dos.library] Seek(handle=${handle}, offset=${offset}, mode=${mode})`);

    if (this.useNewFileSystem && this.fileManager) {
      let whence = 0;
      if (mode === OFFSET_BEGINNING) {
        whence = 0;
      } else if (mode === OFFSET_CURRENT) {
        whence = 1;
      } else if (mode === OFFSET_END) {
        whence = 2;
      } else {
        console.error(`[dos.library] Seek(FileManager): Invalid mode ${mode}`);
        this.lastError = this.ERROR_OBJECT_IN_USE;
        return -1;
      }

      const oldPos = this.fileManager.tell(handle);
      const newPos = this.fileManager.seek(handle, offset, whence);
      if (newPos < 0) {
        console.error('[dos.library] Seek(FileManager): seek failed');
        this.lastError = this.ERROR_OBJECT_IN_USE;
        return -1;
      }

      this.lastError = this.ERROR_NO_ERROR;
      console.log(`[dos.library] Seek(FileManager): moved from ${oldPos} to ${newPos}`);
      return oldPos;
    }

    const fileHandle = this.openFiles.get(handle);
    if (!fileHandle) {
      console.error(`[dos.library] Seek: Invalid handle ${handle}`);
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
      return -1;
    }

    // Treat console/NIL handles as virtual streams that support Seek()
    if (fileHandle.isConsole || handle === this.NIL_HANDLE) {
      const oldPos = fileHandle.position;
      let newPos = oldPos;
      if (mode === OFFSET_BEGINNING) {
        newPos = offset;
      } else if (mode === OFFSET_CURRENT) {
        newPos = oldPos + offset;
      } else if (mode === OFFSET_END) {
        // Consoles/NIL don't have a meaningful end; treat as no-op
        newPos = oldPos;
      } else {
        console.error(`[dos.library] Seek: Invalid mode ${mode} for console handle`);
        this.lastError = this.ERROR_OBJECT_IN_USE;
        return -1;
      }

      if (newPos < 0) {
        newPos = 0;
      }

      fileHandle.position = newPos;
      this.lastError = this.ERROR_NO_ERROR;
      console.log(`[dos.library] Seek: Console/NIL handle ${handle} moved from ${oldPos} to ${newPos}`);
      return oldPos;
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
    let name = this.readString(namePtr);
    const originalName = name;

    if (this.useNewFileSystem) {
      name = this.normalizeAmigaPath(name);
    }

    const realPath = this.resolvePath(name);
    if (!realPath) {
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
      console.log(`[dos.library] 🔒 Lock("${name}") - ❌ Failed to resolve path [IoErr=${this.lastError}: ${this.getErrorMessage(this.lastError)}]`);
      this.emulator.setRegister(CPURegister.D0, 0);
      return;
    }

    // Check if path exists
    if (!fs.existsSync(realPath)) {
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
      console.log(`[dos.library] 🔒 Lock("${name}") -> "${realPath}" - ⚠️  NOT FOUND [IoErr=${this.lastError}: ${this.getErrorMessage(this.lastError)}]`);
      this.emulator.setRegister(CPURegister.D0, 0);
      return;
    }

    console.log(`[dos.library] 🔒 Lock("${name}") -> "${realPath}" - ✅ EXISTS`);

    // Create lock
    const lockId = this.nextLockId++;
    this.locks.set(lockId, {
      id: lockId,
      path: realPath,
      mode: mode,
      amigaPath: originalName
    });

    this.lastLockPath = originalName;
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
        mode: -2,  // ACCESS_READ
        amigaPath: name
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
      amigaPath: this.currentDirectoryAmiga,
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
    if (newLock.amigaPath) {
      this.currentDirectoryAmiga = newLock.amigaPath;
    }
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
   * GetArgStr - Get pointer to argument string (V36+)
   * Returns: D0 = pointer to argument string (NULL-terminated)
   *
   * Returns a pointer to the (null-terminated) arguments for the program.
   * This is the same string passed in A0 on startup from CLI.
   */
  GetArgStr(): void {
    console.log(`[dos.library] GetArgStr() returning 0x${this.argStringPtr.toString(16)}`);
    this.emulator.setRegister(CPURegister.D0, this.argStringPtr);
  }

  /**
   * GetCliProgramName - Get program name from CLI structure (V36+)
   * D1 = buffer pointer
   * D2 = buffer length
   * Returns: D0 = success (DOSTRUE=-1) or failure (DOSFALSE=0)
   *
   * Extracts the program name from the CLI structure and puts it into the buffer.
   * If the buffer is too small, the name is truncated.
   * If no CLI structure is present, returns failure.
   */
  GetCliProgramName(): void {
    const bufPtr = this.emulator.getRegister(CPURegister.D1);
    const bufLen = this.emulator.getRegister(CPURegister.D2);

    console.log(`[dos.library] GetCliProgramName(buf=0x${bufPtr.toString(16)}, len=${bufLen})`);

    if (this.programName.length === 0) {
      // No program name set - return empty string and failure
      this.emulator.writeMemory(bufPtr, 0);
      this.emulator.setRegister(CPURegister.D0, 0);
      this.lastError = 212; // ERROR_OBJECT_WRONG_TYPE
      console.log(`[dos.library] GetCliProgramName: No CLI structure, returning failure`);
      return;
    }

    // Copy program name to buffer (truncate if necessary)
    const copyLen = Math.min(this.programName.length, bufLen - 1);
    for (let i = 0; i < copyLen; i++) {
      this.emulator.writeMemory(bufPtr + i, this.programName.charCodeAt(i));
    }
    this.emulator.writeMemory(bufPtr + copyLen, 0); // Null terminator

    this.emulator.setRegister(CPURegister.D0, -1); // DOSTRUE
    this.lastError = this.ERROR_NO_ERROR;
    console.log(`[dos.library] GetCliProgramName: Returned "${this.programName.substring(0, copyLen)}"`);
  }

  /**
   * Set CLI information (called by AmigaDoorSession)
   */
  setCliInfo(argStringPtr: number, programName: string): void {
    this.argStringPtr = argStringPtr;
    this.programName = programName;
    console.log(`[dos.library] CLI info set: argString=0x${argStringPtr.toString(16)}, progName="${programName}"`);
  }

  /**
   * WaitForChar - Check if character available within timeout (V36)
   * D1 = file handle (BPTR)
   * D2 = timeout (microseconds)
   * Returns: D0 = -1 (TRUE) if char available, 0 (FALSE) otherwise
   */
  WaitForChar(): void {
    const fileHandle = this.emulator.getRegister(CPURegister.D1);
    const timeout = this.emulator.getRegister(CPURegister.D2);

    console.log(`[dos.library] WaitForChar(fh=${fileHandle}, timeout=${timeout})`);

    // For console/stdin, check if input buffer has data
    if (fileHandle === this.STDIN_HANDLE || fileHandle === this.STDOUT_HANDLE) {
      const hasData = this.inputBuffer.length > 0;
      this.emulator.setRegister(CPURegister.D0, hasData ? -1 : 0);
      console.log(`[dos.library] WaitForChar: Console, hasData=${hasData}`);
      return;
    }

    // For regular files, character is always available (file in memory)
    const file = this.openFiles.get(fileHandle);
    if (!file) {
      this.emulator.setRegister(CPURegister.D0, 0); // FALSE - invalid handle
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
      console.log(`[dos.library] WaitForChar: Invalid file handle`);
      return;
    }

    if (file.isConsole) {
      const hasData = this.inputBuffer.length > 0;
      this.emulator.setRegister(CPURegister.D0, hasData ? -1 : 0);
      console.log(`[dos.library] WaitForChar: Console file, hasData=${hasData}`);
    } else {
      // File: check if position < file size
      const atEOF = !file.buffer || file.position >= file.buffer.length;
      this.emulator.setRegister(CPURegister.D0, atEOF ? 0 : -1);
      console.log(`[dos.library] WaitForChar: Regular file, atEOF=${atEOF}`);
    }
  }

  /**
   * FGetC - Read character from file (buffered) (V36)
   * D1 = file handle (BPTR)
   * Returns: D0 = character (0-255) or -1 for EOF
   */
  FGetC(): void {
    const fileHandle = this.emulator.getRegister(CPURegister.D1);
    console.log(`[dos.library] FGetC(fh=${fileHandle})`);

    const file = this.openFiles.get(fileHandle);
    if (!file) {
      this.emulator.setRegister(CPURegister.D0, -1); // EOF
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
      console.log(`[dos.library] FGetC: Invalid file handle, returning EOF`);
      return;
    }

    // Console/stdin - read from input buffer
    if (file.isConsole) {
      if (this.inputBuffer.length > 0) {
        const char = this.inputBuffer.charCodeAt(0);
        this.inputBuffer = this.inputBuffer.substring(1);
        this.emulator.setRegister(CPURegister.D0, char);
        console.log(`[dos.library] FGetC: Console, read char ${char} ('${String.fromCharCode(char)}')`);
      } else {
        this.emulator.setRegister(CPURegister.D0, -1); // EOF
        console.log(`[dos.library] FGetC: Console buffer empty, returning EOF`);
      }
      return;
    }

    // Regular file - read from buffer
    if (!file.buffer || file.position >= file.buffer.length) {
      this.emulator.setRegister(CPURegister.D0, -1); // EOF
      this.lastError = this.ERROR_NO_ERROR; // EOF is not an error
      console.log(`[dos.library] FGetC: EOF reached`);
      return;
    }

    const char = file.buffer[file.position++];
    this.emulator.setRegister(CPURegister.D0, char);
    console.log(`[dos.library] FGetC: Read char ${char} ('${String.fromCharCode(char)}') at pos ${file.position - 1}`);
  }

  /**
   * FPutC - Write character to file (buffered) (V36)
   * D1 = file handle (BPTR)
   * D2 = character (LONG, 0-255)
   * Returns: D0 = character written or -1 (EOF) for error
   */
  FPutC(): void {
    const fileHandle = this.emulator.getRegister(CPURegister.D1);
    const char = this.emulator.getRegister(CPURegister.D2) & 0xFF;
    console.log(`[dos.library] FPutC(fh=${fileHandle}, char=${char})`);

    const file = this.openFiles.get(fileHandle);
    if (!file) {
      this.emulator.setRegister(CPURegister.D0, -1); // EOF
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
      console.log(`[dos.library] FPutC: Invalid file handle, returning EOF`);
      return;
    }

    // Console output - send to callback
    if (file.isConsole) {
      const charStr = String.fromCharCode(char);
      if (this.outputCallback) {
        this.outputCallback(charStr);
      }
      this.emulator.setRegister(CPURegister.D0, char);
      console.log(`[dos.library] FPutC: Console output: '${charStr}'`);
      return;
    }

    // Regular file - append to buffer
    if (!file.buffer) {
      file.buffer = Buffer.alloc(0);
    }
    file.buffer = Buffer.concat([file.buffer, Buffer.from([char])]);
    file.position = file.buffer.length;

    this.emulator.setRegister(CPURegister.D0, char);
    console.log(`[dos.library] FPutC: Wrote char to file, new size=${file.buffer.length}`);
  }

  /**
   * FGets - Read line from file (buffered) (V36)
   * D1 = file handle (BPTR)
   * D2 = buffer address (STRPTR)
   * D3 = buffer length (ULONG, must be > 0)
   * Returns: D0 = buffer pointer or NULL for EOF
   */
  FGets(): void {
    const fileHandle = this.emulator.getRegister(CPURegister.D1);
    const bufAddr = this.emulator.getRegister(CPURegister.D2);
    const bufLen = this.emulator.getRegister(CPURegister.D3);

    console.log(`[dos.library] FGets(fh=${fileHandle}, buf=0x${bufAddr.toString(16)}, len=${bufLen})`);

    if (bufLen === 0) {
      this.emulator.setRegister(CPURegister.D0, 0); // NULL
      this.lastError = this.ERROR_NO_ERROR; // EOF condition
      console.log(`[dos.library] FGets: Zero length buffer, returning NULL`);
      return;
    }

    // New FileManager-based implementation
    if (this.useNewFileSystem && this.fileManager) {
      console.log(`[dos.library] FGets(FileManager) fh=${fileHandle} buf=0x${bufAddr.toString(16)} len=${bufLen}`);
      const fh = this.fileManager.getHandle(fileHandle);
      if (!fh) {
        this.emulator.setRegister(CPURegister.D0, 0);
        this.lastError = this.ERROR_OBJECT_NOT_FOUND;
        console.log(`[dos.library] FGets: Invalid BPTR ${fileHandle}, returning NULL`);
        return;
      }

      let bytesRead = 0;
      const maxBytes = Math.max(0, bufLen - 1);
      while (bytesRead < maxBytes) {
        const chunk = this.fileManager.read(fileHandle, 1);
        if (chunk.length === 0) {
          break;
        }

        const byte = chunk[0];
        this.emulator.writeMemory(bufAddr + bytesRead, byte);
        bytesRead++;
        if (byte === 0x0A) {
          break;
        }
      }

      if (bytesRead === 0) {
        this.emulator.setRegister(CPURegister.D0, 0);
        this.lastError = this.ERROR_NO_ERROR;
        console.log('[dos.library] FGets: EOF (FileManager), returning NULL');
        return;
      }

      this.emulator.writeMemory(bufAddr + bytesRead, 0);
      this.emulator.setRegister(CPURegister.D0, bufAddr);
      const line = Buffer.from(
        Array.from({ length: bytesRead }, (_, i) => this.emulator.readMemory(bufAddr + i))
      ).toString('latin1');
      console.log(`[dos.library] FGets (FileManager): Read ${bytesRead} bytes: "${line.replace(/\n/g, '\\n')}"`);
      this.lastError = this.ERROR_NO_ERROR;
      return;
    }

    const file = this.openFiles.get(fileHandle);
    if (!file) {
      this.emulator.setRegister(CPURegister.D0, 0); // NULL
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
      console.log(`[dos.library] FGets: Invalid file handle, returning NULL`);
      return;
    }

    // Check for immediate EOF
    if (!file.buffer || file.position >= file.buffer.length) {
      this.emulator.setRegister(CPURegister.D0, 0); // NULL
      this.lastError = this.ERROR_NO_ERROR; // EOF, not an error
      console.log(`[dos.library] FGets: EOF, returning NULL`);
      return;
    }

    // Read up to bufLen-1 bytes or until newline
    let bytesRead = 0;
    const maxBytes = bufLen - 1; // Leave room for null terminator

    while (bytesRead < maxBytes && file.position < file.buffer.length) {
      const byte = file.buffer[file.position++];
      this.emulator.writeMemory(bufAddr + bytesRead, byte);
      bytesRead++;

      // Stop at newline (newline IS included in buffer)
      if (byte === 0x0A) { // '\n'
        break;
      }
    }

    // Null-terminate the string
    this.emulator.writeMemory(bufAddr + bytesRead, 0);

    this.emulator.setRegister(CPURegister.D0, bufAddr); // Return buffer pointer
    const line = String.fromCharCode(...Array.from({ length: bytesRead }, (_, i) =>
      this.emulator.readMemory(bufAddr + i)
    ));
    console.log(`[dos.library] FGets: Read ${bytesRead} bytes: "${line.replace(/\n/g, '\\n')}"`);
  }

  /**
   * FPuts - Write string to file (buffered) (V36)
   * D1 = file handle (BPTR)
   * D2 = string address (STRPTR, null-terminated)
   * Returns: D0 = 0 for success, -1 for error
   */
  FPuts(): void {
    const fileHandle = this.emulator.getRegister(CPURegister.D1);
    const strAddr = this.emulator.getRegister(CPURegister.D2);
    const str = this.readString(strAddr);

    console.log(`[dos.library] FPuts(fh=${fileHandle}, str="${str}")`);

    const file = this.openFiles.get(fileHandle);
    if (!file) {
      this.emulator.setRegister(CPURegister.D0, -1); // Error
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
      console.log(`[dos.library] FPuts: Invalid file handle, returning error`);
      return;
    }

    // Console output - send to callback
    if (file.isConsole) {
      if (this.outputCallback) {
        this.outputCallback(str);
      }
      this.emulator.setRegister(CPURegister.D0, 0); // Success
      console.log(`[dos.library] FPuts: Console output (${str.length} bytes)`);
      return;
    }

    // Regular file - append to buffer
    if (!file.buffer) {
      file.buffer = Buffer.alloc(0);
    }
    const strBuf = Buffer.from(str, 'binary');
    file.buffer = Buffer.concat([file.buffer, strBuf]);
    file.position = file.buffer.length;

    this.emulator.setRegister(CPURegister.D0, 0); // Success
    console.log(`[dos.library] FPuts: Wrote ${str.length} bytes to file`);
  }

  /**
   * PutStr - Write string directly to Output() stream (STDOUT)
   * D1 = string pointer (STRPTR, null-terminated)
   * Returns: D0 = 0 on success, -1 on error
   */
  PutStr(): number {
    const strAddr = this.emulator.getRegister(CPURegister.D1);
    if (!strAddr) {
      console.warn('[dos.library] PutStr: NULL string pointer');
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
      return -1;
    }

    const str = this.readString(strAddr, 4096);
    const preview = str.length > 120 ? `${str.slice(0, 117)}...` : str;
    console.log(`[dos.library] PutStr("${preview.replace(/\r/g, '\\r').replace(/\n/g, '\\n')}")`);

    if (this.useNewFileSystem && this.fileManager) {
      const stdoutBptr = this.fileManager.getStdoutBptr();
      const data = Buffer.from(str, 'binary');
      const result = this.fileManager.write(stdoutBptr, data);

      if (result.bytesWritten < 0) {
        console.error('[dos.library] PutStr: FileManager write failed');
        this.lastError = this.ERROR_WRITE_PROTECTED;
        return -1;
      }

      if (result.consoleData && this.outputCallback) {
        this.outputCallback(result.consoleData.toString('binary'));
      } else if (!result.consoleData) {
        console.log('[dos.library] PutStr: Output redirected to file/device');
      }

      this.lastError = this.ERROR_NO_ERROR;
      return 0;
    }

    const handle = this.inheritedOutput;
    const stdout = this.openFiles.get(handle);

    if (!stdout) {
      console.error('[dos.library] PutStr: Invalid stdout handle');
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
      return -1;
    }

    if (stdout.isConsole || handle === this.STDOUT_HANDLE) {
      if (this.outputCallback) {
        this.outputCallback(str);
      } else {
        console.warn('[dos.library] PutStr: No output callback set');
      }
    } else {
      if (!stdout.buffer) {
        stdout.buffer = Buffer.alloc(0);
      }
      const strBuf = Buffer.from(str, 'binary');
      stdout.buffer = Buffer.concat([stdout.buffer, strBuf]);
      stdout.position = stdout.buffer.length;
    }

    this.lastError = this.ERROR_NO_ERROR;
    return 0;
  }

  /**
   * FRead - Read blocks from file (buffered) (V36)
   * D1 = file handle (BPTR)
   * D2 = buffer address (STRPTR)
   * D3 = block length (ULONG, must be > 0)
   * D4 = number of blocks (ULONG, must be > 0)
   * Returns: D0 = number of blocks read (0 for EOF)
   */
  FRead(): void {
    const fileHandle = this.emulator.getRegister(CPURegister.D1);
    const bufAddr = this.emulator.getRegister(CPURegister.D2);
    const blockLen = this.emulator.getRegister(CPURegister.D3);
    const numBlocks = this.emulator.getRegister(CPURegister.D4);

    console.log(`[dos.library] FRead(fh=${fileHandle}, buf=0x${bufAddr.toString(16)}, blocklen=${blockLen}, blocks=${numBlocks})`);

    if (blockLen <= 0 || numBlocks <= 0) {
      this.emulator.setRegister(CPURegister.D0, 0);
      this.lastError = this.ERROR_NO_ERROR;
      console.log('[dos.library] FRead: Invalid block length or count');
      return;
    }

    if (this.useNewFileSystem && this.fileManager) {
      const fh = this.fileManager.getHandle(fileHandle);
      if (!fh) {
        this.emulator.setRegister(CPURegister.D0, 0);
        this.lastError = this.ERROR_OBJECT_NOT_FOUND;
        console.log('[dos.library] FRead (FileManager): Invalid BPTR');
        return;
      }

      let blocksRead = 0;
      for (let block = 0; block < numBlocks; block++) {
        const data = this.fileManager.read(fileHandle, blockLen);
        if (data.length < blockLen) {
          if (data.length > 0) {
            // Rewind file pointer since we cannot complete this block
            this.fileManager.seek(fileHandle, -data.length, 1);
          }
          this.emulator.setRegister(CPURegister.D0, blocksRead);
          this.lastError = this.ERROR_NO_ERROR;
          console.log(`[dos.library] FRead (FileManager): EOF after ${blocksRead} blocks`);
          return;
        }

        for (let i = 0; i < data.length; i++) {
          this.emulator.writeMemory(bufAddr + block * blockLen + i, data[i]);
        }
        blocksRead++;
      }

      this.emulator.setRegister(CPURegister.D0, blocksRead);
      this.lastError = this.ERROR_NO_ERROR;
      console.log(`[dos.library] FRead (FileManager): Read ${blocksRead} blocks (${blocksRead * blockLen} bytes)`);
      return;
    }

    const file = this.openFiles.get(fileHandle);
    if (!file) {
      this.emulator.setRegister(CPURegister.D0, 0); // 0 blocks read
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
      console.log(`[dos.library] FRead: Invalid file handle`);
      return;
    }

    if (!file.buffer || file.position >= file.buffer.length) {
      this.emulator.setRegister(CPURegister.D0, 0); // EOF
      console.log(`[dos.library] FRead: EOF`);
      return;
    }

    // Read blocks
    let blocksRead = 0;
    const bytesPerBlock = blockLen;
    const totalBytes = blockLen * numBlocks;

    for (let block = 0; block < numBlocks; block++) {
      const blockOffset = block * bytesPerBlock;

      // Read one block
      for (let i = 0; i < bytesPerBlock; i++) {
        if (file.position >= file.buffer.length) {
          // EOF reached mid-block
          this.emulator.setRegister(CPURegister.D0, blocksRead);
          console.log(`[dos.library] FRead: EOF mid-block, read ${blocksRead} complete blocks`);
          return;
        }

        const byte = file.buffer[file.position++];
        this.emulator.writeMemory(bufAddr + blockOffset + i, byte);
      }

      blocksRead++;
    }

    this.emulator.setRegister(CPURegister.D0, blocksRead);
    console.log(`[dos.library] FRead: Read ${blocksRead} blocks (${blocksRead * bytesPerBlock} bytes)`);
  }

  /**
   * FWrite - Write blocks to file (buffered) (V36)
   * D1 = file handle (BPTR)
   * D2 = buffer address (STRPTR)
   * D3 = block length (ULONG, must be > 0)
   * D4 = number of blocks (ULONG, must be > 0)
   * Returns: D0 = number of blocks written
   */
  FWrite(): void {
    const fileHandle = this.emulator.getRegister(CPURegister.D1);
    const bufAddr = this.emulator.getRegister(CPURegister.D2);
    const blockLen = this.emulator.getRegister(CPURegister.D3);
    const numBlocks = this.emulator.getRegister(CPURegister.D4);

    console.log(`[dos.library] FWrite(fh=${fileHandle}, buf=0x${bufAddr.toString(16)}, blocklen=${blockLen}, blocks=${numBlocks})`);

    const file = this.openFiles.get(fileHandle);
    if (!file) {
      this.emulator.setRegister(CPURegister.D0, 0); // 0 blocks written
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
      console.log(`[dos.library] FWrite: Invalid file handle`);
      return;
    }

    // Console output
    if (file.isConsole) {
      const totalBytes = blockLen * numBlocks;
      const bytes: number[] = [];
      for (let i = 0; i < totalBytes; i++) {
        bytes.push(this.emulator.readMemory(bufAddr + i));
      }
      const str = String.fromCharCode(...bytes);
      if (this.outputCallback) {
        this.outputCallback(str);
      }
      this.emulator.setRegister(CPURegister.D0, numBlocks);
      console.log(`[dos.library] FWrite: Console output (${totalBytes} bytes)`);
      return;
    }

    // Regular file - write blocks
    if (!file.buffer) {
      file.buffer = Buffer.alloc(0);
    }

    const totalBytes = blockLen * numBlocks;
    const bytes: number[] = [];
    for (let i = 0; i < totalBytes; i++) {
      bytes.push(this.emulator.readMemory(bufAddr + i));
    }

    const newData = Buffer.from(bytes);
    file.buffer = Buffer.concat([file.buffer, newData]);
    file.position = file.buffer.length;

    this.emulator.setRegister(CPURegister.D0, numBlocks);
    console.log(`[dos.library] FWrite: Wrote ${numBlocks} blocks (${totalBytes} bytes)`);
  }

  /**
   * VFPrintf - Formatted print to file (buffered) (V36)
   * D1 = file handle (BPTR)
   * D2 = format string (STRPTR, RawDoFmt style)
   * D3 = argv pointer (LONG array)
   * Returns: D0 = number of bytes written or -1 for error
   */
  VFPrintf(): void {
    const fileHandle = this.emulator.getRegister(CPURegister.D1);
    const fmtAddr = this.emulator.getRegister(CPURegister.D2);
    const argvAddr = this.emulator.getRegister(CPURegister.D3);

    const fmt = this.readString(fmtAddr);
    console.log(`[dos.library] VFPrintf(fh=${fileHandle}, fmt="${fmt}")`);

    const file = this.openFiles.get(fileHandle);
    if (!file) {
      this.emulator.setRegister(CPURegister.D0, -1); // EOF
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
      console.log(`[dos.library] VFPrintf: Invalid file handle`);
      return;
    }

    // Parse format string and arguments (simple implementation)
    const formatted = this.formatString(fmt, argvAddr);

    // Write to file or console
    if (file.isConsole) {
      if (this.outputCallback) {
        this.outputCallback(formatted);
      }
    } else {
      if (!file.buffer) {
        file.buffer = Buffer.alloc(0);
      }
      const formattedBuf = Buffer.from(formatted, 'binary');
      file.buffer = Buffer.concat([file.buffer, formattedBuf]);
      file.position = file.buffer.length;
    }

    this.emulator.setRegister(CPURegister.D0, formatted.length);
    console.log(`[dos.library] VFPrintf: Wrote ${formatted.length} bytes`);
  }

  /**
   * VPrintf - Formatted print to Output() (buffered) (V36)
   * D1 = format string (STRPTR, RawDoFmt style)
   * D2 = argv pointer (LONG array)
   * Returns: D0 = number of bytes written or -1 for error
   */
  VPrintf(): void {
    const fmtAddr = this.emulator.getRegister(CPURegister.D1);
    const argvAddr = this.emulator.getRegister(CPURegister.D2);

    const fmt = this.readString(fmtAddr);
    console.log(`[dos.library] VPrintf(fmt="${fmt}")`);

    // Format string
    const formatted = this.formatString(fmt, argvAddr);

    // Write to Output()
    if (this.outputCallback) {
      this.outputCallback(formatted);
    }

    this.emulator.setRegister(CPURegister.D0, formatted.length);
    console.log(`[dos.library] VPrintf: Wrote ${formatted.length} bytes to Output()`);
  }

  /**
   * Helper: Simple printf-style formatting (RawDoFmt compatible)
   * Supports: %s (string), %ld/%d (decimal), %lx/%x (hex), %c (char)
   */
  private formatString(fmt: string, argvAddr: number): string {
    let result = '';
    let argIndex = 0;

    for (let i = 0; i < fmt.length; i++) {
      if (fmt[i] === '%' && i + 1 < fmt.length) {
        const spec = fmt[i + 1];
        let longFormat = false;

        // Check for 'l' prefix (e.g., %ld, %lx)
        if (spec === 'l' && i + 2 < fmt.length) {
          longFormat = true;
          i++; // Skip 'l'
        }

        const actualSpec = longFormat ? fmt[i + 1] : spec;

        switch (actualSpec) {
          case 's': {
            // String pointer
            const strPtr = this.emulator.readMemory32(argvAddr + argIndex * 4);
            const str = this.readString(strPtr);
            result += str;
            argIndex++;
            i++;
            break;
          }
          case 'd': {
            // Decimal integer
            const value = this.emulator.readMemory32(argvAddr + argIndex * 4);
            // Handle as signed
            const signed = value > 0x7FFFFFFF ? value - 0x100000000 : value;
            result += signed.toString(10);
            argIndex++;
            i++;
            break;
          }
          case 'x': {
            // Hexadecimal
            const value = this.emulator.readMemory32(argvAddr + argIndex * 4);
            result += value.toString(16);
            argIndex++;
            i++;
            break;
          }
          case 'c': {
            // Character
            const value = this.emulator.readMemory32(argvAddr + argIndex * 4);
            result += String.fromCharCode(value & 0xFF);
            argIndex++;
            i++;
            break;
          }
          default:
            // Unknown format, just output as-is
            result += '%' + (longFormat ? 'l' : '') + actualSpec;
            i++;
            break;
        }

        if (longFormat) i++; // Skip the format character after 'l'
      } else {
        result += fmt[i];
      }
    }

    return result;
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
   * Helper: Write null-terminated C string to memory
   */
  private writeString(address: number, str: string): void {
    for (let i = 0; i < str.length; i++) {
      this.emulator.writeMemory(address + i, str.charCodeAt(i));
    }
    // Null terminator
    this.emulator.writeMemory(address + str.length, 0);
  }

  private getOrCreateReadArgsContext(rdargsAddr: number): ReadArgsContextInfo | null {
    if (rdargsAddr !== 0) {
      const existing = this.readArgsContexts.get(rdargsAddr);
      if (existing) {
        existing.bufferOffset = 0;
        return { rdArgsPtr: rdargsAddr, context: existing };
      }
    }

    let ownsStruct = false;
    if (rdargsAddr === 0) {
      rdargsAddr = this.allocateReadArgsBufferInternal(32);
      if (rdargsAddr === 0) {
        return null;
      }
      this.zeroMemory(rdargsAddr, 32);
      ownsStruct = true;
    }

    let bufferPtr = this.emulator.readMemory32(rdargsAddr + 16);
    let bufferSize = this.emulator.readMemory32(rdargsAddr + 20);
    let ownsBuffer = false;

    if (bufferPtr === 0 || bufferSize === 0) {
      bufferPtr = this.allocateReadArgsBufferInternal(this.READARGS_DEFAULT_BUFFER_SIZE);
      if (bufferPtr === 0) {
        return null;
      }
      bufferSize = this.READARGS_DEFAULT_BUFFER_SIZE;
      ownsBuffer = true;
      this.writeLong(rdargsAddr + 16, bufferPtr);
      this.writeLong(rdargsAddr + 20, bufferSize);
    }

    const context: ReadArgsContext = {
      rdArgsPtr: rdargsAddr,
      bufferPtr,
      bufferSize,
      bufferOffset: 0,
      ownsBuffer,
      ownsStruct,
    };

    this.readArgsContexts.set(rdargsAddr, context);
    return { rdArgsPtr: rdargsAddr, context };
  }

  private parseReadArgsTemplate(template: string): ReadArgsTemplateEntry[] {
    return template
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .map((entry) => {
        const [namePart, ...modifierParts] = entry.split('/');
        const modifiers = modifierParts.map((m) => m.trim().toUpperCase()).filter(Boolean);
        const aliasParts = namePart.split('=').map((part) => part.trim()).filter(Boolean);
        const canonical = aliasParts.length > 0 ? aliasParts[aliasParts.length - 1] : '';
        const aliases = aliasParts.slice(0, -1);
        const namesUpper = [canonical, ...aliases].filter(Boolean).map((n) => n.toUpperCase());
        return {
          displayName: canonical || entry,
          namesUpper,
          required: modifiers.includes('A'),
          isSwitch: modifiers.includes('S'),
          isKeyword: modifiers.includes('K'),
          isNumeric: modifiers.includes('N'),
          isMultiple: modifiers.includes('M'),
          isRest: modifiers.includes('F'),
          isToggle: modifiers.includes('T'),
        } as ReadArgsTemplateEntry;
      });
  }

  private getReadArgsInputString(rdargsPtr: number): ReadArgsInputInfo {
    const sourcePtr = this.emulator.readMemory32(rdargsPtr);
    const sourceLength = this.emulator.readMemory32(rdargsPtr + 4);
    const sourceCur = this.emulator.readMemory32(rdargsPtr + 8);
    if (sourcePtr !== 0 && sourceLength > 0) {
      const remaining = Math.max(0, sourceLength - Math.max(0, sourceCur));
      const text = this.readFixedString(sourcePtr + sourceCur, remaining);
      return { input: text.trim(), sourcePtr, length: remaining };
    }

    if (this.argStringPtr !== 0) {
      const cli = this.readString(this.argStringPtr, 1024);
      return { input: cli.trim(), sourcePtr: this.argStringPtr, length: cli.length };
    }

    return { input: '', sourcePtr: 0, length: 0 };
  }

  private readFixedString(address: number, length: number): string {
    const bytes: number[] = [];
    for (let i = 0; i < length; i++) {
      const value = this.emulator.readMemory(address + i);
      if (value === 0) {
        break;
      }
      bytes.push(value);
    }
    return String.fromCharCode(...bytes);
  }

  private tokenizeReadArgsInput(input: string): ReadArgsTokenResult {
    const tokens: ReadArgsToken[] = [];
    let current = '';
    let inQuotes = false;
    let escapeNext = false;

    const flushToken = () => {
      const trimmed = current.trim();
      if (trimmed.length > 0) {
        const eqIndex = trimmed.indexOf('=');
        const token: ReadArgsToken = {
          raw: trimmed,
          value: eqIndex >= 0 ? trimmed.slice(eqIndex + 1) : trimmed,
          normalizedValue: trimmed.toUpperCase(),
          consumed: false,
        };
        if (eqIndex > 0) {
          token.key = trimmed.slice(0, eqIndex);
          token.keyUpper = token.key.toUpperCase();
          token.normalizedValue = (token.value || '').toUpperCase();
        }
        tokens.push(token);
      }
      current = '';
    };

    for (let i = 0; i < input.length; i++) {
      const ch = input[i];
      if (escapeNext) {
        current += ch;
        escapeNext = false;
        continue;
      }
      if (ch === '\\' && inQuotes) {
        escapeNext = true;
        continue;
      }
      if (ch === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (!inQuotes && /\s/.test(ch)) {
        flushToken();
        continue;
      }
      current += ch;
    }

    if (inQuotes) {
      return { tokens: [], error: this.ERROR_UNMATCHED_QUOTES };
    }
    flushToken();
    return { tokens };
  }

  private consumeNamedArgument(
    tokens: ReadArgsToken[],
    entry: ReadArgsTemplateEntry,
    requireKeyword: boolean,
    templateNames: Set<string>,
    consumedTokens: Set<number>
  ): string | 'NEED_VALUE' | null {
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.consumed || !token.keyUpper) {
        continue;
      }
      if (entry.namesUpper.includes(token.keyUpper)) {
        token.consumed = true;
        consumedTokens.add(i);
        return token.value;
      }
    }

    if (!requireKeyword) {
      return null;
    }

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.consumed) {
        continue;
      }
      if (entry.namesUpper.includes(token.normalizedValue)) {
        token.consumed = true;
        consumedTokens.add(i);
        const nextToken = this.findNextValueToken(tokens, i + 1, templateNames, consumedTokens);
        if (!nextToken) {
          return 'NEED_VALUE';
        }
        return nextToken.value;
      }
    }

    return null;
  }

  private findNextValueToken(
    tokens: ReadArgsToken[],
    startIndex: number,
    names: Set<string>,
    consumedTokens: Set<number>
  ): ReadArgsToken | null {
    for (let i = startIndex; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.consumed) {
        continue;
      }
      if (token.keyUpper || names.has(token.normalizedValue)) {
        return null;
      }
      token.consumed = true;
      consumedTokens.add(i);
      return token;
    }
    return null;
  }

  private consumePositionalValue(
    tokens: ReadArgsToken[],
    reservedNames: Set<string>,
    consumedTokens: Set<number>
  ): string | null {
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.consumed || token.keyUpper) {
        continue;
      }
      if (reservedNames.has(token.normalizedValue)) {
        continue;
      }
      token.consumed = true;
      consumedTokens.add(i);
      return token.value;
    }
    return null;
  }

  private parseReadArgsNumber(value: string): number | null {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return null;
    }
    let base = 10;
    let str = trimmed;
    if (str.startsWith('$')) {
      base = 16;
      str = str.slice(1);
    } else if (str.startsWith('0x') || str.startsWith('0X')) {
      base = 16;
      str = str.slice(2);
    }
    const parsed = parseInt(str, base);
    if (Number.isNaN(parsed)) {
      return null;
    }
    return (parsed << 0);
  }

  private allocateStringStorage(context: ReadArgsContext, value: string): number | null {
    const addr = this.allocateFromReadArgsContext(context, value.length + 1);
    if (!addr) {
      return null;
    }
    this.writeString(addr, value);
    return addr;
  }

  private allocateNumberStorage(context: ReadArgsContext, num: number): number | null {
    const addr = this.allocateFromReadArgsContext(context, 4);
    if (!addr) {
      return null;
    }
    this.writeLong(addr, num);
    return addr;
  }

  private allocatePointerArray(context: ReadArgsContext, count: number): number | null {
    return this.allocateFromReadArgsContext(context, count * 4);
  }

  private allocateFromReadArgsContext(context: ReadArgsContext, size: number): number | null {
    const aligned = (size + 3) & ~3;
    if (context.bufferPtr === 0 || context.bufferSize === 0) {
      const bufferPtr = this.allocateReadArgsBufferInternal(
        Math.max(this.READARGS_DEFAULT_BUFFER_SIZE, aligned)
      );
      if (bufferPtr === 0) {
        return null;
      }
      context.bufferPtr = bufferPtr;
      context.bufferSize = Math.max(this.READARGS_DEFAULT_BUFFER_SIZE, aligned);
      context.bufferOffset = 0;
      context.ownsBuffer = true;
      this.writeLong(context.rdArgsPtr + 16, context.bufferPtr);
      this.writeLong(context.rdArgsPtr + 20, context.bufferSize);
    }

    if (context.bufferOffset + aligned > context.bufferSize) {
      return null;
    }

    const addr = context.bufferPtr + context.bufferOffset;
    this.zeroMemory(addr, aligned);
    context.bufferOffset += aligned;
    return addr;
  }

  private allocateReadArgsBufferInternal(size: number): number {
    const aligned = (size + 3) & ~3;
    if (
      aligned === this.READARGS_DEFAULT_BUFFER_SIZE &&
      this.readArgsBufferPool.length > 0
    ) {
      const addr = this.readArgsBufferPool.pop() as number;
      this.zeroMemory(addr, aligned);
      return addr;
    }
    const addr = this.readArgsHeapPtr;
    this.readArgsHeapPtr += aligned;
    this.zeroMemory(addr, aligned);
    return addr;
  }

  private zeroMemory(address: number, size: number): void {
    for (let i = 0; i < size; i++) {
      this.emulator.writeMemory(address + i, 0);
    }
  }

  // ============================================================================
  // PHASE 2: PATH AND ERROR HANDLING FUNCTIONS (V36+)
  // ============================================================================

  /**
   * NameFromLock - Returns the name of a locked object (V36)
   * D1 = lock (BPTR)
   * D2 = buffer (STRPTR)
   * D3 = len (LONG)
   * Returns: D0 = success (BOOL) - TRUE if successful, FALSE otherwise
   *
   * Returns a fully qualified path for the lock.
   * If lock is NULL, returns "SYS:"
   * Sets IoErr() to ERROR_LINE_TOO_LONG if buffer too short
   */
  NameFromLock(): void {
    const lock = this.emulator.getRegister(CPURegister.D1);
    const bufAddr = this.emulator.getRegister(CPURegister.D2);
    const bufLen = this.emulator.getRegister(CPURegister.D3);

    console.log(`[dos.library] NameFromLock(lock=${lock.toString(16)}, buf=${bufAddr.toString(16)}, len=${bufLen})`);

    // If lock is NULL, return "SYS:"
    if (lock === 0) {
      const path = "SYS:";
      if (bufLen < path.length + 1) {
        this.lastError = 120; // ERROR_LINE_TOO_LONG
        this.emulator.setRegister(CPURegister.D0, 0); // FALSE
        return;
      }
      this.writeString(bufAddr, path);
      this.emulator.setRegister(CPURegister.D0, -1); // TRUE
      return;
    }

    // Look up lock in our locks map
    const lockInfo = this.locks.get(lock);
    if (!lockInfo) {
      console.log(`[dos.library] NameFromLock: Lock ${lock.toString(16)} not found`);
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
      this.emulator.setRegister(CPURegister.D0, 0); // FALSE
      return;
    }

    const path = lockInfo.path;
    if (bufLen < path.length + 1) {
      this.lastError = 120; // ERROR_LINE_TOO_LONG
      this.emulator.setRegister(CPURegister.D0, 0); // FALSE
      return;
    }

    this.writeString(bufAddr, path);
    console.log(`[dos.library] NameFromLock returned: ${path}`);
    this.emulator.setRegister(CPURegister.D0, -1); // TRUE
  }

  /**
   * NameFromFH - Get the name of an open filehandle (V36)
   * D1 = fh (BPTR)
   * D2 = buffer (STRPTR)
   * D3 = len (LONG)
   * Returns: D0 = success (BOOL) - TRUE if successful, FALSE otherwise
   */
  NameFromFH(): void {
    const fileHandle = this.emulator.getRegister(CPURegister.D1);
    const bufAddr = this.emulator.getRegister(CPURegister.D2);
    const bufLen = this.emulator.getRegister(CPURegister.D3);

    console.log(`[dos.library] NameFromFH(fh=${fileHandle.toString(16)}, buf=${bufAddr.toString(16)}, len=${bufLen})`);

    const file = this.openFiles.get(fileHandle);
    if (!file) {
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
      this.emulator.setRegister(CPURegister.D0, 0); // FALSE
      return;
    }

    const path = file.realPath || file.name;
    if (bufLen < path.length + 1) {
      this.lastError = 120; // ERROR_LINE_TOO_LONG
      this.emulator.setRegister(CPURegister.D0, 0); // FALSE
      return;
    }

    this.writeString(bufAddr, path);
    console.log(`[dos.library] NameFromFH returned: ${path}`);
    this.emulator.setRegister(CPURegister.D0, -1); // TRUE
  }

  /**
   * FilePart - Returns the last component of a path (V36)
   * D1 = path (STRPTR)
   * Returns: D0 = pointer to last component (STRPTR)
   *
   * Returns a pointer to the last component of a path (normally the filename).
   * Example: "xxx:yyy/zzz/qqq" returns pointer to "qqq"
   */
  FilePart(): void {
    const pathAddr = this.emulator.getRegister(CPURegister.D1);
    const path = this.readString(pathAddr);

    console.log(`[dos.library] FilePart(path="${path}")`);

    // Find last '/' or ':'
    let lastSep = -1;
    for (let i = path.length - 1; i >= 0; i--) {
      if (path[i] === '/' || path[i] === ':') {
        lastSep = i;
        break;
      }
    }

    // Return pointer to character after last separator (or start if no separator)
    const offset = lastSep + 1;
    const resultAddr = pathAddr + offset;

    console.log(`[dos.library] FilePart returned offset ${offset}, addr=${resultAddr.toString(16)}`);
    this.emulator.setRegister(CPURegister.D0, resultAddr);
  }

  /**
   * PathPart - Returns pointer to end of next-to-last component (V36)
   * D1 = path (STRPTR)
   * Returns: D0 = pointer to end of directory part (STRPTR)
   *
   * Returns a pointer to the character after the next-to-last component.
   * Example: "xxx:yyy/zzz/qqq" returns pointer to last '/'
   * Example: "xxx:yyy" returns pointer to first 'y'
   */
  PathPart(): void {
    const pathAddr = this.emulator.getRegister(CPURegister.D1);
    const path = this.readString(pathAddr);

    console.log(`[dos.library] PathPart(path="${path}")`);

    // Find last '/'
    let lastSlash = -1;
    for (let i = path.length - 1; i >= 0; i--) {
      if (path[i] === '/') {
        lastSlash = i;
        break;
      }
    }

    if (lastSlash >= 0) {
      // Return pointer to the '/'
      const resultAddr = pathAddr + lastSlash;
      console.log(`[dos.library] PathPart returned offset ${lastSlash}, addr=${resultAddr.toString(16)}`);
      this.emulator.setRegister(CPURegister.D0, resultAddr);
      return;
    }

    // No '/', find last ':'
    let lastColon = -1;
    for (let i = path.length - 1; i >= 0; i--) {
      if (path[i] === ':') {
        lastColon = i;
        break;
      }
    }

    // Return pointer after the ':' or to beginning
    const offset = lastColon + 1;
    const resultAddr = pathAddr + offset;
    console.log(`[dos.library] PathPart returned offset ${offset}, addr=${resultAddr.toString(16)}`);
    this.emulator.setRegister(CPURegister.D0, resultAddr);
  }

  /**
   * Fault - Returns the text associated with a DOS error code (V36)
   * D1 = code (LONG)
   * D2 = header (STRPTR)
   * D3 = buffer (STRPTR)
   * D4 = len (LONG)
   * Returns: D0 = length of message (LONG) - 0 if code was 0
   *
   * Obtains error message text for the given error code.
   * The header is prepended to the text followed by a colon.
   * Sets IoErr() to the code passed in.
   */
  Fault(): void {
    const code = this.emulator.getRegister(CPURegister.D1);
    const headerAddr = this.emulator.getRegister(CPURegister.D2);
    const bufAddr = this.emulator.getRegister(CPURegister.D3);
    const bufLen = this.emulator.getRegister(CPURegister.D4);

    this.lastError = code;

    if (code === 0) {
      this.emulator.writeMemory(bufAddr, 0); // Empty string
      this.emulator.setRegister(CPURegister.D0, 0);
      return;
    }

    const header = headerAddr ? this.readString(headerAddr) : "";
    const errorMsg = this.getErrorMessage(code);

    let message: string;
    if (header) {
      message = `${header}: ${errorMsg}`;
    } else {
      message = errorMsg;
    }

    console.log(`[dos.library] Fault(code=${code}, header="${header}") -> "${message}"`);

    // Truncate if necessary
    if (message.length >= bufLen) {
      message = message.substring(0, bufLen - 1);
    }

    this.writeString(bufAddr, message);
    this.emulator.setRegister(CPURegister.D0, message.length);
  }

  /**
   * PrintFault - Prints the text associated with a DOS error code (V36)
   * D1 = code (LONG)
   * D2 = header (STRPTR)
   * Returns: D0 = success (BOOL)
   *
   * Similar to Fault() but outputs to Output() stream.
   * Sets IoErr() to the code passed in.
   */
  PrintFault(): void {
    const code = this.emulator.getRegister(CPURegister.D1);
    const headerAddr = this.emulator.getRegister(CPURegister.D2);

    this.lastError = code;

    const header = headerAddr ? this.readString(headerAddr) : "";
    const errorMsg = this.getErrorMessage(code);

    let message: string;
    if (header) {
      message = `${header}: ${errorMsg}\n`;
    } else {
      message = `${errorMsg}\n`;
    }

    console.log(`[dos.library] PrintFault(code=${code}, header="${header}") -> "${message}"`);

    // Write to Output() stream (stdout)
    if (this.outputCallback) {
      this.outputCallback(message);
    }

    this.emulator.setRegister(CPURegister.D0, -1); // TRUE
  }

  /**
   * Helper: Get error message text for DOS error code
   */
  private getErrorMessage(code: number): string {
    const errorMessages: Record<number, string> = {
      103: "Insufficient free store",
      120: "Line too long",
      202: "Object not found",
      203: "Object wrong type",
      204: "Disk write protected",
      205: "Directory not found",
      206: "Object too large",
      209: "Invalid stream component name",
      210: "Invalid object lock",
      211: "Object already exists",
      212: "Directory not empty",
      213: "Seek error",
      214: "Comment too long",
      215: "Disk is full",
      216: "File is protected from deletion",
      217: "File is protected from writing",
      218: "File is protected from reading",
      219: "Not a DOS disk",
      220: "No disk in drive",
      221: "No more entries in directory",
      222: "Object is soft link",
      223: "Object is linked",
      224: "Bad loadfile hunk",
      225: "Function not implemented",
      226: "Bad number",
      232: "No default directory",
      233: "Seek error beyond end of file"
    };

    return errorMessages[code] || `Error code ${code}`;
  }

  // ============================================================================
  // PHASE 4: CRITICAL FUNCTIONS FOR 68K DOOR COMPATIBILITY
  // Identified from comprehensive analysis of 17 AmiExpress door source files
  // ============================================================================

  /**
   * ReadArgs - Parse command-line arguments (V36+)
   * Used by: QuickNew.asm line 53, DiscordAnnounce.e, MultiTop2
   *
   * Signature: struct RDArgs *ReadArgs(STRPTR template, LONG *array, struct RDArgs *rdargs)
   * D1 = template string pointer
   * D2 = array pointer (results)
   * D3 = RDArgs pointer (or NULL)
   * Returns: RDArgs pointer in D0 (NULL on error)
   *
   * Template modifiers:
   * /A = Required argument
   * /S = Switch (boolean)
   * /K = Keyword required
   * /N = Numeric value
   * /M = Multiple strings
   * /F = Rest of line
   * /T = Toggle switch
  */
  ReadArgs(): void {
    const templateAddr = this.emulator.getRegister(CPURegister.D1);
    const arrayAddr = this.emulator.getRegister(CPURegister.D2);
    let rdargsAddr = this.emulator.getRegister(CPURegister.D3);

    if (templateAddr === 0 || arrayAddr === 0) {
      console.log('[dos.library] ReadArgs() - Invalid template or array pointer');
      this.emulator.setRegister(CPURegister.D0, 0);
      this.lastError = this.ERROR_BAD_TEMPLATE;
      return;
    }

    const template = this.readString(templateAddr, 1024);
    console.log(
      `[dos.library] ReadArgs(template="${template}", array=0x${arrayAddr.toString(
        16
      )}, rdargs=0x${rdargsAddr.toString(16)})`
    );

    const entries = this.parseReadArgsTemplate(template);
    if (entries.length === 0) {
      console.log('[dos.library] ReadArgs() - No template entries, returning existing RDArgs');
      this.emulator.setRegister(CPURegister.D0, rdargsAddr);
      this.lastError = this.ERROR_NO_ERROR;
      return;
    }

    const contextInfo = this.getOrCreateReadArgsContext(rdargsAddr);
    if (!contextInfo) {
      this.emulator.setRegister(CPURegister.D0, 0);
      this.lastError = this.ERROR_NO_FREE_STORE;
      return;
    }

    rdargsAddr = contextInfo.rdArgsPtr;
    const context = contextInfo.context;
    context.bufferOffset = 0;

    const inputInfo = this.getReadArgsInputString(rdargsAddr);
    const tokenResult = this.tokenizeReadArgsInput(inputInfo.input);
    if (tokenResult.error) {
      this.emulator.setRegister(CPURegister.D0, 0);
      this.lastError = tokenResult.error;
      return;
    }

    this.writeLong(rdargsAddr, inputInfo.sourcePtr);
    this.writeLong(rdargsAddr + 4, inputInfo.length);
    this.writeLong(rdargsAddr + 8, inputInfo.length);

    const allNames = new Set<string>();
    const reservedNames = new Set<string>();
    entries.forEach((entry) => {
      entry.namesUpper.forEach((name) => allNames.add(name));
      if (entry.isSwitch || entry.isKeyword || entry.isToggle) {
        entry.namesUpper.forEach((name) => reservedNames.add(name));
      }
    });

    const tokens = tokenResult.tokens;
    const entryState = entries.map(() => ({
      provided: false,
    }));
    const consumedTokens = new Set<number>();

    const setArrayValue = (index: number, value: number): void => {
      if (arrayAddr !== 0) {
        this.emulator.writeMemory32(arrayAddr + index * 4, value);
      }
    };

    const fail = (code: number, message: string): void => {
      console.log(`[dos.library] ReadArgs() ERROR ${code}: ${message}`);
      this.emulator.setRegister(CPURegister.D0, 0);
      this.lastError = code;
    };

    let multiEntry = -1;
    entries.forEach((entry, idx) => {
      if (entry.isMultiple) {
        multiEntry = idx;
      }
    });

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];

      if (entry.isMultiple) {
        continue;
      }

      if (entry.isSwitch || entry.isToggle) {
        let state = false;
        let matched = false;
        tokens.forEach((token, idx) => {
          const tokenName = token.keyUpper || token.normalizedValue;
          if (
            !token.consumed &&
            tokenName &&
            entry.namesUpper.includes(tokenName)
          ) {
            token.consumed = true;
            consumedTokens.add(idx);
            matched = true;
            state = entry.isToggle ? !state : true;
          }
        });

        if (matched) {
          entryState[i].provided = true;
          setArrayValue(i, state ? -1 : 0);
        }
        continue;
      }

      let stringValue: string | null = null;
      let numericValue: number | null = null;

      const namedValue = this.consumeNamedArgument(
        tokens,
        entry,
        entry.isKeyword,
        allNames,
        consumedTokens
      );

      if (namedValue === 'NEED_VALUE') {
        fail(this.ERROR_KEY_NEEDS_ARG, `${entry.displayName} missing value`);
        return;
      }

      if (namedValue && namedValue !== 'NEED_VALUE') {
        stringValue = namedValue;
      } else if (!entry.isKeyword) {
        const positional = this.consumePositionalValue(
          tokens,
          reservedNames,
          consumedTokens
        );
        if (positional) {
          stringValue = positional;
        }
      }

      if (stringValue !== null && entry.isNumeric) {
        const parsed = this.parseReadArgsNumber(stringValue);
        if (parsed === null) {
          fail(this.ERROR_BAD_NUMBER, `Invalid number for ${entry.displayName}`);
          return;
        }
        numericValue = parsed;
      }

      if (stringValue !== null) {
        entryState[i].provided = true;
        if (entry.isNumeric && numericValue !== null) {
          const ptr = this.allocateNumberStorage(context, numericValue);
          if (!ptr) {
            fail(this.ERROR_LINE_TOO_LONG, 'Insufficient buffer for numeric value');
            return;
          }
          setArrayValue(i, ptr);
        } else {
          const ptr = this.allocateStringStorage(context, stringValue);
          if (!ptr) {
            fail(this.ERROR_LINE_TOO_LONG, 'Insufficient buffer for string value');
            return;
          }
          setArrayValue(i, ptr);
        }
      }
    }

    if (multiEntry !== -1) {
      const multiStrings: string[] = [];
      tokens.forEach((token, idx) => {
        if (!token.consumed && token.value.length > 0) {
          multiStrings.push(token.value);
          token.consumed = true;
          consumedTokens.add(idx);
        }
      });

      if (multiStrings.length > 0) {
        const ptrArray = this.allocatePointerArray(
          context,
          multiStrings.length + 1
        );
        if (!ptrArray) {
          fail(this.ERROR_LINE_TOO_LONG, 'Insufficient buffer for multi arguments');
          return;
        }
        let offset = 0;
        for (const value of multiStrings) {
          const ptr = this.allocateStringStorage(context, value);
          if (!ptr) {
            fail(this.ERROR_LINE_TOO_LONG, 'Insufficient buffer for multi value');
            return;
          }
          this.emulator.writeMemory32(ptrArray + offset, ptr);
          offset += 4;
        }
        this.emulator.writeMemory32(ptrArray + offset, 0);
        entryState[multiEntry].provided = true;
        setArrayValue(multiEntry, ptrArray);
      }
    }

    const missing = entries.filter(
      (entry, idx) => entry.required && !entryState[idx].provided
    );
    if (missing.length > 0) {
      fail(
        this.ERROR_REQUIRED_ARG_MISSING,
        `Missing required arguments: ${missing.map((m) => m.displayName).join(', ')}`
      );
      return;
    }

    const leftovers = tokens.filter(
      (token) => !token.consumed && (token.keyUpper || token.value.length > 0)
    );
    if (leftovers.length > 0) {
      console.log(
        `[dos.library] ReadArgs() - ignoring extra tokens: ${leftovers
          .map((t) => t.raw)
          .join(' ')}`
      );
    }

    this.emulator.setRegister(CPURegister.D0, rdargsAddr);
    this.lastError = this.ERROR_NO_ERROR;
  }

  /**
   * FreeArgs - Free memory allocated by ReadArgs (V36+)
   * Used by: QuickNew.asm lines 75, 222, DiscordAnnounce.e
   *
   * Signature: VOID FreeArgs(struct RDArgs *args)
   * D1 = RDArgs pointer
   */
  FreeArgs(): void {
    const rdargsAddr = this.emulator.getRegister(CPURegister.D1);

    console.log(`[dos.library] FreeArgs(rdargs=0x${rdargsAddr.toString(16)})`);

    if (rdargsAddr === 0) {
      console.log(`[dos.library] FreeArgs() - NULL pointer, nothing to free`);
      this.lastError = this.ERROR_NO_ERROR;
      return;
    }

    const context = this.readArgsContexts.get(rdargsAddr);
    if (!context) {
      console.log(
        `[dos.library] FreeArgs() - no tracked context for 0x${rdargsAddr.toString(16)}`
      );
      this.lastError = this.ERROR_NO_ERROR;
      return;
    }

    if (context.ownsBuffer && context.bufferPtr !== 0) {
      this.zeroMemory(context.bufferPtr, context.bufferSize);
      if (context.bufferSize === this.READARGS_DEFAULT_BUFFER_SIZE) {
        this.readArgsBufferPool.push(context.bufferPtr);
      }
    }

    this.readArgsContexts.delete(rdargsAddr);
    this.lastError = this.ERROR_NO_ERROR;
  }

  /**
   * DateToStr - Convert DateStamp to formatted string (V36+)
   * Used by: QuickNew.asm lines 330, 336, MultiTop2
   *
   * Signature: BOOL DateToStr(struct DateTime *datetime)
   * D1 = DateTime pointer
   * Returns: BOOL success in D0
   *
   * DateTime structure:
   * - struct DateStamp dat_Stamp (12 bytes)
   * - UBYTE dat_Format (1 byte)
   * - UBYTE dat_Flags (1 byte)
   * - STRPTR dat_StrDate (4 bytes)
   * - STRPTR dat_StrTime (4 bytes)
   * - STRPTR dat_StrDay (4 bytes)
   *
   * Formats:
   * 0 = FORMAT_DOS (dd-mmm-yy)
   * 1 = FORMAT_INT (yy-mm-dd)
   * 2 = FORMAT_USA (mm-dd-yy)
   * 3 = FORMAT_CDN (dd-mm-yy)
   */
  DateToStr(): void {
    const datetimeAddr = this.emulator.getRegister(CPURegister.D1);

    // Read DateTime structure
    const ds_Days = this.emulator.readMemory32(datetimeAddr);
    const ds_Minute = this.emulator.readMemory32(datetimeAddr + 4);
    const ds_Tick = this.emulator.readMemory32(datetimeAddr + 8);
    const dat_Format = this.emulator.readMemory(datetimeAddr + 12);
    const dat_Flags = this.emulator.readMemory(datetimeAddr + 13);
    const dat_StrDate = this.emulator.readMemory32(datetimeAddr + 14);
    const dat_StrTime = this.emulator.readMemory32(datetimeAddr + 18);
    const dat_StrDay = this.emulator.readMemory32(datetimeAddr + 22);

    console.log(`[dos.library] DateToStr(days=${ds_Days}, minute=${ds_Minute}, tick=${ds_Tick}, format=${dat_Format})`);

    // Convert Amiga days (since 1978-01-01) to JavaScript Date
    const epoch = new Date('1978-01-01T00:00:00Z');
    const dateMs = epoch.getTime() + (ds_Days * 24 * 60 * 60 * 1000);
    const date = new Date(dateMs);

    const year = date.getFullYear() % 100; // 2-digit year
    const month = date.getMonth() + 1; // 1-12
    const day = date.getDate(); // 1-31

    const hours = Math.floor(ds_Minute / 60);
    const minutes = ds_Minute % 60;
    const seconds = Math.floor(ds_Tick / 50);

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    let dateStr: string;

    // Format date based on dat_Format
    switch (dat_Format) {
      case 0: // FORMAT_DOS (dd-mmm-yy)
        dateStr = `${day.toString().padStart(2, '0')}-${monthNames[month - 1]}-${year.toString().padStart(2, '0')}`;
        break;
      case 1: // FORMAT_INT (yy-mm-dd)
        dateStr = `${year.toString().padStart(2, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        break;
      case 2: // FORMAT_USA (mm-dd-yy)
        dateStr = `${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}-${year.toString().padStart(2, '0')}`;
        break;
      case 3: // FORMAT_CDN (dd-mm-yy)
        dateStr = `${day.toString().padStart(2, '0')}-${month.toString().padStart(2, '0')}-${year.toString().padStart(2, '0')}`;
        break;
      default:
        dateStr = `${day.toString().padStart(2, '0')}-${monthNames[month - 1]}-${year.toString().padStart(2, '0')}`;
    }

    // Format time (HH:MM:SS)
    const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    // Day of week names
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayStr = dayNames[date.getDay()];

    console.log(`[dos.library] DateToStr() -> date="${dateStr}", time="${timeStr}", day="${dayStr}"`);

    // Write strings to buffers
    if (dat_StrDate) {
      this.writeString(dat_StrDate, dateStr);
    }
    if (dat_StrTime) {
      this.writeString(dat_StrTime, timeStr);
    }
    if (dat_StrDay) {
      this.writeString(dat_StrDay, dayStr);
    }

    this.emulator.setRegister(CPURegister.D0, -1); // TRUE
  }

  /**
   * AddPart - Append filename to path (V36+)
   * Used by: GLCViewer.e
   *
   * Signature: BOOL AddPart(STRPTR dirname, STRPTR filename, ULONG size)
   * D1 = dirname (modified in-place)
   * D2 = filename
   * D3 = buffer size
   * Returns: BOOL success in D0 (FALSE if overflow)
   */
  AddPart(): void {
    const dirnameAddr = this.emulator.getRegister(CPURegister.D1);
    const filenameAddr = this.emulator.getRegister(CPURegister.D2);
    const size = this.emulator.getRegister(CPURegister.D3);

    const dirname = this.readString(dirnameAddr);
    const filename = this.readString(filenameAddr);

    console.log(`[dos.library] AddPart(dirname="${dirname}", filename="${filename}", size=${size})`);

    // If filename contains : it's a fully qualified path - replace dirname entirely
    if (filename.includes(':')) {
      if (filename.length + 1 > size) {
        console.log(`[dos.library] AddPart() - buffer overflow (need ${filename.length + 1}, have ${size})`);
        this.emulator.setRegister(CPURegister.D0, 0); // FALSE
        this.lastError = 120; // ERROR_LINE_TOO_LONG
        return;
      }
      this.writeString(dirnameAddr, filename);
      console.log(`[dos.library] AddPart() -> "${filename}" (fully qualified)`);
      this.emulator.setRegister(CPURegister.D0, -1); // TRUE
      return;
    }

    // Build result path
    let result = dirname;

    // Add separator if needed
    if (result.length > 0 && !result.endsWith('/') && !result.endsWith(':')) {
      result += '/';
    }

    // Append filename
    result += filename;

    // Check buffer overflow
    if (result.length + 1 > size) {
      console.log(`[dos.library] AddPart() - buffer overflow (need ${result.length + 1}, have ${size})`);
      this.emulator.setRegister(CPURegister.D0, 0); // FALSE
      this.lastError = 120; // ERROR_LINE_TOO_LONG
      return;
    }

    // Write result
    this.writeString(dirnameAddr, result);
    console.log(`[dos.library] AddPart() -> "${result}"`);
    this.emulator.setRegister(CPURegister.D0, -1); // TRUE
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
      case -180:
        this.WaitForChar();
        return true;
      case -192:
        this.DateStamp();
        return true;
      case -198:
        this.Delay();
        return true;
      case -204:
        this.WaitForChar(); // Also at -204 for compatibility
        return true;

      // Buffered I/O (V36+) - Phase 1 critical functions
      case -264:
        this.VPrintf();
        return true;
      case -516:
        this.FGetC();
        return true;
      case -522:
        this.FPutC();
        return true;
      case -534:
        this.FRead();
        return true;
      case -540:
        this.FWrite();
        return true;
      case -546:
        this.FGets();
        return true;
      case -552:
        this.FPuts();
        return true;
      case -564:
        this.VFPrintf();
        return true;

      // Phase 2: Path and error handling (V36+)
      case -288:
        this.FilePart();
        return true;
      case -294:
        this.PathPart();
        return true;
      case -324:
        this.NameFromLock();
        return true;
      case -330:
        this.NameFromFH();
        return true;
      case -390:
        this.Fault();
        return true;
      case -396:
        this.PrintFault();
        return true;

      // Phase 4: Critical missing functions for 68K door compatibility
      case -300:
        this.AddPart();
        return true;
      case -744:
        this.DateToStr();
        return true;
      case -804:
        this.ReadArgs();
        return true;
      case -810:
        this.FreeArgs();
        return true;
      case -126:
        this.FindVar();
        return true;

      default:
        return false; // Unknown function
    }
  }

  /**
   * FindVar() - LVO -126 (0xFFFFFF82)
   *
   * Find a local or global shell variable.
   *
   * Parameters:
   *   A0 = name (C-string pointer)
   *   D1 = type (GVF_LOCAL_ONLY=0, GVF_GLOBAL_ONLY=1, GVF_BINARY_VAR=256)
   *
   * Returns:
   *   D0 = Pointer to LocalVar structure (0 if not found)
   *
   * RTW calls this to check for RC and Result2 local variables.
   */
  public FindVar(): void {
    const nameAddr = this.emulator.getRegister(8);  // A0
    const type = this.emulator.getRegister(1);      // D1
    const name = this.emulator.readString(nameAddr);

    console.log(`[dos.library] FindVar("${name}", type=${type})`);

    // For local variables (type=0 or GVF_LOCAL_ONLY), search CLI local vars
    if ((type & 0xFF) === 0) {
      // Get current CLI structure from pr_CLI
      const taskAddr = 0x70000;  // Current task
      const prCliOffset = 0xAC;
      const cliBPTR = this.emulator.readMemory32(taskAddr + prCliOffset);

      if (cliBPTR === 0) {
        console.log(`[dos.library]   No CLI structure found`);
        this.emulator.setRegister(0, 0);
        return;
      }

      const cliAddr = cliBPTR << 2;
      const localVarsBPTR = this.emulator.readMemory32(cliAddr + 0x5C); // cli_LocalVars

      if (localVarsBPTR === 0) {
        console.log(`[dos.library]   No local variables list`);
        this.emulator.setRegister(0, 0);
        return;
      }

      const localVarsListAddr = localVarsBPTR << 2;

      // Walk the list to find the variable
      let nodeAddr = this.emulator.readMemory32(localVarsListAddr + 0); // lh_Head

      while (nodeAddr !== 0 && nodeAddr !== (localVarsListAddr + 4)) { // Not NULL and not Tail
        const nodeNameAddr = this.emulator.readMemory32(nodeAddr + 10); // ln_Name

        if (nodeNameAddr !== 0) {
          const nodeName = this.emulator.readString(nodeNameAddr);

          if (nodeName === name) {
            console.log(`[dos.library]   Found local variable "${name}" at 0x${nodeAddr.toString(16)}`);
            this.emulator.setRegister(0, nodeAddr);
            return;
          }
        }

        // Move to next node
        nodeAddr = this.emulator.readMemory32(nodeAddr + 0); // ln_Succ
      }

      console.log(`[dos.library]   Variable "${name}" not found`);
      this.emulator.setRegister(0, 0);
      return;
    }

    // Global variables not supported yet
    console.log(`[dos.library]   Global variables not supported`);
    this.emulator.setRegister(0, 0);
  }
}
