/**
 * Cell art: the shared model under sprites (and, in plan 3, 9-slice
 * borders and themes).
 *
 * A Cell is one terminal character with numeric ANSI colours 0-15 - the
 * same space the ANSI editor's canvas uses, so the studio door later edits
 * exactly what this renders. Colour NAMES exist in one place only: the
 * PALETTE lookup inside rowToTags. Everything above it is numbers.
 *
 * Pure and dependency-free on purpose: no blessed, no fs, so it runs in
 * unit tests and in browser bundles without dragging either along.
 */

export interface Cell {
  char: string;
  /** ANSI colour 0-15. */
  fg: number;
  bg: number;
}

/** null is TRANSPARENT: compositing skips it, rendering paints fallback. */
export type CellRow = Array<Cell | null>;
export type CellBuffer = CellRow[];

/** The sixteen ANSI colours, in ANSI order, as blessed knows them. */
export const PALETTE: readonly string[] = [
  'black', 'red', 'green', 'yellow',
  'blue', 'magenta', 'cyan', 'white',
  'gray', 'lightred', 'lightgreen', 'lightyellow',
  'lightblue', 'lightmagenta', 'lightcyan', 'lightwhite',
];

const DEFAULT_FALLBACK: Cell = { char: ' ', fg: 7, bg: 0 };

/** A fresh buffer. The fill is cloned per cell - rows must not share one. */
export function createBuffer(
  width: number,
  height: number,
  fill: Cell | null = null
): CellBuffer {
  const buffer: CellBuffer = [];
  for (let y = 0; y < height; y++) {
    const row: CellRow = [];
    for (let x = 0; x < width; x++) {
      row.push(fill ? { ...fill } : null);
    }
    buffer.push(row);
  }
  return buffer;
}

/**
 * Composite src onto dest at (x, y).
 *
 * null cells in src are transparent - the whole reason a sprite can stand
 * on terrain without carrying the terrain in its own frames. Out-of-range
 * cells are clipped, not thrown: a sprite half off the board is a caller
 * bug worth surviving, not crashing a live door over.
 */
export function blitCells(
  dest: CellBuffer,
  src: CellBuffer,
  x: number,
  y: number
): void {
  for (let sy = 0; sy < src.length; sy++) {
    const destRow = dest[y + sy];
    if (!destRow) continue;
    const srcRow = src[sy];
    for (let sx = 0; sx < srcRow.length; sx++) {
      const cell = srcRow[sx];
      if (cell === null) continue;
      if (x + sx < 0 || x + sx >= destRow.length) continue;
      destRow[x + sx] = { ...cell };
    }
  }
}

/**
 * One row as a blessed tag string.
 *
 * Runs of one (fg, bg) pair share one tag pair. Without this a 75-column
 * row is 150 tags, twenty times per tick - the grouping is not cosmetic.
 */
export function rowToTags(row: CellRow, fallback: Cell = DEFAULT_FALLBACK): string {
  let out = '';
  let runFg = -1;
  let runBg = -1;

  for (const raw of row) {
    const cell = raw ?? fallback;
    if (cell.fg !== runFg || cell.bg !== runBg) {
      if (runFg !== -1) out += '{/}';
      out += `{${PALETTE[cell.fg]}-fg}{${PALETTE[cell.bg]}-bg}`;
      runFg = cell.fg;
      runBg = cell.bg;
    }
    out += cell.char;
  }

  if (runFg !== -1) out += '{/}';
  return out;
}

/** Every row, ready to join('\n') into a blessed box. */
export function bufferToTags(buffer: CellBuffer, fallback: Cell = DEFAULT_FALLBACK): string[] {
  return buffer.map(row => rowToTags(row, fallback));
}
