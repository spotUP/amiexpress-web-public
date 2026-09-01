/**
 * PETSCII screen-code -> Unicode map (Unicode 13 "Symbols for Legacy
 * Computing" era)
 *
 * Fixes audit D1-D3: the ANSI fallback path (`convertPetsciiToAnsi`, for
 * telnet callers without a PETSCII-aware font) used to render 0xA0-0xFF
 * graphics via a hand-guessed `graphicsMap` that invented box-corner and
 * block-element assignments instead of transcribing the real C64 character
 * ROM. This file replaces that guesswork with a literal 2x128 table indexed
 * by SCREEN CODE (not raw PETSCII byte - see `petsciiToScreenCode()` in
 * petscii.util.ts), covering only the base glyph domain 0x00-0x7F. Reverse
 * video (screen-code bit 7) is a caller concern: the ANSI path renders it
 * via SGR 7/27, already emitted by the $12/$92 state handlers, so it is not
 * folded into this table.
 *
 * SCREENCODE_TO_UNICODE[bank][code]:
 *   bank 0 = uppercase/graphics charset ("unshifted", PETSCII $8E, C64
 *            power-on default)
 *   bank 1 = lowercase/uppercase charset ("shifted", PETSCII $0E)
 *   code   = screen code 0x00-0x7F (mask off bit 7 before indexing)
 *
 * Source of truth: the Unicode Consortium's own C64 interchange mapping
 * files, published as part of the proposal that added Symbols for Legacy
 * Computing (U+1FB00-1FBFF) specifically so PETSCII could round-trip
 * losslessly (L2/19-025, Ewell/Bettencourt/Bánffy/Everson/Marín
 * Silva/Mårtenson/Shoulson/Steele/Turner, 2019-01-04):
 *   - MAPPINGS/C64IPRI.TXT ("Commodore 64/128 interchange primary" =
 *     unshifted/uppercase-graphics bank) - https://www.unicode.org/L2/L2019/19025-aux-mappings.zip
 *   - MAPPINGS/C64IALT.TXT ("...interchange alternate" = shifted/
 *     lowercase-uppercase bank), same archive.
 * Both files are byte-exact with the "Standard"/Commodore-64 tables in the
 * Wikipedia PETSCII article (en.wikipedia.org/wiki/PETSCII), which cites the
 * same two files plus the KreativeKorp PETSCII-to-Unicode map as its sources
 * - cross-checked line by line while building this table. The
 * pagetable.com/c64ref/charset/ reference named in the task brief is a
 * client-rendered JS chart with no static glyph text to transcribe from (it
 * could not be scraped reliably; a WebFetch summary of it even hallucinated
 * pi at screen code 0x7E, contradicted by both C64IPRI.TXT and this file's
 * own anchor tests) - the Unicode Consortium's own normative mapping files
 * are a strictly better primary source for the same C64 character ROM and
 * were used instead.
 *
 * One deliberate deviation from those files: screen code 0x60 (PETSCII
 * "shift-space", $A0/$E0) is encoded there as U+00A0 NO-BREAK SPACE, to keep
 * it distinguishable from screen code 0x20 (plain space) for lossless
 * round-tripping. This BBS's ANSI fallback has no such round-trip
 * requirement and every caller (tests, terminal rendering) treats shift-space
 * as an ordinary blank - so both banks map 0x60 to plain U+0020 SPACE here.
 *
 * Two screen codes render genuinely different glyphs depending on which
 * charset bank is active - not a letters/graphics swap, but different
 * bitmaps in the character ROM itself:
 *   - 0x69: bank 0 = U+25E4 BLACK UPPER LEFT TRIANGLE, bank 1 = U+1FB99
 *     UPPER RIGHT TO LOWER LEFT FILL
 *   - 0x7A: bank 0 = U+1FB7F RIGHT AND LOWER ONE EIGHTH BLOCK, bank 1 =
 *     U+2713 CHECK MARK
 */

// Bank 0: uppercase/graphics ("unshifted") charset, screen codes 0x00-0x7F.
const BANK0_UPPER_GRAPHICS: string[] = [
  // 0x00-0x0F: @ and A-P
  '@', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O',
  // 0x10-0x1F: P-Z, [, £, ], up-arrow, left-arrow
  'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '[', '£', ']', '↑', '←',
  // 0x20-0x2F: space, punctuation
  ' ', '!', '"', '#', '$', '%', '&', "'", '(', ')', '*', '+', ',', '-', '.', '/',
  // 0x30-0x3F: digits, punctuation
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', ':', ';', '<', '=', '>', '?',
  // 0x40-0x4F: box-drawing / card-suit / eighth-block graphics
  '─', '♠', '\u{1FB72}', '\u{1FB78}', '\u{1FB77}', '\u{1FB76}', '\u{1FB7A}', '\u{1FB71}',
  '\u{1FB74}', '╮', '╰', '╯', '\u{1FB7C}', '╲', '╱', '\u{1FB7D}',
  // 0x50-0x5F: more graphics, ending with cross / pipe / pi / triangle
  '\u{1FB7E}', '•', '\u{1FB7B}', '♥', '\u{1FB70}', '╭', '╳', '○',
  '♣', '\u{1FB75}', '♦', '┼', '\u{1FB8C}', '│', 'π', '◥',
  // 0x60-0x6F: shift-space (rendered as plain space, see file header), half/eighth blocks
  ' ', '▌', '▄', '▔', '▁', '▏', '▒', '▕',
  '\u{1FB8F}', '◤', '\u{1FB87}', '├', '▗', '└', '┐', '▂',
  // 0x70-0x7F: box-drawing corners, quarter/eighth blocks, quadrants
  '┌', '┴', '┬', '┤', '▎', '▍', '\u{1FB88}', '\u{1FB82}',
  '\u{1FB83}', '▃', '\u{1FB7F}', '▖', '▝', '┘', '▘', '▚',
];

// Bank 1: lowercase/uppercase ("shifted") charset, screen codes 0x00-0x7F.
const BANK1_LOWER_UPPER: string[] = [
  // 0x00-0x0F: @ and a-o
  '@', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o',
  // 0x10-0x1F: p-z, [, £, ], up-arrow, left-arrow
  'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', '[', '£', ']', '↑', '←',
  // 0x20-0x2F: space, punctuation (identical to bank 0)
  ' ', '!', '"', '#', '$', '%', '&', "'", '(', ')', '*', '+', ',', '-', '.', '/',
  // 0x30-0x3F: digits, punctuation (identical to bank 0)
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', ':', ';', '<', '=', '>', '?',
  // 0x40-0x4F: horizontal bar, then A-O uppercase
  '─', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O',
  // 0x50-0x5F: P-Z, cross, left-half-shade, pipe, inverse checkerboard, diagonal fill
  'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '┼', '\u{1FB8C}', '│',
  '\u{1FB96}', '\u{1FB98}',
  // 0x60-0x6F: shift-space (plain space), half/eighth blocks (mostly shared with bank 0)
  ' ', '▌', '▄', '▔', '▁', '▏', '▒', '▕',
  '\u{1FB8F}', '\u{1FB99}', '\u{1FB87}', '├', '▗', '└', '┐', '▂',
  // 0x70-0x7F: box-drawing corners, quarter/eighth blocks, check mark, quadrants
  '┌', '┴', '┬', '┤', '▎', '▍', '\u{1FB88}', '\u{1FB82}',
  '\u{1FB83}', '▃', '✓', '▖', '▝', '┘', '▘', '▚',
];

/**
 * Screen code (0x00-0x7F) -> Unicode glyph, one 128-entry array per charset
 * bank. Index with `SCREENCODE_TO_UNICODE[shiftMode ? 1 : 0][screenCode & 0x7F]`.
 */
export const SCREENCODE_TO_UNICODE: [string[], string[]] = [BANK0_UPPER_GRAPHICS, BANK1_LOWER_UPPER];
