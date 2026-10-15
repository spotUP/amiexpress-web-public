/**
 * THE KEYS A C64 HAS THAT AN ASCII KEYBOARD DOES NOT.
 *
 * A caller pressing Commodore+A on real hardware sends `$B0`, and the board
 * threw it away: "LF, CLR, colors, every other control/graphics byte: no
 * input meaning". So the machine the board is an emulation of could not type
 * the characters it is famous for - "we want full petscii input <3" (the
 * sysop, 2026-09-22).
 *
 * The bytes decode to the markers the rest of the board already carries
 * PETSCII in, which is what makes them readable to everyone else (see
 * `a-pua-glyph-reaches-an-ansi-reader.test.ts`).
 */
import { petsciiInputToAscii } from '../../petscii/petscii-input';
import { screenCodeGlyph, PUA_BANK0, PUA_BANK1 } from '../../petscii/pua';
import { printablePetsciiToScreenCode } from '../../petscii/screen-codes';

/** Every byte, as the caller's keyboard would send it. */
const ALL_BYTES = Array.from({ length: 256 }, (_, b) => b);

describe('a C64 caller typing graphics', () => {
  it('gets the Commodore-key graphics instead of nothing', () => {
    // C= + A is $B0, the top-left corner of a rounded box.
    const typed = petsciiInputToAscii([0xb0]);

    expect(typed.length).toBe(1);
    expect(screenCodeGlyph(typed.codePointAt(0)!)).toEqual({
      glyph: screenCodeGlyph(PUA_BANK1 + printablePetsciiToScreenCode(0xb0))!.glyph,
      reverse: false,
    });
  });

  it('gets the shifted punctuation graphics too', () => {
    // SHIFT + `-` is $DD, the vertical line.
    expect(petsciiInputToAscii([0xdd]).length).toBe(1);
    // $C0 is the horizontal line, the one a rule is drawn with.
    expect(screenCodeGlyph(petsciiInputToAscii([0xc0]).codePointAt(0)!)!.glyph).toBe('─');
  });

  it('still reads SHIFT and a LETTER as a capital, not as a graphic', () => {
    // On real hardware $C1-$DA is the same byte in either charset, and this
    // board runs the lowercase bank, so it is A-Z. Taking it for graphics
    // would cost the caller their own name.
    expect(petsciiInputToAscii([0xc1, 0xc2, 0xc3])).toBe('ABC');
  });

  it('carries reverse video on the cells it was turned on for', () => {
    // RVS ON, a line, RVS OFF, a line: the first reversed, the second not.
    const typed = petsciiInputToAscii([0x12, 0xc0, 0x92, 0xc0]);

    expect(typed.length).toBe(2);
    expect(screenCodeGlyph(typed.codePointAt(0)!)!.reverse).toBe(true);
    expect(screenCodeGlyph(typed.codePointAt(1)!)!.reverse).toBe(false);
  });

  it('never produces a bank-0 marker, whatever is typed at it', () => {
    /*
     * The board's own rule: one charset, board-wide. A bank-0 marker makes
     * the transducer emit `$8E`, which reflows every letter already on the
     * caller's screen - so this is an invariant over the whole byte range,
     * not a spot check.
     */
    const decoded = petsciiInputToAscii(ALL_BYTES);

    for (const ch of decoded) {
      const code = ch.codePointAt(0)!;
      if (code >= PUA_BANK0 && code < PUA_BANK1) {
        throw new Error(`byte decoded to a bank-0 marker: U+${code.toString(16)}`);
      }
    }
  });

  it('leaves plain typing exactly as it was', () => {
    expect(petsciiInputToAscii([0x48, 0x45, 0x4c, 0x4c, 0x4f])).toBe('hello');
  });
});
