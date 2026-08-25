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
import { fitFontSize, BBS_COLS, BBS_ROWS, DEFAULT_FIT_LIMITS, type Size } from '../terminal-fit';

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
