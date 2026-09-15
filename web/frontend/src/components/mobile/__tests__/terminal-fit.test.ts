/**
 * Regression tests for the mobile terminal fit.
 *
 * Symptom they lock down: on a phone the 80-column grid stopped well short of
 * the screen edge (measured ~89% of an iPhone's width) because the sizing did
 * one proportional correction and accepted whatever it landed on.
 *
 * The measurer below reproduces xterm's real geometry — CanvasRenderer floors
 * each cell to a whole DEVICE pixel — which is exactly what makes a single
 * correction (and a naive repeated one) miss.
 */

import { describe, it, expect } from 'vitest';
import {
  fitFontSize,
  visibleHeight,
  visibleTop,
  handheldHeight,
  visibleWidth,
  keptFontSize,
  gridSizeFor,
  BBS_COLS,
  BBS_ROWS,
  DEFAULT_FIT_LIMITS,
  type Size,
} from '../terminal-fit';

/** mOsOul and the Topaz faces are half-width bitmap fonts. */
const CHAR_ASPECT = 0.5;
const CHAR_HEIGHT_RATIO = 1.2;

/**
 * Stand-in for xterm + CanvasAddon:
 *   device char width  = floor(cssCharWidth  * dpr)
 *   device char height = ceil (cssCharHeight * dpr)
 *   .xterm-screen size = round(deviceCell * count / dpr)
 */
function xtermMeasure(dpr: number): (fontSize: number) => Size {
  return (fontSize: number) => {
    const deviceCellWidth = Math.floor(fontSize * CHAR_ASPECT * dpr);
    const deviceCellHeight = Math.ceil(fontSize * CHAR_HEIGHT_RATIO * dpr);
    return {
      width: Math.round((deviceCellWidth * BBS_COLS) / dpr),
      height: Math.round((deviceCellHeight * BBS_ROWS) / dpr),
    };
  };
}

function counted(measure: (fontSize: number) => Size): { measure: (f: number) => Size; calls: () => number } {
  let calls = 0;
  return {
    measure: (fontSize: number) => { calls++; return measure(fontSize); },
    calls: () => calls,
  };
}

describe('fitFontSize', () => {
  it('fills at least 95% of an iPhone portrait width with 80 columns', () => {
    const available = { width: 390, height: 600 };
    const measure = xtermMeasure(3);

    const fontSize = fitFontSize(6, available, measure);
    const grid = measure(fontSize);

    expect(grid.width).toBeLessThanOrEqual(available.width);
    expect(grid.width / available.width).toBeGreaterThanOrEqual(0.95);
  });

  it('picks the largest font size that still fits — one step more overflows', () => {
    const available = { width: 390, height: 600 };
    const measure = xtermMeasure(3);

    const fontSize = fitFontSize(6, available, measure);
    const bigger = measure(fontSize + DEFAULT_FIT_LIMITS.step * 2);

    expect(bigger.width).toBeGreaterThan(available.width);
  });

  it('converges from a far-too-small seed and a far-too-large seed alike', () => {
    const available = { width: 390, height: 600 };
    const measure = xtermMeasure(3);

    expect(fitFontSize(4, available, measure)).toBe(fitFontSize(40, available, measure));
  });

  it('shrinks until the grid fits when the seed overflows', () => {
    const available = { width: 320, height: 480 };
    const measure = xtermMeasure(2);

    const grid = measure(fitFontSize(32, available, measure));

    expect(grid.width).toBeLessThanOrEqual(available.width);
    expect(grid.height).toBeLessThanOrEqual(available.height);
  });

  it('lets height win on a landscape phone instead of overflowing the screen', () => {
    // Width alone would ask for ~21px, whose 25 rows are far taller than 390.
    const available = { width: 844, height: 390 };
    const measure = xtermMeasure(3);

    const grid = measure(fitFontSize(16, available, measure));

    expect(grid.height).toBeLessThanOrEqual(available.height);
    expect(grid.width).toBeLessThanOrEqual(available.width);
  });

  it('terminates within the probe budget', () => {
    const { measure, calls } = counted(xtermMeasure(3));

    fitFontSize(6, { width: 390, height: 600 }, measure);

    // Every probe plus the final re-apply of the winner.
    expect(calls()).toBeLessThanOrEqual(DEFAULT_FIT_LIMITS.maxProbes + 1);
  });

  it('leaves the terminal rendering at the size it returns', () => {
    const applied: number[] = [];
    const model = xtermMeasure(3);

    const fontSize = fitFontSize(6, { width: 390, height: 600 }, (candidate) => {
      applied.push(candidate);
      return model(candidate);
    });

    expect(applied[applied.length - 1]).toBe(fontSize);
  });

  it('keeps the seed when the terminal cannot be measured (not rendered yet)', () => {
    const fontSize = fitFontSize(11, { width: 390, height: 600 }, () => ({ width: 0, height: 0 }));

    expect(fontSize).toBe(11);
  });

  it('keeps the seed when the page has no size yet', () => {
    const fontSize = fitFontSize(11, { width: 0, height: 0 }, xtermMeasure(3));

    expect(fontSize).toBe(11);
  });
});

describe('the height the terminal may use', () => {
  // Reported with a screenshot 2026-08-25: on an iPhone the top rows sat
  // under Safari's floating address bar. The layout viewport runs behind
  // that bar; the visual viewport is what is genuinely on screen.
  it('uses the visible viewport when the browser chrome overlaps the page', () => {
    const view = { innerHeight: 844, innerWidth: 390, visualViewport: { height: 750, width: 390 } };

    expect(visibleHeight(view)).toBe(750);
  });

  it('shrinks further when the keyboard is up', () => {
    const view = { innerHeight: 844, innerWidth: 390, visualViewport: { height: 420, width: 390 } };

    expect(visibleHeight(view)).toBe(420);
  });

  /**
   * A browser that OVERLAYS its chrome pushes the visible band down instead of
   * shrinking it. Content drawn from the top of the layout viewport then sits
   * underneath the bar - which is why one Android tester lost the top of the
   * screen on 2026-09-06 while others, on different browsers, did not.
   */
  it('reports where the visible band starts when the browser overlays its chrome', () => {
    const view = {
      innerHeight: 844,
      innerWidth: 390,
      visualViewport: { height: 750, width: 390, offsetTop: 94 },
    };

    expect(visibleTop(view)).toBe(94);
  });

  it('is zero on a browser that insets its chrome, so those phones do not move', () => {
    const inset = {
      innerHeight: 844, innerWidth: 390,
      visualViewport: { height: 750, width: 390, offsetTop: 0 },
    };
    const unsupported = { innerHeight: 844, innerWidth: 390, visualViewport: null };
    const missing = {
      innerHeight: 844, innerWidth: 390,
      visualViewport: { height: 750, width: 390 },
    };

    expect(visibleTop(inset)).toBe(0);
    expect(visibleTop(unsupported)).toBe(0);
    expect(visibleTop(missing)).toBe(0);
  });

  it('never takes away more than the screen', () => {
    const nonsense = {
      innerHeight: 844, innerWidth: 390,
      visualViewport: { height: 750, width: 390, offsetTop: 5000 },
    };
    const negative = {
      innerHeight: 844, innerWidth: 390,
      visualViewport: { height: 750, width: 390, offsetTop: -20 },
    };

    expect(visibleTop(nonsense)).toBe(844);
    expect(visibleTop(negative)).toBe(0);
  });

  it('falls back to the layout viewport where visualViewport is unsupported', () => {
    const view = { innerHeight: 844, innerWidth: 390, visualViewport: null };

    expect(visibleHeight(view)).toBe(844);
  });

  it('never hands back more space than the page has', () => {
    // Mid-pinch-zoom the visual viewport can report taller than the layout.
    const view = { innerHeight: 844, innerWidth: 390, visualViewport: { height: 1200, width: 390 } };

    expect(visibleHeight(view)).toBe(844);
  });

  it('ignores a nonsense report rather than sizing to zero', () => {
    const view = { innerHeight: 844, innerWidth: 390, visualViewport: { height: 0, width: 0 } };

    expect(visibleHeight(view)).toBe(844);
    expect(visibleWidth(view)).toBe(390);
  });
});

/**
 * What the terminal KEEPS after the fit, and why a phone keeps something else.
 *
 * The seam snap floors the cell to a whole CSS pixel so glyphs that meet edge
 * to edge have no gap between them - an artist's report, and worth a pixel per
 * column on a desktop cell of twelve or fifteen.
 *
 * On a 390px phone the cell is 4.47px and the floor makes it 4: eighty columns
 * lose 38px, a tenth of the screen, as a black margin down each side. "it
 * doesnt zoom to the full width of my phone screen anymore" (sysop,
 * 2026-09-14). The trade goes the other way there.
 */
describe('the size the terminal keeps', () => {
  /** The real snap: floor the cell (size x 0.5 for every Amiga face). */
  const snap = (size: number) => Math.floor(size * 0.5) / 0.5;

  it('snaps to a whole cell on a desktop', () => {
    // 15.8px -> a 7.9px cell -> 7 -> 14px. The art is what matters there.
    expect(keptFontSize(15.8, 'mosoul', false, snap)).toBe(14);
  });

  it('keeps every fraction on a handheld', () => {
    // The 390px phone: 8.95px is what the fit found, and 8 is what the snap
    // would have made of it - 38px of screen.
    expect(keptFontSize(8.95, 'mosoul', true, snap)).toBe(8.95);
    expect(snap(8.95)).toBe(8);
  });

  it('does not invent a size either way', () => {
    // A size that is already whole-celled is untouched by both.
    expect(keptFontSize(14, 'mosoul', false, snap)).toBe(14);
    expect(keptFontSize(14, 'mosoul', true, snap)).toBe(14);
  });
});

/**
 * How big the grid is at a given font size, and where the numbers come from.
 *
 * The fit used to set `term.options.fontSize` and read `.xterm-screen`'s box
 * straight back, once per probe. xterm's DOM renderer relays asynchronously,
 * so that read answered for the PREVIOUS candidate and the search settled
 * somewhere different every run: the same 390px phone got a 358px grid, then
 * 338, then 298, reported three times as "not full width on mobile".
 *
 * A cell is linear in the font size. One settled measurement gives its ratios;
 * every candidate after that is arithmetic.
 */
describe('the size of the grid at a font size', () => {
  /** The Amiga faces: half an em wide, and a row exactly the font size tall. */
  const AMIGA = { width: 0.5, height: 1 };

  it('is the cell times the columns, exactly', () => {
    // 80 columns at 9.75px is 390 - the whole width of the phone that
    // reported this, which is the answer the fit must land on.
    expect(gridSizeFor(9.75, 80, 25, AMIGA).width).toBe(390);
  });

  it('keeps the column fractional and ROUNDS the row, as the board measures', () => {
    // Live: 8.45 gave 80 columns of 4.225 and 25 rows of 8 - the row rounded,
    // not ceiled, and the column not snapped to anything.
    const grid = gridSizeFor(8.45, 80, 25, AMIGA);
    expect(grid.width).toBeCloseTo(80 * 4.225, 5);
    expect(grid.height).toBe(25 * 8);
  });

  it('takes the ratios it is given, because a face without a line-height is taller', () => {
    // ~1.2 is what a face with no explicit line-height measures at.
    const loose = gridSizeFor(20, 80, 25, { width: 0.5, height: 1.2 });
    expect(loose.height).toBe(25 * 24);
  });

  it('drives the fit to the exact size that fills a phone', () => {
    // The whole point: feed the search arithmetic and it lands on 9.75 for a
    // 390x584 band, every time, with no terminal attached at all.
    const fitted = fitFontSize(
      8,
      { width: 390, height: 584 },
      (size) => gridSizeFor(size, 80, 25, AMIGA),
    );
    expect(fitted).toBe(9.75);
    expect(gridSizeFor(fitted, 80, 25, AMIGA).width).toBe(390);
  });
});

/**
 * The rounding, which is the only part of the model that is not obvious - and
 * it was read off the live board rather than assumed.
 */
describe('the rounding the model uses', () => {
  const AMIGA = { width: 0.5, height: 1 };

  it('ROUNDS the row, which is what the board measures', () => {
    // 8.45 gave 25 rows of 8 and 9.75 gave 25 rows of 10. Ceiling would have
    // made the first one 9, flooring would have made the second one 9.
    expect(gridSizeFor(8.45, 80, 25, AMIGA).height).toBe(200);
    expect(gridSizeFor(9.75, 80, 25, AMIGA).height).toBe(250);
  });

  it('leaves the column alone, fraction and all', () => {
    // 80 columns of 4.875 is 390 - measured on a phone with three device
    // pixels per CSS pixel, so xterm is not snapping columns to those either.
    expect(gridSizeFor(9.75, 80, 25, AMIGA).width).toBe(390);
  });
});

/**
 * The Android that lost the top of its screen.
 *
 * Reported in the 2026-09-06 beta: one user lost the top rows while others on
 * the same game did not, and they were on different BROWSERS. The height maths
 * used to live inline in TerminalPage, so the only way to check it was a
 * phone. It is a function now, and these are the two browsers side by side.
 */
describe('the height a handheld can draw into', () => {
  const OVERLAY = {
    innerHeight: 844,
    visualViewport: { height: 750, width: 390, offsetTop: 94 },
  };
  const INSET = {
    innerHeight: 844,
    visualViewport: { height: 750, width: 390, offsetTop: 0 },
  };

  it('gives up the band an OVERLAYING browser draws its chrome over', () => {
    // 750 visible, of which the top 94 is under the bar.
    expect(handheldHeight(OVERLAY)).toBe(656);
  });

  it('gives up nothing extra on a browser that INSETS its chrome', () => {
    // The visual viewport already shrank; subtracting again would waste 94px
    // on every browser that was never broken.
    expect(handheldHeight(INSET)).toBe(750);
  });

  it('subtracts the on-screen input on top of both', () => {
    expect(handheldHeight(OVERLAY, 260)).toBe(396);
    expect(handheldHeight(INSET, 260)).toBe(490);
  });

  it('never returns a negative height, however tall the keyboard', () => {
    // A grid of negative height would be divided by in the fit.
    expect(handheldHeight(OVERLAY, 5000)).toBe(0);
    expect(handheldHeight(INSET, 99999)).toBe(0);
  });

  it('is the plain visible height where there is no visualViewport at all', () => {
    expect(handheldHeight({ innerHeight: 844 })).toBe(844);
  });
});
