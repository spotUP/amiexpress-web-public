/**
 * GDPR Erasure Service
 *
 * Implements the "right to be forgotten" for a user account. Soft-deletes
 * the user row, scrubs PII from messages they authored, removes their
 * questionnaire answers, and best-effort redacts their handle from recent
 * logs. Invoked by the W option 20 flow in gdpr.handler.ts.
 *
 * Phase 3 of thoughts/shared/plans/2026-04-24-gdpr-hobby-baseline.md.
 */

import * as path from 'path';
import * as amigafs from '../utils/amigafs';
import { config as bbsConfig } from '../config';
import { getSystemTime } from '../utils/date-time.util';
import { boardRoot } from '../utils/board-root.util';
import { conferenceNumbers } from '../conferences/conference-paths';
import { messageIndexManager } from './MessageIndexManager';
import { overwriteMessageBody } from '../utils/message-file.util';
import { userFileManager } from './UserFileManager';
import { deleteConfAccess } from './delete-conf-access';

/**
 * What an erased caller's own message reads as, in the database mirror and in
 * the body file R reads. One text, so the two never disagree.
 */
export const ERASED_MESSAGE_BODY = '*** erased ***';

export interface ErasureOptions {
  /** The node's CONF_DB tooltype - the Conf.DB name deleteConfAccess clears. */
  confDbName?: string;
  /** Node that holds each conference's MailLock while its HeaderFile is rewritten. */
  nodeId?: number;
}

export interface ErasureResult {
  userId: string;
  erasedHandle: string;
  originalUsername: string;
  nowIso: string;
  messageBodiesScrubbed: number;
  /** HeaderFile records whose From or To named the erased caller. */
  messageHeadersRenamed: number;
  /** Message body files (the caller's own messages) replaced by ERASED_MESSAGE_BODY. */
  messageFilesScrubbed: number;
  /** Conf.DB files whose record at the caller's slot was cleared. */
  confDbFilesCleared: number;
  /**
   * false when user.data at the row's slot is not this account: the disk
   * record (and Conf.DB) were left alone rather than overwrite someone else.
   */
  diskRecordErased: boolean;
  answersFilesScrubbed: number;
  callersLogFilesRedacted: number;
}

/**
 * Erase the user. Caller must already have validated password + username
 * match before invoking. This function is the point of no return.
 */
export async function eraseUserData(db: any, userId: string, options: ErasureOptions = {}): Promise<ErasureResult> {
  const user = await db.getUserById(userId);
  if (!user) {
    throw new Error(`eraseUserData: user ${userId} not found`);
  }

  const originalUsername = user.username;
  // 'erased_' + short id keeps row identifiable for sysop audit but carries
  // no identifying signal. Slot-number-based IDs would be more compact, but
  // we don't expose slotNumber through the update path so UUIDs are fine.
  const erasedHandle = `erased_${userId.slice(0, 8)}`;
  const nowIso = new Date().toISOString();

  // 0. The message bases on disk - HeaderFile names and the body files R
  //    reads. First, while the names are still on the record, and before
  //    anything else changes: a message base another node holds locked
  //    throws here and leaves the account as it was, to be erased again.
  const slot: number = user.slotNumber ?? 0;
  const diskRecord = slot > 0 ? userFileManager.readUserBySlot(slot) : null;
  const sameAccount = !!diskRecord && sameName(diskRecord.username, originalUsername);
  const messageBases = await eraseFromMessageBases(
    {
      username: originalUsername,
      realnames: [user.realname, sameAccount ? diskRecord!.realname : undefined],
    },
    erasedHandle,
    options.nodeId ?? 0,
  );

  // 1. Soft-delete + null PII on the user row. updateUser writes the row
  //    over the account's user.data / user.keys / user.misc record, and
  //    accountDeleted makes that the DELETED record express.e writes
  //    (21362-21373): its own slotNumber and keys number 0, at the position
  //    it keeps, so the logon refuses it (29701) - the same deletion the
  //    account editor's DELETE makes.
  await db.updateUser(userId, {
    username: erasedHandle,
    realname: erasedHandle,
    location: '',
    phone: '',
    email: '',
    // Drop to sec level 0 so the soft-deleted row can't log in even if
    // something resurrects credentials.
    secLevel: 0,
    newUser: false,
    availableForChat: false,
    gdprConsentAt: nowIso,
    gdprNoticeVersion: user.gdprNoticeVersion,
    gdprConsentSource: user.gdprConsentSource,
    // These two are the GDPR markers themselves.
    deletedAt: nowIso,
    erasedAt: nowIso,
    accountDeleted: true,
  }, sameAccount ? {} : {
    // The record at the row's slot is another caller's (or none): writing
    // the erased account there would overwrite them. The row is erased; the
    // disk record is left for the sysop (reported in the result).
    syncDisk: false,
  });

  // 1b. deleteConfAccess (express.e:22335-22377): the account's record in
  //     every conference's Conf.DB, as the editor's DELETE clears it.
  let confDbFilesCleared = 0;
  if (sameAccount) {
    confDbFilesCleared = deleteConfAccess(boardRoot(), slot, options.confDbName || 'Conf.DB').length;
  }

  // 2. Scrub message bodies the user authored and PMs they sent.
  //    Recipients stay intact (their experience of the thread is preserved;
  //    only the erased user's PII is removed).
  const stmt = (db as any).db?.prepare
    ? (db as any).db
    : null;
  let messageBodiesScrubbed = 0;
  if (stmt) {
    const res = stmt
      .prepare(`UPDATE messages SET body = ?, author = ? WHERE author = ?`)
      .run(ERASED_MESSAGE_BODY, erasedHandle, originalUsername);
    messageBodiesScrubbed = res.changes ?? 0;
    // Also mask 'editedby' if this user was the editor of other rows.
    stmt
      .prepare(`UPDATE messages SET editedby = ? WHERE editedby = ?`)
      .run(erasedHandle, originalUsername);
  }

  // 3. Scrub Node*\/Answers + Node*\/TempAns blocks for this user.
  const answersFilesScrubbed = scrubAnswersFiles(originalUsername, erasedHandle);

  // 4. Best-effort log redaction within retention window.
  const callersLogFilesRedacted = redactRecentLogs(originalUsername, erasedHandle);

  return {
    userId,
    erasedHandle,
    originalUsername,
    nowIso,
    messageBodiesScrubbed,
    messageHeadersRenamed: messageBases.headersRenamed,
    messageFilesScrubbed: messageBases.bodiesScrubbed,
    confDbFilesCleared,
    diskRecordErased: sameAccount,
    answersFilesScrubbed,
    callersLogFilesRedacted,
  };
}

/** stringCompare: names are the same whatever the case (read-msg sameName). */
function sameName(a: string | undefined, b: string | undefined): boolean {
  return (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();
}

/** A HeaderFile name field holds 30 characters (`[31] CHAR`, axobjects.e). */
const HEADER_NAME_CHARS = 30;

export interface ErasedNames {
  /** The handle. Unique on the board, so it names the caller in every conference. */
  username: string;
  /**
   * The real name, which a REALNAME conference posts under (getConfMailNameFor,
   * express.e:5017-5024). Matched only there: elsewhere a real name may be
   * another caller's handle.
   */
  realnames: Array<string | undefined>;
}

/**
 * Whether a HeaderFile name is the erased caller's, in conference `conf`.
 * The field keeps 30 characters, so a longer name is compared as it was cut.
 */
export function headerNameIsTheCaller(name: string, names: ErasedNames, realnameConference: boolean): boolean {
  const candidates = [names.username];
  if (realnameConference) {
    for (const r of names.realnames) if (r && r.trim()) candidates.push(r.substring(0, 26));
  }
  return candidates.some(c => c && sameName(name, c.substring(0, HEADER_NAME_CHARS)));
}

function isRealnameConference(conf: number): boolean {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getConfNameType } = require('../handlers/message/conf-mail-name');
  try {
    return getConfNameType(conf, 1) === 'realname';
  } catch {
    return false;
  }
}

async function holdMailLock(conf: number, nodeId: number): Promise<void> {
  // writeMessageFile's wait (message-file.util): a post that appends a header
  // while this rewrites the HeaderFile would be lost.
  for (let attempt = 0; attempt < 25; attempt++) {
    if (messageIndexManager.acquireMailLock(conf, nodeId)) return;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`eraseUserData: the message base of conference ${conf} is locked`);
}

/**
 * The erased caller in every conference's message base, through the board's
 * own writers: the HeaderFile record's From / To becomes the erased handle
 * (updateMessageHeader keeps the record's number, status, date and position,
 * so MailStats and every scan pointer stay valid), and the body file of a
 * message the caller WROTE is replaced by ERASED_MESSAGE_BODY - the text the
 * database mirror already holds. A message others wrote TO the caller keeps
 * its body: it is theirs. Deleted messages are included; their body files are
 * still on the disk.
 */
export async function eraseFromMessageBases(
  names: ErasedNames,
  erasedHandle: string,
  nodeId: number = 0,
): Promise<{ headersRenamed: number; bodiesScrubbed: number }> {
  const dataDir = bbsConfig.get('dataDir');
  let headersRenamed = 0;
  let bodiesScrubbed = 0;

  for (const conf of conferenceNumbers(boardRoot())) {
    const realnameConference = isRealnameConference(conf);
    const mine = (name: string) => headerNameIsTheCaller(name, names, realnameConference);
    if (!messageIndexManager.readHeaderFile(conf).some(h => mine(h.fromName) || mine(h.toName))) continue;

    await holdMailLock(conf, nodeId);
    try {
      for (const h of messageIndexManager.readHeaderFile(conf)) {
        const fromMe = mine(h.fromName);
        const toMe = mine(h.toName);
        if (!fromMe && !toMe) continue;
        messageIndexManager.updateMessageHeader(conf, h.msgNumb, {
          ...(fromMe ? { fromName: erasedHandle } : {}),
          ...(toMe ? { toName: erasedHandle } : {}),
        });
        headersRenamed++;
        if (fromMe) {
          await overwriteMessageBody(conf, h.msgNumb, ERASED_MESSAGE_BODY, dataDir);
          bodiesScrubbed++;
        }
      }
    } finally {
      messageIndexManager.releaseMailLock(conf, nodeId);
    }
  }

  return { headersRenamed, bodiesScrubbed };
}

/**
 * Scrub Node*\/Answers + Node*\/TempAns files by removing any block whose
 * header mentions the erased username. Blocks are separated by the
 * '**********' banner written by the new-user handler.
 */
function scrubAnswersFiles(originalUsername: string, erasedHandle: string): number {
  const baseDir = bbsConfig.getConfig().dataDir;
  let filesTouched = 0;

  let entries: string[] = [];
  try {
    entries = amigafs.readdirSync(baseDir);
  } catch {
    return 0;
  }

  for (const entry of entries) {
    if (!/^node\d+$/i.test(entry)) continue;
    const nodeDir = path.join(baseDir, entry);
    for (const name of ['Answers', 'TempAns']) {
      const filePath = path.join(nodeDir, name);
      if (!amigafs.existsSync(filePath)) continue;

      try {
        const raw = amigafs.readFileSync(filePath, 'utf8') as string;
        const blocks = raw.split(/(?=^\*{10,}\s*$)/m);
        const kept: string[] = [];
        let touched = false;
        for (const block of blocks) {
          if (mentionsUser(block, originalUsername)) {
            // Replace the block header line with an erased marker but drop
            // the answer transcript entirely — the transcript itself is
            // PII-bearing free text.
            kept.push(`**************************************************************\n[block erased for ${erasedHandle}]\n\n`);
            touched = true;
            continue;
          }
          kept.push(block);
        }
        if (touched) {
          amigafs.writeFileSync(filePath, kept.join(''), 'utf8');
          filesTouched++;
        }
      } catch (error) {
        console.warn('[gdpr-erasure] Failed to scrub', filePath, error);
      }
    }
  }

  return filesTouched;
}

function mentionsUser(block: string, username: string): boolean {
  if (!block) return false;
  // Header line format: 'MM-DD-YY (HH:MM:SS) [slot] USERNAME (CONNECT baud) location'
  const firstNonBannerLine = block.split('\n').find(l => l.trim() && !l.startsWith('**'));
  if (!firstNonBannerLine) return false;
  const re = new RegExp(`\\b${escapeRegex(username)}\\b`);
  return re.test(firstNonBannerLine);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Best-effort log redaction: replace whole-word occurrences of the username
 * with the erased handle in Node*\/CallersLog and similar files. Keeps the
 * logs usable for sysop forensics while removing the handle.
 */
function redactRecentLogs(originalUsername: string, erasedHandle: string): number {
  const baseDir = bbsConfig.getConfig().dataDir;
  let filesTouched = 0;

  let entries: string[] = [];
  try {
    entries = amigafs.readdirSync(baseDir);
  } catch {
    return 0;
  }

  const targets: string[] = [];
  for (const entry of entries) {
    if (!/^node\d+$/i.test(entry)) continue;
    const nodeDir = path.join(baseDir, entry);
    for (const name of ['CallersLog', 'callerslog', 'ErrorLog']) {
      const filePath = path.join(nodeDir, name);
      if (amigafs.existsSync(filePath)) targets.push(filePath);
    }
  }
  // Also redact the backend combined log if present.
  const backendLog = path.join(baseDir, 'logs', 'backend.log');
  if (amigafs.existsSync(backendLog)) targets.push(backendLog);

  // Byte for byte: the log is Latin-1 where a door or an Amiga wrote it and
  // UTF-8 where the backend did. Read and written as 'utf8', every Latin-1
  // byte in the file became U+FFFD (EF BF BD) the moment the handle matched.
  // As latin1 strings the bytes round-trip unchanged, and the handle is looked
  // for in both of its spellings. A name edge is any non-word character, so
  // a handle like -=X=- matches (\b never sees its edges).
  const spellings = [...new Set([
    originalUsername,
    Buffer.from(originalUsername, 'utf8').toString('latin1'),
  ])].map(escapeRegex);
  const re = new RegExp(`(?<![A-Za-z0-9_])(?:${spellings.join('|')})(?![A-Za-z0-9_])`, 'g');

  for (const filePath of new Set(targets.map(t => amigafs.resolveExistingAncestors(t)))) {
    try {
      const raw = (amigafs.readFileSync(filePath) as Buffer).toString('latin1');
      if (!re.test(raw)) continue;
      re.lastIndex = 0;
      const replaced = raw.replace(re, erasedHandle);
      amigafs.writeFileSync(filePath, Buffer.from(replaced, 'latin1'));
      filesTouched++;
    } catch (error) {
      console.warn('[gdpr-erasure] Failed to redact log', filePath, error);
    }
  }

  return filesTouched;
}

// Re-export for tests that need to stub timestamps via a wrapper layer.
export const __test_only__ = { scrubAnswersFiles, redactRecentLogs };

// Unused but kept so tree-shakers don't complain about getSystemTime import
// when the current implementation doesn't reference it yet (reserved for
// future retention integration).
void getSystemTime;
