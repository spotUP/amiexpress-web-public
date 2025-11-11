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

import { FileHandle } from './FileHandle';
import { PathManager } from './PathManager';

export class FileManager {
  /** Registry of all open file handles: BPTR → FileHandle */
  private handles: Map<number, FileHandle> = new Map();

  /** Next available BPTR for allocation */
  private nextBptr: number = 3; // 1=stdin, 2=stdout already allocated

  /** Path manager for AmigaDOS path resolution */
  private pathManager: PathManager;

  /** Base directory for file operations */
  private baseDir: string;

  /** Current working directory (AmigaDOS path) */
  private currentDir: string = 'doors:';

  constructor(baseDir: string, pathManager: PathManager) {
    this.baseDir = baseDir;
    this.pathManager = pathManager;
    this.initializeStandardHandles();
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
    const sysPath = this.pathManager.amiToSysPath(amiPath, this.currentDir);
    if (!sysPath) {
      console.error(`[FileManager] Failed to resolve path: "${amiPath}"`);
      return 0; // Failed
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

    // Create file handle
    const fh = new FileHandle(amiPath, sysPath, {
      needClose: true,
      autoFlush: false,
      isNil: false,
      isConsole: false,
    });

    // Try to open the file
    if (!fh.open(fileMode)) {
      console.error(`[FileManager] Failed to open file: ${sysPath}`);
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

    return fh.read(length);
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

    return fh.write(data);
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
    return 2;
  }

  /**
   * Set current working directory
   */
  setCurrentDir(amiPath: string): void {
    this.currentDir = amiPath;
    console.log(`[FileManager] Changed directory to: ${amiPath}`);
  }

  /**
   * Get current working directory
   */
  getCurrentDir(): string {
    return this.currentDir;
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
