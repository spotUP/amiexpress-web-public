/**
 * Message File Utilities — express.e canonical layout
 *
 * Express.e stores messages at `<msgBaseLocation>/<msgNum>` (no extension):
 *   - msgBaseLocation defaults to `<conf>/MsgBase/` (express.e:2068)
 *   - File body is RAW message lines only (express.e:10700-10703)
 *   - Header metadata (from/to/subj/date/recv/status) lives in HeaderFile struct
 *     managed by MessageIndexManager (axobjects.e mailHeader OBJECT, 110 bytes)
 *   - MailStats counters (lowestKey, highMsgNum, lowestNotDel) live in
 *     `<conf>/MsgBase/MailStats` managed by MessageIndexManager
 *
 * This module composes header (HeaderFile) + body (flat file) into the
 * higher-level MessageFile API expected by callers.
 */

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { getConferenceDir } from './file-hold.util';
import { messageIndexManager, MsgHeader, MsgStatus, MailStat } from '../services/MessageIndexManager';

/**
 * Re-export MailStats type for legacy callers (alias of MailStat without pad).
 * Kept so existing imports from this module still type-check.
 */
export interface MailStats {
  lowestKey: number;
  lowestNotDel: number;
  highMsgNum: number;
}

/**
 * Message structure surfaced to callers (header from HeaderFile + body from
 * <conf>/MsgBase/<msgNum>).
 */
export interface MessageFile {
  from: string;
  to: string;
  subject: string;
  date: string;             // formatted "DD-MMM-YY HH:MM:SS"
  msgNum: number;
  body: string;
  isPrivate?: boolean;
  receivedAt?: Date;        // mh.recv as Date (0 → undefined)
}

/**
 * Get path to the msgBase directory — express.e msgBaseLocation default
 * (express.e:2068 — `<confLocation>/MsgBase/`).
 */
export function getMessagesDir(confNum: number, bbsDataPath: string): string {
  const confPath = getConferenceDir(confNum, bbsDataPath);
  return path.join(confPath, 'MsgBase');
}

/**
 * Get path to MailStats file (managed by MessageIndexManager).
 */
export function getMailStatsPath(confNum: number, bbsDataPath: string): string {
  return path.join(getMessagesDir(confNum, bbsDataPath), 'MailStats');
}

/**
 * Read MailStats — delegates to MessageIndexManager (single source of truth).
 */
export async function readMailStats(confNum: number, _bbsDataPath: string): Promise<MailStats> {
  const stats = messageIndexManager.readMailStats(confNum);
  if (!stats) {
    // express.e:8691-8693 fresh init
    return { lowestKey: 1, highMsgNum: 1, lowestNotDel: 0 };
  }
  return {
    lowestKey: stats.lowestKey,
    highMsgNum: stats.highMsgNum,
    lowestNotDel: stats.lowestNotDel,
  };
}

/**
 * Write MailStats — delegates to MessageIndexManager.
 */
export async function writeMailStats(
  confNum: number,
  _bbsDataPath: string,
  stats: MailStats
): Promise<void> {
  messageIndexManager.writeMailStats(confNum, {
    lowestKey: stats.lowestKey,
    highMsgNum: stats.highMsgNum,
    lowestNotDel: stats.lowestNotDel,
    pad: Buffer.alloc(6, 0),
  });
}

/**
 * Format date for message header — express.e formatLongDateTime
 * Format: "DD-MMM-YY HH:MM:SS" (e.g. "05-Dec-25 14:32:10")
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
 * Get path to a single message body file: <conf>/MsgBase/<msgNum>
 * (express.e:10694 — `StringF(tempStr, '\s\d', msgBaseLocation, mh.msgNumb)`)
 */
function getMessageFilePath(confNum: number, msgNum: number, bbsDataPath: string): string {
  return path.join(getMessagesDir(confNum, bbsDataPath), String(msgNum));
}

/**
 * Allocate next message id and return it. Caller must then write body and
 * append HeaderFile entry; MailStats high gets bumped by appendMessageHeader.
 *
 * Express.e:10688 — `mh.msgNumb := mailStat.highMsgNum` returns the current
 * high as the new id; saveMessageHeader bumps it later.
 */
export async function getNextMessageId(confNum: number, _bbsDataPath: string): Promise<number> {
  return messageIndexManager.getNextMessageNumber(confNum);
}

/**
 * Write a new message: append HeaderFile entry + write raw body file.
 *
 * Body file format (express.e:10700-10703): one line per body line, '\n' (LF).
 * Header metadata (from/to/subj/date) goes ONLY into HeaderFile, never the
 * body file.
 *
 * Returns the assigned msgNumber.
 */
export async function writeMessageFile(
  confNum: number,
  msgBaseNum: number,
  message: Omit<MessageFile, 'msgNum'>,
  bbsDataPath: string
): Promise<number> {
  const msgNum = messageIndexManager.getNextMessageNumber(confNum);
  const dir = getMessagesDir(confNum, bbsDataPath);
  const msgFilePath = getMessageFilePath(confNum, msgNum, bbsDataPath);

  await fs.mkdir(dir, { recursive: true });

  // express.e:10700-10703 — body lines only, no header
  const bodyLines = message.body.split('\n');
  const content = bodyLines.map(l => l + '\n').join('');

  // Atomic write — utf-8 to preserve any non-ASCII chars in the body
  const tempPath = msgFilePath + '.tmp';
  try {
    await fs.writeFile(tempPath, content, 'utf-8');
    await fs.rename(tempPath, msgFilePath);
  } catch (err) {
    try { await fs.unlink(tempPath); } catch {}
    throw err;
  }

  // Build HeaderFile entry — express.e:10790-10794 status: 'P' public,
  // 'p' censored public, 'R' private, 'D' deleted
  const isPrivate = (message.to || '').toUpperCase() !== 'ALL';
  const status: number = isPrivate ? MsgStatus.PRIVATE : MsgStatus.NORMAL;

  // msgDate as Amiga seconds — express.e stores Unix-epoch-equivalent LONG.
  // Parse the formatted date back to a Date and convert to seconds.
  const msgDateSec = parseMessageDateToUnixSec(message.date);

  const header: MsgHeader = {
    status,
    msgNumb: msgNum,
    toName: message.to || 'ALL',
    fromName: message.from,
    subject: message.subject,
    msgDate: msgDateSec,
    recv: 0,                   // unread
    extMsgNum: -1,             // express.e:10689
  };

  // appendMessageHeader bumps highMsgNum by 1 (express.e:12418-12419)
  messageIndexManager.appendMessageHeader(confNum, header);

console.log(`[Message] Wrote Conf${confNum} msg ${msgNum}: ${message.subject}`);
  return msgNum;
}

/**
 * Read a message — combines body file + HeaderFile metadata.
 */
export async function readMessageFile(
  confNum: number,
  msgNum: number,
  bbsDataPath: string
): Promise<MessageFile | null> {
  const msgFilePath = getMessageFilePath(confNum, msgNum, bbsDataPath);

  let body: string;
  try {
    body = await fs.readFile(msgFilePath, 'utf-8');
    // Strip trailing newline added during write
    if (body.endsWith('\n')) body = body.slice(0, -1);
  } catch (err: any) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }

  // Header from HeaderFile (single source of truth)
  const headers = messageIndexManager.readHeaderFile(confNum);
  const header = headers.find(h => h.msgNumb === msgNum);
  if (!header) return null;

  return {
    from: header.fromName,
    to: header.toName,
    subject: header.subject,
    date: formatMessageDate(new Date(header.msgDate * 1000)),
    msgNum: header.msgNumb,
    body,
    isPrivate: header.toName.toUpperCase() !== 'ALL',
    receivedAt: header.recv > 0 ? new Date(header.recv * 1000) : undefined,
  };
}

/**
 * Mark message as received — express.e:8943-8949
 * Sets mh.recv to current time in HeaderFile (no companion file).
 */
export async function markMessageReceived(
  confNum: number,
  msgNum: number,
  _bbsDataPath: string
): Promise<void> {
  const recv = Math.floor(Date.now() / 1000);
  messageIndexManager.updateMessageHeader(confNum, msgNum, { recv });
}

/**
 * Unmark received — express.e:11126 mh.recv := 0; saveOverHeader(gfh)
 */
export async function unmarkMessageReceived(
  confNum: number,
  msgNum: number,
  _bbsDataPath: string
): Promise<void> {
  messageIndexManager.updateMessageHeader(confNum, msgNum, { recv: 0 });
}

/**
 * Check if message is received (mh.recv != 0).
 */
export async function isMessageReceived(
  confNum: number,
  msgNum: number,
  _bbsDataPath: string
): Promise<boolean> {
  const headers = messageIndexManager.readHeaderFile(confNum);
  const header = headers.find(h => h.msgNumb === msgNum);
  return !!(header && header.recv > 0);
}

/**
 * Check if message body file exists on disk.
 */
export function messageFileExists(
  confNum: number,
  msgNum: number,
  bbsDataPath: string
): boolean {
  return fsSync.existsSync(getMessageFilePath(confNum, msgNum, bbsDataPath));
}

/**
 * Delete a message: mark header as 'D' (express.e DELETED status) and
 * remove the body file. MailStats lowestNotDel recomputed by
 * updateMailStatsAfterDelete.
 */
export async function deleteMessageFile(
  confNum: number,
  msgNum: number,
  bbsDataPath: string
): Promise<void> {
  const msgFilePath = getMessageFilePath(confNum, msgNum, bbsDataPath);
  try {
    await fs.unlink(msgFilePath);
  } catch (err: any) {
    if (err.code !== 'ENOENT') throw err;
  }
  messageIndexManager.deleteMessageHeader(confNum, msgNum);
console.log(`[Message] Deleted Conf${confNum} msg ${msgNum}`);
}

/**
 * Get all live (non-deleted) message ids in a conference, sorted ascending.
 * Reads HeaderFile and filters out DELETED status — body files are
 * authoritative for existence but HeaderFile is the canonical index.
 */
export async function getAllMessageIds(
  confNum: number,
  _bbsDataPath: string
): Promise<number[]> {
  const headers = messageIndexManager.readHeaderFile(confNum);
  return headers
    .filter(h => h.status !== MsgStatus.DELETED)
    .map(h => h.msgNumb)
    .sort((a, b) => a - b);
}

/**
 * Parse a formatted message date "DD-MMM-YY HH:MM:SS" back to Unix seconds.
 * Used to build HeaderFile.msgDate when writing a new message.
 */
function parseMessageDateToUnixSec(dateStr: string): number {
  const months: Record<string, number> = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  };
  const m = /^(\d{2})-([A-Za-z]{3})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(dateStr || '');
  if (!m) return Math.floor(Date.now() / 1000);
  const day = parseInt(m[1], 10);
  const mon = months[m[2]];
  // Y2K window — AmiExpress convention: 80-99 → 1980-1999, 00-79 → 2000-2079.
  // Keeps msgDate within i32 Unix-seconds range (max ~2038) and matches the
  // 2-digit year handling shipped with the original BBS.
  const yyRaw = parseInt(m[3], 10);
  const yr = yyRaw >= 80 ? 1900 + yyRaw : 2000 + yyRaw;
  const h = parseInt(m[4], 10);
  const min = parseInt(m[5], 10);
  const s = parseInt(m[6], 10);
  return Math.floor(new Date(yr, mon, day, h, min, s).getTime() / 1000);
}
