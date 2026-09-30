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
import { getSystemTime } from '../utils/date-time.util';
import { messagePointerFileManager } from '../services/MessagePointerFileManager';
import { messageIndexManager } from '../services/MessageIndexManager';

/**
 * Best-effort sync of confBase pointer fields to `<conf>/Conf.DB` so 68K doors
 * that call `loadMsgPointers` see fresh data. Looks up the user's slot from
 * the user repo (Amiga side indexes by slotNumber - 1). Failures are logged
 * but never thrown — the SQL upsert is the system of record; disk is a mirror.
 */
async function syncConfDbBestEffort(
  userId: string,
  conferenceId: number,
  field: 'confRead' | 'confYM',
  value: number,
): Promise<void> {
  try {
    const user = await db.getUserById(userId);
    const slot = user?.slotNumber;
    if (!slot || slot < 1) return;
    if (field === 'confRead') {
      messagePointerFileManager.updateScanPointer(conferenceId, slot, value);
    } else {
      messagePointerFileManager.updateReadPointer(conferenceId, slot, value);
    }
  } catch (e) {
    // Best-effort — SQL is authoritative. Log if not suppressed.
    if (process.env.NODE_ENV !== 'test' && process.env.SUPPRESS_CONF_DB_ERRORS !== '1') {
      console.error('[message-pointers] Conf.DB sync failed:', e);
    }
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
 * Get scanFlags for a user/conference/msgbase (MAIL/FILE/ZOOM bits).
 */
export async function getConferenceScanFlags(
  userId: string,
  conferenceId: number,
  messageBaseId: number
): Promise<number> {
  const sqlite = getSqliteDb();
  const stmt = sqlite.prepare(
    `SELECT scan_flags FROM conf_base WHERE user_id = ? AND conference_id = ? AND message_base_id = ?`
  );
  const row = stmt.get(userId, conferenceId, messageBaseId);
  // No row: the conference's own defaults (express.e:8616-8621).
  return row ? (row.scan_flags ?? defaultScanFlags(conferenceId)) : defaultScanFlags(conferenceId);
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
 * Load message pointers from conf_base into session
 * Based on express.e loadMsgPointers() - lines 4882-4914
 *
 * Loads:
 * - lastNewReadConf: Last message auto-scanned
 * - lastMsgReadConf: Last message manually read
 * - scan flags and other conference data
 *
 * @param userId - User ID
 * @param conferenceId - Conference ID
 * @param messageBaseId - Message base ID
 * @returns ConfBase or defaults if not found
 */
export async function loadMsgPointers(
  userId: string,
  conferenceId: number,
  messageBaseId: number
): Promise<ConfBase> {
  const sqlite = getSqliteDb();
  const select = sqlite.prepare(
    `SELECT * FROM conf_base
     WHERE user_id = ? AND conference_id = ? AND message_base_id = ?`
  );
  const row = select.get(userId, conferenceId, messageBaseId);

  if (!row) {
    const defaultConfBase: ConfBase = {
      userId,
      conferenceId,
      messageBaseId,
      lastNewReadConf: 0,
      lastMsgReadConf: 0,
      scanFlags: defaultScanFlags(conferenceId),
      messagesPosted: 0,
      newSinceDate: getSystemTime(),
      bytesDownload: 0,
      bytesUpload: 0,
      upload: 0,
      downloads: 0
    };

    const insert = sqlite.prepare(
      `INSERT INTO conf_base (
        user_id, conference_id, message_base_id,
        last_new_read_conf, last_msg_read_conf, scan_flags,
        messages_posted, new_since_date,
        bytes_download, bytes_upload, upload, downloads
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    try {
      insert.run(
        userId, conferenceId, messageBaseId,
        0, 0, defaultScanFlags(conferenceId),
        0, Math.floor(Date.now() / 1000),
        0, 0, 0, 0
      );
    } catch {
      // ignore conflict
    }

    return defaultConfBase;
  }

  return {
    userId: row.user_id,
    conferenceId: row.conference_id,
    messageBaseId: row.message_base_id,
    lastNewReadConf: row.last_new_read_conf,
    lastMsgReadConf: row.last_msg_read_conf,
    scanFlags: row.scan_flags,
    messagesPosted: row.messages_posted,
    newSinceDate: new Date((row.new_since_date || 0) * 1000),
    bytesDownload: parseInt(row.bytes_download),
    bytesUpload: parseInt(row.bytes_upload),
    upload: row.upload,
    downloads: row.downloads
  };
}

/**
 * Save message pointers from session back to conf_base
 * Based on express.e saveMsgPointers() - lines 4916-4973
 *
 * Updates:
 * - lastNewReadConf: Last message auto-scanned
 * - lastMsgReadConf: Last message manually read
 * - messagesPosted count
 * - bytes uploaded/downloaded
 *
 * @param confBase - ConfBase data to save
 */
export async function saveMsgPointers(confBase: ConfBase): Promise<void> {
  // Validate pointers (express.e:4933-4945)
  if (confBase.lastMsgReadConf === 0) {
console.warn(`saveMsgPointers: lastMsgReadConf is 0 for conf ${confBase.conferenceId}`);
  }
  if (confBase.lastNewReadConf === 0) {
console.warn(`saveMsgPointers: lastNewReadConf is 0 for conf ${confBase.conferenceId}`);
  }

  const sqlite = getSqliteDb();
  const stmt = sqlite.prepare(
    `UPDATE conf_base SET
      last_new_read_conf = ?,
      last_msg_read_conf = ?,
      scan_flags = ?,
      messages_posted = ?,
      new_since_date = ?,
      bytes_download = ?,
      bytes_upload = ?,
      upload = ?,
      downloads = ?
     WHERE user_id = ? AND conference_id = ? AND message_base_id = ?`
  );
  stmt.run(
    confBase.lastNewReadConf,
    confBase.lastMsgReadConf,
    confBase.scanFlags,
    confBase.messagesPosted,
    Math.floor(confBase.newSinceDate.getTime() / 1000),
    confBase.bytesDownload,
    confBase.bytesUpload,
    confBase.upload,
    confBase.downloads,
    confBase.userId,
    confBase.conferenceId,
    confBase.messageBaseId
  );
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
 * Update lastMsgReadConf pointer after reading a message
 * Called by R command after user reads a message
 *
 * @param userId - User ID
 * @param conferenceId - Conference ID
 * @param messageBaseId - Message base ID
 * @param msgNum - Message number just read
 */
export async function updateReadPointer(
  userId: string,
  conferenceId: number,
  messageBaseId: number,
  msgNum: number
): Promise<void> {
  const sqlite = getSqliteDb();
  const stmt = sqlite.prepare(
    `INSERT INTO conf_base (user_id, conference_id, message_base_id, last_msg_read_conf, scan_flags)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, conference_id, message_base_id)
     DO UPDATE SET last_msg_read_conf = MAX(last_msg_read_conf, excluded.last_msg_read_conf)`
  );
  stmt.run(userId, conferenceId, messageBaseId, msgNum, defaultScanFlags(conferenceId));

  // express.e:4971 — saveMsgPointers writes `cb.confYM := lastMsgReadConf`
  // to <conf>/Conf.DB at (slot-1)*74. Mirror that here so doors that call
  // loadMsgPointers see the updated pointer.
  await syncConfDbBestEffort(userId, conferenceId, 'confYM', msgNum);
}

/**
 * Update lastNewReadConf pointer after scanning messages
 * Called after conference scan completes
 *
 * @param userId - User ID
 * @param conferenceId - Conference ID
 * @param messageBaseId - Message base ID
 * @param msgNum - Last message scanned
 */
export async function updateScanPointer(
  userId: string,
  conferenceId: number,
  messageBaseId: number,
  msgNum: number
): Promise<void> {
  const sqlite = getSqliteDb();
  const stmt = sqlite.prepare(
    `INSERT INTO conf_base (user_id, conference_id, message_base_id, last_new_read_conf, scan_flags)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, conference_id, message_base_id)
     DO UPDATE SET last_new_read_conf = excluded.last_new_read_conf`
  );
  stmt.run(userId, conferenceId, messageBaseId, msgNum, defaultScanFlags(conferenceId));

  // express.e:4972 — saveMsgPointers writes `cb.confRead := lastNewReadConf`.
  await syncConfDbBestEffort(userId, conferenceId, 'confRead', msgNum);
}
