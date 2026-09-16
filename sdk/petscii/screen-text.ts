/**
 * READING TEXT BACK OFF A PETSCII SCREEN, so a caller can copy it.
 *
 * A PETSCII session renders to a `<canvas>`, not to xterm - the whole screen
 * is pixels, and the browser has no text in it to select. "i cant copy text in
 * petscii mode" (the sysop, 2026-09-16) is that, and the only way out is to
 * read the characters back out of the machine's screen memory ourselves.
 *
 * What is stored there is SCREEN CODES, not characters: the C64's video matrix
 * holds the glyph index, with bit 7 meaning reverse video. `screenCodeToPetscii`
 * undoes the matrix ordering; what is left is PETSCII, which then has to be
 * folded to something a clipboard is useful with.
 *
 * THE CASE FOLD IS THE INTERESTING PART. In the C64's uppercase/graphics bank
 * the letters a caller reads as capitals live at $C1-$DA (the "shifted" range)
 * and $41-$5A holds graphics. Copying the raw bytes gives text that pastes as
 * line-drawing junk, so the shifted letter range is folded down to ASCII, which
 * is what the caller believes they are looking at. Everything outside printable
 * ASCII becomes a space rather than a replacement glyph: a screenful of C64
 * block graphics should paste as the words in it, with the art as blanks,
 * rather than as a wall of question marks.
 */
import { screenCodeToPetscii } from './screen-codes';

/** The screen memory a `PetsciiMachine` exposes, and its shape. */
export interface PetsciiScreenState {
  cols: number;
  rows: number;
  screen: Uint8Array;
}

/** A rectangle of cells, in screen coordinates. */
export interface CellRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Two corners of a drag, in either order, as the rectangle they enclose. */
export function rectFromCorners(
  a: { x: number; y: number },
  b: { x: number; y: number },
): CellRect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.abs(a.x - b.x) + 1, h: Math.abs(a.y - b.y) + 1 };
}

/** One screen code as the character a caller would say they see. */
function cellToChar(code: number): string {
  // Bit 7 is reverse video, not a different glyph.
  const petscii = screenCodeToPetscii(code & 0x7f);
  // The shifted letter range reads as capitals on a C64 screen.
  const folded = petscii >= 0xc1 && petscii <= 0xda ? petscii - 0x80 : petscii;
  // Anything that is not printable ASCII is art, and art pastes as a blank.
  return folded >= 0x20 && folded <= 0x7e ? String.fromCharCode(folded) : ' ';
}

/**
 * The text inside `rect`, as lines.
 *
 * Trailing blanks on each row are dropped - a 40-column screen is mostly
 * padding, and nobody wants it in their paste buffer - but interior spacing is
 * kept, because that is what holds a table's columns apart.
 */
export function screenTextInRect(state: PetsciiScreenState, rect: CellRect): string {
  const { cols, rows, screen } = state;
  const x0 = Math.max(0, rect.x);
  const y0 = Math.max(0, rect.y);
  const x1 = Math.min(cols, rect.x + rect.w);
  const y1 = Math.min(rows, rect.y + rect.h);

  const lines: string[] = [];
  for (let y = y0; y < y1; y++) {
    let line = '';
    for (let x = x0; x < x1; x++) {
      line += cellToChar(screen[y * cols + x] ?? 0x20);
    }
    lines.push(line.replace(/\s+$/, ''));
  }
  return lines.join('\n');
}
