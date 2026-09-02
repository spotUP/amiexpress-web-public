/**
 * Conference directories the board no longer reads.
 *
 * Deleting a conference shifts NAME.n/LOCATION.n down and leaves the DIRECTORY
 * where it is, on purpose: the messages posted there and the files uploaded to
 * it belong to the conference, not to its position, and the sysop decides
 * whether they go. The cost is that a board accumulates directories nothing
 * points at - nine on the live board - and nothing could see them.
 *
 * "Nothing points at it" is the only definition used here: every conference
 * from 1 to NCONFS is asked where it lives (conferenceDir, which reads
 * LOCATION.n), and a Conf<n> directory not in that set is an orphan. A board
 * with no ConfConfig.info has no orphans, because nothing is KNOWN to be dead
 * - and the removal refuses outright rather than guessing.
 */

import * as fs from 'fs';
import * as path from 'path';
import { conferenceDir, conferenceNumbers } from './conference-paths';
import { loadConfConfig } from '../services/conf-config.service';

export interface OrphanConferenceDir {
  /** The directory's name, e.g. `Conf9` - never a path. */
  dir: string;
  files: number;
  bytes: number;
}

const CONF_DIR = /^Conf\d+$/;

/** Case-insensitively comparable, because the dev host's disk is. */
function canon(p: string): string {
  return path.resolve(p).toLowerCase();
}

/** Every directory a conference currently reads. */
function liveDirs(bbsRoot: string): Set<string> {
  return new Set(conferenceNumbers(bbsRoot).map(n => canon(conferenceDir(bbsRoot, n))));
}

function measure(dir: string): { files: number; bytes: number } {
  let files = 0;
  let bytes = 0;

  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      try {
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile()) {
          files += 1;
          bytes += fs.statSync(full).size;
        }
      } catch { /* a file that vanished mid-walk is not in the count */ }
    }
  };

  try { walk(dir); } catch { /* an unreadable directory reports what it managed */ }
  return { files, bytes };
}

export function listOrphanConferenceDirs(bbsRoot: string): OrphanConferenceDir[] {
  // Without the board's own list there is nothing to be an orphan OF.
  if (!loadConfConfig(bbsRoot)) return [];

  const live = liveDirs(bbsRoot);

  return fs.readdirSync(bbsRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && CONF_DIR.test(entry.name))
    .map(entry => entry.name)
    .filter(name => !live.has(canon(path.join(bbsRoot, name))))
    .sort((a, b) => parseInt(a.slice(4), 10) - parseInt(b.slice(4), 10))
    .map(dir => ({ dir, ...measure(path.join(bbsRoot, dir)) }));
}

/**
 * Delete one orphan, having proved it is one.
 *
 * Every refusal happens before a byte moves: the name must BE a conference
 * directory name (never a path), the board must have a conference list to
 * check against, and no conference may still point at it.
 */
export function removeOrphanConferenceDir(bbsRoot: string, dir: string): void {
  if (!CONF_DIR.test(dir)) {
    throw new Error(`Refusing to delete ${dir}: only a Conf<n> directory can be removed here.`);
  }

  const config = loadConfConfig(bbsRoot);
  if (!config) {
    throw new Error('Refusing to delete anything: the board has no ConfConfig.info to check against.');
  }

  const target = canon(path.join(bbsRoot, dir));
  for (const n of conferenceNumbers(bbsRoot)) {
    if (canon(conferenceDir(bbsRoot, n)) === target) {
      throw new Error(
        `Refusing to delete ${dir}: it is conference ${n} (${config.entries[n - 1]?.name ?? 'unnamed'})'s directory.`
      );
    }
  }

  if (!fs.existsSync(path.join(bbsRoot, dir))) return;
  fs.rmSync(path.join(bbsRoot, dir), { recursive: true, force: true });
}
