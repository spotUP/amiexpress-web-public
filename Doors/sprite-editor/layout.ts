/**
 * Integer-row geometry for both studio screens, replacing percent strings.
 *
 * Studio 2c root cause (recorded here, full arithmetic in the task-2
 * report): the old layout gave every pane a percent top/height
 * (canvasBox '90%', the right column '45%'+'30%'+'15%', etc). Each percent
 * string is resolved independently through `Math.floor(percent * parentHeight)`
 * (element.ts's calcPos) - there is no single partition step that derives
 * a sibling's edge FROM the pane above it. Two panes that are supposed to
 * share a boundary (the browser's sprites/animations split against the
 * doors/preview columns, at 45%+45% vs 90%) instead each round
 * independently, and `Math.floor(a) + Math.floor(b)` is not always equal
 * to `Math.floor(a + b)` - so at some terminal heights (measured: 23, 24)
 * the shared boundary lands on two DIFFERENT rows, one column's border a
 * row above the other's, and at others (25, 30, 40) it happens to
 * coincide. A bug that appears and disappears depending on the viewer's
 * terminal height is exactly this class of defect.
 *
 * Every rect below is a literal integer, derived by hand from one shared
 * partition of the 25-row screen (row 0 = menu bar, rows 1-19 = content,
 * rows 20-23 = reserved headroom for future floating/minimized panels,
 * row 24 = status bar) so two panes that must share an edge are written
 * with that edge in common - there is no rounding step left to disagree.
 */

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** The last row of the screen - the status bar's row, and nothing else's. */
export const STATUS_ROW = 24;

function rect(top: number, left: number, width: number, height: number): Rect {
  return Object.freeze({ top, left, width, height });
}

export const LAYOUT = Object.freeze({
  /**
   * Edit screen. Canvas rows 1-19 (44 cols) alongside a right column that
   * splits the same 19 rows two ways: Preview / Frames. Every right-column
   * top is the previous pane's top + height, not a re-derived percent, so
   * the column always sums to exactly 19 - the same 19 the canvas occupies.
   *
   * There was a third pane here, a Paint toolbar, until the edit screen
   * started hosting the ANSIEditor: the widget ships its own colour and
   * tool sidebar inside the canvas pane, and toolbar.ts was a second copy
   * of it. Its five rows went to Frames rather than being left blank.
   */
  edit: {
    canvas: rect(1, 0, 44, 19),
    preview: rect(1, 44, 36, 8),
    frames: rect(9, 44, 36, 11),
    status: rect(STATUS_ROW, 0, 80, 1),
  },
  /**
   * Browser screen. Doors (left) and Preview (right) each run the full
   * 19 content rows; Sprites/Animations split that column top-to-bottom
   * the same way the edit screen's right column does.
   */
  browser: {
    doors: rect(1, 0, 20, 19),
    sprites: rect(1, 20, 20, 9),
    animations: rect(10, 20, 20, 10),
    preview: rect(1, 40, 40, 19),
    status: rect(STATUS_ROW, 0, 80, 1),
  },
} as const);
