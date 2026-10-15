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
  /** The conference's name, e.g. `Conf9` - never a path. */
  dir: string;
  files: number;
  bytes: number;
  /**
   * Whether `Conf<n>/` is actually on disk.
   *
   * False for an orphan that is ICON ONLY - the directory was swept and its
   * `Conf<n>.info` stayed behind, which is the state this module used to
   * leave every board in.
   */
  hasDirectory: boolean;
  /** Whether `Conf<n>.info` is on disk. */
  hasIcon: boolean;
}

const CONF_DIR = /^Conf\d+$/;
const CONF_ICON = /^Conf(\d+)\.info$/i;

/**
 * `Conf<n>.info` is POSITIONAL, unlike the directory.
 *
 * express.e walks `NAME.i`/`LOCATION.i` for `i := 1 TO NCONFS` and reads
 * conference i's settings from `Conf<i>.info` - the number IS the position, so
 * the icons shift down when a conference is removed (see
 * conference-removal.service.ts). An icon numbered above NCONFS is therefore
 * dead by arithmetic, without consulting LOCATION at all.
 */
function orphanIconNumbers(bbsRoot: string, nconfs: number): Set<number> {
  const out = new Set<number>();
  for (const entry of fs.readdirSync(bbsRoot, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const m = CONF_ICON.exec(entry.name);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (n > nconfs) out.add(n);
  }
  return out;
}

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
  const config = loadConfConfig(bbsRoot);
  if (!config) return [];

  const live = liveDirs(bbsRoot);

  const orphanDirs = fs.readdirSync(bbsRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && CONF_DIR.test(entry.name))
    .map(entry => entry.name)
    .filter(name => !live.has(canon(path.join(bbsRoot, name))));

  /*
   * THE ICON COUNTS TOO, and this is what the sysop actually hit.
   *
   * Sweeping the directory used to leave `Conf<n>.info` behind, and nothing
   * ever looked at it again - so a board with five conferences carried
   * fourteen icons, and every tool that reads `Conf*.info` to find out what
   * conferences exist read fourteen. That is not hypothetical: it is how I
   * came to opt nine conferences that do not exist into a message-base door
   * on 2026-09-14, and how the sysop came to ask why deleting a conference in
   * the admin left one behind.
   *
   * An icon-only orphan has no directory to report bytes for, which is
   * exactly the state a previous sweep left, so it must be listed on its own.
   */
  const numbers = new Set<number>(orphanDirs.map(d => parseInt(d.slice(4), 10)));
  for (const n of orphanIconNumbers(bbsRoot, config.confCount)) numbers.add(n);

  return [...numbers]
    .sort((a, b) => a - b)
    .map(n => {
      const dir = `Conf${n}`;
      const dirPath = path.join(bbsRoot, dir);
      const hasDirectory = orphanDirs.includes(dir);
      const hasIcon = fs.existsSync(path.join(bbsRoot, `${dir}.info`));
      const measured = hasDirectory ? measure(dirPath) : { files: 0, bytes: 0 };
      if (hasIcon) {
        try {
          measured.files += 1;
          measured.bytes += fs.statSync(path.join(bbsRoot, `${dir}.info`)).size;
        } catch { /* vanished between the listing and the stat */ }
      }
      return { dir, ...measured, hasDirectory, hasIcon };
    });
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

  /*
   * The ICON goes with it. Leaving `Conf<n>.info` behind is what made this
   * sweep incomplete: the directory disappeared, the icon stayed, and every
   * tool that counts conferences by counting `Conf*.info` kept counting the
   * dead one. Removed AFTER the directory, so a failure part-way leaves the
   * icon as the marker that something is still there.
   */
  if (fs.existsSync(path.join(bbsRoot, dir))) {
    fs.rmSync(path.join(bbsRoot, dir), { recursive: true, force: true });
  }
  const icon = path.join(bbsRoot, `${dir}.info`);
  if (fs.existsSync(icon)) fs.rmSync(icon, { force: true });
}
