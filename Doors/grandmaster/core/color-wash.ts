/**
 * COLOR: the stack repainted as a rolling rainbow.
 *
 * Reference type 13 (`mission.c:1344-1350`). Every field cell is drawn from a
 * rolling table instead of its own colour (`view.c:1621-1626`), the counter
 * ticking once a frame (`gamestart.c:4020`):
 *
 *     color = k; if (color >= 5) color = 9 - color;
 *     color = color_tbl_max - ((((20 - j) + color) * 4 + color_counter) % color_tbl_max);
 *
 * so the bands run DIAGONALLY - the column term is mirrored about the middle
 * of the field, the row term counts up from the floor, and the counter rolls
 * the whole thing.
 *
 * WHAT IS DIFFERENT HERE, and why. The reference indexes a palette of its own
 * (`color_tbl`) that has no 1:1 ANSI equivalent, and it rolls once per FRAME,
 * which a terminal does not have. This keeps the shape of the effect - the
 * mirrored column term, the row term, a roll over time - and spends it on the
 * seven colours a piece can be, so a caller on a slow line sees the same
 * rainbow moving more slowly rather than a different effect.
 */
import type { PieceType } from './types';

/** The wash runs through the piece colours, in spectrum order. */
const WASH: PieceType[] = ['Z', 'L', 'O', 'S', 'I', 'J', 'T'];

/** One step of the roll, in milliseconds. The reference rolls once a frame. */
export const WASH_STEP_MS = 1000 / 60;

/**
 * The colour a cell is washed with.
 *
 * `width` is the board's, so the mirrored column term folds about the middle
 * of whatever field it is given rather than the reference's fixed ten.
 */
export function washColour(x: number, y: number, width: number, now: number): PieceType {
  const half = Math.floor(width / 2);
  // `if (color >= 5) color = 9 - color` - mirrored about the middle column.
  const column = x >= half ? (width - 1) - x : x;
  const roll = Math.floor(now / WASH_STEP_MS);
  const band = ((20 - y) + column) * 4 + roll;
  return WASH[((band % WASH.length) + WASH.length) % WASH.length];
}
