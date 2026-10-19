/**
 * The 6-bit sixel pattern a mosaic glyph draws, or null when it is not one.
 *
 * Bit 0 is the top-left sixel, bit 1 top-right, then middle and bottom rows
 * the same way. The forward table in marco/render-ansi maps patterns to
 * U+1FB00 onwards with four carved out (empty, left half, right half, full)
 * because Unicode already had them elsewhere; this is that rule read back.
 */
/** U+1CE51-1CE8F: the 63 non-blank separated patterns, in pattern order. */
export const SEPARATED_SEXTANT_FIRST = 0x1ce51;
export const SEPARATED_SEXTANT_LAST = 0x1ce8f;

export function sextantBits(glyph: string): number | null {
  const cp = glyph.codePointAt(0);
  if (cp === undefined) return null;
  if (cp === 0x258c) return 21; // left half block
  if (cp === 0x2590) return 42; // right half block
  if (cp === 0x2588) return 63; // full block
  // Unicode 16 SEPARATED BLOCK SEXTANT-n: n is the pattern (teletext mode, D2).
  if (cp >= SEPARATED_SEXTANT_FIRST && cp <= SEPARATED_SEXTANT_LAST) return cp - SEPARATED_SEXTANT_FIRST + 1;
  if (cp < 0x1fb00 || cp > 0x1fb3b) return null;
  let bits = cp - 0x1fb00 + 1;
  if (bits >= 21) bits++;
  if (bits >= 42) bits++;
  return bits < 64 ? bits : null;
}
