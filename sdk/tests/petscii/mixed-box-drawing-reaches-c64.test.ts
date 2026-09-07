/**
 * A DOUBLE FRAME WITH SINGLE TEES REACHES A C64 AS A FRAME.
 *
 * The Unicode table mapped the nine PURE-double box characters
 * (U+2554 U+2557 U+255A U+255D U+2560 U+2563 U+2566 U+2569 U+256C) and
 * stopped there. The eighteen MIXED forms between them - CP437 $B5-$B8,
 * $C6, $C7 and $CF-$D8, the ones PC-heritage ANSI draws a double frame
 * with single tees from - were missing as a class, so every junction of
 * such a frame reached a PETSCII caller as \'?\'.
 *
 * Measured, not guessed: a sweep of the board\'s own 184 readable screens
 * and door designs through the real decode path (CP437/Latin-1 detection,
 * then asciiToPetsciiByte per code point) found four code points with no
 * glyph in either bank. U+2556 is one of them, in Screens/Logon24hrs.txt.
 *
 * Each mixed form folds to the SAME single-line glyph its pure-double
 * partner already folds to, because that is the only frame the character
 * ROM has: the C64 cannot draw a double rule at all, and a fold that
 * agreed with the double table but not with the single one would put two
 * different corners on one frame.
 */
import { asciiToPetsciiByte } from '../../petscii/ascii-to-petscii';

/** [mixed form, the pure-double partner it must agree with, what it draws] */
const MIXED: readonly (readonly [string, string, string])[] = [
  ['\u2552', '\u2554', 'top left'],
  ['\u2553', '\u2554', 'top left'],
  ['\u2555', '\u2557', 'top right'],
  ['\u2556', '\u2557', 'top right'],
  ['\u2558', '\u255A', 'bottom left'],
  ['\u2559', '\u255A', 'bottom left'],
  ['\u255B', '\u255D', 'bottom right'],
  ['\u255C', '\u255D', 'bottom right'],
  ['\u255E', '\u2560', 'left tee'],
  ['\u255F', '\u2560', 'left tee'],
  ['\u2561', '\u2563', 'right tee'],
  ['\u2562', '\u2563', 'right tee'],
  ['\u2564', '\u2566', 'top tee'],
  ['\u2565', '\u2566', 'top tee'],
  ['\u2567', '\u2569', 'bottom tee'],
  ['\u2568', '\u2569', 'bottom tee'],
  ['\u256A', '\u256C', 'cross'],
  ['\u256B', '\u256C', 'cross'],
];

const QUESTION = 0x3f;
const encode = (ch: string, bank: 0 | 1) => asciiToPetsciiByte(ch.codePointAt(0) as number, bank);

describe('mixed single/double box drawing', () => {
  it.each(MIXED)('%s is a %s, not a question mark', (mixed, _partner, _what) => {
    for (const bank of [0, 1] as const) {
      expect(encode(mixed, bank).byte).not.toBe(QUESTION);
    }
  });

  it.each(MIXED)('%s draws the same corner as its double partner %s (%s)', (mixed, partner) => {
    for (const bank of [0, 1] as const) {
      expect(encode(mixed, bank).byte).toBe(encode(partner, bank).byte);
    }
  });

  it('covers every mixed form CP437 has, so the class cannot be half closed', () => {
    // U+2552-U+256B minus the pure-double forms in that range.
    const pureDouble = new Set([0x2554, 0x2557, 0x255a, 0x255d, 0x2560, 0x2563, 0x2566, 0x2569]);
    const expected: string[] = [];
    for (let cp = 0x2552; cp <= 0x256b; cp += 1) {
      if (!pureDouble.has(cp)) expected.push(String.fromCodePoint(cp));
    }
    expect(MIXED.map(([m]) => m).sort()).toEqual(expected.sort());
  });
});

describe('the two solid marks the arcade doors draw with', () => {
  it('BLACK SQUARE is a filled cell, the way FULL BLOCK is', () => {
    for (const bank of [0, 1] as const) {
      const square = encode('\u25A0', bank);
      const full = encode('\u2588', bank);
      expect(square.byte).not.toBe(QUESTION);
      expect(square.byte).toBe(full.byte);
      expect(square.needsReverse).toBe(full.needsReverse);
    }
  });

  it('BULLET OPERATOR is the dot MIDDLE DOT already is', () => {
    for (const bank of [0, 1] as const) {
      expect(encode('\u2219', bank).byte).toBe(encode('\u00B7', bank).byte);
      expect(encode('\u2219', bank).byte).not.toBe(QUESTION);
    }
  });
});
