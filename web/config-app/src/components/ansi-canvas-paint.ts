import type { Cell } from '@amiexpress/bbs-door-sdk/engines/ui/ansi-editor/types';
import { ansiColor, paletteColor, type PaletteMode } from '../utils/ansi-palette';

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
  /**
   * Which palette the ART is drawn in. 'amiga' collapses every colour onto
   * console.device's eight pens, which is what a caller dialling this board
   * from an Amiga actually sees - the drawing is unchanged, only the view.
   *
   * The editor's OWN marks - the cursor, the MCI rungs - keep the full
   * palette: they are the tool talking, not the art, and a preview that dims
   * them makes them hard to see for no gain.
   */
  palette: PaletteMode = 'full',
  /**
   * Rows after which the caller meets a More prompt - see `screen-fold.ts`.
   *
   * Drawn LAST so nothing paints over them, and drawn as a line across the
   * screen rather than by dimming the art: an artist judging colour must see
   * the art as the caller gets it, and half a drawing greyed out is a worse
   * lie than no marker at all.
   */
  folds: number[] = [],
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
  /*
   * The face the caller sees, not a PC one. TopazPlus_a1200 is the board's
   * default (DEFAULT_BBS_FONT, packages/terminal/src/utils/session-font.ts:34)
   * and plain Topaz is the same-metrics fallback behind it; `IBM VGA` was
   * ahead of both and is not shipped here at all, so the canvas drew Amiga art
   * in whatever the browser reached for.
   */
  ctx.font = `${CELL_HEIGHT}px "TopazPlus_a1200", "Topaz_a1200", "Courier New", monospace`;
  ctx.textBaseline = 'top';

  for (let y = 0; y < rows; y++) {
    const row = canvas[y];
    for (let x = 0; x < row.length; x++) {
      const cell = row[x];
      if (!cell) continue;

      const left = x * CELL_WIDTH;
      const top = y * CELL_HEIGHT;

      ctx.fillStyle = paletteColor(cell.bg, palette);
      ctx.fillRect(left, top, CELL_WIDTH, CELL_HEIGHT);

      // A space carries its background and nothing else - drawing it costs a
      // glyph per cell on a screen that is mostly spaces.
      if (cell.char && cell.char !== ' ') {
        ctx.fillStyle = paletteColor(cell.fg, palette);
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

  /*
   * WHERE THE CALLER'S SCREEN ENDS. "if i remove lines i need to see how big
   * the actual screen is, and what is outside the screen" (sysop,
   * 2026-09-14). A dashed rule sits on the boundary and the rows past it keep
   * their colours - what is below the line is what the caller has to press a
   * key to reach, not something wrong.
   */
  for (const after of folds) {
    if (after <= 0 || after >= rows) continue;
    const y = after * CELL_HEIGHT + 0.5;
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = ansiColor(14);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(cols * CELL_WIDTH, y);
    ctx.stroke();
    ctx.restore();
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

/**
 * How many real pixels a canvas of this many cells needs.
 *
 * Its own function because the number is the whole bug: a gallery thumbnail
 * used to allocate a full 80x25 screen at device resolution - 1280x800, 4.1 MB
 * - and hand it to `transform: scale(0.28)`, which changes what you see and
 * not one byte of what was allocated. On a board with 872 screens, and a card
 * that never releases its canvas once drawn, that froze the browser.
 *
 * Scaled here, the same thumbnail is 358x224 and 321 KB.
 */
export function canvasPixelSize(
  cols: number, rows: number, scale: number, devicePixelRatio: number,
): { width: number; height: number; ratio: number } {
  const ratio = devicePixelRatio * scale;
  return {
    width: Math.max(1, Math.round(cols * CELL_WIDTH * ratio)),
    height: Math.max(1, Math.round(rows * CELL_HEIGHT * ratio)),
    ratio,
  };
}
