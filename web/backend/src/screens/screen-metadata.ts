/**
 * What the board already knows about its own screens.
 *
 * A screen manager that says `Conf2/menu250.txt.GR` is asking the sysop to be
 * an archaeologist. Every fact needed to say it plainly is on the volume
 * already - the conference's name in ConfConfig.info, the screen type's name in
 * ScreenTypes.info, the accounts in user.data - and none of it was being read.
 *
 * Nothing here invents a label: if the board does not say it, this answers with
 * nothing rather than a guess.
 */

import * as fs from 'fs';
import * as path from 'path';
import { readTooltypeMap } from '../utils/info-file.util';

/**
 * The screen types this board defines, keyed by the extension a file carries.
 *
 * ScreenTypes.info holds `TYPE.n` / `TITLE.n` pairs - on this board
 * `TXT.GR` is "Amiga Ansi" and `IBM` is "IBM Ansi". The extension a variant
 * ends with is the last segment of the TYPE, which is what the loader matches.
 */
export function screenTypeNames(bbsRoot: string): Record<string, string> {
  const file = path.join(bbsRoot, 'ScreenTypes.info');
  if (!fs.existsSync(file)) return {};

  try {
    const tooltypes = readTooltypeMap(file);
    const names: Record<string, string> = {};

    for (const [key, value] of tooltypes.entries()) {
      const match = /^TYPE\.(\d+)$/i.exec(key);
      if (!match) continue;

      const title = tooltypes.get(`TITLE.${match[1]}`)?.trim();
      if (!title) continue;

      // `TXT.GR` is matched by its last segment, `GR` - that is the extension
      // the file on disk actually ends with.
      const extension = value.trim().split('.').pop()?.toUpperCase();
      if (extension) names[extension] = title;
    }

    return names;
  } catch {
    return {};
  }
}

/**
 * How many accounts fall inside a variant's level range.
 *
 * "Levels 20-29" is a fact about the file; "95 callers" is a fact about the
 * board, and it is the one that says whether editing this screen matters.
 * `serves` comes from the index in the two shapes express.e produces: a closed
 * range, and the top variant's open one.
 */
export function describeCallerRange(serves: string, levels: Record<number, number>): string {
  const entries = Object.entries(levels).map(([level, count]) => [Number(level), count] as const);
  if (entries.length === 0) return '';

  const open = /^(\d+) and above$/.exec(serves);
  const closed = /^(\d+)-(\d+)$/.exec(serves);
  if (!open && !closed) return '';

  const low = Number((open ?? closed)![1]);
  const high = open ? Infinity : Number(closed![2]);

  const callers = entries
    .filter(([level]) => level >= low && level <= high)
    .reduce((total, [, count]) => total + count, 0);

  return callers === 1 ? '1 caller' : callers === 0 ? 'no callers' : `${callers} callers`;
}
