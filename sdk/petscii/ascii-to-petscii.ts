/**
 * The ONE ASCII/Unicode -> PETSCII byte table.
 *
 * Two hand-written copies were retired into this module:
 *  - the transducer's private `printChar` (`ansi-to-petscii.ts`), which is
 *    now a thin caller of `asciiToPetsciiByte(code, 1)`;
 *  - the backend's `convertAsciiToPetsciiOutput`
 *    (`web/backend/src/utils/petscii.util.ts`), now a one-line delegate over
 *    `encodePetsciiValue`. That copy passed `\` `_` through unchanged and
 *    turned every unknown glyph into a space; this table's mappings win (see
 *    the deliberate-change table in
 *    `thoughts/shared/plans/2026-09-02-mci-in-petscii-seq.md`, Task 2).
 *
 * Charset banks. In bank 1 ($0E, shifted/text) the letters live in two
 * ranges: a-z is $41-$5A and A-Z is $C1-$DA. In bank 0 ($8E,
 * unshifted/graphics) $C1-$DA is GRAPHICS, so an uppercase letter has
 * nowhere to go - a mixed-case value folds UP to $41-$5A rather than
 * flipping the bank underneath the art (plan decision 5).
 *
 * Reference: thoughts/shared/research/2026-09-01_true-petscii-reference.md
 * sections 1.1 and 2.
 */
import { UNICODE_TO_PETSCII, UNICODE_TO_PETSCII_BANK1_ONLY } from './unicode-to-petscii';

/**
 * One PETSCII byte plus whether it is an INVERSE-only glyph: a handful of
 * Unicode glyphs (full block, the half blocks PETSCII only has one way
 * round) exist on a C64 solely as the reverse of another screen code.
 * Callers decide whether to spend the $12/$92 pair on them - the table never
 * emits control bytes of its own.
 */
export interface PetsciiByteMapping {
  byte: number;
  needsReverse: boolean;
}

const plain = (byte: number): PetsciiByteMapping => ({ byte, needsReverse: false });

/**
 * ASCII / Unicode code point -> PETSCII byte in `bank`.
 *
 * Order matters and is the transducer's original order: letters, then the
 * $20-$3F block that passes through, then the handful of ASCII punctuation
 * PETSCII puts elsewhere, then the shared Unicode table, then '?'.
 */
export function asciiToPetsciiByte(code: number, bank: 0 | 1): PetsciiByteMapping {
  if (code >= 0x61 && code <= 0x7A) return plain(code - 0x20);                    // a-z -> $41-$5A
  if (code >= 0x41 && code <= 0x5A) return plain(bank === 1 ? code + 0x80 : code); // A-Z -> $C1-$DA / fold
  if (code >= 0x20 && code <= 0x3F) return plain(code);
  switch (code) {
    case 0x08: case 0x7F: return plain(0x14);      // BS / DEL -> PETSCII DELETE (retired backend table's case)
    case 0x40: case 0x5B: case 0x5D: return plain(code); // @ [ ]
    case 0x5C: return plain(0x2F);                 // backslash: PETSCII has pound there -> '/'
    case 0x5E: return plain(0x5E);                 // ^ -> up-arrow glyph
    case 0x5F: return plain(0xA4);                 // _ -> lower one-eighth block (PETSCII underline)
    case 0x60: return plain(0x27);                 // ` -> '
    case 0x7B: return plain(0x28);                 // { -> (
    case 0x7D: return plain(0x29);                 // } -> )
    case 0x7C: return plain(0xDD);                 // | -> vertical bar graphic (same glyph in both banks)
    case 0x7E: return plain(0x2D);                 // ~ -> -
  }
  const glyph = String.fromCodePoint(code);
  // The shared table is bank-agnostic; the three fills whose screen code is a
  // different bitmap in bank 0 are only reachable when encoding for bank 1.
  const mapped = UNICODE_TO_PETSCII.get(glyph)
    ?? (bank === 1 ? UNICODE_TO_PETSCII_BANK1_ONLY.get(glyph) : undefined);
  if (mapped === undefined) return plain(0x3F);    // unsupported glyph -> '?'
  if (typeof mapped === 'number') return plain(mapped);
  return { byte: mapped.rvs, needsReverse: true }; // glyph only exists as the inverse of another
}

export interface EncodePetsciiValueOptions {
  /** The art's reverse state at the substitution point (plan decision 6). */
  reverseState?: boolean;
  /**
   * Allow the $12 ... $92 pair around an inverse-only glyph. Off by default
   * because an MCI value substituted into `.seq` art must not leave the
   * art's reverse state anywhere but where it found it; with it off such a
   * glyph degrades to '?'.
   */
  allowReverseToggle?: boolean;
}

/**
 * Text -> PETSCII bytes in ONE bank.
 *
 * Emits NO charset switch and NO colour byte: a substituted MCI value
 * inherits the art's current bank, pen and reverse state (plan decisions 5
 * and 6). `\r`, `\n` and `\r\n` all collapse to a single $0D - the C64's
 * RETURN is both.
 */
export function encodePetsciiValue(
  text: string,
  bank: 0 | 1,
  opts: EncodePetsciiValueOptions = {},
): number[] {
  const reverseState = opts.reverseState ?? false;
  const allowReverseToggle = opts.allowReverseToggle ?? false;
  const out: number[] = [];
  for (let i = 0; i < text.length; ) {
    const cp = text.codePointAt(i) as number;
    const width = cp > 0xFFFF ? 2 : 1;
    if (cp === 0x0D) {
      out.push(0x0D);
      i += width;
      if (text.charCodeAt(i) === 0x0A) i++; // \r\n is ONE return on a C64
      continue;
    }
    if (cp === 0x0A) { out.push(0x0D); i += width; continue; }
    const { byte, needsReverse } = asciiToPetsciiByte(cp, bank);
    if (!needsReverse) { out.push(byte); i += width; continue; }
    if (!allowReverseToggle) { out.push(0x3F); i += width; continue; }
    if (reverseState) {
      out.push(byte);
    } else {
      out.push(0x12, byte, 0x92);
    }
    i += width;
  }
  return out;
}
