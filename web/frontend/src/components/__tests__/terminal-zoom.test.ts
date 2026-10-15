/**
 * Unit tests for the viewer's zoom override
 * (packages/terminal/src/utils/terminal-zoom.ts) and for the fit it sits on
 * top of (components/mobile/terminal-fit.ts, the ONE fit function).
 *
 * "The zoom is great but it makes more sense if it follows the browser window
 * and i can override and scale it down" (sysop, 2026-09-03). So the DEFAULT
 * cell size is the fit - the largest at which the 80x25 grid plus its bezel
 * fits the viewport on both axes - and the gestures set a FRACTION of that
 * fit. A fraction, not a size, is what makes the choice survive a resize.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  FIT_TO_WINDOW,
  MAX_ZOOM_FRACTION,
  MIN_ZOOM_FRACTION,
  TERMINAL_BEZEL_PX,
  ZOOM_PRESETS,
  ZOOM_STORAGE_KEY,
  clampFraction,
  pinchZoom,
  pinchDistance,
  cornerAt,
  cursorForCorner,
  dragZoom,
  isBezelPoint,
  isFollowingWindow,
  isZoomWheel,
  nextPreset,
  readStoredZoom,
  wheelZoom,
  writeStoredZoom,
  zoomedFontSize,
} from '../../../../../packages/terminal/src/utils/terminal-zoom';
import { BBS_COLS, BBS_ROWS, fitFontSize } from '../../components/mobile/terminal-fit';

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

/** The desktop board's box on a 1280x800 window, once fitted. */
const BOX = { left: 100, top: 50, right: 1060, bottom: 682 };

/**
 * xterm's real measurement, modelled: each cell is rounded DOWN to a whole
 * device pixel, which is why the rendered grid is a staircase in font size
 * and why the fit is a search. Same model as
 * components/mobile/__tests__/terminal-fit.test.ts.
 */
const CHAR_ASPECT = 0.5;
const CHAR_HEIGHT_RATIO = 1.2;
function xtermMeasure(dpr: number) {
  return (fontSize: number) => {
    const cellWidth = Math.floor(fontSize * CHAR_ASPECT * dpr) / dpr;
    const cellHeight = Math.ceil(fontSize * CHAR_HEIGHT_RATIO * dpr) / dpr;
    return { width: cellWidth * BBS_COLS, height: cellHeight * BBS_ROWS };
  };
}

describe('fit-to-window is the default cell size', () => {
  it('a 1280x800 window fits the 80x25 screen at 25.4px, with height the constraining axis', () => {
    // The page minus exactly the bezel is what the fit gets.
    const available = {
      width: 1280 - 2 * TERMINAL_BEZEL_PX,
      height: 800 - 2 * TERMINAL_BEZEL_PX,
    };
    const measure = xtermMeasure(2);
    const fitted = fitFontSize(16, available, measure);
    const grid = measure(fitted);
    // The concrete number this window yields, pinned.
    expect(fitted).toBeCloseTo(25.4, 5);
    expect(grid.width).toBeLessThanOrEqual(available.width);
    expect(grid.height).toBeLessThanOrEqual(available.height);
    // One step more overflows - it really is the largest that fits.
    const bigger = measure(fitted + 0.05);
    expect(bigger.width > available.width || bigger.height > available.height).toBe(true);
  });

  it('at fit the box touches the viewport on the constraining axis', () => {
    const page = { width: 1280, height: 800 };
    const available = {
      width: page.width - 2 * TERMINAL_BEZEL_PX,
      height: page.height - 2 * TERMINAL_BEZEL_PX,
    };
    const measure = xtermMeasure(2);
    const grid = measure(fitFontSize(16, available, measure));
    // The leftover is split between the two sides of the bezel, so the box -
    // screen plus bezel - is exactly the page on the tighter axis.
    const slack = Math.min(available.width - grid.width, available.height - grid.height);
    const bezel = TERMINAL_BEZEL_PX + slack / 2;
    const boxWidth = grid.width + 2 * bezel;
    const boxHeight = grid.height + 2 * bezel;
    expect(Math.min(page.width - boxWidth, page.height - boxHeight)).toBeCloseTo(0, 6);
  });

  it('at fit the box touches the viewport on a portrait-ish window too, where WIDTH constrains', () => {
    // The 80x25 grid is landscape (about 4:3 in rendered pixels), so a tall
    // narrow window runs out of width first - the mirror image of the
    // 1280x800 case above, and the reason the flush rule is stated per axis.
    const page = { width: 900, height: 1200 };
    const available = {
      width: page.width - 2 * TERMINAL_BEZEL_PX,
      height: page.height - 2 * TERMINAL_BEZEL_PX,
    };
    const measure = xtermMeasure(2);
    const grid = measure(fitFontSize(16, available, measure));
    const slack = Math.min(available.width - grid.width, available.height - grid.height);
    const bezel = TERMINAL_BEZEL_PX + slack / 2;
    expect(page.width - (grid.width + 2 * bezel)).toBeCloseTo(0, 6);
    expect(page.height - (grid.height + 2 * bezel)).toBeGreaterThan(0);
  });

  it('follows the window: a smaller window fits a smaller cell, a larger one a larger cell', () => {
    const measure = xtermMeasure(2);
    const fitFor = (w: number, h: number) => fitFontSize(
      16,
      { width: w - 2 * TERMINAL_BEZEL_PX, height: h - 2 * TERMINAL_BEZEL_PX },
      measure,
    );
    expect(fitFor(800, 600)).toBeLessThan(fitFor(1280, 800));
    expect(fitFor(1920, 1080)).toBeGreaterThan(fitFor(1280, 800));
  });
});

describe('the override is a fraction of the fit, so it survives a resize', () => {
  it('is the fit itself, exactly, when the viewer is following the window', () => {
    expect(zoomedFontSize(25.4, FIT_TO_WINDOW)).toBe(25.4);
    expect(isFollowingWindow(FIT_TO_WINDOW)).toBe(true);
  });

  it('does not round to a whole pixel - rounding is what put the gap back', () => {
    expect(zoomedFontSize(19.35, 1)).toBe(19.35);
    expect(zoomedFontSize(20, 0.75)).toBe(15);
    expect(zoomedFontSize(19.4, 0.75)).toBeCloseTo(14.55, 6);
  });

  it('keeps the same fraction of a window that changed size', () => {
    const before = zoomedFontSize(20, 0.75);
    const after = zoomedFontSize(30, 0.75);
    expect(before / 20).toBeCloseTo(after / 30, 12);
    expect(after / before).toBeCloseTo(1.5, 12);
  });

  it('scales DOWN below the fit, which is what the sysop asked for', () => {
    expect(zoomedFontSize(20, 0.5)).toBeLessThan(20);
    expect(clampFraction(0.5)).toBe(0.5);
  });

  it('holds the range at both ends - the fit above, a quarter of it below', () => {
    expect(clampFraction(99)).toBe(MAX_ZOOM_FRACTION);
    expect(clampFraction(0.001)).toBe(MIN_ZOOM_FRACTION);
    expect(clampFraction(Number.NaN)).toBe(FIT_TO_WINDOW);
    expect(MAX_ZOOM_FRACTION).toBe(FIT_TO_WINDOW);
    expect(MIN_ZOOM_FRACTION).toBeLessThan(FIT_TO_WINDOW);
  });

  it('the screen can never be zoomed larger than the window', () => {
    // "i managed to accidentally resize the term so it's bigger than the
    // browser window and can't get it back" (sysop, 2026-09-03). Every input
    // path runs through clampFraction, so the ceiling is one constant and
    // there is no way round it: not the wheel, not a pinch, not a corner
    // drag, not the preset ladder, not a remembered value, and not the size
    // that finally reaches xterm.
    const fit = 25.4;
    expect(clampFraction(4)).toBe(FIT_TO_WINDOW);
    expect(wheelZoom(1, -100000)).toBe(FIT_TO_WINDOW);
    expect(wheelZoom(0.9, -100000)).toBe(FIT_TO_WINDOW);
    expect(dragZoom(1, BOX, { x: BOX.right, y: BOX.bottom }, { x: 5000, y: 5000 })).toBe(FIT_TO_WINDOW);
    expect(nextPreset(2)).toBeLessThanOrEqual(FIT_TO_WINDOW);
    expect(zoomedFontSize(fit, 4)).toBe(fit);
    // And the ceiling is the fit itself, not a little over it.
    expect(zoomedFontSize(fit, MAX_ZOOM_FRACTION)).toBe(fit);
  });
});

describe('pinch is a ctrl-wheel', () => {
  it('treats a bare ctrlKey wheel as a zoom gesture - that is how a trackpad pinch arrives', () => {
    expect(isZoomWheel({ ctrlKey: true, metaKey: false, deltaY: -12 })).toBe(true);
  });

  it('treats Cmd+wheel as a zoom gesture, the macOS habit', () => {
    expect(isZoomWheel({ ctrlKey: false, metaKey: true, deltaY: -12 })).toBe(true);
  });

  it('leaves a plain wheel alone, so ordinary scrolling is untouched', () => {
    expect(isZoomWheel({ ctrlKey: false, metaKey: false, deltaY: -12 })).toBe(false);
  });

  it('pinching together scales the screen down, pinching apart back up', () => {
    expect(wheelZoom(1, 100)).toBeLessThan(1);
    expect(wheelZoom(0.5, -100)).toBeGreaterThan(0.5);
  });

  it('moves in a smooth curve, not in jumps - a small pinch delta is a small change', () => {
    const small = wheelZoom(1, 4);
    expect(small).toBeLessThan(1);
    expect(small).toBeGreaterThan(0.98);
  });

  it('never leaves the range however hard the wheel is spun', () => {
    expect(wheelZoom(1, -100000)).toBe(MAX_ZOOM_FRACTION);
    expect(wheelZoom(1, 100000)).toBe(MIN_ZOOM_FRACTION);
  });
});

describe('a corner drag resizes about the centre', () => {
  const centre = { x: (BOX.left + BOX.right) / 2, y: (BOX.top + BOX.bottom) / 2 };
  const from = (p: { x: number; y: number }, factor: number) => ({
    x: centre.x + (p.x - centre.x) * factor,
    y: centre.y + (p.y - centre.y) * factor,
  });

  it('dragging a corner inward scales the screen down by the ratio of the distance from the centre', () => {
    const start = { x: BOX.right, y: BOX.bottom };
    expect(dragZoom(1, BOX, start, from(start, 0.5))).toBeCloseTo(0.5, 6);
  });

  it('dragging outward brings it back towards the fit', () => {
    const start = { x: BOX.left, y: BOX.top };
    expect(dragZoom(0.5, BOX, start, from(start, 2))).toBeCloseTo(1, 6);
  });

  it('is the same arithmetic whichever corner was grabbed - the box scales about its middle', () => {
    const corners = [
      { x: BOX.left, y: BOX.top },
      { x: BOX.right, y: BOX.top },
      { x: BOX.left, y: BOX.bottom },
      { x: BOX.right, y: BOX.bottom },
    ];
    for (const corner of corners) {
      expect(dragZoom(1, BOX, corner, from(corner, 0.75))).toBeCloseTo(0.75, 6);
    }
  });

  it('finds each corner within the hit tolerance and nothing in the middle', () => {
    expect(cornerAt({ x: BOX.left + 4, y: BOX.top + 4 }, BOX)).toBe('nw');
    expect(cornerAt({ x: BOX.right - 4, y: BOX.top + 4 }, BOX)).toBe('ne');
    expect(cornerAt({ x: BOX.left + 4, y: BOX.bottom - 4 }, BOX)).toBe('sw');
    expect(cornerAt({ x: BOX.right - 4, y: BOX.bottom - 4 }, BOX)).toBe('se');
    expect(cornerAt({ x: 500, y: 300 }, BOX)).toBeNull();
    expect(cornerAt({ x: 500, y: BOX.top }, BOX)).toBeNull();
  });

  it('gives each corner the diagonal cursor that points along its own diagonal', () => {
    expect(cursorForCorner('nw')).toBe('nwse-resize');
    expect(cursorForCorner('se')).toBe('nwse-resize');
    expect(cursorForCorner('ne')).toBe('nesw-resize');
    expect(cursorForCorner('sw')).toBe('nesw-resize');
  });

  it('dragging a corner outward past fit is a no-op', () => {
    // The screen is already on the fit - the largest the window can hold - so
    // pulling the corner further out has nothing to give. It must not creep
    // past the window edge and take the bezel ring (the way home) with it.
    const corner = { x: BOX.right, y: BOX.bottom };
    expect(dragZoom(1, BOX, corner, from(corner, 1.5))).toBe(FIT_TO_WINDOW);
    expect(dragZoom(1, BOX, corner, from(corner, 10))).toBe(FIT_TO_WINDOW);
    // From below the fit it still travels - up to the fit and no further.
    expect(dragZoom(0.5, BOX, corner, from(corner, 1.5))).toBeCloseTo(0.75, 6);
    expect(dragZoom(0.5, BOX, corner, from(corner, 10))).toBe(FIT_TO_WINDOW);
  });

  it('leaves the fraction alone when the grab carries no radius to scale', () => {
    expect(dragZoom(0.75, BOX, centre, { x: centre.x + 40, y: centre.y })).toBe(0.75);
  });
});

describe('double-clicking the bezel cycles the presets and comes home to the window', () => {
  it('walks fit -> three quarters -> half -> home to fit', () => {
    expect(nextPreset(1)).toBe(0.75);
    expect(nextPreset(0.75)).toBe(0.5);
    expect(nextPreset(0.5)).toBe(FIT_TO_WINDOW);
    expect(ZOOM_PRESETS[0]).toBe(FIT_TO_WINDOW);
  });

  it('steps from a wheel-zoomed value to the next preset below it, not home', () => {
    expect(nextPreset(0.9)).toBe(0.75);
    expect(nextPreset(0.6)).toBe(0.5);
  });

  it('cannot be walked upward past the fit - a stale over-fit value steps down, never up', () => {
    // 1.25 is no longer reachable, but a value from an older build might
    // still be handed in. The ladder must not treat it as a rung.
    expect(nextPreset(1.25)).toBeLessThanOrEqual(FIT_TO_WINDOW);
    expect(isFollowingWindow(FIT_TO_WINDOW)).toBe(true);
  });

  it('counts the padding ring as bezel and the screen inside it as not', () => {
    expect(isBezelPoint({ x: BOX.left + 8, y: 300 }, BOX, 16)).toBe(true);
    expect(isBezelPoint({ x: 500, y: BOX.top + 8 }, BOX, 16)).toBe(true);
    expect(isBezelPoint({ x: 500, y: 300 }, BOX, 16)).toBe(false);
    expect(isBezelPoint({ x: 5, y: 5 }, BOX, 16)).toBe(false);
  });
});

describe('a P session keeps its override', () => {
  it('remembers a fraction for this viewer and reads it back', () => {
    writeStoredZoom(0.75);
    expect(window.localStorage.getItem(ZOOM_STORAGE_KEY)).toBe('0.75');
    expect(readStoredZoom()).toBe(0.75);
  });

  it('has nothing to report when this browser has never overridden - that is following the window', () => {
    expect(readStoredZoom()).toBeNull();
  });

  it('ignores a hand-edited or too-small stored value rather than rendering the board in it', () => {
    window.localStorage.setItem(ZOOM_STORAGE_KEY, 'enormous');
    expect(readStoredZoom()).toBeNull();
    window.localStorage.setItem(ZOOM_STORAGE_KEY, '0');
    expect(readStoredZoom()).toBeNull();
  });

  it('a stored zoom above fit is ignored and reset on load', () => {
    // The board that stranded the sysop reloaded straight back into it,
    // because the over-fit fraction was still in storage. Reading it hands
    // back the fit AND repairs the stored value, so the next load - and any
    // other tab - starts clean too.
    window.localStorage.setItem(ZOOM_STORAGE_KEY, '1.25');
    expect(readStoredZoom()).toBe(FIT_TO_WINDOW);
    expect(window.localStorage.getItem(ZOOM_STORAGE_KEY)).toBe('1');
    expect(readStoredZoom()).toBe(FIT_TO_WINDOW);

    window.localStorage.setItem(ZOOM_STORAGE_KEY, '400');
    expect(readStoredZoom()).toBe(FIT_TO_WINDOW);
    expect(window.localStorage.getItem(ZOOM_STORAGE_KEY)).toBe('1');
  });

  it('survives storage being unavailable, in both directions', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    expect(readStoredZoom()).toBeNull();
    expect(() => writeStoredZoom(0.5)).not.toThrow();
    getItem.mockRestore();
    setItem.mockRestore();
  });
});

/**
 * A PINCH ZOOMS THE TERMINAL, NOT THE PAGE.
 *
 * The browser's own pinch scales everything, and the on-screen keyboard is
 * `position: fixed` - anchored to the LAYOUT viewport - so a pinch slides the
 * keys off the screen entirely ("zooming on phones zooms the keyboard away",
 * 2026-09-06). The terminal's zoom is a font size and touches nothing else, so
 * the gesture drives that instead and the keyboard cannot move.
 */
describe('pinch zoom', () => {
  it('is 1:1 with the fingers', () => {
    // Fingers half as far apart: half the screen.
    expect(pinchZoom(FIT_TO_WINDOW, 0.5)).toBeCloseTo(0.5, 5);
    // A quarter of the way apart, from an already reduced screen.
    expect(pinchZoom(0.8, 0.5)).toBeCloseTo(0.4, 5);
  });

  it('spreads back towards the fit and stops there', () => {
    expect(pinchZoom(0.5, 4)).toBe(MAX_ZOOM_FRACTION);
    expect(pinchZoom(FIT_TO_WINDOW, 2)).toBe(FIT_TO_WINDOW);
  });

  it('never shrinks past the floor', () => {
    expect(pinchZoom(FIT_TO_WINDOW, 0.001)).toBe(MIN_ZOOM_FRACTION);
  });

  it('survives a nonsense ratio without moving the screen', () => {
    expect(pinchZoom(0.75, 0)).toBeCloseTo(0.75, 5);
    expect(pinchZoom(0.75, -1)).toBeCloseTo(0.75, 5);
    expect(pinchZoom(0.75, Number.NaN)).toBeCloseTo(0.75, 5);
  });

  it('measures the distance between two fingers', () => {
    expect(pinchDistance({ clientX: 0, clientY: 0 }, { clientX: 3, clientY: 4 })).toBe(5);
    expect(pinchDistance({ clientX: 10, clientY: 10 }, { clientX: 10, clientY: 10 })).toBe(0);
  });
});
