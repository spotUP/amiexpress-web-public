/**
 * The magazine's art: title screen, banners, the mark at the end of an article.
 *
 * Two files per piece, one for each kind of caller, looked up in two places:
 *
 *   1. `<board root>/Magazine/art/<name>.<ext>` - the sysop's own. It lives on
 *      the board's data volume, so a deploy never replaces it.
 *   2. `Doors/magazine/art/<name>.<ext>` - the placeholder the door ships.
 *
 * `.ans` is Amiga ANSI (Topaz, ISO-8859-1, read and written as latin1 bytes,
 * never as UTF-8: a high-bit glyph read as text becomes U+FFFD). `.seq` is
 * C64 PETSCII. A PETSCII caller - and any caller on a 40-column screen -
 * gets the `.seq`; everyone else gets the `.ans`. A file that is missing or
 * empty is skipped without a word: no art is a valid magazine.
 *
 * WHO DECIDES THE KIND. The session does: `bbs.isPetsciiMode()`, the same
 * question `createScreen` asks to set `screen.petscii`. This module does not
 * detect anything itself.
 *
 * HOW A `.seq` REACHES THE SCREEN. The door draws through blessed, and the
 * board's transducer turns blessed's Unicode back into PETSCII for a C64, so
 * raw PETSCII bytes cannot be written. The `.seq` is replayed through the
 * board's own `PetsciiMachine` (the reader every `.seq` on the board goes
 * through, board charset bank first), and each cell is set as its Unicode
 * glyph (`SCREENCODE_TO_UNICODE`) in the nearest-VIC colour, reverse video
 * kept as reverse video. The transducer then maps those cells back to the
 * bytes the artist drew; the tests prove that round trip cell for cell.
 */
import * as fs from 'fs';
import * as path from 'path';
import { BOARD_CHARSET_BANK, C64_PALETTE_COLODORE, PetsciiMachine, SCREENCODE_TO_UNICODE, type PetsciiMachineState } from '@amiexpress/bbs-door-sdk/petscii';
import type { Desk } from '@amiexpress/bbs-door-sdk/formats/magazine';

/** Every piece of art the door asks for, by name. */
export const ART_NAMES = [
  'mag_title', 'mag_front', 'mag_contents', 'mag_goodbye', 'mag_article_end', 'mag_logo_small', 'mag_loading',
  'sec_hack', 'sec_scene', 'sec_graffiti', 'sec_music', 'sec_people', 'sec_archive', 'sec_stream', 'sec_general',
] as const;

export const SECTION_ART: Record<Desk, string> = {
  hack: 'sec_hack',
  scene: 'sec_scene',
  graffiti: 'sec_graffiti',
  music: 'sec_music',
  people: 'sec_people',
  archive: 'sec_archive',
  stream: 'sec_stream',
  general: 'sec_general',
};

/** Banner ceilings: five rows on an ANSI screen, four on the C64's forty columns. */
export const BANNER_MAX_ROWS = 5;
export const BANNER_MAX_ROWS_40 = 4;

export interface ArtSources {
  /** `<board root>/Magazine/art`: the sysop's, checked first. */
  overrideDir: string;
  /** `Doors/magazine/art`: what ships. Null when the caller wants no shipped art. */
  shippedDir: string | null;
}

/** The directory the door ships its placeholders in, from source (`Doors/magazine`) or from `dist`. */
export function shippedArtDir(startDir: string = __dirname): string {
  const base = path.basename(startDir) === 'dist' ? path.dirname(startDir) : startDir;
  return path.join(base, 'art');
}

export function overrideArtDir(magazineRootDir: string): string {
  return path.join(magazineRootDir, 'art');
}

/** The raw bytes of one file, or null when it is absent, empty or not a file. */
function readBytes(file: string): Buffer | null {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size === 0) return null;
    return fs.readFileSync(file);
  } catch {
    return null;
  }
}

export type ArtKind = 'ans' | 'seq';

export interface LoadedArt {
  kind: ArtKind;
  bytes: Buffer;
  /** Where it came from, for the tests and the log. */
  file: string;
}

/**
 * One piece of art for one caller: the override first, then the shipped
 * placeholder; the caller's kind only. Null when neither exists.
 */
export function loadArt(name: string, kind: ArtKind, sources: ArtSources): LoadedArt | null {
  const dirs = sources.shippedDir ? [sources.overrideDir, sources.shippedDir] : [sources.overrideDir];
  for (const dir of dirs) {
    const file = path.join(dir, `${name}.${kind}`);
    const bytes = readBytes(file);
    if (bytes) return { kind, bytes, file };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Bytes to rows of blessed content
// ---------------------------------------------------------------------------

const RESET = '\x1b[0m';
const SGR = /^\x1b\[[0-9;]*m/;

/** blessed reads `{` as the start of a tag. */
function escapeBraces(text: string): string {
  return text.replace(/[{}]/g, (c) => (c === '{' ? '{open}' : '{close}'));
}

/**
 * Amiga ANSI to rows: latin1 text, SGR kept, every other escape sequence (a
 * cursor move, a clear) dropped, rows clipped to `maxCols` visible cells.
 * Art moves nothing: it is drawn into a box the door has placed.
 */
export function ansiRows(bytes: Buffer, maxRows: number, maxCols: number): string[] {
  const text = bytes.toString('latin1');
  const eof = text.indexOf('\x1a');
  const body = (eof >= 0 ? text.slice(0, eof) : text).replace(/\r\n?/g, '\n').replace(/\n+$/, '');
  const rows: string[] = [];
  for (const line of body.split('\n')) {
    if (rows.length >= maxRows) break;
    let out = '';
    let cells = 0;
    for (let i = 0; i < line.length; ) {
      const rest = line.slice(i);
      if (rest[0] === '\x1b') {
        const sgr = SGR.exec(rest);
        if (sgr) { out += sgr[0]; i += sgr[0].length; continue; }
        const other = /^\x1b\[[0-9;?]*[A-Za-z]/.exec(rest);
        i += other ? other[0].length : 1;
        continue;
      }
      const ch = line[i];
      i += 1;
      if (ch < ' ' || (ch >= '\x7f' && ch < '\xa0')) continue;
      if (cells >= maxCols) continue;
      out += escapeBraces(ch);
      cells += 1;
    }
    rows.push(`${out}${RESET}`);
  }
  return rows;
}

const rgb = (hex: string): string => hex.toLowerCase();

/**
 * A `.seq` to rows: the board's PETSCII machine reads it (bank one, as the
 * board's callers are), each cell becomes a glyph in a colour, reverse video
 * stays reverse video, and trailing blank cells and rows are cut.
 */
export function seqSurface(bytes: Buffer): PetsciiMachineState {
  const machine = new PetsciiMachine();
  machine.state.charsetBank = BOARD_CHARSET_BANK;
  machine.feed(bytes);
  return machine.state;
}

export function seqRows(bytes: Buffer, maxRows: number, maxCols: number): string[] {
  const { cols, rows: height, screen, colorRam, charsetBank: bank } = seqSurface(bytes);
  const rows: string[] = [];
  for (let y = 0; y < height; y++) {
    let last = -1;
    for (let x = 0; x < Math.min(cols, maxCols); x++) {
      const code = screen[y * cols + x];
      if ((code & 0x7f) !== 0x20 || (code & 0x80)) last = x;
    }
    let out = '';
    let colour = -1;
    let reverse = false;
    for (let x = 0; x <= last; x++) {
      const code = screen[y * cols + x];
      const colourIndex = colorRam[y * cols + x] & 0x0f;
      const rvs = (code & 0x80) !== 0;
      if (colourIndex !== colour) {
        out += `{${rgb(C64_PALETTE_COLODORE[colourIndex])}-fg}`;
        colour = colourIndex;
      }
      if (rvs !== reverse) {
        out += rvs ? '{inverse}' : '{/inverse}';
        reverse = rvs;
      }
      out += escapeBraces(SCREENCODE_TO_UNICODE[bank][code & 0x7f] || ' ');
    }
    rows.push(out === "" ? "" : `${out}{/}`);
  }
  while (rows.length > 0 && rows[rows.length - 1] === '') rows.pop();
  return rows.slice(0, maxRows);
}

export function artRows(art: LoadedArt, maxRows: number, maxCols: number): string[] {
  return art.kind === 'seq' ? seqRows(art.bytes, maxRows, maxCols) : ansiRows(art.bytes, maxRows, maxCols);
}

/**
 * Which kind this caller gets. A C64 reads PETSCII, and so does any screen of
 * forty columns or fewer - the ANSI art is drawn for eighty and is never folded.
 */
export function artKindFor(petscii: boolean, width: number): ArtKind {
  return petscii || width <= 40 ? 'seq' : 'ans';
}

/** The visible text of one art row: escapes and tags gone, so a test (or a width check) reads what a caller reads. */
export function artRowText(row: string): string {
  return row
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/\{(?:#[0-9a-f]{6}-fg|\/?inverse|\/)\}/gi, '')
    .replace(/\{open\}/g, '{')
    .replace(/\{close\}/g, '}');
}
