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
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';

const harness = vi.hoisted(() => ({
  props: null as Record<string, any> | null,
  pressGameKey: vi.fn(),
  releaseGameKey: vi.fn(),
  injectInput: vi.fn(),
  sendMouse: vi.fn(),
}));

vi.mock('@amiexpress/terminal', () => ({
  BBSTerminal: React.forwardRef((props: Record<string, any>, ref: React.Ref<unknown>) => {
    harness.props = props;
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
  it('turns a thumb stroke into proportional terminal columns on the mouse path', () => {
    render(<TerminalPage />);
    startDoor('arkanoid');
    const pad = strip();

    // Left edge -> lowest column; the door reads it as column 1.
    fireTouch(pad, 'touchstart', [{ identifier: 1, clientX: STRIP_LEFT }]);
    expect(harness.sendMouse).toHaveBeenLastCalledWith('mouse-click', { x: 0, y: PADDLE_ROW });

    // Right edge -> highest column; column 80 on the standard grid.
    fireTouch(pad, 'touchmove', [{ identifier: 1, clientX: STRIP_LEFT + STRIP_WIDTH }]);
    expect(harness.sendMouse).toHaveBeenLastCalledWith('mouse-drag', { x: 79, y: PADDLE_ROW });

    // Middle -> middle. Absolute, not a nudge.
    fireTouch(pad, 'touchmove', [{ identifier: 1, clientX: STRIP_LEFT + STRIP_WIDTH / 2 }]);
    expect(harness.sendMouse).toHaveBeenLastCalledWith('mouse-drag', { x: 40, y: PADDLE_ROW });

    fireTouch(pad, 'touchend', [{ identifier: 1, clientX: STRIP_LEFT + STRIP_WIDTH / 4 }]);
    expect(harness.sendMouse).toHaveBeenLastCalledWith('mouse-up', { x: 20, y: PADDLE_ROW });

    // Never the key path: arrow keys would nudge the paddle stepwise.
    expect(harness.pressGameKey).not.toHaveBeenCalled();
  });

  it('sends a click when the thumb lands, so a waiting ball launches', () => {
    render(<TerminalPage />);
    startDoor('arkanoid');
    const pad = strip();

    fireTouch(pad, 'touchstart', [{ identifier: 2, clientX: STRIP_LEFT + STRIP_WIDTH / 2 }]);

    expect(harness.sendMouse).toHaveBeenCalledTimes(1);
    expect(harness.sendMouse).toHaveBeenCalledWith('mouse-click', { x: 40, y: PADDLE_ROW });
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
