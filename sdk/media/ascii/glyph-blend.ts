/**
 * One colour decision per text cell: glyph, foreground and background picked
 * together.
 *
 * Seen from a normal distance a cell reads as one colour: the foreground over
 * the glyph's lit pixels mixed with the background over the rest, in linear
 * light. Choosing the foreground, the background and the glyph independently
 * (foreground = nearest colour, background = nearest to a dimmed copy,
 * glyph = luma ramp) loses the hue: a pink face became white on grey. Here
 * every (glyph, fg, bg) blend is a candidate and the one nearest the target
 * colour in CIELAB wins.
 */

import { paletteRgb, rgbToLab, type PaletteName } from './color';
import type { AnsiCell } from './convert';

/**
 * Glyphs by coverage: lit pixels of 128 in the Topaz a500 8x16 font
 * (measured from Topaz_a500.F16). One glyph per level; '#' is the densest
 * glyph Topaz has, about half the cell.
 */
export const TOPAZ_COVERAGE: readonly (readonly [string, number])[] = [
  [' ', 0], ['.', 8], [':', 16], [';', 20], ['+', 28], ['i', 30], ['?', 32], ['l', 34],
  ['r', 40], ['I', 44], ['*', 48], ['X', 52], ['d', 54], ['&', 58], ['0', 64], ['#', 68],
];
const TOPAZ_CELL_PIXELS = 128;

interface Candidate {
  L: number;
  a: number;
  b: number;
  /** Glyph coverage 0-1. */
  cov: number;
  fgA: number;
  fgB: number;
  bgA: number;
  bgB: number;
  cell: AnsiCell;
}

/**
 * Weight of the hue penalty: each of fg and bg pays its own chroma-plane
 * distance from the target, weighted by its share of the cell. Without it a
 * magenta glyph on a green background averages to skin and the face turns
 * into coloured speckle.
 */
export const HUE_PENALTY = 0.5;

const toLinear = (v: number): number => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const toSrgb = (v: number): number => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);

const CANDIDATES = new Map<string, Candidate[]>();
function candidates(palette: PaletteName, bgLimit: number): Candidate[] {
  const key = `${palette}:${bgLimit}`;
  let list = CANDIDATES.get(key);
  if (list) return list;
  const rgb = paletteRgb(palette).map((c) => c.map(toLinear));
  const labs = paletteRgb(palette).map(([r, g, b]) => rgbToLab(r, g, b));
  list = [];
  for (const [char, lit] of TOPAZ_COVERAGE) {
    const cov = lit / TOPAZ_CELL_PIXELS;
    for (let fg = 0; fg < rgb.length; fg++) {
      if (lit === 0 && fg > 0) continue; // a blank cell shows only its background
      for (let bg = 0; bg < bgLimit; bg++) {
        const mix = [0, 1, 2].map((k) => toSrgb(cov * rgb[fg][k] + (1 - cov) * rgb[bg][k]));
        const [L, a, b] = rgbToLab(mix[0], mix[1], mix[2]);
        list.push({ L, a, b, cov, fgA: labs[fg][1], fgB: labs[fg][2], bgA: labs[bg][1], bgB: labs[bg][2], cell: { char, fg, bg } });
      }
    }
  }
  CANDIDATES.set(key, list);
  return list;
}

const PICKS = new Map<string, Map<number, AnsiCell>>();
const PICK_CACHE_LIMIT = 1 << 16;

/**
 * The cell whose blended colour is nearest the CIELAB target. Targets are
 * rounded to whole LAB units, far below what a 16-colour blend can resolve,
 * and the answer is cached per palette.
 */
export function nearestBlendCell(L: number, a: number, b: number, palette: PaletteName, bgLimit: number): AnsiCell {
  const key = `${palette}:${bgLimit}`;
  let picks = PICKS.get(key);
  if (!picks) {
    picks = new Map();
    PICKS.set(key, picks);
  }
  const qL = Math.round(L);
  const qa = Math.round(a);
  const qb = Math.round(b);
  const q = (qL * 256 + (qa + 128)) * 256 + (qb + 128);
  const hit = picks.get(q);
  if (hit) return hit;
  let best = candidates(palette, bgLimit)[0];
  let bestDist = Infinity;
  for (const c of candidates(palette, bgLimit)) {
    const dL = c.L - qL;
    const da = c.a - qa;
    const db = c.b - qb;
    const fa = c.fgA - qa;
    const fb = c.fgB - qb;
    const ba = c.bgA - qa;
    const bb = c.bgB - qb;
    const hue = c.cov * (fa * fa + fb * fb) + (1 - c.cov) * (ba * ba + bb * bb);
    const dist = dL * dL + da * da + db * db + HUE_PENALTY * hue;
    if (dist < bestDist) {
      bestDist = dist;
      best = c;
    }
  }
  if (picks.size >= PICK_CACHE_LIMIT) picks.clear();
  picks.set(q, best.cell);
  return best.cell;
}
