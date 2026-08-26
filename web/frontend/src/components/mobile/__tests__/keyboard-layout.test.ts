/**
 * The on-screen keyboard behaves like the phone's own.
 *
 * Reported 2026-08-26 from iOS: "the on screen keyboard doesn't change casing
 * when I click shift, it still shows uppercase chars, which makes it really
 * confusing to type passwords when logging in. It's also missing all special
 * chars - please lay it out exactly like the iOS on screen keyboard that
 * people are used to."
 *
 * The key caps were hardcoded uppercase, so pressing shift changed nothing
 * you could see and typing a password became a guessing game about which
 * case you were in. And a single letters/symbols toggle put brackets on the
 * same page as the digits, which matches nothing anyone has used before.
 *
 * Asserted against the source: the layout tables are the thing under test,
 * and rendering them needs a DOM this suite does not carry.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(
  join(__dirname, '..', 'MobileBBSKeyboard.tsx'),
  'utf8'
);

describe('shift', () => {
  it('changes the key caps', () => {
    // The whole complaint in one assertion.
    expect(source).toMatch(/const label = isLetter && shift \? key\.label\.toUpperCase\(\) : key\.label/);
  });

  it('decides that from the key itself, not a hardcoded cap', () => {
    expect(source).toMatch(/const isLetter = \/\^\[a-z\]\$\/\.test\(key\.data\)/);
  });

  it('leaves the letter keys lowercase in the table', () => {
    // If the table said 'Q' again, the cap could never follow the state.
    expect(source).toMatch(/letters\('qwertyuiop'\)/);
    expect(source).toMatch(/letters\('asdfghjkl'\)/);
    expect(source).toMatch(/letters\('zxcvbnm'\)/);
    expect(source).not.toMatch(/label: 'Q', data: 'q'/);
  });

  it('is still one-shot', () => {
    // Press shift, type one capital, back to lowercase - as on the phone.
    expect(source).toMatch(/if \(shiftRef\.current\) setShift\(false\);/);
  });
});

describe('the layers', () => {
  it('has the three the phone has', () => {
    expect(source).toMatch(/type KeyboardMode = 'letters' \| 'numbers' \| 'symbols'/);
  });

  it('toggles ABC and 123 with one key', () => {
    expect(source).toMatch(/m === 'letters' \? 'numbers' : 'letters'/);
  });

  it('toggles 123 and #\\+= with the other', () => {
    // And never back to letters from there - that is what ABC is for.
    expect(source).toMatch(/m === 'numbers' \? 'symbols' : 'numbers'/);
  });
});

describe('coverage', () => {
  /** Every character the layout tables can produce. */
  function typeable(): Set<string> {
    const chars = new Set<string>();

    for (const m of source.matchAll(/letters\('([a-z]+)'\)/g)) {
      for (const ch of m[1]) {
        chars.add(ch);
        chars.add(ch.toUpperCase());  // reachable via shift
      }
    }
    // Scan each keys([...]) call to its matching bracket: `]` and `}` are
    // themselves KEYS in the symbol row, so a lazy `[^\]]+` match stops in
    // the middle of the very row it needs to read.
    let at = source.indexOf('keys([');
    while (at !== -1) {
      const end = source.indexOf('])', at);
      const body = source.slice(at + 'keys(['.length, end);
      for (const q of body.matchAll(/'((?:\\.|[^'])*)'/g)) {
        chars.add(q[1].replace(/\\\\/g, '\\').replace(/\\'/g, "'"));
      }
      at = source.indexOf('keys([', end);
    }
    chars.add(' ');
    return chars;
  }

  it('can type every printable ASCII character', () => {
    // A password a user can type on a real keyboard must be typeable here.
    const chars = typeable();
    const missing: string[] = [];
    for (let code = 0x20; code <= 0x7e; code++) {
      const ch = String.fromCharCode(code);
      if (!chars.has(ch)) missing.push(ch);
    }

    expect(missing).toEqual([]);
  });

  it('carries no character an Amiga client cannot render', () => {
    // The phone's own symbol layer has £, ¥ and a bullet; they are left out
    // deliberately, because this BBS is ASCII.
    for (const forbidden of ['£', '¥', '•', '€']) {
      expect(source).not.toContain(`'${forbidden}'`);
    }
  });
});

describe('what a terminal needs and a phone does not', () => {
  it('keeps arrows, escape and tab', () => {
    expect(source).toMatch(/label: '←', data: '\\x1b\[D'/);
    expect(source).toMatch(/label: 'ESC', data: '\\x1b'/);
    expect(source).toMatch(/label: 'Tab', data: '\\t'/);
  });

  it('keeps them on every layer', () => {
    // Nothing is worse than losing the arrows because you went to type a
    // digit.
    const layers = source.match(/NAV_ROW,/g) ?? [];

    expect(layers.length).toBe(3);
  });

  it('has backspace and return where the phone puts them', () => {
    expect(source).toMatch(/label: '⌫', data: '\\x7f'/);
    expect(source).toMatch(/label: 'return', data: '\\r'/);
  });
});
