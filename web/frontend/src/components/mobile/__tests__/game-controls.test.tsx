/**
 * Regression tests for the mobile game controls.
 *
 * Symptom they lock down: on a phone the only on-screen input was the generic
 * BBS keyboard, which has no way to hold a key, so GRANDMASTER and ARKANOID
 * were unplayable. The pad must (a) appear only for those doors and (b) drive
 * the game-mode key-down/key-up path so held keys work like a real keyboard.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MobileGameControls } from '../MobileGameControls';
import { findGameControlLayout, layoutControls, GAME_CONTROL_LAYOUTS } from '../game-controls';

afterEach(cleanup);

/**
 * jsdom has no TouchEvent constructor, so build the minimum the component
 * reads: changedTouches entries with an identifier and a target.
 */
function fireTouch(type: 'touchstart' | 'touchend' | 'touchcancel', touches: { identifier: number; target: Element }[]): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'changedTouches', { value: touches });
  touches[0].target.dispatchEvent(event);
}

function button(label: string): HTMLElement {
  return screen.getByRole('button', { name: label });
}

describe('findGameControlLayout', () => {
  it('matches the door ids the backend sends for GMASTER and ARKANOID', () => {
    // door:load-client sends the BBS command name lower-cased.
    expect(findGameControlLayout('gmaster')?.title).toBe('GRANDMASTER');
    expect(findGameControlLayout('arkanoid')?.title).toBe('ARKANOID');
  });

  it('leaves every other door on the generic keyboard', () => {
    expect(findGameControlLayout('doorman')).toBeNull();
    expect(findGameControlLayout('')).toBeNull();
    expect(findGameControlLayout(null)).toBeNull();
    expect(findGameControlLayout(undefined)).toBeNull();
  });

  it('is case- and punctuation-insensitive', () => {
    expect(findGameControlLayout('GMASTER')).toBe(GAME_CONTROL_LAYOUTS.gmaster);
    expect(findGameControlLayout('Arkanoid')).toBe(GAME_CONTROL_LAYOUTS.arkanoid);
  });
});

describe('GRANDMASTER key bindings', () => {
  const byId = Object.fromEntries(
    layoutControls(GAME_CONTROL_LAYOUTS.gmaster).map(c => [c.id, c]),
  );

  // Names as Doors/grandmaster/input/handler.ts maps them:
  // ArrowLeft -> left, ArrowRight -> right, ArrowDown -> down, ArrowUp -> up,
  // single chars lower-cased.
  it('sends the keys DEFAULT_KEYS expects', () => {
    expect(byId.left.key).toBe('ArrowLeft');
    expect(byId.right.key).toBe('ArrowRight');
    expect(byId['soft-drop'].key).toBe('ArrowDown');
    expect(byId['hard-drop'].key).toBe('ArrowUp');
    expect(byId['rotate-cw'].key).toBe('x');
    expect(byId['rotate-ccw'].key).toBe('z');
    expect(byId.hold.key).toBe('c');
  });

  it('uses bindings TETRINET_KEYS also accepts, except hard drop', () => {
    // TETRINET_KEYS: left/right/softDrop arrows, rotateCW ['up','x'],
    // rotateCCW ['z',...], hold ['h','c'] — all shared. hardDrop is ['space']
    // there and ['up',...] here, and the frontend cannot tell the modes apart.
    const shared = ['left', 'right', 'soft-drop', 'rotate-cw', 'rotate-ccw', 'hold'];
    for (const id of shared) expect(byId[id]).toBeDefined();
    expect(byId['hard-drop'].key).toBe('ArrowUp');
  });
});

describe('ARKANOID key bindings', () => {
  const byId = Object.fromEntries(
    layoutControls(GAME_CONTROL_LAYOUTS.arkanoid).map(c => [c.id, c]),
  );

  it('sends the keys the door lower-cases into arrowleft/arrowright/space', () => {
    expect(byId.left.key).toBe('ArrowLeft');
    expect(byId.right.key).toBe('ArrowRight');
    expect(byId.launch.key).toBe(' ');
    expect(byId.launch.code).toBe('Space');
  });
});

describe('MobileGameControls', () => {
  it('sends key-down on press and key-up on release', () => {
    const onPress = vi.fn();
    const onRelease = vi.fn();
    render(
      <MobileGameControls layout={GAME_CONTROL_LAYOUTS.gmaster} onPress={onPress} onRelease={onRelease} />,
    );

    const left = button('Left');
    fireTouch('touchstart', [{ identifier: 1, target: left }]);

    expect(onPress).toHaveBeenCalledWith('ArrowLeft', 'ArrowLeft');
    expect(onRelease).not.toHaveBeenCalled();

    fireTouch('touchend', [{ identifier: 1, target: left }]);

    expect(onRelease).toHaveBeenCalledWith('ArrowLeft', 'ArrowLeft');
  });

  it('holds a key down for the whole press instead of tapping', () => {
    const onPress = vi.fn();
    const onRelease = vi.fn();
    render(
      <MobileGameControls layout={GAME_CONTROL_LAYOUTS.arkanoid} onPress={onPress} onRelease={onRelease} />,
    );

    const left = button('Left');
    fireTouch('touchstart', [{ identifier: 3, target: left }]);
    // A repeated touchstart for the same finger must not re-send key-down.
    fireTouch('touchstart', [{ identifier: 3, target: left }]);

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onRelease).not.toHaveBeenCalled();
  });

  it('supports two controls held at once', () => {
    const onPress = vi.fn();
    const onRelease = vi.fn();
    render(
      <MobileGameControls layout={GAME_CONTROL_LAYOUTS.gmaster} onPress={onPress} onRelease={onRelease} />,
    );

    fireTouch('touchstart', [{ identifier: 1, target: button('Left') }]);
    fireTouch('touchstart', [{ identifier: 2, target: button('Rotate clockwise') }]);

    expect(onPress).toHaveBeenNthCalledWith(1, 'ArrowLeft', 'ArrowLeft');
    expect(onPress).toHaveBeenNthCalledWith(2, 'x', 'KeyX');

    fireTouch('touchend', [{ identifier: 2, target: button('Rotate clockwise') }]);

    expect(onRelease).toHaveBeenCalledTimes(1);
    expect(onRelease).toHaveBeenCalledWith('x', 'KeyX');
  });

  it('releases a still-held key when the pad unmounts with the door', () => {
    const onPress = vi.fn();
    const onRelease = vi.fn();
    const view = render(
      <MobileGameControls layout={GAME_CONTROL_LAYOUTS.arkanoid} onPress={onPress} onRelease={onRelease} />,
    );

    fireTouch('touchstart', [{ identifier: 7, target: button('Right') }]);
    expect(onRelease).not.toHaveBeenCalled();

    view.unmount();

    expect(onRelease).toHaveBeenCalledWith('ArrowRight', 'ArrowRight');
  });

  it('names every control in full words for screen readers', () => {
    render(
      <MobileGameControls layout={GAME_CONTROL_LAYOUTS.gmaster} onPress={vi.fn()} onRelease={vi.fn()} />,
    );

    expect(button('Rotate clockwise')).toBeTruthy();
    expect(button('Rotate counter-clockwise')).toBeTruthy();
    expect(button('Hard Drop')).toBeTruthy();
    expect(button('Hold')).toBeTruthy();
  });
});
