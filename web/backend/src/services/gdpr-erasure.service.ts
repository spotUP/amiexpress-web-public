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
import { conferenceDir, conferenceUploadDirs } from '../conferences/conference-paths';
import { getHoldDirFilePath } from '../utils/dir-file-reader.util';
import {
  CTOP_HEADER_SIZE,
  CTOP_RECORD_SIZE,
  decodeCtopHeader,
  decodeCtopRecords,
  encodeCtopHeader,
  encodeCtopRecord,
} from '@amiexpress/bbs-door-sdk/formats/ctop-data';

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
  /** DIR / HOLD/HELD / FILES.BBS listings whose `Sent by:` named the caller. */
  sentByFilesRenamed: number;
  /** Conferences whose ctop.data named the caller. */
  ctopFilesRenamed: number;
  /** Accounts records blanked in the sysop's safety copies of user.data/.keys/.misc. */
  backupRecordsBlanked: number;
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
  const answersFilesScrubbed = scrubAnswersFiles(originalUsername, erasedHandle, sameAccount ? slot : undefined);

  // 4. Best-effort log redaction within retention window.
  const callersLogFilesRedacted = redactRecentLogs(originalUsername, erasedHandle);

  // 5. The file listings' `Sent by:` line and Conftop's upload records name
  //    the uploader; both take the erased handle. The files themselves and
  //    their descriptions stay.
  const sentByFilesRenamed = renameSentByLines(originalUsername, erasedHandle);
  const ctopFilesRenamed = renameInCtopData(originalUsername, erasedHandle);

  // 6. The sysop's safety copies of the account files keep the caller's
  //    whole record: it is blanked there (sysop decision 2026-10-05).
  const backupRecordsBlanked = blankAccountInBackups(originalUsername);

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
    sentByFilesRenamed,
    ctopFilesRenamed,
    backupRecordsBlanked,
  };
}

/** user.data / user.keys / user.misc record sizes (UserFileManager). */
const ACCOUNT_RECORD_SIZES = { data: 232, keys: 56, misc: 248 } as const;

/**
 * Every safety copy of user.data whose record names the caller: that record
 * is zeroed, and the record at the same position in the copy of user.keys and
 * user.misc taken with it (same suffix). A record in a copy is matched by
 * NAME - slots move (a swap, a delete) and the copy may predate them.
 */
function blankAccountInBackups(originalUsername: string): number {
  const root = boardRoot();
  const want = originalUsername.toLowerCase();
  let blanked = 0;
  for (const copy of backupCopiesOf(path.join(root, 'user.data'))) {
    try {
      const buf = Buffer.from(amigafs.readFileSync(copy) as Buffer);
      const suffix = path.basename(copy).slice('user.data'.length);
      let touched = false;
      for (let at = 0; at + ACCOUNT_RECORD_SIZES.data <= buf.length; at += ACCOUNT_RECORD_SIZES.data) {
        const name = buf.subarray(at, at + 31).toString('latin1').split('\0')[0];
        if (name.toLowerCase() !== want) continue;
        const index = at / ACCOUNT_RECORD_SIZES.data;
        buf.fill(0, at, at + ACCOUNT_RECORD_SIZES.data);
        for (const kind of ['keys', 'misc'] as const) {
          const sibling = path.join(root, `user.${kind}${suffix}`);
          if (!amigafs.existsSync(sibling)) continue;
          const sb = Buffer.from(amigafs.readFileSync(sibling) as Buffer);
          const size = ACCOUNT_RECORD_SIZES[kind];
          if ((index + 1) * size <= sb.length) {
            sb.fill(0, index * size, (index + 1) * size);
            amigafs.writeFileSync(sibling, sb);
          }
        }
        blanked++;
        touched = true;
      }
      if (touched) amigafs.writeFileSync(copy, buf);
    } catch (error) {
      console.warn('[gdpr-erasure] Failed to blank the account in', copy, error);
    }
  }
  return blanked;
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
 * The sysop's safety copies of `file`: siblings named after it with a backup
 * suffix - `user.data.pre-swap-20261004.backup`, `DIR1.bak-padding`,
 * `CallersLog.backup` (sysop decision 2026-10-05: an erasure reaches them).
 */
export function backupCopiesOf(file: string): string[] {
  const dir = path.dirname(file);
  const base = path.basename(file).toLowerCase();
  let entries: string[] = [];
  try { entries = amigafs.readdirSync(dir); } catch { return []; }
  return entries
    .filter((e) => {
      const lower = e.toLowerCase();
      return lower !== base && lower.startsWith(base) && /^[.\-_]/.test(lower.slice(base.length))
        && /backup|\.bak|\.old\b/.test(lower.slice(base.length));
    })
    .map((e) => path.join(dir, e))
    .filter((p) => { try { return amigafs.statSync(p).isFile(); } catch { return false; } });
}

/** A file and every safety copy of it. */
function withBackups(files: Iterable<string>): string[] {
  const out = new Set<string>();
  for (const f of files) {
    out.add(f);
    for (const b of backupCopiesOf(f)) out.add(b);
  }
  return [...out];
}

/** Whole-conference safety copies at the board root, e.g. `Conf2.backup-2026-05-27/`. */
function conferenceBackupDirs(root: string): string[] {
  let entries: string[] = [];
  try { entries = amigafs.readdirSync(root); } catch { return []; }
  return entries
    .filter((e) => /^conf\d+[.\-_].*(backup|bak)/i.test(e))
    .map((e) => path.join(root, e))
    .filter((p) => { try { return amigafs.statSync(p).isDirectory(); } catch { return false; } });
}

/**
 * Scrub Node*\/Answers + Node*\/TempAns files by removing any block whose
 * header mentions the erased username. Blocks are separated by the
 * '**********' banner written by the new-user handler.
 */
function scrubAnswersFiles(originalUsername: string, erasedHandle: string, slot?: number): number {
  const baseDir = bbsConfig.getConfig().dataDir;
  let filesTouched = 0;

  // The account's own Answers/<slot> (CENTRAL_ANSWERS, express.e:30332-30340)
  // holds nothing but this caller's answers: it goes whole.
  if (slot && slot > 0) {
    const own = amigafs.resolvePath(path.join(baseDir, 'Answers', String(slot)));
    if (own && amigafs.existsSync(own)) {
      try {
        amigafs.unlinkSync(own);
        filesTouched++;
      } catch (error) {
        console.warn('[gdpr-erasure] Failed to remove', own, error);
      }
    }
  }

  let entries: string[] = [];
  try {
    entries = amigafs.readdirSync(baseDir);
  } catch {
    return 0;
  }

  for (const entry of entries) {
    if (!/^node\d+$/i.test(entry)) continue;
    const nodeDir = path.join(baseDir, entry);
    for (const filePath of withBackups(['Answers', 'TempAns'].map((n) => path.join(nodeDir, n)))) {
      if (!amigafs.existsSync(filePath)) continue;

      try {
        // Latin-1, as new-user.handler writes it: UTF-8 turned every other
        // caller's high byte into U+FFFD when the file was written back.
        const raw = amigafs.readFileSync(filePath, 'latin1') as string;
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
          amigafs.writeFileSync(filePath, kept.join(''), 'latin1');
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
    for (const name of ['CallersLog', 'callerslog', 'CLogBackup', 'ErrorLog']) {
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
  const logonLocation = new RegExp(`^([^\\r\\n]*\\[\\d+\\] (?:${spellings.join('|')}) \\([^)\\r\\n]*\\)) ?[^\\r\\n]*`, 'gm');

  for (const filePath of new Set(withBackups(targets).map(t => amigafs.resolveExistingAncestors(t)))) {
    try {
      const raw = (amigafs.readFileSync(filePath) as Buffer).toString('latin1');
      if (!re.test(raw)) continue;
      re.lastIndex = 0;
      // The logon line (express.e:16040-16042, `... [slot] name (connect)
      // location`) carries where the caller lives: it goes, and the line
      // keeps the shape express.e writes for an empty location.
      const replaced = raw.replace(logonLocation, '$1 ').replace(re, erasedHandle);
      amigafs.writeFileSync(filePath, Buffer.from(replaced, 'latin1'));
      filesTouched++;
    } catch (error) {
      console.warn('[gdpr-erasure] Failed to redact log', filePath, error);
    }
  }

  return filesTouched;
}

/**
 * The `Sent by: <name>` line express.e appends under an upload's description
 * (19506-19509, utils/dir-file.util.ts buildSentByLine) in the conference's
 * DIR files, its HOLD/HELD listing and the upload directory's FILES.BBS. The
 * name becomes the erased handle; every other byte - the description, the
 * indent, Latin-1 text - is kept.
 */
function renameSentByLines(originalUsername: string, erasedHandle: string): number {
  const root = boardRoot();
  const spellings = [...new Set([
    originalUsername,
    Buffer.from(originalUsername, 'utf8').toString('latin1'),
  ])].map(escapeRegex);
  const sentBy = new RegExp(`^([ \\t]*Sent by: )(?:${spellings.join('|')})([ \\t]*\\r?)$`, 'gim');

  const listings = new Set<string>();
  for (const conf of conferenceNumbers(root)) {
    const confDir = conferenceDir(root, conf);
    let entries: string[] = [];
    try { entries = amigafs.readdirSync(confDir); } catch { continue; }
    for (const e of entries) if (/^DIR\d+$/i.test(e)) listings.add(path.join(confDir, e));
    listings.add(getHoldDirFilePath(confDir));
    for (const dir of [...conferenceUploadDirs(root, conf), path.join(confDir, 'Upload')]) {
      listings.add(path.join(dir, 'FILES.BBS'));
    }
  }
  for (const copy of conferenceBackupDirs(root)) {
    let entries: string[] = [];
    try { entries = amigafs.readdirSync(copy); } catch { continue; }
    for (const e of entries) if (/^DIR\d+$/i.test(e) || /^(hold|held)$/i.test(e)) listings.add(path.join(copy, e));
  }

  let filesTouched = 0;
  for (const listing of withBackups(listings)) {
    try {
      if (!amigafs.existsSync(listing)) continue;
      const raw = (amigafs.readFileSync(listing) as Buffer).toString('latin1');
      const replaced = raw.replace(sentBy, `$1${erasedHandle}$2`);
      if (replaced === raw) continue;
      amigafs.writeFileSync(listing, Buffer.from(replaced, 'latin1'));
      filesTouched++;
    } catch (error) {
      console.warn('[gdpr-erasure] Failed to rename Sent by in', listing, error);
    }
  }
  return filesTouched;
}

/**
 * Conftop's ctop.data in every conference (utils/ctop-updater.util.ts): each
 * upload record the caller made, and the header's record holder and period
 * winner when that is the caller, take the erased handle. A record's location
 * is the caller's own and is emptied with it. The byte counts stay, so the
 * period's totals do not change.
 */
function renameInCtopData(originalUsername: string, erasedHandle: string): number {
  const root = boardRoot();
  const name = Buffer.from(originalUsername, 'latin1').subarray(0, 32).toString('latin1');
  const isTheCaller = (n: string) => sameName(n, name);
  let filesTouched = 0;
  const ctopFiles = withBackups([
    ...conferenceNumbers(root).map((conf) => path.join(conferenceDir(root, conf), 'ctop.data')),
    ...conferenceBackupDirs(root).map((dir) => path.join(dir, 'ctop.data')),
  ]);
  for (const ctopPath of ctopFiles) {
    try {
      if (!amigafs.existsSync(ctopPath)) continue;
      const buf = Buffer.from(amigafs.readFileSync(ctopPath) as Buffer);
      if (buf.length < CTOP_HEADER_SIZE) continue;
      let touched = false;
      const header = decodeCtopHeader(buf);
      if (isTheCaller(header.topUpName) || isTheCaller(header.periodUpName)) {
        encodeCtopHeader({
          ...header,
          ...(isTheCaller(header.topUpName) ? { topUpName: erasedHandle } : {}),
          ...(isTheCaller(header.periodUpName) ? { periodUpName: erasedHandle } : {}),
        }).copy(buf, 0);
        touched = true;
      }
      decodeCtopRecords(buf).forEach((record, i) => {
        if (!isTheCaller(record.userName)) return;
        encodeCtopRecord({ userName: erasedHandle, location: '', bytes: record.bytes })
          .copy(buf, CTOP_HEADER_SIZE + i * CTOP_RECORD_SIZE);
        touched = true;
      });
      if (!touched) continue;
      amigafs.writeFileSync(ctopPath, buf);
      filesTouched++;
    } catch (error) {
      console.warn('[gdpr-erasure] Failed to rename in', ctopPath, error);
    }
  }
  return filesTouched;
}

// Re-export for tests that need to stub timestamps via a wrapper layer.
export const __test_only__ = { scrubAnswersFiles, redactRecentLogs, renameSentByLines, renameInCtopData, blankAccountInBackups };

// Unused but kept so tree-shakers don't complain about getSystemTime import
// when the current implementation doesn't reference it yet (reserved for
// future retention integration).
void getSystemTime;
