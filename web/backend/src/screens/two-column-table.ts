/**
 * A TABLE PRINTED IN TWO COLUMNS, STACKED FOR A FORTY-COLUMN CALLER.
 *
 * MultiTop writes the board's top-user bulletins as one table printed twice
 * across an eighty-column page: `No# Username (Handle) Msgs` on the left,
 * the same three columns again on the right, thirty names in fifteen rows.
 * At forty columns the ladder's `narrow` rung does what it is written to do -
 * it shortens the runs of blanks between columns until the row fits - and
 * what comes back is ` 1. Phantasm 1 16. Creep 0`: every character present,
 * no column anywhere. The sysop, 2026-09-22, with the screenshot: "those
 * zeroes are not aligned", "the second column is not aligned at all".
 *
 * No row-local rung can fix it, because the row is not one record. It is TWO,
 * and each of them already fits a C64's screen - the halves are 38 columns
 * wide with a single blank between them. The fix is therefore not a better
 * squeeze but a different SHAPE: the block is read as one list and printed
 * down the screen instead of across it, left-hand column first and then the
 * right, each half exactly as the board drew it.
 *
 * The header and the rule are part of the block and so are printed twice,
 * once above each half. That is what the second group needs to be readable,
 * and it is what a forty-column table would have been drawn as in the first
 * place.
 *
 * THIS IS A SCREEN RULE, not a door rule. It is handed to `adaptRows` through
 * the block hook the SDK already exposes, so the ladder every 68K door goes
 * through is untouched - a door's table is one column and has no gutter for
 * this to find.
 */
import type { Cell, Frame } from '@amiexpress/bbs-door-sdk/petscii/frame';

/** Rows a candidate block must have before it is one: header, rule, a row. */
const MIN_BLOCK_ROWS = 3;

/**
 * How many rows of a stacked table a C64 screen can hold.
 *
 * Rows of the BLOCK - its header, its rule and the entries under them - not
 * rows of the screen. Thirteen is what leaves a whole MultiTop bulletin at
 * twenty-three adapted rows, measured on the live `bull1.txt` and
 * `bull3.txt`: the masthead is three, the totals block wraps to four at
 * forty columns, and the board writes its own `(Pause)` prompt under all of
 * it. Fifteen fits the glass exactly and leaves the prompt nowhere to go.
 *
 * The sysop, 2026-09-22, looking at the stacked table: "the multitop bulls
 * are too tall cut the last positions in the chart to fit it". Thirty
 * entries stacked are forty rows with the chrome, and a caller who has to
 * page through a top-fifteen list to reach a second top-fifteen list is
 * reading two screens where the door meant one.
 */
const FITS_ONE_SCREEN = 15;

/** How different the two halves may be and still be the same table twice. */
const HALF_WIDTH_SLACK = 2;

const isBlank = (cell: Cell | undefined): boolean => cell === undefined || cell.ch === ' ';
const hasAlnum = (cells: readonly Cell[]): boolean => cells.some(c => /[A-Za-z0-9]/.test(c.ch));

/** The row's width with its trailing blanks dropped. */
function contentWidth(cells: readonly Cell[]): number {
  let width = cells.length;
  while (width > 0 && isBlank(cells[width - 1])) width--;
  return width;
}

/** A row of `===---===` and nothing else: decoration, and it splits anywhere. */
function isRule(cells: readonly Cell[]): boolean {
  const width = contentWidth(cells);
  if (width === 0) return false;
  return !hasAlnum(cells.slice(0, width));
}

/**
 * The column a row divides at, or null.
 *
 * A blank that leaves a printable half on each side, both of them narrow
 * enough for the caller's screen and within `HALF_WIDTH_SLACK` of each other
 * - the last condition is what tells "the same table twice" from a row that
 * happens to have a wide gap in it.
 */
function splitColumn(cells: readonly Cell[], cols: number): number | null {
  const width = contentWidth(cells);
  if (width <= cols) return null;
  for (let g = 1; g < width - 1; g++) {
    if (!isBlank(cells[g])) continue;
    const leftWidth = contentWidth(cells.slice(0, g));
    const rightWidth = width - (g + 1);
    if (leftWidth === 0 || rightWidth <= 0) continue;
    if (leftWidth > cols || rightWidth > cols) continue;
    if (Math.abs(leftWidth - rightWidth) > HALF_WIDTH_SLACK) continue;
    if (!hasAlnum(cells.slice(0, g)) || !hasAlnum(cells.slice(g + 1, width))) continue;
    return g;
  }
  return null;
}

/** Does this row divide at `g` - as a table row, or as the rule under one? */
function splitsAt(cells: readonly Cell[], g: number, cols: number): boolean {
  const width = contentWidth(cells);
  if (width <= cols || width <= g + 1) return false;
  if (width - (g + 1) > cols) return false;
  if (contentWidth(cells.slice(0, g)) > cols) return false;
  // A rule row carries its own separator glyph where the data rows carry a
  // blank; it is decoration either way and the separator is dropped with the
  // gutter.
  return isBlank(cells[g]) || isRule(cells);
}

function half(cells: readonly Cell[], from: number, to: number, cols: number): Cell[] {
  const out = cells.slice(from, Math.min(to, from + cols)).map(c => ({ ...c }));
  const blank: Cell = { ...(cells[from] ?? { ch: ' ', fg: 1, rvs: false } as Cell), ch: ' ', rvs: false };
  while (out.length < cols) out.push({ ...blank });
  return out;
}

/**
 * The block hook: at row `y`, either a stacked two-column table or nothing.
 *
 * Answers null for every row that does not begin one, which is every row of
 * every screen that is not this shape - the hook is asked at each row and
 * costs a scan of that row when it declines.
 */
export function twoColumnTableBlock(frame: Frame, y: number, cols: number): { rows: Cell[][]; consumed: number } | null {
  const first = frame.cells[y];
  if (!first) return null;
  const gutter = splitColumn(first, cols);
  if (gutter === null) return null;

  let end = y;
  while (end + 1 < frame.rows && splitsAt(frame.cells[end + 1], gutter, cols)) end++;
  const consumed = end - y + 1;
  if (consumed < MIN_BLOCK_ROWS) return null;

  /*
   * A TABLE HAS A RULE UNDER ITS HEADER. A MENU DOES NOT.
   *
   * Splitting into two halves that each fit is a weak test, and the corpus
   * proved it the moment these rules were offered to a door: BBSLINK's game
   * list is `[BRE] BARREN REALMS ELITE` printed twice across the page, it
   * divides exactly like a chart, and stacking it swallowed the menu's own
   * title. MultiTop draws `===-===============-====` under its header and
   * every board table of this shape does; a menu has nothing there.
   */
  let hasRule = false;
  for (let k = y; k <= end && !hasRule; k++) hasRule = isRule(frame.cells[k]);
  if (!hasRule) return null;

  const rows: Cell[][] = [];
  /*
   * The first rows of the left column, and then the block's LAST row
   * whatever happens: that row is the rule under the table, and a table
   * that stops without one reads as a screen that was cut off rather than a
   * chart with a bottom.
   */
  for (let k = y; k <= end && rows.length < FITS_ONE_SCREEN; k++) {
    rows.push(half(frame.cells[k], 0, gutter, cols));
  }
  const cut = rows.length < end - y + 1;
  if (cut) rows.push(half(frame.cells[end], 0, gutter, cols));
  /*
   * THE SECOND HALF ONLY WHEN IT FITS. A table long enough to fill a C64's
   * screen with its left column alone is cut there: the caller reads the top
   * of the chart, which is what a top-N chart is for, instead of paging to a
   * second copy of the header and fifteen more places. A SHORT table - four
   * names printed twice across an eighty-column page - still gets both
   * halves, because both fit.
   */
  if (!cut) {
    for (let k = y; k <= end; k++) {
      rows.push(half(frame.cells[k], gutter + 1, contentWidth(frame.cells[k]), cols));
    }
  }
  return { rows, consumed };
}
