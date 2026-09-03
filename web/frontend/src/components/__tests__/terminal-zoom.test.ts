/**
 * Unit tests for the one owner of the terminal's cell size
 * (packages/terminal/src/utils/terminal-zoom.ts).
 *
 * The sysop asked for a real zoom on the fixed 80x25 screen: the cell size
 * itself, never a CSS transform, with the grid staying 80x25 (40x25 on the
 * PETSCII canvas) and the bezelled box growing about its centre. The one
 * rule these tests exist to hold is that zoom is a FACTOR over the page's
 * base size, so the font picker and the zoom can never become two sources
 * of a cell size.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DEFAULT_ZOOM,
  MAX_ZOOM,
  MIN_ZOOM,
  ZOOM_PRESETS,
  ZOOM_STORAGE_KEY,
  BOX_MAX_WIDTH_PX,
  clampZoom,
  cornerAt,
  cursorForCorner,
  dragZoom,
  fitZoomToViewport,
  isBezelPoint,
  isZoomWheel,
  nextPreset,
  readStoredZoom,
  wheelZoom,
  writeStoredZoom,
  zoomedBoxMaxWidth,
  zoomedFontSize,
} from '../../../../../packages/terminal/src/utils/terminal-zoom';

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

/** The box the desktop board actually renders: 960 wide, centred at 0,0-ish. */
const BOX = { left: 100, top: 50, right: 1060, bottom: 682 };

describe('pinch is a ctrl-wheel', () => {
  it('treats a bare ctrlKey wheel as a zoom gesture - that is how a trackpad pinch arrives', () => {
    // No key is held during a pinch; the browser synthesises ctrlKey.
    expect(isZoomWheel({ ctrlKey: true, metaKey: false, deltaY: -12 })).toBe(true);
  });

  it('treats Cmd+wheel as a zoom gesture, the macOS habit', () => {
    expect(isZoomWheel({ ctrlKey: false, metaKey: true, deltaY: -12 })).toBe(true);
  });

  it('leaves a plain wheel alone, so ordinary scrolling is untouched', () => {
    expect(isZoomWheel({ ctrlKey: false, metaKey: false, deltaY: -12 })).toBe(false);
  });

  it('pinching apart zooms in and pinching together zooms out', () => {
    expect(wheelZoom(1, -100)).toBeGreaterThan(1);
    expect(wheelZoom(1, 100)).toBeLessThan(1);
  });

  it('moves in a smooth curve, not in jumps - a small pinch delta is a small change', () => {
    const small = wheelZoom(1, -4);
    expect(small).toBeGreaterThan(1);
    expect(small).toBeLessThan(1.02);
  });

  it('never leaves the sane range however hard the wheel is spun', () => {
    expect(wheelZoom(1, -100000)).toBe(MAX_ZOOM);
    expect(wheelZoom(1, 100000)).toBe(MIN_ZOOM);
  });
});

describe('a corner drag resizes about the centre', () => {
  it('dragging a corner outward enlarges by the ratio of the distance from the centre', () => {
    const centre = { x: (BOX.left + BOX.right) / 2, y: (BOX.top + BOX.bottom) / 2 };
    // Start on the SE corner, then move to twice that distance from the centre.
    const start = { x: BOX.right, y: BOX.bottom };
    const twiceOut = {
      x: centre.x + (start.x - centre.x) * 2,
      y: centre.y + (start.y - centre.y) * 2,
    };
    expect(dragZoom(1, BOX, start, twiceOut)).toBeCloseTo(2, 6);
  });

  it('dragging inward shrinks by the same ratio', () => {
    const centre = { x: (BOX.left + BOX.right) / 2, y: (BOX.top + BOX.bottom) / 2 };
    const start = { x: BOX.left, y: BOX.top };
    const halfIn = {
      x: centre.x + (start.x - centre.x) / 2,
      y: centre.y + (start.y - centre.y) / 2,
    };
    expect(dragZoom(2, BOX, start, halfIn)).toBeCloseTo(1, 6);
  });

  it('is the same arithmetic whichever corner was grabbed - the box grows about its middle', () => {
    const centre = { x: (BOX.left + BOX.right) / 2, y: (BOX.top + BOX.bottom) / 2 };
    const outward = (p: { x: number; y: number }) => ({
      x: centre.x + (p.x - centre.x) * 1.5,
      y: centre.y + (p.y - centre.y) * 1.5,
    });
    const corners = [
      { x: BOX.left, y: BOX.top },
      { x: BOX.right, y: BOX.top },
      { x: BOX.left, y: BOX.bottom },
      { x: BOX.right, y: BOX.bottom },
    ];
    for (const corner of corners) {
      expect(dragZoom(1, BOX, corner, outward(corner))).toBeCloseTo(1.5, 6);
    }
  });

  it('finds each corner within the hit tolerance and nothing in the middle', () => {
    expect(cornerAt({ x: BOX.left + 4, y: BOX.top + 4 }, BOX)).toBe('nw');
    expect(cornerAt({ x: BOX.right - 4, y: BOX.top + 4 }, BOX)).toBe('ne');
    expect(cornerAt({ x: BOX.left + 4, y: BOX.bottom - 4 }, BOX)).toBe('sw');
    expect(cornerAt({ x: BOX.right - 4, y: BOX.bottom - 4 }, BOX)).toBe('se');
    expect(cornerAt({ x: 500, y: 300 }, BOX)).toBeNull();
    // An edge is not a corner.
    expect(cornerAt({ x: 500, y: BOX.top }, BOX)).toBeNull();
  });

  it('gives each corner the diagonal cursor that points along its own diagonal', () => {
    expect(cursorForCorner('nw')).toBe('nwse-resize');
    expect(cursorForCorner('se')).toBe('nwse-resize');
    expect(cursorForCorner('ne')).toBe('nesw-resize');
    expect(cursorForCorner('sw')).toBe('nesw-resize');
  });

  it('leaves the zoom alone when the grab carries no radius to scale', () => {
    const centre = { x: (BOX.left + BOX.right) / 2, y: (BOX.top + BOX.bottom) / 2 };
    expect(dragZoom(1.25, BOX, centre, { x: centre.x + 40, y: centre.y })).toBe(1.25);
  });
});

describe('double-clicking the bezel cycles the presets', () => {
  it('walks 1x -> 1.5x -> 2x and back to the picker size', () => {
    expect(nextPreset(1)).toBe(1.5);
    expect(nextPreset(1.5)).toBe(2);
    expect(nextPreset(2)).toBe(1);
    expect(ZOOM_PRESETS[0]).toBe(DEFAULT_ZOOM);
  });

  it('advances from a wheel-zoomed value to the next preset above it, not home', () => {
    expect(nextPreset(1.2)).toBe(1.5);
    expect(nextPreset(1.9)).toBe(2);
    expect(nextPreset(3)).toBe(1);
  });

  it('counts the padding ring as bezel and the screen inside it as not', () => {
    // 16px bezel: 8px in from the edge is the ring, the middle is the screen.
    expect(isBezelPoint({ x: BOX.left + 8, y: 300 }, BOX, 16)).toBe(true);
    expect(isBezelPoint({ x: 500, y: BOX.top + 8 }, BOX, 16)).toBe(true);
    expect(isBezelPoint({ x: 500, y: 300 }, BOX, 16)).toBe(false);
    expect(isBezelPoint({ x: 5, y: 5 }, BOX, 16)).toBe(false);
  });
});

describe('zoom is clamped to the viewport', () => {
  it('shrinks a zoom whose box no longer fits, by the measured overflow ratio', () => {
    // 2x asked for a 1920-wide box; the window is 1280.
    const fitted = fitZoomToViewport(
      2,
      { width: 1920, height: 1264 },
      { width: 1280, height: 2000 },
    );
    expect(fitted).toBeCloseTo(2 * (1280 / 1920), 6);
  });

  it('clamps on height as well as width', () => {
    const fitted = fitZoomToViewport(2, { width: 800, height: 1200 }, { width: 4000, height: 600 });
    expect(fitted).toBeCloseTo(1, 6);
  });

  it('leaves a zoom that fits exactly where it is', () => {
    expect(fitZoomToViewport(1.5, { width: 900, height: 600 }, { width: 1600, height: 900 })).toBe(1.5);
  });

  it('never clamps below the picker size - a viewport too small for the default look is not zoom to fix', () => {
    expect(fitZoomToViewport(1, { width: 900, height: 600 }, { width: 320, height: 200 })).toBe(1);
    expect(fitZoomToViewport(2, { width: 1920, height: 1264 }, { width: 100, height: 100 })).toBe(1);
  });

  it('leaves the zoom alone when nothing can be measured (jsdom, an unlaid-out box)', () => {
    expect(fitZoomToViewport(2, { width: 0, height: 0 }, { width: 1280, height: 800 })).toBe(2);
    expect(fitZoomToViewport(2, { width: 900, height: 600 }, { width: 0, height: 0 })).toBe(2);
  });

  it('holds the hard range at both ends', () => {
    expect(clampZoom(99)).toBe(MAX_ZOOM);
    expect(clampZoom(0.01)).toBe(MIN_ZOOM);
    expect(clampZoom(Number.NaN)).toBe(DEFAULT_ZOOM);
  });
});

describe('the picker and the zoom share one size', () => {
  it('is the picker size exactly at 1x - the default board is untouched', () => {
    expect(zoomedFontSize(16, 1)).toBe(16);
    expect(zoomedBoxMaxWidth(1)).toBe(`${BOX_MAX_WIDTH_PX}px`);
    expect(zoomedBoxMaxWidth(1)).toBe('960px');
  });

  it('scales whatever base size the page hands it, so a calibrated handheld size zooms too', () => {
    expect(zoomedFontSize(11, 2)).toBe(22);
    expect(zoomedFontSize(9, 1.5)).toBe(14); // round(13.5)
  });

  it('moves in whole-pixel steps, because the board fonts are TTF and 1px is a real step', () => {
    const sizes = new Set<number>();
    for (let zoom = 1; zoom <= 1.5; zoom += 0.01) sizes.add(zoomedFontSize(16, zoom));
    for (const size of sizes) expect(Number.isInteger(size)).toBe(true);
    // 16px through 24px is 9 distinct sizes - a smooth ramp, not three jumps.
    expect(sizes.size).toBeGreaterThan(5);
  });

  it('scales the box cap with the same factor rather than removing it', () => {
    expect(zoomedBoxMaxWidth(1.5)).toBe('1440px');
    expect(zoomedBoxMaxWidth(2)).toBe('1920px');
  });
});

describe('a P session keeps its zoom', () => {
  it('remembers a zoom for this viewer and reads it back', () => {
    writeStoredZoom(1.75);
    expect(window.localStorage.getItem(ZOOM_STORAGE_KEY)).toBe('1.75');
    expect(readStoredZoom()).toBe(1.75);
  });

  it('has no zoom to report when this browser has never set one - that is the picker size', () => {
    expect(readStoredZoom()).toBeNull();
  });

  it('ignores a hand-edited or out-of-range stored value rather than rendering the board in it', () => {
    window.localStorage.setItem(ZOOM_STORAGE_KEY, 'enormous');
    expect(readStoredZoom()).toBeNull();
    window.localStorage.setItem(ZOOM_STORAGE_KEY, '400');
    expect(readStoredZoom()).toBeNull();
    window.localStorage.setItem(ZOOM_STORAGE_KEY, '0');
    expect(readStoredZoom()).toBeNull();
  });

  it('survives storage being unavailable, in both directions', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    expect(readStoredZoom()).toBeNull();
    expect(() => writeStoredZoom(1.5)).not.toThrow();
    getItem.mockRestore();
    setItem.mockRestore();
  });
});
