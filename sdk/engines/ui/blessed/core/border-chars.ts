/**
 * What a border is MADE OF, for the two alphabets this board draws in.
 *
 * An Amiga terminal gets the ASCII the board has always drawn - `.` corners,
 * `-` rules, `|` sides - and every 80-column baseline in the tree is a
 * byte-for-byte pin of exactly that, so it does not move.
 *
 * A C64 gets PETSCII's own box drawing. The character ROM has had it since
 * 1982 - screen codes $70 $6E $6D $7D for the corners, $40 for the horizontal,
 * $5D for the vertical, $6B $73 $72 $71 for the tees, $5B for the cross - and
 * `sdk/petscii/unicode-to-petscii.ts` maps the Unicode box-drawing characters
 * onto them cell for cell. Until now the C64 was shown an imitation of ASCII
 * drawn in a font that had the real thing all along: "petscii has a lot of
 * nice characters to build ui's from" (2026-09-06).
 *
 * PETSCII has no double or heavy line, so those types fall back to the single
 * one rather than inventing a look the hardware cannot draw - the same rule
 * the transducer already applies to `═` and `━`.
 */

export interface BorderChars {
  tl: string; tr: string; bl: string; br: string; h: string; v: string;
}

const ASCII: Record<string, BorderChars> = {
  line:   { tl: '.', tr: '.',  bl: '`', br: '\'', h: '-', v: '|' },
  heavy:  { tl: '+', tr: '+',  bl: '+', br: '+',  h: '=', v: '|' },
  double: { tl: '+', tr: '+',  bl: '+', br: '+',  h: '=', v: '|' },
  round:  { tl: '.', tr: '.',  bl: '`', br: '\'', h: '-', v: '|' },
  ascii:  { tl: '.', tr: '.',  bl: '`', br: '\'', h: '-', v: '|' },
  bg:     { tl: ' ', tr: ' ',  bl: ' ', br: ' ',  h: ' ', v: ' ' },
};

const PETSCII_LINE: BorderChars = { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│' };
const PETSCII_ROUND: BorderChars = { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' };

const PETSCII: Record<string, BorderChars> = {
  line:   PETSCII_LINE,
  heavy:  PETSCII_LINE,
  double: PETSCII_LINE,
  round:  PETSCII_ROUND,
  ascii:  PETSCII_LINE,
  bg:     ASCII.bg,
};

/** The glyphs for a border type, in the alphabet this screen speaks. */
export function borderCharsFor(borderType: string, petscii: boolean): BorderChars {
  const table = petscii ? PETSCII : ASCII;
  return table[borderType] ?? table.line;
}

/** Every glyph a border can be drawn with, for tests and for the frame adapter. */
export const BORDER_GLYPHS: readonly string[] = Array.from(new Set(
  [...Object.values(ASCII), ...Object.values(PETSCII)]
    .flatMap((set) => [set.tl, set.tr, set.bl, set.br, set.h, set.v]),
));
