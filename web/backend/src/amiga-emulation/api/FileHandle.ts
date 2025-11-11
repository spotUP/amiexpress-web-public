/**
 * FileHandle - Represents an AmigaDOS file handle
 *
 * Based on amitools/vamos/lib/dos/FileHandle.py
 * See: Documentation/3-Developers/AMIGAOS_DOS_FILE_IO_IMPLEMENTATION_GUIDE.md
 */

import * as fs from 'fs';

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

  constructor(
    amiPath: string,
    sysPath: string,
    options: {
      needClose?: boolean;
      autoFlush?: boolean;
      isNil?: boolean;
      isConsole?: boolean;
    } = {}
  ) {
    this.amiPath = amiPath;
    this.sysPath = sysPath;
    this.name = sysPath.split('/').pop() || 'unknown';
    this.needClose = options.needClose !== undefined ? options.needClose : true;
    this.autoFlush = options.autoFlush || false;
    this.isNil = options.isNil || false;
    this.isConsole = options.isConsole || false;
  }

  /**
   * Open the file with specified mode
   */
  open(mode: 'r' | 'w' | 'rw'): boolean {
    try {
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

    // NIL device always returns empty
    if (this.isNil) {
      return Buffer.alloc(0);
    }

    // Console input - return empty for now (stdin not implemented yet)
    if (this.isConsole && this.fd === -2) {
      return Buffer.alloc(0);
    }

    try {
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

    // NIL device - discard data
    if (this.isNil) {
      return { bytesWritten: data.length };
    }

    // Console output - return data for terminal
    if (this.isConsole && this.fd === -2) {
      return { bytesWritten: data.length, consoleData: data };
    }

    try {
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
    if (this.fd === null || this.fd < 0) {
      return -1;
    }

    try {
      // whence: 0 = SEEK_SET, 1 = SEEK_CUR, 2 = SEEK_END
      if (whence === 0) {
        this.position = position;
      } else if (whence === 1) {
        this.position += position;
      } else if (whence === 2) {
        const stats = fs.fstatSync(this.fd);
        this.position = stats.size + position;
      }

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
  }

  /**
   * String representation for debugging
   */
  toString(): string {
    return `[FH:'${this.name}'(ami='${this.amiPath}',sys='${this.sysPath}',nc=${this.needClose})@0x${this.memAddr.toString(16)}=B@0x${this.bAddr.toString(16)}]`;
  }
}
