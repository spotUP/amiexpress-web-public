/**
 * What a door may ask the board about the conference it is running in.
 *
 * A 68K door is handed these by AEDoor - `BB_CONFLOCAL` for the directory,
 * its own `.info` for its settings. A TypeScript door had no way to ask for
 * either until the CTOP port needed both (2026-09-22), and it cannot reach
 * into the backend for them, so `BBSApi` answers and this is where the
 * answering lives - BBSApi is at its line ceiling and these are two pure
 * functions with no session in them.
 */
import * as path from 'path';

import { conferenceDir } from '../conferences/conference-paths';
import { parseInfoFile } from '../utils/info-file.util';
import * as amigafs from '../utils/amigafs';

/**
 * WHERE a conference's files are, as a host path.
 *
 * Through `conferenceDir`, the board's one resolver: a conference's directory
 * is whatever `LOCATION.n` in ConfConfig.info says, never `Conf<n>` built
 * from the number. Deleting a conference shifts the numbers down and leaves
 * the directories where they are.
 */
export function doorConferencePath(boardRoot: string, conferenceNumber: number): string {
  return conferenceDir(boardRoot, conferenceNumber);
}

/**
 * The ENABLED tooltypes of an icon under the board's directory.
 *
 * A door configured the Amiga way reads its settings out of a `.info` file -
 * `Conf<n>/Conftop.info` for CTOP - and that file is a binary icon whose
 * tooltype array the board already knows how to parse. A door parsing it
 * itself would have to re-learn which entries are DISABLED: `(ROWS=12)` and
 * `!ROWS=12` both mean "ignore this", and a scan for `ROWS=` reads a setting
 * the sysop switched off.
 *
 * A flag tooltype with no `=` comes back with an empty value, so "is it
 * there" is `key in result`. The first entry for a key wins, as
 * `FindToolType` does.
 *
 * The path may be relative to the board's directory or absolute inside it,
 * and may not leave it.
 *
 * Resolved THROUGH amigafs, as every other reader on this board resolves a
 * board path. This tree came off a case-insensitive filesystem and the live
 * volume carries `Doors/Conftop.info` where a door asks for
 * `Doors/conftop.info`; a plain `existsSync` finds it on a Mac and finds
 * nothing on the Linux host, which is the shape that has made a setting read
 * as absent in production and present in every test.
 */
export function doorTooltypes(boardRoot: string, candidate: string): Record<string, string> {
  const root = path.resolve(boardRoot);
  const full = path.resolve(root, candidate);
  if (full !== root && !full.startsWith(root + path.sep)) {
    console.warn(`[BBSApi] readTooltypes refused a path outside the board: ${candidate}`);
    return {};
  }
  try {
    const actual = amigafs.resolvePath(full);
    if (!actual) return {};
    const out: Record<string, string> = {};
    for (const tooltype of parseInfoFile(actual).tooltypes) {
      if (tooltype.commented) continue;
      if (tooltype.key in out) continue;
      out[tooltype.key] = tooltype.value;
    }
    return out;
  } catch (error) {
    console.warn(`[BBSApi] readTooltypes could not read ${candidate}: ${(error as Error).message}`);
    return {};
  }
}
