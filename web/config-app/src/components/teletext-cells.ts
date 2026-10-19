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

/** The face a teletext caller's terminal draws these rows in (src/index.css). */
export const TELETEXT_FONT_FAMILY = '"TeletextUPR", monospace';

/** Rows the renderer emits: the display rows, without the fastext row 24. */
export const TELETEXT_DISPLAY_ROWS = 24;

/** The page's cells, or a blank screen when the text is not a renderable page. */
export function teletextCells(tti: string): Cell[][] {
  const canvas = createCanvas(FRAME_COLS, TELETEXT_DISPLAY_ROWS);
  const rendered = renderNativeTti(tti);
  if (rendered) parseANSIToCanvas(canvas, rendered.ansi);
  return canvas;
}
