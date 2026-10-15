/**
 * What bulletins this board has, and what they are called.
 *
 * Two questions that were answered in two places and disagreed. express.e
 * reads bulletins out of `Conf<N>/Screens/Bulletins/`; this board keeps them
 * in one `Bulletins/` directory at the root, which is where the Bulls door
 * reads them from. The internal tier looked only at the conference path and
 * told a board with twelve bulletins that it had none (sysop, 2026-09-14) -
 * the kind of answer two copies of a path always produce eventually.
 *
 * The NAMES are the door's too: Bulls.CFG's `[BullNames_END]` section, one
 * title per line against the file it belongs to, which is what the sysop
 * edits in the Studio. A teletext page listing bulletins has to show the
 * same names the door shows, or the board contradicts itself depending on
 * which screen a caller happens to be looking at.
 */
import * as path from 'path';

import * as amigafs from '../utils/amigafs';

export interface Bulletin {
  /** The number a caller types. */
  number: number;
  /** Its title, from Bulls.CFG when the board names it there. */
  title: string;
  /** `bull7` - the screen base name, without an extension. */
  base: string;
}

/** Titles a board has not filled in; the door writes a bare dash. */
const UNNAMED = new Set(['', '-', '--']);

/**
 * The directory this board keeps bulletins in for a caller's conference.
 *
 * The conference's own when it has one - that is what express.e reads - and
 * the board's otherwise. `Conf1/Bulletins` on this board is a 0-byte Amiga
 * leftover from 2020, not a directory, so "exists" is not the question;
 * "is a directory" is.
 */
export function bulletinDirFor(dataDir: string, conferenceScreenDir: string): string {
  const confBulletins = path.join(conferenceScreenDir, 'Bulletins');
  try {
    if (amigafs.existsSync(confBulletins) && amigafs.statSync(confBulletins).isDirectory()) {
      return confBulletins;
    }
  } catch {
    /* not a directory, or unreadable: the board's own is the answer */
  }
  return path.join(dataDir, 'Bulletins');
}

/**
 * `bull7.txt` -> 7. Anything else is not a bulletin, whatever it is called.
 */
function bulletinNumber(fileName: string): number | null {
  const m = /^bull(\d+)\.[a-z]+$/i.exec(fileName);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * The titles the Bulls door shows, read from its own config.
 *
 * Absent, unreadable or unnamed entries simply do not appear: a bulletin the
 * board has not named still EXISTS, and gets its number as its name.
 */
export function bulletinTitles(doorsDir: string): Map<number, string> {
  const titles = new Map<number, string>();
  const cfg = path.join(doorsDir, 'emp_tools', 'Bulls.CFG');
  let raw: string;
  try {
    const bytes = amigafs.readFileSync(cfg);
    raw = typeof bytes === 'string' ? bytes : bytes.toString('latin1');
  } catch {
    return titles;
  }

  // The section runs from the init marker to its own, one row per bulletin:
  // `Top Uploaders    ; bull1.txt`
  const start = raw.indexOf('[Init_END]');
  const end = raw.indexOf('[BullNames_END]');
  if (start < 0 || end < 0 || end < start) return titles;

  for (const line of raw.slice(start, end).split(/\r?\n/)) {
    const m = /^(.*?)\s*;\s*(bull\d+)\.[a-z]+\s*$/i.exec(line);
    if (!m) continue;
    const number = bulletinNumber(`${m[2]}.txt`);
    const title = m[1].trim();
    if (number === null || UNNAMED.has(title)) continue;
    titles.set(number, title);
  }
  return titles;
}

/**
 * Every bulletin the board can actually show, in number order.
 *
 * The FILES decide what exists - a name in Bulls.CFG with no file behind it
 * is a promise the board cannot keep - and the names decorate them.
 */
export function listBulletins(
  dataDir: string,
  conferenceScreenDir: string,
  doorsDir = path.join(dataDir, 'Doors'),
): Bulletin[] {
  const dir = bulletinDirFor(dataDir, conferenceScreenDir);
  let entries: string[];
  try {
    entries = amigafs.readdirSync(dir);
  } catch {
    return [];
  }

  const titles = bulletinTitles(doorsDir);
  const seen = new Map<number, Bulletin>();
  for (const entry of entries) {
    const number = bulletinNumber(entry);
    if (number === null || seen.has(number)) continue;
    seen.set(number, {
      number,
      title: titles.get(number) ?? `Bulletin ${number}`,
      base: `bull${number}`,
    });
  }
  return [...seen.values()].sort((a, b) => a.number - b.number);
}

/**
 * express.e:24616-24621 - "this conference has bulletins" is BullHelp present
 * in the bulletin directory. Any variant counts: a board whose bulletin menu
 * is authored as teletext has bulletins just as much as one whose menu is a
 * .txt. B's handler and the bulletins menu door ask this one question.
 */
export function conferenceHasBulletins(dataDir: string, conferenceScreenDir: string): boolean {
  const base = path.join(bulletinDirFor(dataDir, conferenceScreenDir), 'BullHelp');
  return ['.txt', '.ttx', '.seq', '.TXT'].some((ext) => amigafs.existsSync(base + ext));
}
