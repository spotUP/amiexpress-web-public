/**
 * MessagePointerFileManager — per-conference user message-pointer disk file.
 *
 * AmiExpress stores per-user-per-conference state (last-read/last-scan
 * message numbers, bytes up/down, ratio, etc.) in `<conf>/Conf.DB`. Records
 * are 74-byte `confBase` structs (axobjects.e:136-155), indexed by
 * `(userSlotNumber - 1) * 74`. express.e:4855 saveConfDB writes the struct
 * at that offset.
 *
 * This file IS the board's copy of that state, as it is express.e's:
 * loadConfDB 4819 / saveConfDB 4855 read and write the record, and the
 * `conf_base` SQL table only mirrors it (utils/message-pointers.util.ts).
 * A door that saves a record with SAVE_CONFDB, an AmiExpress tool, or the
 * sysop's conference accounting editor all write here, and the next join
 * reads what they wrote.
 *
 * The record carries many fields; every write is a read-modify-write of the
 * fields it names, so a pointer save does not undo a download booked in
 * between.
 *
 * See: thoughts/shared/research/2026-05-18_sqlite-disk-parity-audit.md
 */

import * as fs from 'fs';
import * as path from 'path';
import { boardRoot } from '../utils/board-root.util';
import { conferenceConfDbPath, conferenceConfDbShared } from '../conferences/conference-paths';
import { addBCD, readPackedBCD, writePackedBCD } from '../utils/bcd-math.util';

export const CONFBASE_RECORD_SIZE = 74;

export interface ConfBaseRecord {
  /**
   * CHAR[16], and not text: byte 0 holds the scan masks (axconsts.e:45-48),
   * the bits above them the answered vote topics (express.e:20797-20798).
   * Kept as raw bytes - an ascii decode drops bit 7, which is MAILSCAN_ALL.
   */
  handle: Buffer;
  downloadBytesBCD: Buffer;    // CHAR[8]
  uploadBytesBCD: Buffer;      // CHAR[8]
  newSinceDate: number;        // LONG
  confRead: number;            // LONG  — last NEW-scanned msg number
  confYM: number;              // LONG  — last MSG-read msg number
  bytesDownload: number;       // LONG
  bytesUpload: number;         // LONG
  uploadTracking: number;      // INT
  unused: number;              // INT
  unused2: number;             // LONG (dailyBytesDld)
  upload: number;              // INT
  downloads: number;           // INT
  ratioType: number;           // INT
  ratio: number;               // INT
  messagesPosted: number;      // INT
  access: number;              // INT
  active: number;              // INT
}

function zeroRecord(): ConfBaseRecord {
  return {
    handle: Buffer.alloc(16),
    downloadBytesBCD: Buffer.alloc(8),
    uploadBytesBCD: Buffer.alloc(8),
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
    access: 0,
    active: 0,
  };
}

export function serializeConfBase(rec: ConfBaseRecord): Buffer {
  const buf = Buffer.alloc(CONFBASE_RECORD_SIZE);
  let off = 0;

  (rec.handle ?? Buffer.alloc(16)).copy(buf, off, 0, 16);
  off += 16;

  rec.downloadBytesBCD.copy(buf, off, 0, 8); off += 8;
  rec.uploadBytesBCD.copy(buf, off, 0, 8);   off += 8;

  buf.writeInt32BE(rec.newSinceDate | 0, off); off += 4;
  buf.writeInt32BE(rec.confRead | 0, off);     off += 4;
  buf.writeInt32BE(rec.confYM | 0, off);       off += 4;
  buf.writeInt32BE(rec.bytesDownload | 0, off); off += 4;
  buf.writeInt32BE(rec.bytesUpload | 0, off);   off += 4;
  buf.writeInt16BE(rec.uploadTracking & 0xffff, off); off += 2;
  buf.writeInt16BE(rec.unused & 0xffff, off);   off += 2;
  buf.writeInt32BE(rec.unused2 | 0, off);       off += 4;
  buf.writeInt16BE(rec.upload & 0xffff, off);   off += 2;
  buf.writeInt16BE(rec.downloads & 0xffff, off); off += 2;
  buf.writeInt16BE(rec.ratioType & 0xffff, off); off += 2;
  buf.writeInt16BE(rec.ratio & 0xffff, off);    off += 2;
  buf.writeInt16BE(rec.messagesPosted & 0xffff, off); off += 2;
  buf.writeInt16BE(rec.access & 0xffff, off);   off += 2;
  buf.writeInt16BE(rec.active & 0xffff, off);   off += 2;

  if (off !== CONFBASE_RECORD_SIZE) {
    throw new Error(`confBase serialization size mismatch: ${off} != ${CONFBASE_RECORD_SIZE}`);
  }
  return buf;
}

export function deserializeConfBase(buf: Buffer, base: number = 0): ConfBaseRecord {
  if (buf.length - base < CONFBASE_RECORD_SIZE) {
    throw new Error(`confBase buffer too small: ${buf.length - base} < ${CONFBASE_RECORD_SIZE}`);
  }
  let off = base;
  const handle = Buffer.alloc(16); buf.copy(handle, 0, off, off + 16); off += 16;
  const dl = Buffer.alloc(8); buf.copy(dl, 0, off, off + 8); off += 8;
  const ul = Buffer.alloc(8); buf.copy(ul, 0, off, off + 8); off += 8;
  const newSinceDate = buf.readInt32BE(off); off += 4;
  const confRead     = buf.readInt32BE(off); off += 4;
  const confYM       = buf.readInt32BE(off); off += 4;
  const bytesDownload = buf.readInt32BE(off); off += 4;
  const bytesUpload   = buf.readInt32BE(off); off += 4;
  const uploadTracking = buf.readInt16BE(off); off += 2;
  const unused        = buf.readInt16BE(off); off += 2;
  const unused2       = buf.readInt32BE(off); off += 4;
  const upload        = buf.readInt16BE(off); off += 2;
  const downloads     = buf.readInt16BE(off); off += 2;
  const ratioType     = buf.readInt16BE(off); off += 2;
  const ratio         = buf.readInt16BE(off); off += 2;
  const messagesPosted = buf.readInt16BE(off); off += 2;
  const access        = buf.readInt16BE(off); off += 2;
  const active        = buf.readInt16BE(off); off += 2;

  return {
    handle, downloadBytesBCD: dl, uploadBytesBCD: ul,
    newSinceDate, confRead, confYM, bytesDownload, bytesUpload,
    uploadTracking, unused, unused2, upload, downloads,
    ratioType, ratio, messagesPosted, access, active,
  };
}

export class MessagePointerFileManager {
  private bbsRoot: string;
  private readonly suppressErrors: boolean;

  constructor(bbsRoot?: string) {
    this.bbsRoot = bbsRoot || boardRoot();
    this.suppressErrors = process.env.NODE_ENV === 'test' || process.env.SUPPRESS_CONF_DB_ERRORS === '1';
  }

  /**
   * express.e:2102-2111 getConfDbFileName: the conference's LOCATION (or
   * the CONFDB_SHARED conference's), never `Conf<n>` built from the number -
   * on a renumbered board that is the deleted conference's directory.
   */
  getConfDbPath(conferenceId: number): string {
    return conferenceConfDbPath(this.bbsRoot, conferenceId);
  }

  /** express.e:4895/4930: no per-caller accounting in a CONFDB_SHARED conference. */
  isShared(conferenceId: number): boolean {
    return conferenceConfDbShared(this.bbsRoot, conferenceId);
  }

  /**
   * The record as loadConfDB hands it over (express.e:4819-4853): the bytes
   * at `(slot-1)*74`, or a zeroed record when the file or the slot is not
   * there (4843-4847 clears the buffer on a short read).
   */
  readRaw(conferenceId: number, slotNumber: number): Buffer {
    return this.readRawAt(this.getConfDbPath(conferenceId), slotNumber, conferenceId);
  }

  /**
   * readRaw for a Conf.DB named by its path rather than its conference - for a
   * tool that walks every file getConfDbFileName can name (a conference with
   * several message bases has one per base, express.e:2102-2111).
   */
  readRawAt(filePath: string, slotNumber: number, conferenceId: number | string = filePath): Buffer {
    const out = Buffer.alloc(CONFBASE_RECORD_SIZE);
    if (slotNumber < 1) return out;
    let fd: number | undefined;
    try {
      if (!fs.existsSync(filePath)) return out;
      fd = fs.openSync(filePath, 'r');
      const bytes = fs.readSync(fd, out, 0, CONFBASE_RECORD_SIZE, (slotNumber - 1) * CONFBASE_RECORD_SIZE);
      if (bytes < CONFBASE_RECORD_SIZE) out.fill(0);
    } catch (e) {
      out.fill(0);
      if (!this.suppressErrors) console.error(`[MessagePointerFileManager] read failed conf=${conferenceId} slot=${slotNumber}:`, e);
    } finally {
      if (fd !== undefined) try { fs.closeSync(fd); } catch { /* noop */ }
    }
    return out;
  }

  /** loadConfDB's record, decoded. */
  readRecordOrZero(conferenceId: number, slotNumber: number): ConfBaseRecord {
    return deserializeConfBase(this.readRaw(conferenceId, slotNumber));
  }

  /**
   * saveConfDB's bytes, unchanged, into a Conf.DB named by its path: the
   * whole 74-byte record at `(slot-1)*74`, the file zero-padded up to it when
   * it is shorter (as patchRecord pads it). No field is decoded on the way.
   */
  writeRawAt(filePath: string, slotNumber: number, record: Buffer): void {
    if (slotNumber < 1) throw new Error(`slotNumber must be >= 1, got ${slotNumber}`);
    const whole = Buffer.alloc(CONFBASE_RECORD_SIZE);
    record.copy(whole, 0, 0, Math.min(record.length, CONFBASE_RECORD_SIZE));
    const offset = (slotNumber - 1) * CONFBASE_RECORD_SIZE;
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, Buffer.alloc(0));
    const fd = fs.openSync(filePath, 'r+');
    try {
      const size = fs.fstatSync(fd).size;
      if (size < offset) fs.writeSync(fd, Buffer.alloc(offset - size), 0, offset - size, size);
      fs.writeSync(fd, whole, 0, CONFBASE_RECORD_SIZE, offset);
    } finally {
      fs.closeSync(fd);
    }
  }

  /** saveConfDB (express.e:4855-4880): the whole record, as a door hands it over. */
  writeRaw(conferenceId: number, slotNumber: number, record: Buffer): void {
    const whole = Buffer.alloc(CONFBASE_RECORD_SIZE);
    record.copy(whole, 0, 0, Math.min(record.length, CONFBASE_RECORD_SIZE));
    this.patchRecord(conferenceId, slotNumber, deserializeConfBase(whole));
  }

  /** Read the record for slot, or null if file/slot doesn't exist. */
  readRecord(conferenceId: number, slotNumber: number): ConfBaseRecord | null {
    if (slotNumber < 1) return null;
    const filePath = this.getConfDbPath(conferenceId);
    if (!fs.existsSync(filePath)) return null;

    const offset = (slotNumber - 1) * CONFBASE_RECORD_SIZE;
    const buf = Buffer.alloc(CONFBASE_RECORD_SIZE);
    let fd: number | undefined;
    try {
      fd = fs.openSync(filePath, 'r');
      const bytes = fs.readSync(fd, buf, 0, CONFBASE_RECORD_SIZE, offset);
      if (bytes < CONFBASE_RECORD_SIZE) return null;
      return deserializeConfBase(buf);
    } catch (e) {
      if (!this.suppressErrors) console.error(`[MessagePointerFileManager] read failed conf=${conferenceId} slot=${slotNumber}:`, e);
      return null;
    } finally {
      if (fd !== undefined) try { fs.closeSync(fd); } catch { /* noop */ }
    }
  }

  /**
   * Read-modify-write specific fields of the confBase record at (slot-1)*74.
   *
   * If the file doesn't exist, creates the dir + file (zero-padded up to the
   * slot). If the file exists but is shorter than the slot offset, extends
   * with zero records.
   */
  patchRecord(conferenceId: number, slotNumber: number, patch: Partial<ConfBaseRecord>): void {
    if (slotNumber < 1) {
      throw new Error(`slotNumber must be >= 1, got ${slotNumber}`);
    }
    const filePath = this.getConfDbPath(conferenceId);
    const offset = (slotNumber - 1) * CONFBASE_RECORD_SIZE;
    const dir = path.dirname(filePath);

    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, Buffer.alloc(0));

      const fd = fs.openSync(filePath, 'r+');
      try {
        const stat = fs.fstatSync(fd);

        // Extend file if needed so the target slot exists.
        if (stat.size < offset + CONFBASE_RECORD_SIZE) {
          const padBytes = (offset + CONFBASE_RECORD_SIZE) - stat.size;
          fs.writeSync(fd, Buffer.alloc(padBytes), 0, padBytes, stat.size);
        }

        // Read existing record (now guaranteed to exist).
        const cur = Buffer.alloc(CONFBASE_RECORD_SIZE);
        fs.readSync(fd, cur, 0, CONFBASE_RECORD_SIZE, offset);
        const existing = (() => {
          try { return deserializeConfBase(cur); } catch { return zeroRecord(); }
        })();

        const merged: ConfBaseRecord = { ...existing, ...patch };
        const out = serializeConfBase(merged);
        fs.writeSync(fd, out, 0, CONFBASE_RECORD_SIZE, offset);
      } finally {
        fs.closeSync(fd);
      }
    } catch (e) {
      if (!this.suppressErrors) console.error(`[MessagePointerFileManager] patch failed conf=${conferenceId} slot=${slotNumber}:`, e);
      throw e;
    }
  }

  /**
   * express.e:15439-15452 updateDownloadStats under ACS_CONFERENCE_ACCOUNTING:
   * the FILE's conference record (message base 1) takes the download -
   * `addBCD(cb.downloadBytesBCD,fsize)`, bytesDownload from it, downloads+1.
   */
  addDownload(conferenceId: number, slotNumber: number, size: number): void {
    const rec = this.readRecordOrZero(conferenceId, slotNumber);
    const bcd = addBCD(accountedBytes(rec.bytesDownload, rec.downloadBytesBCD), Math.max(0, size));
    this.patchRecord(conferenceId, slotNumber, {
      downloadBytesBCD: writePackedBCD(bcd),
      bytesDownload: toLong(bcd),
      downloads: (rec.downloads + 1) & 0xffff,
    });
  }

  /**
   * saveMsgPointers' account half (express.e:4929-4939): under conference
   * accounting the caller's live counters ARE this conference's, and go back
   * into his record - the bytes as BCD and LONG, files, ratio type and ratio.
   */
  putAccount(conferenceId: number, slotNumber: number, account: ConferenceAccountFields): void {
    const down = BigInt(Math.max(0, Math.trunc(account.bytesDownload || 0)));
    const up = BigInt(Math.max(0, Math.trunc(account.bytesUpload || 0)));
    this.patchRecord(conferenceId, slotNumber, {
      downloadBytesBCD: writePackedBCD(down),
      bytesDownload: toLong(down),
      uploadBytesBCD: writePackedBCD(up),
      bytesUpload: toLong(up),
      upload: (account.uploads || 0) & 0xffff,
      downloads: (account.downloads || 0) & 0xffff,
      ratioType: (account.ratioType || 0) & 0xffff,
      ratio: (account.ratio || 0) & 0xffff,
    });
  }

  /**
   * express.e:22459-22519 updateAllUsers: walk every record of the
   * conference's database and change one field in each. Returns how many
   * records were written.
   */
  updateAllUsers(conferenceId: number, change: (rec: ConfBaseRecord) => void): number {
    const filePath = this.getConfDbPath(conferenceId);
    if (!fs.existsSync(filePath)) return 0;
    const buf = fs.readFileSync(filePath);
    const count = Math.floor(buf.length / CONFBASE_RECORD_SIZE);
    for (let i = 0; i < count; i++) {
      const rec = deserializeConfBase(buf, i * CONFBASE_RECORD_SIZE);
      change(rec);
      serializeConfBase(rec).copy(buf, i * CONFBASE_RECORD_SIZE);
    }
    fs.writeFileSync(filePath, buf);
    return count;
  }

  /** Update the last-NEW-scanned pointer (`confRead` in confBase). express.e:4972 `cb.confRead := lastNewReadConf`. */
  updateScanPointer(conferenceId: number, slotNumber: number, lastNewRead: number): void {
    this.patchRecord(conferenceId, slotNumber, { confRead: lastNewRead });
  }

  /** Update the last-MSG-read pointer (`confYM` in confBase). express.e:4971 `cb.confYM := lastMsgReadConf`. */
  updateReadPointer(conferenceId: number, slotNumber: number, lastMsgRead: number): void {
    this.patchRecord(conferenceId, slotNumber, { confYM: lastMsgRead });
  }
}

/**
 * A record's byte counter as express.e reads it: loadConfDB rebuilds the BCD
 * from the LONG (bcd.e:234-252 convertConfUDBytesTOBCD) unless the LONG is
 * the -1 overflow marker, when the BCD carries the real figure.
 */
export function accountedBytes(long: number, bcd: Buffer): bigint {
  if (long === -1) return readPackedBCD(bcd, 0);
  return BigInt(long >>> 0);
}

/** convertFromBCD: the LONG, or -1 when it no longer fits (bcd.e). */
function toLong(value: bigint): number {
  return value > 0x7fffffffn ? -1 : Number(value);
}

/** The scan masks of handle[0] (axconsts.e:45-48). */
export function scanFlagsOf(rec: ConfBaseRecord): number {
  return rec.handle[0] ?? 0;
}

/** The record's handle with byte 0 replaced - the vote bits above stay. */
export function withScanFlags(rec: ConfBaseRecord, flags: number): Buffer {
  const handle = Buffer.from(rec.handle);
  handle[0] = flags & 0xff;
  return handle;
}

/** The counters loadMsgPointers / saveMsgPointers swap under conference accounting (express.e:4896-4905). */
export interface ConferenceAccountFields {
  bytesDownload: number;
  bytesUpload: number;
  uploads: number;
  downloads: number;
  ratioType: number;
  ratio: number;
}

export const messagePointerFileManager = new MessagePointerFileManager();
