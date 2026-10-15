/**
 * THE SWEDISH CHARACTER SET, read off the ROM that defines it.
 *
 * Standard PETSCII has no a-ring or umlauts: keymap.ts maps a-z, A-Z, digits,
 * punctuation and @[\]^_, and anything else returned null - so a Swedish
 * caller on a Swedish board could not type their own name ("petscii is
 * missing swedish characters as well", 2026-09-13). C64s sold in Sweden
 * shipped character ROM 325018-02, which puts the letters where the
 * bracket/pound trio sits.
 *
 * THE BITMAPS BELOW ARE THAT ROM, not a rendering of it and not a font's idea
 * of it: the sysop supplied characters.325018-02.bin and each `rom` field is
 * the eight bytes at that glyph's offset. This is the oracle the first cut of
 * this file said it lacked, and it corrected the table - see the text bank.
 *
 * WHAT THE ROM SAYS:
 *
 *   bank 0, the uppercase/graphics set: $1B $1C $1D are A-umlaut, O-umlaut,
 *     A-ring. Its $5B-$5D stay graphics, untouched.
 *   bank 1, THE TEXT BANK THIS BOARD RUNS: $1B $1C $1D are the LOWERCASE
 *     letters, and $5B $5C $5D are the uppercase ones - both cases, which an
 *     inferred table had wrong by half.
 *
 * THE COLLISION, stated plainly: PETSCII $5C is `£`, and this board's MCI
 * already uses it for the column tab `£t<nn>`. In a Swedish session $5C is
 * O-umlaut instead, so a screen that leans on a literal £ renders an O-umlaut
 * to that caller. That is why this is a VARIANT a session opts into and never
 * the default - an ordinary PETSCII session keeps its pound sign.
 */

export interface SwedishGlyph {
  /** The byte on the wire, in and out. */
  petscii: number;
  /** Where it is drawn: the glyph's index within its charset bank. */
  screenCode: number;
  /** The character a caller means by it. */
  char: string;
  /** 0 uppercase/graphics, 1 text. */
  bank: 0 | 1;
  /** The eight rows of the glyph, MSB leftmost, straight out of 325018-02. */
  rom: readonly number[];
}

export const SWEDISH_GLYPHS: readonly SwedishGlyph[] = [
  { petscii: 0x5B, screenCode: 0x1B, char: 'Ä', bank: 0, rom: [0x66, 0x18, 0x3C, 0x66, 0x7E, 0x66, 0x66, 0x00] },
  { petscii: 0x5C, screenCode: 0x1C, char: 'Ö', bank: 0, rom: [0x66, 0x3C, 0x66, 0x66, 0x66, 0x66, 0x3C, 0x00] },
  { petscii: 0x5D, screenCode: 0x1D, char: 'Å', bank: 0, rom: [0x18, 0x24, 0x3C, 0x66, 0x7E, 0x66, 0x66, 0x00] },
  { petscii: 0x5B, screenCode: 0x1B, char: 'ä', bank: 1, rom: [0x66, 0x00, 0x3C, 0x02, 0x3E, 0x62, 0x3E, 0x00] },
  { petscii: 0x5C, screenCode: 0x1C, char: 'ö', bank: 1, rom: [0x66, 0x00, 0x3C, 0x66, 0x66, 0x66, 0x3C, 0x00] },
  { petscii: 0x5D, screenCode: 0x1D, char: 'å', bank: 1, rom: [0x1C, 0x14, 0x1C, 0x06, 0x3E, 0x62, 0x3E, 0x00] },
  { petscii: 0x7B, screenCode: 0x5B, char: 'Ä', bank: 1, rom: [0x66, 0x18, 0x3C, 0x66, 0x7E, 0x66, 0x66, 0x00] },
  { petscii: 0x7C, screenCode: 0x5C, char: 'Ö', bank: 1, rom: [0x66, 0x3C, 0x66, 0x66, 0x66, 0x66, 0x3C, 0x00] },
  { petscii: 0x7D, screenCode: 0x5D, char: 'Å', bank: 1, rom: [0x18, 0x24, 0x3C, 0x66, 0x7E, 0x66, 0x66, 0x00] },
];

/** What a Swedish caller's keyboard sends. Shift gives the capital, as on a C64. */
export const SWEDISH_KEY_TO_PETSCII: Readonly<Record<string, number>> = {
  'ä': 0x5B, 'ö': 0x5C, 'å': 0x5D,
  'Ä': 0x7B, 'Ö': 0x7C, 'Å': 0x7D,
};

/**
 * And back: the bytes read as the Latin-1 letters the board already speaks
 * everywhere else (toAmigaLatin1 keeps U+00A0-U+00FF, which is where these
 * six live). Case survives the round trip, because the ROM gives each its own
 * byte rather than leaving it to the charset bank.
 */
export const SWEDISH_PETSCII_TO_CHAR: Readonly<Record<number, string>> = {
  0x5B: 'ä', 0x5C: 'ö', 0x5D: 'å',
  0x7B: 'Ä', 0x7C: 'Ö', 0x7D: 'Å',
};
