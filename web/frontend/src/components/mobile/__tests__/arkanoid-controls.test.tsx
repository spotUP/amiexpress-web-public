/**
 * Regression tests for the ARKANOID on-screen controls.
 *
 * Symptom they lock down: the mobile pad gave Arkanoid stepwise Left/Right
 * buttons. Arkanoid is a spinner game - the door sets
 * `paddle.x = mouseX - width/2` on every pointer event, so the paddle follows
 * the pointer's X ABSOLUTELY. Buttons nudge it a step per press instead, which
 * is a different (and much worse) game. The strip below must report the
 * thumb's position across its own width, proportionally, so the host can turn
 * it into a terminal column.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MobileArkanoidControls } from '../MobileArkanoidControls';
import { GAME_CONTROL_LAYOUTS, type GameControlSpinner } from '../game-controls';

afterEach(cleanup);

const arkanoid = GAME_CONTROL_LAYOUTS.arkanoid as GameControlSpinner;

const STRIP_LEFT = 20;
const STRIP_WIDTH = 200;

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

/** jsdom has no TouchEvent constructor - build what the component reads. */
function fireTouch(
  target: Element,
  type: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel',
  touches: { identifier: number; clientX: number }[],
): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'changedTouches', {
    value: touches.map(t => ({ ...t, target })),
  });
  target.dispatchEvent(event);
}

function renderControls() {
  const handlers = {
    onSpinner: vi.fn(),
    onLaunch: vi.fn(),
    onPress: vi.fn(),
    onRelease: vi.fn(),
  };
  render(<MobileArkanoidControls layout={arkanoid} {...handlers} />);
  return handlers;
}

describe('ARKANOID trackpad strip', () => {
  it('reports the thumb position proportionally across the strip', () => {
    const { onSpinner } = renderControls();
    const pad = strip();

    fireTouch(pad, 'touchstart', [{ identifier: 1, clientX: STRIP_LEFT }]);
    expect(onSpinner).toHaveBeenLastCalledWith('start', 0);

    fireTouch(pad, 'touchmove', [{ identifier: 1, clientX: STRIP_LEFT + STRIP_WIDTH / 2 }]);
    expect(onSpinner).toHaveBeenLastCalledWith('move', 0.5);

    fireTouch(pad, 'touchmove', [{ identifier: 1, clientX: STRIP_LEFT + STRIP_WIDTH }]);
    expect(onSpinner).toHaveBeenLastCalledWith('move', 1);

    fireTouch(pad, 'touchend', [{ identifier: 1, clientX: STRIP_LEFT + STRIP_WIDTH / 4 }]);
    expect(onSpinner).toHaveBeenLastCalledWith('end', 0.25);
  });

  it('rises monotonically as the thumb sweeps left to right', () => {
    const { onSpinner } = renderControls();
    const pad = strip();

    fireTouch(pad, 'touchstart', [{ identifier: 2, clientX: STRIP_LEFT }]);
    for (const offset of [10, 40, 90, 150, 200]) {
      fireTouch(pad, 'touchmove', [{ identifier: 2, clientX: STRIP_LEFT + offset }]);
    }

    const fractions = onSpinner.mock.calls.map(call => call[1] as number);
    for (let i = 1; i < fractions.length; i++) {
      expect(fractions[i]).toBeGreaterThan(fractions[i - 1]);
    }
  });

  it('clamps a thumb that slid past either end', () => {
    const { onSpinner } = renderControls();
    const pad = strip();

    fireTouch(pad, 'touchstart', [{ identifier: 3, clientX: STRIP_LEFT - 500 }]);
    expect(onSpinner).toHaveBeenLastCalledWith('start', 0);

    fireTouch(pad, 'touchmove', [{ identifier: 3, clientX: STRIP_LEFT + STRIP_WIDTH + 500 }]);
    expect(onSpinner).toHaveBeenLastCalledWith('move', 1);
  });

  it('keeps the first finger in charge when a second one lands', () => {
    // The other thumb is on Launch - it must not hijack the paddle.
    const { onSpinner } = renderControls();
    const pad = strip();

    fireTouch(pad, 'touchstart', [{ identifier: 4, clientX: STRIP_LEFT }]);
    fireTouch(pad, 'touchstart', [{ identifier: 5, clientX: STRIP_LEFT + STRIP_WIDTH }]);

    expect(onSpinner).toHaveBeenCalledTimes(1);

    fireTouch(pad, 'touchmove', [{ identifier: 5, clientX: STRIP_LEFT + STRIP_WIDTH }]);
    expect(onSpinner).toHaveBeenCalledTimes(1);

    fireTouch(pad, 'touchmove', [{ identifier: 4, clientX: STRIP_LEFT + STRIP_WIDTH / 2 }]);
    expect(onSpinner).toHaveBeenLastCalledWith('move', 0.5);
  });

  it('ignores movement once the stroke ended', () => {
    const { onSpinner } = renderControls();
    const pad = strip();

    fireTouch(pad, 'touchstart', [{ identifier: 6, clientX: STRIP_LEFT }]);
    fireTouch(pad, 'touchend', [{ identifier: 6, clientX: STRIP_LEFT }]);
    onSpinner.mockClear();

    fireTouch(pad, 'touchmove', [{ identifier: 6, clientX: STRIP_LEFT + STRIP_WIDTH }]);
    expect(onSpinner).not.toHaveBeenCalled();
  });
});

describe('ARKANOID buttons', () => {
  it('sends a click when Launch is tapped', () => {
    const { onLaunch, onPress } = renderControls();
    const launch = screen.getByRole('button', { name: 'Launch' });

    fireTouch(launch, 'touchstart', [{ identifier: 8, clientX: 0 }]);

    expect(onLaunch).toHaveBeenCalledTimes(1);
    // Launch is a mouse click, not a key - the door launches on mouse-click.
    expect(onPress).not.toHaveBeenCalled();
  });

  it('sends p on Pause, down then up', () => {
    const { onPress, onRelease, onLaunch } = renderControls();
    const pause = screen.getByRole('button', { name: 'Pause' });

    fireTouch(pause, 'touchstart', [{ identifier: 9, clientX: 0 }]);
    expect(onPress).toHaveBeenCalledWith('p', 'KeyP');
    expect(onRelease).not.toHaveBeenCalled();
    expect(onLaunch).not.toHaveBeenCalled();

    fireTouch(pause, 'touchend', [{ identifier: 9, clientX: 0 }]);
    expect(onRelease).toHaveBeenCalledWith('p', 'KeyP');
  });

  it('offers no stepwise paddle buttons', () => {
    renderControls();

    expect(screen.queryByRole('button', { name: 'Left' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Right' })).toBeNull();
    expect(screen.getByRole('slider', { name: 'Paddle' })).toBeTruthy();
  });
});
