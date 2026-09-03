/**
 * Where a conference's files actually live.
 *
 * A conference IS a position - express.e:8506 tests
 * `user.conferenceAccess[confNum-1]` - but its DIRECTORY is whatever
 * `LOCATION.n` in ConfConfig.info says, and express.e:31849 reads exactly
 * that: `FOR i:=1 TO cmds.numConf` walking NAME.i and LOCATION.i. The
 * directory is never derived from the number.
 *
 * That distinction only shows itself when a board is renumbered. Deleting a
 * conference shifts NAME.n/LOCATION.n down and renames the icons
 * (conference-removal.service.ts), and deliberately leaves the directories
 * alone, because the messages and uploads inside one belong to the conference
 * rather than to its position. So on the live board, after the sysop deleted
 * conference 1:
 *
 *   NAME.1=Amiga Warez!   LOCATION.1=BBS:Conf2/
 *
 * Any reader that builds `Conf<n>` from the number then reads the directory of
 * the conference that was DELETED - which is how file listing came back empty
 * for the conference that had moved into position 1.
 *
 * One resolver, so the writer and the readers cannot drift apart again.
 */

import * as fs from 'fs';
import * as path from 'path';
import { loadConfConfig } from '../services/conf-config.service';
import * as amigafs from '../utils/amigafs';
import { BBSPaths } from '../utils/bbs-paths.util';

/**
 * Which conferences the board HAS, as numbers - 1..NCONFS.
 *
 * Not the `Conf<n>` directories on disk. Deleting a conference shifts the
 * entries down and leaves the directories alone, so a board with five
 * conferences can carry fourteen directories, nine of them belonging to
 * conferences that no longer exist. Reading the disk instead of ConfConfig.info
 * invents those nine back: the screen manager listed fourteen conferences for
 * CONF_JOINMSGBASE on the live board, six through fourteen reading directories
 * nothing joins.
 *
 * Falls back to the directories only when there is no ConfConfig.info at all,
 * which is what a board that has never been configured looks like - the same
 * fallback conferenceDir() makes, for the same reason.
 */
export function conferenceNumbers(bbsRoot: string): number[] {
  try {
    const config = loadConfConfig(bbsRoot);
    if (config && config.confCount > 0) {
      return Array.from({ length: config.confCount }, (_, i) => i + 1);
    }
  } catch { /* fall through to the directories */ }

  try {
    return fs.readdirSync(bbsRoot)
      .filter(entry => /^Conf\d+$/.test(entry))
      .map(entry => parseInt(entry.slice(4), 10))
      .filter(n => Number.isFinite(n))
      .sort((a, b) => a - b);
  } catch {
    return [];
  }
}

/**
 * The conference's directory, absolute.
 *
 * Falls back to `<bbsRoot>/Conf<n>` when the board has no ConfConfig.info, the
 * entry carries no LOCATION, or the number is past NCONFS - which is what
 * express.e's own default amounts to, and what every board that has never been
 * renumbered looks like.
 */
export function conferenceDir(bbsRoot: string, conferenceNumber: number): string {
  const fallback = path.join(bbsRoot, `Conf${conferenceNumber}`);

  let location = '';
  try {
    const config = loadConfConfig(bbsRoot);
    location = config?.entries[conferenceNumber - 1]?.location?.trim() ?? '';
  } catch {
    return caseResolved(fallback);
  }

  if (!location) return caseResolved(fallback);

  // LOCATION is an Amiga path - `BBS:Conf2/` - with a trailing slash that
  // path.join would otherwise carry into the directory name.
  const cleaned = location.replace(/[\\/]+$/, '');
  const resolved = cleaned.includes(':')
    ? new BBSPaths(bbsRoot).resolveAmigaPath(cleaned)
    : path.resolve(bbsRoot, cleaned);

  return caseResolved(resolved || fallback);
}

/**
 * The last step every exit of conferenceDir() takes.
 *
 * AmigaDOS is case-insensitive; ext4 under the Linux container is not. A sysop
 * who writes `LOCATION.2=BBS:elitearea/` for a directory that sits on disk as
 * `EliteArea/` gets a path that exists on the macOS dev machine and ENOENTs on
 * the board. amigafs.resolveExistingAncestors() walks the deepest EXISTING
 * ancestor, so a directory that is not there yet still lands inside its
 * correctly-cased parent instead of minting a lowercase twin beside it.
 */
function caseResolved(hostPath: string): string {
  return amigafs.resolveExistingAncestors(hostPath);
}

/** A path inside the conference's directory - `Files`, `MsgBase`, `DIR3`. */
export function conferenceSubdir(bbsRoot: string, conferenceNumber: number, ...parts: string[]): string {
  return path.join(conferenceDir(bbsRoot, conferenceNumber), ...parts);
}

/**
 * The conference's location in the form a 68K door expects: `BBS:Conf2/`,
 * with the trailing slash a door concatenates onto.
 *
 * BB_CONFLOCAL, BB_PCONFLOCAL and MSGBASE_LOC all answer with this. Built from
 * the number instead, a door on a renumbered board is told to write into the
 * directory of the conference that was deleted.
 *
 * @param parts optional subdirectory, e.g. 'MsgBase' -> `BBS:Conf2/MsgBase/`
 */
export function conferenceAmigaPath(bbsRoot: string, conferenceNumber: number, ...parts: string[]): string {
  let location = '';
  try {
    const config = loadConfConfig(bbsRoot);
    location = config?.entries[conferenceNumber - 1]?.location?.trim() ?? '';
  } catch {
    location = '';
  }

  const base = location || `BBS:Conf${conferenceNumber}/`;
  const withoutTrailer = base.replace(/[\\/]+$/, '');
  const suffix = parts.length ? `/${parts.join('/')}` : '';

  return `${withoutTrailer}${suffix}/`;
}
