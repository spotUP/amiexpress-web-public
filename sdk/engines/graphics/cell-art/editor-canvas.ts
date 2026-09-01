/**
 * The one conversion between a sprite frame and an ANSIEditor canvas.
 *
 * Two transparency models meet here and nowhere else: cell-art says a hole
 * is `null` (compositing skips it, rendering paints the fallback), the
 * editor says a hole is a cell carrying `transparent: true` - it has no
 * nullable slot, every position holds a Cell. ANSI text can carry neither,
 * which is why the editor's own Cell comment forbids wiring transparency
 * into its ANSI codec and points hosts at getCoreCanvas()/setCoreCanvas()
 * instead. This module is that path.
 *
 * The import of the editor's Cell is TYPE-ONLY: cell-art gains no runtime
 * dependency on the blessed UI engine, so a game importing sprites does not
 * drag an editor into its bundle.
 */

import type { Cell as EditorCell } from '../../ui/ansi-editor/types';
import type { Cell, CellBuffer } from './cells';

/** What the editor shows where a sprite has a hole. */
const TRANSPARENT: Omit<EditorCell, 'transparent'> = { char: ' ', fg: 7, bg: 0 };

/** A sprite frame as an editor canvas: holes become transparent cells. */
export function frameToCanvas(frame: CellBuffer): EditorCell[][] {
  return frame.map(row => row.map(cell => (
    cell === null
      ? { ...TRANSPARENT, transparent: true }
      : { char: cell.char, fg: cell.fg, bg: cell.bg }
  )));
}

/** An editor canvas as a sprite frame: transparent cells become holes. */
export function canvasToFrame(canvas: EditorCell[][]): CellBuffer {
  return canvas.map(row => row.map(cell => (
    cell.transparent
      ? null
      // Rebuilt field by field, not spread: an editor cell may carry
      // `blink`, which a sprite has no concept of and the .sprite writer
      // would refuse. A spread would smuggle it into the saved file.
      : { char: cell.char, fg: cell.fg, bg: cell.bg } as Cell
  )));
}
