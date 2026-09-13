/**
 * The board says DECDHL; the terminal draws it with the font.
 *
 * xterm.js 5.5 has no `ESC #` handler at all, so a teletext headline would
 * otherwise arrive as a stray escape and a normal-height row. The filter turns
 * the escapes into the private-use codepoints TeletextUPR carries the halves
 * in, and leaves everything else exactly as it was.
 */
import { describe, it, expect } from 'vitest';
import {
  createDoubleHeightFilter,
  halfCodepoint,
  mosaicCodepoint,
  DH_TOP_BASE,
  DH_BOTTOM_BASE,
} from '../../../../../packages/terminal/src/utils/teletext-double-height';

const ESC = '\x1b';
const top = (s: string) => [...s].map((c) => String.fromCodePoint(DH_TOP_BASE + c.charCodeAt(0) - 0x20)).join('');
const bottom = (s: string) => [...s].map((c) => String.fromCodePoint(DH_BOTTOM_BASE + c.charCodeAt(0) - 0x20)).join('');

describe('the double-height filter', () => {
  it('draws a headline as two halves of the same text', () => {
    const filter = createDoubleHeightFilter();
    expect(filter.write(`${ESC}#3NEWS\r\n`)).toBe(`${top('NEWS')}\r\n`);
    expect(filter.write(`${ESC}#4NEWS\r\n`)).toBe(`${bottom('NEWS')}\r\n`);
  });

  it('keeps the attribute across writes, because the board sends chunks', () => {
    const filter = createDoubleHeightFilter();
    expect(filter.write(`${ESC}#3UP`)).toBe(top('UP'));
    expect(filter.half()).toBe('top');
    expect(filter.write(' ROUGH')).toBe(top(' ROUGH'));
    expect(filter.write('\r\n')).toBe('\r\n');
    // The line ended, so the next text is ordinary again.
    expect(filter.half()).toBe('normal');
    expect(filter.write('ordinary')).toBe('ordinary');
  });

  it('ends the attribute when the cursor leaves the line', () => {
    /*
     * A 68K door paints with absolute cursor motion and no newlines at all.
     * TEXTTV's headline set the attribute, every row painted under it with
     * ESC[r;cH inherited it, and half the page came out as the bottom halves
     * of letters - the masthead included, because it is redrawn afterwards
     * (sysop, 2026-09-14).
     */
    const filter = createDoubleHeightFilter();

    expect(filter.write(`${ESC}#3BIG`)).toBe(top('BIG'));
    expect(filter.write(`${ESC}[5;1Hplain`)).toBe(`${ESC}[5;1Hplain`);
    expect(filter.half()).toBe('normal');

    // Every motion that changes the row ends it; the ones that stay on the
    // row do not.
    for (const move of ['\x1b[H', '\x1b[3;4f', '\x1b[2A', '\x1b[2B', '\x1b[E', '\x1b[F', '\x1b[7d']) {
      const f = createDoubleHeightFilter();
      f.write(`${ESC}#4half`);
      f.write(move);
      expect([move, f.half()]).toEqual([move, 'normal']);
    }
    for (const stay of ['\x1b[4C', '\x1b[4D', '\x1b[9G', '\x1b[0;33m', '\x1b[K']) {
      const f = createDoubleHeightFilter();
      f.write(`${ESC}#4half`);
      f.write(stay);
      expect([stay, f.half()]).toEqual([stay, 'bottom']);
    }
  });

  it('ends the attribute on ESC#5, the way DECSWL does', () => {
    const filter = createDoubleHeightFilter();
    filter.write(`${ESC}#3BIG`);
    expect(filter.write(`${ESC}#5small`)).toBe('small');
  });

  it('passes colour and cursor motion through byte for byte', () => {
    const filter = createDoubleHeightFilter();
    const written = filter.write(`${ESC}#3${ESC}[0;33mSVT${ESC}[0m\r\n`);
    expect(written).toBe(`${ESC}[0;33m${top('SVT')}${ESC}[0m\r\n`);
    // The digits of an escape must never be redrawn as giant numerals.
    expect(written).not.toContain(top('0;33'));
  });

  it('leaves a row alone when nothing asked for double height', () => {
    const filter = createDoubleHeightFilter();
    const line = `${ESC}[0;36m====${ESC}[0m\r\nplain text\r\n`;
    expect(filter.write(line)).toBe(line);
  });

  it('passes through what the font has no half for', () => {
    const filter = createDoubleHeightFilter();
    // Mosaics (U+1FB00) and block elements are teletext graphics, not letters:
    // they have no halves and must not become boxes.
    const mosaic = '\u{1FB00}█';
    expect(filter.write(`${ESC}#3${mosaic}`)).toBe(mosaic);
    expect(halfCodepoint('\u{1FB00}', 'top')).toBeNull();
  });

  it('has a half for every Latin-1 printable, and only those', () => {
    expect(halfCodepoint('A', 'top')).toBe(DH_TOP_BASE + 0x21);
    expect(halfCodepoint('A', 'bottom')).toBe(DH_BOTTOM_BASE + 0x21);
    expect(halfCodepoint('å', 'top')).toBe(DH_TOP_BASE + 0xe5 - 0x20);
    expect(halfCodepoint(' ', 'top')).toBe(DH_TOP_BASE);
    expect(halfCodepoint('Ā', 'top')).toBeNull();   // outside Latin-1
    expect(halfCodepoint('A', 'normal')).toBeNull();
  });

  it('draws teletext block mosaics from the G1 set', () => {
    // SO selects G1, the way a VT terminal has always selected an alternate
    // set; the bytes are then 2x3 blocks, which Unicode has as sextants and
    // the face draws. 0x20 is blank, 0x7f all six cells.
    const filter = createDoubleHeightFilter();
    const SO = '\x0e';
    const SI = '\x0f';

    expect(filter.write(`${SO}\x7f${SI}`)).toBe('\u2588');   // full block
    expect(filter.write('plain')).toBe('plain');              // and back out again
  });

  it('maps every mosaic byte to the cell pattern teletext means by it', () => {
    // The cells are numbered 1 2 / 3 4 / 5 6, and the bit that would be cell
    // 6 is the one that selects the set - which is why 0x40 stands in for it.
    expect(mosaicCodepoint(0x20)).toBe(0x20);        // no cells: a space
    expect(mosaicCodepoint(0x7f)).toBe(0x2588);      // all six: full block
    expect(mosaicCodepoint(0x35)).toBe(0x258c);      // cells 1,3,5: left half
    expect(mosaicCodepoint(0x6a)).toBe(0x2590);      // cells 2,4,6: right half
    expect(mosaicCodepoint(0x21)).toBe(0x1fb00);     // cell 1 alone
    expect(mosaicCodepoint(0x23)).toBe(0x1fb02);     // cells 1 and 2

    // Every one of the sixty-four patterns lands on a glyph, and the sixty
    // sextants are all distinct.
    const seen = new Set<number>();
    for (const byte of [...Array(32).keys()].map((i) => 0x20 + i)
      .concat([...Array(32).keys()].map((i) => 0x60 + i))) {
      const cp = mosaicCodepoint(byte);
      expect(cp).not.toBeNull();
      seen.add(cp as number);
    }
    expect(seen.size).toBe(64);

    // G1 is not all graphics: 0x40-0x5F stay letters even inside it, which
    // is how a teletext page labels its own diagrams.
    expect(mosaicCodepoint(0x41)).toBeNull();        // 'A' is still 'A'
    expect(mosaicCodepoint(0x0a)).toBeNull();        // a newline is not a cell
    expect(mosaicCodepoint(0xe5)).toBeNull();        // nor is a-ring
  });

  it('keeps the mosaic set across rows, because art is many rows of it', () => {
    const filter = createDoubleHeightFilter();
    filter.write('\x0e\x7f');
    expect(filter.mosaic()).toBe(true);
    expect(filter.write('\r\n\x7f')).toBe('\r\n\u2588');
    expect(filter.write('\x0f')).toBe('');
    expect(filter.mosaic()).toBe(false);
  });

  it('reset drops a half-set line, for a mode change or a clear', () => {
    const filter = createDoubleHeightFilter();
    filter.write(`${ESC}#3HALF`);
    filter.write('\x0e');
    filter.reset();
    expect(filter.half()).toBe('normal');
    expect(filter.mosaic()).toBe(false);
    expect(filter.write('after')).toBe('after');
  });

  it('leaves DECALN and charset selection alone', () => {
    const filter = createDoubleHeightFilter();
    // ESC#8 is DECALN, not ours; ESC(B is a charset. Both must survive.
    expect(filter.write(`${ESC}#8`)).toBe(`${ESC}#8`);
    expect(filter.write(`${ESC}#3A${ESC}(B`)).toBe(`${top('A')}${ESC}(B`);
  });
});
