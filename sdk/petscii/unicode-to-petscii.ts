/**
 * Unicode (box drawing, block elements, the few symbols a BBS prints) ->
 * PETSCII byte.
 *
 * Only glyphs whose SCREEN CODE renders the same in BOTH charset banks are
 * mapped as plain bytes: screen codes $60-$7F (PETSCII $A0-$BF), plus $40
 * (horizontal bar), $5B (cross) and $5D (vertical bar), and the bank-1-only
 * check mark (screen code $7A -> PETSCII $BA) since transduced text is
 * always printed in bank 1. Screen codes $41-$5A are LETTERS in bank 1, so
 * the bank-0-only graphics that live there - card suits, the bullet, the
 * rounded corners, the diagonals - are substituted with punctuation instead
 * of mapped, or they would come out as random capitals.
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
  // blocks PETSCII only has as the inverse of another glyph
  ['█', R(0x20)], ['▀', R(0xA2)], ['▐', R(0xA1)],
  ['▛', R(0xAC)], ['▜', R(0xBB)], ['▙', R(0xBC)], ['▟', R(0xBE)], ['▞', R(0xBF)],
  // symbols
  ['✓', 0xBA], ['£', 0x5C], ['↑', 0x5E], ['←', 0x5F],
  ['•', 0x2A], ['·', 0x2E], ['●', 0x2A],
  ['♠', 0x2A], ['♥', 0x2A], ['♦', 0x2A], ['♣', 0x2A],
  ['→', 0x3E],
  ['\u00A0', 0x20],   // NO-BREAK SPACE (written escaped: invisible in source)
]);
