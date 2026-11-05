/**
 * A blank cell must be blank, in every face the board can draw in.
 *
 * xterm's DOM renderer writes an empty cell as U+00A0, the no-break space -
 * that is what `<span>&nbsp;&nbsp;...</span>` in a rendered row is. So a face
 * whose U+00A0 carries ink does not draw a blank there: it draws that ink, in
 * whatever colour the cell's foreground happens to be.
 *
 * `TopazPlus_a1200_v1.0.ttf` - the board's DEFAULT face - shipped with a
 * FULL-CELL BLOCK at U+00A0 (one contour, bbox 0,0 -> 800,1600 against an
 * advance of 800 and an em of 1600), where every sibling face has an empty
 * glyph there. The bulletin header `ESC[4;33m` + 77 spaces therefore painted
 * as 77 solid YELLOW blocks instead of a bar of blanks, and the sysop read the
 * screen as inverted - "mostly inverted but ok where there is text", which is
 * exactly the shape of a bug that lives in blank cells only (2026-09-14).
 *
 * The board sends no byte that wants that block: a scan of Screens, Bulletins
 * and the conferences found 0xA0 in archive payloads only, never in art. So
 * the glyph is emptied to match `space` in the same font, and this asks every
 * .ttf the board serves whether it agrees.
 *
 * The check reads the files rather than the font's name or version, because
 * the defect was invisible at every level above the glyph outline.
 */
import * as fs from 'fs';
import * as path from 'path';
import { describe, it, expect } from 'vitest';

const FONTS_DIR = path.resolve(__dirname, '..', '..', 'public', 'fonts');

/** The sfnt table directory: tag -> [offset, length]. */
function sfntTables(b: Buffer): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {};
  const count = b.readUInt16BE(4);
  for (let i = 0; i < count; i += 1) {
    const rec = 12 + i * 16;
    out[b.toString('latin1', rec, rec + 4)] = [b.readUInt32BE(rec + 8), b.readUInt32BE(rec + 12)];
  }
  return out;
}

/** The glyph id a codepoint maps to, through a format 4 cmap subtable. */
function glyphIdFor(b: Buffer, cmapOffset: number, cp: number): number | null {
  const tableCount = b.readUInt16BE(cmapOffset + 2);
  let best: number | null = null;
  for (let i = 0; i < tableCount; i += 1) {
    const rec = cmapOffset + 4 + i * 8;
    const sub = cmapOffset + b.readUInt32BE(rec + 4);
    if (b.readUInt16BE(sub) === 4) { best = sub; break; }
  }
  if (best === null) return null;

  const segX2 = b.readUInt16BE(best + 6);
  const ends = best + 14;
  const starts = ends + segX2 + 2;
  const deltas = starts + segX2;
  const ranges = deltas + segX2;

  for (let s = 0; s < segX2 / 2; s += 1) {
    if (b.readUInt16BE(ends + s * 2) < cp) continue;
    if (b.readUInt16BE(starts + s * 2) > cp) return 0;
    const delta = b.readInt16BE(deltas + s * 2);
    const rangeOffset = b.readUInt16BE(ranges + s * 2);
    if (rangeOffset === 0) return (cp + delta) & 0xffff;
    const at = ranges + s * 2 + rangeOffset + (cp - b.readUInt16BE(starts + s * 2)) * 2;
    const gid = b.readUInt16BE(at);
    return gid === 0 ? 0 : (gid + delta) & 0xffff;
  }
  return 0;
}

/**
 * Does this codepoint's glyph carry any outline at all?
 *
 * An empty glyph occupies ZERO bytes of `glyf`, so its two `loca` entries are
 * equal - the same thing fontTools reports as `numberOfContours = 0`, read
 * without a font library.
 */
function hasOutline(file: string, cp: number): boolean {
  const b = fs.readFileSync(path.join(FONTS_DIR, file));
  const t = sfntTables(b);
  const gid = glyphIdFor(b, t['cmap'][0], cp);
  if (gid === null || gid === 0) return false;      // unmapped draws nothing

  const longLoca = b.readInt16BE(t['head'][0] + 50) === 1;
  const loca = t['loca'][0];
  const at = (i: number) => (longLoca ? b.readUInt32BE(loca + i * 4) : b.readUInt16BE(loca + i * 2) * 2);
  return at(gid + 1) > at(gid);
}

const FACES = fs.readdirSync(FONTS_DIR).filter((f) => f.endsWith('.ttf')).sort();

describe('a blank cell is blank in every face the board ships', () => {
  it('finds the faces to check', () => {
    // A directory that stopped holding .ttf files would make every assertion
    // below vacuous.
    expect(FACES.length).toBeGreaterThanOrEqual(8);
    expect(FACES).toContain('TopazPlus_a1200_v1.0.ttf');   // the board default
  });

  it.each(FACES)('%s draws nothing for U+00A0, the cell xterm writes for a blank', (file) => {
    expect(hasOutline(file, 0x00a0)).toBe(false);
  });

  it.each(FACES)('%s draws nothing for U+0020 either', (file) => {
    expect(hasOutline(file, 0x0020)).toBe(false);
  });

  it('can tell ink from no ink', () => {
    // The instrument, on a glyph that certainly has an outline. Without this,
    // a reader that always returned false would pass every case above.
    expect(hasOutline('TopazPlus_a1200_v1.0.ttf', 0x004d)).toBe(true);   // M
  });
});
