/**
 * Terminal fit — pick the largest font size whose 80x25 grid still fits the
 * space the page can give it.
 *
 * Why a search and not a formula: xterm rounds each cell down to a whole
 * DEVICE pixel (CanvasRenderer._updateDimensions), so the rendered grid width
 * is a staircase in font size, not a straight line. A single proportional
 * correction — the previous approach — lands wherever the first guess happens
 * to fall (89% of a 390px iPhone width, per __tests__/terminal-fit.test.ts,
 * which models xterm's real rounding) and a repeated proportional correction
 * oscillates across the staircase steps forever. Bracketing the answer and
 * bisecting converges on the true maximum in a handful of probes.
 *
 * The measurement itself is xterm's: `.xterm-screen` is exactly
 * cols * cellWidth by rows * cellHeight, so nothing here guesses a font
 * aspect ratio.
 */

/** AmiExpress renders 80x25; both dimensions are part of the fit. */
export const BBS_COLS = 80;
export const BBS_ROWS = 25;

export interface Size {
  width: number;
  height: number;
}

export interface FitLimits {
  /** Never go below this font size (px). */
  min: number;
  /** Never go above this font size (px). */
  max: number;
  /** Font-size grid; the search stops once the bracket is this narrow. */
  step: number;
  /** Hard cap on probes so a pathological measurer cannot spin. */
  maxProbes: number;
}

export const DEFAULT_FIT_LIMITS: FitLimits = {
  min: 4,
  max: 48,
  step: 0.05,
  maxProbes: 24,
};

/** Applies a font size and reports the rendered grid size. */
export type Measure = (fontSize: number) => Size;

function clamp(value: number, limits: FitLimits): number {
  return Math.min(limits.max, Math.max(limits.min, value));
}

function quantize(value: number, step: number): number {
  // Round-trip through an integer count of steps so 9.75 stays 9.75 rather
  // than 9.750000000000002 — the search compares sizes for equality.
  return Math.round(value / step) * step;
}

/**
 * Largest font size that keeps the whole 80x25 grid inside `available`.
 *
 * `measure` is called once per probe and once more with the winner, so the
 * terminal is left rendering at the size this function returns.
 *
 * Returns `seed` unchanged when the terminal cannot be measured (width or
 * height 0 — not attached, not rendered yet, or running under jsdom).
 */
export function fitFontSize(
  seed: number,
  available: Size,
  measure: Measure,
  limits: FitLimits = DEFAULT_FIT_LIMITS,
): number {
  if (!(available.width > 0) || !(available.height > 0)) return seed;

  let current = clamp(quantize(seed, limits.step), limits);
  /** Largest size known to fit; 0 until something does. */
  let largestFitting = 0;
  /** Smallest size known to overflow. */
  let smallestOverflowing = Infinity;

  for (let probe = 0; probe < limits.maxProbes; probe++) {
    const rendered = measure(current);
    if (!(rendered.width > 0) || !(rendered.height > 0)) {
      // Unmeasurable: keep whatever we already proved good, else the seed.
      return largestFitting > 0 ? largestFitting : seed;
    }

    const fits = rendered.width <= available.width && rendered.height <= available.height;
    if (fits) {
      largestFitting = Math.max(largestFitting, current);
    } else {
      smallestOverflowing = Math.min(smallestOverflowing, current);
    }

    // The grid scales with the font size, so this is a good first jump; it is
    // only ever used to BRACKET the answer, never to accept one.
    const scale = Math.min(
      available.width / rendered.width,
      available.height / rendered.height,
    );

    let next: number;
    if (smallestOverflowing === Infinity) {
      // Everything fits so far — reach up for the first overflow.
      next = clamp(quantize(current * scale, limits.step), limits);
      if (next <= current) next = clamp(quantize(current + limits.step, limits.step), limits);
    } else if (largestFitting === 0) {
      // Nothing fits yet — reach down for the first fit.
      next = clamp(quantize(current * scale, limits.step), limits);
      if (next >= current) next = clamp(quantize(current - limits.step, limits.step), limits);
    } else {
      // Bracketed: bisect until the bracket is one step wide.
      if (smallestOverflowing - largestFitting <= limits.step) break;
      next = quantize((largestFitting + smallestOverflowing) / 2, limits.step);
      if (next <= largestFitting || next >= smallestOverflowing) break;
    }

    if (next === current) break;
    current = next;
  }

  const winner = largestFitting > 0 ? largestFitting : limits.min;
  measure(winner);
  return winner;
}

/** What a viewport reports about the space actually on screen. */
export interface ViewportLike {
  innerHeight: number;
  innerWidth: number;
  visualViewport?: { height: number; width: number } | null;
}

/**
 * The height the terminal may actually use.
 *
 * NOT window.innerHeight on a phone: that is the LAYOUT viewport, which on
 * iOS includes the strip beneath Safari's floating address bar, so sizing
 * against it puts the top rows underneath the bar where they cannot be read
 * (reported with a screenshot, 2026-08-25). The VISUAL viewport is what is
 * genuinely visible, and it shrinks as browser chrome and the keyboard
 * appear.
 *
 * Falls back to innerHeight where visualViewport is unsupported, and ignores
 * a visual viewport that is taller than the layout one (which only happens
 * mid-pinch-zoom, and would hand back space that is not there).
 */
export function visibleHeight(view: ViewportLike): number {
  const visual = view.visualViewport?.height;
  if (typeof visual !== 'number' || !Number.isFinite(visual) || visual <= 0) {
    return view.innerHeight;
  }
  return Math.min(visual, view.innerHeight);
}

/** The same reasoning horizontally. */
export function visibleWidth(view: ViewportLike): number {
  const visual = view.visualViewport?.width;
  if (typeof visual !== 'number' || !Number.isFinite(visual) || visual <= 0) {
    return view.innerWidth;
  }
  return Math.min(visual, view.innerWidth);
}
