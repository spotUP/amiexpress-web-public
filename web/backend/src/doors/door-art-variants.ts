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
 */
import * as fs from 'fs';
import * as path from 'path';

import { petsciiColumnsOf, C64_COLUMNS } from '../amiga-emulation/xim/screen-width.util';

/** The two narrow alphabets this board serves. */
export type ArtAlphabet = 'c64' | 'ttx';

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
  alphabet: ArtAlphabet,
): string {
  return path.join(
    artRoot,
    'doors',
    String(command).toUpperCase(),
    `${String(section).toLowerCase()}.${alphabet}.ans`,
  );
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
  alphabet: ArtAlphabet,
): string[] | null {
  try {
    const raw = fs.readFileSync(variantPath(artRoot, command, section, alphabet));
    const text = raw.toString('latin1');
    const lines = text.split(/\r\n|\n/);
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    return lines;
  } catch {
    return null;
  }
}

/** Save a drawing. Throws on a row wider than the caller's screen. */
export function writeVariant(
  artRoot: string,
  command: string,
  section: string,
  alphabet: ArtAlphabet,
  lines: string[],
): void {
  for (const [i, line] of lines.entries()) {
    const width = columnsOf(line);
    if (width > VARIANT_COLUMNS) {
      throw new Error(`line ${i + 1}: ${width} columns, at most ${VARIANT_COLUMNS}`);
    }
  }
  const full = variantPath(artRoot, command, section, alphabet);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  const temp = `${full}.tmp`;
  fs.writeFileSync(temp, Buffer.from(lines.join('\n'), 'latin1'));
  fs.renameSync(temp, full);
}
