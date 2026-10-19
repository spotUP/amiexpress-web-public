/**
 * A native .tti page as the cells the admin's canvas paints.
 *
 * There is ONE teletext renderer: the board's `renderNativeTti`, which runs
 * the vendored packet engine and emits the ANSI rows a caller receives. The
 * admin does not draw teletext itself; it lays those rows out with the ANSI
 * editor core's own parser and hands the cells to `AnsiCanvas`, the same
 * painter every other preview here uses. The editor, the screen dialog and
 * the gallery thumbnail all go through this one function.
 */
import type { Cell } from '@amiexpress/bbs-door-sdk/engines/ui/ansi-editor/types';
import { createCanvas, parseANSIToCanvas } from '@amiexpress/bbs-door-sdk/engines/ui/ansi-editor/core/canvas';
import { renderNativeTti } from '@amiexpress/bbs-door-sdk/teletext/render-native';
import { FRAME_COLS } from '@amiexpress/bbs-door-sdk/teletext/edittf-frame';
import { advanceRatioFor, seamlessTeletextSize } from '@amiexpress/terminal';
import type { CellGeometry } from './ansi-canvas-paint';

/** The face a teletext caller's terminal draws these rows in (src/index.css). */
const TELETEXT_FACE = 'TeletextUPR';
export const TELETEXT_FONT_FAMILY = `"${TELETEXT_FACE}", monospace`;

/**
 * The cell a teletext caller's terminal draws, at the admin's size.
 *
 * Taken from the terminal's own font model (packages/terminal session-font):
 * the cell is the face's advance (0.6 of an em for TeletextUPR) by one em, at
 * a size that seams on neither axis. VGA's 8x16 is 0.5 of an em, so a page
 * drawn in it came out a sixth narrower than the caller's screen - and a
 * mosaic drawn to look round in the editor came out stretched on the wire.
 * 20px is the seamless size nearest the ANSI editor's 16px rows that keeps
 * every cell whole: a 12x20 cell.
 */
const TELETEXT_FONT_SIZE = seamlessTeletextSize(20);
export const TELETEXT_CELL: CellGeometry = {
  width: TELETEXT_FONT_SIZE * advanceRatioFor(TELETEXT_FACE),
  height: TELETEXT_FONT_SIZE,
};

/** Rows the renderer emits: the display rows, without the fastext row 24. */
export const TELETEXT_DISPLAY_ROWS = 24;

/** The page's cells, or a blank screen when the text is not a renderable page. */
export function teletextCells(tti: string): Cell[][] {
  const canvas = createCanvas(FRAME_COLS, TELETEXT_DISPLAY_ROWS);
  const rendered = renderNativeTti(tti);
  if (rendered) parseANSIToCanvas(canvas, rendered.ansi);
  return canvas;
}
