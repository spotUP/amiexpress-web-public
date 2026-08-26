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
  // Enter, NOT space. Space is bound to ROTATE 180 in this door's default
  // key map, so a hard-drop swipe spun the piece instead of dropping it -
  // which is both "it always registers as soft drop" (the drag's own
  // ArrowDowns were all that dropped) and "it rotates when I swipe down".
  // Enter is a default hard-drop binding; see input/config.ts.
  hardDrop: { key: 'Enter', code: 'Enter' },
  rotate: { key: 'x', code: 'KeyX' },
  hold: { key: 'c', code: 'KeyC' },
} as const;

/** Keys a menu needs: the four arrows, Enter to choose, Escape to back out. */
export const MENU_KEYS = {
  up: { key: 'ArrowUp', code: 'ArrowUp' },
  down: { key: 'ArrowDown', code: 'ArrowDown' },
  left: { key: 'ArrowLeft', code: 'ArrowLeft' },
  right: { key: 'ArrowRight', code: 'ArrowRight' },
  enter: { key: 'Enter', code: 'Enter' },
} as const;

/**
 * A whole stroke, read as a menu action.
 *
 * Menus are List widgets: one key per gesture, no tracking. A swipe moves the
 * selection one step whichever way the thumb went, and a tap confirms - so a
 * phone player can work a door's menus without any buttons at all.
 *
 * Returns null when the stroke was too small to mean anything, so a stray
 * graze does not pick a menu item.
 */
export function menuGesture(
  stroke: GestureStroke,
  point: GesturePoint,
  tuning: GestureTuning = DEFAULT_TUNING
): GestureKey | null {
  const dx = point.x - stroke.start.x;
  const dy = point.y - stroke.start.y;
  const distance = Math.hypot(dx, dy);
  const duration = point.t - stroke.start.t;

  if (distance <= tuning.tapSlopPx) {
    // Same rule as the playfield tap: small AND quick, so a rested thumb
    // does not confirm a menu item on lift-off.
    return duration <= tuning.tapMaxMs ? MENU_KEYS.enter : null;
  }

  // One step per swipe, along whichever axis actually won.
  if (Math.abs(dy) > Math.abs(dx)) {
    return dy > 0 ? MENU_KEYS.down : MENU_KEYS.up;
  }
  return dx > 0 ? MENU_KEYS.right : MENU_KEYS.left;
}

export interface GestureTuning {
  /** Horizontal travel that moves the piece one column, in px. */
  columnPx: number;
  /** Vertical travel that drops the piece one row, in px. */
  rowPx: number;
  /** Travel below this (px) still counts as a tap, not a drag. */
  tapSlopPx: number;
  /** Travel that decides whether a stroke is horizontal or vertical. */
  axisLockPx: number;
  /**
   * A flick UP must cover at least this much (px) to be a swipe.
   *
   * Only up. A hard drop is decided by SPEED alone - see hardDropMinPx -
   * because the distance gate is what made short flicks fall through to a
   * soft drop. An accidental hold is a worse outcome than an accidental hard
   * drop, so the up direction keeps its distance requirement.
   */
  swipeDistancePx: number;
  /**
   * The least a downward flick can travel and still be a hard drop.
   *
   * Just past the tap slop: enough that a stationary lift-off is not a
   * flick, small enough that a short sharp flick counts. "Even short swipes
   * down should register as hard drops; fast swipes should hard drop and
   * slow swipes down should soft drop" - so speed decides, not distance.
   */
  hardDropMinPx: number;
  /** ...and be no slower than this (px per millisecond), measured over
   *  the END of the stroke rather than the whole of it. */
  swipeVelocityPxPerMs: number;
  /** How far back the flick is measured, in milliseconds. */
  flickWindowMs: number;
  /**
   * The winning axis must beat the other by this much before the stroke
   * commits. Nobody swipes straight, and a stroke that locked on the first
   * 12px of a slightly diagonal flick locked the WRONG way about as often as
   * the right one.
   */
  axisDominance: number;
  /** A tap must also be over this quickly. A slow press is not a tap. */
  tapMaxMs: number;
}

export const DEFAULT_TUNING: GestureTuning = {
  // 34, not 24. Twenty-four CSS pixels is about four millimetres of thumb -
  // small enough that aiming for one column often gave two, and that nudging
  // a piece one place across took more care than the rest of the game
  // ("it's a little hard to move just one step left/right, it's a little too
  // sensitive"). A drag still tracks the thumb one column per cell crossed;
  // the cell is simply the size of a deliberate movement now.
  columnPx: 34,
  rowPx: 28,
  tapSlopPx: 10,
  // Was 12 with no dominance requirement, which is what let a downward swipe
  // drift sideways: 13px across and 11px down locked HORIZONTAL and the
  // whole swipe then moved the piece ("it still moves sideways easily when
  // swiping down", 2026-08-25).
  axisLockPx: 14,
  // 1.5 was still letting a down-swipe drift: 15px down against 10px across
  // passes at 1.5 and locks VERTICAL, but 15 across against 10 down passes
  // just as easily and moves the piece sideways instead. 1.8 asks the thumb
  // to mean it ("it's super hard to swipe down without making it move
  // sideways or rotate", 2026-08-26).
  axisDominance: 1.8,
  swipeDistancePx: 38,
  // 38px of flick was demanded in BOTH directions, so a short sharp flick
  // down never qualified and fell through to the per-row soft drop: "I keep
  // swiping down but it always registers as soft drop instead of hard drop".
  hardDropMinPx: 14,
  swipeVelocityPxPerMs: 0.28,
  flickWindowMs: 120,
  tapMaxMs: 250,
};

export interface GesturePoint {
  x: number;
  y: number;
  t: number;
}

/** Which way a stroke has committed. */
export type GestureAxis = 'none' | 'horizontal' | 'vertical';

/** Live state of one thumb stroke. */
export interface GestureStroke {
  start: GesturePoint;
  /** Where the last emitted step left the thumb - movement is incremental. */
  anchor: GesturePoint;
  last: GesturePoint;
  /**
   * The last few samples, newest last, for measuring the flick at the END
   * of a stroke. Judging speed over the whole stroke meant a slow drag down
   * followed by a flick never registered as a hard drop.
   */
  recent: GesturePoint[];
  /**
   * Locked once the stroke commits to a direction. Nobody swipes perfectly
   * straight, and without this a downward swipe slid the piece sideways on
   * the way (reported live 2026-08-25).
   */
  axis: GestureAxis;
  /** Set once the stroke has moved far enough to stop being a tap. */
  moved: boolean;
  /** Set once a swipe has fired, so the rest of the stroke is inert. */
  consumed: boolean;
}

export function beginStroke(point: GesturePoint): GestureStroke {
  return {
    start: point,
    anchor: point,
    last: point,
    recent: [point],
    axis: 'none',
    moved: false,
    consumed: false,
  };
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
  stroke.recent.push(point);
  // Keep only what the flick window can use, plus one sample either side.
  while (stroke.recent.length > 2 && point.t - stroke.recent[1].t > tuning.flickWindowMs) {
    stroke.recent.shift();
  }

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

  // Commit to one axis as soon as the stroke is clearly going somewhere,
  // then ignore the other. Thumbs do not travel in straight lines, so the
  // winner also has to be a CLEAR winner - otherwise the lock is a coin toss
  // decided by the first few pixels of a diagonal flick.
  if (stroke.axis === 'none' && Math.max(Math.abs(dxTotal), Math.abs(dyTotal)) >= tuning.axisLockPx) {
    const ax = Math.abs(dxTotal);
    const ay = Math.abs(dyTotal);
    const dominant = Math.max(ax, ay);
    const other = Math.min(ax, ay);
    // Undecided strokes stay unlocked and emit nothing until they commit,
    // which is why a wobbly start no longer slides the piece.
    if (dominant >= other * tuning.axisDominance) {
      stroke.axis = ax > ay ? 'horizontal' : 'vertical';
    }
    // Deliberately NOT re-anchored: the travel that decided the axis is
    // real movement on it, and swallowing the first 12px made the piece
    // lag the thumb by half a cell on every stroke.
  }

  if (stroke.axis === 'horizontal') {
    const dx = point.x - stroke.anchor.x;
    const columns = Math.trunc(dx / tuning.columnPx);
    if (columns !== 0) {
      const key = columns > 0 ? GESTURE_KEYS.right : GESTURE_KEYS.left;
      for (let i = 0; i < Math.abs(columns); i++) keys.push(key);
      stroke.anchor = { ...stroke.anchor, x: stroke.anchor.x + columns * tuning.columnPx };
    }
  } else if (stroke.axis === 'vertical') {
    // Downward travel only: dragging up is reserved for the hold swipe.
    const dy = point.y - stroke.anchor.y;
    const rows = Math.trunc(dy / tuning.rowPx);
    if (rows > 0) {
      for (let i = 0; i < rows; i++) keys.push(GESTURE_KEYS.down);
      stroke.anchor = { ...stroke.anchor, y: stroke.anchor.y + rows * tuning.rowPx };
    }
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

  // A tap is small, QUICK, and never committed to a direction. Distance alone
  // was letting swipes rotate the piece: a fast flick whose touchmove events
  // were coalesced away arrives as a start and an end, and if the thumb rolled
  // back on lift-off the two points are close together - indistinguishable
  // from a tap without the time and axis checks ("it often rotates when I
  // swipe down to hard drop", 2026-08-25).
  const duration = point.t - stroke.start.t;
  if (!stroke.moved && stroke.axis === 'none' && distance <= tuning.tapSlopPx && duration <= tuning.tapMaxMs) {
    return GESTURE_KEYS.rotate;
  }

  // Measure the flick over the END of the stroke, not the whole of it. A
  // slow drag down followed by a flick is the common way to hard drop, and
  // judging it on total elapsed time meant it almost never registered
  // (reported live 2026-08-25: "I never managed to do a hard drop").
  const samples = [...stroke.recent, point];
  const window = samples.filter(s => point.t - s.t <= tuning.flickWindowMs);
  const from = window.length >= 2 ? window[0] : samples[Math.max(0, samples.length - 2)];

  const flickDy = point.y - from.y;
  const flickDx = point.x - from.x;
  const flickMs = Math.max(1, point.t - from.t);
  const flickSpeed = Math.abs(flickDy) / flickMs;

  const verticalFlick = Math.abs(flickDy) > Math.abs(flickDx);
  const fastEnough = flickSpeed >= tuning.swipeVelocityPxPerMs;

  if (verticalFlick && fastEnough) {
    if (flickDy < 0) {
      // Up is a hold, and an accidental hold is worse than an accidental
      // hard drop, so it still has to travel.
      const farEnough = Math.abs(flickDy) >= tuning.swipeDistancePx
        || (stroke.axis === 'vertical' && Math.abs(dy) >= tuning.swipeDistancePx);
      return farEnough ? GESTURE_KEYS.hold : null;
    }
    // Down: SPEED is the whole test. A slow drag down never gets here - it
    // has been emitting one soft drop per row all along - and a quick flick
    // hard drops however short it was.
    return Math.abs(flickDy) >= tuning.hardDropMinPx ? GESTURE_KEYS.hardDrop : null;
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
