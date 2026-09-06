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

vi.mock('@amiexpress/terminal', async () => ({
  // The zoom module is pure arithmetic with no side effects, and TerminalPage
  // does the one multiply with it - stubbing it would only test the stub.
  ...(await import('../../../../../packages/terminal/src/utils/terminal-zoom')),
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
  it('moves the paddle exactly as far as the thumb travelled', () => {
    // This has been wrong in both directions. Absolute at first, so the
    // paddle teleported to the thumb and a full traverse meant a full-width
    // reach (2026-08-25). Then geared to 2.2, so a short sweep crossed the
    // board - and a beta on real iPhones and Androids found that unplayable
    // (2026-09-06): a paddle that outruns your thumb by more than double
    // gives the hand nothing to aim with. It is 1:1 now, and still relative,
    // so lifting and re-planting continues the stroke.
    render(<TerminalPage />);
    startDoor('arkanoid');
    const pad = strip();

    // Planting the thumb does NOT move the paddle - it clicks where the
    // paddle already is, which is what launches a waiting ball.
    fireTouch(pad, 'touchstart', [{ identifier: 1, clientX: STRIP_LEFT }]);
    expect(harness.sendMouse).toHaveBeenLastCalledWith('mouse-click', { x: 40, y: PADDLE_ROW });

    // A quarter of the strip to the right moves the paddle a quarter of the
    // board. Not more.
    fireTouch(pad, 'touchmove', [{ identifier: 1, clientX: STRIP_LEFT + STRIP_WIDTH / 4 }]);
    const afterQuarter = harness.sendMouse.mock.calls[harness.sendMouse.mock.calls.length - 1]?.[1] as { x: number };
    expect(Math.abs(afterQuarter.x - (40 + 79 / 4))).toBeLessThanOrEqual(1);

    // ...and a full sweep reaches the far edge without running off it.
    //
    // Lifting the thumb is what proves it: a drag is throttled to the newest
    // position every SPINNER_SEND_MS, so the move above may still be pending,
    // but the END of a stroke is sent at once - "a stroke must end where the
    // thumb left it". The old geared mapping hid this, because 2.2 gain
    // clamped to the edge on the first move.
    fireTouch(pad, 'touchmove', [{ identifier: 1, clientX: STRIP_LEFT + STRIP_WIDTH }]);
    fireTouch(pad, 'touchend', [{ identifier: 1, clientX: STRIP_LEFT + STRIP_WIDTH }]);
    expect(harness.sendMouse).toHaveBeenLastCalledWith('mouse-up', { x: 79, y: PADDLE_ROW });

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
 * The sysop asked for the fixed 80x25 terminal to sit CENTRED, in its own
 * shrunk box, with the page filling the rest. The ground was a shade lighter
 * than the terminal at first so the letterboxing showed; on 2026-09-03 the
 * sysop asked for a black page instead, and the ground token went to #000000.
 * The centring is the part that was asked for and the part asserted here -
 * the ground colour is one token away either way.
 *
 * jsdom does no layout (and this project's vitest config runs with
 * `css: false`), so there is no computed style to assert pixel centring
 * against. What IS reachable and real: the container class TerminalPage
 * puts on the DOM only in the desktop-fixed xterm case (never for a handheld
 * session or a PETSCII canvas session, where the terminal must still fill
 * the viewport and is centred inside itself), and the CSS source that turns
 * that class + the new token into an actual centred, contrasting page.
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

  // The page's frame is a shrink-wrap, and a PETSCII canvas cannot be
  // shrink-wrapped: it takes its scale FROM the box it is handed, so a
  // fit-content frame around it is a fixed point (measured in a 1280x800
  // page: a 736x496 frame around the canvas's current 704x464 backing store,
  // with no way to grow into the 960x644 there was room for). That session is
  // centred by BBSTerminal's own fixed-mode wrapper instead - see
  // "a PETSCII canvas session is framed and centred on a desktop like an
  // xterm session" in components/__tests__/bbsterminal-petscii-p-session-mount.
  // The reason recorded here until 2026-09-03 - "it already centres itself" -
  // was not true: that wrapper's centring lived in Tailwind classes this app
  // does not ship, and the PETSCII screen sat in the top-left corner.
  it('does not shrink-wrap a PETSCII canvas session - the canvas is sized by the box, not the other way round', () => {
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

/**
 * The terminal centres its own box in whatever host it is given (that is what
 * puts a PETSCII canvas on the page ground instead of in the top-left corner,
 * 2026-09-03). A phone must opt out: `terminal-page--with-input` reserves the
 * bottom 260px for the on-screen keyboard, and the terminal belongs at the TOP
 * of the strip that leaves. Measured on a 390x844 phone replica of the box
 * model: centring drops the box 166px (xterm) / 158px (canvas) into the middle
 * of that area, opening a gap under the notch.
 */
describe('a handheld session keeps the terminal at the top of the reserved area', () => {
  it('vetoes the terminal\'s own centring on a phone, and allows it on a desktop', () => {
    setPhoneViewport();
    render(<TerminalPage />);
    expect(harness.props?.centerInHost).toBe(false);

    cleanup();

    setDesktopViewport();
    render(<TerminalPage />);
    expect(harness.props?.centerInHost).toBe(true);
  });

  it('withdraws the centring when a desktop session drops to handheld sizing', () => {
    setDesktopViewport();
    render(<TerminalPage />);
    expect(harness.props?.centerInHost).toBe(true);

    act(() => {
      setPhoneViewport();
      window.dispatchEvent(new Event('resize'));
    });

    expect(harness.props?.centerInHost).toBe(false);
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

  // Black since 2026-09-03, on the sysop's instruction: the page and the
  // terminal are one black field, so the framed 80x25 box no longer reads as
  // a lit rectangle on a lighter card. Asserted by CHANNEL VALUE, not by
  // spelling, so #000 and #000000 both pass and a stray hue does not.
  it('defines the page-ground token as black, the same black as the terminal theme', () => {
    const indexCss = read('../../index.css');
    const matches = indexCss.match(/--bbs-page-bg:\s*(#[0-9a-fA-F]{3,6})/);

    expect(matches).toBeTruthy();
    const [, hex] = matches!;
    const value = hex.length === 4
      ? hex.slice(1).split('').map(c => parseInt(c + c, 16))
      : [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map(c => parseInt(c, 16));
    expect(value).toEqual([0, 0, 0]);
  });

  // Still the point of the token now that its value is black: a hardcoded
  // #000 in body or .app-shell would look identical today and would have to
  // be hunted down the day the sysop wants the lighter ground back.
  it('paints the page background (not the terminal) from that token, not a hardcoded hex', () => {
    const indexCss = read('../../index.css');
    const appCss = read('../../App.css');

    expect(indexCss).toMatch(/body\s*{[^}]*background:\s*var\(--bbs-page-bg\)/s);
    expect(appCss).toMatch(/\.app-shell\s*{[^}]*background:\s*var\(--bbs-page-bg\)/s);
  });
});
