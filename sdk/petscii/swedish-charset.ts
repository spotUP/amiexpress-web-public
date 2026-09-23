/**
 * THE SWEDISH CHARACTER ROM, IN BOTH DIRECTIONS.
 *
 * A C64 sold in Sweden shipped ROM 325018-02, which puts a-ring and the two
 * umlauts where the bracket/pound trio sits on an American machine. Without
 * it a Swedish caller cannot type their own name - and on this board that
 * is not a hypothetical: "åäö shows as aao in petscii mode when i type"
 * (the sysop, 2026-09-23).
 *
 * `aao` is the OUTPUT half. `unicode-to-petscii.ts` folds every accented
 * Latin-1 letter onto its base letter, which is the right answer for a
 * standard machine that genuinely has no glyph for it, and the wrong one
 * for a session whose ROM does.
 *
 * ONE table, because there were two halves of one in two packages: the
 * input decode had its own copy, and `packages/terminal/src/petscii/
 * swedish.ts` has the KEY map and the ROM bitmaps the canvas draws with.
 * A key map is a different thing; this is the charset.
 */

/** PETSCII byte -> the Latin-1 letter the board speaks everywhere else. */
export const SWEDISH_PETSCII_TO_CHAR: { readonly [byte: number]: string } = {
  0x5b: 'ä', // a-diaeresis
  0x5c: 'ö', // o-diaeresis
  0x5d: 'å', // a-ring
  // Shifted, which ROM 325018-02 gives its own glyphs in the text bank - so
  // case survives the wire instead of depending on the charset bank.
  0x7b: 'Ä',
  0x7c: 'Ö',
  0x7d: 'Å',
};

/** The Latin-1 letter -> the PETSCII byte that draws it on a Swedish ROM. */
export const SWEDISH_CHAR_TO_PETSCII: { readonly [char: string]: number } = {
  'ä': 0x5b,
  'ö': 0x5c,
  'å': 0x5d,
  'Ä': 0x7b,
  'Ö': 0x7c,
  'Å': 0x7d,
};

/** The byte that draws this character on a Swedish machine, or null. */
export function swedishPetsciiFor(char: string): number | null {
  const byte = SWEDISH_CHAR_TO_PETSCII[char];
  return byte === undefined ? null : byte;
}
