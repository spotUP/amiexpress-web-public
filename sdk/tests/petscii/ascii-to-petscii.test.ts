/**
 * The ONE ASCII/Unicode -> PETSCII byte table (plan
 * `thoughts/shared/plans/2026-09-02-mci-in-petscii-seq.md`, Task 2).
 *
 * Two duplicates were retired into `asciiToPetsciiByte`: the transducer's
 * private `printChar` (`ansi-to-petscii.ts`) and the backend's
 * `convertAsciiToPetsciiOutput` (`web/backend/src/utils/petscii.util.ts`).
 * The transducer's output must not move a single byte: the pins below were
 * captured on the pre-refactor tree.
 */
import { asciiToPetsciiByte, encodePetsciiValue } from '../../petscii/ascii-to-petscii';
import { AnsiToPetsciiTransducer, petsciiMoveTo } from '../../petscii/ansi-to-petscii';
import { PetsciiMachine } from '../../petscii/petscii-machine';

const hex = (bytes: ArrayLike<number>) =>
  Array.from(bytes as number[]).map((b) => b.toString(16).padStart(2, '0')).join(' ');

describe('asciiToPetsciiByte', () => {
  it('bank 1: uppercase goes to $C1-$DA and lowercase to $41-$5A', () => {
    expect(asciiToPetsciiByte(0x41, 1)).toEqual({ byte: 0xC1, needsReverse: false }); // A
    expect(asciiToPetsciiByte(0x62, 1)).toEqual({ byte: 0x42, needsReverse: false }); // b
  });

  it('bank 0: both cases fold up to $41-$5A - $C1-$DA is GRAPHICS there', () => {
    expect(asciiToPetsciiByte(0x41, 0)).toEqual({ byte: 0x41, needsReverse: false });
    expect(asciiToPetsciiByte(0x62, 0)).toEqual({ byte: 0x42, needsReverse: false });
    for (let code = 0x41; code <= 0x5A; code++) {
      const { byte } = asciiToPetsciiByte(code, 0);
      expect(byte).toBeLessThan(0xC1);
    }
  });

  it('keeps the deliberate punctuation mappings the transducer table had', () => {
    expect(asciiToPetsciiByte(0x5C, 1).byte).toBe(0x2F); // backslash -> '/'
    expect(asciiToPetsciiByte(0x5F, 1).byte).toBe(0xA4); // _ -> PETSCII underline
    expect(asciiToPetsciiByte(0x7C, 1).byte).toBe(0xDD); // | -> vertical bar
    expect(asciiToPetsciiByte(0x7E, 1).byte).toBe(0x2D); // ~ -> '-'
  });

  it('keeps 0x08 / 0x7F -> $14 (the backend table\'s case, folded in)', () => {
    expect(asciiToPetsciiByte(0x08, 1)).toEqual({ byte: 0x14, needsReverse: false });
    expect(asciiToPetsciiByte(0x7F, 1)).toEqual({ byte: 0x14, needsReverse: false });
  });

  it('maps an unsupported glyph to $3F, not to a space', () => {
    expect(asciiToPetsciiByte(0x80, 1)).toEqual({ byte: 0x3F, needsReverse: false });
    expect(asciiToPetsciiByte(0xFF, 1)).toEqual({ byte: 0x3F, needsReverse: false });
  });

  it('flags an inverse-only glyph instead of emitting the toggle itself', () => {
    // U+2588 FULL BLOCK exists only as the inverse of PETSCII $20.
    const full = asciiToPetsciiByte('\u2588'.codePointAt(0)!, 1);
    expect(full.needsReverse).toBe(true);
    expect(full.byte).toBe(0x20);
  });
});

describe('encodePetsciiValue', () => {
  it('emits no bank switch, no reverse toggle and no colour byte (decisions 5 + 6)', () => {
    const bytes = encodePetsciiValue('Ab 09', 1);
    expect(bytes).toEqual([0xC1, 0x42, 0x20, 0x30, 0x39]);
    for (const b of bytes) {
      expect([0x0E, 0x8E, 0x12, 0x92]).not.toContain(b);
      expect(b === 0x05 || (b >= 0x1C && b <= 0x1F) || (b >= 0x90 && b <= 0x9F)).toBe(false);
    }
  });

  it('folds a mixed-case value up in bank 0 without flipping the bank', () => {
    expect(encodePetsciiValue('Ab', 0)).toEqual([0x41, 0x42]);
  });

  it('collapses \\r\\n to a single $0D', () => {
    expect(encodePetsciiValue('a\r\nb', 1)).toEqual([0x41, 0x0D, 0x42]);
    expect(encodePetsciiValue('a\nb', 1)).toEqual([0x41, 0x0D, 0x42]);
    expect(encodePetsciiValue('a\rb', 1)).toEqual([0x41, 0x0D, 0x42]);
  });

  it('degrades an inverse-only glyph to ? unless the toggle is allowed', () => {
    expect(encodePetsciiValue('\u2588', 1)).toEqual([0x3F]);
    expect(encodePetsciiValue('\u2588', 1, { allowReverseToggle: true })).toEqual([0x12, 0x20, 0x92]);
    // Already reversed art: no toggle needed, and none is emitted.
    expect(encodePetsciiValue('\u2588', 1, { allowReverseToggle: true, reverseState: true })).toEqual([0x20]);
  });
});

describe('petsciiMoveTo', () => {
  it('emits HOME for (0,0) and delta runs otherwise', () => {
    const m = new PetsciiMachine();
    m.feed([0x11, 0x11, 0x1D]); // row 2, col 1
    const home: number[] = [];
    petsciiMoveTo(m.state, 0, 0, home);
    expect(home).toEqual([0x13]);

    const m2 = new PetsciiMachine();
    const walk: number[] = [];
    petsciiMoveTo(m2.state, 4, 9, walk);
    expect(walk).toEqual([...Array(9).fill(0x11), ...Array(4).fill(0x1D)]);
  });

  it('emits nothing when the cursor is already home', () => {
    const out: number[] = [];
    petsciiMoveTo(new PetsciiMachine().state, 0, 0, out);
    expect(out).toEqual([]);
  });

  it('walks back up and left with $91 / $9D', () => {
    const m = new PetsciiMachine();
    m.feed([0x11, 0x11, 0x11, 0x1D, 0x1D, 0x1D]); // row 3, col 3
    const out: number[] = [];
    petsciiMoveTo(m.state, 1, 1, out);
    expect(out).toEqual([0x91, 0x91, 0x9D, 0x9D]);
  });
});

describe('transducer byte-identity pins (captured before the extraction)', () => {
  it('transduce("Hello") is byte-identical', () => {
    expect(hex(new AnsiToPetsciiTransducer().transduce('Hello'))).toBe('0e c8 45 4c 4c 4f');
  });

  it('ESC[10;5H walks identically after the petsciiMoveTo extraction', () => {
    expect(hex(new AnsiToPetsciiTransducer().transduce('\x1b[10;5H')))
      .toBe('11 11 11 11 11 11 11 11 11 1d 1d 1d 1d');
  });

  it('the whole printable ASCII range is byte-identical', () => {
    const ascii = Array.from({ length: 0x60 }, (_, i) => String.fromCharCode(0x20 + i)).join('');
    expect(hex(new AnsiToPetsciiTransducer().transduce(ascii))).toBe(
      '0e 20 21 22 23 24 25 26 27 28 29 2a 2b 2c 2d 2e 2f 30 31 32 33 34 35 36 37 38 39 3a 3b 3c 3d 3e 3f ' +
      '40 c1 c2 c3 c4 c5 c6 c7 c8 c9 ca cb cc cd ce cf d0 d1 d2 d3 d4 d5 d6 d7 d8 d9 da 5b 2f 5d 5e a4 27 ' +
      '41 42 43 44 45 46 47 48 49 4a 4b 4c 4d 4e 4f 50 51 52 53 54 55 56 57 58 59 5a 28 dd 29 2d 9d',
    );
  });

  it('inverse glyphs, cursor moves and bank state are byte-identical', () => {
    const mixed = 'Hi \\_^|{}~`\u2588\x1b[5;3HX\x1b[H\x1b[10;5Hy';
    expect(hex(new AnsiToPetsciiTransducer().transduce(mixed))).toBe(
      '0e c8 49 20 2f a4 5e dd 28 29 2d 27 12 20 92 11 11 11 11 9d 9d 9d 9d 9d 9d 9d 9d 9d 9d d8 13 ' +
      '11 11 11 11 11 11 11 11 11 1d 1d 1d 1d 59',
    );
  });

  it('oracle lockstep survives: a display machine fed the output matches the transducer machine', () => {
    const t = new AnsiToPetsciiTransducer();
    const bytes = t.transduce('Hi \\_^|{}~`\u2588\x1b[5;3HX\x1b[H\x1b[10;5Hy');
    const display = new PetsciiMachine();
    display.feed(Array.from(bytes));
    expect(display.state.cursorX).toBe(5);
    expect(display.state.cursorY).toBe(9);
    expect(display.state.charsetBank).toBe(1);
  });
});
