/**
 * ConferenceFileManager - Manages AmiExpress Conf.DB binary conference database
 *
 * Creates and maintains the conference database file:
 * - BBS:Conf.DB
 *
 * File format:
 * - Binary array of confBase structs (64 bytes each)
 * - Each conference is a fixed-size record
 *
 * References:
 * - axobjects.e:136-155 - confBase struct definition (64 bytes)
 * - express.e:31931 - StrCopy(confDBName,'Conf.DB')
 * - express.e:2088-2111 - setConfLocation(), loads/saves conf data
 */

import * as fs from 'fs';
import * as path from 'path';

interface Conference {
  id: number;
  name: string;
  description: string;
  created?: Date;
  updated?: Date;
}

interface ConfBaseStruct {
  handle: string;              // CHAR[16] (16 bytes)
  downloadBytesBCD: Buffer;    // CHAR[8] (8 bytes) - BCD encoded
  uploadBytesBCD: Buffer;      // CHAR[8] (8 bytes) - BCD encoded
  newSinceDate: number;        // LONG (4 bytes)
  confRead: number;            // LONG (4 bytes)
  confYM: number;              // LONG (4 bytes)
  bytesDownload: number;       // LONG (4 bytes)
  bytesUpload: number;         // LONG (4 bytes)
  uploadTracking: number;      // INT (2 bytes)
  unused: number;              // INT (2 bytes)
  unused2: number;             // LONG (4 bytes) - dailyBytesDld
  upload: number;              // INT (2 bytes)
  downloads: number;           // INT (2 bytes)
  ratioType: number;           // INT (2 bytes)
  ratio: number;               // INT (2 bytes)
  messagesPosted: number;      // INT (2 bytes)
  access: number;              // INT (2 bytes)
  active: number;              // INT (2 bytes)
}

export class ConferenceFileManager {
  private readonly CONFBASE_SIZE = 64;
  private bbsRoot: string;
  private confDBPath: string;

  constructor() {
    // Path resolution: 4 levels up from src/services/ to project root
    this.bbsRoot = process.env.BBS_ROOT || path.join(__dirname, '../../../..');
    this.confDBPath = path.join(this.bbsRoot, 'Conf.DB');
  }

  /**
   * Write a null-padded string to buffer
   */
  private writeString(buffer: Buffer, offset: number, value: string, maxLength: number): number {
    const str = value.slice(0, maxLength);
    const written = buffer.write(str, offset, maxLength, 'ascii');

    // Pad remaining bytes with nulls
    for (let i = written; i < maxLength; i++) {
      buffer.writeUInt8(0, offset + i);
    }

    return offset + maxLength;
  }

  /**
   * Write INT16 (2 bytes, little-endian)
   */
  private writeInt16(buffer: Buffer, offset: number, value: number): number {
    const clamped = Math.max(-32768, Math.min(32767, value));
    buffer.writeInt16LE(clamped, offset);
    return offset + 2;
  }

  /**
   * Write INT32 (4 bytes, little-endian)
   */
  private writeInt32(buffer: Buffer, offset: number, value: number): number {
    buffer.writeInt32LE(value, offset);
    return offset + 4;
  }

  /**
   * Convert Conference to confBase binary struct
   */
  private conferenceToStruct(conf: Conference, slotNumber: number): ConfBaseStruct {
    return {
      handle: conf.name.slice(0, 16),
      downloadBytesBCD: Buffer.alloc(8),  // BCD bytes - unused for now
      uploadBytesBCD: Buffer.alloc(8),    // BCD bytes - unused for now
      newSinceDate: 0,
      confRead: 0,
      confYM: 0,
      bytesDownload: 0,
      bytesUpload: 0,
      uploadTracking: 0,
      unused: 0,
      unused2: 0,
      upload: 0,
      downloads: 0,
      ratioType: 0,
      ratio: 0,
      messagesPosted: 0,
      access: 255,  // Full access by default
      active: 1     // Active by default
    };
  }

  /**
   * Serialize confBase struct to binary buffer (64 bytes)
   */
  private serializeConfBaseStruct(struct: ConfBaseStruct): Buffer {
    const buffer = Buffer.alloc(this.CONFBASE_SIZE);
    let offset = 0;

    // handle[16]: ARRAY OF CHAR
    offset = this.writeString(buffer, offset, struct.handle, 16);

    // downloadBytesBCD[8]: ARRAY OF CHAR
    struct.downloadBytesBCD.copy(buffer, offset, 0, 8);
    offset += 8;

    // uploadBytesBCD[8]: ARRAY OF CHAR
    struct.uploadBytesBCD.copy(buffer, offset, 0, 8);
    offset += 8;

    // newSinceDate: LONG
    offset = this.writeInt32(buffer, offset, struct.newSinceDate);

    // confRead: LONG
    offset = this.writeInt32(buffer, offset, struct.confRead);

    // confYM: LONG
    offset = this.writeInt32(buffer, offset, struct.confYM);

    // bytesDownload: LONG
    offset = this.writeInt32(buffer, offset, struct.bytesDownload);

    // bytesUpload: LONG
    offset = this.writeInt32(buffer, offset, struct.bytesUpload);

    // uploadTracking: INT
    offset = this.writeInt16(buffer, offset, struct.uploadTracking);

    // unused: INT
    offset = this.writeInt16(buffer, offset, struct.unused);

    // unused2: LONG (dailyBytesDld)
    offset = this.writeInt32(buffer, offset, struct.unused2);

    // upload: INT
    offset = this.writeInt16(buffer, offset, struct.upload);

    // downloads: INT
    offset = this.writeInt16(buffer, offset, struct.downloads);

    // ratioType: INT
    offset = this.writeInt16(buffer, offset, struct.ratioType);

    // ratio: INT
    offset = this.writeInt16(buffer, offset, struct.ratio);

    // messagesPosted: INT
    offset = this.writeInt16(buffer, offset, struct.messagesPosted);

    // access: INT
    offset = this.writeInt16(buffer, offset, struct.access);

    // active: INT
    offset = this.writeInt16(buffer, offset, struct.active);

    // Verify size
    if (offset !== this.CONFBASE_SIZE) {
      throw new Error(`confBase struct size mismatch: expected ${this.CONFBASE_SIZE}, got ${offset}`);
    }

    return buffer;
  }

  /**
   * Initialize Conf.DB with empty file if it doesn't exist
   */
  initializeConfDB(): void {
    if (!fs.existsSync(this.confDBPath)) {
      // Create empty file
      fs.writeFileSync(this.confDBPath, Buffer.alloc(0));
      console.log(`[ConferenceFileManager] Created empty Conf.DB at ${this.confDBPath}`);
    }
  }

  /**
   * Write conference to Conf.DB (append new conference)
   */
  writeConferenceFile(conf: Conference, slotNumber: number): void {
    try {
      this.initializeConfDB();

      const struct = this.conferenceToStruct(conf, slotNumber);
      const buffer = this.serializeConfBaseStruct(struct);

      // Append to file
      fs.appendFileSync(this.confDBPath, buffer);

      console.log(`[ConferenceFileManager] Wrote conference "${conf.name}" (slot ${slotNumber}) to Conf.DB`);
    } catch (error) {
      console.error(`[ConferenceFileManager] Error writing conference "${conf.name}":`, error);
      throw error;
    }
  }

  /**
   * Update conference in Conf.DB (modify existing slot)
   */
  updateConferenceFile(conf: Conference, slotNumber: number): void {
    try {
      if (!fs.existsSync(this.confDBPath)) {
        console.warn(`[ConferenceFileManager] Conf.DB does not exist, creating new`);
        this.initializeConfDB();
      }

      const struct = this.conferenceToStruct(conf, slotNumber);
      const buffer = this.serializeConfBaseStruct(struct);

      // Calculate offset for this slot
      const offset = slotNumber * this.CONFBASE_SIZE;

      // Open file for read/write
      const fd = fs.openSync(this.confDBPath, 'r+');
      try {
        // Write at specific offset
        fs.writeSync(fd, buffer, 0, this.CONFBASE_SIZE, offset);
        console.log(`[ConferenceFileManager] Updated conference "${conf.name}" (slot ${slotNumber}) in Conf.DB`);
      } finally {
        fs.closeSync(fd);
      }
    } catch (error) {
      console.error(`[ConferenceFileManager] Error updating conference "${conf.name}":`, error);
      throw error;
    }
  }

  /**
   * Read all conferences from Conf.DB (for verification/debugging)
   */
  readConferenceFile(slotNumber: number): ConfBaseStruct | null {
    try {
      if (!fs.existsSync(this.confDBPath)) {
        return null;
      }

      const fd = fs.openSync(this.confDBPath, 'r');
      try {
        const buffer = Buffer.alloc(this.CONFBASE_SIZE);
        const offset = slotNumber * this.CONFBASE_SIZE;

        const bytesRead = fs.readSync(fd, buffer, 0, this.CONFBASE_SIZE, offset);

        if (bytesRead < this.CONFBASE_SIZE) {
          return null; // Slot doesn't exist
        }

        // Parse buffer back to struct
        let readOffset = 0;

        const handle = buffer.toString('ascii', readOffset, readOffset + 16).replace(/\0.*$/, '');
        readOffset += 16;

        const downloadBytesBCD = Buffer.alloc(8);
        buffer.copy(downloadBytesBCD, 0, readOffset, readOffset + 8);
        readOffset += 8;

        const uploadBytesBCD = Buffer.alloc(8);
        buffer.copy(uploadBytesBCD, 0, readOffset, readOffset + 8);
        readOffset += 8;

        const newSinceDate = buffer.readInt32LE(readOffset);
        readOffset += 4;

        const confRead = buffer.readInt32LE(readOffset);
        readOffset += 4;

        const confYM = buffer.readInt32LE(readOffset);
        readOffset += 4;

        const bytesDownload = buffer.readInt32LE(readOffset);
        readOffset += 4;

        const bytesUpload = buffer.readInt32LE(readOffset);
        readOffset += 4;

        const uploadTracking = buffer.readInt16LE(readOffset);
        readOffset += 2;

        const unused = buffer.readInt16LE(readOffset);
        readOffset += 2;

        const unused2 = buffer.readInt32LE(readOffset);
        readOffset += 4;

        const upload = buffer.readInt16LE(readOffset);
        readOffset += 2;

        const downloads = buffer.readInt16LE(readOffset);
        readOffset += 2;

        const ratioType = buffer.readInt16LE(readOffset);
        readOffset += 2;

        const ratio = buffer.readInt16LE(readOffset);
        readOffset += 2;

        const messagesPosted = buffer.readInt16LE(readOffset);
        readOffset += 2;

        const access = buffer.readInt16LE(readOffset);
        readOffset += 2;

        const active = buffer.readInt16LE(readOffset);
        readOffset += 2;

        return {
          handle,
          downloadBytesBCD,
          uploadBytesBCD,
          newSinceDate,
          confRead,
          confYM,
          bytesDownload,
          bytesUpload,
          uploadTracking,
          unused,
          unused2,
          upload,
          downloads,
          ratioType,
          ratio,
          messagesPosted,
          access,
          active
        };
      } finally {
        fs.closeSync(fd);
      }
    } catch (error) {
      console.error(`[ConferenceFileManager] Error reading conference slot ${slotNumber}:`, error);
      return null;
    }
  }

  /**
   * Get total number of conferences in Conf.DB
   */
  getConferenceCount(): number {
    try {
      if (!fs.existsSync(this.confDBPath)) {
        return 0;
      }

      const stats = fs.statSync(this.confDBPath);
      return Math.floor(stats.size / this.CONFBASE_SIZE);
    } catch (error) {
      console.error(`[ConferenceFileManager] Error getting conference count:`, error);
      return 0;
    }
  }
}

// Export singleton instance
export const conferenceFileManager = new ConferenceFileManager();
