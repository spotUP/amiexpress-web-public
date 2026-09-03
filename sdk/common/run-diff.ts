/**
 * The cursor-addressed run differ: ONE implementation of "repaint only what
 * changed", shared by every caller that pushes a character grid at a
 * terminal.
 *
 * The walk is the same one blessed uses (`Screen.prototype.draw`): scan a
 * row for a run of cells that must be painted, address the run's start with
 * CUP, re-state the attributes at the head of the run so the run is
 * self-contained, print the glyphs, move on. A run is self-contained because
 * the cells around it were NOT sent: whatever attribute state the terminal
 * was left in is unknown, so every run says what it is.
 *
 * It is deliberately agnostic about everything a caller's cell model owns:
 *
 *   - `cell(x, y)` hands back whatever a cell is here, and only `sgr()` and
 *     `glyph()` know what to do with it. The 40x25 PETSCII frame renderer's
 *     cells carry VIC-II palette indices and reverse-video; the screen
 *     wipes' cells carry a complete SGR parameter string. Neither model is
 *     visible from in here.
 *   - `changed(x, y)` is the caller's own notion of "must be painted": a
 *     diff against a previous grid, or (for a first paint) "is this cell
 *     non-blank". That is why this takes a predicate and not two grids -
 *     a first paint is not expressible as a comparison against a blank grid.
 *   - `skipCell(x, y)` is for cells that may NEVER be painted. The C64's
 *     bottom-right cell is one: printing there scrolls the KERNAL screen.
 *
 * What the caller keeps: the leading clear, the trailing reset, and any
 * final cursor position. Those differ between callers on purpose - the wipes
 * send nothing at all when a step changed nothing, while the frame renderer
 * always ends with SGR 0 and a CUP to the frame's own cursor - and none of
 * them are part of the run walk.
 *
 * Attribute dedup inside a run compares the SGR STRING, so a caller whose
 * cells hold structured attributes only has to make `sgr()` a pure function
 * of that state.
 *
 * Leaf module: no imports, so importing it (via the
 * `@amiexpress/bbs-door-sdk/common/run-diff` subpath) pulls in nothing else
 * and the client bundle stays light. Pure TypeScript: no DOM, no Node.
 */

/** How a caller's grid reaches the wire. Generic over whatever a cell is there. */
export interface RunDiffSpec<TCell> {
  /** Columns to walk, 0..cols-1. */
  readonly cols: number;
  /** Rows to walk, 0..rows-1. */
  readonly rows: number;
  /** The cell to paint at (x, y). Only called for cells that will be painted. */
  cell(x: number, y: number): TCell;
  /** Must (x, y) be painted at all? */
  changed(x: number, y: number): boolean;
  /** The wire bytes that put the terminal into this cell's attribute state. */
  sgr(cell: TCell): string;
  /** The printable character of this cell. */
  glyph(cell: TCell): string;
  /** Cells that may never be painted. Absent means "every cell may be painted". */
  skipCell?(x: number, y: number): boolean;
}

/**
 * The changed cells of a grid as cursor-addressed runs, and nothing else:
 * no clear, no trailing reset, no final cursor move. Empty when nothing
 * needs painting.
 */
export function renderRunDiff<TCell>(spec: RunDiffSpec<TCell>): string {
  const { cols, rows } = spec;
  const skipCell = spec.skipCell;
  const skipped = (x: number, y: number): boolean => skipCell !== undefined && skipCell(x, y);

  let out = '';

  for (let y = 0; y < rows; y++) {
    let x = 0;
    while (x < cols) {
      if (skipped(x, y) || !spec.changed(x, y)) {
        x++;
        continue;
      }

      const start = x;
      let run = '';
      // `null`, not '': the first cell of a run always states its attributes,
      // because nothing tells us what the terminal is wearing here.
      let lastSgr: string | null = null;

      while (x < cols && spec.changed(x, y) && !skipped(x, y)) {
        const cell = spec.cell(x, y);
        const sgr = spec.sgr(cell);
        if (sgr !== lastSgr) {
          run += sgr;
          lastSgr = sgr;
        }
        run += spec.glyph(cell);
        x++;
      }

      out += `\x1b[${y + 1};${start + 1}H` + run;
    }
  }

  return out;
}
