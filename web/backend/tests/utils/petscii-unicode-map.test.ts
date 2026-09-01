/**
 * Unit tests for petscii-unicode-map.ts
 *
 * Spot-checks the screen-code -> Unicode table (audit D1-D3 fix). The full
 * table is verified by its own construction (128+128 literal entries); these
 * tests cover shape plus the anchors called out in the task brief.
 */

import { SCREENCODE_TO_UNICODE } from '../../src/utils/petscii-unicode-map';

describe('SCREENCODE_TO_UNICODE', () => {
  it('has two complete 128-entry banks of single, non-empty glyph strings', () => {
    expect(SCREENCODE_TO_UNICODE).toHaveLength(2);
    expect(SCREENCODE_TO_UNICODE[0]).toHaveLength(128);
    expect(SCREENCODE_TO_UNICODE[1]).toHaveLength(128);
    for (const bank of SCREENCODE_TO_UNICODE) {
      for (const entry of bank) {
        expect(typeof entry).toBe('string');
        expect(entry.length).toBeGreaterThan(0);
      }
    }
  });

  it('anchors: letters, pi, blocks (from the task brief)', () => {
    expect(SCREENCODE_TO_UNICODE[0][0x01]).toBe('A');
    expect(SCREENCODE_TO_UNICODE[1][0x01]).toBe('a');
    expect(SCREENCODE_TO_UNICODE[0][0x5E]).toBe('π'); // pi
    expect(SCREENCODE_TO_UNICODE[0][0x60]).toBe(' '); // shift-space
    expect(SCREENCODE_TO_UNICODE[0][0x66]).toBe('▒'); // medium shade (checkerboard)
    expect(SCREENCODE_TO_UNICODE[0][0x40]).toBe('─'); // horizontal bar
    expect(SCREENCODE_TO_UNICODE[0][0x5D]).toBe('│'); // vertical bar
  });

  it('digits, punctuation and space are identical across both banks (0x20-0x3F)', () => {
    for (let code = 0x20; code <= 0x3f; code++) {
      expect(SCREENCODE_TO_UNICODE[1][code]).toBe(SCREENCODE_TO_UNICODE[0][code]);
    }
  });

  it('bank 0 (unshifted) shows graphics, not letters, for screen codes 0x41-0x5A', () => {
    // This is the exact defect the table fixes: the old ANSI fallback
    // rendered PETSCII $61-$7A / $C1-$DA as a lowercase-letter
    // "approximation" in unshifted mode. On real hardware those screen
    // codes ($41-$5A) are graphics glyphs in the up/gfx charset bank.
    expect(SCREENCODE_TO_UNICODE[0][0x41]).toBe('♠');
    expect(SCREENCODE_TO_UNICODE[0][0x53]).toBe('♥');
    expect(SCREENCODE_TO_UNICODE[0][0x5A]).toBe('♦');
    for (let code = 0x41; code <= 0x5a; code++) {
      expect(SCREENCODE_TO_UNICODE[0][code]).not.toMatch(/^[A-Za-z]$/);
    }
  });

  it('bank 1 (shifted) shows uppercase letters for screen codes 0x41-0x5A', () => {
    expect(SCREENCODE_TO_UNICODE[1][0x41]).toBe('A');
    expect(SCREENCODE_TO_UNICODE[1][0x5A]).toBe('Z');
  });

  it('uses real PETSCII punctuation at 0x1C-0x1F instead of ASCII backslash/caret/underscore', () => {
    // PETSCII has no backslash, caret or underscore in this range - the
    // real glyphs are pound sign and the two arrows (audit D1: the old
    // fallback returned '\\', '^', '_' here).
    expect(SCREENCODE_TO_UNICODE[0][0x1c]).toBe('£');
    expect(SCREENCODE_TO_UNICODE[0][0x1e]).toBe('↑');
    expect(SCREENCODE_TO_UNICODE[0][0x1f]).toBe('←');
  });

  it('the two charset-dependent glyphs differ correctly between banks', () => {
    // Screen codes 0x69 and 0x7A are genuinely different bitmaps per bank,
    // not a letters/graphics swap.
    expect(SCREENCODE_TO_UNICODE[0][0x69]).toBe('◤');
    expect(SCREENCODE_TO_UNICODE[1][0x69]).toBe('\u{1FB99}');
    expect(SCREENCODE_TO_UNICODE[0][0x7a]).toBe('\u{1FB7F}');
    expect(SCREENCODE_TO_UNICODE[1][0x7a]).toBe('✓');
  });
});
