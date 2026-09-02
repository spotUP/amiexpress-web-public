/**
 * Wiring tests for the mobile BBS page.
 *
 * These prove the on-screen controls are REACHABLE: a door starting has to
 * swap the generic keyboard for the door's controls, a GRANDMASTER pad press
 * has to reach the terminal's game-mode key path, and an ARKANOID thumb stroke
 * has to reach the terminal's MOUSE path - the same socket path the desktop
 * mouse uses - as proportional terminal columns. Controls nobody can reach are
 * not a feature.
 */

import React from 'react';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';

const harness = vi.hoisted(() => ({
  props: null as Record<string, any> | null,
  pressGameKey: vi.fn(),
  releaseGameKey: vi.fn(),
  injectInput: vi.fn(),
  sendMouse: vi.fn(),
  mounts: 0,
}));

vi.mock('@amiexpress/terminal', () => ({
  BBSTerminal: React.forwardRef((props: Record<string, any>, ref: React.Ref<unknown>) => {
    harness.props = props;
    React.useEffect(() => { harness.mounts += 1; }, []);
    React.useImperativeHandle(ref, () => ({
      focus: () => undefined,
      sendCommand: () => undefined,
      injectInput: harness.injectInput,
      getSocket: () => null,
      getTerminal: () => null,
      startDownload: async () => undefined,
      startUpload: async () => undefined,
      pressGameKey: harness.pressGameKey,
      releaseGameKey: harness.releaseGameKey,
      sendMouse: harness.sendMouse,
    }));
    return <div data-testid="bbs-terminal" />;
  }),
}));

// Imported after the mock so TerminalPage picks it up.
const { TerminalPage } = await import('../TerminalPage');

/** Row the trackpad reports, from the ARKANOID layout (PADDLE_Y). */
const PADDLE_ROW = 19;
const STRIP_LEFT = 20;
const STRIP_WIDTH = 200;

function setPhoneViewport(): void {
  Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true });
}

/**
 * A landscape desktop window. isPortraitMobile() is false because the
 * window is wider than it is tall, and isHandheld()'s landscape branch
 * needs `window.matchMedia` to find a coarse pointer - jsdom does not
 * implement it (see the note in bbsterminal-session-font.test.tsx), so
 * `typeof window.matchMedia === 'function'` is false here and isHandheld()
 * comes back false, exactly like a real desktop browser.
 */
function setDesktopViewport(): void {
  Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
}

function setSurface(kind: 'xterm' | 'canvas'): void {
  act(() => { harness.props?.onSurfaceChange?.(kind); });
}

function startDoor(doorId: string | null): void {
  act(() => { harness.props?.onDoorChange?.(doorId); });
}

function fireTouch(
  target: Element,
  type: 'touchstart' | 'touchmove' | 'touchend',
  touches: { identifier: number; clientX?: number }[],
): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'changedTouches', {
    value: touches.map(t => ({ clientX: 0, ...t, target })),
  });
  act(() => { target.dispatchEvent(event); });
}

/** jsdom gives every element a zero-size rect; the strip needs a real one. */
function strip(): HTMLElement {
  const el = screen.getByRole('slider', { name: 'Paddle' });
  el.getBoundingClientRect = () => ({
    left: STRIP_LEFT,
    right: STRIP_LEFT + STRIP_WIDTH,
    width: STRIP_WIDTH,
    top: 0,
    bottom: 60,
    height: 60,
    x: STRIP_LEFT,
    y: 0,
    toJSON: () => ({}),
  }) as DOMRect;
  return el;
}

beforeEach(() => {
  setPhoneViewport();
  harness.props = null;
  harness.pressGameKey.mockReset();
  harness.releaseGameKey.mockReset();
  harness.sendMouse.mockReset();
});

afterEach(cleanup);

describe('TerminalPage on a phone', () => {
  it('shows the generic BBS keyboard when no door is running', () => {
    render(<TerminalPage />);

    expect(screen.getByRole('button', { name: 'ESC' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Hard Drop' })).toBeNull();
  });

  it('swaps in the GRANDMASTER pad while GMASTER runs, and back afterwards', () => {
    render(<TerminalPage />);

    startDoor('gmaster');

    expect(screen.getByRole('button', { name: 'Hard Drop' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'ESC' })).toBeNull();

    startDoor(null);

    expect(screen.getByRole('button', { name: 'ESC' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Hard Drop' })).toBeNull();
  });

  it('swaps in the ARKANOID trackpad while ARKANOID runs', () => {
    render(<TerminalPage />);

    startDoor('arkanoid');

    expect(screen.getByRole('slider', { name: 'Paddle' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Launch' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
    // The stepwise paddle buttons are gone - Arkanoid is a spinner game.
    expect(screen.queryByRole('button', { name: 'Left' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Right' })).toBeNull();
  });

  it('keeps the generic keyboard for doors without controls', () => {
    render(<TerminalPage />);

    startDoor('doorman');

    expect(screen.getByRole('button', { name: 'ESC' })).toBeTruthy();
  });

  it('drives the terminal game-mode key path on press and release', () => {
    render(<TerminalPage />);
    startDoor('gmaster');

    const left = screen.getByRole('button', { name: 'Left' });
    fireTouch(left, 'touchstart', [{ identifier: 1 }]);

    expect(harness.pressGameKey).toHaveBeenCalledWith('ArrowLeft', 'ArrowLeft');
    expect(harness.releaseGameKey).not.toHaveBeenCalled();

    fireTouch(left, 'touchend', [{ identifier: 1 }]);

    expect(harness.releaseGameKey).toHaveBeenCalledWith('ArrowLeft', 'ArrowLeft');
  });

  it('asks the terminal to fill the page so the on-screen input cannot cover the bottom rows', () => {
    render(<TerminalPage />);

    expect(harness.props?.fillParent).toBe(true);
  });
});

describe('TerminalPage ARKANOID trackpad', () => {
  it('moves the paddle relative to the thumb, geared so a short sweep crosses the board', () => {
    // Changed deliberately on 2026-08-25: the mapping used to be absolute
    // across a full-width strip, so crossing the board meant sweeping the
    // whole phone. A spinner is relative and geared.
    render(<TerminalPage />);
    startDoor('arkanoid');
    const pad = strip();

    // Planting the thumb does NOT move the paddle - it clicks where the
    // paddle already is, which is what launches a waiting ball.
    fireTouch(pad, 'touchstart', [{ identifier: 1, clientX: STRIP_LEFT }]);
    expect(harness.sendMouse).toHaveBeenLastCalledWith('mouse-click', { x: 40, y: PADDLE_ROW });

    // A quarter of the strip to the right moves further than a quarter of
    // the board, because of the gearing.
    fireTouch(pad, 'touchmove', [{ identifier: 1, clientX: STRIP_LEFT + STRIP_WIDTH / 4 }]);
    const afterQuarter = harness.sendMouse.mock.calls[harness.sendMouse.mock.calls.length - 1]?.[1] as { x: number };
    expect(afterQuarter.x).toBeGreaterThan(40 + 79 / 4);

    // ...and it never runs off the end.
    fireTouch(pad, 'touchmove', [{ identifier: 1, clientX: STRIP_LEFT + STRIP_WIDTH }]);
    expect(harness.sendMouse).toHaveBeenLastCalledWith('mouse-drag', { x: 79, y: PADDLE_ROW });

    // Never the key path: arrow keys would nudge the paddle stepwise.
    expect(harness.pressGameKey).not.toHaveBeenCalled();
  });

  it('does not teleport the paddle when the thumb is re-planted', () => {
    render(<TerminalPage />);
    startDoor('arkanoid');
    const pad = strip();

    fireTouch(pad, 'touchstart', [{ identifier: 1, clientX: STRIP_LEFT + STRIP_WIDTH / 2 }]);
    fireTouch(pad, 'touchmove', [{ identifier: 1, clientX: STRIP_LEFT + STRIP_WIDTH * 0.75 }]);
    const moved = harness.sendMouse.mock.calls[harness.sendMouse.mock.calls.length - 1]?.[1] as { x: number };
    fireTouch(pad, 'touchend', [{ identifier: 1, clientX: STRIP_LEFT + STRIP_WIDTH * 0.75 }]);

    // Thumb comes down again at the far LEFT: the paddle stays put.
    fireTouch(pad, 'touchstart', [{ identifier: 2, clientX: STRIP_LEFT }]);

    expect(harness.sendMouse).toHaveBeenLastCalledWith('mouse-click', { x: moved.x, y: PADDLE_ROW });
  });

  it('sends a click when the thumb lands, so a waiting ball launches', () => {
    render(<TerminalPage />);
    startDoor('arkanoid');
    const pad = strip();

    fireTouch(pad, 'touchstart', [{ identifier: 2, clientX: STRIP_LEFT + STRIP_WIDTH / 2 }]);

    expect(harness.sendMouse).toHaveBeenCalledTimes(1);
    expect(harness.sendMouse.mock.calls[0][0]).toBe('mouse-click');
  });

  it('clicks at the paddle instead of the middle when Launch is tapped mid-stroke', () => {
    render(<TerminalPage />);
    startDoor('arkanoid');
    const pad = strip();

    fireTouch(pad, 'touchstart', [{ identifier: 3, clientX: STRIP_LEFT }]);
    fireTouch(pad, 'touchmove', [{ identifier: 3, clientX: STRIP_LEFT + STRIP_WIDTH }]);
    harness.sendMouse.mockClear();

    const launch = screen.getByRole('button', { name: 'Launch' });
    fireTouch(launch, 'touchstart', [{ identifier: 4 }]);

    expect(harness.sendMouse).toHaveBeenCalledWith('mouse-click', { x: 79, y: PADDLE_ROW });
  });

  it('clicks the middle when Launch is tapped before the thumb has moved', () => {
    render(<TerminalPage />);
    startDoor('arkanoid');

    const launch = screen.getByRole('button', { name: 'Launch' });
    fireTouch(launch, 'touchstart', [{ identifier: 5 }]);

    expect(harness.sendMouse).toHaveBeenCalledWith('mouse-click', { x: 40, y: PADDLE_ROW });
  });

  it('sends p on the key path when Pause is tapped', () => {
    render(<TerminalPage />);
    startDoor('arkanoid');

    const pause = screen.getByRole('button', { name: 'Pause' });
    fireTouch(pause, 'touchstart', [{ identifier: 6 }]);

    expect(harness.pressGameKey).toHaveBeenCalledWith('p', 'KeyP');
    expect(harness.sendMouse).not.toHaveBeenCalled();

    fireTouch(pause, 'touchend', [{ identifier: 6 }]);
    expect(harness.releaseGameKey).toHaveBeenCalledWith('p', 'KeyP');
  });
});

/**
 * The sysop asked for the fixed 80x25 terminal to sit centred against a page
 * ground that is a shade lighter than pure black, so the letterboxing is
 * actually visible - currently both the terminal's wrapper and the page
 * behind it are #000000, so "centred" has nothing to contrast against.
 *
 * jsdom does no layout (and this project's vitest config runs with
 * `css: false`), so there is no computed style to assert pixel centring
 * against. What IS reachable and real: the container class TerminalPage
 * puts on the DOM only in the desktop-fixed case (never for a handheld
 * session or a PETSCII canvas session, where the terminal must still fill
 * the viewport), and the CSS source that turns that class + the new token
 * into an actual centred, contrasting page.
 */
describe('TerminalPage desktop 80x25 framing', () => {
  it('centres the terminal in a frame on a desktop xterm session', () => {
    setDesktopViewport();
    render(<TerminalPage />);

    const page = document.querySelector('.terminal-page');
    expect(page?.className).toContain('terminal-page--framed');

    const frame = document.querySelector('.terminal-page__frame');
    expect(frame).toBeTruthy();
    expect(frame?.querySelector('[data-testid="bbs-terminal"]')).toBeTruthy();
  });

  it('does not frame a handheld session - it must still fill the viewport', () => {
    setPhoneViewport();
    render(<TerminalPage />);

    const page = document.querySelector('.terminal-page');
    expect(page?.className).not.toContain('terminal-page--framed');
    expect(document.querySelector('.terminal-page__frame')).toBeNull();
  });

  it('does not frame a PETSCII canvas session - it already centres itself', () => {
    setDesktopViewport();
    render(<TerminalPage />);

    setSurface('canvas');

    const page = document.querySelector('.terminal-page');
    expect(page?.className).not.toContain('terminal-page--framed');
    expect(document.querySelector('.terminal-page__frame')).toBeNull();
  });

  it('un-frames again once a door drops the desktop session back to handheld-style sizing', () => {
    setDesktopViewport();
    render(<TerminalPage />);
    expect(document.querySelector('.terminal-page__frame')).toBeTruthy();

    act(() => {
      setPhoneViewport();
      window.dispatchEvent(new Event('resize'));
    });

    expect(document.querySelector('.terminal-page__frame')).toBeNull();
  });
});

describe('TerminalPage keeps ONE terminal for the life of the session', () => {
  // The socket lives in BBSTerminal's mount effect; a remount disconnects it
  // and the board starts over. On 2026-09-02 the P answer did exactly that
  // on the live board: the surface flip removed the frame wrapper, which
  // moved the terminal to a different parent, and React remounted it.
  it('the P answer (surface -> canvas) does not remount the terminal', () => {
    setDesktopViewport();
    harness.mounts = 0;
    render(<TerminalPage />);
    const before = screen.getByTestId('bbs-terminal');
    expect(harness.mounts).toBe(1);

    setSurface('canvas');

    expect(harness.mounts).toBe(1);
    expect(screen.getByTestId('bbs-terminal')).toBe(before);
  });

  it('a desktop session dropping to handheld sizing does not remount the terminal', () => {
    setDesktopViewport();
    harness.mounts = 0;
    render(<TerminalPage />);
    const before = screen.getByTestId('bbs-terminal');

    act(() => {
      setPhoneViewport();
      window.dispatchEvent(new Event('resize'));
    });

    expect(harness.mounts).toBe(1);
    expect(screen.getByTestId('bbs-terminal')).toBe(before);
  });
});

describe('TerminalPage page ground token', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const read = (rel: string) => readFileSync(path.join(here, rel), 'utf8');

  it('defines one near-black page-ground token, lighter than the pure-black terminal theme', () => {
    const indexCss = read('../../index.css');
    const matches = indexCss.match(/--bbs-page-bg:\s*(#[0-9a-fA-F]{3,6})/);

    expect(matches).toBeTruthy();
    const [, hex] = matches!;
    expect(hex.toLowerCase()).not.toBe('#000000');
    expect(hex.toLowerCase()).not.toBe('#000');

    // "Tiny bit lighter": every channel is low, not swapped for a hue.
    const value = hex.length === 4
      ? hex.slice(1).split('').map(c => parseInt(c + c, 16))
      : [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map(c => parseInt(c, 16));
    expect(Math.max(...value)).toBeGreaterThan(0);
    expect(Math.max(...value)).toBeLessThan(40);
  });

  it('paints the page background (not the terminal) from that token, not a hardcoded hex', () => {
    const indexCss = read('../../index.css');
    const appCss = read('../../App.css');

    expect(indexCss).toMatch(/body\s*{[^}]*background:\s*var\(--bbs-page-bg\)/s);
    expect(appCss).toMatch(/\.app-shell\s*{[^}]*background:\s*var\(--bbs-page-bg\)/s);
  });
});
