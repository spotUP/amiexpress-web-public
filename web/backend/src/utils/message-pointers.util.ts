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
import { DEFAULT_MAIL_STAT, DEFAULT_SCAN_FLAGS } from '../types/message-pointers';
import { getSystemTime } from '../utils/date-time.util';

function getSqliteDb(): any {
  const sqlite = (db as any).db;
  if (!sqlite) {
    throw new Error('Database not initialized');
  }
  return sqlite;
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
  // No row = new user/conf: default to scanning enabled (matches express.e DEFAULT_NEWSCAN behaviour)
  return row ? (row.scan_flags ?? DEFAULT_SCAN_FLAGS) : DEFAULT_SCAN_FLAGS;
}

/**
 * Get mail statistics for a conference/message base
 * Based on express.e getMailStatFile() - lines 8672-8707
 *
 * Returns message range boundaries:
 * - lowestKey: Lowest message number (usually 1)
 * - highMsgNum: Next message to be written (exclusive upper bound)
 * - lowestNotDel: Lowest non-deleted message
 *
 * @param conferenceId - Conference ID
 * @param messageBaseId - Message base ID
 * @returns MailStat or default if not found
 */
export async function getMailStatFile(
  conferenceId: number,
  messageBaseId: number
): Promise<MailStat> {
  const sqlite = getSqliteDb();
  const select = sqlite.prepare(
    `SELECT lowest_key, high_msg_num, lowest_not_del
     FROM mail_stats
     WHERE conference_id = ? AND message_base_id = ?`
  );
  const row = select.get(conferenceId, messageBaseId);

  if (!row) {
    const insert = sqlite.prepare(
      `INSERT INTO mail_stats (conference_id, message_base_id, lowest_key, high_msg_num, lowest_not_del)
       VALUES (?, ?, ?, ?, ?)`
    );
    try {
      insert.run(
        conferenceId,
        messageBaseId,
        DEFAULT_MAIL_STAT.lowestKey,
        DEFAULT_MAIL_STAT.highMsgNum,
        DEFAULT_MAIL_STAT.lowestNotDel
      );
    } catch {
      // ignore conflict
    }
    return { ...DEFAULT_MAIL_STAT };
  }

  return {
    lowestKey: row.lowest_key,
    highMsgNum: row.high_msg_num,
    lowestNotDel: row.lowest_not_del
  };
}

/**
 * Update high message number after posting a message
 * Called when a new message is created
 *
 * @param conferenceId - Conference ID
 * @param messageBaseId - Message base ID
 * @param newHighMsgNum - New high message number
 */
export async function updateHighMsgNum(
  conferenceId: number,
  messageBaseId: number,
  newHighMsgNum: number
): Promise<void> {
  const sqlite = getSqliteDb();
  const stmt = sqlite.prepare(
    `UPDATE mail_stats
     SET high_msg_num = ?
     WHERE conference_id = ? AND message_base_id = ?`
  );
  stmt.run(newHighMsgNum, conferenceId, messageBaseId);
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
      scanFlags: DEFAULT_SCAN_FLAGS,
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
        0, 0, DEFAULT_SCAN_FLAGS,
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

  // Upper bound validation (express.e:5040-5049)
  if (lastMsgReadConf > mailStat.highMsgNum) {
console.error(
      `validatePointers: lastMsgReadConf ${lastMsgReadConf} > highMsgNum ${mailStat.highMsgNum}`
    );
    lastMsgReadConf = 0;
  }
  if (lastNewReadConf > mailStat.highMsgNum) {
console.error(
      `validatePointers: lastNewReadConf ${lastNewReadConf} > highMsgNum ${mailStat.highMsgNum}`
    );
    lastNewReadConf = 0;
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
  stmt.run(userId, conferenceId, messageBaseId, msgNum, DEFAULT_SCAN_FLAGS);
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
  stmt.run(userId, conferenceId, messageBaseId, msgNum, DEFAULT_SCAN_FLAGS);
}
