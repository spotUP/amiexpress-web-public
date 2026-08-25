/**
 * Half-cell positioning with block glyphs.
 *
 * A terminal moves things one whole cell at a time, which reads as a stutter
 * for anything that should glide - a paddle, a ball. The block glyphs let an
 * object sit on a half-cell boundary instead: the cell it half-covers is
 * drawn as a half block in the object's colour over the background, so the
 * eye sees it move half a step.
 *
 * ONE AXIS AT A TIME. The half blocks used here - left, right, upper, lower -
 * are all CP437, so they exist in the BBS fonts (LiveChat's video encoder
 * already renders U+2580 through this same terminal). The QUADRANT glyphs
 * that would allow a half step on both axes at once are NOT CP437, so a
 * diagonal half-step would land on a missing glyph. Callers pick the axis
 * that matters - for a ball, whichever way it is mostly travelling.
 *
 * Everything here is pure: it takes fractional coordinates and returns the
 * cells to paint, so it can be tested without a terminal and reused by any
 * renderer regardless of whether it speaks ANSI or blessed tags.
 */

/** The block glyphs, all CP437. */
export const SUBCELL_CHARS = {
  /** Left half filled - an object whose right edge sits mid-cell. */
  left: '▌',
  /** Right half filled - an object whose left edge sits mid-cell. */
  right: '▐',
  /** Upper half filled. */
  top: '▀',
  /** Lower half filled. */
  bottom: '▄',
  /** Whole cell. */
  full: '█',
} as const;

/** One cell to paint. */
export interface SubcellSpan {
  x: number;
  y: number;
  /** The glyph. `full` cells can also be drawn as a background block. */
  char: string;
  /**
   * False for a whole cell, true for a half one. A renderer may draw a whole
   * cell with a background colour (cheaper, and avoids a glyph entirely) and
   * must draw a half cell as a foreground glyph over the background.
   */
  partial: boolean;
}

/**
 * How far into a cell a coordinate has to be before it counts as a half step.
 * Below this it snaps back, above its mirror it snaps on - so an object
 * creeping across a boundary does not flicker between representations.
 */
const HALF_LOW = 0.25;
const HALF_HIGH = 0.75;

/** Where a fractional coordinate sits: on the cell, half past it, or the next. */
export type SubcellOffset = 'whole' | 'half' | 'next';

export function offsetFor(coordinate: number): SubcellOffset {
  const frac = coordinate - Math.floor(coordinate);
  if (frac < HALF_LOW) return 'whole';
  if (frac >= HALF_HIGH) return 'next';
  return 'half';
}

/**
 * A horizontal bar `width` cells long whose left edge is at fractional `x`.
 *
 * On a half offset the bar's first cell is half-filled on its right, the last
 * is half-filled on its left, and everything between is solid - so the bar
 * keeps its length while sitting half a cell over.
 */
export function horizontalBar(x: number, y: number, width: number): SubcellSpan[] {
  if (width <= 0) return [];

  const base = Math.floor(x);
  const offset = offsetFor(x);
  const start = offset === 'next' ? base + 1 : base;

  if (offset === 'half') {
    const spans: SubcellSpan[] = [{ x: base, y, char: SUBCELL_CHARS.right, partial: true }];
    for (let i = 1; i < width; i++) {
      spans.push({ x: base + i, y, char: SUBCELL_CHARS.full, partial: false });
    }
    spans.push({ x: base + width, y, char: SUBCELL_CHARS.left, partial: true });
    return spans;
  }

  const spans: SubcellSpan[] = [];
  for (let i = 0; i < width; i++) {
    spans.push({ x: start + i, y, char: SUBCELL_CHARS.full, partial: false });
  }
  return spans;
}

/**
 * A vertical bar `height` cells tall whose top edge is at fractional `y`.
 * The mirror of horizontalBar, for objects that glide up and down.
 */
export function verticalBar(x: number, y: number, height: number): SubcellSpan[] {
  if (height <= 0) return [];

  const base = Math.floor(y);
  const offset = offsetFor(y);
  const start = offset === 'next' ? base + 1 : base;

  if (offset === 'half') {
    const spans: SubcellSpan[] = [{ x, y: base, char: SUBCELL_CHARS.bottom, partial: true }];
    for (let i = 1; i < height; i++) {
      spans.push({ x, y: base + i, char: SUBCELL_CHARS.full, partial: false });
    }
    spans.push({ x, y: base + height, char: SUBCELL_CHARS.top, partial: true });
    return spans;
  }

  const spans: SubcellSpan[] = [];
  for (let i = 0; i < height; i++) {
    spans.push({ x, y: start + i, char: SUBCELL_CHARS.full, partial: false });
  }
  return spans;
}

/**
 * A single cell object - a ball - at fractional coordinates.
 *
 * `axis` decides which coordinate gets the half step, because only one can:
 * pass the direction the object is mostly travelling and the smoothing shows
 * up where the eye is already following it.
 */
export function subcellPoint(
  x: number,
  y: number,
  axis: 'horizontal' | 'vertical'
): SubcellSpan[] {
  return axis === 'horizontal'
    ? horizontalBar(x, Math.round(y), 1)
    : verticalBar(Math.round(x), y, 1);
}

/**
 * Which axis to smooth, given a velocity. Ties go to horizontal: a cell is
 * twice as tall as it is wide, so a half step sideways is the finer move.
 */
export function dominantAxis(vx: number, vy: number): 'horizontal' | 'vertical' {
  return Math.abs(vy) > Math.abs(vx) ? 'vertical' : 'horizontal';
}
