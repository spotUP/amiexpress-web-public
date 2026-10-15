/**
 * HOW FAR BACK THE PETSCII GLASS IS LOOKING.
 *
 * A PETSCII session does not run on xterm - `BBSTerminal` hands the whole
 * session to `PetsciiCanvas`, which draws a screen model and nothing else -
 * so none of xterm's scrollback reaches it. The model keeps the rows that
 * leave the screen (`PetsciiMachine`'s `historyRows`); this is the arithmetic
 * that decides which window of them the canvas draws, and it lives here so
 * the wheel's behaviour is a test rather than a walk through a browser
 * ("scrollback does not work petscii", the sysop, 2026-09-24).
 *
 * An offset is in ROWS BACK FROM LIVE: 0 is the live screen, 1 puts the most
 * recently retired row on the top line, and the largest meaningful value is
 * the number of rows the machine has kept.
 */

/** An offset held inside the history that exists. Never negative. */
export function clampScrollOffset(offset: number, historyLength: number): number {
  if (!Number.isFinite(offset)) return 0;
  return Math.max(0, Math.min(Math.round(offset), Math.max(0, historyLength)));
}

/** `WheelEvent.deltaMode`: the unit `deltaY` is counted in. */
export const WHEEL_DELTA_PIXEL = 0;
export const WHEEL_DELTA_LINE = 1;
export const WHEEL_DELTA_PAGE = 2;

/**
 * How many ROWS a wheel event asks to move, fractions included.
 *
 * A wheel event is not a notch. A mouse wheel sends one event per click, but
 * a trackpad or a Magic Mouse sends dozens of small PIXEL events for one
 * swipe - and when every event moved three rows, a single flick threw the
 * glass hundreds of rows back ("it scrolls very fast so its hard to
 * control", the sysop, 2026-09-24). So the distance is honoured instead, the
 * way xterm does it: pixels are divided by the height of a row as it is
 * drawn on the page, lines are rows, and a page is the screen.
 */
export function wheelDeltaInRows(
  deltaY: number,
  deltaMode: number,
  rowPixels: number,
  pageRows: number,
): number {
  if (!Number.isFinite(deltaY)) return 0;
  if (deltaMode === WHEEL_DELTA_LINE) return deltaY;
  if (deltaMode === WHEEL_DELTA_PAGE) return deltaY * pageRows;
  return rowPixels > 0 ? deltaY / rowPixels : 0;
}

/** Where the glass is, and the part of a row the wheel has moved but not yet shown. */
export interface WheelScroll {
  offset: number;
  carry: number;
}

/**
 * Where a wheel event leaves the glass.
 *
 * Up the screen is BACK in time, and up the screen is a negative delta in
 * the DOM - so a negative delta raises the offset. A trackpad moves a fifth
 * of a row per event, so the fraction is CARRIED to the next event rather
 * than rounded away, or a slow swipe would never move at all. Hitting either
 * end drops the carry, so turning back is felt at once.
 */
export function scrollOffsetForWheel(
  current: number,
  deltaRows: number,
  carry: number,
  historyLength: number,
): WheelScroll {
  const start = clampScrollOffset(current, historyLength);
  if (!Number.isFinite(deltaRows) || deltaRows === 0) return { offset: start, carry };
  const total = carry - deltaRows;
  const whole = Math.trunc(total);
  const offset = clampScrollOffset(start + whole, historyLength);
  return { offset, carry: offset === start + whole ? total - whole : 0 };
}
