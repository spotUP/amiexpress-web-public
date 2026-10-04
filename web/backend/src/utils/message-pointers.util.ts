/**
 * Message Pointer System Utility
 *
 * Based on AmiExpress express.e message pointer implementation (express.e:8672-8707, 4882-4973)
 * Tracks which messages each user has read in each conference/message base
 *
 * Key functions:
 * - getMailStatFile(): Load message statistics (express.e:8672-8707)
 * - loadMsgPointers(): Load user's read pointers (express.e:4882-4914)
 * - saveMsgPointers(): Save user's read pointers (express.e:4916-4973)
 */

import { db } from '../database';
import type { MailStat, ConfBase } from '../types/message-pointers';
import { DEFAULT_MAIL_STAT } from '../types/message-pointers';
import { getConferenceToolFlags } from './conference-tooltypes.util';
import { getSystemTime, decodeAmigaDate, encodeAmigaDate } from '../utils/date-time.util';
import {
  messagePointerFileManager,
  accountedBytes,
  scanFlagsOf,
  withScanFlags,
  type ConfBaseRecord,
} from '../services/MessagePointerFileManager';
import { messageIndexManager } from '../services/MessageIndexManager';
import { conferenceNumbers } from '../conferences/conference-paths';
import { boardRoot } from './board-root.util';

/**
 * The caller's slot: the record number in every Conf.DB (express.e:4835
 * `(account-1)*SIZEOF confBase`). 0 when the account has none - express.e
 * then holds no pointers at all (4887-4891).
 */
async function slotOf(userId: string): Promise<number> {
  try {
    const user = await db.getUserById(userId);
    const slot = Number(user?.slotNumber) || 0;
    return slot > 0 ? slot : 0;
  } catch {
    return 0;
  }
}

/** express.e:4882-4914 loadMsgPointers' view of a record. */
function confBaseFromRecord(
  userId: string, conferenceId: number, messageBaseId: number, rec: ConfBaseRecord,
): ConfBase {
  return {
    userId,
    conferenceId,
    messageBaseId,
    lastNewReadConf: rec.confRead,
    lastMsgReadConf: rec.confYM,
    scanFlags: scanFlagsOf(rec),
    messagesPosted: rec.messagesPosted,
    // express.e's getSystemTime() form on disk (express.e:4911); 0 is never.
    newSinceDate: decodeAmigaDate(rec.newSinceDate) ?? new Date(0),
    bytesDownload: Number(accountedBytes(rec.bytesDownload, rec.downloadBytesBCD)),
    bytesUpload: Number(accountedBytes(rec.bytesUpload, rec.uploadBytesBCD)),
    upload: rec.upload & 0xffff,
    downloads: rec.downloads & 0xffff,
  };
}

/**
 * Mirror a record's pointer fields into `conf_base`, which the admin and a
 * few sysop screens still read. Never read back by the board. A mirror that
 * cannot be written costs nothing the caller sees, so it never throws.
 */
function mirrorToSql(confBase: ConfBase): void {
  try {
    getSqliteDb().prepare(
      `INSERT INTO conf_base (
        user_id, conference_id, message_base_id,
        last_new_read_conf, last_msg_read_conf, scan_flags,
        messages_posted, new_since_date,
        bytes_download, bytes_upload, upload, downloads
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, conference_id, message_base_id) DO UPDATE SET
        last_new_read_conf = excluded.last_new_read_conf,
        last_msg_read_conf = excluded.last_msg_read_conf,
        scan_flags = excluded.scan_flags,
        messages_posted = excluded.messages_posted,
        new_since_date = excluded.new_since_date,
        bytes_download = excluded.bytes_download,
        bytes_upload = excluded.bytes_upload,
        upload = excluded.upload,
        downloads = excluded.downloads`
    ).run(
      confBase.userId, confBase.conferenceId, confBase.messageBaseId,
      confBase.lastNewReadConf, confBase.lastMsgReadConf, confBase.scanFlags,
      confBase.messagesPosted, Math.floor(confBase.newSinceDate.getTime() / 1000),
      confBase.bytesDownload, confBase.bytesUpload, confBase.upload, confBase.downloads,
    );
  } catch (e) {
    if (process.env.NODE_ENV !== 'test') console.warn('[message-pointers] conf_base mirror failed:', e);
  }
}

function getSqliteDb(): any {
  const sqlite = (db as any).db;
  if (!sqlite) {
    throw new Error('Database not initialized');
  }
  return sqlite;
}

/** axconsts.e:45-47 - the scan bits of confBase.handle[0]. */
const ZOOM_SCAN_MASK = 2;
const MAIL_SCAN_MASK = 4;
const FILE_SCAN_MASK = 8;

/**
 * The scan flags a caller's pointers for this conference start with
 * (express.e:8616-8621 clearMsgPointers): mail scan with DEFAULT_NEWSCAN,
 * file scan with DEFAULT_NEW_FILES, Zoom with DEFAULT_ZOOM, and nothing
 * else. The port started every new pointer at 0 whatever the icon said.
 */
export function defaultScanFlags(confNumber: number): number {
  const flags: Partial<ReturnType<typeof getConferenceToolFlags>> = getConferenceToolFlags(confNumber) ?? {};
  return (flags.defaultNewscan ? MAIL_SCAN_MASK : 0)
    | (flags.defaultNewFiles ? FILE_SCAN_MASK : 0)
    | (flags.defaultZoom ? ZOOM_SCAN_MASK : 0);
}

/**
 * The scan masks of the caller's record for this conference: handle[0] of
 * his Conf.DB record (express.e:572-591 reads `cb.handle[0]`). A caller
 * without a slot gets the conference's defaults (8616-8621).
 */
export async function getConferenceScanFlags(
  userId: string,
  conferenceId: number,
  _messageBaseId: number
): Promise<number> {
  const slot = await slotOf(userId);
  if (!slot) return defaultScanFlags(conferenceId);
  return scanFlagsOf(messagePointerFileManager.readRecordOrZero(conferenceId, slot));
}

/**
 * CF's write (express.e:24780 / 24789 / 24812 OR, AND NOT, Eor handle[0]): the
 * caller's own record, then the mirror. Returns the flags now on disk.
 */
export async function setConferenceScanFlags(
  userId: string,
  conferenceId: number,
  messageBaseId: number,
  change: (flags: number) => number,
): Promise<number> {
  const slot = await slotOf(userId);
  if (!slot) return defaultScanFlags(conferenceId);
  const rec = messagePointerFileManager.readRecordOrZero(conferenceId, slot);
  const flags = change(scanFlagsOf(rec)) & 0xff;
  messagePointerFileManager.patchRecord(conferenceId, slot, { handle: withScanFlags(rec, flags) });
  const after = { ...rec, handle: withScanFlags(rec, flags) };
  mirrorToSql(confBaseFromRecord(userId, conferenceId, messageBaseId, after));
  return flags;
}

/**
 * getMailStatFile (express.e:8672-8707): the conference's MailStats FILE.
 *
 * The board writes MailStats on disk as it saves and deletes messages
 * (MessageIndexManager), and express.e reads that file. This read a
 * `mail_stats` DB table instead, which nothing kept current: on live it said
 * highMsgNum 1 for conferences holding hundreds of messages, so every join's
 * validatePointers rewound the caller's pointer to the lowest message and
 * all EALL mail was offered again at every login (sysop, 2026-09-30).
 *
 * `messageBaseId` is kept for the callers; the file is per conference until
 * per-base message locations exist.
 */
export async function getMailStatFile(
  conferenceId: number,
  _messageBaseId: number
): Promise<MailStat> {
  const stats = messageIndexManager.readMailStats(conferenceId);
  if (!stats) return { ...DEFAULT_MAIL_STAT };
  return { lowestKey: stats.lowestKey, highMsgNum: stats.highMsgNum, lowestNotDel: stats.lowestNotDel };
}

/**
 * express.e:30121-30122 clearMsgPointers() + masterSavePointers(loggedOnUser)
 * for a new account: in every conference's Conf.DB his slot starts with no
 * pointers, no accounting, and the scans the conference's icon names
 * (8594-8624: DEFAULT_NEWSCAN, DEFAULT_NEW_FILES, DEFAULT_ZOOM into
 * handle[0]). The rest of handle - the vote bits - starts clear too, so a
 * reused slot does not inherit a deleted caller's votes.
 */
export async function clearMsgPointers(userId: string): Promise<void> {
  const slot = await slotOf(userId);
  if (!slot) return;
  for (const conf of conferenceNumbers(boardRoot())) {
    const handle = Buffer.alloc(16);
    handle[0] = defaultScanFlags(conf);
    messagePointerFileManager.patchRecord(conf, slot, {
      handle,
      bytesDownload: 0, bytesUpload: 0,
      downloadBytesBCD: Buffer.alloc(8), uploadBytesBCD: Buffer.alloc(8),
      upload: 0, downloads: 0, ratioType: 0, ratio: 0,
      messagesPosted: 0, uploadTracking: 0, unused: 0,
      confYM: 0, confRead: 0,
    });
  }
}

/**
 * express.e:4882-4914 loadMsgPointers: the caller's record in the
 * conference's Conf.DB (loadConfDB 4819, filled at logon by
 * masterLoadPointers 8583). Whatever wrote it last - this board, a door's
 * SAVE_CONFDB, an AmiExpress tool, the sysop's editor - is what the join
 * sees. A caller without a slot has no pointers (4887-4891).
 */
export async function loadMsgPointers(
  userId: string,
  conferenceId: number,
  messageBaseId: number
): Promise<ConfBase> {
  const slot = await slotOf(userId);
  if (!slot) {
    return {
      userId, conferenceId, messageBaseId,
      lastNewReadConf: 0, lastMsgReadConf: 0,
      scanFlags: defaultScanFlags(conferenceId),
      messagesPosted: 0, newSinceDate: getSystemTime(),
      bytesDownload: 0, bytesUpload: 0, upload: 0, downloads: 0,
    };
  }
  return confBaseFromRecord(
    userId, conferenceId, messageBaseId,
    messagePointerFileManager.readRecordOrZero(conferenceId, slot),
  );
}

/**
 * express.e:4916-4973 saveMsgPointers: the pointers, scan flags,
 * messagesPosted and newSinceDate go into the caller's Conf.DB record
 * (`cb.confYM:=lastMsgReadConf`, `cb.confRead:=lastNewReadConf` 4971-4972),
 * then the `conf_base` mirror.
 *
 * The upload / download / ratio fields are NOT written from here. express.e
 * copies them from loggedOnUser (4929-4939) because under conference
 * accounting it swaps the account's live counters per conference; the port
 * keeps the account's totals whole and books each transfer straight into
 * the record (MessagePointerFileManager.addDownload / addUpload), so a
 * pointer save carrying a stale copy must not overwrite them.
 */
export async function saveMsgPointers(confBase: ConfBase): Promise<void> {
  // Validate pointers (express.e:4933-4945)
  if (confBase.lastMsgReadConf === 0) {
console.warn(`saveMsgPointers: lastMsgReadConf is 0 for conf ${confBase.conferenceId}`);
  }
  if (confBase.lastNewReadConf === 0) {
console.warn(`saveMsgPointers: lastNewReadConf is 0 for conf ${confBase.conferenceId}`);
  }

  const slot = await slotOf(confBase.userId);
  if (!slot) return; // express.e:4921-4925
  const rec = messagePointerFileManager.readRecordOrZero(confBase.conferenceId, slot);
  messagePointerFileManager.patchRecord(confBase.conferenceId, slot, {
    confRead: confBase.lastNewReadConf | 0,
    confYM: confBase.lastMsgReadConf | 0,
    handle: withScanFlags(rec, confBase.scanFlags),
    messagesPosted: confBase.messagesPosted & 0xffff,
    newSinceDate: encodeAmigaDate(confBase.newSinceDate) | 0,
  });
  mirrorToSql(confBaseFromRecord(
    confBase.userId, confBase.conferenceId, confBase.messageBaseId,
    messagePointerFileManager.readRecordOrZero(confBase.conferenceId, slot),
  ));
}

/**
 * Validate message pointers against boundaries
 * Based on express.e joinConf() validation - lines 5037-5049
 *
 * Ensures pointers are within valid message ranges:
 * - Lower bound: >= lowestNotDel
 * - Upper bound: <= highMsgNum
 *
 * @param confBase - ConfBase to validate
 * @param mailStat - MailStat with boundaries
 * @returns Validated ConfBase
 */
export function validatePointers(confBase: ConfBase, mailStat: MailStat): ConfBase {
  let lastMsgReadConf = confBase.lastMsgReadConf;
  let lastNewReadConf = confBase.lastNewReadConf;

  // Lower bound validation (express.e:5037-5038)
  if (lastMsgReadConf < mailStat.lowestNotDel) {
    lastMsgReadConf = mailStat.lowestNotDel;
  }
  if (lastNewReadConf < mailStat.lowestNotDel) {
    lastNewReadConf = mailStat.lowestNotDel;
  }

  // Upper bound validation (express.e:5040-5049, searchNewMail:11666)
  if (lastMsgReadConf > mailStat.highMsgNum) {
console.error(
      `validatePointers: lastMsgReadConf ${lastMsgReadConf} > highMsgNum ${mailStat.highMsgNum}`
    );
    lastMsgReadConf = mailStat.lowestKey;
  }
  if (lastNewReadConf > mailStat.highMsgNum) {
console.error(
      `validatePointers: lastNewReadConf ${lastNewReadConf} > highMsgNum ${mailStat.highMsgNum}`
    );
    lastNewReadConf = mailStat.lowestKey;
  }

  return {
    ...confBase,
    lastMsgReadConf,
    lastNewReadConf
  };
}

/**
 * Check if user has new messages in a conference
 *
 * @param userId - User ID
 * @param conferenceId - Conference ID
 * @param messageBaseId - Message base ID
 * @returns true if new messages exist
 */
export async function hasNewMessages(
  userId: string,
  conferenceId: number,
  messageBaseId: number
): Promise<boolean> {
  const mailStat = await getMailStatFile(conferenceId, messageBaseId);
  const confBase = await loadMsgPointers(userId, conferenceId, messageBaseId);

  // New messages exist if lastNewReadConf < highMsgNum
  return confBase.lastNewReadConf < mailStat.highMsgNum;
}

/**
 * Move lastMsgReadConf forward after R reads a message - express.e:26725
 * `lastMsgReadConf:=msgNum` then saveMsgPointers, i.e. `cb.confYM` in the
 * caller's record (4971). Never moves it back.
 */
export async function updateReadPointer(
  userId: string,
  conferenceId: number,
  messageBaseId: number,
  msgNum: number
): Promise<void> {
  const cb = await loadMsgPointers(userId, conferenceId, messageBaseId);
  if (msgNum <= cb.lastMsgReadConf) return;
  cb.lastMsgReadConf = msgNum;
  await saveMsgPointers(cb);
}

/**
 * Set lastNewReadConf after a scan - `cb.confRead:=lastNewReadConf`
 * (express.e:4972) in the caller's record.
 */
export async function updateScanPointer(
  userId: string,
  conferenceId: number,
  messageBaseId: number,
  msgNum: number
): Promise<void> {
  const cb = await loadMsgPointers(userId, conferenceId, messageBaseId);
  cb.lastNewReadConf = msgNum;
  await saveMsgPointers(cb);
}
