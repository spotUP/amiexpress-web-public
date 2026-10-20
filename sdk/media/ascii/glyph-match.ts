/**
 * Shape-matched cells: the glyph, foreground and background that best
 * reproduce the picture INSIDE a cell, not only its average colour.
 *
 * `nearestBlendCell` sees one colour per cell, so its glyph only sets how
 * much foreground shows: a cell that is white on top and black below gets
 * the same mid-grey blend as a flat grey one, edges vanish, and the letters
 * read as noise sprinkled over flat blocks (a 404media clip, 2026-10-20: no
 * recognisable face at 80x24). Here each cell arrives as SUB_X x SUB_Y
 * sub-pixels and every printable Topaz glyph is tried as a mask: the
 * rendered cell is the foreground where the glyph is lit and the background
 * elsewhere, and the (glyph, fg, bg) with the least squared error against
 * the sub-pixels wins. A vertical edge then picks a glyph lit on that side,
 * a thin line picks '|' or '-', and flat areas still blend as before.
 *
 * Error is measured in linear light with the channels weighted for the
 * eye: a glyph's ink and paper mix on screen as light does, so an sRGB
 * average reads too dark and the matcher overshot towards white ink. For
 * one glyph the error of any (fg, bg) pair follows from a few sums.
 *
 * Trying every palette pair for every glyph costs about 80 ms per 80x24
 * frame, more than a 10 fps clip allows. So each glyph is first scored with
 * free colours (the least-squares fg and bg, a 2x2 solve), and only the
 * best few glyphs plus a fixed coverage ramp go on to the palette search.
 * The ramp matters for flat cells: there every glyph fits perfectly with
 * free colours, and only the palette decides which coverage dithers best.
 */

import { paletteRgb, type PaletteName } from './color';
import type { AnsiCell } from './convert';
import type { TemporalState } from './dsp';

/** Sub-pixels per cell the matcher reads: Topaz 8x16 halved each way. */
export const SUB_X = 4;
export const SUB_Y = 8;
const N = SUB_X * SUB_Y;

/**
 * Topaz a500 8x16 bitmaps for ' ' (32) to '~' (126), 16 bytes each, one byte
 * per row, bit 7 leftmost (from Topaz_a500.F16).
 */
const TOPAZ_ASCII_HEX =
  '0000000000000000000000000000000018183c3c3c3c181818180000181800006c6c6c6c000000000000000000000000' +
  '6c6c6c6cfefe6c6cfefe6c6c6c6c000018183e3e60603c3c06067c7c181800000000c6c6cccc181830306666c6c60000' +
  '38386c6c68687676dcdccccc76760000181818183030000000000000000000000c0c181830303030303018180c0c0000' +
  '303018180c0c0c0c0c0c181830300000000066663c3cffff3c3c6666000000000000181818187e7e1818181800000000' +
  '000000000000000000001818181830300000000000007e7e000000000000000000000000000000000000181818180000' +
  '030306060c0c181830306060c0c000003c3c66666e6e7e7e767666663c3c00001818383818181818181818187e7e0000' +
  '3c3c666606061c1c303066667e7e00003c3c666606061c1c060666663c3c00001c1c3c3c6c6cccccfefe0c0c1e1e0000' +
  '7e7e60607c7c0606060666663c3c00001c1c303060607c7c666666663c3c00007e7e666606060c0c1818181818180000' +
  '3c3c666666663c3c666666663c3c00003c3c666666663e3e06060c0c3838000000001818181800000000181818180000' +
  '000018181818000000001818181830300c0c181830306060303018180c0c0000000000007e7e000000007e7e00000000' +
  '303018180c0c06060c0c1818303000003c3c666606060c0c18180000181800007c7cc6c6dedededededec0c078780000' +
  '18183c3c3c3c66667e7ec3c3c3c30000fcfc666666667c7c66666666fcfc00003c3c6666c0c0c0c0c0c066663c3c0000' +
  'f8f86c6c6666666666666c6cf8f80000fefe66666060787860606666fefe0000fefe66666060787860606060f0f00000' +
  '3c3c6666c0c0cecec6c666663e3e00006666666666667e7e66666666666600007e7e181818181818181818187e7e0000' +
  '0e0e060606060606666666663c3c0000e6e666666c6c78786c6c6666e6e60000f0f060606060606062626666fefe0000' +
  '8282c6c6eeeefefed6d6c6c6c6c60000c6c6e6e6f6f6dedececec6c6c6c6000038386c6cc6c6c6c6c6c66c6c38380000' +
  'fcfc666666667c7c60606060f0f0000038386c6cc6c6c6c6c6c66c6c3c3c0606fcfc666666667c7c6c6c6666e3e30000' +
  '3c3c6666707038380e0e66663c3c00007e7e5a5a18181818181818183c3c00006666666666666666666666663e3e0000' +
  'c3c3c3c3666666663c3c3c3c18180000c6c6c6c6c6c6d6d6fefeeeeec6c60000c3c366663c3c18183c3c6666c3c30000' +
  'c3c3c3c366663c3c181818183c3c0000fefec6c68c8c181832326666fefe00003c3c303030303030303030303c3c0000' +
  'c0c06060303018180c0c0606030300003c3c0c0c0c0c0c0c0c0c0c0c3c3c0000101038386c6cc6c60000000000000000' +
  '0000000000000000000000000000fefe181818180c0c00000000000000000000000000003c3c06061e1e66663b3b0000' +
  'e0e060606c6c7676666666663c3c0000000000003c3c6666606066663c3c00000e0e060636366e6e666666663b3b0000' +
  '000000003c3c66667e7e60603c3c00001c1c3636303078783030303078780000000000003b3b666666663c3cc6c67c7c' +
  'e0e060606c6c767666666666e6e600001818000038381818181818183c3c000006060000060606060606060666663c3c' +
  'e0e0606066666c6c78786c6ce6e600003838181818181818181818183c3c000000000000666677776b6b636363630000' +
  '000000007c7c66666666666666660000000000003c3c6666666666663c3c000000000000dcdc666666667c7c6060f0f0' +
  '000000003d3d666666663e3e0606070700000000ecec767666666060f0f00000000000003e3e60603c3c06067c7c0000' +
  '080818183e3e181818181a1a0c0c00000000000066666666666666663b3b0000000000006666666666663c3c18180000' +
  '0000000063636b6b6b6b36363636000000000000636336361c1c363663630000000000006666666666663c3c18187070' +
  '000000007e7e4c4c181832327e7e00000e0e181818187070181818180e0e000018181818181818181818181818180000' +
  '7070181818180e0e181818187070000072729c9c000000000000000000000000';

interface Glyph {
  char: string;
  /** Sub-pixels with any ink, and their ink fraction 0-1. */
  lit: Int32Array;
  ink: Float32Array;
  sumM: number;
  sumMM: number;
  sumMU: number;
  sumUU: number;
  /** Inverse of the free-colour normal matrix [[MM, MU], [MU, UU]]; null for a blank glyph. */
  inv: [number, number, number] | null;
}

function buildGlyphs(): Glyph[] {
  const out: Glyph[] = [];
  const seen = new Set<string>();
  for (let g = 0; g < 95; g++) {
    const m = new Float32Array(N);
    for (let y = 0; y < 16; y++) {
      const row = parseInt(TOPAZ_ASCII_HEX.substr((g * 16 + y) * 2, 2), 16);
      for (let x = 0; x < 8; x++) if (row & (0x80 >> x)) m[(y >> 1) * SUB_X + (x >> 1)] += 0.25;
    }
    // Glyphs with the same mask at this resolution add cost and nothing else.
    const sig = Array.from(m).join(',');
    if (seen.has(sig)) continue;
    seen.add(sig);
    let sumM = 0;
    let sumMM = 0;
    let sumMU = 0;
    let sumUU = 0;
    for (const v of m) {
      sumM += v;
      sumMM += v * v;
      sumMU += v * (1 - v);
      sumUU += (1 - v) * (1 - v);
    }
    const det = sumMM * sumUU - sumMU * sumMU;
    const lit = Int32Array.from(Array.from(m.keys()).filter((i) => m[i] > 0));
    const ink = Float32Array.from(lit, (i) => m[i]);
    out.push({
      char: String.fromCharCode(32 + g), lit, ink, sumM, sumMM, sumMU, sumUU,
      inv: det > 1e-9 ? [sumUU / det, -sumMU / det, sumMM / det] : null,
    });
  }
  return out;
}

const GLYPHS = buildGlyphs();
const BLANK = GLYPHS.findIndex((g) => g.sumM === 0);

/** Glyphs spread over ink coverage, always searched: the flat-cell dithers. */
const RAMP_STEPS = 8;
const RAMP: number[] = (() => {
  const maxInk = Math.max(...GLYPHS.map((g) => g.sumM));
  const picks = new Set<number>([BLANK]);
  for (let k = 1; k <= RAMP_STEPS; k++) {
    const want = (maxInk * k) / RAMP_STEPS;
    let best = BLANK;
    for (let g = 0; g < GLYPHS.length; g++) {
      if (Math.abs(GLYPHS[g].sumM - want) < Math.abs(GLYPHS[best].sumM - want)) best = g;
    }
    picks.add(best);
  }
  return [...picks];
})();

/** Glyphs taken from the free-colour scoring into the palette search. */
const SHORTLIST = 6;

/**
 * Per-channel weights on linear light (red, green, blue). Green carries
 * most of the brightness the eye sees; blue the least.
 */
const WEIGHT = [Math.sqrt(0.3), Math.sqrt(0.59), Math.sqrt(0.11)];

/** sRGB byte to weighted linear light, per channel. */
const LINEAR: Float32Array[] = WEIGHT.map((w) => {
  const t = new Float32Array(256);
  for (let v = 0; v < 256; v++) {
    const c = v / 255;
    t[v] = w * (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  }
  return t;
});

const PALETTES = new Map<PaletteName, Float32Array>();
function paletteLinear(palette: PaletteName): Float32Array {
  let p = PALETTES.get(palette);
  if (!p) {
    const rgb = paletteRgb(palette);
    p = new Float32Array(rgb.length * 3);
    rgb.forEach((col, i) => {
      for (let c = 0; c < 3; c++) p![i * 3 + c] = LINEAR[c][col[c]];
    });
    PALETTES.set(palette, p);
  }
  return p;
}

/** Palette colours to try for one group of sub-pixels. */
const NEAREST = 3;

const nearestDist = new Float32Array(NEAREST);
function nearest(pal: Float32Array, count: number, r: number, g: number, b: number, into: Int32Array): void {
  const best = nearestDist;
  best.fill(Infinity);
  into.fill(-1);
  for (let i = 0; i < count; i++) {
    const dr = pal[i * 3] - r;
    const dg = pal[i * 3 + 1] - g;
    const db = pal[i * 3 + 2] - b;
    const d = dr * dr + dg * dg + db * db;
    for (let k = 0; k < NEAREST; k++) {
      if (d < best[k]) {
        for (let j = NEAREST - 1; j > k; j--) {
          best[j] = best[j - 1];
          into[j] = into[j - 1];
        }
        best[k] = d;
        into[k] = i;
        break;
      }
    }
  }
}

/** The cell's colour summed under the glyph's ink, per channel. */
function inkSums(gl: Glyph, px: Float32Array, mx: Float32Array): void {
  let r = 0;
  let g = 0;
  let b = 0;
  for (let k = 0; k < gl.lit.length; k++) {
    const i = gl.lit[k] * 3;
    const w = gl.ink[k];
    r += w * px[i];
    g += w * px[i + 1];
    b += w * px[i + 2];
  }
  mx[0] = r;
  mx[1] = g;
  mx[2] = b;
}

/** Least error any colours could reach with this glyph (mx already filled). */
function freeError(gl: Glyph, sx: Float32Array, sXX: number, mx: Float32Array): number {
  let e = sXX;
  if (!gl.inv) {
    for (let c = 0; c < 3; c++) e -= (sx[c] * sx[c]) / N;
    return e;
  }
  const [a, b, d] = gl.inv;
  for (let c = 0; c < 3; c++) {
    const ym = mx[c];
    const yu = sx[c] - ym;
    e -= ym * (a * ym + b * yu) + yu * (b * ym + d * yu);
  }
  return e;
}

/** The least-squares fg (into[0..2]) and bg (into[3..5]) for this glyph (mx already filled). */
function freeColours(gl: Glyph, sx: Float32Array, mx: Float32Array, into: Float32Array): void {
  for (let c = 0; c < 3; c++) {
    const ym = mx[c];
    const yu = sx[c] - ym;
    if (gl.inv) {
      const [a, b, d] = gl.inv;
      into[c] = a * ym + b * yu;
      into[3 + c] = b * ym + d * yu;
    } else {
      into[c] = gl.sumM > 0 ? ym / gl.sumM : 0;
      into[3 + c] = gl.sumM < N ? yu / (N - gl.sumM) : 0;
    }
  }
}

/** Squared error of drawing glyph `gl` in fg over bg, from the cell's sums. */
function pairError(
  pal: Float32Array, gl: Glyph, fg: number, bg: number, sx: Float32Array, sXX: number, mx: Float32Array,
): number {
  let e = sXX;
  for (let c = 0; c < 3; c++) {
    const f = pal[fg * 3 + c];
    const b = pal[bg * 3 + c];
    e += -2 * f * mx[c] - 2 * b * (sx[c] - mx[c]) + f * f * gl.sumMM + 2 * f * b * gl.sumMU + b * b * gl.sumUU;
  }
  return e;
}

/**
 * A previous cell is kept while its error stays within this share of the
 * best one: near-ties otherwise flip glyphs every frame and the picture
 * shimmers.
 */
export const KEEP_PREVIOUS = 1.15;
/** Absolute slack on top, so a near-exact match does not freeze a cell. */
const KEEP_SLACK = 0.005;

const packCell = (g: number, fg: number, bg: number): number => (g << 16) | (fg << 8) | bg;

/**
 * Cells for a picture already sized to cols*SUB_X x rows*SUB_Y RGB bytes.
 * With `state` the choice of the previous frame is kept on near-ties.
 */
export function matchCells(
  rgb: Uint8Array,
  cols: number,
  rows: number,
  palette: PaletteName,
  bgLimit: number,
  state?: TemporalState,
): AnsiCell[][] {
  const pal = paletteLinear(palette);
  const fgCount = pal.length / 3;
  const width = cols * SUB_X;
  const px = new Float32Array(N * 3);
  const sx = new Float32Array(3);
  const mx = new Float32Array(3);
  const fgs = new Int32Array(NEAREST);
  const bgs = new Int32Array(NEAREST);
  const free = new Float32Array(6);
  const shortE = new Float32Array(SHORTLIST);
  const shortG = new Int32Array(SHORTLIST);
  const prev = state?.cells && state.cells.length === cols * rows ? state.cells : null;
  const next = new Int32Array(cols * rows);
  const grid: AnsiCell[][] = [];
  let bestE = Infinity;
  let best = 0;
  const search = (g: number, sXX: number): void => {
    const gl = GLYPHS[g];
    inkSums(gl, px, mx);
    // Candidates are the palette colours nearest the free least-squares fg and
    // bg. Plain lit and unlit means mislead when ink is fractional: the unlit
    // mean of a half-lit cell is grey, and black never made the shortlist.
    freeColours(gl, sx, mx, free);
    nearest(pal, bgLimit, free[3], free[4], free[5], bgs);
    if (gl.sumM === 0) {
      // A blank cell shows only its background; its foreground is 0.
      for (const bg of bgs) {
        if (bg < 0) continue;
        const e = pairError(pal, gl, 0, bg, sx, sXX, mx);
        if (e < bestE) { bestE = e; best = packCell(g, 0, bg); }
      }
      return;
    }
    nearest(pal, fgCount, free[0], free[1], free[2], fgs);
    for (const fg of fgs) {
      if (fg < 0) continue;
      for (const bg of bgs) {
        if (bg < 0) continue;
        const e = pairError(pal, gl, fg, bg, sx, sXX, mx);
        if (e < bestE) { bestE = e; best = packCell(g, fg, bg); }
      }
    }
  };
  for (let cy = 0; cy < rows; cy++) {
    const line: AnsiCell[] = [];
    for (let cx = 0; cx < cols; cx++) {
      let sXX = 0;
      sx.fill(0);
      for (let y = 0; y < SUB_Y; y++) {
        for (let x = 0; x < SUB_X; x++) {
          const o = ((cy * SUB_Y + y) * width + cx * SUB_X + x) * 3;
          const i = (y * SUB_X + x) * 3;
          for (let c = 0; c < 3; c++) {
            const v = LINEAR[c][rgb[o + c]];
            px[i + c] = v;
            sx[c] += v;
            sXX += v * v;
          }
        }
      }
      // Shortlist the glyphs whose shape fits best with free colours.
      shortE.fill(Infinity);
      shortG.fill(-1);
      for (let g = 0; g < GLYPHS.length; g++) {
        const gl = GLYPHS[g];
        inkSums(gl, px, mx);
        const e = freeError(gl, sx, sXX, mx);
        if (e >= shortE[SHORTLIST - 1]) continue;
        let k = SHORTLIST - 1;
        while (k > 0 && shortE[k - 1] > e) {
          shortE[k] = shortE[k - 1];
          shortG[k] = shortG[k - 1];
          k--;
        }
        shortE[k] = e;
        shortG[k] = g;
      }
      bestE = Infinity;
      best = 0;
      for (const g of shortG) if (g >= 0) search(g, sXX);
      for (const g of RAMP) search(g, sXX);
      const at = cy * cols + cx;
      if (prev) {
        const p = prev[at];
        const pg = p >> 16;
        const pfg = (p >> 8) & 0xff;
        const pbg = p & 0xff;
        if (p !== best && pg < GLYPHS.length && pbg < bgLimit) {
          const gl = GLYPHS[pg];
          inkSums(gl, px, mx);
          if (pairError(pal, gl, pfg, pbg, sx, sXX, mx) <= bestE * KEEP_PREVIOUS + KEEP_SLACK) best = p;
        }
      }
      next[at] = best;
      line.push({ char: GLYPHS[best >> 16].char, fg: (best >> 8) & 0xff, bg: best & 0xff });
    }
    grid.push(line);
  }
  if (state) state.cells = next;
  return grid;
}
