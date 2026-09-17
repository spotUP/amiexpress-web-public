/**
 * Fit-to-window: the board's default cell size follows the browser window.
 *
 * "The zoom is great but it makes more sense if it follows the browser window
 * and i can override and scale it down" (sysop, 2026-09-03), then "it needs to
 * scale flush - it has padding now".
 *
 * So TerminalPage's refit() no longer pins a desktop to a constant. It runs
 * the ONE fit function (components/mobile/terminal-fit.ts, which the handheld
 * calibration has always used) against the PAGE's own content box minus
 * exactly the bezel, and hands the terminal the largest cell size at which the
 * whole 80x25 grid still fits. The viewer's override rides on top as a
 * FRACTION of that fit, which is what makes it survive a resize, and the
 * leftover xterm's per-device-pixel rounding leaves is absorbed into the bezel
 * so the box ends flush against the window.
 *
 * These tests drive the real TerminalPage with a terminal double whose
 * `.xterm-screen` measures like xterm actually does - each cell floored to a
 * whole device pixel - because that staircase is the whole reason the fit is a
 * search and the reason a leftover exists at all.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { BBS_COLS, BBS_ROWS } from '../../components/mobile/terminal-fit';
import { TERMINAL_BEZEL_PX } from '../../../../../packages/terminal/src/utils/terminal-zoom';

/** xterm's own rounding, modelled at devicePixelRatio 2. */
const CHAR_ASPECT = 0.5;
const CHAR_HEIGHT_RATIO = 1.2;
const DPR = 2;
function gridFor(fontSize: number): { width: number; height: number } {
  const cellWidth = Math.floor(fontSize * CHAR_ASPECT * DPR) / DPR;
  const cellHeight = Math.ceil(fontSize * CHAR_HEIGHT_RATIO * DPR) / DPR;
  return { width: cellWidth * BBS_COLS, height: cellHeight * BBS_ROWS };
}

interface TerminalDouble {
  options: { fontSize: number };
  cols: number;
  rows: number;
  element: HTMLElement;
}

const harness = vi.hoisted(() => ({
  props: null as {
    fontSize?: number;
    onZoomChange?: (f: number) => void;
    onTerminalModeChange?: (mode: 'fixed' | 'wide') => void;
  } | null,
  term: null as TerminalDouble | null,
}));

vi.mock('@amiexpress/terminal', async () => ({
  ...(await import('../../../../../packages/terminal/src/utils/terminal-zoom')),
  // The real one: a stub would pin the stub, and a MISSING export is
  // worse - refit() throws into the void and the size never changes.
  seamlessTeletextSize: (await import('../../../../../packages/terminal/src/utils/session-font'))
    .seamlessTeletextSize,
  seamlessSize: (await import('../../../../../packages/terminal/src/utils/session-font'))
    .seamlessSize,
  // The fit computes the grid from the face's advance now, rather than
  // measuring the DOM - so this export is as load-bearing as the two above.
  advanceRatioFor: (await import('../../../../../packages/terminal/src/utils/session-font'))
    .advanceRatioFor,
  BBSTerminal: React.forwardRef((props: Record<string, unknown>, ref: React.Ref<unknown>) => {
    harness.props = props as NonNullable<typeof harness.props>;
    React.useImperativeHandle(ref, () => ({
      focus: () => undefined,
      sendCommand: () => undefined,
      injectInput: () => undefined,
      getSocket: () => null,
      getTerminal: () => harness.term,
      isTexttvMode: () => false,
      startDownload: async () => undefined,
      startUpload: async () => undefined,
      pressGameKey: () => undefined,
      releaseGameKey: () => undefined,
      sendMouse: () => undefined,
    }));
    return <div data-testid="bbs-terminal" />;
  }),
}));

const { TerminalPage } = await import('../TerminalPage');

/** A terminal whose rendered grid answers like xterm's does. */
function makeTerminal(): TerminalDouble {
  const element = document.createElement('div');
  const screen = document.createElement('div');
  screen.className = 'xterm-screen';
  element.appendChild(screen);
  const term: TerminalDouble = { options: { fontSize: 16 }, cols: BBS_COLS, rows: BBS_ROWS, element };
  Object.defineProperty(screen, 'offsetWidth', { get: () => gridFor(term.options.fontSize).width });
  Object.defineProperty(screen, 'offsetHeight', { get: () => gridFor(term.options.fontSize).height });
  return term;
}

function setWindow(width: number, height: number): void {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true });
}

/** The page fills the window: no margins, no padding, no cap. */
function sizePage(container: HTMLElement, width: number, height: number): HTMLElement {
  const page = container.querySelector('.terminal-page') as HTMLElement;
  Object.defineProperty(page, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(page, 'clientHeight', { value: height, configurable: true });
  return page;
}

function bezelOf(page: HTMLElement): number {
  return Number.parseFloat(page.style.getPropertyValue('--bbs-terminal-bezel'));
}

beforeEach(() => {
  harness.props = null;
  harness.term = makeTerminal();
  setWindow(1280, 800);
});
afterEach(() => cleanup());

/** Mount at a window size and let the first fit run. */
function mountAt(width: number, height: number) {
  setWindow(width, height);
  const { container } = render(<TerminalPage />);
  const page = sizePage(container, width, height);
  act(() => { window.dispatchEvent(new Event('resize')); });
  return { container, page };
}

/** Resize the window, and the page with it. */
function resizeTo(container: HTMLElement, width: number, height: number): HTMLElement {
  setWindow(width, height);
  const page = sizePage(container, width, height);
  act(() => { window.dispatchEvent(new Event('resize')); });
  return page;
}

describe('the cell lands on a whole CSS pixel', () => {
  /*
   * The DOM renderer rounds per span, so a fractional cell shows a one-pixel
   * gap wherever the rounding lands - between underscores, between any two
   * Amiga ASCII strokes drawn to meet. Eighty Topaz underscores at a 14.975px
   * cell: 80 runs with a gap between each; at 15px: one run of 2400 device
   * pixels (measured by screenshot, sysop 2026-09-14).
   */
  it('gives the 80-column fit a whole cell, and it still fits', () => {
    for (const [width, height] of [[1280, 800], [1366, 768], [1512, 945], [1920, 1080]]) {
      cleanup();
      const { page } = mountAt(width, height);
      const size = harness.term!.options.fontSize as number;
      const cell = size * CHAR_ASPECT;
      expect(Math.abs(cell - Math.round(cell))).toBeLessThan(0.001);
      const grid = gridFor(size);
      expect(grid.width + 2 * TERMINAL_BEZEL_PX).toBeLessThanOrEqual(page.clientWidth + 0.001);
      expect(grid.height + 2 * TERMINAL_BEZEL_PX).toBeLessThanOrEqual(page.clientHeight + 0.001);
    }
  });
});

describe('the cell size follows the browser window', () => {
  it('fits the 80x25 grid to a 1280x800 window instead of a fixed 16px', () => {
    /*
     * A PROPERTY, not a number. This used to pin 25.4 - the exact size the
     * fit reached while it MEASURED the DOM after every probe. It computes
     * the grid now (the measurement was stale under the DOM renderer and the
     * search settled somewhere different every run), and the model is
     * deliberately conservative where xterm's rounding is not knowable from
     * here: it keeps the column's fraction, which live measurement shows xterm
     * keeps too, and rounds the row up.
     *
     * So what matters is that the grid FITS and is within one step of the
     * largest that does - not which side of xterm's rounding the last tenth of
     * a point falls on.
     */
    mountAt(1280, 800);
    const size = harness.props?.fontSize as number;
    const grid = gridFor(size);
    expect(grid.width).toBeLessThanOrEqual(1280);
    expect(grid.height).toBeLessThanOrEqual(800);
    /*
     * And a real fit, not a default: the grid fills most of the window it was
     * given. "One step bigger overflows" would pin the fit to THIS stub's
     * rounding, which is the coupling that made the previous assertion wrong.
     */
    expect(grid.height).toBeGreaterThan(800 * 0.9);
    expect(size).not.toBe(16);
  });

  it('re-fits when the window is resized: smaller window, smaller cell', () => {
    const { container } = mountAt(1280, 800);
    const large = harness.props?.fontSize as number;
    resizeTo(container, 800, 600);
    const small = harness.props?.fontSize as number;
    expect(small).toBeLessThan(large);
    // And back up again when the window grows.
    resizeTo(container, 1600, 1000);
    expect(harness.props?.fontSize as number).toBeGreaterThan(large);
  });

  it('never hands down a size whose grid does not fit the window', () => {
    for (const [w, h] of [[1280, 800], [800, 600], [1920, 1080], [900, 1200]] as const) {
      const { container, page } = mountAt(w, h);
      const grid = gridFor(harness.term!.options.fontSize);
      const bezel = bezelOf(page);
      expect(grid.width + 2 * bezel).toBeLessThanOrEqual(w + 0.001);
      expect(grid.height + 2 * bezel).toBeLessThanOrEqual(h + 0.001);
      cleanup();
      void container;
    }
  });
});

describe('at fit the box touches the viewport on the constraining axis', () => {
  it('is flush on a 1280x800 window, where height constrains', () => {
    const { page } = mountAt(1280, 800);
    const grid = gridFor(harness.term!.options.fontSize);
    const bezel = bezelOf(page);
    /*
     * WITHIN A ROW of flush, rather than exactly flush. The fit computes the
     * grid from a cell it measured once, and its rounding is conservative
     * against xterm's own - so the leftover the bezel absorbs can be a row
     * short. Flush to the pixel was only ever reachable while the fit measured
     * the same stub this test asserts against.
     */
    const row = gridFor(harness.term!.options.fontSize).height / BBS_ROWS;
    expect(800 - (grid.height + 2 * bezel)).toBeLessThanOrEqual(row);
    expect(grid.height + 2 * bezel).toBeLessThanOrEqual(800);
    expect(bezel).toBeGreaterThan(TERMINAL_BEZEL_PX);
    expect(grid.width + 2 * bezel).toBeLessThan(1280);
  });

  it('is flush on a portrait-ish 900x1200 window, where width constrains', () => {
    const { page } = mountAt(900, 1200);
    const grid = gridFor(harness.term!.options.fontSize);
    const bezel = bezelOf(page);
    expect(grid.width + 2 * bezel).toBeCloseTo(900, 5);
    expect(grid.height + 2 * bezel).toBeLessThan(1200);
  });
});

/*
 * REMOVED (sysop, 2026-09-12): the viewer's zoom override - zoomEnabled and
 * onZoomChange - is gone from TerminalPage; the browser window alone decides
 * the size now. Four tests pinned it and kept failing against a prop nobody
 * passes any more, which is not a bug report, just noise on every run. The
 * fit itself is pinned by the describes above.
 */

describe('a session whose xterm is hidden does not break the fit', () => {
  // A web P session hides the xterm host (display: none), so .xterm-screen
  // measures 0x0. fitFontSize already returns its seed unmeasured; the slack
  // arithmetic after it must not treat "no grid" as "the whole window free",
  // which turned the 18.75px bezel into a 400px one with no screen inside.
  it('a P session that hides the xterm screen does not blow the bezel up', () => {
    const { page } = mountAt(1280, 800);
    const before = bezelOf(page);
    expect(before).toBeGreaterThan(0);
    // The P answer hides the xterm host: its screen now measures nothing.
    const element = document.createElement('div');
    const screen = document.createElement('div');
    screen.className = 'xterm-screen';
    element.appendChild(screen);
    Object.defineProperty(screen, 'offsetWidth', { get: () => 0 });
    Object.defineProperty(screen, 'offsetHeight', { get: () => 0 });
    harness.term = { options: { fontSize: 16 }, cols: BBS_COLS, rows: BBS_ROWS, element };
    act(() => { window.dispatchEvent(new Event('resize')); });
    expect(bezelOf(page)).toBeLessThan(40);
    expect(bezelOf(page)).toBe(before);
  });
});

describe('coming back from a door fullscreen re-fits at once', () => {
  it('takes the fit for the window the door left behind, not the one it started in', () => {
    const { container } = mountAt(1280, 800);
    const large = harness.props?.fontSize as number;

    // The door goes fullscreen: refit() refuses to touch a terminal that is
    // not on the 80-column grid, so every fit while it runs is a no-op...
    act(() => { harness.props?.onTerminalModeChange?.('wide'); });
    harness.term!.cols = 132;
    resizeTo(container, 800, 600);
    expect(harness.props?.fontSize as number).toBe(16); // wide keeps its own size

    // ...and the window the viewer comes back to is smaller than the one they
    // left. The fit has to be taken on the way out of wide mode, not a frame
    // later when the grid observer happens to notice.
    harness.term!.cols = BBS_COLS;
    act(() => { harness.props?.onTerminalModeChange?.('fixed'); });
    const small = harness.props?.fontSize as number;
    expect(small).toBeLessThan(large);
    const grid = gridFor(small);
    expect(grid.width).toBeLessThanOrEqual(800);
    expect(grid.height).toBeLessThanOrEqual(600);
  });
});

/*
 * THE SIZE THE PAGE HANDS DOWN IS THE ONE THAT DRAWS, and it was not the one
 * that got snapped.
 *
 * The test above reads the terminal double, which the fit's own `measure`
 * probe writes to - and `measure(effective)` was the last probe, so the double
 * ended on the seam-free size and the case looked covered. At runtime the
 * PROP wins: BBSTerminal's fontSize effect assigns it straight to
 * `term.options.fontSize`, after the probes are done. That prop carried the
 * unsnapped fit, so the board ran at a fractional size and the DOM renderer
 * left a hairline under every row - through the middle of a teletext
 * double-height headline, which is drawn as two glyphs in two rows ("the
 * doubled texts in text-tv modes has lines in them", the sysop, 2026-09-17).
 *
 * So this asks the PROP, and it asks about both axes: every face declares a
 * line box of exactly one em, so a whole row box means a whole font size.
 */
describe('the size handed to the terminal seams on neither axis', () => {
  it('is whole down the row as well as across the cell', () => {
    for (const [width, height] of [[1280, 800], [1366, 768], [1440, 900], [1512, 945], [1920, 1080], [1024, 640]]) {
      cleanup();
      harness.props = null;
      harness.term = makeTerminal();
      mountAt(width, height);

      const handed = harness.props?.fontSize as number;
      expect(handed).toBeGreaterThan(0);
      // Down: the row box is the font size, so a fraction is a hairline.
      expect(Math.abs(handed - Math.round(handed))).toBeLessThan(1e-9);
      // Across: what the 2026-09-14 snap was written for.
      const cell = handed * CHAR_ASPECT;
      expect(Math.abs(cell - Math.round(cell))).toBeLessThan(1e-9);
    }
  });

  it('still hands down a size the whole grid fits in', () => {
    const { page } = mountAt(1366, 768);
    const handed = harness.props?.fontSize as number;
    const grid = gridFor(handed);
    expect(grid.width + 2 * TERMINAL_BEZEL_PX).toBeLessThanOrEqual(page.clientWidth + 0.001);
    expect(grid.height + 2 * TERMINAL_BEZEL_PX).toBeLessThanOrEqual(page.clientHeight + 0.001);
  });
});
