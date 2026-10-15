/**
 * WHAT A CALLER TYPED ON A C64, READ BY SOMEBODY WHO IS NOT ON ONE.
 *
 * PETSCII a caller types travels as PetMe64 private-use codepoints - the
 * convention the transducer already speaks - so a C64 reader needs no new
 * code. Everybody else has no such font: a browser draws tofu and an Amiga
 * telnet client gets `?`. This pins the fold that gives them the glyph
 * instead, and pins it against the SAME normative table the other direction
 * is built from, so the two can never drift.
 *
 * Bank 1 only: the board runs the lowercase charset board-wide
 * (`board-rules.ts`), and a bank-0 glyph would make the transducer emit
 * `$8E` and reflow every letter already on the caller's screen.
 */
import { puaToUnicode, puaForScreenCode, screenCodeGlyph, hasPuaScreenCode } from '../../petscii/pua';
import { UNICODE_TO_PETSCII, UNICODE_TO_PETSCII_BANK1_ONLY } from '../../petscii/unicode-to-petscii';
import { printablePetsciiToScreenCode } from '../../petscii/screen-codes';

/** The bank-1 graphics a C64 keyboard can actually type. */
const TYPEABLE: number[] = [
  0x40,
  0x5b, 0x5c, 0x5d, 0x5e, 0x5f,
  ...Array.from({ length: 0x20 }, (_, i) => 0x60 + i),
];

describe('a PETSCII glyph an ANSI caller reads', () => {
  it('comes back as the glyph the normative table names', () => {
    // Screen code 0x40 is the horizontal line a C64 draws its rules with.
    expect(puaToUnicode(puaForScreenCode(0x40))).toBe('─');
    expect(puaToUnicode(`a${puaForScreenCode(0x5d)}b`)).toBe('a│b');
  });

  it('spells reverse video as SGR, once per run and not once per cell', () => {
    const bar = puaForScreenCode(0x40 | 0x80).repeat(3);

    expect(puaToUnicode(bar)).toBe(`\x1b[7m${'─'.repeat(3)}\x1b[27m`);
  });

  it('leaves text with no PETSCII in it exactly as it was', () => {
    const plain = 'nothing to see \x1b[33mhere\x1b[0m';

    expect(hasPuaScreenCode(plain)).toBe(false);
    expect(puaToUnicode(plain)).toBe(plain);
  });

  /*
   * THE ROUND TRIP IS THE POINT. A caller types a glyph on a C64, an
   * eighty-column reader sees a Unicode shape, and when THAT reader's reply
   * comes back to a C64 the transducer has to land on the same screen code.
   * Both directions are built from the same table; this asserts it.
   */
  it('every typeable glyph survives the trip out and back', () => {
    for (const sc of TYPEABLE) {
      /*
       * Screen code 0x60 is SHIFT-SPACE, and the normative table deliberately
       * gives it a plain U+0020 rather than U+00A0 (`screencode-unicode.ts`
       * header): on this board a blank is a blank, and the browser's own font
       * has a defect at no-break space. So it folds like every other blank
       * and cannot come back as itself - which costs a reader nothing,
       * because both draw an empty cell on a C64.
       */
      if (sc === 0x60) {
        expect(puaToUnicode(puaForScreenCode(sc))).toBe(' ');
        continue;
      }
      const glyph = puaToUnicode(puaForScreenCode(sc));
      const back = UNICODE_TO_PETSCII_BANK1_ONLY.get(glyph) ?? UNICODE_TO_PETSCII.get(glyph);

      expect(`0x${sc.toString(16)} -> ${glyph}`).toBe(`0x${sc.toString(16)} -> ${glyph}`);
      expect(back).toBeDefined();
      const byte = typeof back === 'number' ? back : (back as { rvs: number }).rvs;
      expect(printablePetsciiToScreenCode(byte)).toBe(sc);
    }
  });

  it('reports reverse rather than folding it into the glyph', () => {
    expect(screenCodeGlyph(0xe100 + 0x40)).toEqual({ glyph: '─', reverse: false });
    expect(screenCodeGlyph(0xe100 + 0xc0)).toEqual({ glyph: '─', reverse: true });
    expect(screenCodeGlyph('a'.codePointAt(0)!)).toBeNull();
  });
});
