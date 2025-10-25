/**
 * LZH/LHA Archive Parser
 * Converted from Kaitai Struct JavaScript to TypeScript
 *
 * LHA (LHarc, LZH) is a file format used by a popular freeware
 * archiver, created in 1988 by Haruyasu Yoshizaki.
 *
 * This parser can read LHA headers and list files, but does NOT
 * decompress the content. For full extraction, use system 'lha' command.
 */

/**
 * Simple DOS datetime parser
 * DOS datetime is stored as 2 words (4 bytes total)
 */
export class DosDatetime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;

  constructor(buffer: Buffer) {
    // DOS time: bits 0-4: seconds/2, 5-10: minutes, 11-15: hours
    const time = buffer.readUInt16LE(0);
    this.second = (time & 0x1F) * 2;
    this.minute = (time >> 5) & 0x3F;
    this.hour = (time >> 11) & 0x1F;

    // DOS date: bits 0-4: day, 5-8: month, 9-15: year (relative to 1980)
    const date = buffer.readUInt16LE(2);
    this.day = date & 0x1F;
    this.month = (date >> 5) & 0x0F;
    this.year = ((date >> 9) & 0x7F) + 1980;
  }

  toString(): string {
    return `${this.year}-${String(this.month).padStart(2, '0')}-${String(this.day).padStart(2, '0')} ${String(this.hour).padStart(2, '0')}:${String(this.minute).padStart(2, '0')}:${String(this.second).padStart(2, '0')}`;
  }
}

/**
 * Level-neutral header (Header1)
 */
export class Header1 {
  headerChecksum: number;
  methodId: string;
  fileSizeCompr: number;
  fileSizeUncompr: number;
  fileTimestamp: DosDatetime;
  attr: number;
  lhaLevel: number;

  constructor(buffer: Buffer, offset: number) {
    let pos = offset;

    this.headerChecksum = buffer.readUInt8(pos++);
    this.methodId = buffer.toString('ascii', pos, pos + 5);
    pos += 5;
    this.fileSizeCompr = buffer.readUInt32LE(pos);
    pos += 4;
    this.fileSizeUncompr = buffer.readUInt32LE(pos);
    pos += 4;
    this.fileTimestamp = new DosDatetime(buffer.subarray(pos, pos + 4));
    pos += 4;
    this.attr = buffer.readUInt8(pos++);
    this.lhaLevel = buffer.readUInt8(pos);
  }

  static SIZE = 1 + 5 + 4 + 4 + 4 + 1 + 1; // 21 bytes
}

/**
 * Full header including filename
 */
export class Header {
  header1: Header1;
  filenameLen?: number;
  filename?: string;
  fileUncomprCrc16?: number;
  os?: number;
  extHeaderSize?: number;

  constructor(buffer: Buffer) {
    this.header1 = new Header1(buffer, 0);
    let pos = Header1.SIZE;

    if (this.header1.lhaLevel === 0) {
      // Level 0: filename length + filename
      this.filenameLen = buffer.readUInt8(pos++);
      this.filename = buffer.toString('ascii', pos, pos + this.filenameLen);
      pos += this.filenameLen;
    } else if (this.header1.lhaLevel === 2) {
      // Level 2: CRC, OS, ext header size
      this.fileUncomprCrc16 = buffer.readUInt16LE(pos);
      pos += 2;
      this.os = buffer.readUInt8(pos++);
      this.extHeaderSize = buffer.readUInt16LE(pos);
    }
  }
}

/**
 * Single file record in archive
 */
export class FileRecord {
  header: Header;
  fileUncomprCrc16?: number;
  bodyOffset: number;
  bodySize: number;

  constructor(buffer: Buffer, offset: number, headerLen: number) {
    const headerBuffer = buffer.subarray(offset, offset + headerLen - 1);
    this.header = new Header(headerBuffer);

    let pos = offset + headerLen - 1;

    if (this.header.header1.lhaLevel === 0) {
      this.fileUncomprCrc16 = buffer.readUInt16LE(pos);
      pos += 2;
    }

    this.bodyOffset = pos;
    this.bodySize = this.header.header1.fileSizeCompr;
  }
}

/**
 * Archive record (header + body)
 */
export class Record {
  headerLen: number;
  fileRecord?: FileRecord;
  totalSize: number;

  constructor(buffer: Buffer, offset: number) {
    this.headerLen = buffer.readUInt8(offset);

    if (this.headerLen > 0) {
      this.fileRecord = new FileRecord(buffer, offset + 1, this.headerLen);
      // Total size = header len byte + header + optional CRC + body
      this.totalSize = 1 + this.headerLen + this.fileRecord.bodySize;
      if (this.fileRecord.header.header1.lhaLevel === 0) {
        this.totalSize += 2; // CRC16
      }
    } else {
      this.totalSize = 1; // Just the zero byte
    }
  }
}

/**
 * Main LZH archive parser
 */
export class LzhArchive {
  entries: FileRecord[] = [];

  constructor(buffer: Buffer) {
    let offset = 0;

    while (offset < buffer.length) {
      const record = new Record(buffer, offset);

      if (record.headerLen === 0) {
        // End of archive marker
        break;
      }

      if (record.fileRecord) {
        this.entries.push(record.fileRecord);
      }

      offset += record.totalSize;
    }
  }

  /**
   * List all files in archive
   */
  listFiles(): string[] {
    return this.entries
      .map(entry => entry.header.filename)
      .filter((name): name is string => name !== undefined);
  }

  /**
   * Find a file by name (case-insensitive)
   */
  findFile(filename: string): FileRecord | undefined {
    const lowerName = filename.toLowerCase();
    return this.entries.find(entry =>
      entry.header.filename?.toLowerCase() === lowerName
    );
  }

  /**
   * Get file info
   */
  getFileInfo(filename: string): { size: number; compressed: number; method: string; date: string } | null {
    const file = this.findFile(filename);
    if (!file) return null;

    return {
      size: file.header.header1.fileSizeUncompr,
      compressed: file.header.header1.fileSizeCompr,
      method: file.header.header1.methodId,
      date: file.header.header1.fileTimestamp.toString()
    };
  }
}

/**
 * Parse LZH archive and list files
 */
export async function listLzhFiles(filepath: string): Promise<string[]> {
  const fs = require('fs').promises;
  const buffer = await fs.readFile(filepath);
  const archive = new LzhArchive(buffer);
  return archive.listFiles();
}

/**
 * Check if FILE_ID.DIZ exists in LZH archive
 */
export async function findFileIdDizInLzh(filepath: string): Promise<string | null> {
  try {
    const fs = require('fs').promises;
    const buffer = await fs.readFile(filepath);
    const archive = new LzhArchive(buffer);

    // Search for FILE_ID.DIZ (case-insensitive)
    const file = archive.findFile('file_id.diz');
    if (file && file.header.filename) {
      return file.header.filename; // Return actual case
    }

    return null;
  } catch (error) {
    console.error('[LZH] Error reading archive:', error);
    return null;
  }
}
