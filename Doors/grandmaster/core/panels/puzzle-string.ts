/**
 * A board as a string of digits, and back.
 * Ports the panel-string half of common/engine/Puzzle.lua.
 *
 * This is the format puzzles are authored in, and - more useful during a port -
 * it is a SNAPSHOT PRIMITIVE. Serialise a board at frame N here and at frame N
 * in the Lua engine, and any divergence is a one-line string diff instead of an
 * argument about which panel moved.
 *
 * ORIENTATION, which is the easy thing to get backwards. Upstream's docs put it
 * plainly: the string is read "from right to left, filling the play field with
 * panels starting at the bottom right corner, from right to left, bottom to
 * top." So the string reads top row first as you look at it, and the LAST six
 * characters are the bottom row of the board.
 *
 * A full board is 6 x 12 = 72 characters. Cells are:
 *     0        empty
 *     1-7      ordinary colours
 *     8        shock, the [!] panel
 *     9        colourless / garbage
 *
 * Garbage NOTATION - the [ ] { } = markers that describe a garbage block's
 * extent - is not handled yet; it arrives with the garbage work. A garbage
 * panel currently serialises as its colour, 9, which is exactly right for the
 * boards this is used on today and loses nothing that is not already absent.
 */

import type { PanelGrid } from './panel';

export const PUZZLE_WIDTH = 6;
export const PUZZLE_HEIGHT = 12;

/** Characters that mean "part of a garbage block" in an authored puzzle. */
const GARBAGE_NOTATION = new Set(['[', ']', '{', '}', '=']);

/**
 * Serialise a board, top row first.
 *
 * `topRow` defaults to the highest row the grid holds, so rows above the
 * playfield (where garbage spawns) are included; pass the stack height to get
 * only what is in play.
 */
export function toPuzzleString(
  panels: PanelGrid,
  width: number = PUZZLE_WIDTH,
  topRow: number = panels.length - 1,
): string {
  let out = '';
  for (let row = topRow; row >= 1; row--) {
    const rowPanels = panels[row];
    if (!rowPanels) continue;
    for (let column = 1; column <= width; column++) {
      const panel = rowPanels[column];
      out += String(panel ? panel.color : 0);
    }
  }
  return out;
}

/** The bottom `rows` rows of a board, as a string. */
export function bottomRowsOf(
  panels: PanelGrid,
  rows: number,
  width: number = PUZZLE_WIDTH,
): string {
  return toPuzzleString(panels, width).slice(-rows * width);
}

/**
 * Pad an authored puzzle string out to a full board.
 *
 * Upstream right-aligns the given panels into the BOTTOM of the board and
 * prepends empties, so "123" describes three panels at the bottom right.
 */
export function fillMissingPanels(
  puzzleString: string,
  width: number = PUZZLE_WIDTH,
  height: number = PUZZLE_HEIGHT,
): string {
  const target = width * height;
  const stripped = puzzleString.replace(/\s/g, '');
  if (stripped.length > target) {
    throw new Error(`puzzle string is longer than ${width}x${height}`);
  }
  return '0'.repeat(target - stripped.length) + stripped;
}

/**
 * Parse a puzzle string into colour rows, BOTTOM row first.
 *
 * The returned array is indexed from 0 for the bottom row, which is the order a
 * board is built in; callers place row `i + 1`.
 */
export function parsePuzzleString(
  puzzleString: string,
  width: number = PUZZLE_WIDTH,
): number[][] {
  const stripped = puzzleString.replace(/\s/g, '');

  for (const char of stripped) {
    if (GARBAGE_NOTATION.has(char)) {
      throw new Error(
        `puzzle string contains garbage notation '${char}', which is not supported yet`,
      );
    }
    if (!/[0-9]/.test(char)) {
      throw new Error(`puzzle string contains invalid character '${char}'`);
    }
  }

  if (stripped.length % width !== 0) {
    throw new Error(`puzzle string length ${stripped.length} is not a multiple of ${width}`);
  }

  const rowCount = stripped.length / width;
  const rows: number[][] = [];
  // The string is top row first, so walk it backwards a row at a time.
  for (let i = rowCount - 1; i >= 0; i--) {
    const rowString = stripped.slice(i * width, (i + 1) * width);
    rows.push([...rowString].map(Number));
  }
  return rows;
}
