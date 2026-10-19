/**
 * Narrow art variants: the drawing a 40-column caller reads instead of the
 * door's own 80-column art.
 *
 * WHY A STORE OF ITS OWN. The wide art lives in the door's config file
 * (`Bulls.CFG`'s `[Title]` section) and an Empire door parses that file by
 * section markers in order - a second `[Title_C64_END]` section would break
 * Bulls for every caller. So the variants live outside the file the door
 * reads, and the shadow splices the right one into the copy it serves.
 *
 * WHY UNDER `Screens/`. The drawing is the BOARD'S, not the door's: it
 * survives a door re-install, and it sits where the rest of this board's
 * C64 art already is.
 *
 * `<section>.<alphabet>.ans` - the middle part says who the drawing is FOR,
 * the extension says what the bytes ARE, and they are ANSI in both cases.
 * The board's `.ttx` extension means a teletext SCREEN the screen handler
 * resolves, which this is not.
 *
 * `<section>.tti` is the one exception: the teletext caller's drawing as a
 * native packet page (the format the board's own teletext screens use), made
 * in the Studio's teletext editor. It is not ANSI, so it is rendered on the
 * way out (`renderTtiVariant`); where it exists it wins over `.ttx.ans`,
 * the order `screen.handler` uses for a board screen (`.tti` before `.ttx`).
 */
import * as fs from 'fs';
import * as path from 'path';

import { looksNativeTti, renderNativeTti } from '@amiexpress/bbs-door-sdk/teletext/render-native';

import { petsciiColumnsOf, C64_COLUMNS } from '../amiga-emulation/xim/screen-width.util';

/** The two narrow alphabets this board serves. */
export type ArtAlphabet = 'c64' | 'ttx';

/**
 * One stored drawing: an alphabet's ANSI drawing, or `tti`, the teletext
 * caller's native packet page.
 */
export type ArtVariant = ArtAlphabet | 'tti';

/** Every variant the store holds, in the order the Studio lists them. */
export const ART_VARIANTS: readonly ArtVariant[] = ['c64', 'ttx', 'tti'];

/** True for a value naming a stored variant (a route's `variant=`). */
export function isArtVariant(value: unknown): value is ArtVariant {
  return typeof value === 'string' && (ART_VARIANTS as readonly string[]).includes(value);
}

/** The caller a variant is drawn for: a `.tti` is a teletext caller's. */
export function alphabetOfVariant(variant: ArtVariant): ArtAlphabet {
  return variant === 'tti' ? 'ttx' : variant;
}

/** A variant is drawn for a 40-column screen and refused above it. */
export const VARIANT_COLUMNS = 40;

/**
 * Which drawing this caller reads, or null for everyone who reads the
 * door's own art.
 *
 * A teletext caller is 40 columns and stays ANSI; a PETSCII caller is 40 or
 * 80 and only the 40 wants a narrow drawing. `petsciiColumnsOf` is the one
 * place that question is answered for the whole board.
 */
export function alphabetFor(session: any): ArtAlphabet | null {
  if (!session) return null;
  if (session.texttvMode === true) return 'ttx';
  if (session.petsciiMode === true && petsciiColumnsOf(session) === C64_COLUMNS) return 'c64';
  return null;
}

/** Where one drawing lives. */
export function variantPath(
  artRoot: string,
  command: string,
  section: string,
  variant: ArtVariant,
): string {
  const name = String(section).toLowerCase();
  return path.join(
    artRoot,
    'doors',
    String(command).toUpperCase(),
    variant === 'tti' ? `${name}.tti` : `${name}.${variant}.ans`,
  );
}

/**
 * A `.tti` variant's lines as the ANSI rows a teletext caller reads, or null
 * when they are not a renderable packet page - the caller then gets the
 * `.ttx.ans` drawing or the door's own art, never packet text raw.
 */
export function renderTtiVariant(lines: string[] | null): string[] | null {
  if (!lines || lines.length === 0) return null;
  const text = lines.join('\n');
  if (!looksNativeTti(text)) return null;
  const rendered = renderNativeTti(text);
  if (!rendered) return null;
  const rows = rendered.ansi.split(/\r\n|\n/);
  if (rows.length > 0 && rows[rows.length - 1] === '') rows.pop();
  return rows.length > 0 ? rows : null;
}

/** Printable columns of a row: CSI sequences are zero-width. */
function columnsOf(line: string): number {
  return line.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').length;
}

/**
 * The drawing, or null when there is none.
 *
 * Null for "never drawn" AND for "cannot be read": both mean the caller
 * gets the door's own art, and neither is a reason to fail his door.
 */
export function readVariant(
  artRoot: string,
  command: string,
  section: string,
  variant: ArtVariant,
): string[] | null {
  try {
    const raw = fs.readFileSync(variantPath(artRoot, command, section, variant));
    const text = raw.toString('latin1');
    const lines = text.split(/\r\n|\n/);
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    return lines;
  } catch {
    return null;
  }
}

/**
 * Save a drawing. Throws on an ANSI row wider than the caller's screen, and
 * on a `.tti` that is not a packet page the board can render - its rows are
 * forty cells by construction, and a page that renders to nothing would sit
 * on disk silently losing to the `.ttx.ans` drawing.
 */
export function writeVariant(
  artRoot: string,
  command: string,
  section: string,
  variant: ArtVariant,
  lines: string[],
): void {
  if (variant === 'tti') {
    if (renderTtiVariant(lines) === null) {
      throw new Error('not a native teletext page (.tti with OL rows) the board can render');
    }
  } else {
    for (const [i, line] of lines.entries()) {
      const width = columnsOf(line);
      if (width > VARIANT_COLUMNS) {
        throw new Error(`line ${i + 1}: ${width} columns, at most ${VARIANT_COLUMNS}`);
      }
    }
  }
  const full = variantPath(artRoot, command, section, variant);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  const temp = `${full}.tmp`;
  fs.writeFileSync(temp, Buffer.from(lines.join('\n'), 'latin1'));
  fs.renameSync(temp, full);
}
