/**
 * Whether a node can be pointed at a shared screen directory.
 *
 * The `SCREENS` tooltype redirects the node's WHOLE screen set, not the one
 * file the sysop was looking at (ACP.e:2666-2673, express.e:96 and :31995).
 * Offering to share because BBSTITLE happens to match would silently repoint
 * LOGON, LOGOFF, JOIN, JOINED and every security variant that node reads - so
 * every file has to match, by bytes, before the action is offered at all.
 *
 * Nothing is normalised. CRLF, trailing whitespace and a SAUCE comment are
 * real differences: a screen that differs only in its SAUCE record is still a
 * different screen, and smoothing that over is how a sysop loses one.
 *
 * Filenames are matched case-insensitively because the volume is an Amiga one
 * where `logon.txt` and `LOGON.TXT` are one file, and reported exactly as they
 * sit on disk.
 */

import * as fs from 'fs';
import * as path from 'path';
import { screenFileFacts } from './screen-index.service';

export interface ShareCheck {
  ok: boolean;
  /** Why not, in the sysop's terms. Empty when ok. */
  reasons: string[];
  /** Files the node has that the shared directory does not - it would stop reading these. */
  losing: string[];
  /** Files the shared directory has that the node does not - it would start reading these. */
  gaining: string[];
  /** True when the node has no screens of its own, so there is nothing to lose. */
  nodeHasNoScreens: boolean;
}

const SCREEN_EXTENSIONS = ['.txt', '.gr', '.ibm', '.seq', '.rip', '.ans', '.asc'];

function screenFilesIn(dir: string): Map<string, string> {
  const found = new Map<string, string>();
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return found;
  }

  for (const name of entries) {
    if (name.endsWith('.backup')) continue;
    const lower = name.toLowerCase();
    if (!SCREEN_EXTENSIONS.some(ext => lower.endsWith(ext))) continue;
    try {
      if (!fs.statSync(path.join(dir, name)).isFile()) continue;
    } catch {
      continue;
    }
    found.set(lower, name);
  }

  return found;
}

export function checkShare(baseDir: string, nodeId: number, sharedDirRel: string): ShareCheck {
  const nodeDir = path.join(baseDir, `Node${nodeId}`);
  const sharedDir = path.join(baseDir, sharedDirRel);

  const mine = screenFilesIn(nodeDir);
  const theirs = screenFilesIn(sharedDir);

  const reasons: string[] = [];
  const losing = [...mine].filter(([key]) => !theirs.has(key)).map(([, name]) => name);
  const gaining = [...theirs].filter(([key]) => !mine.has(key)).map(([, name]) => name);

  for (const [key, name] of mine) {
    const other = theirs.get(key);
    if (!other) continue;

    const ours = screenFileFacts(baseDir, path.join(nodeDir, name));
    const shared = screenFileFacts(baseDir, path.join(sharedDir, other));

    if (ours.sha256 !== shared.sha256 || ours.bytes !== shared.bytes) {
      reasons.push(`${name} differs`);
    }
  }

  // A reference naming a node or a conference cannot be shared: carried into a
  // directory that many nodes read, it would give every one of them one node's
  // content.
  for (const [, name] of theirs) {
    const facts = screenFileFacts(baseDir, path.join(sharedDir, name));
    if (facts.mci.some(ref => ref.scopeSpecific)) {
      reasons.push(`${name} names a node or conference`);
    }
  }

  const nodeHasNoScreens = mine.size === 0;

  return {
    // A node with no screens of its own has nothing to lose and everything to
    // gain - that is precisely the case sharing exists for.
    ok: reasons.length === 0 && losing.length === 0 && (nodeHasNoScreens || gaining.length === 0),
    reasons,
    losing,
    gaining,
    nodeHasNoScreens,
  };
}
