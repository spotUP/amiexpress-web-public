/**
 * Unicode (box drawing, block elements, the few symbols a BBS prints) ->
 * PETSCII byte.
 *
 * Only glyphs whose SCREEN CODE renders the same in BOTH charset banks are
 * mapped as plain bytes: screen codes $60-$7F (PETSCII $A0-$BF) EXCEPT the
 * two that diverge ($69 and $7A), plus $40 (horizontal bar), $5B (cross),
 * $5C (left half medium shade, the same bitmap in both banks) and $5D
 * (vertical bar), and the bank-1-only check mark (screen code $7A ->
 * PETSCII $BA) since transduced text is always printed in bank 1. Screen
 * codes $41-$5A are LETTERS in bank 1, so the bank-0-only graphics that live
 * there - card suits, the bullet, the rounded corners, the diagonals - are
 * substituted with punctuation instead of mapped, or they would come out as
 * random capitals.
 *
 * Glyphs that exist in bank 1 ONLY - a different bitmap lives at the same
 * screen code in bank 0 - are kept OUT of this map and listed in
 * UNICODE_TO_PETSCII_BANK1_ONLY below, which `asciiToPetsciiByte` consults
 * only when it is encoding for bank 1.
 *
 * Glyphs PETSCII only has as the INVERSE of another glyph carry `{ rvs }`;
 * the transducer wraps those in $12/$92 and restores the latched SGR reverse
 * afterwards.
 *
 * Every byte here is `screenCodeToPetscii(sc)` of the screen code the repo's
 * normative screen-code -> Unicode table assigns to that glyph:
 * web/backend/src/utils/petscii-unicode-map.ts (`SCREENCODE_TO_UNICODE`,
 * transcribed from the Unicode Consortium's C64IPRI.TXT / C64IALT.TXT
 * interchange mappings, L2/19-025). The inverse was generated from that file
 * and is pinned cell by cell in tests/petscii/unicode-to-petscii.test.ts.
 * See also thoughts/shared/research/2026-09-01_true-petscii-reference.md
 * sections 2 and 4.3.
 */
const R = (byte: number) => ({ rvs: byte });

export const UNICODE_TO_PETSCII: ReadonlyMap<string, number | { rvs: number }> = new Map<string, number | { rvs: number }>([
  // single-line box drawing (screen codes $40, $5D, $5B, $70, $6E, $6D, $7D, $6B, $73, $72, $71)
  ['─', 0xC0], ['│', 0xDD], ['┼', 0xDB],
  ['┌', 0xB0], ['┐', 0xAE], ['└', 0xAD], ['┘', 0xBD],
  ['├', 0xAB], ['┤', 0xB3], ['┬', 0xB2], ['┴', 0xB1],
  // heavy, double and rounded variants -> the single-line glyphs (the text bank has no others)
  ['━', 0xC0], ['┃', 0xDD],
  ['═', 0xC0], ['║', 0xDD], ['╬', 0xDB],
  ['╔', 0xB0], ['╗', 0xAE], ['╚', 0xAD], ['╝', 0xBD],
  ['╠', 0xAB], ['╣', 0xB3], ['╦', 0xB2], ['╩', 0xB1],
  ['╭', 0xB0], ['╮', 0xAE], ['╯', 0xBD], ['╰', 0xAD],
  // block elements (screen codes $61-$67, $6C, $7B, $7C, $7E, $7F)
  ['▌', 0xA1], ['▄', 0xA2], ['▔', 0xA3], ['▁', 0xA4],
  ['▏', 0xA5], ['▒', 0xA6], ['▕', 0xA7],
  ['▗', 0xAC], ['▖', 0xBB], ['▝', 0xBC], ['▘', 0xBE], ['▚', 0xBF],
  ['░', 0xA6], ['▓', 0xA6],
  // the eighth/quarter blocks and the two medium shades (screen codes $5C,
  // $68, $6A, $6F, $74-$79) - the same bitmap in BOTH banks, verified glyph
  // by glyph against the character ROM. Astral code points are written
  // escaped, as the backend's normative table writes them: most editors and
  // terminals have no font for them.
  ['▂', 0xAF],            // LOWER ONE QUARTER BLOCK      (sc $6F)
  ['▃', 0xB9],            // LOWER THREE EIGHTHS BLOCK    (sc $79)
  ['▎', 0xB4],            // LEFT ONE QUARTER BLOCK       (sc $74)
  ['▍', 0xB5],            // LEFT THREE EIGHTHS BLOCK     (sc $75)
  ['\u{1FB87}', 0xAA],         // RIGHT ONE QUARTER BLOCK      (sc $6A)
  ['\u{1FB88}', 0xB6],         // RIGHT THREE EIGHTHS BLOCK    (sc $76)
  ['\u{1FB82}', 0xB7],         // UPPER ONE QUARTER BLOCK      (sc $77)
  ['\u{1FB83}', 0xB8],         // UPPER THREE EIGHTHS BLOCK    (sc $78)
  ['\u{1FB8C}', 0xDC],         // LEFT HALF MEDIUM SHADE       (sc $5C)
  ['\u{1FB8F}', 0xA8],         // LOWER HALF MEDIUM SHADE      (sc $68)
  // blocks PETSCII only has as the inverse of another glyph
  ['█', R(0x20)], ['▀', R(0xA2)], ['▐', R(0xA1)],
  ['▛', R(0xAC)], ['▜', R(0xBB)], ['▙', R(0xBC)], ['▟', R(0xBE)], ['▞', R(0xBF)],
  // symbols
  ['✓', 0xBA], ['£', 0x5C], ['↑', 0x5E], ['←', 0x5F],
  ['•', 0x2A], ['·', 0x2E], ['●', 0x2A],
  ['♠', 0x2A], ['♥', 0x2A], ['♦', 0x2A], ['♣', 0x2A],
  ['→', 0x3E],
  ['\u00A0', 0x20],   // NO-BREAK SPACE (written escaped: invisible in source)
  // MACRON, the Amiga's byte $AF (latin1 is how a 68K door's output is decoded:
  // amiga-emulation/api/DosLibrary.ts:1222). Amiga BBS art draws a horizontal
  // rule at the TOP of the cell with it and the mirror rule at the BOTTOM with
  // '_', in pairs - dRE!WAll's STYLE.2 and STYLE.4 are `___` / ticks / `¯¯¯`,
  // and 636 bytes of it sit in the board's own door screens. asciiToPetsciiByte
  // has mapped '_' to $A4 (screen code $64, LOWER ONE EIGHTH BLOCK) since the
  // table was written; this is the same decision for the other half of the
  // pair. Rasterised 8x8 from the PetMe64 outlines the terminal renders from
  // (PUA $E000 + bank*$100 + screen code), screen code $63 is one lit pixel row
  // at the TOP in BOTH banks and $64 one lit row at the bottom in both, so this
  // belongs in the shared, bank-agnostic table and not in the bank-1-only one.
  // Before this row a C64 caller got '?' for every cell of such a rule.
  ['\u00AF', 0xA3],   // MACRON -> UPPER ONE EIGHTH BLOCK (sc $63)
]);

/**
 * Glyphs the C64 can print in bank 1 (the shifted/text bank all transduced
 * text is printed in) where the SAME screen code is a different bitmap in
 * bank 0. They are deliberately not in the map above, which is bank-agnostic
 * and is also used to encode into bank 0 art: emitting these bytes there
 * would print pi for a checkerboard and a solid triangle for a diagonal
 * fill - a different glyph, not a near miss. `asciiToPetsciiByte` reaches
 * this table only when `bank === 1`; in bank 0 they still degrade to '?',
 * which is honest, because bank 0 genuinely has no such glyph.
 *
 * Bank 0 at these screen codes, for the record: $5E pi, $5F U+25E5 BLACK
 * UPPER RIGHT TRIANGLE, $69 U+25E4 BLACK UPPER LEFT TRIANGLE.
 *
 * The check mark above ($7A -> $BA) is bank-divergent too and stays in the
 * shared map: that is a standing decision this table does not reopen, and
 * moving it would change what bank 0 art already encodes to.
 */
export const UNICODE_TO_PETSCII_BANK1_ONLY: ReadonlyMap<string, number> = new Map<string, number>([
  ['\u{1FB96}', 0xDE],         // INVERSE CHECKER BOARD FILL      (sc $5E)
  ['\u{1FB98}', 0xDF],         // UPPER LEFT TO LOWER RIGHT FILL  (sc $5F)
  ['\u{1FB99}', 0xA9],         // UPPER RIGHT TO LOWER LEFT FILL  (sc $69)
]);
