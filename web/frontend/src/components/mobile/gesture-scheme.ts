/**
 * Thumb gestures for GMASTER.
 *
 * The scheme is the user's, taken from an iOS Tetris they rate highly: the
 * piece FOLLOWS the thumb rather than stepping once per gesture, which is
 * what makes it feel precise. Everything here is pure so the feel can be
 * tuned against tests instead of against a phone.
 *
 *   drag left / right   piece follows, one column per cell crossed
 *   drag down           piece follows downwards, one row per cell crossed
 *   swipe down (fast)   hard drop
 *   tap                 rotate clockwise - one direction is enough
 *   swipe up            hold
 *
 * There is no soft-drop BUTTON and no counter-clockwise rotation. Dragging
 * down IS the soft drop - the piece follows the thumb exactly as it does
 * sideways - and a fast flick down is the hard drop.
 */

/** A key the terminal should be told about, as a browser name/code pair. */
export interface GestureKey {
  key: string;
  code: string;
}

export const GESTURE_KEYS = {
  left: { key: 'ArrowLeft', code: 'ArrowLeft' },
  right: { key: 'ArrowRight', code: 'ArrowRight' },
  down: { key: 'ArrowDown', code: 'ArrowDown' },
  hardDrop: { key: ' ', code: 'Space' },
  rotate: { key: 'x', code: 'KeyX' },
  hold: { key: 'c', code: 'KeyC' },
} as const;

export interface GestureTuning {
  /** Horizontal travel that moves the piece one column, in px. */
  columnPx: number;
  /** Vertical travel that drops the piece one row, in px. */
  rowPx: number;
  /** Travel below this (px) still counts as a tap, not a drag. */
  tapSlopPx: number;
  /** A flick must cover at least this much (px) to be a swipe. */
  swipeDistancePx: number;
  /** ...and be no slower than this (px per millisecond). */
  swipeVelocityPxPerMs: number;
}

export const DEFAULT_TUNING: GestureTuning = {
  columnPx: 24,
  rowPx: 28,
  tapSlopPx: 10,
  swipeDistancePx: 60,
  swipeVelocityPxPerMs: 0.5,
};

export interface GesturePoint {
  x: number;
  y: number;
  t: number;
}

/** Live state of one thumb stroke. */
export interface GestureStroke {
  start: GesturePoint;
  /** Where the last emitted step left the thumb - movement is incremental. */
  anchor: GesturePoint;
  last: GesturePoint;
  /** Set once the stroke has moved far enough to stop being a tap. */
  moved: boolean;
  /** Set once a swipe has fired, so the rest of the stroke is inert. */
  consumed: boolean;
}

export function beginStroke(point: GesturePoint): GestureStroke {
  return { start: point, anchor: point, last: point, moved: false, consumed: false };
}

/**
 * Steps to emit for a thumb that has moved to `point`.
 *
 * Returns one key per cell crossed since the last step, so a fast drag
 * across four columns emits four moves and the piece keeps up with the
 * thumb instead of lagging a gesture behind.
 */
export function trackMove(
  stroke: GestureStroke,
  point: GesturePoint,
  tuning: GestureTuning = DEFAULT_TUNING
): GestureKey[] {
  if (stroke.consumed) {
    stroke.last = point;
    return [];
  }

  const keys: GestureKey[] = [];

  const dxTotal = point.x - stroke.start.x;
  const dyTotal = point.y - stroke.start.y;
  if (Math.hypot(dxTotal, dyTotal) > tuning.tapSlopPx) {
    stroke.moved = true;
  }

  const dx = point.x - stroke.anchor.x;
  const columns = Math.trunc(dx / tuning.columnPx);
  if (columns !== 0) {
    const key = columns > 0 ? GESTURE_KEYS.right : GESTURE_KEYS.left;
    for (let i = 0; i < Math.abs(columns); i++) keys.push(key);
    stroke.anchor = { ...stroke.anchor, x: stroke.anchor.x + columns * tuning.columnPx };
  }

  // Downward travel only: dragging up is reserved for the hold swipe.
  const dy = point.y - stroke.anchor.y;
  const rows = Math.trunc(dy / tuning.rowPx);
  if (rows > 0) {
    for (let i = 0; i < rows; i++) keys.push(GESTURE_KEYS.down);
    stroke.anchor = { ...stroke.anchor, y: stroke.anchor.y + rows * tuning.rowPx };
  }

  stroke.last = point;
  return keys;
}

/**
 * What lifting the thumb means: a tap rotates, a fast flick up holds, a fast
 * flick down hard-drops, and anything else was just the drag it already was.
 */
export function endStroke(
  stroke: GestureStroke,
  point: GesturePoint,
  tuning: GestureTuning = DEFAULT_TUNING
): GestureKey | null {
  if (stroke.consumed) return null;

  const dx = point.x - stroke.start.x;
  const dy = point.y - stroke.start.y;
  const distance = Math.hypot(dx, dy);
  const elapsed = Math.max(1, point.t - stroke.start.t);

  if (!stroke.moved && distance <= tuning.tapSlopPx) {
    return GESTURE_KEYS.rotate;
  }

  // A swipe is mostly vertical, long enough and fast enough.
  const vertical = Math.abs(dy) > Math.abs(dx);
  const fast = Math.abs(dy) / elapsed >= tuning.swipeVelocityPxPerMs;
  if (vertical && fast && Math.abs(dy) >= tuning.swipeDistancePx) {
    return dy < 0 ? GESTURE_KEYS.hold : GESTURE_KEYS.hardDrop;
  }

  return null;
}

/** Which control scheme the player wants for pad-style games. */
export type TouchScheme = 'buttons' | 'gestures';

export const TOUCH_SCHEME_KEY = 'bbs_touch_scheme';

export function readTouchScheme(storage: Pick<Storage, 'getItem'>): TouchScheme {
  return storage.getItem(TOUCH_SCHEME_KEY) === 'gestures' ? 'gestures' : 'buttons';
}

export function writeTouchScheme(storage: Pick<Storage, 'setItem'>, scheme: TouchScheme): void {
  storage.setItem(TOUCH_SCHEME_KEY, scheme);
}
