/**
 * BBSGraphics carries the DOS graphics, drawn to tile the Amiga cell.
 *
 * Every Amiga face this board ships stops at U+00FF: zero of the 128
 * box-drawing codepoints, zero of the 32 block elements. CP437 art is made of
 * exactly those, and they came from a table inside xterm's canvas addon -
 * which is also what blits every FACE glyph a device pixel short of its cell
 * and gave the artists their seam. This font moves that drawing into a face
 * so the DOM renderer can serve a session.
 *
 * What has to hold for a cell to tile its neighbour: the advance is the same
 * 0.5 em the Amiga faces use, the line box is the whole em (they declare
 * ascent = upm, descent = 0), and a solid block's ink fills both.
 */
import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

const FONT = path.resolve(__dirname, '../../../public/fonts/BBSGraphics.ttf');

function tables(buf: Buffer): Map<string, number> {
  const out = new Map<string, number>();
  const n = buf.readUInt16BE(4);
  for (let i = 0; i < n; i++) {
    const rec = 12 + 16 * i;
    out.set(buf.toString('ascii', rec, rec + 4), buf.readUInt32BE(rec + 8));
  }
  return out;
}

/** Glyph id of a BMP codepoint, through the first format 4 subtable. */
function glyphId(buf: Buffer, cmap: number, cp: number): number {
  const count = buf.readUInt16BE(cmap + 2);
  for (let i = 0; i < count; i++) {
    const sub = cmap + buf.readUInt32BE(cmap + 4 + 8 * i + 4);
    if (buf.readUInt16BE(sub) !== 4) continue;
    const segX2 = buf.readUInt16BE(sub + 6);
    const ends = sub + 14, starts = ends + segX2 + 2;
    const deltas = starts + segX2, ranges = deltas + segX2;
    for (let s = 0; s < segX2 / 2; s++) {
      const end = buf.readUInt16BE(ends + s * 2);
      const start = buf.readUInt16BE(starts + s * 2);
      if (cp < start || cp > end) continue;
      const delta = buf.readInt16BE(deltas + s * 2);
      const range = buf.readUInt16BE(ranges + s * 2);
      if (range === 0) return (cp + delta) & 0xffff;
      const g = buf.readUInt16BE(ranges + s * 2 + range + (cp - start) * 2);
      return g === 0 ? 0 : (g + delta) & 0xffff;
    }
  }
  return 0;
}

const buf = fs.readFileSync(FONT);
const t = tables(buf);
const upm = buf.readUInt16BE(t.get('head')! + 18);
const cmap = t.get('cmap')!;

/** [xMin, yMin, xMax, yMax] of a glyph, or null when it has no outline. */
function bounds(cp: number): [number, number, number, number] | null {
  const gid = glyphId(buf, cmap, cp);
  if (!gid) return null;
  const indexToLoc = buf.readInt16BE(t.get('head')! + 50);
  const loca = t.get('loca')!;
  const at = (i: number) => (indexToLoc === 0
    ? buf.readUInt16BE(loca + i * 2) * 2
    : buf.readUInt32BE(loca + i * 4));
  const start = at(gid), end = at(gid + 1);
  if (end <= start) return null;
  const g = t.get('glyf')! + start;
  return [buf.readInt16BE(g + 2), buf.readInt16BE(g + 4),
    buf.readInt16BE(g + 6), buf.readInt16BE(g + 8)];
}

function advance(cp: number): number {
  const gid = glyphId(buf, cmap, cp);
  const numberOfHMetrics = buf.readUInt16BE(t.get('hhea')! + 34);
  return buf.readUInt16BE(t.get('hmtx')! + Math.min(gid, numberOfHMetrics - 1) * 4);
}

describe('BBSGraphics covers what the Amiga faces do not', () => {
  it('has every box-drawing codepoint, U+2500-257F', () => {
    const missing: string[] = [];
    for (let cp = 0x2500; cp <= 0x257f; cp++) {
      if (!glyphId(buf, cmap, cp)) missing.push(`U+${cp.toString(16).toUpperCase()}`);
    }
    expect(missing).toEqual([]);
  });

  it('has every block element, U+2580-259F', () => {
    const missing: string[] = [];
    for (let cp = 0x2580; cp <= 0x259f; cp++) {
      if (!glyphId(buf, cmap, cp)) missing.push(`U+${cp.toString(16).toUpperCase()}`);
    }
    expect(missing).toEqual([]);
  });
});

describe('and it tiles the Amiga cell', () => {
  it('advances half an em, like every face it stands beside', () => {
    for (const cp of [0x2588, 0x2500, 0x2551, 0x2592]) {
      expect(advance(cp)).toBe(upm / 2);
    }
  });

  it('fills the whole cell with the full block - both axes, edge to edge', () => {
    const box = bounds(0x2588);
    expect(box).not.toBeNull();
    const [xMin, yMin, xMax, yMax] = box!;
    expect(xMin).toBe(0);
    expect(xMax).toBe(upm / 2);       // the advance: the next cell starts here
    expect(yMin).toBe(0);
    expect(yMax).toBe(upm);           // the line box: the row below starts here
  });

  it('draws the halves as halves, against the same cell', () => {
    const [, upperMin, , upperMax] = bounds(0x2580)!;   // upper half block
    expect(upperMax).toBe(upm);
    expect(upperMin).toBe(upm / 2);
    const [, lowerMin, , lowerMax] = bounds(0x2584)!;   // lower half block
    expect(lowerMin).toBe(0);
    expect(lowerMax).toBe(upm / 2);
  });

  it('runs a vertical rule the full height, so it meets the row above', () => {
    for (const cp of [0x2502, 0x2503, 0x2551]) {
      const [, yMin, , yMax] = bounds(cp)!;
      expect(yMin).toBe(0);
      expect(yMax).toBe(upm);
    }
  });

  it('runs a horizontal rule the full width, so it meets the cell beside it', () => {
    for (const cp of [0x2500, 0x2501, 0x2550]) {
      const [xMin, , xMax] = bounds(cp)!;
      expect(xMin).toBe(0);
      expect(xMax).toBe(upm / 2);
    }
  });

  it('declares the line box as the whole em, which is how the Amiga faces do', () => {
    const hhea = t.get('hhea')!;
    expect(buf.readInt16BE(hhea + 4)).toBe(upm);   // ascent
    expect(buf.readInt16BE(hhea + 6)).toBe(0);     // descent
    expect(buf.readInt16BE(hhea + 8)).toBe(0);     // lineGap
  });
});
