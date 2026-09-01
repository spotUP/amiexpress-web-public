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

import * as path from 'path';
import { loadConfConfig } from '../services/conf-config.service';
import { BBSPaths } from '../utils/bbs-paths.util';

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
    return fallback;
  }

  if (!location) return fallback;

  // LOCATION is an Amiga path - `BBS:Conf2/` - with a trailing slash that
  // path.join would otherwise carry into the directory name.
  const cleaned = location.replace(/[\\/]+$/, '');
  const resolved = cleaned.includes(':')
    ? new BBSPaths(bbsRoot).resolveAmigaPath(cleaned)
    : path.resolve(bbsRoot, cleaned);

  return resolved || fallback;
}

/** A path inside the conference's directory - `Files`, `MsgBase`, `DIR3`. */
export function conferenceSubdir(bbsRoot: string, conferenceNumber: number, ...parts: string[]): string {
  return path.join(conferenceDir(bbsRoot, conferenceNumber), ...parts);
}
