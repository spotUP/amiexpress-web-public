/**
 * FileManager - Manages AmigaDOS file handles and BPTR allocation
 *
 * Based on amitools/vamos/lib/dos/FileManager.py
 * See: Documentation/3-Developers/AMIGAOS_DOS_FILE_IO_IMPLEMENTATION_GUIDE.md
 *
 * BPTR System:
 * - BPTR = Byte Pointer = memory_address / 4
 * - BPTR 1 = stdin (pre-allocated)
 * - BPTR 2 = stdout (pre-allocated)
 * - BPTR 3+ = dynamically allocated file handles
 */

import * as fs from 'fs';
import * as amigafs from '../../utils/amigafs';
import { FileHandle } from './FileHandle';
import { PathManager } from './PathManager';
import { AmigaFileCache } from './AmigaFileCache';
import * as path from 'path';
import { getSystemTime } from '../../utils/date-time.util';

/** Callback type for sysop debug messages */
export type DoorDebugCallback = (message: string, level: 'info' | 'warn' | 'error') => void;

export class FileManager {
  /** Registry of all open file handles: BPTR → FileHandle */
  private handles: Map<number, FileHandle> = new Map();

  /** Next available BPTR for allocation */
  private nextBptr: number = 3; // 1=stdin, 2=stdout already allocated

  /** Current stdin BPTR (allows redirection) */
  private stdinBptr: number = 1;

  /** Current stdout BPTR (allows redirection) */
  private stdoutBptr: number = 2;

  /** Path manager for AmigaDOS path resolution */
  private pathManager: PathManager;

  /** Base directory for file operations */
  private baseDir: string;

  /** Current working directory (AmigaDOS path + resolved system path) */
  private currentDirAmi: string = 'doors:';
  private currentDirSysPath: string;

  /** Shared file cache for read-only Amiga files */
  private fileCache?: AmigaFileCache;

  /** Callback to emit debug messages to sysop terminal */
  private debugCallback?: DoorDebugCallback;

  /** Last error code (AmigaDOS ERROR_* constant) */
  private lastErrorCode: number = 0;

  // AmigaDOS error constants (match DosLibrary.ts)
  private readonly ERROR_NO_ERROR = 0;
  private readonly ERROR_OBJECT_NOT_FOUND = 205;
  private readonly ERROR_OBJECT_WRONG_TYPE = 212;
  private readonly ERROR_WRITE_PROTECTED = 214;
  private readonly ERROR_READ_PROTECTED = 216;
  private readonly ERROR_DISK_FULL = 221;
  private readonly ERROR_NO_FREE_STORE = 103;
  private readonly ERROR_SEEK_ERROR = 219;
  private readonly ERROR_OBJECT_IN_USE = 202;
  private readonly ERROR_INVALID_LOCK = 211;

  constructor(baseDir: string, pathManager: PathManager, fileCache?: AmigaFileCache) {
    this.baseDir = baseDir;
    this.pathManager = pathManager;
    this.fileCache = fileCache;
    this.initializeStandardHandles();
    this.currentDirSysPath = this.pathManager.amiToSysPath(this.currentDirAmi, this.baseDir) || this.baseDir;
  }

  /** Set callback for sysop debug messages */
  setDebugCallback(callback: DoorDebugCallback): void {
    this.debugCallback = callback;
  }

  /** Emit debug message to sysop if callback is set */
  private emitDebug(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    if (this.debugCallback) {
      this.debugCallback(message, level);
    }
  }

  /**
   * Get last error code and optionally clear it
   * @param clear - Whether to clear error after reading
   * @returns AmigaDOS ERROR_* code
   */
  getLastError(clear: boolean = false): number {
    const error = this.lastErrorCode;
    if (clear) {
      this.lastErrorCode = this.ERROR_NO_ERROR;
    }
    return error;
  }

  /**
   * Map Node.js error code to AmigaDOS ERROR_* constant
   * @param err - Node.js error object
   * @returns AmigaDOS error code
   */
  private mapNodeErrorToAmigaDOS(err: any): number {
    if (!err || !err.code) {
      return this.ERROR_NO_ERROR;
    }

    switch (err.code) {
      case 'ENOENT': // File not found
        return this.ERROR_OBJECT_NOT_FOUND;
      case 'EACCES': // Permission denied
        return this.ERROR_WRITE_PROTECTED;
      case 'ENOTDIR': // Not a directory
        return this.ERROR_OBJECT_WRONG_TYPE;
      case 'EISDIR': // Is a directory
        return this.ERROR_OBJECT_WRONG_TYPE;
      case 'ENOSPC': // No space left on device
        return this.ERROR_DISK_FULL;
      case 'ENOMEM': // Out of memory
        return this.ERROR_NO_FREE_STORE;
      case 'EPERM': // Operation not permitted
        return this.ERROR_WRITE_PROTECTED;
      case 'EROFS': // Read-only file system
        return this.ERROR_WRITE_PROTECTED;
      case 'EEXIST': // File exists
        return this.ERROR_OBJECT_IN_USE;
      default:
console.warn(`[FileManager] Unmapped Node.js error: ${err.code}`);
        return this.ERROR_NO_ERROR;
    }
  }

  /**
   * Pre-allocate stdin and stdout handles
   */
  private initializeStandardHandles(): void {
    // BPTR 1 = stdin (console input)
    const stdin = new FileHandle(
      'CONSOLE:',
      '/dev/stdin',
      {
        needClose: false,
        autoFlush: false,
        isConsole: true,
        isNil: false,
      }
    );
    stdin.bAddr = 1;
    stdin.open('r');
    this.handles.set(1, stdin);

    // BPTR 2 = stdout (console output)
    const stdout = new FileHandle(
      '*',
      '/dev/stdout',
      {
        needClose: false,
        autoFlush: true,
        isConsole: true,
        isNil: false,
      }
    );
    stdout.bAddr = 2;
    stdout.open('w');
    this.handles.set(2, stdout);
    this.stdoutBptr = 2;

console.log('[FileManager] Initialized standard handles:');
console.log(`  BPTR 1 (stdin):  ${stdin.toString()}`);
console.log(`  BPTR 2 (stdout): ${stdout.toString()}`);
  }

  /**
   * Allocate next available BPTR
   */
  private allocateBptr(): number {
    const bptr = this.nextBptr;
    this.nextBptr++;
    return bptr;
  }

  /**
   * Open a file and return its BPTR
   *
   * @param amiPath - AmigaDOS path (e.g., "doors:who/node0.txt", "NIL:", "*")
   * @param mode - Access mode constant (1005=read, 1006=write, 1004=read/write)
   * @returns BPTR (Byte Pointer) or 0 on failure
   */
  open(amiPath: string, mode: number): number {
console.log(`[FileManager] Open: "${amiPath}" mode=${mode}`);
    const logPath = path.resolve(__dirname, '../../../../../logs/door-68k.log');
    const logToFile = (msg: string) => {
      try {
        amigafs.appendFileSync(logPath, `[FileManager] ${getSystemTime().toISOString()} ${msg}\n`, { encoding: 'utf8' });
      } catch {
        /* ignore */
      }
    };
    logToFile(`Open "${amiPath}" mode=${mode} currentDir="${this.currentDirAmi}"`);

    // Check for special devices first
    const specialDevice = this.pathManager.isSpecialDevice(amiPath);
    if (specialDevice.isSpecial) {
      if (specialDevice.type === 'console') {
        // Return stdout BPTR for console output (use the actual allocated BPTR)
console.log(`[FileManager] Console device, returning stdout BPTR=0x${this.stdoutBptr.toString(16)}`);
        return this.stdoutBptr;
      } else if (specialDevice.type === 'nil') {
        // Create NIL device handle
        const fh = new FileHandle(amiPath, '/dev/null', {
          needClose: true,
          autoFlush: false,
          isNil: true,
          isConsole: false,
        });
        const bptr = this.allocateBptr();
        fh.bAddr = bptr;
        fh.open('w');
        this.handles.set(bptr, fh);
console.log(`[FileManager] Created NIL device: ${fh.toString()}`);
        return bptr;
      }
    }

    // Map AmigaDOS path to system path
    let sysPath = this.pathManager.amiToSysPath(amiPath, this.currentDirSysPath);
    if (!sysPath) {
console.error(`[FileManager] Failed to resolve path: "${amiPath}"`);
      logToFile(`Resolve failed for "${amiPath}"`);
      this.emitDebug(`[68K] Path resolve failed: "${amiPath}"`, 'error');
      this.lastErrorCode = this.ERROR_OBJECT_NOT_FOUND;
      return 0; // Failed
    }

    // Auto-generate T:SysInfo.TMP with date and version info
    // Format: Three newline-separated lines for FGets to read:
    //   Line 1: Date/time string
    //   Line 2: ACP version string
    //   Line 3: Express version string
    // NOTE: Only generate if file doesn't exist - door may call Execute() to overwrite
    const upperAmiPath = amiPath.toUpperCase();
    if (upperAmiPath === 'T:SYSINFO.TMP' && !amigafs.existsSync(sysPath)) {
      // Generate Amiga-format date string: "Thursday 15-Jan-26 20:20:52"
      const now = new Date();
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const dayName = days[now.getDay()];
      const day = now.getDate().toString().padStart(2, '0');
      const month = months[now.getMonth()];
      const year = (now.getFullYear() % 100).toString().padStart(2, '0');
      const hours = now.getHours().toString().padStart(2, '0');
      const mins = now.getMinutes().toString().padStart(2, '0');
      const secs = now.getSeconds().toString().padStart(2, '0');
      const dateStr = `${dayName} ${day}-${month}-${year} ${hours}:${mins}:${secs}`;

      // Extract version strings from ACP and Express binaries
      let acpVersion = 'ACP 4.10 (AmiExpress-Web)';
      let expressVersion = 'AmiExpress 5.6.1';
      try {
        const fs = require('fs');
        const path = require('path');
        const bbsRoot = process.env.BBS_DATA_DIR || path.resolve(process.cwd(), '../..');

        const acpPath = path.join(bbsRoot, 'ACP');
        if (fs.existsSync(acpPath)) {
          const content = fs.readFileSync(acpPath);
          const match = content.toString('latin1').match(/\$VER:\s*([^\r\n\x00]+)/);
          if (match) acpVersion = match[1].trim();
        }
        const expressPath = path.join(bbsRoot, 'Express');
        if (fs.existsSync(expressPath)) {
          const content = fs.readFileSync(expressPath);
          const match = content.toString('latin1').match(/\$VER:\s*([^\r\n\x00]+)/);
          if (match) expressVersion = match[1].trim();
        }
      } catch (e) {
        // Use defaults
      }

      // Build content with newlines - door uses FGets to read line by line
      const fullContent = `${dateStr}\n${acpVersion}\n${expressVersion}\n`;

      try {
        const fs = require('fs');
        const path = require('path');
        const tmpDir = path.dirname(sysPath);
        if (!fs.existsSync(tmpDir)) {
          fs.mkdirSync(tmpDir, { recursive: true });
        }
        fs.writeFileSync(sysPath, fullContent, { encoding: 'latin1' });
console.log(`[FileManager] Auto-generated ${amiPath}:\n  Date: ${dateStr}\n  ACP: ${acpVersion}\n  Express: ${expressVersion}`);
      } catch (err) {
console.error(`[FileManager] Failed to auto-generate ${amiPath}:`, err);
      }
    }

    // Check if file exists and log it (use amigafs for case-insensitive matching)
    const fileExists = amigafs.existsSync(sysPath);
    if (fileExists) {
console.log(`[FileManager] Open: "${amiPath}" -> "${sysPath}" (EXISTS)`);
      logToFile(`Resolved "${amiPath}" -> "${sysPath}" (exists)`);
    } else {
console.log(`[FileManager] Open: "${amiPath}" -> "${sysPath}" (NOT FOUND - will fail with IoErr=205)`);
      logToFile(`Resolved "${amiPath}" -> "${sysPath}" (not found)`);
      // Emit to sysop terminal for visibility
      this.emitDebug(`[68K] File not found: "${amiPath}"`, 'warn');
    }

    // Determine file open mode
    let fileMode: 'r' | 'w' | 'rw';
    if (mode === 1006) {
      fileMode = 'w'; // MODE_NEWFILE - write, create, truncate
    } else if (mode === 1005) {
      fileMode = 'r'; // MODE_OLDFILE - read existing
    } else if (mode === 1004) {
      fileMode = 'rw'; // MODE_READWRITE - read/write
    } else {
console.error(`[FileManager] Unknown mode: ${mode}`);
      this.lastErrorCode = this.ERROR_OBJECT_WRONG_TYPE;
      return 0; // Failed
    }

    let memoryBuffer: Buffer | undefined;
    // Skip memory caching for T: (temp) files - they may be modified by Execute()
    // and we need to read fresh content from disk each time
    const isTempFile = upperAmiPath.startsWith('T:');
    if (fileMode === 'r' && this.fileCache && !isTempFile) {
      const cached = this.fileCache.load(amiPath, this.currentDirSysPath);
      if (cached && cached.isDirectory) {
console.error(`[FileManager] "${amiPath}" points to directory, cannot open as file`);
        this.lastErrorCode = this.ERROR_OBJECT_WRONG_TYPE;
        return 0;
      }
      if (cached && cached.data) {
        sysPath = cached.sysPath; // Preserve resolved case
        memoryBuffer = cached.data;
      }
    }

    // Create file handle
    // For temp files (T:), skip snapshotSize since Execute() may rewrite them
    const fh = new FileHandle(amiPath, sysPath, {
      needClose: true,
      autoFlush: false,
      isNil: false,
      isConsole: false,
      memoryBuffer,
      skipSnapshot: isTempFile,
    });

    // Try to open the file
    if (!fh.open(fileMode)) {
console.error(`[FileManager] Failed to open file: ${sysPath}`);
      logToFile(`Failed to open "${sysPath}"`);
      // Map file system error if available
      const fsError = (fh as any).lastError; // FileHandle may store error
      if (fsError) {
        this.lastErrorCode = this.mapNodeErrorToAmigaDOS(fsError);
      } else {
        // Default to NOT_FOUND for read, WRITE_PROTECTED for write
        this.lastErrorCode = fileMode === 'r' ? this.ERROR_OBJECT_NOT_FOUND : this.ERROR_WRITE_PROTECTED;
      }
      return 0; // Failed
    }

    // Allocate BPTR and register
    const bptr = this.allocateBptr();
    fh.bAddr = bptr;
    this.handles.set(bptr, fh);

console.log(`[FileManager] Opened file: ${fh.toString()}`);
    this.lastErrorCode = this.ERROR_NO_ERROR; // Success
    return bptr;
  }

  /**
   * Close a file handle
   *
   * @param bptr - BPTR of file to close
   * @returns true on success, false on failure
   */
  close(bptr: number): boolean {
console.log(`[FileManager] Close BPTR=${bptr}`);

    // Don't close stdin/stdout
    if (bptr === 1 || bptr === 2) {
console.log(`[FileManager] Cannot close standard handle BPTR=${bptr}`);
      return true; // Not an error
    }

    const fh = this.handles.get(bptr);
    if (!fh) {
console.error(`[FileManager] Invalid BPTR: ${bptr}`);
      return false;
    }

    fh.close();
    this.handles.delete(bptr);
console.log(`[FileManager] Closed: ${fh.toString()}`);
    return true;
  }

  /**
   * Read from a file handle
   *
   * @param bptr - BPTR of file to read from
   * @param length - Number of bytes to read
   * @returns Buffer with data, or empty Buffer on error
   */
  read(bptr: number, length: number): Buffer {
    const fh = this.handles.get(bptr);
    if (!fh) {
console.error(`[FileManager] Read from invalid BPTR: ${bptr}`);
      return Buffer.alloc(0);
    }

    const data = fh.read(length);

    // DEBUG: Log read operations for dRE!WAll debugging
    if (fh.amiPath.includes('dRE!WAll') && data.length > 0 && data.length <= 200) {
      const preview = data.slice(0, Math.min(data.length, 100));
      const hex = Array.from(preview).map(b => b.toString(16).padStart(2, '0')).join(' ');
      const ascii = Array.from(preview).map(b => (b >= 32 && b < 127) ? String.fromCharCode(b) : '.').join('');
console.log(`[FileManager] Read BPTR=${bptr} file="${fh.amiPath}" len=${data.length}`);
console.log(`[FileManager]   Hex: ${hex}`);
console.log(`[FileManager]   ASCII: ${ascii}`);
    }

    // Targeted debug: inspect Dir1 content for AquaScan FR parsing
    if (/dir1/i.test(fh.name)) {
      const sample = data.subarray(0, Math.min(data.length, 64));
      const hex = Array.from(sample)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join(' ');
      const printable = sample
        .toString('latin1')
        .replace(/\r/g, '<CR>')
        .replace(/\n/g, '<LF>');
      const crCount = data.filter((b) => b === 0x0d).length;
      const lfCount = data.filter((b) => b === 0x0a).length;
      const text = data.toString('latin1');
      const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
      const previewLines = lines.slice(0, 5).map((line) => line.slice(0, 120));
console.log(
        `[FileManager] Dir1 read BPTR=${bptr} bytes=${data.length} CR=${crCount} LF=${lfCount} ` +
          `sample="${printable}" hex=${hex}`
      );
console.log(
        `[FileManager][Dir1] lines=${lines.length} preview=${previewLines.join(' | ')}`
      );

    }

    return data;
  }

  /**
   * Write to a file handle
   *
   * @param bptr - BPTR of file to write to
   * @param data - Data to write
   * @returns Object with bytesWritten and optional consoleData for terminal output
   */
  write(bptr: number, data: Buffer): { bytesWritten: number; consoleData?: Buffer } {
    const fh = this.handles.get(bptr);
    if (!fh) {
console.error(`[FileManager] Write to invalid BPTR: ${bptr}`);
      return { bytesWritten: -1 };
    }

    // DEBUG: Log write operations for debugging dRE!WAll
    if (fh.amiPath.includes('dRE!WAll') && data.length > 0 && data.length <= 200) {
      const preview = data.slice(0, Math.min(data.length, 100));
      const hex = Array.from(preview).map(b => b.toString(16).padStart(2, '0')).join(' ');
      const ascii = Array.from(preview).map(b => (b >= 32 && b < 127) ? String.fromCharCode(b) : '.').join('');
console.log(`[FileManager] Write BPTR=${bptr} file="${fh.amiPath}" len=${data.length}`);
console.log(`[FileManager]   Hex: ${hex}`);
console.log(`[FileManager]   ASCII: ${ascii}`);
    }

    const result = fh.write(data);
    if (result.bytesWritten > 0 && !fh.isConsole && !fh.isNil) {
      this.fileCache?.invalidate(fh.amiPath);
    }
    return result;
  }

  /**
   * Seek to position in file
   *
   * @param bptr - BPTR of file
   * @param position - Position to seek to
   * @param whence - Seek mode (0=SEEK_SET, 1=SEEK_CUR, 2=SEEK_END)
   * @returns New position or -1 on error
   */
  seek(bptr: number, position: number, whence: number): number {
    const fh = this.handles.get(bptr);
    if (!fh) {
console.error(`[FileManager] Seek on invalid BPTR: ${bptr}`);
      return -1;
    }

    return fh.seek(position, whence);
  }

  /**
   * Get current file position
   *
   * @param bptr - BPTR of file
   * @returns Current position or -1 on error
   */
  tell(bptr: number): number {
    const fh = this.handles.get(bptr);
    if (!fh) {
console.error(`[FileManager] Tell on invalid BPTR: ${bptr}`);
      return -1;
    }

    return fh.tell();
  }

  /**
   * Get file handle by BPTR (for debugging/testing)
   */
  getHandle(bptr: number): FileHandle | undefined {
    return this.handles.get(bptr);
  }

  /**
   * Get all open file handles (for debugging)
   */
  getHandles(): Map<number, FileHandle> {
    return new Map(this.handles);
  }

  /**
   * Get stdin BPTR (proper FileHandle structure address / 4)
   */
  getStdinBptr(): number {
    return this.stdinBptr;
  }

  /**
   * Get stdout BPTR (proper FileHandle structure address / 4)
   */
  getStdoutBptr(): number {
    return this.stdoutBptr;
  }

  /**
   * Set stdin BPTR (called by DosLibrary after allocating FileHandle struct)
   * Also re-registers the stdin FileHandle under the new BPTR in the handles map.
   */
  setStdinBptr(bptr: number): void {
    const oldBptr = this.stdinBptr;
    const stdinHandle = this.handles.get(oldBptr);
    if (stdinHandle) {
      // Remove from old BPTR, add to new BPTR
      this.handles.delete(oldBptr);
      stdinHandle.bAddr = bptr;
      this.handles.set(bptr, stdinHandle);
console.log(`[FileManager] stdin re-registered: BPTR 0x${oldBptr.toString(16)} -> 0x${bptr.toString(16)}`);
    }
    this.stdinBptr = bptr;
console.log(`[FileManager] stdin BPTR set to 0x${bptr.toString(16)} (addr 0x${(bptr << 2).toString(16)})`);
  }

  /**
   * Set stdout BPTR (called by DosLibrary after allocating FileHandle struct)
   * Also re-registers the stdout FileHandle under the new BPTR in the handles map.
   */
  setStdoutBptr(bptr: number): void {
    const oldBptr = this.stdoutBptr;
    const stdoutHandle = this.handles.get(oldBptr);
    if (stdoutHandle) {
      // Remove from old BPTR, add to new BPTR
      this.handles.delete(oldBptr);
      stdoutHandle.bAddr = bptr;
      this.handles.set(bptr, stdoutHandle);
console.log(`[FileManager] stdout re-registered: BPTR 0x${oldBptr.toString(16)} -> 0x${bptr.toString(16)}`);
    }
    this.stdoutBptr = bptr;
console.log(`[FileManager] stdout BPTR set to 0x${bptr.toString(16)} (addr 0x${(bptr << 2).toString(16)})`);
  }

  /**
   * Redirect stdout to a different BPTR (e.g., CLI-style "> file")
   */
  setStdoutHandle(bptr: number): void {
    this.stdoutBptr = bptr;
  }

  /**
   * Set current working directory
   */
  setCurrentDir(amiPath: string): void {
    const sysPath = this.pathManager.amiToSysPath(amiPath, this.currentDirSysPath);
    if (sysPath) {
      this.currentDirAmi = amiPath;
      this.currentDirSysPath = sysPath;
console.log(`[FileManager] Changed directory to: ${amiPath} (${sysPath})`);
    } else {
console.error(`[FileManager] Failed to change directory to: ${amiPath}`);
    }
  }

  /**
   * Get current working directory
   */
  getCurrentDir(): string {
    return this.currentDirAmi;
  }

  getCurrentDirSysPath(): string {
    return this.currentDirSysPath;
  }

  /**
   * Close all open file handles (cleanup on session end)
   */
  closeAll(): void {
console.log('[FileManager] Closing all file handles...');
    for (const [bptr, fh] of this.handles) {
      if (bptr !== 1 && bptr !== 2) { // Don't close stdin/stdout
        fh.close();
console.log(`[FileManager] Closed: ${fh.toString()}`);
      }
    }
    this.handles.clear();
    this.initializeStandardHandles(); // Recreate stdin/stdout
    this.nextBptr = 3; // Reset BPTR allocation
  }
}
