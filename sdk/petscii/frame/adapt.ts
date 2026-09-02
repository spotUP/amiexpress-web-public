/**
 * The C64 adapter's mechanical rule ladder (strategy rules 2-5): one
 * 80-column frame row in, one or more 40-column rows out.
 *
 *   crop    columns 0..39 (right half blank or one repeated border glyph)
 *   gutter  runs of 2+ spaces collapse to one; still wide -> split
 *   reflow  word wrap, attributes travel with their cell
 *   split   plain halves, blank second half dropped
 *
 * Rule 1 (pack override) and rule 6 (viewport) are Phases 4-5. A pinned
 * region names the rule for a span of source rows; 'auto' classifies.
 * A pin applies its rule UNCONDITIONALLY, including to rows that already fit
 * in `cols` - a pinned `gutter` collapses the double spaces of a 30-column
 * row, a pinned `reflow` rewraps it. Pin `auto` (or leave the row out of
 * every region) to keep the automatic ladder.
 *
 * Output invariant: every row has exactly `cols` cells. The row COUNT may
 * grow; adaptFrame shows the last `rows` of them - overflow pushes the frame
 * up like a terminal scroll, so the prompt a door just drew stays visible.
 *
 * `reflowRow` does NOT contain a word-wrap algorithm. It consumes the break
 * decisions of `wrapLineToWidth` (../wrap) - the same function
 * web/backend/src/utils/wrap-for-session.util.ts re-exports for session-width
 * prose - and re-attaches the source cells (colours and all) to the produced
 * lines. One wrapper, so the door adapter and the session wrap cannot drift;
 * `reflowRow == wrapLineToWidth` is pinned in
 * sdk/tests/petscii/frame/adapt.test.ts.
 *
 * Split halves are plain: no continuation glyph at column 39. A glyph there
 * either displaces cell 39 onto a third row or drops a character, and both
 * break the invariants the corpus pins (every row <= cols, split keeps every
 * cell). A pack-level marker is Phase 4's call.
 *
 * Pure TypeScript: no DOM, no Node imports.
 */
import { wrapLineToWidth } from '../wrap';
import { classifyRow, contentWidth } from './classify';
import { Cell, Cursor, Frame, cloneCell, isBlank, makeFrame, padRow } from './types';

export type AdaptRule = 'crop' | 'gutter' | 'reflow' | 'split';
export type RegionRule = AdaptRule | 'auto';

export interface RegionPin {
  /** Inclusive source row range. */
  rows: [number, number];
  rule: RegionRule;
}

export interface AdaptOptions {
  cols?: number;
  rows?: number;
  regions?: RegionPin[];
}

export interface AdaptedRow {
  cells: Cell[];
  source: number;
  rule: AdaptRule;
}

export interface AdaptResult {
  rows: AdaptedRow[];
  /** cursor.y indexes `rows`. */
  cursor: Cursor;
}

/**
 * Where a source column ended up: `row` is an OFFSET into the rows a single
 * rule produced, not a screen row, which is why this is not a `Cursor` (a
 * Cursor's `y` indexes the frame). `adaptRows` adds the row's base index to
 * turn one of these into a frame Cursor.
 */
export interface RuleCursor {
  row: number;
  x: number;
}

export interface RuleResult {
  rows: Cell[][];
  applied: AdaptRule;
  /** Source column -> { row offset within `rows`, x }. Total over 0..cells.length-1. */
  map: (x: number) => RuleCursor;
}

type Row = ReadonlyArray<Readonly<Cell>>;

const clampIndex = (cells: Row, x: number) => Math.max(0, Math.min(cells.length - 1, x));

const clampCol = (cols: number, x: number) => Math.max(0, Math.min(cols - 1, x));

/**
 * Stand-in for a reverse-video space while the row is handed to the text
 * wrapper. `isBlank` already treats a reverse space as content (it paints a
 * coloured block), so it must join a word rather than become a break the
 * wrapper is free to delete. Never leaves this module: only the substituted
 * TEXT is wrapped, the CELLS that come back are the originals.
 */
const RVS_SPACE = '\u0001';

/** Fits, or the right half is blank, or every non-blank cell of the right half is one repeated non-alphanumeric glyph (a border extension such as a rule of '='). */
export function isCroppable(cells: Row, cols: number): boolean {
  if (contentWidth(cells) <= cols) return true;
  const glyphs = cells.slice(cols).filter((c) => !isBlank(c));
  if (glyphs.length === 0) return true;
  const glyph = glyphs[0].ch;
  if (/[A-Za-z0-9]/.test(glyph)) return false;
  return glyphs.every((c) => c.ch === glyph && !c.rvs);
}

export function chooseRule(cells: Row, cols: number): AdaptRule {
  if (isCroppable(cells, cols)) return 'crop';
  switch (classifyRow(cells)) {
    case 'art': return 'split';
    case 'table': return 'gutter';
    default: return 'reflow';
  }
}

export function cropRow(cells: Row, cols: number): RuleResult {
  return {
    rows: [padRow(cells, cols)],
    applied: 'crop',
    map: (x) => ({ row: 0, x: clampCol(cols, x) }),
  };
}

export function splitRow(cells: Row, cols: number): RuleResult {
  const rows: Cell[][] = [];
  for (let start = 0; start < cells.length; start += cols) rows.push(padRow(cells.slice(start, start + cols), cols));
  if (rows.length === 0) rows.push(padRow([], cols));
  while (rows.length > 1 && rows[rows.length - 1].every(isBlank)) rows.pop();
  return {
    rows,
    applied: 'split',
    map: (x) => {
      const i = clampIndex(cells, x);
      return { row: Math.min(rows.length - 1, Math.floor(i / cols)), x: i % cols };
    },
  };
}

export function gutterRow(cells: Row, cols: number): RuleResult {
  const width = contentWidth(cells);
  const out: Cell[] = [];
  const colMap: number[] = new Array(cells.length);
  let i = 0;
  while (i < width) {
    if (isBlank(cells[i])) {
      const start = i;
      while (i < width && isBlank(cells[i])) i++;
      out.push(cloneCell(cells[start]));
      for (let k = start; k < i; k++) colMap[k] = out.length - 1;
      continue;
    }
    out.push(cloneCell(cells[i]));
    colMap[i] = out.length - 1;
    i++;
  }
  for (let k = width; k < cells.length; k++) colMap[k] = out.length + (k - width);
  if (out.length <= cols) {
    return {
      rows: [padRow(out, cols)],
      applied: 'gutter',
      map: (x) => ({ row: 0, x: clampCol(cols, colMap[clampIndex(cells, x)]) }),
    };
  }
  const split = splitRow(out, cols);
  return { rows: split.rows, applied: 'split', map: (x) => split.map(colMap[clampIndex(cells, x)]) };
}

export function reflowRow(cells: Row, cols: number): RuleResult {
  const width = contentWidth(cells);
  const text = cells
    .slice(0, width)
    .map((c) => (isBlank(c) ? ' ' : c.ch === ' ' ? RVS_SPACE : c.ch))
    .join('');
  const lines = wrapLineToWidth(text, cols);
  // The ONE divergence from wrapLineToWidth: an indent wider than the screen
  // is a whitespace piece the wrapper cannot fit, so it breaks on it and
  // emits an empty first line. A 40x25 screen has 25 rows and none of them
  // is worth spending on nothing, so that line is dropped here. (Only a
  // LEADING run can do this: a mid-line run breaks a non-empty current line.)
  while (lines.length > 1 && lines[0] === '') lines.shift();

  const rows: Cell[][] = [];
  const where: Array<RuleCursor | undefined> = new Array(cells.length);
  let si = 0;
  for (let li = 0; li < lines.length; li++) {
    if (lines[li][0] !== ' ') {
      // wrapLineToWidth deletes the whitespace run it broke on. A produced
      // line that starts with a space is the kept leading indent; anything
      // else means the spaces sitting at `si` were deleted, so consume them
      // and map them to the end of the row just closed (or to the start of
      // the first row, for an over-wide indent dropped above).
      const prev = rows[rows.length - 1];
      const at: RuleCursor = prev
        ? { row: rows.length - 1, x: clampCol(cols, prev.length) }
        : { row: 0, x: 0 };
      while (si < width && text[si] === ' ') { where[si] = at; si++; }
    }
    const line: Cell[] = [];
    for (let k = 0; k < lines[li].length && si < width; k++) {
      where[si] = { row: rows.length, x: line.length };
      line.push(cloneCell(cells[si]));
      si++;
    }
    rows.push(line);
  }
  if (rows.length === 0) rows.push([]);

  const lastRow = rows.length - 1;
  const lastLen = rows[lastRow].length;
  for (let k = width; k < cells.length; k++) where[k] = { row: lastRow, x: clampCol(cols, lastLen + (k - width)) };
  // Total map: a column the walk never reached (only reachable if the wrapper
  // emitted a line shorter than the text it consumed, which it does not)
  // falls back to the last known position rather than undefined.
  let previous: RuleCursor = { row: 0, x: 0 };
  for (let k = 0; k < where.length; k++) {
    if (where[k]) previous = where[k] as RuleCursor;
    else where[k] = previous;
  }

  return {
    rows: rows.map((r) => padRow(r, cols)),
    applied: 'reflow',
    map: (x) => where[clampIndex(cells, x)] as RuleCursor,
  };
}

export function applyRule(rule: AdaptRule, cells: Row, cols: number): RuleResult {
  switch (rule) {
    case 'crop': return cropRow(cells, cols);
    case 'gutter': return gutterRow(cells, cols);
    case 'reflow': return reflowRow(cells, cols);
    case 'split': return splitRow(cells, cols);
  }
}

function ruleFor(y: number, cells: Row, cols: number, regions: RegionPin[] | undefined): AdaptRule {
  const pin = regions?.find((r) => y >= r.rows[0] && y <= r.rows[1]);
  if (!pin || pin.rule === 'auto') return chooseRule(cells, cols);
  return pin.rule;
}

export function adaptRows(src: Frame, opts: AdaptOptions = {}): AdaptResult {
  const cols = opts.cols ?? 40;
  const rows: AdaptedRow[] = [];
  let cursor: Cursor = { x: 0, y: 0 };
  for (let y = 0; y < src.rows; y++) {
    const cells = src.cells[y];
    const result = applyRule(ruleFor(y, cells, cols, opts.regions), cells, cols);
    const first = rows.length;
    for (const r of result.rows) rows.push({ cells: r, source: y, rule: result.applied });
    if (y === src.cursor.y) {
      const m = result.map(src.cursor.x);
      cursor = { x: m.x, y: first + m.row };
    }
  }
  return { rows, cursor };
}

export function adaptFrame(src: Frame, opts: AdaptOptions = {}): Frame {
  const cols = opts.cols ?? 40;
  const rows = opts.rows ?? 25;
  const adapted = adaptRows(src, { ...opts, cols });
  const offset = Math.max(0, adapted.rows.length - rows);   // overflow pushes the frame up
  const visible = adapted.rows.slice(offset).map((r) => r.cells);
  return makeFrame(cols, rows, visible, {
    x: clampCol(cols, adapted.cursor.x),
    y: Math.max(0, Math.min(rows - 1, adapted.cursor.y - offset)),
  });
}
