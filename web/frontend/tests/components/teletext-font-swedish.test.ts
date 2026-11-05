/**
 * The teletext face must draw a ring on lowercase a-ring.
 *
 * TDAText 0.1.3 - the upstream this face is derived from - ships 'aring' as
 * a byte-for-byte copy of 'adieresis', outline and embedded bitmap alike, so
 * a Swedish teletext page reads "Nagon" with two dots where the ring belongs
 * (sysop, 2026-09-13). The repaired glyph lives in the font file this test
 * reads, and the point of the test is that a future re-vendoring of upstream
 * cannot quietly put the bug back.
 *
 * The font is parsed here rather than rendered: two glyphs that share an
 * outline share their bytes, which is exactly what upstream does, and that
 * is provable without a rasteriser.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const FONT = path.resolve(__dirname, '..', '..', 'public', 'fonts', 'TeletextUPR.ttf');

function tables(buf: Buffer): Map<string, { offset: number; length: number }> {
  const out = new Map<string, { offset: number; length: number }>();
  const count = buf.readUInt16BE(4);
  for (let i = 0; i < count; i += 1) {
    const rec = 12 + 16 * i;
    out.set(buf.toString('latin1', rec, rec + 4), {
      offset: buf.readUInt32BE(rec + 8),
      length: buf.readUInt32BE(rec + 12),
    });
  }
  return out;
}

/** Glyph id for a codepoint, out of a format 4 cmap subtable. */
function glyphId(buf: Buffer, cmapOffset: number, codepoint: number): number {
  const subtables = buf.readUInt16BE(cmapOffset + 2);
  let format4 = -1;
  for (let i = 0; i < subtables; i += 1) {
    const rec = cmapOffset + 4 + 8 * i;
    const offset = cmapOffset + buf.readUInt32BE(rec + 4);
    if (buf.readUInt16BE(offset) === 4) { format4 = offset; break; }
  }
  if (format4 < 0) throw new Error('no format 4 cmap in the teletext font');

  const segCount = buf.readUInt16BE(format4 + 6) / 2;
  const ends = format4 + 14;
  const starts = ends + segCount * 2 + 2;
  const deltas = starts + segCount * 2;
  const ranges = deltas + segCount * 2;
  for (let seg = 0; seg < segCount; seg += 1) {
    const end = buf.readUInt16BE(ends + seg * 2);
    const start = buf.readUInt16BE(starts + seg * 2);
    if (codepoint > end || codepoint < start) continue;
    const delta = buf.readInt16BE(deltas + seg * 2);
    const rangeOffset = buf.readUInt16BE(ranges + seg * 2);
    if (rangeOffset === 0) return (codepoint + delta) & 0xffff;
    const at = ranges + seg * 2 + rangeOffset + (codepoint - start) * 2;
    const id = buf.readUInt16BE(at);
    return id === 0 ? 0 : (id + delta) & 0xffff;
  }
  return 0;
}

/** The raw outline bytes of one glyph, out of loca + glyf. */
function outline(buf: Buffer, t: ReturnType<typeof tables>, gid: number): Buffer {
  const head = t.get('head')!;
  const longLoca = buf.readInt16BE(head.offset + 50) === 1;
  const loca = t.get('loca')!;
  const glyf = t.get('glyf')!;
  const read = (index: number) => (longLoca
    ? buf.readUInt32BE(loca.offset + index * 4)
    : buf.readUInt16BE(loca.offset + index * 2) * 2);
  return buf.subarray(glyf.offset + read(gid), glyf.offset + read(gid + 1));
}

describe('the teletext face draws Swedish', () => {
  const buf = fs.readFileSync(FONT);
  const t = tables(buf);
  const cmap = t.get('cmap')!;
  const gid = (ch: string) => glyphId(buf, cmap.offset, ch.codePointAt(0)!);

  it('has a distinct glyph for every letter, not one shape wearing two names', () => {
    for (const ch of 'åäöÅÄÖ') expect(gid(ch)).toBeGreaterThan(0);
    const ids = 'åäöÅÄÖ'.split('').map(gid);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('does not draw lowercase a-ring as a-dieresis', () => {
    const ring = outline(buf, t, gid('å'));
    const dieresis = outline(buf, t, gid('ä'));
    expect(ring.length).toBeGreaterThan(0);
    expect(ring.equals(dieresis)).toBe(false);
  });

  it('carries a top and a bottom half for every Latin-1 printable', () => {
    // Double height is drawn by the font because xterm.js has no DECDHL; the
    // halves live at 0xE200 + (cp - 0x20) and 0xE300 + (cp - 0x20), clear of
    // the U+E000-E1FF block the PETSCII transducer already owns.
    for (const ch of 'A z0 \u00e5\u00f6') {
      const cp = ch.codePointAt(0)!;
      const topId = glyphId(buf, cmap.offset, 0xe200 + cp - 0x20);
      const bottomId = glyphId(buf, cmap.offset, 0xe300 + cp - 0x20);
      expect(topId).toBeGreaterThan(0);
      expect(bottomId).toBeGreaterThan(0);
      expect(topId).not.toBe(bottomId);
      expect(topId).not.toBe(gid(ch));
    }
  });

  it('asks for no leading, so consecutive rows touch', () => {
    // A cell taller than the em pushes the two halves of a headline apart and
    // cuts every letter across the middle (sysop, 2026-09-13). A teletext
    // grid has no leading by definition: ascent + descent = one em, gap zero.
    const hhea = t.get('hhea')!;
    const ascent = buf.readInt16BE(hhea.offset + 4);
    const descent = buf.readInt16BE(hhea.offset + 6);
    const lineGap = buf.readInt16BE(hhea.offset + 8);
    const head = t.get('head')!;
    const unitsPerEm = buf.readUInt16BE(head.offset + 18);

    expect(lineGap).toBe(0);
    expect(ascent - descent).toBe(unitsPerEm);
  });

  it('gives each half its own side bearing, so the halves line up', () => {
    // A half is as WIDE as the character it is half of - same advance - but
    // its left side bearing is its own. Copying the source's shifted every
    // half sideways by the difference between the bounding boxes, and the
    // stem of a double-height 'T' came out left of its crossbar (sysop,
    // 2026-09-13).
    const hhea = t.get('hhea')!;
    const numberOfHMetrics = buf.readUInt16BE(hhea.offset + 34);
    const hmtx = t.get('hmtx')!;
    const metric = (gid: number) => {
      if (gid < numberOfHMetrics) {
        return {
          advance: buf.readUInt16BE(hmtx.offset + gid * 4),
          lsb: buf.readInt16BE(hmtx.offset + gid * 4 + 2),
        };
      }
      const extra = gid - numberOfHMetrics;
      return {
        advance: buf.readUInt16BE(hmtx.offset + (numberOfHMetrics - 1) * 4),
        lsb: buf.readInt16BE(hmtx.offset + numberOfHMetrics * 4 + extra * 2),
      };
    };
    const xMinOf = (gid: number) => outline(buf, t, gid).readInt16BE(2);

    for (const ch of 'TAgj\u00e5') {
      const cp = ch.codePointAt(0)!;
      const source = metric(gid(ch));
      for (const base of [0xe200, 0xe300]) {
        const half = glyphId(buf, cmap.offset, base + cp - 0x20);
        expect(metric(half).advance).toBe(source.advance);
        expect(metric(half).lsb).toBe(xMinOf(half));
      }
    }
  });

  it('stacks into exactly twice the letter, with the halves meeting', () => {
    // The invariant that makes double height real: drawn on consecutive rows
    // (one cell, 20 pixels of 50 units, apart) the two halves cover twice the
    // plain glyph's height and meet exactly - no gap, no overlap.
    const CELL = 1000;
    const box = (cp: number) => {
      const glyph = outline(buf, t, glyphId(buf, cmap.offset, cp));
      // Simple glyph header: contours, xMin, yMin, xMax, yMax - so yMin is
      // at byte 4 and yMax at byte 8.
      return { yMin: glyph.readInt16BE(4), yMax: glyph.readInt16BE(8) };
    };

    for (const ch of 'Agq\u00e5') {
      const cp = ch.codePointAt(0)!;
      const plain = box(cp);
      const top = box(0xe200 + cp - 0x20);
      const bottom = box(0xe300 + cp - 0x20);

      // The bottom half is drawn one row lower, so shift it there.
      const shifted = { yMin: bottom.yMin - CELL, yMax: bottom.yMax - CELL };
      expect(top.yMin).toBe(shifted.yMax);                       // they meet
      expect(top.yMax - shifted.yMin).toBe(2 * (plain.yMax - plain.yMin));
    }
  });

  it('gives a-ring the same mark uppercase A-ring has, one pixel row taller than a', () => {
    // The ring reaches the ascender (800 units); plain 'a' stops at the
    // x-height (500). yMax is bytes 8..10 of a simple glyph record.
    const yMaxOf = (ch: string) => outline(buf, t, gid(ch)).readInt16BE(8);
    expect(yMaxOf('a')).toBe(500);
    expect(yMaxOf('å')).toBe(800);
    expect(yMaxOf('Å')).toBe(800);
    // And it is taller than the dieresis, which only reaches 700.
    expect(yMaxOf('ä')).toBe(700);
  });
});
