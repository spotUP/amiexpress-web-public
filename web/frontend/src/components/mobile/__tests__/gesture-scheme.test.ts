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
  menuGesture,
  MENU_KEYS,
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

describe('guards reported live on 2026-08-25', () => {
  // "it often rotates when I swipe down to hard drop, and it still moves
  // sideways easily when swiping down - we need better guards for this."

  it('a diagonal flick down does not lock sideways', () => {
    // 13 across and 11 down used to lock HORIZONTAL on the first sample and
    // the rest of the swipe then slid the piece across the board.
    const s = stroke();

    trackMove(s, { x: 113, y: 111, t: 16 });

    expect(s.axis).not.toBe('horizontal');
  });

  it('holds off until the stroke says which way it is going', () => {
    const s = stroke();

    trackMove(s, { x: 112, y: 112, t: 16 });
    expect(s.axis).toBe('none');

    trackMove(s, { x: 114, y: 150, t: 40 });
    expect(s.axis).toBe('vertical');
  });

  it('emits nothing sideways while the stroke is still undecided', () => {
    const s = stroke();

    const keys = trackMove(s, { x: 113, y: 111, t: 16 });

    expect(keys).toEqual([]);
  });

  it('hard drops a fast diagonal flick instead of rotating', () => {
    const s = stroke();
    trackMove(s, { x: 108, y: 160, t: 40 });

    expect(endStroke(s, { x: 118, y: 205, t: 70 })).toEqual(GESTURE_KEYS.hardDrop);
  });

  it('does not rotate on a slow press that never moved', () => {
    // A thumb resting on the board and lifting is not a rotate request.
    const s = stroke();

    expect(endStroke(s, { x: 103, y: 104, t: 600 })).toBeNull();
  });

  it('still rotates on a real tap', () => {
    const s = stroke();

    expect(endStroke(s, { x: 102, y: 101, t: 90 })).toEqual(GESTURE_KEYS.rotate);
  });

  it('does not rotate once the stroke has committed to a direction', () => {
    const s = stroke();
    trackMove(s, { x: 100, y: 140, t: 40 });

    // Thumb wanders back to where it started and lifts.
    expect(endStroke(s, { x: 100, y: 100, t: 700 })).toBeNull();
  });
});

describe('menu gestures', () => {
  // Reported live: "I can't navigate the menu in Arkanoid with the phone -
  // make the swipes control the menus and tap as enter."
  it('moves the selection down on a downward swipe', () => {
    const s = stroke();

    expect(menuGesture(s, { x: 100, y: 180, t: 120 })).toEqual(MENU_KEYS.down);
  });

  it('moves the selection up on an upward swipe', () => {
    const s = stroke();

    expect(menuGesture(s, { x: 100, y: 20, t: 120 })).toEqual(MENU_KEYS.up);
  });

  it('moves sideways for horizontal swipes, for menus that use them', () => {
    expect(menuGesture(stroke(), { x: 200, y: 100, t: 120 })).toEqual(MENU_KEYS.right);
    expect(menuGesture(stroke(), { x: 20, y: 100, t: 120 })).toEqual(MENU_KEYS.left);
  });

  it('confirms on a tap', () => {
    expect(menuGesture(stroke(), { x: 102, y: 103, t: 90 })).toEqual(MENU_KEYS.enter);
  });

  it('takes one step per swipe rather than scrolling away', () => {
    // A long swipe is still ONE menu step: List widgets move one item per key
    // and a flick that jumped ten items would be unusable.
    const long = menuGesture(stroke(), { x: 100, y: 600, t: 200 });

    expect(long).toEqual(MENU_KEYS.down);
  });

  it('ignores a rested thumb, so nothing is chosen by accident', () => {
    expect(menuGesture(stroke(), { x: 101, y: 101, t: 900 })).toBeNull();
  });
});

describe('speed decides the drop, not distance', () => {
  /** Play a stroke through the tracker and return what lifting the thumb means. */
  function swipeDown(distance: number, ms: number) {
    const stroke = beginStroke({ x: 100, y: 100, t: 0 });
    const steps = 4;
    for (let i = 1; i <= steps; i++) {
      trackMove(stroke, { x: 100, y: 100 + (distance * i) / steps, t: (ms * i) / steps });
    }
    return endStroke(stroke, { x: 100, y: 100 + distance, t: ms });
  }

  it('hard drops a SHORT fast flick', () => {
    // "Even short swipes down should register as hard drops." 20px in 40ms
    // used to fall through the 38px distance gate and soft drop instead.
    expect(swipeDown(20, 40)).toEqual(GESTURE_KEYS.hardDrop);
  });

  it('hard drops a long fast flick', () => {
    expect(swipeDown(90, 120)).toEqual(GESTURE_KEYS.hardDrop);
  });

  it('does NOT hard drop a slow drag', () => {
    // "Slow swipes down should soft drop" - and a slow drag has already been
    // emitting one soft drop per row on the way down.
    expect(swipeDown(90, 900)).toBeNull();
  });

  it('soft drops on the way down', () => {
    const stroke = beginStroke({ x: 100, y: 100, t: 0 });
    const keys = [
      ...trackMove(stroke, { x: 100, y: 130, t: 200 }),
      ...trackMove(stroke, { x: 100, y: 200, t: 600 }),
    ];

    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every(k => k.code === GESTURE_KEYS.down.code)).toBe(true);
  });

  it('reads a twitch on lift-off as the tap it is', () => {
    // Fast but barely any travel, and never committed to an axis: that is a
    // tap rolling off the glass, so it rotates rather than hard dropping.
    expect(swipeDown(6, 10)).toEqual(GESTURE_KEYS.rotate);
  });
});

describe('a hold still has to travel', () => {
  function swipeUp(distance: number, ms: number) {
    const stroke = beginStroke({ x: 100, y: 300, t: 0 });
    for (let i = 1; i <= 4; i++) {
      trackMove(stroke, { x: 100, y: 300 - (distance * i) / 4, t: (ms * i) / 4 });
    }
    return endStroke(stroke, { x: 100, y: 300 - distance, t: ms });
  }

  it('holds on a long fast flick up', () => {
    expect(swipeUp(90, 120)).toEqual(GESTURE_KEYS.hold);
  });

  it('does not hold on a short flick up', () => {
    // An accidental hold costs the player their piece, so up keeps its
    // distance requirement even though down no longer has one.
    expect(swipeUp(20, 40)).toBeNull();
  });
});

describe('a down swipe stays down', () => {
  it('does not move the piece sideways on a slightly diagonal stroke', () => {
    const stroke = beginStroke({ x: 100, y: 100, t: 0 });
    // 30px down, 16px across - a normal thumb arc, which used to lock
    // horizontal and slide the piece.
    const keys = [
      ...trackMove(stroke, { x: 108, y: 115, t: 40 }),
      ...trackMove(stroke, { x: 116, y: 130, t: 80 }),
    ];

    expect(keys.every(k => k.code === GESTURE_KEYS.down.code)).toBe(true);
  });
});

describe('nudging one column', () => {
  /** Thumb travel in CSS pixels, as a drag of several samples. */
  function dragAcross(px: number) {
    const stroke = beginStroke({ x: 100, y: 300, t: 0 });
    const keys = [];
    for (let i = 1; i <= 5; i++) {
      keys.push(...trackMove(stroke, { x: 100 + (px * i) / 5, y: 300, t: i * 20 }));
    }
    return keys;
  }

  it('takes a deliberate movement, not a twitch', () => {
    // An ABSOLUTE distance, not one expressed in columnPx - the point is
    // that 24 CSS pixels, about four millimetres of thumb, is too little to
    // move a piece. Written relative to columnPx this would pass at any
    // setting and pin nothing.
    expect(dragAcross(24)).toHaveLength(0);
  });

  it('moves exactly one column for one column of travel', () => {
    expect(dragAcross(DEFAULT_TUNING.columnPx)).toHaveLength(1);
  });

  it('still tracks the thumb over a long drag', () => {
    // Less sensitive must not mean less faithful: four columns of travel is
    // still four moves, not one.
    expect(dragAcross(DEFAULT_TUNING.columnPx * 4)).toHaveLength(4);
  });

  it('asks for more than the axis lock before it moves anything', () => {
    // Otherwise the stroke commits to an axis and immediately spends that
    // same travel on a move, which is what made a small nudge overshoot.
    expect(DEFAULT_TUNING.columnPx).toBeGreaterThan(DEFAULT_TUNING.axisLockPx);
  });
});
