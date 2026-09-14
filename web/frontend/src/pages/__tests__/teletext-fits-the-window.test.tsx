/**
 * A teletext session's cell is MEASURED, not doubled.
 *
 * The mode used to set the calibrated 80-column cell x2 and the page refused
 * to touch it. That is only right if the teletext face has the board face's
 * advance ratio - TDAText does not, so forty of its columns at 2x came out
 * wider than eighty of the board's at 1x: the right of every row sat outside
 * the window and the box grew a horizontal scrollbar (sysop, 2026-09-13,
 * "not scaled properly ... some content is outside the visible area").
 *
 * The terminal announces the mode; the page fits the 40x25 grid the same way
 * it fits 80x25, and leaves the 80-column calibration alone.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { BBS_COLS, BBS_ROWS } from '../../components/mobile/terminal-fit';

const TELETEXT_COLS = 40;
const DPR = 2;
/** The board face: half an em wide. */
const BOARD_ASPECT = 0.5;
/** The teletext face: squarer, and that is the whole bug. */
const TELETEXT_ASPECT = 0.62;
const HEIGHT_RATIO = 1.2;

const harness = vi.hoisted(() => ({
  props: null as { fontSize?: number } | null,
  term: null as any,
  texttv: false,
}));

vi.mock('@amiexpress/terminal', async () => ({
  ...(await import('../../../../../packages/terminal/src/utils/terminal-zoom')),
  // The real one: a stub would pin the stub, and a MISSING export is
  // worse - refit() throws into the void and the size never changes.
  seamlessTeletextSize: (await import('../../../../../packages/terminal/src/utils/session-font'))
    .seamlessTeletextSize,
  seamlessSize: (await import('../../../../../packages/terminal/src/utils/session-font'))
    .seamlessSize,
  BBSTerminal: React.forwardRef((props: Record<string, unknown>, ref: React.Ref<unknown>) => {
    harness.props = props as { fontSize?: number };
    React.useImperativeHandle(ref, () => ({
      focus: () => undefined,
      sendCommand: () => undefined,
      injectInput: () => undefined,
      getSocket: () => null,
      getTerminal: () => harness.term,
      isTexttvMode: () => harness.texttv,
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

function gridFor(fontSize: number): { width: number; height: number } {
  const aspect = harness.texttv ? TELETEXT_ASPECT : BOARD_ASPECT;
  const cols = harness.texttv ? TELETEXT_COLS : BBS_COLS;
  const cellWidth = Math.floor(fontSize * aspect * DPR) / DPR;
  const cellHeight = Math.ceil(fontSize * HEIGHT_RATIO * DPR) / DPR;
  return { width: cellWidth * cols, height: cellHeight * BBS_ROWS };
}

function makeTerminal() {
  const element = document.createElement('div');
  const screen = document.createElement('div');
  screen.className = 'xterm-screen';
  element.appendChild(screen);
  const term = { options: { fontSize: 16 }, cols: BBS_COLS, rows: BBS_ROWS, element };
  Object.defineProperty(screen, 'offsetWidth', { get: () => gridFor(term.options.fontSize).width });
  Object.defineProperty(screen, 'offsetHeight', { get: () => gridFor(term.options.fontSize).height });
  return term;
}

function setWindow(width: number, height: number): void {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true });
}

function sizePage(container: HTMLElement, width: number, height: number): HTMLElement {
  const page = container.querySelector('.terminal-page') as HTMLElement;
  Object.defineProperty(page, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(page, 'clientHeight', { value: height, configurable: true });
  return page;
}

beforeEach(() => {
  harness.props = null;
  harness.texttv = false;
  harness.term = makeTerminal();
  setWindow(1280, 800);
});
afterEach(() => cleanup());

function mountAt(width: number, height: number) {
  setWindow(width, height);
  const { container } = render(<TerminalPage />);
  const page = sizePage(container, width, height);
  act(() => { window.dispatchEvent(new Event('resize')); });
  return { container, page };
}

/** The caller answers T: the terminal takes the 40x25 grid, then says so. */
function enterTeletext(): void {
  harness.texttv = true;
  harness.term.cols = TELETEXT_COLS;
  // The mode's own first guess, exactly as BBSTerminal applies it.
  harness.term.options.fontSize = (harness.props?.fontSize as number) * 2;
  act(() => {
    window.dispatchEvent(new CustomEvent('bbs:texttv-mode', { detail: { enabled: true } }));
  });
}

describe('a teletext session is fitted to the window', () => {
  it('sits on a whole CELL, because a fractional one seams the mosaics', () => {
    /*
     * Teletext runs on the DOM renderer (the canvas atlas blits a face's
     * glyph a device pixel short of its cell, whatever the size), and the
     * DOM renderer lays out SPANS: a fractional cell rounds per span and
     * breaks a 40-cell rule into seven runs with a gap between each.
     * Measured by screenshotting the rule: a 22.5px cell gives 7 runs, a
     * 24px cell one run of 1920 unbroken device pixels (sysop,
     * 2026-09-14).
     */
    const { page } = mountAt(1280, 800);
    enterTeletext();

    const size = harness.term.options.fontSize as number;
    const cell = size * 0.6;                        // TeletextUPR's advance
    expect(Math.abs(cell - Math.round(cell))).toBeLessThan(0.001);
    // And it still fits: rounding DOWN cannot push the grid off the page.
    const grid = gridFor(size);
    expect(grid.width).toBeLessThanOrEqual(page.clientWidth + 0.001);
    expect(grid.height).toBeLessThanOrEqual(page.clientHeight + 0.001);
  });

  it('keeps the whole 40x25 grid inside the page', () => {
    const { page } = mountAt(1280, 800);
    enterTeletext();

    const grid = gridFor(harness.term.options.fontSize);
    expect(grid.width).toBeLessThanOrEqual(page.clientWidth + 0.001);
    expect(grid.height).toBeLessThanOrEqual(page.clientHeight + 0.001);
  });

  it('the doubled guess it replaces does NOT fit - which is the bug', () => {
    mountAt(1280, 800);
    const calibrated = harness.props?.fontSize as number;
    harness.texttv = true;
    harness.term.cols = TELETEXT_COLS;
    // Forty columns of a squarer face at twice the size overflow the box the
    // eighty-column grid fitted exactly - on one axis or the other,
    // whichever the window constrains.
    const doubled = gridFor(calibrated * 2);
    expect(doubled.width > 1280 || doubled.height > 800).toBe(true);
    // And the fit picks something that does fit, which is smaller.
    enterTeletext();
    expect(harness.term.options.fontSize).toBeLessThan(calibrated * 2);
  });

  it('leaves the 80-column calibration alone, so leaving the mode restores it', () => {
    mountAt(1280, 800);
    const calibrated = harness.props?.fontSize as number;
    enterTeletext();
    expect(harness.props?.fontSize).toBe(calibrated);
  });

  it('follows the window while the mode is on', () => {
    const { container } = mountAt(1280, 800);
    enterTeletext();
    const wide = harness.term.options.fontSize as number;

    setWindow(800, 600);
    const page = sizePage(container, 800, 600);
    act(() => { window.dispatchEvent(new Event('resize')); });

    const small = harness.term.options.fontSize as number;
    expect(small).toBeLessThan(wide);
    const grid = gridFor(small);
    expect(grid.width).toBeLessThanOrEqual(page.clientWidth + 0.001);
    expect(grid.height).toBeLessThanOrEqual(page.clientHeight + 0.001);
  });
});
