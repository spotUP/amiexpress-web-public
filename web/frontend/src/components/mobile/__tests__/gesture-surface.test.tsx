/**
 * The gesture surface, and switching between the two schemes.
 *
 * The scheme itself is tested in gesture-scheme.test.ts; this covers the
 * plumbing: touches reaching the terminal's key path, and the player's
 * choice of pad-or-gestures being offered and remembered.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MobileGameGestures } from '../MobileGameGestures';
import { MobileGameControls } from '../MobileGameControls';
import { findGameControlLayout } from '../game-controls';
import { GESTURE_KEYS, DEFAULT_TUNING } from '../gesture-scheme';

function touch(id: number, x: number, y: number): Touch {
  return { identifier: id, clientX: x, clientY: y } as unknown as Touch;
}

function fire(el: Element, type: string, touches: Touch[], timeStamp = 0): void {
  const event = new Event(type, { bubbles: true, cancelable: true }) as TouchEvent & { timeStamp: number };
  Object.defineProperty(event, 'changedTouches', { value: touches });
  Object.defineProperty(event, 'touches', { value: touches });
  Object.defineProperty(event, 'timeStamp', { value: timeStamp });
  el.dispatchEvent(event);
}

describe('gesture surface', () => {
  beforeEach(() => cleanup());

  it('turns a thumb drag into one move per column crossed', () => {
    const onKey = vi.fn();
    render(<MobileGameGestures title="GRANDMASTER" onKey={onKey} onUseButtons={() => {}} />);
    const surface = screen.getByTestId('mobile-game-gestures-surface');

    fire(surface, 'touchstart', [touch(1, 100, 100)], 0);
    fire(surface, 'touchmove', [touch(1, 100 + DEFAULT_TUNING.columnPx * 2, 100)], 30);

    expect(onKey).toHaveBeenCalledTimes(2);
    expect(onKey).toHaveBeenCalledWith(GESTURE_KEYS.right.key, GESTURE_KEYS.right.code);
  });

  it('rotates on a tap', () => {
    const onKey = vi.fn();
    render(<MobileGameGestures title="GRANDMASTER" onKey={onKey} onUseButtons={() => {}} />);
    const surface = screen.getByTestId('mobile-game-gestures-surface');

    fire(surface, 'touchstart', [touch(1, 100, 100)], 0);
    fire(surface, 'touchend', [touch(1, 101, 101)], 60);

    expect(onKey).toHaveBeenCalledTimes(1);
    expect(onKey).toHaveBeenCalledWith(GESTURE_KEYS.rotate.key, GESTURE_KEYS.rotate.code);
  });

  it('hard drops on a flick down', () => {
    const onKey = vi.fn();
    render(<MobileGameGestures title="GRANDMASTER" onKey={onKey} onUseButtons={() => {}} />);
    const surface = screen.getByTestId('mobile-game-gestures-surface');

    fire(surface, 'touchstart', [touch(1, 100, 100)], 0);
    fire(surface, 'touchmove', [touch(1, 100, 200)], 40);
    onKey.mockClear();
    fire(surface, 'touchend', [touch(1, 100, 220)], 60);

    expect(onKey).toHaveBeenCalledWith(GESTURE_KEYS.hardDrop.key, GESTURE_KEYS.hardDrop.code);
  });

  it('ignores a second finger so the stroke stays honest', () => {
    const onKey = vi.fn();
    render(<MobileGameGestures title="GRANDMASTER" onKey={onKey} onUseButtons={() => {}} />);
    const surface = screen.getByTestId('mobile-game-gestures-surface');

    fire(surface, 'touchstart', [touch(1, 100, 100)], 0);
    fire(surface, 'touchstart', [touch(2, 300, 100)], 5);
    fire(surface, 'touchmove', [touch(2, 300 + DEFAULT_TUNING.columnPx * 5, 100)], 20);

    expect(onKey).not.toHaveBeenCalled();
  });

  it('offers a way back to the buttons', () => {
    const onUseButtons = vi.fn();
    render(<MobileGameGestures title="GRANDMASTER" onKey={() => {}} onUseButtons={onUseButtons} />);

    screen.getByRole('button', { name: /buttons/i }).click();

    expect(onUseButtons).toHaveBeenCalled();
  });
});

describe('scheme switch on the pad', () => {
  beforeEach(() => cleanup());

  it('offers gestures when a choice exists', () => {
    const layout = findGameControlLayout('grandmaster');
    expect(layout?.kind).toBe('pad');

    const onUseGestures = vi.fn();
    render(
      <MobileGameControls
        layout={layout as never}
        onPress={() => {}}
        onRelease={() => {}}
        onUseGestures={onUseGestures}
      />,
    );

    screen.getByRole('button', { name: /gestures/i }).click();

    expect(onUseGestures).toHaveBeenCalled();
  });

  it('shows no switch where there is no choice to make', () => {
    const layout = findGameControlLayout('grandmaster');
    render(<MobileGameControls layout={layout as never} onPress={() => {}} onRelease={() => {}} />);

    expect(screen.queryByRole('button', { name: /gestures/i })).toBeNull();
  });
});
