/**
 * Levels plan E1-E4: Level 1.5 character sets, ETSI EN 300 706.
 *
 * E1  C12-C14 pick the G0 national option sub-set (s.9.3.1, s.15.2 Table 36).
 * E2  X/28/0 format 1 / M/29/0 designate a default and a second G0; ESC
 *     switches between them (s.9.4.2, s.9.5.1, s.15.2).
 * E3  X/26 row / column addresses, G2 (mode 0x0F) and G0 + diacritic
 *     (0x10-0x1F) at the active position (s.12.3.1, Tables 27-29).
 * E4  G2 to Unicode; diacritic + letter composes, else the bare letter; the
 *     teletext font session never gets a code point TeletextUPR lacks.
 *
 * Reachability: one page through renderSubpageLines carries all four.
 */
import { renderSubpageLines } from '../../teletext/render-session';
import { createEmptySubpage, controlToken, charToken, fillToken } from '../../teletext/marco/model/factories';
import type { TeletextSubpage, TeletextToken } from '../../teletext/marco/model/types';
import { parseTriplet } from '../../teletext/enhancement';
import {
  composeDiacritic, displayable, g2Char, nationalTable, teletextFontHas,
} from '../../teletext/marco/render-ansi/charsets';
import { resolvePageCharsets } from '../../teletext/level15';
import { subsetFromHeaderByte } from '../../teletext/marco/tti/t42Import';
import { hammingDecode84 } from '../../teletext/marco/packet-decoder/hamming';

const ESC = 0x1b;
const t = (address: number, mode: number, data: number) => ({ address, mode, data });
const cp = (s: string) => s.codePointAt(0);

/** X/28/0 format 1 triplets 1-2 for a default and a second designation. */
function x28(primary: number, second: number) {
  const v1 = (primary << 7) | ((second & 0x0f) << 14);
  const v2 = (second >> 4) & 0x07;
  return { packet: 28 as const, designation: 0, triplets: [parseTriplet(v1), parseTriplet(v2)] };
}

function page(tokens: TeletextToken[], subset: TeletextSubpage['languageSubset']): TeletextSubpage {
  const subpage = createEmptySubpage(0);
  subpage.languageSubset = subset;
  subpage.rows[1] = { index: 1, tokens: [...tokens, fillToken(40)] };
  return subpage;
}

/** Row 1's visible characters, SGR stripped. */
function row1(subpage: TeletextSubpage, mode: 'teletext' | 'ansi'): string[] {
  const line = renderSubpageLines(subpage, { mode })[1];
  return Array.from(line.replace(/\x1b\[[0-9;]*m/g, '').replace(/\x1b#\d/g, ''));
}

describe('E1-E4 reach the caller through renderSubpageLines', () => {
  const at = (s: string) => charToken(s.charCodeAt(0));
  const tokens = [at('@'), controlToken(ESC), at('@'), at('[')];

  it('C12-C14 alone: the header sub-set (Swedish) fills the national positions', () => {
    const chars = row1(page(tokens, 'swedish_finnish'), 'teletext');
    expect(chars.slice(0, 4).map(cp)).toEqual([0xc9, 0x20, 0xc9, 0xc4]); // E, ESC, E, A-diaeresis
  });

  it('X/28/0 German + Polish second set, ESC switch, X/26 G2 and diacritic characters', () => {
    const subpage = page(tokens, 'swedish_finnish');
    subpage.enhancement = [
      x28(0x04, 0x08), // default German (family 0), second Polish (family 1)
      {
        packet: 26, designation: 0, triplets: [
          t(41, 0x04, 0), // active row 1
          t(10, 0x0f, 0x68), // G2 0x68: L-stroke
          t(11, 0x1f, 0x72), // r + caron
          t(12, 0x10, 0x2a), // the '@' exception
          t(13, 0x12, 0x71), // q + acute: no precomposed form, bare q
          t(63, 0x1f, 0), // termination
        ],
      },
    ];
    const chars = row1(subpage, 'teletext').map(cp);
    expect(chars.slice(0, 4)).toEqual([0xa7, 0x20, 0x105, 0x17b]); // section, ESC, a-ogonek, Z-dot
    expect(chars.slice(10, 14)).toEqual([0x141, 0x159, 0x40, 0x71]);
    // Latin-1 session: nearest Latin-1 character or the base letter.
    expect(row1(subpage, 'ansi').map(cp).slice(10, 14)).toEqual([0x4c, 0x72, 0x40, 0x71]);
    expect(row1(subpage, 'ansi').map(cp).slice(0, 4)).toEqual([0xa7, 0x20, 0x61, 0x5a]);
  });
});

describe('E1 national sub-sets', () => {
  it('maps designations by family and C12-C14 (Table 33)', () => {
    expect(nationalTable(0x02)?.[3]).toBe('Ä'); // Swedish [
    expect(nationalTable(0x08)?.[2]).toBe('ą'); // Polish @
    expect(nationalTable(0x13)?.[0]).toBe('T'); // Turkish #
    expect(nationalTable(0x1d)?.[1]).toBe('Ë'); // Serbian $
    expect(nationalTable(0x00)).toBeNull(); // English stays plain ASCII
    expect(nationalTable(0x28)).toBeNull(); // non-Latin family
  });

  it('reads C12-C14 from header byte 7, C12 lowest', () => {
    const encoded = (n: number) => [...Array(256).keys()].find(b => hammingDecode84(b) === n)!;
    expect(subsetFromHeaderByte(encoded(0b0100))).toBe('swedish_finnish'); // C13
    expect(subsetFromHeaderByte(encoded(0b0011))).toBe('french'); // C11 + C12
    expect(subsetFromHeaderByte(encoded(0b1000))).toBe('german'); // C14
  });
});

describe('E2 page charsets', () => {
  it('X/28/0 beats M/29/0 beats the header; 0x7F second means none', () => {
    const s = createEmptySubpage(0);
    s.languageSubset = 'french';
    expect(resolvePageCharsets(s)).toEqual({ primary: 1, second: 1 });
    s.enhancement = [{ ...x28(0x04, 0x7f), packet: 29 }];
    expect(resolvePageCharsets(s)).toEqual({ primary: 4, second: 4 });
    s.enhancement.push(x28(0x02, 0x08));
    expect(resolvePageCharsets(s)).toEqual({ primary: 2, second: 8 });
  });
});

describe('E4 G2 and diacritics', () => {
  it('maps G2 and composes or falls back to the letter', () => {
    expect(g2Char(0x24)).toBe('$');
    expect(g2Char(0x76)).toBe('ĳ');
    expect(composeDiacritic('c', 0x0b)).toBe('ç');
    expect(composeDiacritic('x', 0x0f)).toBe('x');
    expect(composeDiacritic('a', 0x00)).toBe('a');
  });

  it('never emits a code point the font lacks, nor non-Latin-1 to a Latin-1 terminal', () => {
    const all: string[] = [];
    for (let c = 0x20; c < 0x80; c++) {
      all.push(g2Char(c));
      for (let m = 0; m < 16; m++) all.push(composeDiacritic(String.fromCharCode(c), m));
    }
    for (let d = 0; d < 0x38; d++) all.push(...(nationalTable(d) ?? ''));
    for (const ch of all) {
      const tt = cp(displayable(ch, 'teletext'))!;
      expect(tt < 0x7f || teletextFontHas(tt)).toBe(true);
      expect(cp(displayable(ch, 'latin1'))! <= 0xff).toBe(true);
    }
  });
});
