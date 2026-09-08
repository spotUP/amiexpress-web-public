/**
 * "Do we already have this?" - asked at the ZFILE, before the bytes.
 *
 * express.e:16831 `zmdupecheck` is the answer its ZMODEM receiver gets when a
 * ZFILE header names a file (zmodem.e:2571), and a yes becomes ZSKIP
 * (zmodem.e:2725) rather than a receive-then-reject. The rule is two
 * questions and an exemption:
 *
 *   IF (netMailTransfer=FALSE) AND (sysopUploading=FALSE) AND (rzmsg=FALSE)
 *     IF checkForFile(FilePart(fname))     THEN dup:=TRUE
 *     ELSEIF checkInPlaypens(FilePart(fname)) THEN dup:=TRUE
 *
 * The exemption matters as much as the rule: a sysop upload and a netmail
 * transfer are never screened, because both deliberately replace what is
 * there. This module answers the rule; the callers decide whether to ask.
 *
 * IT IS A SEPARATE QUESTION FROM FILING. `upload-filing.service.ts` also has
 * a duplicate test, and it must stay: it is the one that decides what happens
 * to bytes that are already on disk - the `D` marker, the HOLD directory, the
 * caller's notice. This one only decides whether the bytes are worth
 * receiving at all, and answers before there are any.
 */
import * as fs from 'fs';
import * as path from 'path';

import { checkForFile } from '../utils/file-upload.util';
import { getPlaypenDir } from '../utils/bbs-paths.util';

/** express.e's `checkInPlaypens` - is this name staged on ANY node? */
export function nameIsInAPlaypen(filename: string, bbsRoot: string, nodes: number = 10): boolean {
  const wanted = filename.toLowerCase();
  for (let node = 0; node < nodes; node++) {
    let entries: string[];
    try {
      entries = fs.readdirSync(getPlaypenDir(node, bbsRoot));
    } catch {
      continue; // a node that has never taken an upload has no playpen
    }
    if (entries.some((entry) => entry.toLowerCase() === wanted)) return true;
  }
  return false;
}

export interface DuplicateQuestion {
  filename: string;
  conferenceId: number;
  bbsRoot: string;
  /** Nodes to look through for a staged copy. */
  nodes?: number;
}

/**
 * express.e:16831, without the exemptions - the caller applies those by not
 * asking.
 *
 * The name is reduced to its last component first, the way express reduces it
 * with `FilePart`: a sender is free to put a path in a ZFILE header, and
 * `Uploads/DUPE.LHA` must be tested as `DUPE.LHA` rather than slipping past
 * the check and landing wherever the path pointed.
 */
export async function uploadIsDuplicate(question: DuplicateQuestion): Promise<boolean> {
  const filename = path.basename(String(question.filename ?? '').replace(/\\/g, '/')).trim();
  if (filename.length === 0) return false;

  if (await checkForFile(filename, question.conferenceId, question.bbsRoot)) return true;
  return nameIsInAPlaypen(filename, question.bbsRoot, question.nodes);
}
