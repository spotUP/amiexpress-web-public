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

/** One entry of the board's screen-type list: what the caller picks, and the extension it adds. */
export interface BoardScreenType {
  /** TITLE.n - what chooseScreenType lists and what this port stores on the user. */
  title: string;
  /** TYPE.n with the leading dot express.e adds - `.TXT.GR`, `.IBM`. */
  extension: string;
}

let screenTypesCache: { file: string; stamp: number; types: BoardScreenType[] } | null = null;

/**
 * The board's screen types, in express.e's order.
 *
 * express.e:31899-31926 reads TITLE.n / TYPE.n from ScreenTypes.info starting
 * at 1 and STOPS at the first pair that is missing or empty; a TYPE without a
 * leading dot gets one. `screenTypeExt.item(i)` is then this list's entry i.
 * Cached on the file's mtime: the loader asks once per screen.
 */
export function boardScreenTypes(bbsRoot: string): BoardScreenType[] {
  const file = path.join(bbsRoot, 'ScreenTypes.info');
  let stamp: number;
  try {
    stamp = fs.statSync(file).mtimeMs;
  } catch {
    return [];
  }
  if (screenTypesCache && screenTypesCache.file === file && screenTypesCache.stamp === stamp) {
    return screenTypesCache.types;
  }

  const types: BoardScreenType[] = [];
  try {
    const tooltypes = readTooltypeMap(file);
    for (let i = 1; ; i++) {
      const title = tooltypes.get(`TITLE.${i}`) ?? '';
      const type = tooltypes.get(`TYPE.${i}`) ?? '';
      // express.e:31913 - IF (StrLen(tempstr)=0) OR (StrLen(tempstr2)=0) THEN notfound:=TRUE
      if (title.length === 0 || type.length === 0) break;
      // express.e:31917-31923 - a TYPE without a leading '.' gets one
      types.push({ title, extension: type[0] === '.' ? type : `.${type}` });
    }
  } catch {
    return [];
  }

  screenTypesCache = { file, stamp, types };
  return types;
}

/**
 * The user's screen-type extension - THE one answer to "which `.TXT.GR` /
 * `.IBM` does findSecurityScreen try for this caller".
 *
 * express.e:6264/6282/6299: `IF (loggedOnUser.screenType<screenTypeExt.count())`
 * then `screenTypeExt.item(loggedOnUser.screenType)`, else no type at all.
 * `screenType` is an index on the Amiga (user.data INT, set by
 * chooseScreenType express.e:11366 as `stat-1`). This port stores the TITLE the
 * caller picked (info-commands W option 9), so a title is looked up by name; a
 * number (user.data imports, `0.0`) is the index itself. Anything else - empty,
 * or a label that is not on this board's list such as the new-user default
 * `ANSI` - is a user who never chose, and an Amiga user who never chose has the
 * zeroed field: index 0.
 */
export function screenTypeIndex(screenType: string | number | null | undefined, types: BoardScreenType[]): number {
  if (typeof screenType === 'number') return Number.isFinite(screenType) ? Math.trunc(screenType) : 0;
  const value = String(screenType ?? '').trim();
  if (/^\d+(\.\d+)?$/.test(value)) return Math.trunc(Number(value));
  const byTitle = types.findIndex(t => t.title.toLowerCase() === value.toLowerCase());
  return byTitle >= 0 ? byTitle : 0;
}

export function userScreenTypeExtension(
  user: { screenType?: string | number | null } | null | undefined,
  bbsRoot: string,
): string | null {
  // express.e:6263 - IF loggedOnUser<>NIL
  if (!user) return null;
  const types = boardScreenTypes(bbsRoot);
  const index = screenTypeIndex(user.screenType, types);
  // express.e:6264 - IF (loggedOnUser.screenType<screenTypeExt.count())
  return index >= 0 && index < types.length ? types[index].extension : null;
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
