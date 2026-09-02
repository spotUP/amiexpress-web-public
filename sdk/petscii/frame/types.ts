/**
 * The frame model shared by the reconstructor (ANSI -> 80xN grid), the
 * adapter (80 -> 40 columns) and the diff renderer (40x25 grid -> ANSI for
 * AnsiToPetsciiTransducer). Colours are VIC-II indices 0-15 - the same space
 * the transducer resolves SGR into (sgrColorToVic / nearestVicForRgb) - so a
 * cell's `fg` survives the whole pipeline unchanged.
 *
 * Pure TypeScript: no DOM, no Node imports.
 */
export interface Cell {
  /** One printable code point as a string (' ' for blank). Never a control character. */
  ch: string;
  /** Foreground, VIC index 0-15. SGR 0 / 39 resolve to 1 (white), as in the transducer. */
  fg: number;
  /** Background, VIC index 0-15. Recorded so nothing is lost; the C64 has one fixed background (6) and the renderer never emits it. */
  bg: number;
  bold: boolean;
  rvs: boolean;
}

export interface Cursor { x: number; y: number; }

export interface Frame {
  readonly cols: number;
  readonly rows: number;
  /** rows x cols, row-major; every row has exactly `cols` cells. */
  readonly cells: ReadonlyArray<ReadonlyArray<Readonly<Cell>>>;
  readonly cursor: Readonly<Cursor>;
}

export const DEFAULT_FG = 1;
export const DEFAULT_BG = 6;

export function blankCell(): Cell {
  return { ch: ' ', fg: DEFAULT_FG, bg: DEFAULT_BG, bold: false, rvs: false };
}

export function cloneCell(c: Readonly<Cell>): Cell {
  return { ch: c.ch, fg: c.fg, bg: c.bg, bold: c.bold, rvs: c.rvs };
}

export function sameCell(a: Readonly<Cell>, b: Readonly<Cell>): boolean {
  return a.ch === b.ch && a.fg === b.fg && a.bg === b.bg && a.bold === b.bold && a.rvs === b.rvs;
}

/** A cell that paints nothing: a plain space that is not reverse video. */
export function isBlank(c: Readonly<Cell>): boolean {
  return c.ch === ' ' && !c.rvs;
}

/** Copy of `cells` cut or padded with blanks to exactly `cols` entries. */
export function padRow(cells: ReadonlyArray<Readonly<Cell>>, cols: number): Cell[] {
  const out = cells.slice(0, cols).map(cloneCell);
  while (out.length < cols) out.push(blankCell());
  return out;
}

export function makeFrame(cols: number, rows: number, cells?: ReadonlyArray<ReadonlyArray<Readonly<Cell>>>, cursor: Cursor = { x: 0, y: 0 }): Frame {
  const grid: Cell[][] = [];
  for (let y = 0; y < rows; y++) grid.push(padRow(cells?.[y] ?? [], cols));
  return { cols, rows, cells: grid, cursor: { x: cursor.x, y: cursor.y } };
}

/** Plain text rows -> frame with default attributes (a fixture helper shared by the tests and the adapter corpus). */
export function textToFrame(lines: ReadonlyArray<string>, cols = 80, rows = 25): Frame {
  const cells = lines.map((line) => Array.from(line).map((ch) => ({ ...blankCell(), ch })));
  return makeFrame(cols, rows, cells);
}

/** Rows as strings with trailing blanks trimmed (debugging and assertions). */
export function frameText(frame: Frame): string[] {
  return frame.cells.map((row) => row.map((c) => c.ch).join('').replace(/ +$/, ''));
}
