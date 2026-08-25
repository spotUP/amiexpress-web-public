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

describe('strokes that are not perfectly straight', () => {
  // Reported live: "when I swipe down it moves to the sides too easily as I
  // don't swipe totally straight". Nobody swipes straight; the stroke has to
  // commit to an axis and ignore the other, which is what makes the iOS game
  // feel tight.
  it('a wobbly downward swipe never moves the piece sideways', () => {
    const s = stroke();
    const emitted = [
      ...trackMove(s, { x: 106, y: 100 + rowPx, t: 30 }),
      ...trackMove(s, { x: 92, y: 100 + rowPx * 2, t: 60 }),
      ...trackMove(s, { x: 118, y: 100 + rowPx * 3, t: 90 }),
    ];

    expect(s.axis).toBe('vertical');
    expect(emitted.every(k => k.key === GESTURE_KEYS.down.key)).toBe(true);
    expect(emitted.length).toBeGreaterThan(0);
  });

  it('a wobbly sideways drag never drops the piece', () => {
    const s = stroke();
    const emitted = [
      ...trackMove(s, { x: 100 + columnPx, y: 108, t: 30 }),
      ...trackMove(s, { x: 100 + columnPx * 2, y: 94, t: 60 }),
      ...trackMove(s, { x: 100 + columnPx * 3, y: 112, t: 90 }),
    ];

    expect(s.axis).toBe('horizontal');
    expect(emitted.some(k => k.key === GESTURE_KEYS.down.key)).toBe(false);
  });

  it('commits to whichever way the thumb actually went', () => {
    const down = stroke();
    trackMove(down, { x: 104, y: 130, t: 20 });
    const across = stroke();
    trackMove(across, { x: 130, y: 104, t: 20 });

    expect(down.axis).toBe('vertical');
    expect(across.axis).toBe('horizontal');
  });
});

describe('hard drop reliability', () => {
  // Reported live: "I never managed to do a hard drop by swiping down".
  // Speed was judged over the WHOLE stroke, so the usual way of playing -
  // drag down a bit, then flick - was always too slow on average.
  it('hard drops when a slow drag ends in a flick', () => {
    const s = stroke();
    trackMove(s, { x: 100, y: 140, t: 400 });   // slow drag down
    trackMove(s, { x: 100, y: 160, t: 500 });

    trackMove(s, { x: 100, y: 210, t: 540 });   // then a flick
    const key = endStroke(s, { x: 100, y: 240, t: 560 });

    expect(key).toEqual(GESTURE_KEYS.hardDrop);
  });

  it('hard drops on a flick that is not quite vertical', () => {
    const s = stroke();
    trackMove(s, { x: 108, y: 170, t: 50 });

    expect(endStroke(s, { x: 116, y: 215, t: 80 })).toEqual(GESTURE_KEYS.hardDrop);
  });

  it('still refuses to hard drop on a slow settle', () => {
    const s = stroke();
    for (let i = 1; i <= 8; i++) trackMove(s, { x: 100, y: 100 + rowPx * i, t: i * 250 });

    expect(endStroke(s, { x: 100, y: 100 + rowPx * 8, t: 2100 })).toBeNull();
  });

  it('holds on a flick up after the piece has been dragged down', () => {
    const s = stroke();
    trackMove(s, { x: 100, y: 180, t: 300 });

    expect(endStroke(s, { x: 100, y: 120, t: 360 })).toEqual(GESTURE_KEYS.hold);
  });
});
