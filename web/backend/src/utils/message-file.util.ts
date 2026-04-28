/**
 * Message File Utilities
 * 1:1 port from AmiExpress express.e message storage
 *
 * Messages are stored as plain text files in Conf{N}/Messages/{messageId}.msg
 * MailStats binary file tracks message IDs in Conf{N}/Messages/MailStats
 */

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { getConferenceDir } from './file-hold.util';

/**
 * MailStats structure (express.e:8672-8707)
 * Binary file tracking message numbers
 */
export interface MailStats {
  lowestKey: number;      // Lowest message ID ever used
  lowestNotDel: number;   // Lowest non-deleted message ID
  highMsgNum: number;     // Highest message number (next ID to use)
}

/**
 * Message structure for .msg files
 */
export interface MessageFile {
  from: string;           // Sender username
  to: string;             // Recipient username or 'ALL'
  subject: string;        // Message subject
  date: string;           // Date timestamp (format: DD-MMM-YY HH:MM:SS)
  msgNum: number;         // Message number (ID)
  body: string;           // Message body (plain text, newline separated)
  isPrivate?: boolean;    // Private message flag (not in file, derived from to != 'ALL')
  receivedAt?: Date;      // express.e:8915-8926 - When recipient read the message (mailHeader.recv)
}

/**
 * Get path to Messages directory for conference
 * Express.e:8676 - getMsgBaseLocation()
 */
export function getMessagesDir(confNum: number, bbsDataPath: string): string {
  const confPath = getConferenceDir(confNum, bbsDataPath);
  return path.join(confPath, 'Messages');
}

/**
 * Get path to MailStats file
 * Express.e:8677 - StrAdd(string,'MailStats')
 */
export function getMailStatsPath(confNum: number, bbsDataPath: string): string {
  const messagesDir = getMessagesDir(confNum, bbsDataPath);
  return path.join(messagesDir, 'MailStats');
}

/**
 * Read MailStats file (binary format)
 * Express.e:8672-8707 - getMailStatFile()
 */
export async function readMailStats(confNum: number, bbsDataPath: string): Promise<MailStats> {
  const mailStatsPath = getMailStatsPath(confNum, bbsDataPath);

  let buffer: Buffer;
  try {
    buffer = await fs.readFile(mailStatsPath);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      // File doesn't exist - create default (express.e:8691-8693).
      const defaultStats: MailStats = {
        lowestKey: 1,
        lowestNotDel: 0,
        highMsgNum: 1,
      };
      await writeMailStats(confNum, bbsDataPath, defaultStats);
      return defaultStats;
    }
    throw error;
  }

  // Binary format per axobjects.e mailStat OBJECT:
  //   offset  0: lowestKey    LONG (4 bytes, BE)
  //   offset  4: highMsgNum   LONG (4 bytes, BE)
  //   offset  8: lowestNotDel LONG (4 bytes, BE)
  //   offset 12: pad[6]       ARRAY OF CHAR (6 bytes)
  //   total: 18 bytes
  //
  // Historically some MailStats files were created in an older 2-int32 (8-byte)
  // format or left zeroed by stale init paths. Rather than throwing and
  // blocking every message post in the conference, treat an undersized file
  // as equivalent to missing: log a warning, rebuild with defaults, continue.
  // New posts then get a fresh high-water message ID from 1.
  if (buffer.length < 12) {
console.warn(
      `[MailStats] ${mailStatsPath} is ${buffer.length} bytes (expected >=18). ` +
      `Treating as corrupted and rebuilding with defaults.`
    );
    const defaultStats: MailStats = {
      lowestKey: 1,
      lowestNotDel: 0,
      highMsgNum: 1,
    };
    await writeMailStats(confNum, bbsDataPath, defaultStats);
    return defaultStats;
  }

  return {
    lowestKey: buffer.readInt32BE(0),
    highMsgNum: buffer.readInt32BE(4),
    lowestNotDel: buffer.readInt32BE(8),
  };
}

/**
 * Write MailStats file (binary format)
 * Express.e:8694 - Write(fd,mailStat,SIZEOF mailStat)
 */
export async function writeMailStats(
  confNum: number,
  bbsDataPath: string,
  stats: MailStats
): Promise<void> {
  const mailStatsPath = getMailStatsPath(confNum, bbsDataPath);
  const messagesDir = getMessagesDir(confNum, bbsDataPath);

  // Ensure Messages directory exists
  await fs.mkdir(messagesDir, { recursive: true });

  // Write binary format per axobjects.e mailStat OBJECT:
  //   offset  0: lowestKey    LONG (4 bytes, BE)
  //   offset  4: highMsgNum   LONG (4 bytes, BE)
  //   offset  8: lowestNotDel LONG (4 bytes, BE)
  //   offset 12: pad[6]       ARRAY OF CHAR (6 bytes, zeroed)
  //   total: 18 bytes
  const buffer = Buffer.alloc(18, 0);
  buffer.writeInt32BE(stats.lowestKey, 0);
  buffer.writeInt32BE(stats.highMsgNum, 4);
  buffer.writeInt32BE(stats.lowestNotDel, 8);
  // bytes 12-17 are pad[6], left as zero

  await fs.writeFile(mailStatsPath, buffer);
console.log(`[MailStats] Conf${confNum}: low=${stats.lowestNotDel} high=${stats.highMsgNum}`);
}

/**
 * Get next message ID and increment highMsgNum
 * Express.e behavior - messages use incremental IDs
 */
export async function getNextMessageId(confNum: number, bbsDataPath: string): Promise<number> {
  const stats = await readMailStats(confNum, bbsDataPath);
  const nextId = stats.highMsgNum;

  // Increment for next message
  stats.highMsgNum = nextId + 1;
  await writeMailStats(confNum, bbsDataPath, stats);

  return nextId;
}

/**
 * Format date for message file
 * Express.e:8894-8895 - formatLongDateTime(timeVar,date)
 * Format: "DD-MMM-YY HH:MM:SS" (e.g., "05-Dec-25 14:32:10")
 */
export function formatMessageDate(date: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const day = String(date.getDate()).padStart(2, '0');
  const month = months[date.getMonth()];
  const year = String(date.getFullYear()).slice(-2);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
}

/**
 * Write message to disk as .msg file
 * Express.e:8953 - StringF(tempStr,'\s\d',msgBaseLocation,mailHeader.msgNumb)
 *
 * File format:
 * Line 1: from username
 * Line 2: to username
 * Line 3: subject
 * Line 4: date (DD-MMM-YY HH:MM:SS)
 * Line 5: message number
 * Line 6+: message body
 */
export async function writeMessageFile(
  confNum: number,
  msgBaseNum: number,
  message: Omit<MessageFile, 'msgNum'>,
  bbsDataPath: string
): Promise<number> {
  // Get next message ID
  const msgNum = await getNextMessageId(confNum, bbsDataPath);

  // Build message file path
  const messagesDir = getMessagesDir(confNum, bbsDataPath);
  const msgFilePath = path.join(messagesDir, `${msgNum}.msg`);

  // Ensure Messages directory exists
  await fs.mkdir(messagesDir, { recursive: true });

  // Format message file content
  const lines = [
    message.from,
    message.to,
    message.subject,
    message.date,
    String(msgNum),
    message.body
  ];

  const content = lines.join('\n');

  // Write atomically (write to temp file, then rename)
  const tempPath = msgFilePath + '.tmp';
  try {
    await fs.writeFile(tempPath, content, 'utf-8');
    await fs.rename(tempPath, msgFilePath);

console.log(`[Message] Wrote Conf${confNum} message ${msgNum}: ${message.subject}`);
    return msgNum;
  } catch (error: any) {
    // Clean up temp file on error
    try {
      await fs.unlink(tempPath);
    } catch {}
    throw error;
  }
}

/**
 * Read message from disk
 * Express.e:8953-8962 - displayFile(tempStr,...)
 */
export async function readMessageFile(
  confNum: number,
  msgNum: number,
  bbsDataPath: string
): Promise<MessageFile | null> {
  const messagesDir = getMessagesDir(confNum, bbsDataPath);
  const msgFilePath = path.join(messagesDir, `${msgNum}.msg`);

  try {
    const content = await fs.readFile(msgFilePath, 'utf-8');
    const lines = content.split('\n');

    if (lines.length < 6) {
console.error(`[Message] Invalid format in ${msgFilePath}`);
      return null;
    }

    // Read received timestamp from companion file (express.e:8915-8926 mailHeader.recv)
    const recvPath = path.join(messagesDir, `${msgNum}.recv`);
    let receivedAt: Date | undefined;
    try {
      const recvContent = await fs.readFile(recvPath, 'utf-8');
      const timestamp = parseInt(recvContent.trim(), 10);
      if (!isNaN(timestamp) && timestamp > 0) {
        receivedAt = new Date(timestamp);
      }
    } catch {
      // No .recv file means not yet received - that's fine
    }

    return {
      from: lines[0],
      to: lines[1],
      subject: lines[2],
      date: lines[3],
      msgNum: parseInt(lines[4]),
      body: lines.slice(5).join('\n'),
      isPrivate: lines[1].toUpperCase() !== 'ALL',
      receivedAt
    };
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return null;  // Message doesn't exist
    }
    throw error;
  }
}

/**
 * Mark message as received (express.e:8943-8949)
 * Creates companion file {msgNum}.recv with timestamp
 */
export async function markMessageReceived(
  confNum: number,
  msgNum: number,
  bbsDataPath: string
): Promise<void> {
  const messagesDir = getMessagesDir(confNum, bbsDataPath);
  const recvPath = path.join(messagesDir, `${msgNum}.recv`);
  const timestamp = Date.now();
  await fs.writeFile(recvPath, timestamp.toString(), 'utf-8');
}

/**
 * Unmark message as received — express.e:11126 mailHeader.recv:=0; saveOverHeader(gfh)
 * Deletes companion .recv file so confScan treats the message as unread again.
 * Called by K (Keep) command.
 */
export async function unmarkMessageReceived(
  confNum: number,
  msgNum: number,
  bbsDataPath: string
): Promise<void> {
  const messagesDir = getMessagesDir(confNum, bbsDataPath);
  const recvPath = path.join(messagesDir, `${msgNum}.recv`);
  try {
    await fs.unlink(recvPath);
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
    // File didn't exist — recv was already 0, nothing to do
  }
}

/**
 * Check if message has been received
 */
export async function isMessageReceived(
  confNum: number,
  msgNum: number,
  bbsDataPath: string
): Promise<boolean> {
  const messagesDir = getMessagesDir(confNum, bbsDataPath);
  const recvPath = path.join(messagesDir, `${msgNum}.recv`);
  try {
    await fs.access(recvPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if message file exists
 */
export function messageFileExists(
  confNum: number,
  msgNum: number,
  bbsDataPath: string
): boolean {
  const messagesDir = getMessagesDir(confNum, bbsDataPath);
  const msgFilePath = path.join(messagesDir, `${msgNum}.msg`);
  return fsSync.existsSync(msgFilePath);
}

/**
 * Delete message (mark as deleted by renaming)
 * Express.e uses 'D' status in header, we can rename file to .deleted
 */
export async function deleteMessageFile(
  confNum: number,
  msgNum: number,
  bbsDataPath: string
): Promise<void> {
  const messagesDir = getMessagesDir(confNum, bbsDataPath);
  const msgFilePath = path.join(messagesDir, `${msgNum}.msg`);
  const deletedPath = path.join(messagesDir, `${msgNum}.msg.deleted`);

  try {
    await fs.rename(msgFilePath, deletedPath);
console.log(`[Message] Deleted Conf${confNum} message ${msgNum}`);
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

/**
 * Get all message IDs in conference (scan Messages directory)
 * Express.e:8845-8876 - listMSGs()
 */
export async function getAllMessageIds(
  confNum: number,
  bbsDataPath: string
): Promise<number[]> {
  const messagesDir = getMessagesDir(confNum, bbsDataPath);

  try {
    const files = await fs.readdir(messagesDir);
    const msgIds: number[] = [];

    for (const file of files) {
      // Match .msg files, ignore .deleted and MailStats
      if (file.endsWith('.msg') && !file.includes('.deleted')) {
        const msgNum = parseInt(path.basename(file, '.msg'));
        if (!isNaN(msgNum)) {
          msgIds.push(msgNum);
        }
      }
    }

    // Sort numerically
    msgIds.sort((a, b) => a - b);
    return msgIds;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return [];  // No messages directory
    }
    throw error;
  }
}
