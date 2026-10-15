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

/**
 * The same search for a teletext session's 40x25 grid.
 *
 * Half the columns of the board's 80, so the cell that fills the same window
 * is close to twice as wide - and the 48px ceiling, which is generous for
 * eighty columns, would stop the fit short of the window for forty. Nothing
 * else about the search changes.
 */
export const TELETEXT_FIT_LIMITS: FitLimits = {
  ...DEFAULT_FIT_LIMITS,
  max: 96,
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
  visualViewport?: { height: number; width: number; offsetTop?: number } | null;
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

/**
 * How far down the screen the visible area STARTS.
 *
 * Two browsers can show the same page differently and both be right. One
 * INSETS its chrome - the visual viewport shrinks, offsetTop stays 0, and
 * content laid out from the top is fully visible. The other OVERLAYS it - the
 * visual viewport is pushed down instead, offsetTop is positive, and anything
 * drawn at the top of the layout viewport sits underneath the browser's own
 * bar where nobody can read it.
 *
 * That is why a beta on 2026-09-06 had one Android user losing the top of the
 * screen while others, on different browsers, did not. Sizing to the visible
 * HEIGHT was already right; nothing accounted for where that visible band
 * begins.
 *
 * Zero on every browser that insets, so honouring it cannot move the phones
 * that already work.
 */
export function visibleTop(view: ViewportLike): number {
  const offset = view.visualViewport?.offsetTop;
  if (typeof offset !== 'number' || !Number.isFinite(offset) || offset <= 0) return 0;
  // Never claim more than the viewport itself: a nonsense offset would
  // otherwise take the whole screen away.
  return Math.min(offset, view.innerHeight);
}

/** The same reasoning horizontally. */
/**
 * The height a handheld can actually draw into.
 *
 * Three subtractions, and the middle one is the Android bug from the
 * 2026-09-06 beta: one user lost the top of the screen while others on the
 * same phone model did not, because they were on different BROWSERS. A
 * browser that INSETS its chrome shrinks the visual viewport and leaves
 * `offsetTop` at 0; one that OVERLAYS it pushes the visible band DOWN
 * instead. Sizing to `visibleHeight` alone is correct for the first and
 * draws the top rows underneath the bar on the second.
 *
 * Extracted from TerminalPage so the case can be proved against a fake
 * viewport rather than against a phone - which matters, because the phone
 * that showed it is not always to hand.
 *
 * Never negative: a keyboard taller than the viewport would otherwise ask
 * for a grid of negative height, and the fit would divide by it.
 */
export function handheldHeight(view: ViewportLike, onscreenInputHeight = 0): number {
  return Math.max(0, visibleHeight(view) - visibleTop(view) - onscreenInputHeight);
}

export function visibleWidth(view: ViewportLike): number {
  const visual = view.visualViewport?.width;
  if (typeof visual !== 'number' || !Number.isFinite(visual) || visual <= 0) {
    return view.innerWidth;
  }
  return Math.min(visual, view.innerWidth);
}

/**
 * The size the terminal KEEPS, once the fit has found the largest that fits.
 *
 * One rule, in one place, because it is a trade and not a calculation:
 *
 * `seamlessSize` floors the cell to a whole CSS pixel so that glyphs which
 * meet edge to edge - a mosaic, an underscore, any Amiga ASCII stroke - have
 * no one-pixel gap between them. It costs up to a pixel per column. On a
 * desktop that is a bezel's worth of a 12- or 15-pixel cell and the art is
 * what matters ("det ar liksom inte tillrackligt med plats, dom overlappar",
 * an artist via the sysop, 2026-09-14).
 *
 * On a 390px phone the cell is 4.47px, the floor makes it 4, and eighty
 * columns lose 38px - a tenth of the screen, as a black margin down each side.
 * The sysop, the same day: "it doesnt zoom to the full width of my phone
 * screen anymore". A third of a device pixel of seam is not worth a tenth of a
 * phone, so a handheld keeps the fitted size.
 */
export function keptFontSize(
  zoomed: number,
  family: string,
  handheld: boolean,
  snap: (size: number, font: string) => number,
): number {
  return handheld ? zoomed : snap(zoomed, family);
}

/**
 * How big the grid IS at a given font size. Computed, never measured.
 *
 * THE MEASUREMENT WAS THE BUG. The fit used to set `term.options.fontSize` and
 * read `.xterm-screen`'s box straight back, once per probe. xterm's DOM
 * renderer relays its rows asynchronously, so the read answered for the
 * PREVIOUS candidate and the search settled somewhere different every run: the
 * same 390px phone got a 358px grid, then 338, then 298 - reported three times
 * as "not full width on mobile". Measuring once at mount is no better: nothing
 * has been laid out yet, and the ratios come back as nonsense.
 *
 * There is nothing to measure. A cell is the font size times two constants the
 * caller already knows, and the only subtlety is the rounding, which was read
 * off the live board at two sizes:
 *
 *     font-size 8.45 -> a 200px-tall screen, 25 rows of 8   (round, not ceil)
 *     font-size 9.75 -> a 250px-tall screen, 25 rows of 10
 *     font-size 9.75 -> a 390px-wide screen, 80 columns of 4.875
 *
 * So the ROW is rounded to a whole pixel and the COLUMN keeps its fraction -
 * on a device with three physical pixels per CSS pixel, which is also how we
 * know xterm is not snapping columns to device pixels. A model that floored
 * the column would throw away a pixel a column, and there are eighty of them.
 */
export interface CellRatios {
  /** Cell width per point of font size. Half an em for every Amiga face. */
  width: number;
  /**
   * Row height per point of font size: the terminal's `lineHeight` option when
   * it has one (the board sets 1.0 for every Amiga face, which are designed to
   * meet across rows), and xterm's own ~1.2 for a face without one.
   */
  height: number;
}

export function gridSizeFor(
  fontSize: number,
  cols: number,
  rows: number,
  ratios: CellRatios,
): Size {
  return {
    width: cols * fontSize * ratios.width,
    height: rows * Math.round(fontSize * ratios.height),
  };
}

/** xterm's cell height for a face that does not ask for a line-height. */
export const DEFAULT_LINE_HEIGHT_RATIO = 1.2;
