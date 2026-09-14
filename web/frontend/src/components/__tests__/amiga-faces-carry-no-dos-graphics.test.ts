/**
 * The Amiga faces carry no box drawing and no block elements.
 *
 * For one night that meant an eighty-column session had to keep xterm's
 * canvas renderer, which draws U+2500-259F out of a table of its own -
 * under the DOM renderer those codepoints fell through to whatever the
 * browser had, which does not tile: dashed borders and banded fills in every
 * door (sysop, 2026-09-14).
 *
 * BBSGraphics carries them now (bbs-graphics-font.test.ts), so the renderer
 * split is gone and every session draws on the DOM renderer. This test
 * stands because the reason still does: if the fallback ever disappears from
 * the stack, these faces will still have nothing to put in a border.
 */
import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

const FONTS = path.resolve(__dirname, '../../../public/fonts');
const AMIGA = [
  'Topaz_a500_v1.0.ttf', 'Topaz_a1200_v1.0.ttf',
  'TopazPlus_a500_v1.0.ttf', 'TopazPlus_a1200_v1.0.ttf',
  'mOsOul_v1.0.ttf', 'MicroKnight_v1.0.ttf',
  'MicroKnightPlus_v1.0.ttf', 'P0T-NOoDLE_v1.0.ttf',
];

/** Every codepoint in the font's cmap subtables (formats 4 and 12). */
function codepoints(file: string): Set<number> {
  const buf = fs.readFileSync(path.join(FONTS, file));
  const numTables = buf.readUInt16BE(4);
  let cmap = 0;
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + 16 * i;
    if (buf.toString('ascii', rec, rec + 4) === 'cmap') cmap = buf.readUInt32BE(rec + 8);
  }
  const out = new Set<number>();
  const count = buf.readUInt16BE(cmap + 2);
  for (let i = 0; i < count; i++) {
    const sub = cmap + buf.readUInt32BE(cmap + 4 + 8 * i + 4);
    const format = buf.readUInt16BE(sub);
    if (format === 4) {
      const segX2 = buf.readUInt16BE(sub + 6);
      const ends = sub + 14, starts = ends + segX2 + 2;
      for (let s = 0; s < segX2 / 2; s++) {
        const end = buf.readUInt16BE(ends + s * 2), start = buf.readUInt16BE(starts + s * 2);
        if (end === 0xffff) continue;
        for (let cp = start; cp <= end; cp++) out.add(cp);
      }
    } else if (format === 12) {
      const groups = buf.readUInt32BE(sub + 12);
      for (let g = 0; g < groups; g++) {
        const rec = sub + 16 + g * 12;
        for (let cp = buf.readUInt32BE(rec); cp <= buf.readUInt32BE(rec + 4); cp++) out.add(cp);
      }
    }
  }
  return out;
}

const RANGES: Array<[string, number, number]> = [
  ['box drawing', 0x2500, 0x257f],
  ['block elements', 0x2580, 0x259f],
];

describe('the Amiga faces have none of the DOS graphics', () => {
  for (const file of AMIGA) {
    it(`${file} carries no box drawing and no blocks`, () => {
      const cps = codepoints(file);
      for (const [name, lo, hi] of RANGES) {
        const have = [];
        for (let cp = lo; cp <= hi; cp++) if (cps.has(cp)) have.push(cp);
        expect({ [name]: have.length }).toEqual({ [name]: 0 });
      }
    });
  }

  it('the teletext face DOES carry its own mosaics, which is why it can leave the atlas', () => {
    const cps = codepoints('TeletextUPR.ttf');
    expect(cps.has(0x2588)).toBe(true);
    let sextants = 0;
    for (let cp = 0x1fb00; cp <= 0x1fb3b; cp++) if (cps.has(cp)) sextants++;
    expect(sextants).toBe(0x1fb3b - 0x1fb00 + 1);
  });
});
