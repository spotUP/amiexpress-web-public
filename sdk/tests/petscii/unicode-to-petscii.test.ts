import { UNICODE_TO_PETSCII } from '../../petscii/unicode-to-petscii';
import { printablePetsciiToScreenCode, screenCodeToPetscii } from '../../petscii/screen-codes';

describe('UNICODE_TO_PETSCII', () => {
  it('every plain entry maps to a printable PETSCII byte whose screen code is bank-invariant ($A0-$BF, $C0, $DB, $DD, $BA)', () => {
    expect(UNICODE_TO_PETSCII.size).toBeGreaterThan(40);
    for (const [glyph, v] of UNICODE_TO_PETSCII) {
      const byte = typeof v === 'number' ? v : v.rvs;
      expect(byte).toBeGreaterThanOrEqual(0x20);
      expect(byte).toBeLessThanOrEqual(0xFF);
      expect(printablePetsciiToScreenCode(byte)).toBeLessThanOrEqual(0x7F);
      if (typeof v === 'number' && byte >= 0xC0 && byte <= 0xDF) {
        // Letters live here in bank 1 - but only at $C1-$DA. This used to
        // allow exactly [$C0, $DB, $DD] and call them "the three graphics
        // shared by both banks", which was not a rule about the C64: $DC
        // (screen code $5C, LEFT HALF MEDIUM SHADE) is the same bitmap in
        // both banks too and belonged here all along. The old assertion was
        // pinning the table's OMISSION as if it were the C64's design, and
        // so guarded the very gap that reached a caller as '?'. Widened to
        // the four non-letter graphics in the window.
        expect([0xC0, 0xDB, 0xDC, 0xDD]).toContain(byte);
        expect(byte >= 0xC1 && byte <= 0xDA).toBe(false);
      }
      expect(glyph.length).toBeGreaterThan(0);
    }
  });

  it('pins the corner, line and half-block glyphs', () => {
    expect(UNICODE_TO_PETSCII.get('┌')).toBe(0xB0);
    expect(UNICODE_TO_PETSCII.get('┘')).toBe(0xBD);
    expect(UNICODE_TO_PETSCII.get('─')).toBe(0xC0);
    expect(UNICODE_TO_PETSCII.get('│')).toBe(0xDD);
    expect(UNICODE_TO_PETSCII.get('▌')).toBe(0xA1);
    expect(UNICODE_TO_PETSCII.get('▀')).toEqual({ rvs: 0xA2 });
    expect(UNICODE_TO_PETSCII.get('█')).toEqual({ rvs: 0x20 });
  });

  /**
   * The table is the INVERSE of the repo's normative screen-code -> Unicode
   * map (web/backend/src/utils/petscii-unicode-map.ts, transcribed from the
   * Unicode Consortium's C64IPRI/C64IALT files). That file cannot be
   * imported from the SDK package, so the twelve screen codes it assigns to
   * the glyphs below are inlined here and re-derived through
   * screenCodeToPetscii; a drift in either direction fails.
   */
  it('round-trips the box/block glyphs through the normative screen codes', () => {
    const screenCodeOf: ReadonlyMap<string, number> = new Map([
      ['─', 0x40], ['┼', 0x5B], ['│', 0x5D],
      ['┌', 0x70], ['┴', 0x71], ['┬', 0x72], ['┤', 0x73],
      ['├', 0x6B], ['└', 0x6D], ['┐', 0x6E], ['┘', 0x7D],
      ['▌', 0x61], ['▄', 0x62], ['▔', 0x63], ['▁', 0x64],
      ['▏', 0x65], ['▒', 0x66], ['▕', 0x67],
      ['▗', 0x6C], ['▖', 0x7B], ['▝', 0x7C], ['▘', 0x7E], ['▚', 0x7F],
      ['✓', 0x7A], ['£', 0x1C], ['↑', 0x1E], ['←', 0x1F],
    ]);
    for (const [glyph, sc] of screenCodeOf) {
      const byte = UNICODE_TO_PETSCII.get(glyph);
      expect(byte).toBe(screenCodeToPetscii(sc));
      expect(printablePetsciiToScreenCode(byte as number)).toBe(sc);
    }
  });

  it('reverse-only glyphs name the PETSCII byte whose inverse video is that glyph', () => {
    const inverseOf: ReadonlyMap<string, string> = new Map([
      ['█', ' '], ['▀', '▄'], ['▐', '▌'],
      ['▛', '▗'], ['▜', '▖'], ['▙', '▝'], ['▟', '▘'], ['▞', '▚'],
    ]);
    for (const [glyph, base] of inverseOf) {
      const v = UNICODE_TO_PETSCII.get(glyph);
      expect(typeof v).toBe('object');
      const baseByte = base === ' ' ? 0x20 : (UNICODE_TO_PETSCII.get(base) as number);
      expect(v).toEqual({ rvs: baseByte });
    }
  });

  it('heavy, double and rounded box variants fall back to the single-line glyphs', () => {
    expect(UNICODE_TO_PETSCII.get('─')).toBeDefined();
    expect(UNICODE_TO_PETSCII.get('┌')).toBeDefined();
    for (const g of ['━', '═']) expect(UNICODE_TO_PETSCII.get(g)).toBe(UNICODE_TO_PETSCII.get('─'));
    for (const g of ['┃', '║']) expect(UNICODE_TO_PETSCII.get(g)).toBe(UNICODE_TO_PETSCII.get('│'));
    for (const [dbl, single] of [['╔', '┌'], ['╗', '┐'], ['╚', '└'], ['╝', '┘'], ['╬', '┼']]) {
      expect(UNICODE_TO_PETSCII.get(dbl)).toBe(UNICODE_TO_PETSCII.get(single));
    }
    for (const [round, single] of [['╭', '┌'], ['╮', '┐'], ['╰', '└'], ['╯', '┘']]) {
      expect(UNICODE_TO_PETSCII.get(round)).toBe(UNICODE_TO_PETSCII.get(single));
    }
  });
});
