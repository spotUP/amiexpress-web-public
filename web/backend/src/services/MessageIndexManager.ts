import * as fs from 'fs';
import * as path from 'path';
import { getRootConferenceDir } from '../utils/file-hold.util';

/**
 * MessageIndexManager - Manages AmiExpress message index files
 *
 * Handles three critical files for message door compatibility:
 * 1. HeaderFile - Binary index of all messages (110 bytes per msgHeader)
 * 2. MailStats - Message statistics (18 bytes - mailStat struct)
 * 3. MailLock - Lock file for multi-node message safety
 *
 * References:
 * - axobjects.e:180-190 - msgHeader struct (110 bytes)
 * - axobjects.e:192-197 - mailStat struct (18 bytes)
 * - express.e:11865, 12444 - HeaderFile operations
 * - express.e:8677, 11809 - MailStats operations
 */

/**
 * Message header struct from axobjects.e:180-190
 * Total size: 110 bytes (with padding)
 */
export interface MsgHeader {
  status: number;        // 1 byte - message status flags
  msgNumb: number;       // 4 bytes - message number
  toName: string;        // 31 bytes - recipient name
  fromName: string;      // 31 bytes - sender name
  subject: string;       // 31 bytes - subject line
  msgDate: number;       // 4 bytes - Unix timestamp
  recv: number;          // 4 bytes - received timestamp
  extMsgNum: number;     // 2 bytes - external message number
}

/**
 * Mail statistics struct from axobjects.e:192-197
 * Total size: 18 bytes
 */
export interface MailStat {
  lowestKey: number;     // 4 bytes - lowest message key
  highMsgNum: number;    // 4 bytes - highest message number
  lowestNotDel: number;  // 4 bytes - lowest non-deleted message
  pad: Buffer;           // 6 bytes - padding
}

/**
 * Message status — express.e mailHeader.status is a single ASCII CHAR.
 * Values are mutually exclusive (a message is exactly one of these), not bitflags.
 *  - 'P' (0x50) public uncensored — express.e:10793
 *  - 'p' (0x70) public censored (ACS_CENSORED) — express.e:10791
 *  - 'R' (0x52) private — express.e:10868, 8792
 *  - 'D' (0x44) deleted — express.e:11930
 *
 * Use equality comparisons (===), NOT bitwise AND.
 */
export enum MsgStatus {
  NORMAL = 0x50,    // 'P'
  CENSORED = 0x70,  // 'p'
  PRIVATE = 0x52,   // 'R'
  DELETED = 0x44,   // 'D'
}

export class MessageIndexManager {
  private readonly MSGHEADER_SIZE = 110;  // Size of msgHeader struct
  private readonly MAILSTAT_SIZE = 18;     // Size of mailStat struct
  private bbsRoot: string;

  constructor() {
    this.bbsRoot = process.env.BBS_ROOT || path.join(__dirname, '../../../..');
  }

  /**
   * Get path to MsgBase directory for a conference
   */
  private getMsgBaseDir(confNumber: number): string {
    const conferenceDir = getRootConferenceDir(confNumber, this.bbsRoot);
    return path.join(conferenceDir, 'MsgBase');
  }

  /**
   * Get path to HeaderFile
   */
  private getHeaderFilePath(confNumber: number): string {
    return path.join(this.getMsgBaseDir(confNumber), 'HeaderFile');
  }

  /**
   * Get path to MailStats
   */
  private getMailStatsPath(confNumber: number): string {
    return path.join(this.getMsgBaseDir(confNumber), 'MailStats');
  }

  /**
   * Get path to MailLock
   */
  private getMailLockPath(confNumber: number): string {
    return path.join(this.getMsgBaseDir(confNumber), 'MailLock');
  }

  /**
   * Ensure MsgBase directory exists
   */
  private ensureMsgBaseDir(confNumber: number): void {
    const dir = this.getMsgBaseDir(confNumber);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Initialize message index files for a conference
   * Creates HeaderFile (empty), MailStats (zeroed), MailLock (empty)
   */
  initializeMessageIndex(confNumber: number): void {
    this.ensureMsgBaseDir(confNumber);

    const headerPath = this.getHeaderFilePath(confNumber);
    const statsPath = this.getMailStatsPath(confNumber);
    const lockPath = this.getMailLockPath(confNumber);

    // Create empty HeaderFile if it doesn't exist
    if (!fs.existsSync(headerPath)) {
      fs.writeFileSync(headerPath, Buffer.alloc(0));
console.log(`[MessageIndexManager] Created HeaderFile for Conf${confNumber}`);
    }

    // Create initial MailStats if it doesn't exist
    if (!fs.existsSync(statsPath)) {
      const initialStats: MailStat = {
        lowestKey: 0,
        highMsgNum: 0,
        lowestNotDel: 0,
        pad: Buffer.alloc(6, 0)
      };
      this.writeMailStats(confNumber, initialStats);
console.log(`[MessageIndexManager] Created MailStats for Conf${confNumber}`);
    }

    // Create empty MailLock if it doesn't exist
    if (!fs.existsSync(lockPath)) {
      fs.writeFileSync(lockPath, '');
console.log(`[MessageIndexManager] Created MailLock for Conf${confNumber}`);
    }
  }

  /**
   * Serialize msgHeader struct to binary buffer (110 bytes)
   */
  private serializeMsgHeader(header: MsgHeader): Buffer {
    const buffer = Buffer.alloc(this.MSGHEADER_SIZE);
    let offset = 0;

    // status: CHAR (1 byte)
    buffer.writeUInt8(header.status, offset);
    offset += 1;

    // msgNumb: LONG (4 bytes, big-endian)
    buffer.writeInt32BE(header.msgNumb, offset);
    offset += 4;

    // toName[31]: ARRAY OF CHAR (31 bytes, null-padded)
    const toName = Buffer.alloc(31, 0);
    Buffer.from(header.toName.substring(0, 31), 'ascii').copy(toName);
    toName.copy(buffer, offset);
    offset += 31;

    // fromName[31]: ARRAY OF CHAR (31 bytes, null-padded)
    const fromName = Buffer.alloc(31, 0);
    Buffer.from(header.fromName.substring(0, 31), 'ascii').copy(fromName);
    fromName.copy(buffer, offset);
    offset += 31;

    // subject[31]: ARRAY OF CHAR (31 bytes, null-padded)
    const subject = Buffer.alloc(31, 0);
    Buffer.from(header.subject.substring(0, 31), 'ascii').copy(subject);
    subject.copy(buffer, offset);
    offset += 31;

    // msgDate: LONG (4 bytes, big-endian)
    buffer.writeInt32BE(header.msgDate, offset);
    offset += 4;

    // recv: LONG (4 bytes, big-endian)
    buffer.writeInt32BE(header.recv, offset);
    offset += 4;

    // extMsgNum: INT (2 bytes, big-endian)
    buffer.writeInt16BE(header.extMsgNum, offset);
    offset += 2;

    // Padding to 110 bytes (offset should be 108, need 2 more bytes)
    // Already allocated, zero-filled

    return buffer;
  }

  /**
   * Deserialize msgHeader struct from binary buffer
   */
  private deserializeMsgHeader(buffer: Buffer, offset: number): MsgHeader {
    let pos = offset;

    const status = buffer.readUInt8(pos);
    pos += 1;

    const msgNumb = buffer.readInt32BE(pos);
    pos += 4;

    const toName = buffer.toString('ascii', pos, pos + 31).replace(/\0/g, '');
    pos += 31;

    const fromName = buffer.toString('ascii', pos, pos + 31).replace(/\0/g, '');
    pos += 31;

    const subject = buffer.toString('ascii', pos, pos + 31).replace(/\0/g, '');
    pos += 31;

    const msgDate = buffer.readInt32BE(pos);
    pos += 4;

    const recv = buffer.readInt32BE(pos);
    pos += 4;

    const extMsgNum = buffer.readInt16BE(pos);
    pos += 2;

    return {
      status,
      msgNumb,
      toName,
      fromName,
      subject,
      msgDate,
      recv,
      extMsgNum
    };
  }

  /**
   * Read all message headers from HeaderFile
   */
  readHeaderFile(confNumber: number): MsgHeader[] {
    const headerPath = this.getHeaderFilePath(confNumber);

    if (!fs.existsSync(headerPath)) {
      return [];
    }

    const buffer = fs.readFileSync(headerPath);
    const messageCount = Math.floor(buffer.length / this.MSGHEADER_SIZE);
    const headers: MsgHeader[] = [];

    for (let i = 0; i < messageCount; i++) {
      const offset = i * this.MSGHEADER_SIZE;
      headers.push(this.deserializeMsgHeader(buffer, offset));
    }

    return headers;
  }

  /**
   * Append a message header to HeaderFile
   */
  appendMessageHeader(confNumber: number, header: MsgHeader): void {
    this.ensureMsgBaseDir(confNumber);
    const headerPath = this.getHeaderFilePath(confNumber);
    const buffer = this.serializeMsgHeader(header);

    fs.appendFileSync(headerPath, buffer);
console.log(`[MessageIndexManager] Appended header for msg ${header.msgNumb} to HeaderFile`);

    // Update MailStats
    this.updateMailStatsAfterAdd(confNumber, header.msgNumb);
  }

  /**
   * Update a message header in HeaderFile (by message number)
   */
  updateMessageHeader(confNumber: number, msgNumber: number, updates: Partial<MsgHeader>): void {
    const headers = this.readHeaderFile(confNumber);
    const index = headers.findIndex(h => h.msgNumb === msgNumber);

    if (index < 0) {
console.error(`[MessageIndexManager] Message ${msgNumber} not found in HeaderFile`);
      return;
    }

    // Update the header
    headers[index] = { ...headers[index], ...updates };

    // Rewrite entire HeaderFile
    this.rewriteHeaderFile(confNumber, headers);
console.log(`[MessageIndexManager] Updated header for msg ${msgNumber} in HeaderFile`);
  }

  /**
   * Mark a message as deleted in HeaderFile
   */
  deleteMessageHeader(confNumber: number, msgNumber: number): void {
    this.updateMessageHeader(confNumber, msgNumber, {
      status: MsgStatus.DELETED
    });

    // Update MailStats
    this.updateMailStatsAfterDelete(confNumber);
  }

  /**
   * Rewrite entire HeaderFile with new headers array
   */
  private rewriteHeaderFile(confNumber: number, headers: MsgHeader[]): void {
    const headerPath = this.getHeaderFilePath(confNumber);
    const buffers = headers.map(h => this.serializeMsgHeader(h));
    const combined = Buffer.concat(buffers);

    fs.writeFileSync(headerPath, combined);
  }

  /**
   * Serialize mailStat struct to binary buffer (18 bytes)
   */
  private serializeMailStat(stats: MailStat): Buffer {
    const buffer = Buffer.alloc(this.MAILSTAT_SIZE);
    let offset = 0;

    // lowestKey: LONG (4 bytes)
    buffer.writeInt32BE(stats.lowestKey, offset);
    offset += 4;

    // highMsgNum: LONG (4 bytes)
    buffer.writeInt32BE(stats.highMsgNum, offset);
    offset += 4;

    // lowestNotDel: LONG (4 bytes)
    buffer.writeInt32BE(stats.lowestNotDel, offset);
    offset += 4;

    // pad[6]: ARRAY OF CHAR (6 bytes)
    stats.pad.copy(buffer, offset, 0, 6);

    return buffer;
  }

  /**
   * Deserialize mailStat struct from binary buffer
   */
  private deserializeMailStat(buffer: Buffer): MailStat {
    let offset = 0;

    const lowestKey = buffer.readInt32BE(offset);
    offset += 4;

    const highMsgNum = buffer.readInt32BE(offset);
    offset += 4;

    const lowestNotDel = buffer.readInt32BE(offset);
    offset += 4;

    const pad = Buffer.alloc(6);
    buffer.copy(pad, 0, offset, offset + 6);

    return {
      lowestKey,
      highMsgNum,
      lowestNotDel,
      pad
    };
  }

  /**
   * Read MailStats file
   */
  readMailStats(confNumber: number): MailStat | null {
    const statsPath = this.getMailStatsPath(confNumber);

    if (!fs.existsSync(statsPath)) {
      return null;
    }

    const buffer = fs.readFileSync(statsPath);
    if (buffer.length < this.MAILSTAT_SIZE) {
      return null;
    }

    return this.deserializeMailStat(buffer);
  }

  /**
   * Write MailStats file
   */
  writeMailStats(confNumber: number, stats: MailStat): void {
    this.ensureMsgBaseDir(confNumber);
    const statsPath = this.getMailStatsPath(confNumber);
    const buffer = this.serializeMailStat(stats);

    fs.writeFileSync(statsPath, buffer);
  }

  /**
   * Update MailStats after adding a message
   */
  private updateMailStatsAfterAdd(confNumber: number, msgNumber: number): void {
    let stats = this.readMailStats(confNumber);

    if (!stats) {
      stats = {
        lowestKey: msgNumber,
        highMsgNum: msgNumber,
        lowestNotDel: msgNumber,
        pad: Buffer.alloc(6, 0)
      };
    } else {
      // Update highMsgNum if this is higher
      if (msgNumber > stats.highMsgNum) {
        stats.highMsgNum = msgNumber;
      }

      // Update lowestKey if this is lower or first message
      if (stats.lowestKey === 0 || msgNumber < stats.lowestKey) {
        stats.lowestKey = msgNumber;
      }

      // Update lowestNotDel
      if (stats.lowestNotDel === 0 || msgNumber < stats.lowestNotDel) {
        stats.lowestNotDel = msgNumber;
      }
    }

    this.writeMailStats(confNumber, stats);
console.log(`[MessageIndexManager] Updated MailStats: high=${stats.highMsgNum}, low=${stats.lowestKey}`);
  }

  /**
   * Update MailStats after deleting a message
   * Recalculates lowestNotDel by scanning HeaderFile
   */
  private updateMailStatsAfterDelete(confNumber: number): void {
    const stats = this.readMailStats(confNumber);
    if (!stats) return;

    const headers = this.readHeaderFile(confNumber);

    // Find lowest non-deleted message
    let lowestNotDel = 0;
    for (const header of headers) {
      if (header.status !== MsgStatus.DELETED) {
        if (lowestNotDel === 0 || header.msgNumb < lowestNotDel) {
          lowestNotDel = header.msgNumb;
        }
      }
    }

    stats.lowestNotDel = lowestNotDel;
    this.writeMailStats(confNumber, stats);
console.log(`[MessageIndexManager] Updated MailStats after delete: lowestNotDel=${lowestNotDel}`);
  }

  /**
   * Acquire lock for message operations
   * Returns true if lock acquired, false if already locked
   */
  acquireMailLock(confNumber: number, nodeId: number): boolean {
    this.ensureMsgBaseDir(confNumber);
    const lockPath = this.getMailLockPath(confNumber);

    // Check if lock exists and is recent
    if (fs.existsSync(lockPath)) {
      try {
        const lockData = fs.readFileSync(lockPath, 'utf8');
        const timestamp = parseInt(lockData, 10);
        const now = Date.now();

        // If lock is older than 30 seconds, consider it stale
        if (!isNaN(timestamp) && (now - timestamp) < 30000) {
console.log(`[MessageIndexManager] MailLock already held for Conf${confNumber}`);
          return false;
        }
      } catch (err) {
        // Ignore parse errors, treat as stale lock
      }
    }

    // Acquire lock
    const lockData = `${Date.now()}`;
    fs.writeFileSync(lockPath, lockData);
console.log(`[MessageIndexManager] MailLock acquired for Conf${confNumber} by node ${nodeId}`);
    return true;
  }

  /**
   * Release lock for message operations
   */
  releaseMailLock(confNumber: number, nodeId: number): void {
    const lockPath = this.getMailLockPath(confNumber);

    if (fs.existsSync(lockPath)) {
      fs.unlinkSync(lockPath);
console.log(`[MessageIndexManager] MailLock released for Conf${confNumber} by node ${nodeId}`);
    }
  }

  /**
   * Get message count from MailStats
   */
  getMessageCount(confNumber: number): number {
    const stats = this.readMailStats(confNumber);
    return stats ? stats.highMsgNum : 0;
  }

  /**
   * Get next available message number
   */
  getNextMessageNumber(confNumber: number): number {
    const stats = this.readMailStats(confNumber);
    return stats ? stats.highMsgNum + 1 : 1;
  }
}

// Export singleton instance
export const messageIndexManager = new MessageIndexManager();
