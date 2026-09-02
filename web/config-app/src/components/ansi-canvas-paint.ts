import type { Cell } from '@amiexpress/bbs-door-sdk/engines/ui/ansi-editor/types';
import { ansiColor } from '../utils/ansi-palette';

/** VGA text-mode cell, the shape every one of these screens was drawn in. */
export const CELL_WIDTH = 8;
export const CELL_HEIGHT = 16;

/**
 * What the canvas renderer actually draws, as a function.
 *
 * Separated from the component on purpose: a test environment has no 2D
 * backend, so a paint loop living inside `useEffect` is never executed by any
 * test and the colour mapping - the thing most likely to be wrong, since a
 * Cell numbers colours in SGR order and the EGA table does not - would ship
 * unproven. A recording context proves it instead.
 */
/** A run of cells to ring - an MCI code, and whether the board can follow it. */
export interface Highlight {
  x: number;
  y: number;
  length: number;
  broken?: boolean;
}

export function paintScreen(
  ctx: CanvasRenderingContext2D,
  canvas: Cell[][],
  cursor?: { x: number; y: number } | null,
  highlights: Highlight[] = [],
): void {
  const rows = canvas.length;
  const cols = rows > 0 ? canvas[0].length : 0;

  ctx.fillStyle = ansiColor(0);
  ctx.fillRect(0, 0, cols * CELL_WIDTH, rows * CELL_HEIGHT);

  // Topaz first: the board's screens were drawn on an Amiga, in this face, and
  // the editor should show the sysop what a caller sees. The rest of the stack
  // is per-glyph fallback, which is how a CP437 block character that Topaz has
  // no glyph for still lands - the browser falls back for that character alone,
  // not for the line.
  ctx.font = `${CELL_HEIGHT}px "Topaz_a1200", "IBM VGA", "Consolas", "Courier New", monospace`;
  ctx.textBaseline = 'top';

  for (let y = 0; y < rows; y++) {
    const row = canvas[y];
    for (let x = 0; x < row.length; x++) {
      const cell = row[x];
      if (!cell) continue;

      const left = x * CELL_WIDTH;
      const top = y * CELL_HEIGHT;

      ctx.fillStyle = ansiColor(cell.bg);
      ctx.fillRect(left, top, CELL_WIDTH, CELL_HEIGHT);

      // A space carries its background and nothing else - drawing it costs a
      // glyph per cell on a screen that is mostly spaces.
      if (cell.char && cell.char !== ' ') {
        ctx.fillStyle = ansiColor(cell.fg);
        ctx.fillText(cell.char, left, top);
      }
    }
  }

  // Rung, never repainted: a code is part of the art, and covering its cells
  // would hide the characters the sysop is trying to read.
  for (const mark of highlights) {
    ctx.strokeStyle = ansiColor(mark.broken ? 9 : 11);
    ctx.lineWidth = 1;
    ctx.strokeRect(
      mark.x * CELL_WIDTH + 0.5,
      mark.y * CELL_HEIGHT + 0.5,
      mark.length * CELL_WIDTH - 1,
      CELL_HEIGHT - 1,
    );
  }

  if (cursor && cursor.x >= 0 && cursor.y >= 0 && cursor.x < cols && cursor.y < rows) {
    ctx.strokeStyle = ansiColor(15);
    ctx.lineWidth = 1;
    ctx.strokeRect(
      cursor.x * CELL_WIDTH + 0.5,
      cursor.y * CELL_HEIGHT + 0.5,
      CELL_WIDTH - 1,
      CELL_HEIGHT - 1,
    );
  }
}
