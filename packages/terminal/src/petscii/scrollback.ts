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

/**
 * How many rows one notch of the wheel moves. Three is what a browser
 * reports for a line-mode wheel event and what xterm scrolls.
 */
export const PETSCII_WHEEL_ROWS = 3;

/** An offset held inside the history that exists. Never negative. */
export function clampScrollOffset(offset: number, historyLength: number): number {
  if (!Number.isFinite(offset)) return 0;
  return Math.max(0, Math.min(Math.round(offset), Math.max(0, historyLength)));
}

/**
 * Where a wheel notch leaves the glass.
 *
 * Up the screen is BACK in time, and up the screen is a negative `deltaY` in
 * the DOM - so a negative delta raises the offset. A delta of zero (a purely
 * horizontal wheel, or a trackpad settling) moves nothing.
 */
export function scrollOffsetForWheel(
  current: number,
  deltaY: number,
  historyLength: number,
  rowsPerNotch: number = PETSCII_WHEEL_ROWS,
): number {
  if (!Number.isFinite(deltaY) || deltaY === 0) return clampScrollOffset(current, historyLength);
  return clampScrollOffset(current - Math.sign(deltaY) * rowsPerNotch, historyLength);
}
