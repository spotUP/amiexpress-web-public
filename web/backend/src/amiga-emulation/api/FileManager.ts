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
import { FileHandle } from './FileHandle';
import { PathManager } from './PathManager';
import { AmigaFileCache } from './AmigaFileCache';
import * as path from 'path';

/** Callback type for sysop debug messages */
export type DoorDebugCallback = (message: string, level: 'info' | 'warn' | 'error') => void;

export class FileManager {
  /** Registry of all open file handles: BPTR → FileHandle */
  private handles: Map<number, FileHandle> = new Map();

  /** Next available BPTR for allocation */
  private nextBptr: number = 3; // 1=stdin, 2=stdout already allocated

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
        fs.appendFileSync(logPath, `[FileManager] ${new Date().toISOString()} ${msg}\n`, { encoding: 'utf8' });
      } catch {
        /* ignore */
      }
    };
    logToFile(`Open "${amiPath}" mode=${mode} currentDir="${this.currentDirAmi}"`);

    // Check for special devices first
    const specialDevice = this.pathManager.isSpecialDevice(amiPath);
    if (specialDevice.isSpecial) {
      if (specialDevice.type === 'console') {
        // Return stdout BPTR for console output
        console.log(`[FileManager] Console device, returning stdout BPTR=2`);
        return 2;
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
      return 0; // Failed
    }

    // Check if file exists and log it
    const fileExists = fs.existsSync(sysPath);
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
      return 0; // Failed
    }

    let memoryBuffer: Buffer | undefined;
    if (fileMode === 'r' && this.fileCache) {
      const cached = this.fileCache.load(amiPath, this.currentDirSysPath);
      if (cached && cached.isDirectory) {
        console.error(`[FileManager] "${amiPath}" points to directory, cannot open as file`);
        return 0;
      }
      if (cached && cached.data) {
        sysPath = cached.sysPath; // Preserve resolved case
        memoryBuffer = cached.data;
      }
    }

    // Create file handle
    const fh = new FileHandle(amiPath, sysPath, {
      needClose: true,
      autoFlush: false,
      isNil: false,
      isConsole: false,
      memoryBuffer
    });

    // Try to open the file
    if (!fh.open(fileMode)) {
      console.error(`[FileManager] Failed to open file: ${sysPath}`);
      logToFile(`Failed to open "${sysPath}"`);
      return 0; // Failed
    }

    // Allocate BPTR and register
    const bptr = this.allocateBptr();
    fh.bAddr = bptr;
    this.handles.set(bptr, fh);

    console.log(`[FileManager] Opened file: ${fh.toString()}`);
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
   * Get stdin BPTR (always 1)
   */
  getStdinBptr(): number {
    return 1;
  }

  /**
   * Get stdout BPTR (always 2)
   */
  getStdoutBptr(): number {
    return this.stdoutBptr;
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
