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
  props: null as { fontSize?: number; onZoomChange?: (f: number) => void } | null,
  term: null as TerminalDouble | null,
}));

vi.mock('@amiexpress/terminal', async () => ({
  ...(await import('../../../../../packages/terminal/src/utils/terminal-zoom')),
  BBSTerminal: React.forwardRef((props: Record<string, unknown>, ref: React.Ref<unknown>) => {
    harness.props = props as { fontSize?: number; onZoomChange?: (f: number) => void };
    React.useImperativeHandle(ref, () => ({
      focus: () => undefined,
      sendCommand: () => undefined,
      injectInput: () => undefined,
      getSocket: () => null,
      getTerminal: () => harness.term,
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

describe('the cell size follows the browser window', () => {
  it('fits the 80x25 grid to a 1280x800 window instead of a fixed 16px', () => {
    mountAt(1280, 800);
    expect(harness.props?.fontSize).toBeCloseTo(25.4, 5);
    // Not the old constant - that is the whole point of the change.
    expect(harness.props?.fontSize).not.toBe(16);
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
      const grid = gridFor(harness.props?.fontSize as number);
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
    const grid = gridFor(harness.props?.fontSize as number);
    const bezel = bezelOf(page);
    // The bezel absorbed the leftover, so the box is exactly the page height.
    expect(grid.height + 2 * bezel).toBeCloseTo(800, 5);
    expect(bezel).toBeGreaterThan(TERMINAL_BEZEL_PX);
    expect(grid.width + 2 * bezel).toBeLessThan(1280);
  });

  it('is flush on a portrait-ish 900x1200 window, where width constrains', () => {
    const { page } = mountAt(900, 1200);
    const grid = gridFor(harness.props?.fontSize as number);
    const bezel = bezelOf(page);
    expect(grid.width + 2 * bezel).toBeCloseTo(900, 5);
    expect(grid.height + 2 * bezel).toBeLessThan(1200);
  });

  it('leaves the plain bezel alone once the viewer scales the screen down', () => {
    const { container, page } = mountAt(1280, 800);
    act(() => { harness.props?.onZoomChange?.(0.5); });
    void container;
    expect(bezelOf(page)).toBe(TERMINAL_BEZEL_PX);
  });
});

describe('the override survives a resize because it is a fraction', () => {
  it('keeps three quarters of whatever the new window can hold', () => {
    const { container } = mountAt(1280, 800);
    const fitLarge = harness.props?.fontSize as number;
    act(() => { harness.props?.onZoomChange?.(0.75); });
    expect(harness.props?.fontSize as number).toBeCloseTo(fitLarge * 0.75, 6);

    resizeTo(container, 800, 600);
    const scaled = harness.props?.fontSize as number;
    // The fit for the new window, recovered by undoing the fraction.
    const fitSmall = scaled / 0.75;
    expect(fitSmall).toBeLessThan(fitLarge);
    expect(scaled).toBeCloseTo(fitSmall * 0.75, 6);
    // An ABSOLUTE override would have kept the old pixel count instead.
    expect(scaled).not.toBeCloseTo(fitLarge * 0.75, 3);
  });

  it('scales the screen down below the fit, which is what the override is for', () => {
    mountAt(1280, 800);
    const fit = harness.props?.fontSize as number;
    act(() => { harness.props?.onZoomChange?.(0.5); });
    expect(harness.props?.fontSize as number).toBeCloseTo(fit * 0.5, 6);
    expect(harness.props?.fontSize as number).toBeLessThan(fit);
  });

  it('going home to fit-to-window puts the terminal back on the window exactly', () => {
    const { page } = mountAt(1280, 800);
    const fit = harness.props?.fontSize as number;
    act(() => { harness.props?.onZoomChange?.(0.5); });
    expect(harness.props?.fontSize as number).toBeLessThan(fit);
    act(() => { harness.props?.onZoomChange?.(1); });
    expect(harness.props?.fontSize as number).toBeCloseTo(fit, 6);
    const grid = gridFor(harness.props?.fontSize as number);
    expect(grid.height + 2 * bezelOf(page)).toBeCloseTo(800, 5);
  });
});
