import { MoiraEmulator, CPURegister } from "../cpu/MoiraEmulator";
import * as fs from "fs";
import * as amigafs from "../../utils/amigafs";
import * as path from "path";
import { FileManager } from "./FileManager";
import { PathManager } from "./PathManager";
import { AmigaFileCache } from "./AmigaFileCache";
import { ximDebugLogger } from "../xim/debug-logger";
import { EnvironmentManager } from "../session/EnvironmentManager";

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
const MODE_OLDFILE = 1005; // Open existing file for reading
const MODE_NEWFILE = 1006; // Create new file or overwrite existing
const MODE_READWRITE = 1004; // Open existing file for read/write

// Seek modes (from dos/dos.h)
const OFFSET_BEGINNING = -1; // Seek from start of file
const OFFSET_CURRENT = 0; // Seek from current position
const OFFSET_END = 1; // Seek from end of file

// AllocDosObject types (from dos/dosextens.h)
const DOS_FILEHANDLE = 0;   // Allocate FileHandle structure
const DOS_FIB = 1;          // Allocate FileInfoBlock structure (260 bytes)
const DOS_EXALLCONTROL = 2; // Allocate ExAllControl structure
const DOS_STDPKT = 3;       // Allocate DosPacket structure
const DOS_CLI = 4;          // Allocate CommandLineInterface structure
const DOS_RDARGS = 5;       // Allocate RDArgs structure

interface FileHandle {
  id: number;
  name: string;
  mode: number; // MODE_OLDFILE, MODE_NEWFILE, etc.
  position: number;
  isConsole: boolean;
  buffer?: Buffer; // File contents in memory
  realPath?: string; // Actual filesystem path
}

interface Lock {
  id: number;
  path: string; // Real filesystem path
  mode: number; // ACCESS_READ=-2, ACCESS_WRITE=-1
  amigaPath: string; // Original AmigaDOS path (for CurrentDir/fixFilename)
  memAddr: number; // Address of FileLockStruct in emulator memory
  bptr: number; // BPTR (memAddr >> 2) returned to door
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
  private nextFileId: number = 4; // Start after STDIN/STDOUT/STDERR
  private outputCallback: ((data: string) => void) | null = null;
  private outputRawCallback: ((data: Buffer) => void) | null = null;
  private inputBuffer: string = "";
  private rawInputBuffers: Buffer[] = [];
  private lastError: number = 0;

  // NEW: File I/O management system (phase 3)
  private fileManager: FileManager | null = null;
  private pathManager: PathManager | null = null;
  private fileCache: AmigaFileCache | null = null;
  private useNewFileSystem: boolean = false; // Feature flag for gradual migration

  // Environment variable management (V36+ SetVar/GetVar/DeleteVar)
  private envManager: EnvironmentManager | null = null;
  // Debug: optionally exit after first DOS Open to capture paths in tight loops
  private exitAfterFirstOpen: boolean = process.env.AEDOOR_EXIT_AFTER_OPEN === "1";
  private firstOpenSeen: boolean = false;
  private envNormalizedMap: Map<string, string> = new Map();
  private envVarCache: Map<string, number> = new Map();
  // Environment variable storage at 0x120000+ to avoid overlap with door code (0x1000-0x100000)
  private readonly envVarStructPointer: number = 0x120000;
  private readonly envStringPointer: number = 0x122000;
  private envVarStructNext: number;
  private envStringNext: number;
  private readonly envVarStructSize: number = 0x40;

  // Standard file handles
  private readonly STDIN_HANDLE = 1;
  private readonly STDOUT_HANDLE = 2;
  private readonly STDERR_HANDLE = 3;
  private readonly NIL_HANDLE = 99; // Special handle for NIL: device

  // DOS error codes (from NDK dos/dos.h)
  // Success
  private readonly ERROR_NO_ERROR = 0;

  // Memory errors (103-120)
  private readonly ERROR_NO_FREE_STORE = 103; // Out of memory
  private readonly ERROR_TASK_TABLE_FULL = 105; // Process table full
  private readonly ERROR_BAD_TEMPLATE = 114;
  private readonly ERROR_BAD_NUMBER = 115;
  private readonly ERROR_REQUIRED_ARG_MISSING = 116;
  private readonly ERROR_KEY_NEEDS_ARG = 117;
  private readonly ERROR_TOO_MANY_ARGS = 118;
  private readonly ERROR_UNMATCHED_QUOTES = 119;
  private readonly ERROR_LINE_TOO_LONG = 120;

  // Object errors (202-213)
  private readonly ERROR_OBJECT_IN_USE = 202;
  private readonly ERROR_OBJECT_EXISTS = 203;
  private readonly ERROR_DIR_NOT_FOUND = 204;
  private readonly ERROR_OBJECT_NOT_FOUND = 205;
  private readonly ERROR_BAD_STREAM_NAME = 206;
  private readonly ERROR_OBJECT_TOO_LARGE = 207;
  private readonly ERROR_ACTION_NOT_KNOWN = 209;
  private readonly ERROR_INVALID_COMPONENT_NAME = 210;
  private readonly ERROR_INVALID_LOCK = 211;
  private readonly ERROR_OBJECT_WRONG_TYPE = 212;
  private readonly ERROR_DISK_NOT_VALIDATED = 213;

  // Protection errors (214-223)
  private readonly ERROR_WRITE_PROTECTED = 214;
  private readonly ERROR_DELETE_PROTECTED = 215;
  private readonly ERROR_READ_PROTECTED = 216;
  private readonly ERROR_NOT_A_DOS_DISK = 218;
  private readonly ERROR_SEEK_ERROR = 219; // Seek not possible (console/device)
  private readonly ERROR_COMMENT_TOO_BIG = 220;
  private readonly ERROR_DISK_FULL = 221;
  private readonly ERROR_DISK_WRITE_PROTECTED = 223;

  // Filename errors (232-240)
  private readonly ERROR_RENAME_ACROSS_DEVICES = 224;
  private readonly ERROR_DIRECTORY_NOT_EMPTY = 225;
  private readonly ERROR_TOO_MANY_LEVELS = 226;
  private readonly ERROR_DEVICE_NOT_MOUNTED = 227;
  private readonly ERROR_NO_MORE_ENTRIES = 232;
  private readonly ERROR_IS_SOFT_LINK = 233;
  private readonly ERROR_OBJECT_LINKED = 234;
  private readonly ERROR_BAD_HUNK = 235;
  private readonly ERROR_NOT_IMPLEMENTED = 236;
  private readonly ERROR_RECORD_NOT_LOCKED = 240;

  // Lock/file handling errors (241-299)
  private readonly ERROR_LOCK_COLLISION = 241;
  private readonly ERROR_LOCK_TIMEOUT = 242;
  private readonly ERROR_UNLOCK_ERROR = 243;

  // Device errors (300-399)
  private readonly ERROR_BUFFER_OVERFLOW = 303;
  private readonly ERROR_INVALID_STREAM_STATE = 304;

  // Base paths for logical devices
  private rootPath: string = "";
  private bbsDataPath: string = "";
  private bbsRoot: string = "";

  // Directory and lock management for door support
  private currentDirectory: string = "";
  private currentDirectoryAmiga: string = "BBS:";
  private lastLockPath: string = "";
  private doorDirectory: string = ""; // Set by AmigaDoorSession for PROGDIR: device
  private locks: Map<number, Lock> = new Map();
  private nextLockId: number = 1;

  // Directory iteration for ExNext()
  private dirIterators: Map<number, string[]> = new Map();
  private dirIteratorIndex: Map<number, number> = new Map();

  /**
   * Find a lock by its BPTR value.
   * 68K code receives BPTRs from Lock(), but our Map is keyed by lockId.
   * This helper searches the map to find the lock with matching BPTR.
   */
  private findLockByBptr(bptr: number): { lock: Lock; lockId: number } | null {
    for (const [lockId, lock] of this.locks.entries()) {
      if (lock.bptr === bptr) {
        return { lock, lockId };
      }
    }
    return null;
  }

  // CLI support (for GetArgStr, GetProgramName)
  private argStringPtr: number = 0; // Pointer to argument string
  private programName: string = ""; // Program name
  private readonly READARGS_DEFAULT_BUFFER_SIZE = 4096;
  private readonly READARGS_HEAP_BASE = 0x140000;
  private readArgsHeapPtr: number = this.READARGS_HEAP_BASE;
  private readArgsContexts: Map<number, ReadArgsContext> = new Map();
  private readArgsBufferPool: number[] = [];
  private doorFileLogPath: string;

  constructor(emulator: MoiraEmulator, rootPathOverride?: string) {
    this.emulator = emulator;
    const detectedRoot =
      rootPathOverride ||
      process.env.BBS_DATA_DIR ||
      process.env.BBS_ROOT ||
      path.resolve(process.cwd(), "../..");
    this.setBasePaths(detectedRoot);
    this.readArgsHeapPtr = this.READARGS_HEAP_BASE;
    this.envVarStructNext = this.envVarStructPointer;
    this.envStringNext = this.envStringPointer;

    // Initialize standard I/O handles
    this.openFiles.set(this.STDIN_HANDLE, {
      id: this.STDIN_HANDLE,
      name: "STDIN",
      mode: MODE_OLDFILE,
      position: 0,
      isConsole: true,
    });

    this.openFiles.set(this.STDOUT_HANDLE, {
      id: this.STDOUT_HANDLE,
      name: "STDOUT",
      mode: MODE_NEWFILE,
      position: 0,
      isConsole: true,
    });

    this.openFiles.set(this.STDERR_HANDLE, {
      id: this.STDERR_HANDLE,
      name: "STDERR",
      mode: MODE_NEWFILE,
      position: 0,
      isConsole: true,
    });

    // NIL: device (like /dev/null)
    this.openFiles.set(this.NIL_HANDLE, {
      id: this.NIL_HANDLE,
      name: "NIL:",
      mode: MODE_OLDFILE,
      position: 0,
      isConsole: false,
    });

    this.doorFileLogPath = path.join(this.rootPath, "logs", "door-68k.log");

    // Initialize EnvironmentManager with base address 0x130000 (after 0x120000 env storage)
    this.envManager = new EnvironmentManager(emulator, 0x130000);
  }

  /**
   * Append a filesystem debug line to backend.log for 68k door debugging.
   */
  private logDoorFile(message: string): void {
    try {
      const logFile = path.join(this.rootPath, "logs", "backend.log");
      const line = `[DoorFile] ${new Date().toISOString()} ${message}\n`;
      fs.appendFileSync(logFile, line, { encoding: "utf8" });
    } catch {
      /* ignore logging failures */
    }
  }

  /**
   * Update base paths after construction so callers can force the BBS root.
   */
  setBasePaths(rootPath: string): void {
    this.rootPath = rootPath;
    this.bbsDataPath = this.rootPath; // BBS data is at project root (Conf1, Conf2, Commands, etc.)
    this.bbsRoot = rootPath;
    this.currentDirectory = this.bbsDataPath;
    this.ensureDirectory(this.bbsDataPath);
    this.ensureDirectory("/tmp/ram/ENV");
    this.doorFileLogPath = path.join(this.rootPath, "logs", "door-68k.log");
  }

  /**
   * Enable the new file system with FileManager and PathManager
   * Called by AmigaDoorSession during initialization
   */
  enableNewFileSystem(baseDir: string, pathManager?: PathManager): void {
    console.log(
      "[dos.library] Enabling new file system with FileManager/PathManager"
    );
    this.pathManager = pathManager || new PathManager(baseDir);
    this.fileCache = new AmigaFileCache(this.pathManager);
    this.fileManager = new FileManager(
      baseDir,
      this.pathManager,
      this.fileCache
    );
    this.useNewFileSystem = true;
    this.currentDirectory = this.bbsDataPath;
    try {
      const assigns = this.pathManager.getAssigns();
      const logPath = path.resolve(__dirname, '../../../../../logs/door-68k.log');
      const lines = [`[PathManager] Assigns at init:`];
      for (const [k, v] of assigns) {
        lines.push(`  ${k} => ${v}`);
      }
      fs.appendFileSync(logPath, lines.join('\n') + '\n', { encoding: 'utf8' });
    } catch {
      /* ignore */
    }
  }

  /**
   * Set callback for sysop debug messages (file not found, etc.)
   */
  setDebugCallback(callback: (message: string, level: 'info' | 'warn' | 'error') => void): void {
    if (this.fileManager) {
      this.fileManager.setDebugCallback(callback);
    }
  }

  /**
   * Seed environment variables that doors can read via FindVar.
   */
  setEnvironment(env?: Record<string, string | undefined>): void {
    this.envNormalizedMap.clear();
    this.envVarCache.clear();
    this.envVarStructNext = this.envVarStructPointer;
    this.envStringNext = this.envStringPointer;

    if (!env) {
      return;
    }

    for (const [rawName, rawValue] of Object.entries(env)) {
      if (typeof rawValue !== "string") {
        continue;
      }
      const trimmed = rawName.trim();
      if (!trimmed) {
        continue;
      }
      this.envNormalizedMap.set(trimmed.toLowerCase(), rawValue);
    }
  }

  private getEnvVarValue(name: string): string | undefined {
    const trimmed = name.trim().toLowerCase();
    if (!trimmed) {
      return undefined;
    }
    return this.envNormalizedMap.get(trimmed);
  }

  private ensureEnvVarNode(name: string, value: string): number {
    const normalized = name.trim().toLowerCase();
    const existing = this.envVarCache.get(normalized);
    if (existing) {
      return existing;
    }
    const structAddr = this.envVarStructNext;
    this.envVarStructNext += this.envVarStructSize;

    const nameAddr = this.writeEnvString(name);
    const valueAddr = this.writeEnvString(value);

    this.emulator.writeMemory32(structAddr + 0, 0); // ln_Succ
    this.emulator.writeMemory32(structAddr + 4, 0); // ln_Pred
    this.emulator.writeMemory(structAddr + 8, 0); // ln_Type
    this.emulator.writeMemory(structAddr + 9, 0); // ln_Pri
    this.emulator.writeMemory32(structAddr + 10, nameAddr); // ln_Name
    this.emulator.writeMemory32(structAddr + 14, valueAddr); // lv_Value
    this.emulator.writeMemory32(structAddr + 18, value.length); // lv_Len

    this.envVarCache.set(normalized, structAddr);
    console.log(
      `[dos.library]   Env variable "${name}" registered -> "${value}"`
    );
    return structAddr;
  }

  private writeEnvString(text: string): number {
    const addr = this.envStringNext;
    this.emulator.writeString(addr, text);
    this.envStringNext += text.length + 1;
    return addr;
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
        console.log(
          `[dos.library] PathManager resolved "${normalized}" -> ${resolved}`
        );
        return resolved;
      }
    }

    // Handle PROGDIR: device - door's own directory
    if (amigaPath.toUpperCase().startsWith("PROGDIR:")) {
      const relativePath = amigaPath.substring(8);
      let resolved = path.join(this.doorDirectory, relativePath);

      // Amiga filesystems are case-insensitive
      const { findCaseInsensitive } = require('../../utils/amigafs');
      const dir = path.dirname(resolved);
      const file = path.basename(resolved);
      const caseInsensitivePath = findCaseInsensitive(dir, file);
      if (caseInsensitivePath) {
        resolved = caseInsensitivePath;
      }

      console.log(`[dos.library] PROGDIR: device -> ${resolved}`);
      return resolved;
    }

    // Handle Doors: device - doors directory root
    if (amigaPath.toUpperCase().startsWith("DOORS:")) {
      const relativePath = amigaPath.substring(6);
      const resolved = path.join(this.rootPath, "doors", relativePath);
      console.log(`[dos.library] Doors: device -> ${resolved}`);
      return resolved;
    }

    // Handle BBS: device - BBS system files
    if (amigaPath.toUpperCase().startsWith("BBS:")) {
      const relativePath = amigaPath.substring(4);
      let resolved = path.join(this.bbsDataPath, relativePath);

      // Amiga filesystems are case-insensitive
      const { findCaseInsensitive } = require('../../utils/amigafs');
      const dir = path.dirname(resolved);
      const file = path.basename(resolved);
      const caseInsensitivePath = findCaseInsensitive(dir, file);
      if (caseInsensitivePath) {
        resolved = caseInsensitivePath;
      }

      console.log(`[dos.library] BBS: device -> ${resolved}`);
      return resolved;
    }

    // Handle S: device - Amiga system scripts/config (maps to BBS root /S)
    if (amigaPath.toUpperCase().startsWith("S:")) {
      const relativePath = amigaPath.substring(2);
      const resolved = path.join(this.rootPath, "S", relativePath);
      console.log(`[dos.library] S: device -> ${resolved}`);
      return resolved;
    }

    // Handle absolute paths
    if (amigaPath.startsWith("/")) {
      console.log(`[dos.library] Absolute path -> ${amigaPath}`);
      return amigaPath;
    }

    // Handle relative paths - resolve from current directory
    let resolved = path.join(this.currentDirectory, amigaPath);

    // Amiga filesystems are case-insensitive - try case-insensitive lookup
    // This handles files like "Dir1" when code asks for "DIR1"
    const { findCaseInsensitive } = require('../../utils/amigafs');
    const dir = path.dirname(resolved);
    const file = path.basename(resolved);
    const caseInsensitivePath = findCaseInsensitive(dir, file);

    if (caseInsensitivePath) {
      resolved = caseInsensitivePath;
      console.log(
        `[dos.library] Case-insensitive match: "${amigaPath}" -> ${resolved}`
      );
    } else {
      console.log(
        `[dos.library] Relative path from ${this.currentDirectory} -> ${resolved}`
      );
    }

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
    this.currentDirectoryAmiga = "PROGDIR:";
    console.log(`[dos.library] Current directory set to ${doorPath}`);

    if (this.pathManager) {
      this.pathManager.setProgDir(doorPath);
    }

    if (this.fileManager) {
      this.fileManager.setCurrentDir("progdir:");
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
      // Skip if directory already exists
      if (fs.existsSync(dir)) {
        return;
      }

      console.log(`[dos.library] Creating directory: ${dir}`);
      fs.mkdirSync(dir, { recursive: true });
    } catch (error) {
      console.warn(
        `[dos.library] ⚠️ Unable to create directory ${dir}:`,
        error
      );
    }
  }

  /**
   * UADE compatibility: doors often pass relative filenames after calling
   * CurrentDir(). Classic AmigaDOS prepends the current directory text so
   * open() sees an absolute path. We mimic that behavior here so doors like
   * XIM doors see the same semantics even without modifying their strings.
   */
  private normalizeAmigaPath(amigaPath: string): string {
    if (amigaPath.includes(":") || amigaPath.startsWith("/")) {
      return amigaPath;
    }

    if (!this.currentDirectoryAmiga) {
      console.warn(
        "[dos.library] ⚠️ fixFilename: no current directory set, returning relative path unchanged"
      );
      return amigaPath;
    }

    console.warn(
      `[dos.library] ⚠️ fixFilename: prefixing "${amigaPath}" with current dir "${this.currentDirectoryAmiga}"`
    );
    const separator = this.currentDirectoryAmiga.endsWith("/") ? "" : "/";
    return `${this.currentDirectoryAmiga}${separator}${amigaPath}`;
  }

  /**
   * Set callback for stdout/stderr output
   */
  setOutputCallback(callback: (data: string) => void): void {
    this.outputCallback = callback;
  }

  /**
   * Set raw callback for stdout/stderr output (binary-safe)
   */
  setOutputRawCallback(callback: (data: Buffer) => void): void {
    this.outputRawCallback = callback;
  }

  /**
   * Queue input data from user
   */
  queueInput(data: string | Buffer): void {
    console.log(`[dos.library] queueInput: ${typeof data === 'string' ? JSON.stringify(data) : `<buffer ${data.length}>`}`);
    if (Buffer.isBuffer(data)) {
      this.rawInputBuffers.push(data);
      this.inputBuffer += data.toString('latin1');
    } else {
      this.inputBuffer += data;
    }
  }

  /**
   * Read a single byte from a handle, respecting the new FileManager path first.
   */
  private readByteFromHandle(handle: number): { byte: number; eof: boolean } {
    if (this.useNewFileSystem && this.fileManager) {
      const data = this.fileManager.read(handle, 1);
      if (data.length === 0) {
        return { byte: 0, eof: true };
      }
      return { byte: data[0], eof: false };
    }

    if (handle === this.STDIN_HANDLE) {
      if (this.inputBuffer.length === 0) {
        return { byte: 0, eof: true };
      }
      const ch = this.inputBuffer.charCodeAt(0);
      this.inputBuffer = this.inputBuffer.substring(1);
      return { byte: ch, eof: false };
    }

    const fh = this.openFiles.get(handle);
    if (!fh) {
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
      return { byte: 0, eof: true };
    }

    if (handle === this.NIL_HANDLE) {
      return { byte: 0, eof: true };
    }

    if (!fh.buffer) {
      this.lastError = this.ERROR_READ_PROTECTED;
      return { byte: 0, eof: true };
    }

    if (fh.position >= fh.buffer.length) {
      return { byte: 0, eof: true };
    }

    const byte = fh.buffer[fh.position];
    fh.position += 1;
    return { byte, eof: false };
  }

  /**
   * Write raw bytes to a handle using the new FileManager path first.
   */
  private writeBytesToHandle(handle: number, data: Buffer): { bytes: number; consoleData?: Buffer } {
    if (this.useNewFileSystem && this.fileManager) {
      const result = this.fileManager.write(handle, data);
      return { bytes: result.bytesWritten, consoleData: result.consoleData };
    }

    const fileHandle = this.openFiles.get(handle);
    const isConsoleHandle =
      handle === this.STDOUT_HANDLE ||
      handle === this.STDERR_HANDLE ||
      (fileHandle && fileHandle.isConsole);

    if (isConsoleHandle) {
      return { bytes: data.length, consoleData: data };
    }

    if (!fileHandle || !fileHandle.buffer) {
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
      return { bytes: -1 };
    }

    // Expand buffer if necessary
    const neededSize = fileHandle.position + data.length;
    if (fileHandle.buffer.length < neededSize) {
      const newBuffer = Buffer.alloc(neededSize);
      fileHandle.buffer.copy(newBuffer);
      fileHandle.buffer = newBuffer;
    }

    data.copy(fileHandle.buffer, fileHandle.position);
    fileHandle.position += data.length;
    return { bytes: data.length };
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
    this.logDoorFile(`OPEN req ami="${filename}" mode=${mode}`);
    ximDebugLogger.logFileOperation('Open', filename, undefined, { mode });

    // NEW: Use FileManager if enabled
    if (this.useNewFileSystem && this.fileManager) {
      const bptr = this.fileManager.open(filename, mode);
      if (bptr > 0) {
        this.lastError = this.ERROR_NO_ERROR;
        console.log(`[dos.library] Open (FileManager) returned BPTR: ${bptr}`);
        this.logDoorFile(`OPEN fm ok handle=${bptr} ami="${filename}" mode=${mode}`);
        ximDebugLogger.logFileOperation('Open (FileManager)', filename, undefined, { mode, bptr, success: true });
      } else {
        // Get error code from FileManager
        this.lastError = this.fileManager.getLastError();
        console.error(
          `[dos.library] Open (FileManager) failed for "${filename}" with IoErr=${this.lastError}`
        );
        this.logDoorFile(`OPEN fm fail ami="${filename}" mode=${mode} IoErr=${this.lastError}`);
        ximDebugLogger.logFileOperation('Open (FileManager)', filename, undefined, { mode, bptr: 0, success: false, ioErr: this.lastError });
      }
      if (this.exitAfterFirstOpen && !this.firstOpenSeen) {
        this.firstOpenSeen = true;
        try {
          this.logDoorFile(`EXIT_AFTER_FIRST_OPEN ami="${filename}" bptr=${bptr}`);
        } catch {
          /* ignore */
        }
        this.emulator.pause();
      }
      return bptr;
    }

    // LEGACY: Old implementation (backward compatibility)
    let fileId = 0;

    // Handle special devices
    // Check if filename starts with "con:" (case-insensitive) - handles all console specifications
    // Examples: "", "*", "CON:", "CONSOLE:", "con:10/10/320/80/Output/auto/close/wait"
    // Empty string "" means current console (standard output)
    const isConsoleDevice =
      filename === "" ||
      filename === "*" ||
      filename.toUpperCase() === "CONSOLE:" ||
      filename.toUpperCase().startsWith("CON:");

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
        realPath: undefined,
      });
      this.lastError = this.ERROR_NO_ERROR;
      console.log(
        `[dos.library] Open: Console device "${filename}" -> handle ${fileId}`
      );
      this.logDoorFile(
        `OPEN ok ami="${filename}" handle=${fileId} mode=${mode} console=true`
      );
    } else if (filename === "NIL:" || filename === "NIL") {
      // NIL: device - allocate a new handle
      fileId = this.nextFileId++;
      this.openFiles.set(fileId, {
        id: fileId,
        name: filename,
        mode: mode,
        position: 0,
        isConsole: false,
        buffer: undefined,
        realPath: undefined,
      });
      this.lastError = this.ERROR_NO_ERROR;
      console.log(`[dos.library] Open: NIL: device -> handle ${fileId}`);
      this.logDoorFile(`OPEN ok ami="NIL:" handle=${fileId} mode=${mode} nil=true`);
    } else {
      // Real file - resolve path and attempt to open
      const realPath = this.resolvePath(filename);

      if (!realPath) {
        console.error(
          `[dos.library] Open: Failed to resolve path "${filename}"`
        );
        fileId = 0;
        this.lastError = this.ERROR_OBJECT_NOT_FOUND;
        this.logDoorFile(`OPEN fail ami="${filename}" reason=resolve`);
      } else {
        try {
          let buffer: Buffer | undefined;

          if (mode === MODE_OLDFILE || mode === MODE_READWRITE) {
            // Read mode - file must exist
            if (!fs.existsSync(realPath)) {
              console.error(`[dos.library] Open: File not found: ${realPath}`);
              fileId = 0;
              this.lastError = this.ERROR_OBJECT_NOT_FOUND;
              this.logDoorFile(`OPEN fail ami="${filename}" real="${realPath}" reason=notfound`);
            } else {
              // Load entire file into memory
              buffer = fs.readFileSync(realPath);
              fileId = this.nextFileId++;
              console.log(
                `[dos.library] Open: File opened for reading (${buffer.length} bytes) -> handle ${fileId}`
              );
              this.logDoorFile(
                `OPEN ok ami="${filename}" real="${realPath}" handle=${fileId} mode=${mode} bytes=${buffer.length}`
              );
            }
          } else if (mode === MODE_NEWFILE) {
            // Write mode - create new file or truncate existing
            buffer = Buffer.alloc(0);
            fileId = this.nextFileId++;
            console.log(
              `[dos.library] Open: File opened for writing -> handle ${fileId}`
            );
            this.logDoorFile(
              `OPEN ok ami="${filename}" real="${realPath}" handle=${fileId} mode=${mode} bytes=0`
            );
          } else {
            console.error(`[dos.library] Open: Unknown mode ${mode}`);
            fileId = 0;
            this.lastError = this.ERROR_OBJECT_NOT_FOUND;
            this.logDoorFile(`OPEN fail ami="${filename}" real="${realPath}" reason=mode${mode}`);
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
              realPath: realPath,
            });
            this.lastError = this.ERROR_NO_ERROR;
            this.logDoorFile(
              `OPEN ok ami="${filename}" real="${realPath}" handle=${fileId} mode=${mode} bytes=${buffer?.length ?? 0}`
            );
          }
        } catch (error) {
          console.error(
            `[dos.library] Open: Error opening file ${realPath}:`,
            error
          );
          fileId = 0;
          this.lastError = this.ERROR_OBJECT_NOT_FOUND;
          this.logDoorFile(
            `OPEN fail ami="${filename}" real="${realPath}" reason=exception`
          );
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
    this.logDoorFile(`CLOSE handle=${handle}`);

    // V47+ behavior: Close(0) does nothing and returns success
    if (handle === 0) {
      console.log(`[dos.library] Close(0): No-op, returning success`);
      return -1; // DOSTRUE
    }

    // NEW: Use FileManager if enabled
    if (this.useNewFileSystem && this.fileManager) {
      // Do not allow standard handles to be closed; return success like AmigaDOS.
      if (handle === this.STDIN_HANDLE || handle === this.STDOUT_HANDLE || handle === this.STDERR_HANDLE) {
        console.log(
          `[dos.library] Close: standard handle ${handle} (FileManager) -> success`
        );
        this.logDoorFile(`CLOSE ok handle=${handle} standard=true`);
        return -1; // DOSTRUE
      }
      const success = this.fileManager.close(handle);
      if (success) {
        console.log(
          `[dos.library] Close (FileManager) succeeded for handle ${handle}`
        );
        return -1; // DOSTRUE
      } else {
        console.error(
          `[dos.library] Close (FileManager) failed for handle ${handle}`
        );
        this.lastError = this.ERROR_OBJECT_NOT_FOUND;
        return 0; // DOSFALSE
      }
    }

    // LEGACY: Old implementation (backward compatibility)

    // Standard handles should not be closed
    if (handle <= 3 || handle === this.NIL_HANDLE) {
      console.log(
        `[dos.library] Close: Standard handle ${handle}, returning success without closing`
      );
      this.logDoorFile(`CLOSE ok handle=${handle} standard=true`);
      return -1; // DOSTRUE
    }

    const fileHandle = this.openFiles.get(handle);
    if (!fileHandle) {
      console.error(`[dos.library] Close: Invalid handle ${handle}`);
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
      return 0; // DOSFALSE
    }

    // Save previous IoErr value (will restore on success)
    const previousIoErr = this.lastError;
    let success = true;

    // Console handles and NIL: don't need to flush to disk
    if (
      fileHandle.isConsole ||
      fileHandle.name === "NIL:" ||
      fileHandle.name === "NIL"
    ) {
      console.log(
        `[dos.library] Close: Console/NIL handle ${handle}, closing without disk flush`
      );
      this.logDoorFile(`CLOSE ok handle=${handle} ami="${fileHandle.name}" consoleOrNil=true`);
      // Console output is already flushed via Write(), just close the handle
    } else {
      // Regular file - flush buffer to disk if it was opened for writing
      if (
        fileHandle.mode === MODE_NEWFILE ||
        fileHandle.mode === MODE_READWRITE
      ) {
        if (fileHandle.realPath && fileHandle.buffer) {
          try {
            fs.writeFileSync(fileHandle.realPath, fileHandle.buffer);
            console.log(
              `[dos.library] Close: Wrote ${fileHandle.buffer.length} bytes to ${fileHandle.realPath}`
            );
            this.logDoorFile(
              `CLOSE ok handle=${handle} ami="${fileHandle.name}" real="${fileHandle.realPath}" bytes=${fileHandle.buffer.length}`
            );
          } catch (error) {
            console.error(
              `[dos.library] Close: Error writing file ${fileHandle.realPath}:`,
              error
            );
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
      console.log(
        `[dos.library] Close: File closed successfully, IoErr restored to ${previousIoErr}`
      );
      this.logDoorFile(`CLOSE ok handle=${handle} ami="${fileHandle.name}" real="${fileHandle.realPath ?? ""}"`);
      return -1; // DOSTRUE
    } else {
      // On failure: IoErr already set above
      console.log(
        `[dos.library] Close: Failed but handle deallocated, IoErr=${this.lastError}`
      );
      this.logDoorFile(`CLOSE fail handle=${handle} ami="${fileHandle.name}" real="${fileHandle.realPath ?? ""}" ioErr=${this.lastError}`);
      return 0; // DOSFALSE
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

    console.log(
      `[dos.library] Read(handle=${handle}, buffer=0x${bufferAddr.toString(
        16
      )}, length=${length})`
    );
    this.logDoorFile(`READ handle=${handle} len=${length}`);

    // NEW: Use FileManager if enabled
    if (this.useNewFileSystem && this.fileManager) {
      const dataBuffer = this.fileManager.read(handle, length);
      const bytesRead = dataBuffer.length;

      // Copy data to emulator memory
      for (let i = 0; i < bytesRead; i++) {
        this.emulator.writeMemory(bufferAddr + i, dataBuffer[i]);
      }

      this.lastError = this.ERROR_NO_ERROR;
      console.log(
        `[dos.library] Read (FileManager) returned: ${bytesRead} bytes`
      );
      return bytesRead;
    }

    // LEGACY: Old implementation (backward compatibility)
    if (handle === this.STDIN_HANDLE) {
      // Read from input buffer
      const bytesToRead = Math.min(length, this.inputBuffer.length);

      for (let i = 0; i < bytesToRead; i++) {
        this.emulator.writeMemory(
          bufferAddr + i,
          this.inputBuffer.charCodeAt(i)
        );
      }

      // Remove read data from buffer
      this.inputBuffer = this.inputBuffer.substring(bytesToRead);

      this.lastError = this.ERROR_NO_ERROR;
      console.log(
        `[dos.library] Read returned: ${bytesToRead} bytes from STDIN`
      );
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
      this.logDoorFile(`READ handle=${handle} ami="NIL:" bytes=0 nil=true`);
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

    console.log(
      `[dos.library] Read: position=${fileHandle.position}, available=${available}, requested=${length}, reading=${bytesToRead}`
    );

    // Copy bytes from file buffer to emulator memory
    for (let i = 0; i < bytesToRead; i++) {
      const byte = fileHandle.buffer[fileHandle.position + i];
      this.emulator.writeMemory(bufferAddr + i, byte);
    }

    // Update file position
    fileHandle.position += bytesToRead;

    this.lastError = this.ERROR_NO_ERROR;
    console.log(
      `[dos.library] Read returned: ${bytesToRead} bytes (position now ${fileHandle.position})`
    );
    this.logDoorFile(
      `READ handle=${handle} ami="${fileHandle.name}" real="${fileHandle.realPath ?? ""}" bytes=${bytesToRead}`
    );
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
    const pc = this.emulator.getRegister(CPURegister.PC);
    const sp = this.emulator.getRegister(CPURegister.A7);

    if (length <= 0) {
      const preview: number[] = [];
      try {
        for (let i = 0; i < 16; i++) {
          preview.push(this.emulator.readMemory(bufferAddr + i));
        }
      } catch {
        /* ignore preview failures */
      }
      this.logDoorFile(
        `WRITE zero pc=0x${pc.toString(16)} sp=0x${sp.toString(
          16
        )} d1=${handle} d2=0x${bufferAddr.toString(
          16
        )} d3=${length} preview=[${preview.map((b) => b.toString(16)).join(" ")}]`
      );
    }
    this.logDoorFile(`WRITE handle=${handle} len=${length}`);

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
        console.error(
          `[dos.library] Write (FileManager) failed for handle ${handle}`
        );
        this.lastError = this.ERROR_WRITE_PROTECTED;
        this.logDoorFile(`WRITE fm fail handle=${handle} len=${length}`);
        return -1;
      }

      // If console output, send to callback
      if (result.consoleData) {
        const text = result.consoleData.toString();
        console.log(
          `[dos.library] Write (FileManager): Console output (${length} bytes): ${JSON.stringify(
            text
          )}`
        );
        if (this.outputRawCallback) {
          this.outputRawCallback(result.consoleData);
        } else if (this.outputCallback) {
          this.outputCallback(text);
        }
      }

      this.lastError = this.ERROR_NO_ERROR;
      console.log(
        `[dos.library] Write (FileManager) returned: ${result.bytesWritten} bytes`
      );
      this.logDoorFile(`WRITE fm handle=${handle} bytes=${result.bytesWritten}`);
      return result.bytesWritten;
    }

    // LEGACY: Old implementation (backward compatibility)
    // Check if this is a console/stdout/stderr handle
    const fileHandle = this.openFiles.get(handle);
    const isConsoleHandle =
      handle === this.STDOUT_HANDLE ||
      handle === this.STDERR_HANDLE ||
      (fileHandle && fileHandle.isConsole);

    if (isConsoleHandle) {
      const rawBuf = Buffer.from(bytes);
      const text = rawBuf.toString('latin1');

      // DEBUG: Log WHO2 door output
      console.log(
        `[dos.library] Write: Console output (${length} bytes): ${JSON.stringify(
          text
        )}`
      );

      // Send to output callback (raw preferred)
      if (this.outputRawCallback) {
        this.outputRawCallback(rawBuf);
      } else if (this.outputCallback) {
        console.log(`[dos.library] Write: Sending to socket callback`);
        this.outputCallback(text);
      } else {
        console.log(`[dos.library] Write: WARNING - No output callback set!`);
      }

      this.lastError = this.ERROR_NO_ERROR;
      this.logDoorFile(`WRITE handle=${handle} ami="${fileHandle?.name ?? "*"}" bytes=${length} console=true`);
      return length;
    }

    // Check if it's NIL: device (discards output)
    const isNilDevice =
      handle === this.NIL_HANDLE ||
      (fileHandle &&
        fileHandle.name &&
        (fileHandle.name === "NIL:" || fileHandle.name === "NIL"));

    if (isNilDevice) {
      this.lastError = this.ERROR_NO_ERROR;
      console.log(
        `[dos.library] Write: NIL: device -> ${length} bytes discarded`
      );
      return length;
    }

    // Handle real file - fileHandle already retrieved above
    if (!fileHandle) {
      console.error(`[dos.library] Write: Invalid handle ${handle}`);
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
      return -1;
    }

    // Check if file is writable
    if (
      fileHandle.mode !== MODE_NEWFILE &&
      fileHandle.mode !== MODE_READWRITE
    ) {
      console.error(
        `[dos.library] Write: File not opened for writing (mode=${fileHandle.mode})`
      );
      this.lastError = this.ERROR_WRITE_PROTECTED;
      this.logDoorFile(
        `WRITE fail handle=${handle} ami="${fileHandle.name}" real="${fileHandle.realPath ?? ""}" reason=notwritable mode=${fileHandle.mode}`
      );
      return -1;
    }

    // Check if file has a buffer
    if (!fileHandle.buffer) {
      console.error(`[dos.library] Write: No buffer for handle ${handle}`);
      this.lastError = this.ERROR_WRITE_PROTECTED;
      return -1;
    }

    console.log(
      `[dos.library] Write: Writing ${length} bytes at position ${fileHandle.position}`
    );

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
    console.log(
      `[dos.library] Write returned: ${length} bytes (position now ${fileHandle.position})`
    );
    this.logDoorFile(
      `WRITE handle=${handle} ami="${fileHandle.name}" real="${fileHandle.realPath ?? ""}" bytes=${length}`
    );
    return length;
  }

  // Inherited input/output handles from parent process
  // Per AmigaDOS spec: "Input() is used to identify the initial input stream allocated when
  // the program was initiated. Never close the filehandle returned by Input!"
  // XIM/AIM doors expect standard console I/O, so we default to STDIN/STDOUT
  private inheritedInput: number = 1; // STDIN_HANDLE
  private inheritedOutput: number = 2; // STDOUT_HANDLE

  /**
   * Set inherited stdin/stdout handles for the process
   * Called when door session is initialized
   */
  setInheritedHandles(input: number, output: number): void {
    this.inheritedInput = input;
    this.inheritedOutput = output;
    console.log(
      `[dos.library] Set inherited handles: Input=${input}, Output=${output}`
    );
  }

  /**
   * Redirect STDOUT to the provided AmigaDOS path, mirroring CLI ">" redirection.
   * Returns the new BPTR or 0 on failure.
   */
  redirectStdout(amiPath: string): number {
    if (!this.fileManager || !this.pathManager) {
      console.warn(`[dos.library] Cannot redirect stdout without FileManager/PathManager`);
      return 0;
    }

    const resolved = this.pathManager.amiToSysPath(amiPath, this.currentDirectory);
    if (resolved) {
      try {
        const parentDir = path.dirname(resolved);
        // Don't create "BBS/" subdirectory - BBS: should resolve to project root
        if (parentDir.endsWith('/BBS') || parentDir.endsWith('\\BBS')) {
          console.warn(`[dos.library] Skipping creation of BBS/ subdirectory for redirect: ${amiPath} -> ${resolved}`);
        } else if (!fs.existsSync(parentDir)) {
          console.log(`[dos.library] Creating parent directory for stdout redirect: ${parentDir}`);
          fs.mkdirSync(parentDir, { recursive: true });
        }
      } catch {
        /* ignore directory creation failures; open() will report errors */
      }
    }

    const bptr = this.fileManager.open(amiPath, MODE_NEWFILE);
    if (!bptr) {
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
      console.error(`[dos.library] Failed to redirect stdout to ${amiPath}`);
      return 0;
    }

    this.fileManager.setStdoutHandle(bptr);
    this.inheritedOutput = bptr;
    this.logDoorFile(`STDOUT redirected to ${amiPath} (BPTR ${bptr})`);
    console.log(`[dos.library] STDOUT redirected to ${amiPath} (BPTR ${bptr})`);
    return bptr;
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
    console.log(
      `[dos.library] Input() returning inherited handle ${this.inheritedInput}`
    );
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
    console.log(
      `[dos.library] Output() returning inherited handle ${this.inheritedOutput}`
    );
    return this.inheritedOutput;
  }

  /**
   * IoErr - Get last DOS error code
   * Returns: D0 = error code
   */
  IoErr(): number {
    if (this.lastError !== 0) {
      console.log(
        `[dos.library] 🔴 IoErr() = ${this.lastError} (${this.getErrorMessage(
          this.lastError
        )})`
      );
    }
    return this.lastError;
  }

  /**
   * SetIoErr() - LVO -348 (P2)
   *
   * Set the current I/O error code.
   *
   * Parameters:
   *   D1 = Error code
   *
   * Returns:
   *   D0 = Previous error code
   */
  SetIoErr(): number {
    const newError = this.emulator.getRegister(CPURegister.D1);
    const oldError = this.lastError;

    console.log(`[dos.library] SetIoErr(${newError}), previous was ${oldError}`);

    this.lastError = newError;
    return oldError;
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
    const epoch = new Date("1978-01-01T00:00:00Z");
    const daysSinceEpoch = Math.floor(
      (now.getTime() - epoch.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Calculate minutes past midnight
    const minutesPastMidnight = now.getHours() * 60 + now.getMinutes();

    // Calculate ticks past minute (50 ticks/sec)
    const ticksPastMinute =
      now.getSeconds() * 50 + Math.floor(now.getMilliseconds() / 20);

    console.log(
      `[dos.library] DateStamp() days=${daysSinceEpoch}, minutes=${minutesPastMidnight}, ticks=${ticksPastMinute}`
    );

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
    console.log(
      `[dos.library] Execution will pause until ${new Date(
        this.delayUntil
      ).toISOString()}`
    );
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

    console.log(
      `[dos.library] Seek(handle=${handle}, offset=${offset}, mode=${mode})`
    );

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
        console.error("[dos.library] Seek(FileManager): seek failed");
        this.lastError = this.ERROR_OBJECT_IN_USE;
        return -1;
      }

      this.lastError = this.ERROR_NO_ERROR;
      console.log(
        `[dos.library] Seek(FileManager): moved from ${oldPos} to ${newPos}`
      );
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
        console.error(
          `[dos.library] Seek: Invalid mode ${mode} for console handle`
        );
        this.lastError = this.ERROR_OBJECT_IN_USE;
        return -1;
      }

      if (newPos < 0) {
        newPos = 0;
      }

      fileHandle.position = newPos;
      this.lastError = this.ERROR_NO_ERROR;
      console.log(
        `[dos.library] Seek: Console/NIL handle ${handle} moved from ${oldPos} to ${newPos}`
      );
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
    console.log(
      `[dos.library] Seek: Moved from ${oldPosition} to ${newPosition}`
    );
    return oldPosition;
  }

  /**
   * FGetC - Get a single character from a file (V36+)
   * Returns: character (0-255) or -1 on EOF/error
   */
  FGetC(): number {
    const handle = this.emulator.getRegister(CPURegister.D1);
    const result = this.readByteFromHandle(handle);
    if (result.eof) {
      this.lastError = this.ERROR_NO_MORE_ENTRIES;
      return -1;
    }
    this.lastError = this.ERROR_NO_ERROR;
    return result.byte;
  }

  /**
   * FPutC - Write a single character to a file (V36+)
   * Returns: character written or -1 on error
   */
  FPutC(): number {
    const handle = this.emulator.getRegister(CPURegister.D1);
    const ch = this.emulator.getRegister(CPURegister.D2) & 0xff;
    const buffer = Buffer.from([ch]);
    const result = this.writeBytesToHandle(handle, buffer);
    if (result.bytes < 0) {
      this.lastError = this.ERROR_WRITE_PROTECTED;
      return -1;
    }

    if (result.consoleData) {
      const text = result.consoleData.toString("latin1");
      if (this.outputRawCallback) {
        this.outputRawCallback(result.consoleData);
      } else if (this.outputCallback) {
        this.outputCallback(text);
      }
    }

    this.lastError = this.ERROR_NO_ERROR;
    return ch;
  }

  /**
   * FSeek() - LVO -678 (P2)
   *
   * Seek to a position in a buffered file.
   *
   * Parameters:
   *   D1 = File handle
   *   D2 = Offset (signed)
   *   D3 = Mode (OFFSET_BEGINNING=-1, OFFSET_CURRENT=0, OFFSET_END=1)
   *
   * Returns:
   *   D0 = 0 on success, -1 on error
   */
  FSeek(): number {
    const handle = this.emulator.getRegister(CPURegister.D1);
    const offset = this.emulator.getRegister(CPURegister.D2);
    const mode = this.emulator.getRegister(CPURegister.D3);

    console.log(`[dos.library] FSeek(handle=0x${handle.toString(16)}, offset=${offset}, mode=${mode})`);

    // Call Seek() to perform the actual seek
    this.emulator.setRegister(CPURegister.D1, handle);
    this.emulator.setRegister(CPURegister.D2, offset);
    this.emulator.setRegister(CPURegister.D3, mode);
    const oldPos = this.Seek();

    if (oldPos < 0) {
      console.error(`[dos.library] FSeek: Seek failed`);
      this.lastError = this.ERROR_SEEK_ERROR;
      return -1;
    }

    this.lastError = this.ERROR_NO_ERROR;
    return 0; // Success
  }

  /**
   * FTell() - LVO -684 (P2)
   *
   * Get current position in a buffered file.
   *
   * Parameters:
   *   D1 = File handle
   *
   * Returns:
   *   D0 = Current position, or -1 on error
   */
  FTell(): number {
    const handle = this.emulator.getRegister(CPURegister.D1);

    console.log(`[dos.library] FTell(handle=0x${handle.toString(16)})`);

    // Use Seek with offset=0, mode=OFFSET_CURRENT to get current position
    this.emulator.setRegister(CPURegister.D1, handle);
    this.emulator.setRegister(CPURegister.D2, 0); // offset = 0
    this.emulator.setRegister(CPURegister.D3, 0); // OFFSET_CURRENT
    const currentPos = this.Seek();

    if (currentPos < 0) {
      console.error(`[dos.library] FTell: Failed to get position`);
      this.lastError = this.ERROR_SEEK_ERROR;
      return -1;
    }

    console.log(`[dos.library] FTell: Current position = ${currentPos}`);
    this.lastError = this.ERROR_NO_ERROR;
    return currentPos;
  }

  /**
   * FGets - Read a line from a file (V36+)
   * Returns: buffer pointer or 0 on EOF/error
   */
  FGets(): number {
    const handle = this.emulator.getRegister(CPURegister.D1);
    const bufPtr = this.emulator.getRegister(CPURegister.D2);
    const maxLen = this.emulator.getRegister(CPURegister.D3);

    if (bufPtr === 0 || maxLen <= 1) {
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
      return 0;
    }

    let bytesRead = 0;
    while (bytesRead < maxLen - 1) {
      const { byte, eof } = this.readByteFromHandle(handle);
      if (eof) {
        break;
      }
      this.emulator.writeMemory(bufPtr + bytesRead, byte);
      bytesRead++;
      if (byte === 0x0a) {
        break;
      }
    }

    this.emulator.writeMemory(bufPtr + bytesRead, 0);

    if (bytesRead === 0) {
      this.lastError = this.ERROR_NO_MORE_ENTRIES;
      return 0;
    }

    this.lastError = this.ERROR_NO_ERROR;
    return bufPtr;
  }

  /**
   * FPuts - Write a null-terminated string to a file (V36+)
   * Returns: length written or -1 on error
   */
  FPuts(): number {
    const handle = this.emulator.getRegister(CPURegister.D1);
    const strPtr = this.emulator.getRegister(CPURegister.D2);
    const str = this.readString(strPtr);
    const buffer = Buffer.from(str, "latin1");
    const result = this.writeBytesToHandle(handle, buffer);

    if (result.bytes < 0) {
      this.lastError = this.ERROR_WRITE_PROTECTED;
      return -1;
    }

    if (result.consoleData) {
      const text = result.consoleData.toString("latin1");
      if (this.outputRawCallback) {
        this.outputRawCallback(result.consoleData);
      } else if (this.outputCallback) {
        this.outputCallback(text);
      }
    }

    this.lastError = this.ERROR_NO_ERROR;
    return buffer.length;
  }

  /**
   * FRead - Block read helper (V36+)
   * Returns: number of blocks read
   */
  FRead(): number {
    const handle = this.emulator.getRegister(CPURegister.D1);
    const bufPtr = this.emulator.getRegister(CPURegister.D2);
    const blockLen = this.emulator.getRegister(CPURegister.D3);
    const blocks = this.emulator.getRegister(CPURegister.D4);
    const totalBytes = blockLen * blocks;

    this.emulator.setRegister(CPURegister.D1, handle);
    this.emulator.setRegister(CPURegister.D2, bufPtr);
    this.emulator.setRegister(CPURegister.D3, totalBytes);
    const bytesRead = this.Read();

    const blocksRead =
      blockLen > 0 ? Math.floor(Math.max(0, bytesRead) / blockLen) : 0;
    this.lastError = this.ERROR_NO_ERROR;
    return blocksRead;
  }

  /**
   * FWrite - Block write helper (V36+)
   * Returns: number of blocks written
   */
  FWrite(): number {
    const handle = this.emulator.getRegister(CPURegister.D1);
    const bufPtr = this.emulator.getRegister(CPURegister.D2);
    const blockLen = this.emulator.getRegister(CPURegister.D3);
    const blocks = this.emulator.getRegister(CPURegister.D4);
    const totalBytes = blockLen * blocks;

    this.emulator.setRegister(CPURegister.D1, handle);
    this.emulator.setRegister(CPURegister.D2, bufPtr);
    this.emulator.setRegister(CPURegister.D3, totalBytes);
    const bytesWritten = this.Write();

    if (bytesWritten < 0) {
      this.lastError = this.ERROR_WRITE_PROTECTED;
      return 0;
    }

    const blocksWritten =
      blockLen > 0 ? Math.floor(bytesWritten / blockLen) : 0;
    this.lastError = this.ERROR_NO_ERROR;
    return blocksWritten;
  }

  /**
   * FOpen (-588) - Buffered file open (V36+)
   * Input: D1 = BPTR to filename
   *        D2 = BPTR to mode string ("r", "w", "a", "r+", "w+", "a+")
   * Output: D0 = BPTR to FILE structure, or 0 on error
   *
   * P2 function - Buffered I/O wrapper around Open()
   * Mode strings:
   * - "r"  = read (MODE_OLDFILE)
   * - "w"  = write/create (MODE_NEWFILE)
   * - "a"  = append (MODE_READWRITE + seek to end)
   * - "r+" = read/write existing (MODE_READWRITE)
   * - "w+" = read/write create (MODE_NEWFILE)
   * - "a+" = read/append (MODE_READWRITE + seek to end)
   */
  FOpen(): number {
    const filenameBPtr = this.emulator.getRegister(CPURegister.D1);
    const modeBPtr = this.emulator.getRegister(CPURegister.D2);

    // Convert BPTRs to addresses
    const filenameAddr = filenameBPtr << 2;
    const modeAddr = modeBPtr << 2;

    const filename = this.emulator.readString(filenameAddr, 256);
    const modeStr = this.emulator.readString(modeAddr, 16);

    console.log(`[dos.library] FOpen("${filename}", "${modeStr}")`);

    // Map mode string to AmigaDOS mode constant
    let mode: number;
    let seekToEnd = false;

    switch (modeStr) {
      case 'r':
        mode = MODE_OLDFILE; // Read existing
        break;
      case 'w':
        mode = MODE_NEWFILE; // Write/create
        break;
      case 'a':
        mode = MODE_READWRITE; // Append
        seekToEnd = true;
        break;
      case 'r+':
        mode = MODE_READWRITE; // Read/write existing
        break;
      case 'w+':
        mode = MODE_NEWFILE; // Read/write create
        break;
      case 'a+':
        mode = MODE_READWRITE; // Read/append
        seekToEnd = true;
        break;
      default:
        console.error(`[dos.library] FOpen: Invalid mode "${modeStr}"`);
        this.lastError = this.ERROR_BAD_NUMBER;
        return 0;
    }

    // Call Open() to open the file
    this.emulator.setRegister(CPURegister.D1, filenameBPtr);
    this.emulator.setRegister(CPURegister.D2, mode);
    const handle = this.Open();

    if (handle === 0) {
      console.error(`[dos.library] FOpen: Open failed for "${filename}"`);
      // lastError already set by Open()
      return 0;
    }

    // If append mode, seek to end
    if (seekToEnd) {
      this.emulator.setRegister(CPURegister.D1, handle);
      this.emulator.setRegister(CPURegister.D2, 0); // offset
      this.emulator.setRegister(CPURegister.D3, OFFSET_END);
      this.Seek();
    }

    console.log(`[dos.library] FOpen → handle=0x${handle.toString(16)}`);
    this.lastError = this.ERROR_NO_ERROR;
    return handle;
  }

  /**
   * FClose (-594) - Buffered file close (V36+)
   * Input: D1 = BPTR to FILE structure (file handle)
   * Output: D0 = 0 for success, -1 for error
   *
   * P2 function - Buffered I/O wrapper around Close()
   */
  FClose(): number {
    const handle = this.emulator.getRegister(CPURegister.D1);

    console.log(`[dos.library] FClose(handle=0x${handle.toString(16)})`);

    if (handle === 0) {
      console.error(`[dos.library] FClose: NULL handle`);
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
      return -1;
    }

    // Call Close() to close the file
    this.emulator.setRegister(CPURegister.D1, handle);
    this.Close();

    this.lastError = this.ERROR_NO_ERROR;
    return 0;
  }

  /**
   * UnGetC - Push a character back onto the stream (V36+)
   * Returns: character pushed back or -1 on error
   */
  UnGetC(): number {
    const handle = this.emulator.getRegister(CPURegister.D1);
    const ch = this.emulator.getRegister(CPURegister.D2) & 0xff;

    if (this.useNewFileSystem && this.fileManager) {
      const pos = this.fileManager.seek(handle, -1, 1);
      if (pos < 0) {
        this.lastError = this.ERROR_SEEK_ERROR;
        return -1;
      }
      this.lastError = this.ERROR_NO_ERROR;
      return ch;
    }

    const fh = this.openFiles.get(handle);
    if (!fh || fh.position === 0) {
      this.lastError = this.ERROR_SEEK_ERROR;
      return -1;
    }

    fh.position -= 1;
    if (fh.buffer) {
      fh.buffer[fh.position] = ch;
    }
    this.lastError = this.ERROR_NO_ERROR;
    return ch;
  }

  /**
   * Flush - Flush buffered output (V36+)
   * Returns: DOSTRUE (-1) on success
   */
  Flush(): number {
    const handle = this.emulator.getRegister(CPURegister.D1);
    if (this.useNewFileSystem) {
      this.lastError = this.ERROR_NO_ERROR;
      return -1;
    }

    if (handle === this.STDOUT_HANDLE || handle === this.STDERR_HANDLE) {
      this.lastError = this.ERROR_NO_ERROR;
      return -1;
    }

    this.lastError = this.ERROR_NO_ERROR;
    return -1;
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
      console.error(
        `[dos.library] DeleteFile: Failed to resolve path "${filename}"`
      );
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
      console.error(
        `[dos.library] DeleteFile: Cannot delete directory with DeleteFile: ${realPath}`
      );
      this.emulator.setRegister(CPURegister.D0, 0);
      this.lastError = this.ERROR_OBJECT_IN_USE;
      return;
    }

    try {
      // Delete the file
      fs.unlinkSync(realPath);
      console.log(`[dos.library] DeleteFile: Deleted file ${realPath}`);

      this.emulator.setRegister(CPURegister.D0, -1); // DOSTRUE
      this.lastError = this.ERROR_NO_ERROR;
    } catch (error) {
      console.error(
        `[dos.library] DeleteFile: Error deleting file ${realPath}:`,
        error
      );
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

    console.log(`[dos.library] Rename("${oldName}", "${newName}")`);

    const oldPath = this.resolvePath(oldName);
    const newPath = this.resolvePath(newName);

    if (!oldPath) {
      console.error(
        `[dos.library] Rename: Failed to resolve old path "${oldName}"`
      );
      this.emulator.setRegister(CPURegister.D0, 0);
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
      return;
    }

    if (!newPath) {
      console.error(
        `[dos.library] Rename: Failed to resolve new path "${newName}"`
      );
      this.emulator.setRegister(CPURegister.D0, 0);
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
      return;
    }

    if (!fs.existsSync(oldPath)) {
      console.error(`[dos.library] Rename: Source file not found: ${oldPath}`);
      this.emulator.setRegister(CPURegister.D0, 0);
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
      return;
    }

    if (fs.existsSync(newPath)) {
      console.error(
        `[dos.library] Rename: Destination already exists: ${newPath}`
      );
      this.emulator.setRegister(CPURegister.D0, 0);
      this.lastError = this.ERROR_OBJECT_IN_USE;
      return;
    }

    try {
      fs.renameSync(oldPath, newPath);
      console.log(`[dos.library] Rename: Renamed ${oldPath} to ${newPath}`);
      this.emulator.setRegister(CPURegister.D0, -1);
      this.lastError = this.ERROR_NO_ERROR;
    } catch (error) {
      console.error(
        `[dos.library] Rename: Error renaming ${oldPath} to ${newPath}:`,
        error
      );
      this.emulator.setRegister(CPURegister.D0, 0);
      this.lastError = this.ERROR_WRITE_PROTECTED;
    }
  }

  /**
   * Allocate a FileLock structure in emulator memory
   * Returns BPTR to the allocated structure
   *
   * FileLockStruct (20 bytes total):
   *   +0  fl_Link (BPTR)   - pointer to next lock (0 if none)
   *   +4  fl_Key (ULONG)   - unique key identifying the object
   *   +8  fl_Access (LONG) - access mode
   *   +12 fl_Task (APTR)   - handler task (0 for now)
   *   +16 fl_Volume (BPTR) - volume node (0 for now)
   */
  private allocateFileLock(lockId: number, mode: number): number {
    const FILELOCK_SIZE = 20;
    const memAddr = this.allocateTemp(FILELOCK_SIZE);

    // Initialize FileLock structure
    this.emulator.writeMemory32(memAddr + 0, 0);      // fl_Link = 0 (no chain)
    this.emulator.writeMemory32(memAddr + 4, lockId); // fl_Key = lock ID
    this.emulator.writeMemory32(memAddr + 8, mode);   // fl_Access = mode
    this.emulator.writeMemory32(memAddr + 12, 0);     // fl_Task = 0
    this.emulator.writeMemory32(memAddr + 16, 0);     // fl_Volume = 0

    // Convert to BPTR (address >> 2)
    const bptr = memAddr >> 2;

    console.log(
      `[dos.library] Allocated FileLock: memAddr=0x${memAddr.toString(16)}, BPTR=${bptr}, lockId=${lockId}, mode=${mode}`
    );

    return bptr;
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
      console.log(
        `[dos.library] 🔒 Lock("${name}") - ❌ Failed to resolve path [IoErr=${
          this.lastError
        }: ${this.getErrorMessage(this.lastError)}]`
      );
      this.emulator.setRegister(CPURegister.D0, 0);
      return;
    }

    // Check if path exists
    if (!fs.existsSync(realPath)) {
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
      console.log(
        `[dos.library] 🔒 Lock("${name}") -> "${realPath}" - ⚠️  NOT FOUND [IoErr=${
          this.lastError
        }: ${this.getErrorMessage(this.lastError)}]`
      );
      this.emulator.setRegister(CPURegister.D0, 0);
      return;
    }

    console.log(
      `[dos.library] 🔒 Lock("${name}") -> "${realPath}" - ✅ EXISTS`
    );

    // Create lock with FileLock structure in memory
    const lockId = this.nextLockId++;
    const bptr = this.allocateFileLock(lockId, mode);
    const memAddr = bptr << 2;

    this.locks.set(lockId, {
      id: lockId,
      path: realPath,
      mode: mode,
      amigaPath: originalName,
      memAddr: memAddr,
      bptr: bptr,
    });

    this.lastLockPath = originalName;
    console.log(
      `[dos.library] Lock: Created lock ${lockId} (BPTR ${bptr}) for path ${realPath}`
    );
    this.emulator.setRegister(CPURegister.D0, bptr); // Return BPTR, not lockId!
    this.lastError = this.ERROR_NO_ERROR;
  }

  /**
   * UnLock - Release a lock
   * D1 = lock
   */
  UnLock(): void {
    const bptrIn = this.emulator.getRegister(CPURegister.D1);

    // BPTR 0 is special (means "no lock")
    if (bptrIn === 0) {
      console.log(`[dos.library] UnLock: BPTR 0 (no-op)`);
      return;
    }

    // Find lock by BPTR and delete it
    let found = false;
    for (const [lockId, lock] of this.locks.entries()) {
      if (lock.bptr === bptrIn) {
        console.log(`[dos.library] UnLock: Released lock ${lockId} (BPTR ${bptrIn})`);
        this.locks.delete(lockId);
        // Note: We don't explicitly free the FileLock memory since allocateTemp()
        // allocations are temporary and will be reclaimed automatically
        found = true;
        break;
      }
    }

    if (!found) {
      console.warn(`[dos.library] UnLock: Invalid lock BPTR ${bptrIn}`);
    }

    this.lastError = this.ERROR_NO_ERROR;
  }

  /**
   * DupLock - Duplicate a lock
   * D1 = lock to duplicate
   * Returns: D0 = new lock (or 0 on failure)
   */
  DupLock(): void {
    const bptrIn = this.emulator.getRegister(CPURegister.D1);

    if (bptrIn === 0) {
      console.log(`[dos.library] DupLock(0) - NULL lock, returning 0`);
      this.emulator.setRegister(CPURegister.D0, 0);
      this.lastError = this.ERROR_NO_ERROR;
      return;
    }

    // Find lock by BPTR
    let originalLock: Lock | undefined;
    for (const lock of this.locks.values()) {
      if (lock.bptr === bptrIn) {
        originalLock = lock;
        break;
      }
    }

    if (!originalLock) {
      console.error(
        `[dos.library] DupLock: Invalid lock BPTR 0x${bptrIn.toString(16)}`
      );
      this.emulator.setRegister(CPURegister.D0, 0);
      this.lastError = this.ERROR_INVALID_LOCK;
      return;
    }

    // Create a new lock with the same path and mode
    const newLockId = this.nextLockId++;
    const newBptr = this.allocateFileLock(newLockId, originalLock.mode);
    const newMemAddr = newBptr << 2;

    this.locks.set(newLockId, {
      id: newLockId,
      path: originalLock.path,
      mode: originalLock.mode,
      amigaPath: originalLock.amigaPath,
      memAddr: newMemAddr,
      bptr: newBptr,
    });

    console.log(
      `[dos.library] DupLock(BPTR=${bptrIn}) - Created duplicate lock ${newLockId} (BPTR ${newBptr}) for ${originalLock.path}`
    );

    this.emulator.setRegister(CPURegister.D0, newBptr); // Return BPTR, not lockId!
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
    const bptrIn = this.emulator.getRegister(CPURegister.D1);
    const fibPtr = this.emulator.getRegister(CPURegister.D2);

    console.log(
      `[dos.library] Examine(lock=${bptrIn}, fib=0x${fibPtr.toString(16)})`
    );

    // Find lock by BPTR (D1 contains BPTR, not lockId)
    let lock = null as any;
    let foundLockId = 0;
    for (const [lockId, l] of this.locks.entries()) {
      if (l.bptr === bptrIn) {
        lock = l;
        foundLockId = lockId;
        break;
      }
    }

    if (!lock) {
      console.error(`[dos.library] Examine: Invalid lock BPTR ${bptrIn}`);
      this.emulator.setRegister(CPURegister.D0, 0);
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
      return;
    }

    try {
      const stats = fs.statSync(lock.path);
      const fileName = path.basename(lock.path);

      // Targeted trace for AquaScan FR gating: only for Dir1 examines
      if (/^dir1$/i.test(fileName)) {
        const pc = this.emulator.getRegister(CPURegister.PC);
        const d0 = this.emulator.getRegister(CPURegister.D0);
        const d1 = this.emulator.getRegister(CPURegister.D1);
        const d7 = this.emulator.getRegister(CPURegister.D7);
        const a0 = this.emulator.getRegister(CPURegister.A0);
        const a1 = this.emulator.getRegister(CPURegister.A1);
        const sp = this.emulator.getRegister(CPURegister.A7);
        const returnAddr = this.emulator.readMemory32(sp);
        const a5 = this.emulator.getRegister(CPURegister.A5);
        const val32 = this.emulator.readMemory16(a5 + 0x32);
        console.log(
          `[dos.library][trace] PC=0x${pc.toString(16)} D0=0x${d0.toString(16)} D1=0x${d1.toString(16)} ` +
          `D7=0x${d7.toString(16)} A0=0x${a0.toString(16)} A1=0x${a1.toString(16)} A5=0x${a5.toString(16)} ` +
          `A5+0x32=0x${val32.toString(16)} SP=0x${sp.toString(16)} RA=0x${returnAddr.toString(16)} fib=0x${fibPtr.toString(16)} file=${fileName}`
        );
      }

      // Clear FileInfoBlock (260 bytes)
      for (let i = 0; i < 260; i++) {
        this.emulator.writeMemory(fibPtr + i, 0);
      }

      // fib_DiskKey (4 bytes)
      this.writeLong(fibPtr, 0);

      // fib_DirEntryType (4 bytes) - negative = file, positive = dir
      // AmiExpress "DirN" listing files must be treated as directories (matches real 68K behavior)
      const isDirListing = /^dir\d+$/i.test(fileName);
      const dirEntryType = stats.isDirectory() || isDirListing ? 2 : -3;
      console.log(
        `[dos.library] Examine: fileName="${fileName}" dirEntryType=${dirEntryType}`
      );
      // Write fib_DirEntryType/EntryType (positive for dirs, negative for files)
      // Write as raw bytes (defensive: ensure positive dir marker stays set)
      this.emulator.writeMemory(fibPtr + 4, (dirEntryType >> 24) & 0xff);
      this.emulator.writeMemory(fibPtr + 5, (dirEntryType >> 16) & 0xff);
      this.emulator.writeMemory(fibPtr + 6, (dirEntryType >> 8) & 0xff);
      this.emulator.writeMemory(fibPtr + 7, dirEntryType & 0xff);

      // fib_FileName (108 bytes BCPL string)
      this.writeBCPLString(fibPtr + 8, fileName, 107);

      // fib_Protection (4 bytes) - Amiga RWED bits (inverted: 0=allowed, 1=protected)
      // Standard file: 0x0F = DEWR all protected (read-only)
      const protection = stats.isDirectory() ? 0 : 0x0F;
      this.emulator.writeMemory32(fibPtr + 116, protection);

      // fib_EntryType (4 bytes) - same as fib_DirEntryType
      this.emulator.writeMemory(fibPtr + 120, (dirEntryType >> 24) & 0xff);
      this.emulator.writeMemory(fibPtr + 121, (dirEntryType >> 16) & 0xff);
      this.emulator.writeMemory(fibPtr + 122, (dirEntryType >> 8) & 0xff);
      this.emulator.writeMemory(fibPtr + 123, dirEntryType & 0xff);

      // fib_Size (4 bytes)
      const fibSizeVal = stats.isFile() ? stats.size : 0;
      this.emulator.writeMemory32(fibPtr + 124, fibSizeVal);
      console.log(`[dos.library] fib_Size=${fibSizeVal} (0x${fibSizeVal.toString(16)}) -> 0x${(fibPtr + 124).toString(16)}`);

      // fib_NumBlocks (4 bytes)
      this.emulator.writeMemory32(fibPtr + 128, 0);

      // fib_Date (12 bytes DateStamp)
      const mtime = stats.mtime;
      const epoch = new Date("1978-01-01T00:00:00Z");
      const days = Math.floor(
        (mtime.getTime() - epoch.getTime()) / (1000 * 60 * 60 * 24)
      );
      const minutes = mtime.getHours() * 60 + mtime.getMinutes();
      const ticks = mtime.getSeconds() * 50;

      this.emulator.writeMemory32(fibPtr + 132, days);
      this.emulator.writeMemory32(fibPtr + 136, minutes);
      this.emulator.writeMemory32(fibPtr + 140, ticks);

      // fib_Comment (80 bytes BCPL string)
      this.writeBCPLString(fibPtr + 144, "", 79);

      console.log(
        `[dos.library] Examine: ${fileName} (${
          stats.isDirectory() ? "dir" : "file"
        }, ${stats.size} bytes)`
      );
      // Use emulator readMemory32 to avoid missing helper methods
      let loggedDirEntryType = this.emulator.readMemory32(fibPtr + 4);
      let loggedEntryType = this.emulator.readMemory32(fibPtr + 120);
      const rawDirBytes = [
        this.emulator.readMemory(fibPtr + 4),
        this.emulator.readMemory(fibPtr + 5),
        this.emulator.readMemory(fibPtr + 6),
        this.emulator.readMemory(fibPtr + 7),
      ];
      const rawEntryBytes = [
        this.emulator.readMemory(fibPtr + 120),
        this.emulator.readMemory(fibPtr + 121),
        this.emulator.readMemory(fibPtr + 122),
        this.emulator.readMemory(fibPtr + 123),
      ];
      console.log(
        `[dos.library]   fib_DirEntryType=${loggedDirEntryType}, ` +
        `fib_EntryType=${loggedEntryType}, fib_Size=${fibSizeVal}, fib_Protection=${protection}`
      );
      console.log(
        `[dos.library]   raw DirEntry bytes=${rawDirBytes
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(" ")} Entry bytes=${rawEntryBytes
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(" ")}`
      );

      // Targeted trace for AquaScan FR gating: only when caller PC ~0x6100-0x6200 (door code)
      const pc = this.emulator.getRegister(CPURegister.PC);
      if (pc >= 0x6100 && pc <= 0x6200) {
        const d0 = this.emulator.getRegister(CPURegister.D0);
        const d1 = this.emulator.getRegister(CPURegister.D1);
        const d7 = this.emulator.getRegister(CPURegister.D7);
        const a0 = this.emulator.getRegister(CPURegister.A0);
        const a1 = this.emulator.getRegister(CPURegister.A1);
        console.log(
          `[dos.library][trace] PC=0x${pc.toString(16)} D0=0x${d0.toString(16)} D1=0x${d1.toString(16)} ` +
          `D7=0x${d7.toString(16)} A0=0x${a0.toString(16)} A1=0x${a1.toString(16)} ` +
          `fib_DirEntryType=${loggedDirEntryType} fib_Size=${fibSizeVal} prot=${protection}`
        );
      }

      // Initialize directory iterator for this lock if it's a directory
      if (stats.isDirectory()) {
        const files = fs.readdirSync(lock.path);
        this.dirIterators.set(foundLockId, files);
        this.dirIteratorIndex.set(foundLockId, 0);
        console.log(
          `[dos.library] Examine: Initialized directory iterator (${files.length} entries)`
        );
      }

      this.emulator.setRegister(CPURegister.D0, -1); // DOSTRUE
      this.lastError = this.ERROR_NO_ERROR;
    } catch (error) {
      console.error(
        `[dos.library] Examine: Error examining path ${lock.path}:`,
        error
      );
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
    const bptrIn = this.emulator.getRegister(CPURegister.D1);
    const fibPtr = this.emulator.getRegister(CPURegister.D2);

    console.log(
      `[dos.library] ExNext(lock=${bptrIn}, fib=0x${fibPtr.toString(16)})`
    );

    // Find lock by BPTR (D1 contains BPTR, not lockId)
    const result = this.findLockByBptr(bptrIn);
    if (!result) {
      console.error(`[dos.library] ExNext: Invalid lock BPTR ${bptrIn}`);
      this.emulator.setRegister(CPURegister.D0, 0);
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
      return;
    }
    const { lock, lockId } = result;

    // Get or create directory iterator
    if (!this.dirIterators.has(lockId)) {
      // Examine() should have been called first, but we'll initialize here too
      try {
        const files = fs.readdirSync(lock.path);
        this.dirIterators.set(lockId, files);
        this.dirIteratorIndex.set(lockId, 0);
      } catch (error) {
        console.error(
          `[dos.library] ExNext: Error reading directory ${lock.path}:`,
          error
        );
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
      this.emulator.writeMemory32(fibPtr, index);

      // fib_DirEntryType (4 bytes) - negative = file, positive = dir
      // Treat DirN listing files as directories (AmiExpress convention)
      const isDirListing = /^dir\d+$/i.test(fileName);
      const dirEntryType = stats.isDirectory() || isDirListing ? 2 : -3;
      this.emulator.writeMemory32(fibPtr + 4, dirEntryType);

      // fib_FileName (108 bytes BCPL string)
      this.writeBCPLString(fibPtr + 8, fileName, 107);

      // fib_Protection (4 bytes) - Amiga RWED bits (inverted: 0=allowed, 1=protected)
      // Standard file: 0x0F = DEWR all protected (read-only)
      const protection = stats.isDirectory() ? 0 : 0x0F;
      this.emulator.writeMemory32(fibPtr + 116, protection);

      // fib_EntryType (4 bytes) - same as fib_DirEntryType
      this.emulator.writeMemory32(fibPtr + 120, dirEntryType);

      // fib_Size (4 bytes)
      const fibSizeVal = stats.isFile() ? stats.size : 0;
      this.emulator.writeMemory32(fibPtr + 124, fibSizeVal);
      console.log(`[dos.library] fib_Size=${fibSizeVal} (0x${fibSizeVal.toString(16)}) -> 0x${(fibPtr + 124).toString(16)}`);

      // fib_NumBlocks (4 bytes)
      this.emulator.writeMemory32(fibPtr + 128, 0);

      // fib_Date (12 bytes DateStamp)
      const mtime = stats.mtime;
      const epoch = new Date("1978-01-01T00:00:00Z");
      const days = Math.floor(
        (mtime.getTime() - epoch.getTime()) / (1000 * 60 * 60 * 24)
      );
      const minutes = mtime.getHours() * 60 + mtime.getMinutes();
      const ticks = mtime.getSeconds() * 50;

      this.emulator.writeMemory32(fibPtr + 132, days);
      this.emulator.writeMemory32(fibPtr + 136, minutes);
      this.emulator.writeMemory32(fibPtr + 140, ticks);

      // fib_Comment (80 bytes BCPL string)
      this.writeBCPLString(fibPtr + 144, "", 79);

      console.log(
        `[dos.library] ExNext: ${fileName} (${
          stats.isDirectory() ? "dir" : "file"
        }, ${stats.size} bytes)`
      );

      // Increment iterator
      this.dirIteratorIndex.set(lockId, index + 1);

      this.emulator.setRegister(CPURegister.D0, -1); // DOSTRUE
      this.lastError = this.ERROR_NO_ERROR;
    } catch (error) {
      console.error(
        `[dos.library] ExNext: Error reading file ${filePath}:`,
        error
      );
      this.emulator.setRegister(CPURegister.D0, 0);
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
    }
  }

  /**
   * Info - Get information about a volume
   * D1 = lock
   * D2 = InfoData pointer
   * Returns: D0 = success (DOSTRUE=-1, DOSFALSE=0)
   *
   * InfoData structure (36 bytes):
   * id_NumSoftErrors (4), id_UnitNumber (4), id_DiskState (4), id_NumBlocks (4),
   * id_NumBlocksUsed (4), id_BytesPerBlock (4), id_DiskType (4), id_VolumeNode (4),
   * id_InUse (4)
   */
  Info(): void {
    const bptrIn = this.emulator.getRegister(CPURegister.D1);
    const infoPtr = this.emulator.getRegister(CPURegister.D2);

    console.log(
      `[dos.library] Info(lock=0x${bptrIn.toString(
        16
      )}, info=0x${infoPtr.toString(16)})`
    );

    try {
      // Get filesystem stats
      let volumePath = this.bbsRoot;
      if (bptrIn !== 0) {
        // Find lock by BPTR (D1 contains BPTR, not lockId)
        const result = this.findLockByBptr(bptrIn);
        if (result) {
          volumePath = result.lock.path;
        }
      }

      const stats = fs.statfsSync ? fs.statfsSync(volumePath) : null;

      // id_NumSoftErrors (4 bytes) - always 0
      this.writeLong(infoPtr + 0, 0);

      // id_UnitNumber (4 bytes) - always 0
      this.writeLong(infoPtr + 4, 0);

      // id_DiskState (4 bytes) - ID_VALIDATED (0)
      this.writeLong(infoPtr + 8, 0);

      // id_NumBlocks (4 bytes) - total blocks (or fake value)
      const numBlocks = stats ? Math.floor(stats.blocks / 2) : 1000000;
      this.writeLong(infoPtr + 12, numBlocks);

      // id_NumBlocksUsed (4 bytes) - used blocks (or fake value)
      const numBlocksUsed = stats
        ? Math.floor((stats.blocks - stats.bfree) / 2)
        : 500000;
      this.writeLong(infoPtr + 16, numBlocksUsed);

      // id_BytesPerBlock (4 bytes) - always 512
      this.writeLong(infoPtr + 20, 512);

      // id_DiskType (4 bytes) - ID_DOS_DISK (0x444F5300 = 'DOS\0')
      this.writeLong(infoPtr + 24, 0x444f5300);

      // id_VolumeNode (4 bytes) - fake volume node pointer
      this.writeLong(infoPtr + 28, 0x00090000);

      // id_InUse (4 bytes) - always 0 (not locked)
      this.writeLong(infoPtr + 32, 0);

      console.log(
        `[dos.library] Info: blocks=${numBlocks}, used=${numBlocksUsed}, bytes/block=512`
      );

      this.emulator.setRegister(CPURegister.D0, -1);
      this.lastError = this.ERROR_NO_ERROR;
    } catch (error) {
      console.error(`[dos.library] Info: Error getting volume info:`, error);
      this.emulator.setRegister(CPURegister.D0, 0);
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
    }
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
      console.error(
        `[dos.library] CreateDir: Failed to resolve path "${name}"`
      );
      this.emulator.setRegister(CPURegister.D0, 0);
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
      return;
    }

    // Check if directory already exists
    if (fs.existsSync(realPath)) {
      console.error(
        `[dos.library] CreateDir: Path already exists: ${realPath}`
      );
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
      const bptr = this.allocateFileLock(lockId, -2); // ACCESS_READ
      const memAddr = bptr << 2;

      this.locks.set(lockId, {
        id: lockId,
        path: realPath,
        mode: -2, // ACCESS_READ
        amigaPath: name,
        memAddr: memAddr,
        bptr: bptr,
      });

      this.emulator.setRegister(CPURegister.D0, bptr); // Return BPTR
      this.lastError = this.ERROR_NO_ERROR;
    } catch (error) {
      console.error(
        `[dos.library] CreateDir: Error creating directory ${realPath}:`,
        error
      );
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
    const bptrIn = this.emulator.getRegister(CPURegister.D1);

    console.log(`[dos.library] CurrentDir(lock=${bptrIn})`);

    // Create lock for current directory (to return as "old directory")
    const oldDirLockId = this.nextLockId++;
    const oldDirBptr = this.allocateFileLock(oldDirLockId, -2); // ACCESS_READ
    const oldDirMemAddr = oldDirBptr << 2;

    this.locks.set(oldDirLockId, {
      id: oldDirLockId,
      path: this.currentDirectory,
      amigaPath: this.currentDirectoryAmiga,
      mode: -2, // ACCESS_READ
      memAddr: oldDirMemAddr,
      bptr: oldDirBptr,
    });

    if (bptrIn === 0) {
      // D1=0 means "just get current directory lock, don't change"
      console.log(
        `[dos.library] CurrentDir: Returning current directory lock ${oldDirLockId} (BPTR ${oldDirBptr}) for ${this.currentDirectory}`
      );
      this.emulator.setRegister(CPURegister.D0, oldDirBptr); // Return BPTR
      this.lastError = this.ERROR_NO_ERROR;
      return;
    }

    // Find lock by BPTR (D1 contains BPTR, not lockId)
    const result = this.findLockByBptr(bptrIn);
    if (!result) {
      console.error(`[dos.library] CurrentDir: Invalid lock BPTR ${bptrIn}`);
      this.emulator.setRegister(CPURegister.D0, 0);
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
      return;
    }
    const newLock = result.lock;

    // Verify the lock points to a directory
    if (
      !fs.existsSync(newLock.path) ||
      !fs.statSync(newLock.path).isDirectory()
    ) {
      console.error(
        `[dos.library] CurrentDir: Lock BPTR ${bptrIn} does not point to a directory: ${newLock.path}`
      );
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
    console.log(
      `[dos.library] CurrentDir: Changed from ${oldDir} to ${this.currentDirectory}`
    );

    // Return BPTR for old directory
    this.emulator.setRegister(CPURegister.D0, oldDirBptr);
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

    console.log(`[dos.library] CreateProc("${name}") - UNSUPPORTED (process creation not allowed), returning NULL`);

    // Process creation not supported in door emulation
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
    console.log(
      `[dos.library] Setting PC to exit trap address 0xFFFF00 to terminate door`
    );

    // Set PC to exit trap address - this signals the emulation loop to terminate
    const EXIT_TRAP_ADDRESS = 0xffff00;
    this.emulator.setRegister(16, EXIT_TRAP_ADDRESS); // PC = exit trap

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

    console.log(`[dos.library] LoadSeg("${name}") - UNSUPPORTED (dynamic code loading not allowed), returning NULL`);

    // Dynamic code loading not supported (security)
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

    console.log(
      `[dos.library] UnLoadSeg(segList=0x${segList.toString(16)}) - No-op (LoadSeg always fails)`
    );

    // Always success since LoadSeg always returns NULL
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

    console.log(
      `[dos.library] DeviceProc("${name}") - Returning fake MsgPort (device handlers not implemented)`
    );

    // Return fake MsgPort address for compatibility
    this.emulator.setRegister(CPURegister.D0, 0x4000);
    this.lastError = this.ERROR_NO_ERROR;
  }

  /**
   * SetComment - Set file comment
   * D1 = name
   * D2 = comment
   * Returns: D0 = success (DOSTRUE=-1, DOSFALSE=0)
   *
   * Note: File comments stored in .comment sidecar files (xattr not universally supported)
   */
  SetComment(): void {
    const namePtr = this.emulator.getRegister(CPURegister.D1);
    const commentPtr = this.emulator.getRegister(CPURegister.D2);
    const name = this.readString(namePtr);
    const comment = commentPtr ? this.readString(commentPtr) : "";

    console.log(`[dos.library] SetComment("${name}", "${comment}")`);

    const realPath = this.resolvePath(name);
    if (!realPath) {
      console.error(
        `[dos.library] SetComment: Failed to resolve path "${name}"`
      );
      this.emulator.setRegister(CPURegister.D0, 0);
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
      return;
    }

    if (!fs.existsSync(realPath)) {
      console.error(`[dos.library] SetComment: File not found: ${realPath}`);
      this.emulator.setRegister(CPURegister.D0, 0);
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
      return;
    }

    try {
      // Store comment in .comment sidecar file
      const commentPath = realPath + ".comment";
      if (comment) {
        fs.writeFileSync(commentPath, comment, "utf-8");
        console.log(
          `[dos.library] SetComment: Wrote comment to ${commentPath}`
        );
      } else {
        // Empty comment = delete comment file
        if (fs.existsSync(commentPath)) {
          fs.unlinkSync(commentPath);
          console.log(
            `[dos.library] SetComment: Removed comment file ${commentPath}`
          );
        }
      }

      this.emulator.setRegister(CPURegister.D0, -1);
      this.lastError = this.ERROR_NO_ERROR;
    } catch (error) {
      console.error(
        `[dos.library] SetComment: Error setting comment on ${realPath}:`,
        error
      );
      this.emulator.setRegister(CPURegister.D0, 0);
      this.lastError = this.ERROR_WRITE_PROTECTED;
    }
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

    console.log(
      `[dos.library] SetProtection("${name}", 0x${protect.toString(16)})`
    );

    const realPath = this.resolvePath(name);
    if (!realPath) {
      console.error(
        `[dos.library] SetProtection: Failed to resolve path "${name}"`
      );
      this.emulator.setRegister(CPURegister.D0, 0);
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
      return;
    }

    if (!fs.existsSync(realPath)) {
      console.error(
        `[dos.library] SetProtection: File not found: ${realPath}`
      );
      this.emulator.setRegister(CPURegister.D0, 0);
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
      return;
    }

    try {
      // Convert Amiga protection bits to Unix mode
      // Amiga bits (inverted): R=bit0, W=bit1, E=bit2, D=bit3
      // 0 = operation allowed, 1 = operation protected
      const amigaRead = !(protect & 0x01);    // R bit inverted
      const amigaWrite = !(protect & 0x02);   // W bit inverted
      const amigaExec = !(protect & 0x04);    // E bit inverted

      // Map to Unix permissions (owner only, group/other read if file is readable)
      let unixMode = 0;
      if (amigaRead) unixMode |= 0o400;  // Owner read
      if (amigaWrite) unixMode |= 0o200; // Owner write
      if (amigaExec) unixMode |= 0o100;  // Owner execute

      // Add group/other read if owner can read
      if (amigaRead) {
        unixMode |= 0o040; // Group read
        unixMode |= 0o004; // Other read
      }

      fs.chmodSync(realPath, unixMode);
      console.log(
        `[dos.library] SetProtection: Set ${realPath} to mode ${unixMode.toString(8)}`
      );

      this.emulator.setRegister(CPURegister.D0, -1);
      this.lastError = this.ERROR_NO_ERROR;
    } catch (error) {
      console.error(
        `[dos.library] SetProtection: Error setting protection on ${realPath}:`,
        error
      );
      this.emulator.setRegister(CPURegister.D0, 0);
      this.lastError = this.ERROR_WRITE_PROTECTED;
    }
  }

  /**
   * ParentDir - Get parent directory lock
   * D1 = lock
   * Returns: D0 = parent lock (or 0 if none)
   */
  ParentDir(): void {
    const bptrIn = this.emulator.getRegister(CPURegister.D1);

    console.log(`[dos.library] ParentDir(lock=0x${bptrIn.toString(16)})`);

    if (bptrIn === 0) {
      console.log(`[dos.library] ParentDir: NULL lock, returning 0`);
      this.emulator.setRegister(CPURegister.D0, 0);
      this.lastError = this.ERROR_NO_ERROR;
      return;
    }

    // Find lock by BPTR (D1 contains BPTR, not lockId)
    const result = this.findLockByBptr(bptrIn);
    if (!result) {
      console.error(
        `[dos.library] ParentDir: Invalid lock BPTR 0x${bptrIn.toString(16)}`
      );
      this.emulator.setRegister(CPURegister.D0, 0);
      this.lastError = this.ERROR_INVALID_LOCK;
      return;
    }
    const lock = result.lock;

    // Get parent directory
    const parentPath = path.dirname(lock.path);

    // Check if we're at root (parent is same as current or bbsRoot)
    if (parentPath === lock.path || parentPath === this.bbsRoot) {
      console.log(`[dos.library] ParentDir: At root, returning 0`);
      this.emulator.setRegister(CPURegister.D0, 0);
      this.lastError = this.ERROR_NO_ERROR;
      return;
    }

    // Create lock for parent directory
    const parentLockId = this.nextLockId++;
    const parentAmigaPath = path.dirname(lock.amigaPath);
    const parentBptr = this.allocateFileLock(parentLockId, lock.mode);
    const parentMemAddr = parentBptr << 2;

    this.locks.set(parentLockId, {
      id: parentLockId,
      path: parentPath,
      mode: lock.mode,
      amigaPath: parentAmigaPath,
      memAddr: parentMemAddr,
      bptr: parentBptr,
    });

    console.log(
      `[dos.library] ParentDir: Created lock ${parentLockId} (BPTR ${parentBptr}) for parent ${parentPath}`
    );

    this.emulator.setRegister(CPURegister.D0, parentBptr); // Return BPTR
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

    console.log(`[dos.library] Execute("${name}") - UNSUPPORTED (shell command execution blocked for security), returning failure`);

    // Shell command execution not supported (security)
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
    console.log(
      `[dos.library] GetArgStr() returning 0x${this.argStringPtr.toString(16)}`
    );
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

    console.log(
      `[dos.library] GetCliProgramName(buf=0x${bufPtr.toString(
        16
      )}, len=${bufLen})`
    );

    if (this.programName.length === 0) {
      // No program name set - return empty string and failure
      this.emulator.writeMemory(bufPtr, 0);
      this.emulator.setRegister(CPURegister.D0, 0);
      this.lastError = 212; // ERROR_OBJECT_WRONG_TYPE
      console.log(
        `[dos.library] GetCliProgramName: No CLI structure, returning failure`
      );
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
    console.log(
      `[dos.library] GetCliProgramName: Returned "${this.programName.substring(
        0,
        copyLen
      )}"`
    );
  }

  /**
   * Set CLI information (called by AmigaDoorSession)
   */
  setCliInfo(argStringPtr: number, programName: string): void {
    this.argStringPtr = argStringPtr;
    this.programName = programName;
    console.log(
      `[dos.library] CLI info set: argString=0x${argStringPtr.toString(
        16
      )}, progName="${programName}"`
    );
  }

  /**
   * WaitForChar - Check if character available within timeout (V36)
   * D1 = file handle (BPTR)
   * D2 = timeout (microseconds)
   * Returns: D0 = -1 (TRUE) if char available, 0 (FALSE) otherwise
   */
  WaitForChar(): number {
    const fileHandle = this.emulator.getRegister(CPURegister.D1);
    const timeout = this.emulator.getRegister(CPURegister.D2);

    console.log(
      `[dos.library] WaitForChar(fh=${fileHandle}, timeout=${timeout})`
    );

    // For console/stdin, check if input buffer has data
    if (fileHandle === this.STDIN_HANDLE || fileHandle === this.STDOUT_HANDLE) {
      const hasData = this.inputBuffer.length > 0;
      this.emulator.setRegister(CPURegister.D0, hasData ? -1 : 0);
      console.log(`[dos.library] WaitForChar: Console, hasData=${hasData}`);
      return -1;
    }

    // For regular files, character is always available (file in memory)
    const file = this.openFiles.get(fileHandle);
    if (!file) {
      this.emulator.setRegister(CPURegister.D0, 0); // FALSE - invalid handle
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
      console.log(`[dos.library] WaitForChar: Invalid file handle`);
      return -1;
    }

    if (file.isConsole) {
      const hasData = this.inputBuffer.length > 0;
      this.emulator.setRegister(CPURegister.D0, hasData ? -1 : 0);
      console.log(
        `[dos.library] WaitForChar: Console file, hasData=${hasData}`
      );
    } else {
      // File: check if position < file size
      const atEOF = !file.buffer || file.position >= file.buffer.length;
      this.emulator.setRegister(CPURegister.D0, atEOF ? 0 : -1);
      console.log(`[dos.library] WaitForChar: Regular file, atEOF=${atEOF}`);
    }
    return this.emulator.getRegister(CPURegister.D0);
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
      const formattedBuf = Buffer.from(formatted, "binary");
      file.buffer = Buffer.concat([file.buffer, formattedBuf]);
      file.position = file.buffer.length;
    }

    this.emulator.setRegister(CPURegister.D0, formatted.length);
    console.log(`[dos.library] VFPrintf: Wrote ${formatted.length} bytes`);
  }

  /**
   * Helper: Simple printf-style formatting (RawDoFmt compatible)
   * Supports: %s (string), %ld/%d (decimal), %lx/%x (hex), %c (char)
   */
  private formatString(fmt: string, argvAddr: number): string {
    let result = "";
    let argIndex = 0;

    for (let i = 0; i < fmt.length; i++) {
      if (fmt[i] === "%" && i + 1 < fmt.length) {
        const spec = fmt[i + 1];
        let longFormat = false;

        // Check for 'l' prefix (e.g., %ld, %lx)
        if (spec === "l" && i + 2 < fmt.length) {
          longFormat = true;
          i++; // Skip 'l'
        }

        const actualSpec = longFormat ? fmt[i + 1] : spec;

        switch (actualSpec) {
          case "s": {
            // String pointer
            const strPtr = this.emulator.readMemory32(argvAddr + argIndex * 4);
            const str = this.readString(strPtr);
            result += str;
            argIndex++;
            i++;
            break;
          }
          case "d": {
            // Decimal integer
            const value = this.emulator.readMemory32(argvAddr + argIndex * 4);
            // Handle as signed
            const signed = value > 0x7fffffff ? value - 0x100000000 : value;
            result += signed.toString(10);
            argIndex++;
            i++;
            break;
          }
          case "x": {
            // Hexadecimal
            const value = this.emulator.readMemory32(argvAddr + argIndex * 4);
            result += value.toString(16);
            argIndex++;
            i++;
            break;
          }
          case "c": {
            // Character
            const value = this.emulator.readMemory32(argvAddr + argIndex * 4);
            result += String.fromCharCode(value & 0xff);
            argIndex++;
            i++;
            break;
          }
          default:
            // Unknown format, just output as-is
            result += "%" + (longFormat ? "l" : "") + actualSpec;
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
    this.emulator.writeMemory(address, (value >> 24) & 0xff);
    this.emulator.writeMemory(address + 1, (value >> 16) & 0xff);
    this.emulator.writeMemory(address + 2, (value >> 8) & 0xff);
    this.emulator.writeMemory(address + 3, value & 0xff);
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

  private getOrCreateReadArgsContext(
    rdargsAddr: number
  ): ReadArgsContextInfo | null {
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
      bufferPtr = this.allocateReadArgsBufferInternal(
        this.READARGS_DEFAULT_BUFFER_SIZE
      );
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
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .map((entry) => {
        const [namePart, ...modifierParts] = entry.split("/");
        const modifiers = modifierParts
          .map((m) => m.trim().toUpperCase())
          .filter(Boolean);
        const aliasParts = namePart
          .split("=")
          .map((part) => part.trim())
          .filter(Boolean);
        const canonical =
          aliasParts.length > 0 ? aliasParts[aliasParts.length - 1] : "";
        const aliases = aliasParts.slice(0, -1);
        const namesUpper = [canonical, ...aliases]
          .filter(Boolean)
          .map((n) => n.toUpperCase());
        return {
          displayName: canonical || entry,
          namesUpper,
          required: modifiers.includes("A"),
          isSwitch: modifiers.includes("S"),
          isKeyword: modifiers.includes("K"),
          isNumeric: modifiers.includes("N"),
          isMultiple: modifiers.includes("M"),
          isRest: modifiers.includes("F"),
          isToggle: modifiers.includes("T"),
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
      return {
        input: cli.trim(),
        sourcePtr: this.argStringPtr,
        length: cli.length,
      };
    }

    return { input: "", sourcePtr: 0, length: 0 };
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
    let current = "";
    let inQuotes = false;
    let escapeNext = false;

    const flushToken = () => {
      const trimmed = current.trim();
      if (trimmed.length > 0) {
        const eqIndex = trimmed.indexOf("=");
        const token: ReadArgsToken = {
          raw: trimmed,
          value: eqIndex >= 0 ? trimmed.slice(eqIndex + 1) : trimmed,
          normalizedValue: trimmed.toUpperCase(),
          consumed: false,
        };
        if (eqIndex > 0) {
          token.key = trimmed.slice(0, eqIndex);
          token.keyUpper = token.key.toUpperCase();
          token.normalizedValue = (token.value || "").toUpperCase();
        }
        tokens.push(token);
      }
      current = "";
    };

    for (let i = 0; i < input.length; i++) {
      const ch = input[i];
      if (escapeNext) {
        current += ch;
        escapeNext = false;
        continue;
      }
      if (ch === "\\" && inQuotes) {
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
  ): string | "NEED_VALUE" | null {
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
        const nextToken = this.findNextValueToken(
          tokens,
          i + 1,
          templateNames,
          consumedTokens
        );
        if (!nextToken) {
          return "NEED_VALUE";
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
    if (str.startsWith("$")) {
      base = 16;
      str = str.slice(1);
    } else if (str.startsWith("0x") || str.startsWith("0X")) {
      base = 16;
      str = str.slice(2);
    }
    const parsed = parseInt(str, base);
    if (Number.isNaN(parsed)) {
      return null;
    }
    return parsed << 0;
  }

  private allocateStringStorage(
    context: ReadArgsContext,
    value: string
  ): number | null {
    const addr = this.allocateFromReadArgsContext(context, value.length + 1);
    if (!addr) {
      return null;
    }
    this.writeString(addr, value);
    return addr;
  }

  private allocateNumberStorage(
    context: ReadArgsContext,
    num: number
  ): number | null {
    const addr = this.allocateFromReadArgsContext(context, 4);
    if (!addr) {
      return null;
    }
    this.writeLong(addr, num);
    return addr;
  }

  private allocatePointerArray(
    context: ReadArgsContext,
    count: number
  ): number | null {
    return this.allocateFromReadArgsContext(context, count * 4);
  }

  private allocateFromReadArgsContext(
    context: ReadArgsContext,
    size: number
  ): number | null {
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
    const bptrIn = this.emulator.getRegister(CPURegister.D1);
    const bufAddr = this.emulator.getRegister(CPURegister.D2);
    const bufLen = this.emulator.getRegister(CPURegister.D3);

    console.log(
      `[dos.library] NameFromLock(lock=${bptrIn.toString(
        16
      )}, buf=${bufAddr.toString(16)}, len=${bufLen})`
    );

    // If lock is NULL, return "SYS:"
    if (bptrIn === 0) {
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

    // Find lock by BPTR (D1 contains BPTR, not lockId)
    const result = this.findLockByBptr(bptrIn);
    if (!result) {
      console.log(
        `[dos.library] NameFromLock: Lock BPTR ${bptrIn.toString(16)} not found`
      );
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
      this.emulator.setRegister(CPURegister.D0, 0); // FALSE
      return;
    }
    const lockInfo = result.lock;

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
   * OpenFromLock - Open a file from a lock (V36)
   * D1 = lock (BPTR) - consumed by this call
   * Returns: D0 = file handle (BPTR) or 0 on error
   *
   * Opens the file associated with the lock for reading.
   * The lock is consumed and should not be UnLocked separately.
   */
  OpenFromLock(): void {
    const bptrIn = this.emulator.getRegister(CPURegister.D1);

    console.log(`[dos.library] OpenFromLock(lock=${bptrIn})`);

    // Find lock by BPTR (D1 contains BPTR, not lockId)
    const result = this.findLockByBptr(bptrIn);
    if (!result) {
      console.error(`[dos.library] OpenFromLock: Invalid lock BPTR ${bptrIn}`);
      this.emulator.setRegister(CPURegister.D0, 0);
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
      return;
    }
    const { lock, lockId } = result;

    // Open the file for reading using FileManager
    const filePath = lock.path;
    console.log(`[dos.library] OpenFromLock: Opening file ${filePath}`);

    try {
      // Use FileManager to open the file
      if (!this.fileManager) {
        console.error(`[dos.library] OpenFromLock: FileManager not available`);
        this.emulator.setRegister(CPURegister.D0, 0);
        this.lastError = this.ERROR_OBJECT_NOT_FOUND;
        return;
      }

      const bptr = this.fileManager.open(filePath, 1005); // MODE_OLDFILE
      if (bptr === 0) {
        console.error(`[dos.library] OpenFromLock: Failed to open ${filePath}`);
        this.emulator.setRegister(CPURegister.D0, 0);
        this.lastError = this.ERROR_OBJECT_NOT_FOUND;
        return;
      }

      // Lock is consumed - remove it from our locks map
      this.locks.delete(lockId);

      console.log(`[dos.library] OpenFromLock: Opened ${filePath} as BPTR ${bptr}`);
      this.emulator.setRegister(CPURegister.D0, bptr);
      this.lastError = this.ERROR_NO_ERROR;
    } catch (error) {
      console.error(`[dos.library] OpenFromLock: Error opening ${filePath}:`, error);
      this.emulator.setRegister(CPURegister.D0, 0);
      this.lastError = this.ERROR_OBJECT_NOT_FOUND;
    }
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

    console.log(
      `[dos.library] NameFromFH(fh=${fileHandle.toString(
        16
      )}, buf=${bufAddr.toString(16)}, len=${bufLen})`
    );

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
      if (path[i] === "/" || path[i] === ":") {
        lastSep = i;
        break;
      }
    }

    // Return pointer to character after last separator (or start if no separator)
    const offset = lastSep + 1;
    const resultAddr = pathAddr + offset;

    console.log(
      `[dos.library] FilePart returned offset ${offset}, addr=${resultAddr.toString(
        16
      )}`
    );
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
      if (path[i] === "/") {
        lastSlash = i;
        break;
      }
    }

    if (lastSlash >= 0) {
      // Return pointer to the '/'
      const resultAddr = pathAddr + lastSlash;
      console.log(
        `[dos.library] PathPart returned offset ${lastSlash}, addr=${resultAddr.toString(
          16
        )}`
      );
      this.emulator.setRegister(CPURegister.D0, resultAddr);
      return;
    }

    // No '/', find last ':'
    let lastColon = -1;
    for (let i = path.length - 1; i >= 0; i--) {
      if (path[i] === ":") {
        lastColon = i;
        break;
      }
    }

    // Return pointer after the ':' or to beginning
    const offset = lastColon + 1;
    const resultAddr = pathAddr + offset;
    console.log(
      `[dos.library] PathPart returned offset ${offset}, addr=${resultAddr.toString(
        16
      )}`
    );
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

    console.log(
      `[dos.library] Fault(code=${code}, header="${header}") -> "${message}"`
    );

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

    console.log(
      `[dos.library] PrintFault(code=${code}, header="${header}") -> "${message}"`
    );

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
      233: "Seek error beyond end of file",
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
      console.log(
        "[dos.library] ReadArgs() - Invalid template or array pointer"
      );
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
      console.log(
        "[dos.library] ReadArgs() - No template entries, returning existing RDArgs"
      );
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

      if (namedValue === "NEED_VALUE") {
        fail(this.ERROR_KEY_NEEDS_ARG, `${entry.displayName} missing value`);
        return;
      }

      if (namedValue && namedValue !== "NEED_VALUE") {
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
          fail(
            this.ERROR_BAD_NUMBER,
            `Invalid number for ${entry.displayName}`
          );
          return;
        }
        numericValue = parsed;
      }

      if (stringValue !== null) {
        entryState[i].provided = true;
        if (entry.isNumeric && numericValue !== null) {
          const ptr = this.allocateNumberStorage(context, numericValue);
          if (!ptr) {
            fail(
              this.ERROR_LINE_TOO_LONG,
              "Insufficient buffer for numeric value"
            );
            return;
          }
          setArrayValue(i, ptr);
        } else {
          const ptr = this.allocateStringStorage(context, stringValue);
          if (!ptr) {
            fail(
              this.ERROR_LINE_TOO_LONG,
              "Insufficient buffer for string value"
            );
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
          fail(
            this.ERROR_LINE_TOO_LONG,
            "Insufficient buffer for multi arguments"
          );
          return;
        }
        let offset = 0;
        for (const value of multiStrings) {
          const ptr = this.allocateStringStorage(context, value);
          if (!ptr) {
            fail(
              this.ERROR_LINE_TOO_LONG,
              "Insufficient buffer for multi value"
            );
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
        `Missing required arguments: ${missing
          .map((m) => m.displayName)
          .join(", ")}`
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
          .join(" ")}`
      );
    }

    // Debug: log parsed arguments for door troubleshooting
    const argAt = (idx: number): number =>
      this.emulator.readMemory32(arrayAddr + idx * 4);
    const readPtr = (ptr: number): string =>
      ptr ? this.readString(ptr, 512) : "<null>";
    const minLevel = this.emulator.readMemory32(arrayAddr + 10 * 4);
    const parsedLine = `[dos.library] ReadArgs parsed -> template=${readPtr(
      argAt(0)
    )} outfile=${readPtr(argAt(1))} sort=${readPtr(argAt(2))} userdata=${readPtr(
      argAt(3)
    )} userkeys=${readPtr(argAt(4))} usermisc=${readPtr(
      argAt(5)
    )} confdb=${readPtr(argAt(6))} reg=${readPtr(
      argAt(7)
    )} showInactive=${argAt(8) ? "TRUE" : "FALSE"} ignoreSysop=${
      argAt(9) ? "TRUE" : "FALSE"
    } minUserLevel=${minLevel} noSep=${argAt(11) ? "TRUE" : "FALSE"} dotSep=${
      argAt(12) ? "TRUE" : "FALSE"
    }`;
    console.log(parsedLine);
    this.logDoorFile(parsedLine);

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
        `[dos.library] FreeArgs() - no tracked context for 0x${rdargsAddr.toString(
          16
        )}`
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

    console.log(
      `[dos.library] DateToStr(days=${ds_Days}, minute=${ds_Minute}, tick=${ds_Tick}, format=${dat_Format})`
    );

    // Convert Amiga days (since 1978-01-01) to JavaScript Date
    const epoch = new Date("1978-01-01T00:00:00Z");
    const dateMs = epoch.getTime() + ds_Days * 24 * 60 * 60 * 1000;
    const date = new Date(dateMs);

    const year = date.getFullYear() % 100; // 2-digit year
    const month = date.getMonth() + 1; // 1-12
    const day = date.getDate(); // 1-31

    const hours = Math.floor(ds_Minute / 60);
    const minutes = ds_Minute % 60;
    const seconds = Math.floor(ds_Tick / 50);

    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    let dateStr: string;

    // Format date based on dat_Format
    switch (dat_Format) {
      case 0: // FORMAT_DOS (dd-mmm-yy)
        dateStr = `${day.toString().padStart(2, "0")}-${
          monthNames[month - 1]
        }-${year.toString().padStart(2, "0")}`;
        break;
      case 1: // FORMAT_INT (yy-mm-dd)
        dateStr = `${year.toString().padStart(2, "0")}-${month
          .toString()
          .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
        break;
      case 2: // FORMAT_USA (mm-dd-yy)
        dateStr = `${month.toString().padStart(2, "0")}-${day
          .toString()
          .padStart(2, "0")}-${year.toString().padStart(2, "0")}`;
        break;
      case 3: // FORMAT_CDN (dd-mm-yy)
        dateStr = `${day.toString().padStart(2, "0")}-${month
          .toString()
          .padStart(2, "0")}-${year.toString().padStart(2, "0")}`;
        break;
      default:
        dateStr = `${day.toString().padStart(2, "0")}-${
          monthNames[month - 1]
        }-${year.toString().padStart(2, "0")}`;
    }

    // Format time (HH:MM:SS)
    const timeStr = `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;

    // Day of week names
    const dayNames = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    const dayStr = dayNames[date.getDay()];

    console.log(
      `[dos.library] DateToStr() -> date="${dateStr}", time="${timeStr}", day="${dayStr}"`
    );

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
   * StrToDate - Convert string to DateStamp (V36+)
   * Used by: AquaScan for parsing file dates
   *
   * Signature: BOOL StrToDate(struct DateTime *datetime)
   * D1 = DateTime pointer
   * Returns: BOOL success in D0
   *
   * DateTime structure (input):
   * - struct DateStamp dat_Stamp (12 bytes) - OUTPUT
   * - UBYTE dat_Format (1 byte) - INPUT (date format expected)
   * - UBYTE dat_Flags (1 byte) - INPUT
   * - STRPTR dat_StrDate (4 bytes) - INPUT (date string to parse)
   * - STRPTR dat_StrTime (4 bytes) - INPUT (time string to parse)
   * - STRPTR dat_StrDay (4 bytes) - ignored
   *
   * This function parses date/time strings and fills in the DateStamp structure.
   */
  StrToDate(): void {
    const datetimeAddr = this.emulator.getRegister(CPURegister.D1);

    // Read DateTime structure
    const dat_Format = this.emulator.readMemory(datetimeAddr + 12);
    const dat_Flags = this.emulator.readMemory(datetimeAddr + 13);
    const dat_StrDate = this.emulator.readMemory32(datetimeAddr + 14);
    const dat_StrTime = this.emulator.readMemory32(datetimeAddr + 18);

    console.log(
      `[dos.library] StrToDate(format=${dat_Format}, datePtr=0x${dat_StrDate.toString(
        16
      )}, timePtr=0x${dat_StrTime.toString(16)})`
    );

    // Read date string if provided
    let dateStr = "";
    if (dat_StrDate !== 0) {
      let addr = dat_StrDate;
      while (true) {
        const ch = this.emulator.readMemory(addr++);
        if (ch === 0) break;
        dateStr += String.fromCharCode(ch);
      }
    }

    // Read time string if provided
    let timeStr = "";
    if (dat_StrTime !== 0) {
      let addr = dat_StrTime;
      while (true) {
        const ch = this.emulator.readMemory(addr++);
        if (ch === 0) break;
        timeStr += String.fromCharCode(ch);
      }
    }

    console.log(
      `[dos.library] StrToDate parsing: date="${dateStr}" time="${timeStr}"`
    );

    // Default to current date/time if parsing fails
    const now = new Date();
    let year = now.getFullYear();
    let month = now.getMonth() + 1;
    let day = now.getDate();
    let hours = 0;
    let minutes = 0;
    let seconds = 0;

    // Parse date string based on format
    // Format 0 = dd-mmm-yy (DOS), 1 = yy-mm-dd (INT), 2 = mm-dd-yy (USA), 3 = dd-mm-yy (CDN)
    if (dateStr) {
      const parts = dateStr.split(/[-\/]/);
      if (parts.length >= 3) {
        switch (dat_Format) {
          case 0: // dd-mmm-yy
            day = parseInt(parts[0]);
            // Parse month name
            const monthNames = [
              "jan",
              "feb",
              "mar",
              "apr",
              "may",
              "jun",
              "jul",
              "aug",
              "sep",
              "oct",
              "nov",
              "dec",
            ];
            const monthIdx = monthNames.indexOf(parts[1].toLowerCase());
            month = monthIdx >= 0 ? monthIdx + 1 : parseInt(parts[1]);
            year = parseInt(parts[2]);
            break;
          case 1: // yy-mm-dd
            year = parseInt(parts[0]);
            month = parseInt(parts[1]);
            day = parseInt(parts[2]);
            break;
          case 2: // mm-dd-yy
            month = parseInt(parts[0]);
            day = parseInt(parts[1]);
            year = parseInt(parts[2]);
            break;
          case 3: // dd-mm-yy
            day = parseInt(parts[0]);
            month = parseInt(parts[1]);
            year = parseInt(parts[2]);
            break;
        }

        // Handle 2-digit year
        if (year < 100) {
          year += year < 78 ? 2000 : 1900;
        }
      }
    }

    // Parse time string (hh:mm:ss or hh:mm)
    if (timeStr) {
      const timeParts = timeStr.split(":");
      if (timeParts.length >= 2) {
        hours = parseInt(timeParts[0]) || 0;
        minutes = parseInt(timeParts[1]) || 0;
        if (timeParts.length >= 3) {
          seconds = parseInt(timeParts[2]) || 0;
        }
      }
    }

    // Convert to Amiga DateStamp format
    const epoch = new Date("1978-01-01T00:00:00Z");
    const targetDate = new Date(year, month - 1, day);
    const daysSinceEpoch = Math.floor(
      (targetDate.getTime() - epoch.getTime()) / (24 * 60 * 60 * 1000)
    );
    const minutesPastMidnight = hours * 60 + minutes;
    const ticksPastMinute = seconds * 50; // 50 ticks per second

    console.log(
      `[dos.library] StrToDate result: ${year}-${month}-${day} ${hours}:${minutes}:${seconds} -> days=${daysSinceEpoch}, minutes=${minutesPastMidnight}, ticks=${ticksPastMinute}`
    );

    // Write DateStamp structure (3 x 32-bit longs, big-endian)
    this.emulator.writeMemory32(datetimeAddr, daysSinceEpoch);
    this.emulator.writeMemory32(datetimeAddr + 4, minutesPastMidnight);
    this.emulator.writeMemory32(datetimeAddr + 8, ticksPastMinute);

    // Return success
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

    console.log(
      `[dos.library] AddPart(dirname="${dirname}", filename="${filename}", size=${size})`
    );

    // If filename contains : it's a fully qualified path - replace dirname entirely
    if (filename.includes(":")) {
      if (filename.length + 1 > size) {
        console.log(
          `[dos.library] AddPart() - buffer overflow (need ${
            filename.length + 1
          }, have ${size})`
        );
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
    if (result.length > 0 && !result.endsWith("/") && !result.endsWith(":")) {
      result += "/";
    }

    // Append filename
    result += filename;

    // Check buffer overflow
    if (result.length + 1 > size) {
      console.log(
        `[dos.library] AddPart() - buffer overflow (need ${
          result.length + 1
        }, have ${size})`
      );
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
   * AllocDosObject - Allocate a DOS object (V36)
   * D1 = type (DOS_FILEHANDLE=0, DOS_FIB=1, DOS_EXALLCONTROL=2, DOS_STDPKT=3, DOS_CLI=4, DOS_RDARGS=5)
   * D2 = tags (pointer to tag list, often NULL)
   * Returns: D0 = pointer to allocated object or 0 on error
   *
   * Structure sizes:
   * - DOS_FILEHANDLE: 48 bytes (FileHandle)
   * - DOS_FIB: 260 bytes (FileInfoBlock)
   * - DOS_EXALLCONTROL: 16 bytes (ExAllControl)
   * - DOS_STDPKT: 68 bytes (DosPacket)
   * - DOS_CLI: 64 bytes (CommandLineInterface)
   * - DOS_RDARGS: 32 bytes (RDArgs)
   */
  public AllocDosObject(): void {
    const type = this.emulator.getRegister(CPURegister.D1);
    const tags = this.emulator.getRegister(CPURegister.D2);

    console.log(`[dos.library] AllocDosObject(type=${type}, tags=0x${tags.toString(16)})`);

    // Determine size based on type
    let size: number;
    let typeName: string;
    switch (type) {
      case DOS_FILEHANDLE:
        size = 48;
        typeName = 'DOS_FILEHANDLE';
        break;
      case DOS_FIB:
        size = 260;
        typeName = 'DOS_FIB';
        break;
      case DOS_EXALLCONTROL:
        size = 16;
        typeName = 'DOS_EXALLCONTROL';
        break;
      case DOS_STDPKT:
        size = 68;
        typeName = 'DOS_STDPKT';
        break;
      case DOS_CLI:
        size = 64;
        typeName = 'DOS_CLI';
        break;
      case DOS_RDARGS:
        size = 32;
        typeName = 'DOS_RDARGS';
        break;
      default:
        console.error(`[dos.library] AllocDosObject: Unknown type ${type}`);
        this.emulator.setRegister(CPURegister.D0, 0);
        this.lastError = 122; // ERROR_BAD_NUMBER
        return;
    }

    // Allocate memory (use high memory area for DOS objects)
    // We'll use a simple bump allocator starting at 0x200000
    if (!this.dosObjectAllocBase) {
      this.dosObjectAllocBase = 0x200000;
    }

    const addr = this.dosObjectAllocBase;
    this.dosObjectAllocBase += size + 4; // Add 4 bytes padding for alignment

    // Zero the memory
    for (let i = 0; i < size; i++) {
      this.emulator.writeMemory(addr + i, 0);
    }

    // Track the allocation for FreeDosObject
    if (!this.allocatedDosObjects) {
      this.allocatedDosObjects = new Map();
    }
    this.allocatedDosObjects.set(addr, { type, size });

    console.log(`[dos.library] AllocDosObject(${typeName}) -> 0x${addr.toString(16)} (${size} bytes)`);
    this.emulator.setRegister(CPURegister.D0, addr);
  }

  /**
   * FreeDosObject - Free a DOS object allocated by AllocDosObject (V36)
   * D1 = type (must match type used in AllocDosObject)
   * D2 = pointer to object
   * Returns: nothing (void)
   */
  public FreeDosObject(): void {
    const type = this.emulator.getRegister(CPURegister.D1);
    const ptr = this.emulator.getRegister(CPURegister.D2);

    console.log(`[dos.library] FreeDosObject(type=${type}, ptr=0x${ptr.toString(16)})`);

    if (ptr === 0) {
      console.log(`[dos.library] FreeDosObject: NULL pointer, ignoring`);
      return;
    }

    // Check if this was allocated by us
    if (this.allocatedDosObjects && this.allocatedDosObjects.has(ptr)) {
      const info = this.allocatedDosObjects.get(ptr)!;
      if (info.type !== type) {
        console.warn(`[dos.library] FreeDosObject: Type mismatch (allocated=${info.type}, freeing=${type})`);
      }
      this.allocatedDosObjects.delete(ptr);
      console.log(`[dos.library] FreeDosObject: Freed ${info.size} bytes at 0x${ptr.toString(16)}`);
    } else {
      // Not tracked - just ignore (door may have allocated it differently)
      console.log(`[dos.library] FreeDosObject: Unknown allocation at 0x${ptr.toString(16)}, ignoring`);
    }
  }

  // Track DOS object allocations
  private dosObjectAllocBase?: number;
  private allocatedDosObjects?: Map<number, { type: number; size: number }>;

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
      console.log(
        `[dos.library] WARNING: Offset -28 is NOT a standard dos.library function!`
      );
      console.log(
        `[dos.library] This may indicate an offset calculation error.`
      );
      console.log(
        `[dos.library] Returning success anyway to let door proceed.`
      );
      this.emulator.setRegister(CPURegister.D0, -1); // Return success
      return true;
    }

    // Some doors call deeper LVOs we do not implement; stub benignly
    if (offset === -298) {
      console.log(
        `[dos.library] WARNING: Offset -298 not implemented; returning 0`
      );
      this.emulator.setRegister(CPURegister.D0, 0);
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
      case -348: // SetIoErr - P2
        this.emulator.setRegister(CPURegister.D0, this.SetIoErr());
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

      // Buffered I/O (V36+) - Phase B P1/P2 functions
      case -588: // FOpen - P2
        this.emulator.setRegister(CPURegister.D0, this.FOpen());
        return true;
      case -594: // FClose - P2
        this.emulator.setRegister(CPURegister.D0, this.FClose());
        return true;
      case -600: // FRead - P2
        this.emulator.setRegister(CPURegister.D0, this.FRead());
        return true;
      case -606: // FWrite - P2
        this.emulator.setRegister(CPURegister.D0, this.FWrite());
        return true;
      case -612: // FGets - P1
        this.emulator.setRegister(CPURegister.D0, this.FGets());
        return true;
      case -618: // FPuts - P1
        this.emulator.setRegister(CPURegister.D0, this.FPuts());
        return true;
      case -636: // Flush - P2
        this.emulator.setRegister(CPURegister.D0, this.Flush());
        return true;
      case -642: // FGetC - P2
        this.emulator.setRegister(CPURegister.D0, this.FGetC());
        return true;
      case -648: // FPutC - P2
        this.emulator.setRegister(CPURegister.D0, this.FPutC());
        return true;
      case -678: // FSeek - P2
        this.emulator.setRegister(CPURegister.D0, this.FSeek());
        return true;
      case -684: // FTell - P2
        this.emulator.setRegister(CPURegister.D0, this.FTell());
        return true;

      // CLI functions (V36+) - Phase B P1 functions
      case -462: // GetCurrentDirName - P1
        this.GetCurrentDirName();
        return true;
      case -474: // GetProgramName - P1
        this.GetProgramName();
        return true;
      case -492: // SetProgramDir - P1
        this.SetProgramDir();
        return true;
      case -498: // GetProgramDir - P1
        this.GetProgramDir();
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
      case -378:
        this.OpenFromLock();
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
      case -750:
        this.StrToDate();
        return true;
      case -804:
        this.ReadArgs();
        return true;
      case -810:
        this.FreeArgs();
        return true;
      case -126:
        this.CurrentDir();
        return true;

      // Signals - P0 CRITICAL
      case -210: // SetSignal
        this.SetSignal();
        return true;

      // Console I/O - P0 CRITICAL
      case -216: // PutStr
        this.PutStr();
        return true;
      case -222: // VPrintf
        this.VPrintf();
        return true;

      // V36+ DOS object allocation
      case -228:
        this.AllocDosObject();
        return true;
      case -234:
        this.FreeDosObject();
        return true;

      // Signal checking - P0 CRITICAL
      case -834: // CheckSignal
        this.CheckSignal();
        return true;

      // V36+ Environment variables
      case -900:
        this.SetVar();
        return true;
      case -906:
        this.GetVar();
        return true;
      case -912:
        this.DeleteVar();
        return true;
      case -924: // FindVar - P0 CRITICAL (Enhanced)
        this.FindVarEnhanced();
        return true;

      default:
        // COMPREHENSIVE STUB IMPLEMENTATION FOR ALL UNIMPLEMENTED FUNCTIONS
        // This ensures doors never crash on unimplemented functions
        console.warn(`[dos.library] STUB: Unimplemented function at LVO ${offset}`);

        // Provide sensible defaults based on function type
        // Most DOS functions return 0 for failure, -1 (TRUE) for success
        // File operations return file handles (non-zero) or 0 for failure
        // Memory operations return pointers or 0 for failure

        // Default: Return 0 (failure) in D0
        // Doors will typically check for 0 and handle the failure gracefully
        this.emulator.setRegister(CPURegister.D0, 0);

        // Log the function call for debugging
        const d0 = this.emulator.getRegister(CPURegister.D0);
        const d1 = this.emulator.getRegister(CPURegister.D1);
        const a0 = this.emulator.getRegister(CPURegister.A0);
        const a1 = this.emulator.getRegister(CPURegister.A1);
        console.warn(`[dos.library]   Context: D0=0x${d0.toString(16)} D1=0x${d1.toString(16)} A0=0x${a0.toString(16)} A1=0x${a1.toString(16)}`);
        console.warn(`[dos.library]   Returning D0=0 (failure) - door should handle gracefully`);

        return true; // Return true to indicate we handled it (with a stub)
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
    const nameAddr = this.emulator.getRegister(8); // A0
    const type = this.emulator.getRegister(1); // D1
    const name = this.emulator.readString(nameAddr);

    console.log(`[dos.library] FindVar("${name}", type=${type})`);

    let localSearchAttempted = false;
    if ((type & 0xff) === 0) {
      localSearchAttempted = true;
      // Get current CLI structure from pr_CLI
      const taskAddr = 0x090000; // Current task (must match ExecLibrary)
      const prCliOffset = 0xac;
      const cliBPTR = this.emulator.readMemory32(taskAddr + prCliOffset);

      if (cliBPTR === 0) {
        console.log(`[dos.library]   No CLI structure found`);
      } else {
        const cliAddr = cliBPTR << 2;
        const localVarsBPTR = this.emulator.readMemory32(cliAddr + 0x5c); // cli_LocalVars

        if (localVarsBPTR === 0) {
          console.log(`[dos.library]   No local variables list`);
        } else {
          const localVarsListAddr = localVarsBPTR << 2;
          // Walk the list to find the variable
          let nodeAddr = this.emulator.readMemory32(localVarsListAddr + 0); // lh_Head

          while (nodeAddr !== 0 && nodeAddr !== localVarsListAddr + 4) {
            // Not NULL and not Tail
            const nodeNameAddr = this.emulator.readMemory32(nodeAddr + 10); // ln_Name

            if (nodeNameAddr !== 0) {
              const nodeName = this.emulator.readString(nodeNameAddr);

              if (nodeName === name) {
                console.log(
                  `[dos.library]   Found local variable "${name}" at 0x${nodeAddr.toString(
                    16
                  )}`
                );
                this.emulator.setRegister(0, nodeAddr);
                return;
              }
            }

            // Move to next node
            nodeAddr = this.emulator.readMemory32(nodeAddr + 0); // ln_Succ
          }
        }
      }
    }

    const envValue = this.getEnvVarValue(name);
    if (envValue !== undefined) {
      const envNode = this.ensureEnvVarNode(name, envValue);
      this.emulator.setRegister(0, envNode);
      return;
    }

    if (localSearchAttempted) {
      console.log(`[dos.library]   Variable "${name}" not found`);
      this.emulator.setRegister(0, 0);
      return;
    }

    // Global variables not supported yet
    console.log(`[dos.library]   Global variables not supported`);
    this.emulator.setRegister(0, 0);
  }

  /**
   * SetVar() - LVO -900 (V36+)
   *
   * Set a local or global shell variable.
   *
   * Parameters:
   *   A0 = name (C-string pointer)
   *   A1 = buffer (value string pointer)
   *   D0 = size (length of value, -1 for null-terminated)
   *   D1 = flags (GVF_LOCAL_VAR=0, GVF_GLOBAL_VAR=256, GVF_BINARY_VAR=512)
   *
   * Returns:
   *   D0 = BOOL (-1 for success, 0 for failure)
   */
  public SetVar(): void {
    const nameAddr = this.emulator.getRegister(CPURegister.A0);
    const bufferAddr = this.emulator.getRegister(CPURegister.A1);
    const size = this.emulator.getRegister(CPURegister.D0);
    const flags = this.emulator.getRegister(CPURegister.D1);

    const name = this.emulator.readString(nameAddr, 256);
    let value: string;

    if (size === -1) {
      // Null-terminated string
      value = this.emulator.readString(bufferAddr, 4096);
    } else {
      // Fixed size buffer
      value = this.emulator.readString(bufferAddr, size);
    }

    console.log(`[dos.library] SetVar("${name}", "${value}", size=${size}, flags=${flags})`);

    if (!this.envManager) {
      console.error(`[dos.library] SetVar: EnvironmentManager not initialized`);
      this.emulator.setRegister(CPURegister.D0, 0); // Failure
      return;
    }

    const success = this.envManager.setVar(name, value, flags);
    this.emulator.setRegister(CPURegister.D0, success ? -1 : 0); // -1 = TRUE, 0 = FALSE
  }

  /**
   * GetVar() - LVO -906 (V36+)
   *
   * Get the value of a local or global shell variable.
   *
   * Parameters:
   *   A0 = name (C-string pointer)
   *   A1 = buffer (destination for value)
   *   D0 = size (buffer size)
   *   D1 = flags (GVF_LOCAL_VAR=0, GVF_GLOBAL_VAR=256)
   *
   * Returns:
   *   D0 = Number of characters copied (-1 if not found or error)
   */
  public GetVar(): void {
    const nameAddr = this.emulator.getRegister(CPURegister.A0);
    const bufferAddr = this.emulator.getRegister(CPURegister.A1);
    const size = this.emulator.getRegister(CPURegister.D0);
    const flags = this.emulator.getRegister(CPURegister.D1);

    const name = this.emulator.readString(nameAddr, 256);

    console.log(`[dos.library] GetVar("${name}", bufferSize=${size}, flags=${flags})`);

    if (!this.envManager) {
      console.error(`[dos.library] GetVar: EnvironmentManager not initialized`);
      this.emulator.setRegister(CPURegister.D0, -1); // Not found
      return;
    }

    const value = this.envManager.getVar(name);
    if (value === undefined) {
      console.log(`[dos.library]   Variable "${name}" not found`);
      this.emulator.setRegister(CPURegister.D0, -1); // Not found
      return;
    }

    // Copy value to buffer (truncate if necessary)
    const copyLen = Math.min(value.length, size - 1); // Leave room for null terminator
    this.emulator.writeString(bufferAddr, value.substring(0, copyLen));

    console.log(`[dos.library]   Copied ${copyLen} characters: "${value.substring(0, copyLen)}"`);
    this.emulator.setRegister(CPURegister.D0, copyLen);
  }

  /**
   * DeleteVar() - LVO -912 (V36+)
   *
   * Delete a local or global shell variable.
   *
   * Parameters:
   *   A0 = name (C-string pointer)
   *   D1 = flags (GVF_LOCAL_VAR=0, GVF_GLOBAL_VAR=256)
   *
   * Returns:
   *   D0 = BOOL (-1 for success, 0 for failure/not found)
   */
  public DeleteVar(): void {
    const nameAddr = this.emulator.getRegister(CPURegister.A0);
    const flags = this.emulator.getRegister(CPURegister.D1);

    const name = this.emulator.readString(nameAddr, 256);

    console.log(`[dos.library] DeleteVar("${name}", flags=${flags})`);

    if (!this.envManager) {
      console.error(`[dos.library] DeleteVar: EnvironmentManager not initialized`);
      this.emulator.setRegister(CPURegister.D0, 0); // Failure
      return;
    }

    const success = this.envManager.deleteVar(name);
    this.emulator.setRegister(CPURegister.D0, success ? -1 : 0); // -1 = TRUE, 0 = FALSE
  }

  /**
   * GetCurrentDirName (-462) - Get current directory name string
   * Input: D1 = APTR to buffer
   *        D2 = buffer size
   * Output: D0 = success (BOOL), buffer filled with directory name
   *
   * P1 function - Returns the current directory as a path string
   */
  public GetCurrentDirName(): void {
    const bufferAddr = this.emulator.getRegister(CPURegister.D1);
    const bufferSize = this.emulator.getRegister(CPURegister.D2);

    console.log(`[dos.library] GetCurrentDirName(buf=0x${bufferAddr.toString(16)}, size=${bufferSize})`);

    // Get current directory
    // Return the current Amiga-style directory path
    const currentDir = this.currentDirectoryAmiga || 'BBS:';

    if (bufferSize < currentDir.length + 1) {
      console.error(`[dos.library] GetCurrentDirName: Buffer too small`);
      this.emulator.setRegister(CPURegister.D0, 0); // FALSE
      return;
    }

    // Write directory name to buffer
    this.emulator.writeString(bufferAddr, currentDir);

    console.log(`[dos.library] GetCurrentDirName → "${currentDir}"`);
    this.emulator.setRegister(CPURegister.D0, -1); // TRUE
  }

  /**
   * GetProgramName (-474) - Get program name string
   * Input: D1 = APTR to buffer
   *        D2 = buffer size
   * Output: D0 = success (BOOL), buffer filled with program name
   *
   * P1 function - Returns the name of the current program
   */
  public GetProgramName(): void {
    const bufferAddr = this.emulator.getRegister(CPURegister.D1);
    const bufferSize = this.emulator.getRegister(CPURegister.D2);

    console.log(`[dos.library] GetProgramName(buf=0x${bufferAddr.toString(16)}, size=${bufferSize})`);

    // Return a generic program name (could be enhanced to track actual program)
    const programName = `DoorProgram`;

    if (bufferSize < programName.length + 1) {
      console.error(`[dos.library] GetProgramName: Buffer too small`);
      this.emulator.setRegister(CPURegister.D0, 0); // FALSE
      return;
    }

    // Write program name to buffer
    this.emulator.writeString(bufferAddr, programName);

    console.log(`[dos.library] GetProgramName → "${programName}"`);
    this.emulator.setRegister(CPURegister.D0, -1); // TRUE
  }

  /**
   * SetProgramDir (-492) - Set program directory lock
   * Input: D1 = BPTR to lock
   * Output: D0 = previous program directory lock
   *
   * P1 function - Sets the directory where the program was loaded from
   */
  public SetProgramDir(): void {
    const newLock = this.emulator.getRegister(CPURegister.D1);

    console.log(`[dos.library] SetProgramDir(lock=0x${newLock.toString(16)})`);

    // Return the old lock (0 for now - could be enhanced to track)
    const oldLock = 0;

    // In a full implementation, we would store this in the Process structure
    // pr_HomeDir field (offset 0x98)

    this.emulator.setRegister(CPURegister.D0, oldLock);
    console.log(`[dos.library] SetProgramDir → oldLock=0x${oldLock.toString(16)}`);
  }

  /**
   * GetProgramDir (-498) - Get program directory lock
   * Input: None
   * Output: D0 = BPTR to program directory lock
   *
   * P1 function - Returns the directory where the program was loaded from
   */
  public GetProgramDir(): void {
    console.log(`[dos.library] GetProgramDir()`);

    // Return 0 for now (could be enhanced to track actual program directory)
    // In a full implementation, we would read this from the Process structure
    // pr_HomeDir field (offset 0x98)
    const programDirLock = 0;

    this.emulator.setRegister(CPURegister.D0, programDirLock);
    console.log(`[dos.library] GetProgramDir → 0x${programDirLock.toString(16)}`);
  }

  // ============================================================================
  // P0 CRITICAL FUNCTIONS
  // ============================================================================

  /**
   * SetSignal() - LVO -210 (V36+)
   *
   * Set and/or examine process signal flags
   *
   * Parameters:
   *   D0 = newSignals (signal mask to set)
   *   D1 = signalSet (mask of signals to change, -1 for all)
   *
   * Returns:
   *   D0 = Old signal state
   *
   * P0 function - Critical for signal-based synchronization
   */
  public SetSignal(): void {
    const newSignals = this.emulator.getRegister(CPURegister.D0);
    const signalSet = this.emulator.getRegister(CPURegister.D1);

    console.log(`[dos.library] SetSignal(newSignals=0x${newSignals.toString(16)}, signalSet=0x${signalSet.toString(16)})`);

    // Get current process signal state (stubbed for BBS emulator)
    const oldSignals = 0; // No signals pending

    // In a full implementation, we would:
    // 1. Get current process from FindTask(0)
    // 2. Read tc_SigRecvd from Task structure (offset 0x12)
    // 3. Modify signals according to newSignals & signalSet
    // 4. Write back to tc_SigRecvd

    this.emulator.setRegister(CPURegister.D0, oldSignals);
    console.log(`[dos.library] SetSignal → oldSignals=0x${oldSignals.toString(16)}`);
  }

  /**
   * PutStr() - LVO -216 (V36+)
   *
   * Write a null-terminated string to stdout
   *
   * Parameters:
   *   D1 = string (BPTR to C-string)
   *
   * Returns:
   *   D0 = 0 for success, -1 for failure
   *
   * P0 function - Critical for console output
   */
  public PutStr(): void {
    const stringBPtr = this.emulator.getRegister(CPURegister.D1);
    const stringAddr = stringBPtr << 2;
    const str = this.emulator.readString(stringAddr, 4096);

    console.log(`[dos.library] PutStr("${str.substring(0, 50)}${str.length > 50 ? '...' : ''}")`);

    // Write to stdout using Output() handle
    const outputHandle = this.Output();
    if (outputHandle === 0) {
      this.emulator.setRegister(CPURegister.D0, -1); // Failure
      return;
    }

    // Write string using Write()
    this.emulator.setRegister(CPURegister.D1, outputHandle);
    this.emulator.setRegister(CPURegister.D2, stringBPtr);
    this.emulator.setRegister(CPURegister.D3, str.length);
    const bytesWritten = this.Write();

    this.emulator.setRegister(CPURegister.D0, bytesWritten === str.length ? 0 : -1);
  }

  /**
   * VPrintf() - LVO -222 (V36+)
   *
   * Formatted output to stdout (printf-style)
   *
   * Parameters:
   *   D1 = format (BPTR to format string)
   *   D2 = argarray (APTR to array of arguments)
   *
   * Returns:
   *   D0 = Number of characters written, or -1 for error
   *
   * P0 function - Critical for formatted console output
   */
  public VPrintf(): void {
    const formatBPtr = this.emulator.getRegister(CPURegister.D1);
    const argArrayPtr = this.emulator.getRegister(CPURegister.D2);
    const formatAddr = formatBPtr << 2;
    const format = this.emulator.readString(formatAddr, 4096);

    console.log(`[dos.library] VPrintf("${format.substring(0, 50)}${format.length > 50 ? '...' : ''}")`);

    // Parse format string and extract arguments
    // This is a simplified implementation - full VPrintf would use RawDoFmt
    let output = format;
    let argIndex = 0;

    // Replace %s, %d, %ld, %x format specifiers with arguments
    output = output.replace(/%([ldx])?([sd])/g, (match, modifier, type) => {
      if (argArrayPtr === 0) return match;

      const argAddr = this.emulator.readMemory32(argArrayPtr + (argIndex * 4));
      argIndex++;

      if (type === 's') {
        // String argument
        return this.emulator.readString(argAddr, 256);
      } else if (type === 'd') {
        // Decimal number
        return modifier === 'l' ? argAddr.toString() : (argAddr & 0xFFFF).toString();
      }
      return match;
    });

    // Write output using PutStr()
    // Allocate temp buffer for output string
    const tempAddr = this.allocateTemp(output.length + 1);
    this.emulator.writeString(tempAddr, output);

    this.emulator.setRegister(CPURegister.D1, tempAddr >> 2); // BPTR
    this.PutStr();

    const result = this.emulator.getRegister(CPURegister.D0);
    this.emulator.setRegister(CPURegister.D0, result === 0 ? output.length : -1);
  }

  /**
   * CheckSignal() - LVO -834 (V36+)
   *
   * Check if a specific signal is set
   *
   * Parameters:
   *   D0 = signalNum (signal bit number 0-31)
   *
   * Returns:
   *   D0 = TRUE (-1) if signal is set, FALSE (0) if not
   *
   * P0 function - Critical for signal checking
   */
  public CheckSignal(): void {
    const signalNum = this.emulator.getRegister(CPURegister.D0);

    console.log(`[dos.library] CheckSignal(signalNum=${signalNum})`);

    // Check if signal bit is set (stubbed for BBS emulator)
    // In a full implementation, we would:
    // 1. Get current process from FindTask(0)
    // 2. Read tc_SigRecvd from Task structure (offset 0x12)
    // 3. Check if bit is set: (tc_SigRecvd & (1 << signalNum)) != 0

    const isSet = false; // No signals set in emulator
    this.emulator.setRegister(CPURegister.D0, isSet ? -1 : 0);
    console.log(`[dos.library] CheckSignal → ${isSet ? 'TRUE' : 'FALSE'}`);
  }

  /**
   * FindVar() - LVO -924 (V36+) - ENHANCED VERSION
   *
   * Find environment variable and return LocalVar structure pointer
   * This is the enhanced P0 version with better flag support
   *
   * Parameters:
   *   D1 = name (BPTR to variable name)
   *   D2 = type (GVF_LOCAL_VAR=0, GVF_GLOBAL_VAR=256)
   *
   * Returns:
   *   D0 = LocalVar structure pointer, or 0 if not found
   *
   * P0 function - Critical for environment variable access
   */
  public FindVarEnhanced(): void {
    const nameBPtr = this.emulator.getRegister(CPURegister.D1);
    const type = this.emulator.getRegister(CPURegister.D2);
    const nameAddr = nameBPtr << 2;
    const name = this.emulator.readString(nameAddr, 256);

    console.log(`[dos.library] FindVar("${name}", type=${type})`);

    if (!this.envManager) {
      console.error(`[dos.library] FindVar: EnvironmentManager not initialized`);
      this.emulator.setRegister(CPURegister.D0, 0);
      return;
    }

    // Use EnvironmentManager's findVarPointer with flag support
    const varAddr = this.envManager.findVarPointer(name, type);
    this.emulator.setRegister(CPURegister.D0, varAddr);

    if (varAddr !== 0) {
      console.log(`[dos.library] FindVar → 0x${varAddr.toString(16)}`);
    } else {
      console.log(`[dos.library] FindVar → not found`);
    }
  }

  /**
   * Helper function to allocate temporary memory
   */
  private allocateTemp(size: number): number {
    // Use a temporary memory region (e.g., 0x140000+)
    if (!this.tempMemoryAddr) {
      this.tempMemoryAddr = 0x140000;
    }
    const addr = this.tempMemoryAddr;
    this.tempMemoryAddr += ((size + 3) & ~3); // Align to 4 bytes
    return addr;
  }

  private tempMemoryAddr: number = 0x140000;
}
