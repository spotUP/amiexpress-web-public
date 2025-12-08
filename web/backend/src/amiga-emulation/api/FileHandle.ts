/**
 * FileHandle - Represents an AmigaDOS file handle
 *
 * Based on amitools/vamos/lib/dos/FileHandle.py
 * See: Documentation/3-Developers/AMIGAOS_DOS_FILE_IO_IMPLEMENTATION_GUIDE.md
 */

import * as fs from 'fs';
import * as path from 'path';

export class FileHandle {
  /** File descriptor or stream object */
  private fd: number | null = null;

  /** File name (basename) */
  public readonly name: string;

  /** AmigaDOS path (e.g., "doors:who/node0.txt") */
  public readonly amiPath: string;

  /** System filesystem path */
  public readonly sysPath: string;

  /** BPTR (Byte Pointer = address / 4) */
  public bAddr: number = 0;

  /** Address of FileHandleStruct in emulator memory */
  public memAddr: number = 0;

  /** Should this file be closed? (false for stdin/stdout) */
  public readonly needClose: boolean;

  /** Auto-flush after writes? (true for stdout) */
  public readonly autoFlush: boolean;

  /** Is this a NULL device (NIL:)? */
  public readonly isNil: boolean;

  /** Is this a console/stdout? */
  public readonly isConsole: boolean;

  /** File position for seek operations */
  private position: number = 0;

  /** Optional in-memory buffer (used for cached read-only files) */
  private readonly memoryBuffer: Buffer | null = null;

  /** True when operating entirely from memory (no filesystem descriptor) */
  private isMemoryHandle: boolean = false;

  /** Track open mode to guard invalid seeks */
  private openMode: 'r' | 'w' | 'rw' | null = null;

  constructor(
    amiPath: string,
    sysPath: string,
    options: {
      needClose?: boolean;
      autoFlush?: boolean;
      isNil?: boolean;
      isConsole?: boolean;
      memoryBuffer?: Buffer;
    } = {}
  ) {
    this.amiPath = amiPath;
    this.sysPath = sysPath;
    this.name = sysPath.split('/').pop() || 'unknown';
    this.needClose = options.needClose !== undefined ? options.needClose : true;
    this.autoFlush = options.autoFlush || false;
    this.isNil = options.isNil || false;
    this.isConsole = options.isConsole || false;
    this.memoryBuffer = options.memoryBuffer || null;
  }

  /**
   * Open the file with specified mode
   */
  open(mode: 'r' | 'w' | 'rw'): boolean {
    try {
      this.openMode = mode;
      if (this.memoryBuffer) {
        if (mode === 'w' || mode === 'rw') {
          console.error(`[FileHandle] Cannot open memory-backed handle "${this.amiPath}" for writing`);
          return false;
        }
        this.isMemoryHandle = true;
        this.fd = -3;
        this.position = 0;
        return true;
      }

      // NIL device - don't actually open
      if (this.isNil) {
        this.fd = -1; // Special marker for NULL device
        return true;
      }

      // Console/stdout - don't actually open
      if (this.isConsole) {
        this.fd = -2; // Special marker for console
        return true;
      }

      // Open real file
      let flags: number;
      if (mode === 'r') {
        flags = fs.constants.O_RDONLY;
      } else if (mode === 'w') {
        flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC;
      } else { // 'rw'
        flags = fs.constants.O_RDWR | fs.constants.O_CREAT;
      }

      this.fd = fs.openSync(this.sysPath, flags, 0o666);
      this.position = 0;
      return true;
    } catch (error) {
      console.error(`[FileHandle] Failed to open ${this.sysPath}:`, error);
      return false;
    }
  }

  /**
   * Read data from file
   */
  read(length: number): Buffer {
    if (this.fd === null) {
      throw new Error('File not open');
    }

    if (this.isMemoryHandle && this.memoryBuffer) {
      const available = this.memoryBuffer.length - this.position;
      const bytesToRead = Math.min(length, available);
      const slice = this.memoryBuffer.subarray(this.position, this.position + bytesToRead);
      this.position += bytesToRead;
      return Buffer.from(slice);
    }

    // NIL device always returns empty
    if (this.isNil) {
      return Buffer.alloc(0);
    }

    // Console input - return empty for now (stdin not implemented yet)
    if (this.isConsole && this.fd === -2) {
      return Buffer.alloc(0);
    }

    try {
      console.log(`[FileHandle] read ${length} bytes from ${this.sysPath}`);
      const buffer = Buffer.alloc(length);
      const bytesRead = fs.readSync(this.fd, buffer, 0, length, this.position);
      this.position += bytesRead;
      return buffer.slice(0, bytesRead);
    } catch (error) {
      console.error(`[FileHandle] Read error:`, error);
      return Buffer.alloc(0);
    }
  }

  /**
   * Write data to file
   * Returns callback for console output (if console), null otherwise
   */
  write(data: Buffer): { bytesWritten: number; consoleData?: Buffer } {
    if (this.fd === null) {
      throw new Error('File not open');
    }

    if (this.isMemoryHandle) {
      console.error('[FileHandle] Attempted write on memory-backed handle');
      return { bytesWritten: -1 };
    }

    // NIL device - discard data
    if (this.isNil) {
      return { bytesWritten: data.length };
    }

    // Console output - return data for terminal
    if (this.isConsole && this.fd === -2) {
      return { bytesWritten: data.length, consoleData: data };
    }

    try {
      console.log(`[FileHandle] write ${data.length} bytes to ${this.sysPath}`);
      try {
        // Mirror to door log for debugging batch outputs (stable path to repo logs)
        const logPath = path.resolve(__dirname, '../../../../../logs/door-68k.log');
        const line = `[FileWrite] ${new Date().toISOString()} ${this.amiPath} -> ${this.sysPath} bytes=${data.length}\n`;
        require('fs').appendFileSync(logPath, line, { encoding: 'utf8' });
      } catch {
        /* ignore */
      }
      const bytesWritten = fs.writeSync(this.fd, data, 0, data.length, this.position);
      this.position += bytesWritten;

      if (this.autoFlush) {
        fs.fsyncSync(this.fd);
      }

      return { bytesWritten };
    } catch (error) {
      console.error(`[FileHandle] Write error:`, error);
      return { bytesWritten: -1 };
    }
  }

  /**
   * Seek to position in file
   */
  seek(position: number, whence: number): number {
    if (this.isMemoryHandle && this.memoryBuffer) {
      const size = this.memoryBuffer.length;
      let targetPos = this.position;
      if (whence === 0) {
        targetPos = position;
      } else if (whence === 1) {
        targetPos = this.position + position;
      } else if (whence === 2) {
        targetPos = size + position;
      }
      // Guard runaway seeks on read-only memory-backed handles to avoid tight loops
      if (this.openMode === 'r' && targetPos > size) {
        console.warn(
          `[FileHandle] Seek beyond EOF for "${this.amiPath}" (requested=${targetPos}, size=${size})`
        );
        return -1;
      }
      // Allow seeking past EOF for write handles; clamp negatives
      this.position = Math.max(0, targetPos);
      return this.position;
    }

    if (this.fd === null || this.fd < 0) {
      return -1;
    }

    try {
      const stats = fs.fstatSync(this.fd);
      const fileSize = stats.size;
      // Compute target position first
      let targetPos = this.position;
      if (whence === 0) {
        targetPos = position;
      } else if (whence === 1) {
        targetPos = this.position + position;
      } else if (whence === 2 || whence === -1) {
        targetPos = stats.size + position;
      }

      // If opened read-only, prevent runaway seeks far past EOF
      if (this.openMode === 'r' && targetPos > fileSize) {
        console.warn(
          `[FileHandle] Seek beyond EOF for "${this.amiPath}" (requested=${targetPos}, size=${fileSize})`
        );
        return -1;
      }

      this.position = targetPos;
      return this.position;
    } catch (error) {
      console.error(`[FileHandle] Seek error:`, error);
      return -1;
    }
  }

  /**
   * Get current file position
   */
  tell(): number {
    return this.position;
  }

  /**
   * Close the file
   */
  close(): void {
    if (this.needClose && this.fd !== null && this.fd >= 0) {
      try {
        fs.closeSync(this.fd);
      } catch (error) {
        console.error(`[FileHandle] Close error:`, error);
      }
    }
    this.fd = null;
    this.isMemoryHandle = false;
  }

  /**
   * String representation for debugging
   */
  toString(): string {
    return `[FH:'${this.name}'(ami='${this.amiPath}',sys='${this.sysPath}',nc=${this.needClose})@0x${this.memAddr.toString(16)}=B@0x${this.bAddr.toString(16)}]`;
  }
}
