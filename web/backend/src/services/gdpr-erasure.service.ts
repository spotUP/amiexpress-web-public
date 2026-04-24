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

export interface ErasureResult {
  userId: string;
  erasedHandle: string;
  originalUsername: string;
  nowIso: string;
  messageBodiesScrubbed: number;
  answersFilesScrubbed: number;
  callersLogFilesRedacted: number;
}

/**
 * Erase the user. Caller must already have validated password + username
 * match before invoking. This function is the point of no return.
 */
export async function eraseUserData(db: any, userId: string): Promise<ErasureResult> {
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

  // 1. Soft-delete + null PII on the user row.
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
  });

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
      .run('*** erased ***', erasedHandle, originalUsername);
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
    answersFilesScrubbed,
    callersLogFilesRedacted,
  };
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

  const re = new RegExp(`\\b${escapeRegex(originalUsername)}\\b`, 'g');

  for (const filePath of targets) {
    try {
      const raw = amigafs.readFileSync(filePath, 'utf8') as string;
      if (!re.test(raw)) continue;
      re.lastIndex = 0;
      const replaced = raw.replace(re, erasedHandle);
      amigafs.writeFileSync(filePath, replaced, 'utf8');
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
