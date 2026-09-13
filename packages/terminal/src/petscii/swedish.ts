/**
 * THE SWEDISH CHARACTER SET, as a variant of the C64's own.
 *
 * Standard PETSCII has no å, ä or ö: keymap.ts maps a-z, A-Z, digits,
 * punctuation and @[\]^_, and anything else returns null - so a Swedish
 * caller on a Swedish board could not type their own name ("petscii is
 * missing swedish characters as well", 2026-09-13). C64s sold in Sweden
 * shipped a modified character ROM that put the three letters where three
 * symbols had been, and Swedish boards have spoken that dialect since.
 *
 * WHAT IS CERTAIN, and what is not:
 *
 * Certain - the letters replace the bracket/pound trio, in both cases. That
 * is what every Swedish C64 does and what makes the dialect recognisable.
 *
 * NOT read from an oracle: the exact screen codes below. There is no Swedish
 * ROM dump in this repository to check them against, and the project's rule
 * is to read the original rather than infer (see the C*Base reference). These
 * are the commonly documented positions; if a dump or a Swedish board says
 * otherwise, this table is the only thing that changes.
 *
 * THE COLLISION, stated plainly: PETSCII $5C is `£`, and this board's MCI
 * already uses it for the column tab `£t<nn>`. In a Swedish session $5C is Ö
 * instead, so a screen that leans on a literal £ renders an Ö to that caller.
 * That is why this is a VARIANT a session opts into and never the default -
 * an ordinary PETSCII session keeps its pound sign.
 */

/** A letter in the Swedish set: the PETSCII byte, the screen code it draws at, and the glyph. */
export interface SwedishGlyph {
  /** The byte on the wire, in and out. */
  petscii: number;
  /** Where it is drawn in the glyph atlas (screen code = petscii & 0x3F for this range). */
  screenCode: number;
  /** The character a caller means by it. */
  char: string;
  /** Which charset bank the glyph belongs to: 0 uppercase/graphics, 1 text. */
  bank: 0 | 1;
}

/**
 * Lowercase in the text bank, uppercase where the shifted forms live.
 *
 * PETSCII $5B/$5C/$5D are `[`, `£`, `]`; their screen codes are $1B/$1C/$1D.
 * The shifted trio $7B/$7C/$7D screen-codes to $3B/$3D/$3D's neighbours in
 * the same way, which is why both are listed rather than computed - a table
 * that can be checked by eye is worth more here than an arithmetic rule.
 */
export const SWEDISH_GLYPHS: readonly SwedishGlyph[] = [
  { petscii: 0x5B, screenCode: 0x1B, char: 'Ä', bank: 0 },
  { petscii: 0x5C, screenCode: 0x1C, char: 'Ö', bank: 0 },
  { petscii: 0x5D, screenCode: 0x1D, char: 'Å', bank: 0 },
  { petscii: 0x5B, screenCode: 0x1B, char: 'ä', bank: 1 },
  { petscii: 0x5C, screenCode: 0x1C, char: 'ö', bank: 1 },
  { petscii: 0x5D, screenCode: 0x1D, char: 'å', bank: 1 },
];

/** What a Swedish caller's keyboard sends: the letter they pressed -> the byte. */
export const SWEDISH_KEY_TO_PETSCII: Readonly<Record<string, number>> = {
  'ä': 0x5B, 'Ä': 0x5B,
  'ö': 0x5C, 'Ö': 0x5C,
  'å': 0x5D, 'Å': 0x5D,
};

/**
 * And back: the byte the board reads as the Latin-1 letter it already speaks
 * everywhere else (toAmigaLatin1 keeps U+00A0-U+00FF, which is where these
 * three live). Case is the caller's own bank, which the wire does not carry -
 * lowercase is the honest default for a board whose text bank is lowercase.
 */
export const SWEDISH_PETSCII_TO_CHAR: Readonly<Record<number, string>> = {
  0x5B: 'ä', 0x5C: 'ö', 0x5D: 'å',
};
