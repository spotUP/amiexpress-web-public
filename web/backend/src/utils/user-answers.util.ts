/**
 * A user's new-user questionnaire answers, as stored on this board.
 *
 * doNewUserQuestions (express.e:30323) appends each registration's transcript to
 * `Node<n>/Answers` as a BLOCK, preceded by a `**********` banner and a header
 * line `MM-DD-YY (HH:MM:SS) [slot] USERNAME (CONNECT baud) location`. Blocks
 * accumulate across nodes and registrations, so a user's answers are the
 * block(s) whose header names them - the same identification the GDPR erasure
 * scrub uses (gdpr-erasure.service.ts), kept here as the ONE reader so the
 * account editor's `?` viewer and the scrubber agree on what a user's block is.
 */
import * as path from 'path';
import * as amigafs from './amigafs';

export interface UserAnswerBlock {
  /** The node directory the block was found in, e.g. "Node3". */
  node: string;
  /** The block text, banner and header included, trimmed of outer blank lines. */
  text: string;
}

/** Escape a username for a literal, word-bounded regex match in a header line. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * True when this block's header line names `username`. The header is the first
 * non-banner line; matching there (not the whole block) keeps a name that
 * happens to appear inside someone else's free-text answers from stealing the
 * block. Mirrors gdpr-erasure.service.ts:mentionsUser.
 */
export function blockNamesUser(block: string, username: string): boolean {
  if (!block || !username) return false;
  const header = block.split('\n').find(l => l.trim() && !l.startsWith('**'));
  if (!header) return false;
  return new RegExp(`\\b${escapeRegex(username)}\\b`).test(header);
}

/**
 * Every questionnaire-answer block on this board whose header names `username`,
 * scanned across every `Node<n>/Answers` file. Read-only; returns [] when the
 * user has no answers on file (or the data dir is unreadable).
 */
export function findUserAnswerBlocks(dataDir: string, username: string): UserAnswerBlock[] {
  const out: UserAnswerBlock[] = [];
  if (!username) return out;

  let entries: string[] = [];
  try {
    entries = amigafs.readdirSync(dataDir) as string[];
  } catch {
    return out;
  }

  for (const entry of entries) {
    if (!/^node\d+$/i.test(entry)) continue;
    const filePath = path.join(dataDir, entry, 'Answers');
    if (!amigafs.existsSync(filePath)) continue;
    try {
      const raw = amigafs.readFileSync(filePath, 'utf8') as string;
      // Same split as the scrubber: a banner line of ten-plus asterisks starts
      // a block (the lookahead keeps the banner with the block it heads).
      for (const block of raw.split(/(?=^\*{10,}\s*$)/m)) {
        if (blockNamesUser(block, username)) {
          out.push({ node: entry, text: block.trim() });
        }
      }
    } catch {
      // A missing or unreadable Answers file just contributes nothing.
    }
  }
  return out;
}
