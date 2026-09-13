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

  it('reset drops a half-set line, for a mode change or a clear', () => {
    const filter = createDoubleHeightFilter();
    filter.write(`${ESC}#3HALF`);
    filter.reset();
    expect(filter.half()).toBe('normal');
    expect(filter.write('after')).toBe('after');
  });

  it('leaves DECALN and charset selection alone', () => {
    const filter = createDoubleHeightFilter();
    // ESC#8 is DECALN, not ours; ESC(B is a charset. Both must survive.
    expect(filter.write(`${ESC}#8`)).toBe(`${ESC}#8`);
    expect(filter.write(`${ESC}#3A${ESC}(B`)).toBe(`${top('A')}${ESC}(B`);
  });
});
