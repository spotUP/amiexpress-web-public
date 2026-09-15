/**
 * `cleanItUp()` - express.e:17799-17876, the node work directory sweep.
 *
 * Every batch upload opens with it (express.e:17656, the first line of
 * `uploadDesc`), and its job is to clear the node's WORK DIRECTORY - the
 * playpen - before a new upload starts writing into it.
 *
 * This port skipped it. `file.handler.ts` carried the line
 * `// express.e:17656 cleanItUp() - nothing needed for web`, and the result is
 * that every upload which died part way through left its bytes in the playpen
 * for ever. On the live board, 2026-09-15: `Node2/Playpen` held seven files
 * dating to August - `.LHA` and `.TXT` from dead sessions - and Node0, Node1,
 * Node3 and Node4 had their own. The sysop spotted them: "those files looks
 * like they dont belong to the bbs". They did not; they were abandoned
 * uploads nothing ever cleared.
 *
 * (`file.handler.ts:691` names the same thing from the other end: a refused
 * upload "silently aborts with a partial file in playpen".)
 *
 * NOT the resume partials. Those live in the conference's PARTUPLOAD
 * directory (`services/resume-stuff.service.ts`), which this never touches -
 * a caller can still resume an interrupted transfer after this has run.
 *
 * WHY IT STOPS INSTEAD OF SKIPPING. express.e validates each name and `JUMP
 * ef`s out of the WHOLE loop on anything unexpected - a name with a space, a
 * slash, a non-ASCII byte, or no name at all. It does not skip that file and
 * carry on. That is a deliberate brake: something it does not recognise is in
 * a directory it is about to delete from, so it stops deleting. Copied here
 * exactly, because the alternative is a sweep that deletes the files it likes
 * the look of and leaves the one that made it suspicious.
 */

import * as fs from 'fs';
import * as path from 'path';

/** What the sweep did, for the caller that wants to log it. */
export interface CleanItUpResult {
  /** Files actually removed. */
  deleted: string[];
  /** Set when the sweep stopped early, naming what stopped it. */
  stoppedAt?: string;
}

/**
 * express.e:17845-17857 - the name check, over the first 30 characters.
 *
 * A space ANYWHERE in that span fails, not just a leading one: express.e
 * re-tests `s[0]` as it walks the pointer forward, so every character in
 * range is checked against the same three rules.
 */
function nameIsOrdinary(name: string): boolean {
  if (name.length === 0) return false;                 // express.e:17839
  const span = Math.min(name.length, 30);              // express.e:17845 cnt < 30
  for (let i = 0; i < span; i++) {
    const ch = name[i];
    if (ch === ' ') return false;                      // express.e:17846
    if (ch === '/') return false;                      // express.e:17849
    if (name.charCodeAt(i) > 127) return false;        // express.e:17852 isascii
  }
  return true;
}

/**
 * Clear the node work directory of files, one level deep.
 *
 * Directories are left alone - express.e only deletes entries whose
 * `fib_DirEntryType < 0`, which is a file (express.e:17836). A missing
 * directory is not an error: a node that has never taken an upload has no
 * playpen yet, and express.e's own `Lock()` failure path just returns.
 */
export function cleanItUp(workDir: string): CleanItUpResult {
  const result: CleanItUpResult = { deleted: [] };

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(workDir, { withFileTypes: true });
  } catch {
    return result;                                      // express.e:17824 myError(8), return
  }

  for (const entry of entries) {
    if (!entry.isFile()) continue;                      // express.e:17836

    if (!nameIsOrdinary(entry.name)) {
      result.stoppedAt = entry.name;                    // express.e JUMP ef
      return result;
    }

    const full = path.join(workDir, entry.name);
    try {
      // express.e:17863-17864 SetProtection(FIBF_OTR_DELETE) then DeleteFile -
      // it clears the protection bits first so a protected file still goes.
      try { fs.chmodSync(full, 0o666); } catch { /* best effort, as express.e's is */ }
      fs.unlinkSync(full);
      result.deleted.push(entry.name);
    } catch {
      // A file that will not delete is not a reason to stop: express.e's
      // DeleteFile has no error path here either.
    }
  }

  return result;
}
