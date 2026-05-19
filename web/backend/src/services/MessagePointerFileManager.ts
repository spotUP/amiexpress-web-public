/**
 * MessagePointerFileManager — per-conference user message-pointer disk file.
 *
 * AmiExpress stores per-user-per-conference state (last-read/last-scan
 * message numbers, bytes up/down, ratio, etc.) in `<conf>/Conf.DB`. Records
 * are 74-byte `confBase` structs (axobjects.e:136-155), indexed by
 * `(userSlotNumber - 1) * 74`. express.e:4855 saveConfDB writes the struct
 * at that offset.
 *
 * This service mirrors `updateReadPointer` / `updateScanPointer` SQL writes
 * to the matching disk record so 68K doors that call `loadMsgPointers`
 * (which reads `<conf>/Conf.DB` via `loadConfDB`) see fresh data.
 *
 * The disk record carries many fields beyond confRead/confYM. We do
 * read-modify-write so the other fields (handle, byte stats, ratio, etc.)
 * are preserved across an update of just the read pointers.
 *
 * See: thoughts/shared/research/2026-05-18_sqlite-disk-parity-audit.md
 */

import * as fs from 'fs';
import * as path from 'path';

export const CONFBASE_RECORD_SIZE = 74;

export interface ConfBaseRecord {
  handle: string;              // CHAR[16]
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
    handle: '',
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

  buf.write((rec.handle || '').slice(0, 16), off, 16, 'ascii');
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
  const handle = buf.toString('ascii', off, off + 16).replace(/\0.*$/, ''); off += 16;
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
    this.bbsRoot = bbsRoot || process.env.BBS_ROOT || path.join(__dirname, '../../../..');
    this.suppressErrors = process.env.NODE_ENV === 'test' || process.env.SUPPRESS_CONF_DB_ERRORS === '1';
  }

  /** `<bbsRoot>/Conf{N}/Conf.DB` — express.e:2102 getConfDbFileName resolves here for single-msgbase confs. */
  private getConfDbPath(conferenceId: number): string {
    return path.join(this.bbsRoot, `Conf${conferenceId}`, 'Conf.DB');
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

  /** Update the last-NEW-scanned pointer (`confRead` in confBase). express.e:4972 `cb.confRead := lastNewReadConf`. */
  updateScanPointer(conferenceId: number, slotNumber: number, lastNewRead: number): void {
    this.patchRecord(conferenceId, slotNumber, { confRead: lastNewRead });
  }

  /** Update the last-MSG-read pointer (`confYM` in confBase). express.e:4971 `cb.confYM := lastMsgReadConf`. */
  updateReadPointer(conferenceId: number, slotNumber: number, lastMsgRead: number): void {
    this.patchRecord(conferenceId, slotNumber, { confYM: lastMsgRead });
  }
}

export const messagePointerFileManager = new MessagePointerFileManager();
