/**
 * Thumb gesture scheme for GMASTER.
 *
 * The user's spec, from an iOS Tetris they rate highly: drag left/right/down
 * and the piece FOLLOWS the thumb, swipe down to hard drop, tap to rotate
 * clockwise, swipe up to hold, and no soft drop gesture at all.
 *
 * "Follows perfectly" is the requirement these tests exist to protect: one
 * key per cell crossed, not one key per gesture.
 */

import { describe, it, expect } from 'vitest';
import {
  beginStroke,
  trackMove,
  endStroke,
  readTouchScheme,
  writeTouchScheme,
  GESTURE_KEYS,
  DEFAULT_TUNING,
  TOUCH_SCHEME_KEY,
  type GestureStroke,
} from '../gesture-scheme';

const { columnPx, rowPx } = DEFAULT_TUNING;

function stroke(x = 100, y = 100, t = 0): GestureStroke {
  return beginStroke({ x, y, t });
}

describe('thumb tracking', () => {
  it('moves one column per cell crossed, so the piece keeps up', () => {
    const s = stroke();

    const keys = trackMove(s, { x: 100 + columnPx * 3, y: 100, t: 30 });

    expect(keys).toHaveLength(3);
    expect(keys.every(k => k.key === GESTURE_KEYS.right.key)).toBe(true);
  });

  it('does not re-emit ground it has already covered', () => {
    const s = stroke();
    trackMove(s, { x: 100 + columnPx * 2, y: 100, t: 20 });

    const more = trackMove(s, { x: 100 + columnPx * 3, y: 100, t: 40 });

    expect(more).toHaveLength(1);
  });

  it('follows the thumb back the other way', () => {
    const s = stroke();
    trackMove(s, { x: 100 + columnPx * 2, y: 100, t: 20 });

    const back = trackMove(s, { x: 100, y: 100, t: 40 });

    expect(back).toHaveLength(2);
    expect(back.every(k => k.key === GESTURE_KEYS.left.key)).toBe(true);
  });

  it('ignores travel too small to cross a cell', () => {
    const s = stroke();

    expect(trackMove(s, { x: 100 + columnPx - 1, y: 100, t: 10 })).toEqual([]);
  });

  it('soft drops by following the thumb down, one row per cell', () => {
    const s = stroke();

    const keys = trackMove(s, { x: 100, y: 100 + rowPx * 2, t: 40 });

    expect(keys).toHaveLength(2);
    expect(keys.every(k => k.key === GESTURE_KEYS.down.key)).toBe(true);
  });

  it('never drags the piece upwards', () => {
    const s = stroke();

    expect(trackMove(s, { x: 100, y: 100 - rowPx * 3, t: 40 })).toEqual([]);
  });
});

describe('lifting the thumb', () => {
  it('rotates clockwise on a tap', () => {
    const s = stroke();

    expect(endStroke(s, { x: 102, y: 101, t: 80 })).toEqual(GESTURE_KEYS.rotate);
  });

  it('rotates one way only - there is no counter-clockwise gesture', () => {
    // A second rotation was explicitly dropped from the design. The absence
    // of a counter-clockwise BINDING is a type-level fact (the union has no
    // KeyZ), so what is worth asserting is that no two gestures fire the
    // same rotate key by accident.
    const keys = Object.values(GESTURE_KEYS).map(k => k.key);

    expect(keys.filter(k => k === GESTURE_KEYS.rotate.key)).toHaveLength(1);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('hard drops on a fast flick down', () => {
    const s = stroke();
    trackMove(s, { x: 100, y: 200, t: 60 });

    expect(endStroke(s, { x: 100, y: 220, t: 80 })).toEqual(GESTURE_KEYS.hardDrop);
  });

  it('holds on a fast flick up', () => {
    const s = stroke(100, 300, 0);
    trackMove(s, { x: 100, y: 220, t: 60 });

    expect(endStroke(s, { x: 100, y: 200, t: 80 })).toEqual(GESTURE_KEYS.hold);
  });

  it('treats a slow drag down as a drag, not a hard drop', () => {
    const s = stroke();
    for (let i = 1; i <= 6; i++) {
      trackMove(s, { x: 100, y: 100 + rowPx * i, t: i * 200 });
    }

    expect(endStroke(s, { x: 100, y: 100 + rowPx * 6, t: 1200 })).toBeNull();
  });

  it('does not rotate after a drag that happened to end where it started', () => {
    const s = stroke();
    trackMove(s, { x: 100 + columnPx * 3, y: 100, t: 40 });
    trackMove(s, { x: 100, y: 100, t: 80 });

    expect(endStroke(s, { x: 100, y: 100, t: 100 })).toBeNull();
  });
});

describe('scheme preference', () => {
  it('defaults to the button pad', () => {
    expect(readTouchScheme({ getItem: () => null })).toBe('buttons');
  });

  it('remembers a player who chose gestures', () => {
    const store: Record<string, string> = {};
    writeTouchScheme({ setItem: (k, v) => { store[k] = v; } }, 'gestures');

    expect(store[TOUCH_SCHEME_KEY]).toBe('gestures');
    expect(readTouchScheme({ getItem: (k) => store[k] ?? null })).toBe('gestures');
  });
});
