/**
 * The advance ratio table is the shipped files, and applyFont uses it.
 *
 * seamlessSize makes a cell a whole CSS pixel by dividing through the face's
 * advance ratio, so a wrong ratio would snap to the wrong sizes and every
 * glyph that fills its cell would gap again (sysop, 2026-09-14). The table
 * is pinned here against the TTFs the page actually loads: hmtx advance of
 * `M` over head.unitsPerEm.
 */
import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import {
  advanceRatioFor,
  applyFont,
  seamlessSize,
  seamlessTeletextSize,
} from '../../../../../packages/terminal/src/utils/session-font';

const FONTS = path.resolve(__dirname, '../../../public/fonts');
const FILES: Record<string, string> = {
  'Topaz_a500': 'Topaz_a500_v1.0.ttf',
  'Topaz_a1200': 'Topaz_a1200_v1.0.ttf',
  'TopazPlus_a500': 'TopazPlus_a500_v1.0.ttf',
  'TopazPlus_a1200': 'TopazPlus_a1200_v1.0.ttf',
  'mosoul': 'mOsOul_v1.0.ttf',
  'MicroKnight': 'MicroKnight_v1.0.ttf',
  'MicroKnightPlus': 'MicroKnightPlus_v1.0.ttf',
  'P0T-NOoDLE': 'P0T-NOoDLE_v1.0.ttf',
  'PetMe64': 'PetMe64.ttf',
  'TeletextUPR': 'TeletextUPR.ttf',
};

function tables(buf: Buffer): Map<string, number> {
  const out = new Map<string, number>();
  const n = buf.readUInt16BE(4);
  for (let i = 0; i < n; i++) {
    const rec = 12 + 16 * i;
    out.set(buf.toString('ascii', rec, rec + 4), buf.readUInt32BE(rec + 8));
  }
  return out;
}

/** Glyph id of a BMP codepoint through the first format 4 cmap subtable. */
function glyphId(buf: Buffer, cmap: number, cp: number): number {
  const count = buf.readUInt16BE(cmap + 2);
  for (let i = 0; i < count; i++) {
    const sub = cmap + buf.readUInt32BE(cmap + 4 + 8 * i + 4);
    if (buf.readUInt16BE(sub) !== 4) continue;
    const segX2 = buf.readUInt16BE(sub + 6);
    const ends = sub + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
    for (let s = 0; s < segX2 / 2; s++) {
      const end = buf.readUInt16BE(ends + s * 2), start = buf.readUInt16BE(starts + s * 2);
      if (cp < start || cp > end) continue;
      const delta = buf.readInt16BE(deltas + s * 2), range = buf.readUInt16BE(ranges + s * 2);
      if (range === 0) return (cp + delta) & 0xffff;
      const g = buf.readUInt16BE(ranges + s * 2 + range + (cp - start) * 2);
      return g === 0 ? 0 : (g + delta) & 0xffff;
    }
  }
  return 0;
}

function measuredRatio(file: string): number {
  const buf = fs.readFileSync(path.join(FONTS, file));
  const t = tables(buf);
  const upm = buf.readUInt16BE(t.get('head')! + 18);
  const gid = glyphId(buf, t.get('cmap')!, 'M'.codePointAt(0)!);
  const numberOfHMetrics = buf.readUInt16BE(t.get('hhea')! + 34);
  const advance = buf.readUInt16BE(t.get('hmtx')! + Math.min(gid, numberOfHMetrics - 1) * 4);
  return advance / upm;
}

describe('the advance ratio table is the shipped files', () => {
  for (const [font, file] of Object.entries(FILES)) {
    it(`${font} advances ${advanceRatioFor(font)} of its em`, () => {
      expect(measuredRatio(file)).toBeCloseTo(advanceRatioFor(font), 6);
    });
  }
});

describe('seamlessSize', () => {
  it('gives a whole cell and never grows', () => {
    for (const font of Object.keys(FILES)) {
      for (const size of [12.7, 25.4, 29.95, 36, 41.5, 43.5]) {
        const snapped = seamlessSize(size, font);
        const cell = snapped * advanceRatioFor(font);
        expect(Math.abs(cell - Math.round(cell))).toBeLessThan(1e-9);
        expect(snapped).toBeLessThanOrEqual(size);
        expect(size - snapped).toBeLessThan(1 / advanceRatioFor(font));
      }
    }
  });

  it('is what the teletext helper is', () => {
    expect(seamlessTeletextSize(41.5)).toBe(seamlessSize(41.5, 'TeletextUPR'));
  });
});

describe('applyFont snaps the size it is handed', () => {
  it('leaves the terminal on a whole cell for the face it applies', async () => {
    const term = { options: { fontFamily: '', fontSize: 0, lineHeight: 1 } } as any;
    await applyFont(term, 'Topaz_a1200', 29.95, false);
    expect(term.options.fontSize).toBe(28);
    await applyFont(term, 'TeletextUPR', 41.5, false);
    expect(term.options.fontSize).toBe(40);
  });
});
