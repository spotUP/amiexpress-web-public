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
  const client = await db.pool.connect();
  try {
    const result = await client.query(
      `SELECT lowest_key, high_msg_num, lowest_not_del
       FROM mail_stats
       WHERE conference_id = $1 AND message_base_id = $2`,
      [conferenceId, messageBaseId]
    );

    if (result.rows.length === 0) {
      // Create default mail stats (express.e:8689-8693)
      await client.query(
        `INSERT INTO mail_stats (conference_id, message_base_id, lowest_key, high_msg_num, lowest_not_del)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (conference_id, message_base_id) DO NOTHING`,
        [conferenceId, messageBaseId, DEFAULT_MAIL_STAT.lowestKey, DEFAULT_MAIL_STAT.highMsgNum, DEFAULT_MAIL_STAT.lowestNotDel]
      );

      return { ...DEFAULT_MAIL_STAT };
    }

    return {
      lowestKey: result.rows[0].lowest_key,
      highMsgNum: result.rows[0].high_msg_num,
      lowestNotDel: result.rows[0].lowest_not_del
    };
  } finally {
    client.release();
  }
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
  await db.pool.query(
    `UPDATE mail_stats
     SET high_msg_num = $3
     WHERE conference_id = $1 AND message_base_id = $2`,
    [conferenceId, messageBaseId, newHighMsgNum]
  );
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
  const client = await db.pool.connect();
  try {
    const result = await client.query(
      `SELECT * FROM conf_base
       WHERE user_id = $1 AND conference_id = $2 AND message_base_id = $3`,
      [userId, conferenceId, messageBaseId]
    );

    if (result.rows.length === 0) {
      // Create default conf_base record
      const defaultConfBase: ConfBase = {
        userId,
        conferenceId,
        messageBaseId,
        lastNewReadConf: 0,
        lastMsgReadConf: 0,
        scanFlags: DEFAULT_SCAN_FLAGS,
        messagesPosted: 0,
        newSinceDate: new Date(),
        bytesDownload: 0,
        bytesUpload: 0,
        upload: 0,
        downloads: 0
      };

      await client.query(
        `INSERT INTO conf_base (
          user_id, conference_id, message_base_id,
          last_new_read_conf, last_msg_read_conf, scan_flags,
          messages_posted, new_since_date,
          bytes_download, bytes_upload, upload, downloads
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (user_id, conference_id, message_base_id) DO NOTHING`,
        [
          userId, conferenceId, messageBaseId,
          0, 0, DEFAULT_SCAN_FLAGS,
          0, new Date(),
          0, 0, 0, 0
        ]
      );

      return defaultConfBase;
    }

    const row = result.rows[0];
    return {
      userId: row.user_id,
      conferenceId: row.conference_id,
      messageBaseId: row.message_base_id,
      lastNewReadConf: row.last_new_read_conf,
      lastMsgReadConf: row.last_msg_read_conf,
      scanFlags: row.scan_flags,
      messagesPosted: row.messages_posted,
      newSinceDate: new Date(row.new_since_date),
      bytesDownload: parseInt(row.bytes_download),
      bytesUpload: parseInt(row.bytes_upload),
      upload: row.upload,
      downloads: row.downloads
    };
  } finally {
    client.release();
  }
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

  await db.pool.query(
    `UPDATE conf_base SET
      last_new_read_conf = $4,
      last_msg_read_conf = $5,
      scan_flags = $6,
      messages_posted = $7,
      new_since_date = $8,
      bytes_download = $9,
      bytes_upload = $10,
      upload = $11,
      downloads = $12
     WHERE user_id = $1 AND conference_id = $2 AND message_base_id = $3`,
    [
      confBase.userId,
      confBase.conferenceId,
      confBase.messageBaseId,
      confBase.lastNewReadConf,
      confBase.lastMsgReadConf,
      confBase.scanFlags,
      confBase.messagesPosted,
      confBase.newSinceDate,
      confBase.bytesDownload,
      confBase.bytesUpload,
      confBase.upload,
      confBase.downloads
    ]
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
  await db.pool.query(
    `UPDATE conf_base
     SET last_msg_read_conf = $4
     WHERE user_id = $1 AND conference_id = $2 AND message_base_id = $3
       AND last_msg_read_conf < $4`,
    [userId, conferenceId, messageBaseId, msgNum]
  );
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
  await db.pool.query(
    `UPDATE conf_base
     SET last_new_read_conf = $4
     WHERE user_id = $1 AND conference_id = $2 AND message_base_id = $3`,
    [userId, conferenceId, messageBaseId, msgNum]
  );
}
