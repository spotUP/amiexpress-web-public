/**
 * Regression tests for the mobile game controls.
 *
 * Symptom they lock down: on a phone the only on-screen input was the generic
 * BBS keyboard, which has no way to hold a key, so GRANDMASTER and ARKANOID
 * were unplayable. GRANDMASTER gets a button pad that drives the game-mode
 * key-down/key-up path so held keys work like a real keyboard; ARKANOID is a
 * spinner game and gets a trackpad instead (see arkanoid-controls.test.tsx).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MobileGameControls } from '../MobileGameControls';
import {
  findGameControlLayout,
  layoutControls,
  trackpadColumn,
  GAME_CONTROL_LAYOUTS,
  type GameControlPad,
  type GameControlSpinner,
} from '../game-controls';

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

const gmaster = GAME_CONTROL_LAYOUTS.gmaster as GameControlPad;
const arkanoid = GAME_CONTROL_LAYOUTS.arkanoid as GameControlSpinner;

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

  it('gives GRANDMASTER a button pad and ARKANOID a spinner', () => {
    // Arkanoid steers its paddle from absolute pointer X - buttons would be
    // the wrong control entirely, so the two doors must not share a shape.
    expect(gmaster.kind).toBe('pad');
    expect(arkanoid.kind).toBe('spinner');
  });
});

describe('GRANDMASTER key bindings', () => {
  const byId = Object.fromEntries(layoutControls(gmaster).map(c => [c.id, c]));

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

describe('GRANDMASTER thumb assignment', () => {
  // Pinned because it is invisible to every other test: the bindings are
  // identical whichever thumb they sit under, so a silent flip back would
  // otherwise go unnoticed until someone tried to play.
  it('puts rotation under the left thumb and movement under the right', () => {
    expect(gmaster.left.keys.map(c => c.id)).toEqual(['rotate-ccw', 'rotate-cw', 'soft-drop', 'hold']);
    expect(gmaster.right.keys.map(c => c.id)).toEqual(['left', 'right', 'hard-drop']);
    expect(gmaster.right.role).toBe('movement');
  });

  it('gives Hard Drop the wide slot and demotes Soft Drop', () => {
    // Hard Drop is used on nearly every piece; Soft Drop rarely. The wide
    // slot is the third-and-last key of a cluster (see the CSS).
    const movement = gmaster.right.keys;
    expect(movement).toHaveLength(3);
    expect(movement[2].id).toBe('hard-drop');
    expect(gmaster.left.keys.map(c => c.id)).toContain('soft-drop');
  });

  it('renders the left cluster before the right one', () => {
    const { container } = render(
      <MobileGameControls layout={gmaster} onPress={vi.fn()} onRelease={vi.fn()} />,
    );

    const sides = Array.from(container.querySelectorAll('[data-cluster-side]'))
      .map(el => el.getAttribute('data-cluster-side'));
    expect(sides).toEqual(['left', 'right']);

    expect(button('Left').closest('[data-cluster-side]')?.getAttribute('data-cluster-side')).toBe('right');
    expect(button('Right').closest('[data-cluster-side]')?.getAttribute('data-cluster-side')).toBe('right');
    expect(button('Hard Drop').closest('[data-cluster-side]')?.getAttribute('data-cluster-side')).toBe('right');
    expect(button('Rotate clockwise').closest('[data-cluster-side]')?.getAttribute('data-cluster-side')).toBe('left');
    expect(button('Rotate counter-clockwise').closest('[data-cluster-side]')?.getAttribute('data-cluster-side')).toBe('left');
    expect(button('Soft Drop').closest('[data-cluster-side]')?.getAttribute('data-cluster-side')).toBe('left');
    expect(button('Hold').closest('[data-cluster-side]')?.getAttribute('data-cluster-side')).toBe('left');
  });
});

describe('ARKANOID layout', () => {
  it('offers Pause on p, not Space', () => {
    // Space pauses in the door only when no ball is waiting to be launched -
    // it would launch the ball instead about half the time. 'p' always pauses.
    const pause = arkanoid.keys.find(c => c.id === 'pause');
    expect(pause?.key).toBe('p');
    expect(pause?.code).toBe('KeyP');
  });

  it('offers no arrow-key paddle buttons', () => {
    // Arrow keys nudge the paddle a step at a time (movePaddle), which throws
    // away the spinner feel. The trackpad replaced them.
    const keys = arkanoid.keys.map(c => c.key);
    expect(keys).not.toContain('ArrowLeft');
    expect(keys).not.toContain('ArrowRight');
  });

  it('reports a row inside the play area, clear of the menu rows', () => {
    // Doors/arkanoid/client.ts: PADDLE_Y is 20 in the door's 1-indexed space
    // and the door adds 1 to what the frontend sends; the menu hit-test
    // covers 1-indexed rows 10..14, which must not be hit by a stray hover.
    expect(arkanoid.row).toBe(19);
    expect(arkanoid.row + 1).toBeGreaterThan(14);
  });
});

describe('trackpadColumn', () => {
  it('maps the strip proportionally onto the whole grid', () => {
    expect(trackpadColumn(0, 80)).toBe(0);
    expect(trackpadColumn(1, 80)).toBe(79);
    expect(trackpadColumn(0.25, 80)).toBe(20);
    expect(trackpadColumn(0.75, 80)).toBe(59);
  });

  it('increases monotonically across the strip', () => {
    const columns = [0, 0.1, 0.2, 0.4, 0.6, 0.8, 1].map(f => trackpadColumn(f, 80));
    for (let i = 1; i < columns.length; i++) {
      expect(columns[i]).toBeGreaterThan(columns[i - 1]);
    }
  });

  it('honours a terminal that is not 80 columns wide', () => {
    expect(trackpadColumn(1, 132)).toBe(131);
    expect(trackpadColumn(0.5, 40)).toBe(20);
  });

  it('clamps a thumb that slid off either end of the strip', () => {
    expect(trackpadColumn(-0.4, 80)).toBe(0);
    expect(trackpadColumn(1.7, 80)).toBe(79);
    expect(trackpadColumn(Number.NaN, 80)).toBe(0);
  });
});

describe('MobileGameControls', () => {
  it('sends key-down on press and key-up on release', () => {
    const onPress = vi.fn();
    const onRelease = vi.fn();
    render(<MobileGameControls layout={gmaster} onPress={onPress} onRelease={onRelease} />);

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
    render(<MobileGameControls layout={gmaster} onPress={onPress} onRelease={onRelease} />);

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
    render(<MobileGameControls layout={gmaster} onPress={onPress} onRelease={onRelease} />);

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
    const view = render(<MobileGameControls layout={gmaster} onPress={onPress} onRelease={onRelease} />);

    fireTouch('touchstart', [{ identifier: 7, target: button('Right') }]);
    expect(onRelease).not.toHaveBeenCalled();

    view.unmount();

    expect(onRelease).toHaveBeenCalledWith('ArrowRight', 'ArrowRight');
  });

  it('names every control in full words for screen readers', () => {
    render(<MobileGameControls layout={gmaster} onPress={vi.fn()} onRelease={vi.fn()} />);

    expect(button('Rotate clockwise')).toBeTruthy();
    expect(button('Rotate counter-clockwise')).toBeTruthy();
    expect(button('Hard Drop')).toBeTruthy();
    expect(button('Hold')).toBeTruthy();
  });
});
