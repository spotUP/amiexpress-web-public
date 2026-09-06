import { parseAmigaMsgHeader } from './amiga-msgheader';
import { classifyMsgHeaderRecord, classifyHeaderFile, portRecordToAmiga, type MsgHeaderLayout } from './msgheader-layout';
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
   * Override bbsRoot — for tests that operate on a temp directory.
   * Production code never calls this; the constructor sets the production root.
   */
  setBbsRoot(root: string): void {
    this.bbsRoot = root;
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
    // express.e:8691-8693 — fresh msgbase: lowestKey=1, highMsgNum=1, lowestNotDel=0
    if (!fs.existsSync(statsPath)) {
      const initialStats: MailStat = {
        lowestKey: 1,
        highMsgNum: 1,
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
    /*
     * Written in the layout AmiExpress uses, which is not the one this
     * method used to write.
     *
     * Amiga E aligns a LONG to an even offset, so the real record carries a
     * pad byte before msgNumb and another before msgDate. This wrote msgNumb
     * at offset 1 - a 32-bit LONG at an odd address, which a 68000 cannot
     * even fetch - and pushed both pads to the end. The files were
     * self-consistent and unreadable by AmiExpress, by a 68K door reading
     * HeaderFile directly, and by a real Amiga.
     *
     * See services/amiga-msgheader.ts for the layout and how it was checked
     * against a reference board.
     */
    const buffer = Buffer.alloc(this.MSGHEADER_SIZE);

    const field = (text: string, at: number) => {
      const padded = Buffer.alloc(31, 0);
      // latin1, not ascii: an Amiga name carries high-bit characters, and
      // 'ascii' masks them to 7 bits rather than keeping the byte.
      Buffer.from(text.substring(0, 31), 'latin1').copy(padded);
      padded.copy(buffer, at);
    };

    /*
     * UNSIGNED for the three LONGs, because that is how they are READ.
     *
     * amiga-msgheader.ts reads msgNumb, msgDate and recv with readUInt32BE,
     * and this method wrote them back with writeInt32BE - so a record whose
     * value has the top bit set came out of the file fine and threw on the way
     * back in:
     *
     *   RangeError: The value of "value" is out of range. It must be
     *   >= -2147483648 and <= 2147483647. Received 2404384768
     *
     * This board's Conf1 holds such a record, so deleting or editing ANY
     * message in that conference threw - rewriteHeaderFile re-serializes every
     * header in the file, not only the one that changed, and one bad
     * neighbour took the whole write down. The same asymmetry is already
     * called out for extMsgNum below: read one way and written the other, a
     * value cannot survive the round trip.
     *
     * `>>> 0` keeps the conversion TOTAL. A caller handing in a negative -
     * nothing in src does today - lands on the same four bytes writeInt32BE
     * would have written, rather than trading one RangeError for another.
     */
    buffer.writeUInt8(header.status, 0);
    // 1 is the pad that aligns msgNumb.
    buffer.writeUInt32BE(header.msgNumb >>> 0, 2);
    field(header.toName, 6);
    field(header.fromName, 37);
    field(header.subject, 68);
    // 99 is the pad that aligns msgDate.
    buffer.writeUInt32BE(header.msgDate >>> 0, 100);
    buffer.writeUInt32BE(header.recv >>> 0, 104);
    // SIGNED: axobjects.e:188 declares extMsgNum an Amiga E INT, and
    // amiga-msgheader.ts reads it with readInt16BE to match.
    buffer.writeInt16BE(header.extMsgNum, 108);

    return buffer;
  }

  /**
   * Deserialize msgHeader struct from binary buffer
   */
  private deserializeMsgHeader(buffer: Buffer, offset: number, known?: MsgHeaderLayout): MsgHeader {
    /*
     * Reads BOTH layouts, because this board's files contain both.
     *
     * Conf1 holds messages dated March 1996 - written by the Amiga this board
     * came from - next to messages this port appended in 2026, and Conf2
     * record 130 is a lone AmiExpress record among 159 of the port's. Reading
     * every record as the port's own layout returned msgNumb 0 for every
     * original message, and the new-mail scan and message move/delete all
     * look messages up BY NUMBER.
     *
     * A record nothing can identify is read as AmiExpress rather than
     * guessed at differently each time; the migration reports those instead
     * of rewriting them.
     */
    const layout = known ?? classifyMsgHeaderRecord(buffer, offset);
    const record = layout === 'port'
      ? portRecordToAmiga(buffer, offset)
      : buffer.subarray(offset, offset + this.MSGHEADER_SIZE);

    const amiga = parseAmigaMsgHeader(record, 0);
    return {
      status: amiga.status,
      msgNumb: amiga.msgNumb,
      toName: amiga.toName,
      fromName: amiga.fromName,
      subject: amiga.subject,
      msgDate: amiga.msgDate,
      recv: amiga.recv,
      extMsgNum: amiga.extMsgNum,
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

    return this.parseHeaderFile(fs.readFileSync(headerPath));
  }

  /**
   * The headers in a HeaderFile's bytes, wherever those bytes came from.
   *
   * Split out from `readHeaderFile` so the IMPORTER can read ANOTHER board's
   * message base: this class resolves its paths against the board it is
   * running, and an import is by definition reading a different one. The
   * alternative was a second copy of the 110-byte record layout, and this
   * importer already carried second copies of the .info and user formats,
   * both of which were wrong.
   */
  parseHeaderFile(buffer: Buffer): MsgHeader[] {
    const messageCount = Math.floor(buffer.length / this.MSGHEADER_SIZE);
    // Decided with the whole file in hand: a record this port wrote has a
    // plausible message number at BOTH offsets, and only the sequence the
    // other records form says which one is real.
    const layouts = classifyHeaderFile(buffer);
    const headers: MsgHeader[] = [];

    for (let i = 0; i < messageCount; i++) {
      headers.push(this.deserializeMsgHeader(buffer, i * this.MSGHEADER_SIZE, layouts[i]));
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
   * Public rebuild: replace the HeaderFile with a fresh set of headers
   * and recalculate MailStats. Used by the admin repair/resync endpoint.
   */
  rebuildHeaders(confNumber: number, headers: MsgHeader[]): void {
    this.rewriteHeaderFile(confNumber, headers);

    // Recalculate MailStats from the rebuilt headers
    let lowestKey = 0;
    let highMsgNum = 0;
    let lowestNotDel = 0;
    for (const h of headers) {
      if (lowestKey === 0 || h.msgNumb < lowestKey) lowestKey = h.msgNumb;
      if (h.msgNumb > highMsgNum) highMsgNum = h.msgNumb;
      if (h.status !== MsgStatus.DELETED && (lowestNotDel === 0 || h.msgNumb < lowestNotDel)) lowestNotDel = h.msgNumb;
    }
    this.writeMailStats(confNumber, { lowestKey, highMsgNum, lowestNotDel, pad: Buffer.alloc(6) });
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
   * Update MailStats after adding a message — express.e:12418-12419
   * Unconditionally bumps highMsgNum by 1 (highMsgNum stores the NEXT id to assign).
   * On 1→2 transition (first save in a fresh msgbase) sets lowestNotDel:=1.
   */
  private updateMailStatsAfterAdd(confNumber: number, msgNumber: number): void {
    let stats = this.readMailStats(confNumber);

    if (!stats) {
      // Should not happen — initializeMessageIndex creates MailStats. Synthesize
      // express.e fresh-init values, then apply the post-save bump below.
      stats = {
        lowestKey: 1,
        highMsgNum: 1,
        lowestNotDel: 0,
        pad: Buffer.alloc(6, 0)
      };
    }

    // express.e:12418 — UNCONDITIONAL increment (highMsgNum := highMsgNum + 1).
    // Caller already wrote the header for msgNumber (== old highMsgNum).
    stats.highMsgNum = stats.highMsgNum + 1;

    // express.e:12419 — first message ever bumps lowestNotDel to 1
    if (stats.highMsgNum === 2) {
      stats.lowestNotDel = 1;
    }

    this.writeMailStats(confNumber, stats);
console.log(`[MessageIndexManager] Updated MailStats: high=${stats.highMsgNum}, low=${stats.lowestKey}, lowestNotDel=${stats.lowestNotDel}`);
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
   * Get next available message number — express.e:10688
   * `mh.msgNumb := mailStat.highMsgNum`. The current high IS the next id.
   * After saveMessageHeader the high is bumped by 1 (see updateMailStatsAfterAdd).
   */
  getNextMessageNumber(confNumber: number): number {
    const stats = this.readMailStats(confNumber);
    if (!stats) {
      // Fresh msgbase: express.e:8693 inits highMsgNum=1, so first msg id is 1
      return 1;
    }
    return stats.highMsgNum;
  }
}

// Export singleton instance
export const messageIndexManager = new MessageIndexManager();
