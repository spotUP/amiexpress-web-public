/**
 * The C64 adapter's mechanical rule ladder (strategy rules 2-5): one
 * 80-column frame row in, one or more 40-column rows out.
 *
 *   crop      columns 0..39 (right half blank, one repeated border glyph, or
 *             the whole row is a horizontal rule - truncating one leaves one)
 *   deindent  drop the leading blanks when the row then fits (lossless)
 *   repeat    a row of IDENTICAL columns: as many whole copies as fit, rest dropped
 *   stat      a `Label: value` row: its columns PACK onto as many rows as they
 *             need, never split, so no value is shortened
 *   narrow    one row, columns preserved, over-wide cells truncated with '>'
 *   record    a two-field row (message + a right-hand author/tag): the left
 *             field reflows, the field stays flush against the right margin
 *   gutter    runs of 2+ spaces collapse to one; still wide -> split
 *   reflow    word wrap, attributes travel with their cell
 *   split     plain halves, blank second half dropped
 *
 * Ladder order: crop -> deindent -> record -> repeat -> stat -> narrow -> reflow/split. `narrow` exists
 * because splitting a TABLE in half puts its right-hand columns on a row of
 * their own with no header: that is how a 25-row door screen came out 34-46
 * rows and lost its title to tail-paging (rtw 46, ustats 35, what 34 before
 * Phase 3 Task 2). What `narrow` may drop is exactly two things, both
 * documented and pinned in the corpus test: the runs of blanks BETWEEN columns
 * (each gutter becomes one space) and the tail of a cell too wide to fit,
 * which is replaced by the truncation mark '>'.
 *
 * `record` exists for the OTHER shape a 68K door paints across 80 columns: a
 * RECORD - a variable-length left field and one compact right-hand field the
 * door has already positioned near column 80. dRE!WAll writes its comment at
 * column 0 and the author at column 61; dtagwall writes `[sysop]` at column 66.
 * The ladder had no notion of a field, so those rows went to `split` (author
 * re-landed at 61-40 = 21) or to `reflow` (author landed wherever the leftover
 * run of blanks happened to break), each entry cost two rows, and the sysop's
 * report was exactly that: "use the full 40 columns for the tags/usernames, the
 * usernames are not right aligned" and "long 80 column comments needs to be
 * split to two lines".
 *
 * The fix belongs at THIS level and not at three others that were considered:
 * not in the glyph encoder (it sees characters, not rows); not in the diff
 * renderer (it is handed cells and cannot know which of them are the author);
 * and not in a per-door pack (packs are for ART, Phase 4, and the shape is not
 * one door's - it is every wall-like and listing-like door's, which is the
 * reason the ladder exists at all). The one real alternative was to AMEND
 * `narrowRow` to accept a single gutter: rejected, because narrow keeps the row
 * on ONE row and pays for it in truncation, so a long comment would lose its
 * tail - the very thing the report asks to have wrapped instead. narrow is
 * right for a table of small fixed columns; record is right for a prose field
 * beside a name.
 *
 * What `record` guarantees a reader: the field is on the LAST row the record
 * produced, flush against column `cols`; a wrapped continuation row carries no
 * field. Reading down, every row up to and including the next field-bearing row
 * belongs to that field's author.
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
import { classifyRow, columnSpans, contentWidth, hasTabularGutters, isRuleRow, looksLikeAsciiArt, rowText } from './classify';
import { Cell, Cursor, Frame, blankCell, cloneCell, isBlank, makeFrame, padRow } from './types';

export type AdaptRule = 'crop' | 'deindent' | 'gutter' | 'narrow' | 'record' | 'repeat' | 'reflow' | 'split' | 'stat';
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

/** The truncation mark a narrowed column ends in: a plain PETSCII glyph, unlike an ellipsis. */
export const TRUNCATION_MARK = '>';

/** A narrowed column never falls below this: one character of content plus the mark. */
const MIN_COLUMN = 2;

/** Leading blanks of the row (its indent). */
function indentOf(cells: Row): number {
  const width = contentWidth(cells);
  let lead = 0;
  while (lead < width && isBlank(cells[lead])) lead++;
  return lead;
}

/**
 * A rule is croppable - but only while cropping keeps something. A rule drawn
 * entirely to the right of column `cols` would crop to an empty row, so it goes
 * down the ladder to `deindent` instead.
 */
function isCroppableRule(cells: Row, cols: number): boolean {
  return isRuleRow(cells) && indentOf(cells) < cols;
}

/**
 * The bottom of the ladder: what a row gets once crop, deindent, narrow and
 * record have all declined. Split out so a PINNED rule that declines can fall
 * back to the rule the row would have had, rather than to a guess.
 */
function classifiedRule(cells: Row): AdaptRule {
  switch (classifyRow(cells)) {
    // A bordered row only reaches here when `narrowRow` declined (a column
    // would have fallen below two cells). Then the old behaviour stands: the
    // gutter squeeze if there are gutters to squeeze, plain halves otherwise.
    case 'bordered': return hasTabularGutters(rowText(cells)) ? 'gutter' : 'split';
    case 'art': return 'split';
    case 'table': return 'gutter';
    default: return 'reflow';
  }
}

export function chooseRule(cells: Row, cols: number): AdaptRule {
  if (isCroppable(cells, cols) || isCroppableRule(cells, cols)) return 'crop';
  if (contentWidth(cells) - indentOf(cells) <= cols) return 'deindent';
  // BEFORE narrow since 2026-09-06. `narrowRow` matches any row with two or
  // more gutters, and a wall comment with two spaces in it has two gutters plus
  // the author's, so narrow used to answer first and shorten the caller's own
  // words with '>'. The two rungs shorten and wrap respectively, and losing
  // characters is worse than losing column alignment, so where both match the
  // one that keeps every character wins. `recordFields`' guards are what stop
  // this from eating real tables: a table's last column is prose (it contains a
  // blank) or decoration (no alphanumeric), and neither is a field.
  if (recordRow(cells, cols) !== null) return 'record';
  // BEFORE narrow, and only ever instead of it: a row of identical columns is
  // decoration, and narrow would shorten every copy.
  if (repeatRow(cells, cols) !== null) return 'repeat';
  // BEFORE narrow, and only ever instead of it: on a `Label: value` row the
  // widest column is the VALUE, so narrow shortens exactly the thing that
  // cannot survive being shortened. See `statRow`.
  if (statRow(cells, cols) !== null) return 'stat';
  if (narrowRow(cells, cols) !== null) return 'narrow';
  return classifiedRule(cells);
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

/**
 * LOSSLESS: drop the row's leading blanks when the row then fits. Only blanks
 * are lost, which is what saves a centred banner - `----->>>> uSEr StAtS
 * <<<<-----` sitting at column 24 is 54 columns wide and 30 columns of
 * content - from being cut in half.
 */
export function deindentRow(cells: Row, cols: number): RuleResult {
  const lead = indentOf(cells);
  return {
    rows: [padRow(cells.slice(lead).map(cloneCell), cols)],
    applied: 'deindent',
    map: (x) => ({ row: 0, x: clampCol(cols, clampIndex(cells, x) - lead) }),
  };
}

/**
 * LOSSY, one row, columns preserved: the rung that keeps a table a table.
 *
 * A bordered or gutter-columned row IS a table, and splitting a table in half
 * puts its right-hand columns on a row of their own with no header - which is
 * how a 25-row door screen became 34-46 rows and lost its title to tail-paging.
 * Narrowing keeps every column in place and in order and pays for it in
 * characters, which is the trade a 40-column screen exists to make.
 *
 * The columns come from `columnSpans`; the outer border parts are already
 * dropped there. Each gutter between two columns becomes ONE space, then the
 * WIDEST column is shrunk one cell at a time until the row fits - widest
 * first, so a two-character node number survives whole while a 40-character
 * description gives up its tail. A shortened column ends in TRUNCATION_MARK.
 *
 * DECLINES (returns null) when there is no column structure, or when the
 * shrink would take a column below MIN_COLUMN cells: the caller then falls
 * through to reflow/split exactly as before. It never drops a column, because
 * a table with a column missing is worse than a table cut in half - the reader
 * cannot tell which column is gone.
 */
export function narrowRow(cells: Row, cols: number): RuleResult | null {
  const spans = columnSpans(cells);
  if (spans.length === 0) return null;

  const widths = spans.map(([a, b]) => b - a);
  let total = widths.reduce((n, w) => n + w, 0) + (widths.length - 1);
  while (total > cols) {
    let widest = 0;
    for (let i = 1; i < widths.length; i++) if (widths[i] > widths[widest]) widest = i;
    if (widths[widest] <= MIN_COLUMN) return null;
    widths[widest]--;
    total--;
  }

  const out: Cell[] = [];
  const base: number[] = [];
  for (let i = 0; i < spans.length; i++) {
    if (i > 0) out.push(blankCell());
    base.push(out.length);
    const [a, b] = spans[i];
    const shortened = widths[i] < b - a;
    const kept = shortened ? widths[i] - 1 : widths[i];
    for (let k = 0; k < kept; k++) out.push(cloneCell(cells[a + k]));
    // The mark wears the colour of the last cell it stands for, so a narrowed
    // column does not change colour at its own truncation.
    if (shortened) out.push({ ...cloneCell(cells[a + kept - 1]), ch: TRUNCATION_MARK, rvs: false });
  }

  // Total map over 0..cells.length-1: a column inside part i lands on its own
  // cell (or on the part's last surviving cell); a border, a gutter or the
  // trailing blanks land on the nearest position of the part just closed.
  const where: number[] = new Array(cells.length);
  let at = base[0];
  let si = 0;
  for (let x = 0; x < cells.length; x++) {
    while (si < spans.length && x >= spans[si][1]) {
      at = base[si] + widths[si] - 1;
      if (si < spans.length - 1) at += 1;                 // the gutter cell after this part
      si++;
    }
    if (si < spans.length && x >= spans[si][0]) at = base[si] + Math.min(x - spans[si][0], widths[si] - 1);
    where[x] = clampCol(cols, at);
  }

  return {
    rows: [padRow(out, cols)],
    applied: 'narrow',
    map: (x) => ({ row: 0, x: where[clampIndex(cells, x)] }),
  };
}

/**
 * The two fields of a RECORD row: a left field and one compact right-hand
 * field, in SOURCE columns `[start, end)`, both trimmed.
 */
export interface RecordFields {
  left: [number, number];
  right: [number, number];
}

const hasAlnum = (cells: Row, [a, b]: [number, number]) => {
  for (let x = a; x < b; x++) if (/[A-Za-z0-9]/.test(cells[x].ch)) return true;
  return false;
};

/** A span with a blank in it is not an ATOM: it is prose, or two columns read as one. */
const hasBlank = (cells: Row, [a, b]: [number, number]) => {
  for (let x = a; x < b; x++) if (isBlank(cells[x])) return true;
  return false;
};

/**
 * The row is a RECORD: a message, a run of blanks, and a right-hand field that
 * is a single atom - a username, a handle, a tag.
 *
 * The separator is the LAST run of two or more blanks, and everything left of
 * it is the message, its own spacing included. It was the ONLY run until
 * 2026-09-06, and that was wrong: a caller who types "yeah! dre!wall is  40 col
 * petscii ok  now" into dRE!WAll writes a message with two runs of its own, the
 * row then had four columns rather than two, `narrowRow` - consulted first -
 * matched, and the sysop got `yeah! dre!wal> 40 col petscii> now sysop`, with
 * his own words shortened away. A message's internal spacing is typing, not
 * structure; only the last gutter is the record's own. (This is also why the
 * ladder now asks `record` BEFORE `narrow`: see `chooseRule`.)
 *
 * Every condition below is a guard against reading a sentence, or a table, as a
 * record, and each was checked against every frame of the whole 23-fixture 68K
 * corpus (the rows it must NOT take are named):
 *
 * - The right field starts at or after `cols`. It is the fact that the field
 *   sits in the half of the row a 40-column screen cannot show that makes it a
 *   field rather than a word after a wide space.
 * - (GONE, 2026-09-06: the right field had to contain NO BLANK AT ALL.) It cost
 *   DATA. `GWALL`'s wall carries two-word handles, and
 *   `|Right on, great door archive!  ...  -Karyn Roberts¦TAU|` declined on the
 *   single space inside the handle, fell through to `narrow` - which sees one
 *   bordered column and truncates it - and reached the caller as
 *   `Right on, great door archive!          >` with the author GONE. A handle
 *   with a space in it is still one thing and still moves as one thing.
 *
 *   What the guard was FOR - keeping the door's own padding out of the field,
 *   so a two-column right half is not right-aligned as if it were a name - the
 *   SEPARATOR RULE already guarantees: the separator is the LAST run of two or
 *   more blanks, so no such run can survive inside the field. That property is
 *   asserted over every row of every fixture in corpus.test.ts rather than
 *   re-tested here, because a second copy of it in this function would be a
 *   branch no row can reach. The guards that actually carry the load are the
 *   five below.
 *
 *   The price was measured over every frame of every fixture and it is paid in
 *   ROWS, never in characters: `what` 25->27, `b` 30->29, `j` 27->26,
 *   `six_status` 33->35, `ratiorep` 31->30, `super_stats` 31->28,
 *   `kd_confstats` 25->25. Every one of those rows is LOSSLESS where `narrow`
 *   or `split` had been lossy or misaligned - `what` keeps `Total bytes:
 *   [ 0 ]` instead of stopping at `Total files: [ >`, `kd_confstats` keeps
 *   `AmiExpress-Web` instead of `Ami>`. Rows are the currency this rung spends;
 *   data is not.
 * - Both fields contain at least one alphanumeric. Keeps decoration out:
 *   `super_stats` row 18 ends in a lone '.', `j` rows 8-12 in a lone '|'.
 * - The field plus one character of content fits in `cols`. A field that fills
 *   the screen on its own is not a field any more.
 * - The separator is STRICTLY WIDER than every gutter inside the message. A
 *   record's field is reached by PADDING - dRE!WAll pads its message into 61
 *   columns - and padding is by construction wider than the spacing inside a
 *   sentence, while prose has no such gutter at all. This is what keeps the
 *   rung off the row the caller is TYPING INTO: the door's prompt row grows
 *   into "Enter your Line: yeah! dre!wall is  40 col petscii ok  now", whose
 *   last gap is the caller's own double space and no wider than the ones before
 *   it, so `now` is a word and not an author. Without this guard that word was
 *   right-aligned to column 40 and jumped there as he typed, which is the
 *   "input line wrapped weirdly" of the second report.
 * - The row is not a TABLE OF ATOMS. When `columnSpans` sees two or more
 *   columns and EVERY one of them is blank-free, the row is a table of column
 *   labels - `who`'s header, "ND#/Calls    User/PhoneNumber    Location/Action",
 *   is exactly this - and `narrow` keeps it one row tall over its data rows,
 *   which is what a header is for. A record cannot be that: two or more columns
 *   means the message carries an internal gutter of its own, so the message is
 *   never an atom. This is the ONE place the two rungs really compete, and it
 *   is decided on structure - a table's cells are atoms, a sentence broken by a
 *   double space is not - rather than on a width threshold.
 * - The LEFT field is not ART by the board's own frozen detector. A record's
 *   left field is a MESSAGE, and reflowing it is the whole point; a left field
 *   made of decoration means the row is art and `split` already owns it. This
 *   is what keeps `rtw`'s half-painted menu row out - 60 columns of block
 *   glyphs beside `[E....LEAV`, which has no blank in it and would otherwise
 *   read as a tag. Reusing `looksLikeAsciiArt` rather than capping the field's
 *   width keeps the decision on the classifier the rest of the ladder already
 *   agrees with, instead of on a tuned constant.
 */
export function recordFields(cells: Row, cols: number): RecordFields | null {
  const width = contentWidth(cells);
  if (width === 0) return null;
  const indent = indentOf(cells);
  const runs: Array<[number, number]> = [];
  for (let x = indent; x < width; x++) {
    if (!isBlank(cells[x])) continue;
    const start = x;
    while (x < width && isBlank(cells[x])) x++;
    if (x < width && x - start >= 2) runs.push([start, x]);   // interior only
  }
  if (runs.length === 0) return null;

  const gutter = runs[runs.length - 1];                        // the LAST run separates the field
  const left: [number, number] = [indent, gutter[0]];
  const right: [number, number] = [gutter[1], width];
  if (left[1] <= left[0] || right[1] <= right[0]) return null;
  if (right[0] < cols) return null;
  if (right[1] - right[0] + 2 > cols) return null;
  if (!hasAlnum(cells, left) || !hasAlnum(cells, right)) return null;
  const widest = Math.max(...runs.map(([a, b]) => b - a));
  if (gutter[1] - gutter[0] < widest) return null;
  if (runs.length > 1 && gutter[1] - gutter[0] === widest
      && runs.slice(0, -1).some(([a, b]) => b - a === widest)) return null;

  const columns = columnSpans(cells);
  if (columns.length >= 2 && columns.every(([a, b]) => !hasBlank(cells, [a, b]))) return null;
  if (looksLikeAsciiArt(rowText(cells.slice(left[0], left[1])))) return null;
  return { left, right };
}

/**
 * The record rung: the left field reflows across as many rows as it needs and
 * the right-hand field is placed FLUSH AGAINST COLUMN `cols` on the LAST of
 * them - on a row of its own only when the reflowed tail leaves no room for it
 * plus one separating blank.
 *
 * Loses nothing: every character of both fields survives, which is why the
 * corpus's reflow invariant (the row's non-blank characters, in order, are
 * unchanged) holds for this rule too. What it drops is the run of blanks
 * between the fields, exactly as `narrow` and `gutter` do.
 *
 * DECLINES (returns null) on any row that is not a record; the caller falls
 * through to the classified rule unchanged.
 */
export function recordRow(cells: Row, cols: number): RuleResult | null {
  const fields = recordFields(cells, cols);
  if (!fields) return null;
  const { left, right } = fields;

  const flowed = reflowRow(cells.slice(left[0], left[1]), cols);
  const rows = flowed.rows.map((r) => r.map(cloneCell));
  const fieldLen = right[1] - right[0];
  const at = cols - fieldLen;

  let last = rows.length - 1;
  if (contentWidth(rows[last]) + 1 > at) { rows.push(padRow([], cols)); last = rows.length - 1; }
  for (let k = 0; k < fieldLen; k++) rows[last][at + k] = cloneCell(cells[right[0] + k]);

  // Total map over 0..cells.length-1. The indent and the gutter belong to the
  // rows either side of them, so the cursor never lands in a place the reader
  // sees nothing: an indent column maps to the start of the first row, a
  // gutter column to the end of the left field's last row, and anything past
  // the field to the field's last cell.
  const where: RuleCursor[] = new Array(cells.length);
  const leftEnd: RuleCursor = flowed.map(Math.max(0, left[1] - left[0] - 1));
  for (let x = 0; x < cells.length; x++) {
    if (x < left[0]) where[x] = { row: 0, x: 0 };
    else if (x < left[1]) where[x] = flowed.map(x - left[0]);
    else if (x < right[0]) where[x] = { row: leftEnd.row, x: clampCol(cols, leftEnd.x + 1) };
    else if (x < right[1]) where[x] = { row: last, x: at + (x - right[0]) };
    else where[x] = { row: last, x: clampCol(cols, cols - 1) };
  }

  return { rows, applied: 'record', map: (x) => where[clampIndex(cells, x)] };
}

/**
 * A row of IDENTICAL columns - decoration, not data: as many WHOLE copies as
 * fit, joined by one blank, and the rest dropped.
 *
 * dRE!WAll's STYLE.1 is `| Dre!Wall | Dre!Wall | ... |`, seven times. It has
 * column structure, so `narrow` owned it and shrank the widest column over and
 * over until the row fit, which at 40 columns reached the sysop as
 * `Dre> Dre!> Dre!> Dre!> Dre!> Dre!> Dre!>` - every copy mangled and not one
 * of them readable.
 *
 * `narrow`'s reason for never dropping a column is written into its own doc:
 * "a table with a column missing is worse than a table cut in half - the reader
 * cannot tell which column is gone". That reason is CONDITIONED on the columns
 * differing. When they are the same token the reader can tell exactly what is
 * missing - more of the same - so the trade inverts: dropping copies costs
 * redundancy, shortening every copy costs the content of all of them. This is
 * the alphanumeric case of a rule `isCroppable` already applies to a repeated
 * non-alphanumeric GLYPH (a rule of '=' truncated at 40 is still a rule, and it
 * carries no mark either).
 *
 * Measured over every frame of all 23 corpus fixtures: exactly two rows have
 * all-identical columns (`color_wall`'s "_____" x6 and `ulist`'s "." x7) and
 * both already reach `crop` first, so this rung moves no corpus row. It exists
 * for the style rows the harness capture cannot reach.
 *
 * DECLINES when there are fewer than two columns, when they are not all the
 * same, when one copy cannot fit `cols`, or when every copy fits anyway - in
 * that last case `narrow` produces the row without shortening anything and is
 * the better answer.
 */
export function repeatRow(cells: Row, cols: number): RuleResult | null {
  const spans = columnSpans(cells);
  if (spans.length < 2) return null;
  const textOf = ([a, b]: [number, number]) => cells.slice(a, b).map((c) => c.ch).join('');
  const first = textOf(spans[0]);
  if (!spans.every((span) => textOf(span) === first)) return null;

  const width = spans[0][1] - spans[0][0];
  if (width > cols) return null;
  let keep = 1;
  while (keep < spans.length && (keep + 1) * width + keep <= cols) keep++;
  if (keep >= spans.length) return null;          // it all fits: narrow loses nothing

  const out: Cell[] = [];
  const base: number[] = [];
  for (let i = 0; i < keep; i++) {
    if (i > 0) out.push(blankCell());
    base.push(out.length);
    for (let x = spans[i][0]; x < spans[i][1]; x++) out.push(cloneCell(cells[x]));
  }

  // Total map: a column inside a kept copy lands on its own cell; a border, a
  // gutter, a dropped copy or the trailing blanks land on the last cell kept.
  const last = out.length - 1;
  const where: number[] = new Array(cells.length);
  for (let x = 0; x < cells.length; x++) {
    let at = last;
    for (let i = 0; i < keep; i++) {
      if (x >= spans[i][0] && x < spans[i][1]) { at = base[i] + (x - spans[i][0]); break; }
    }
    where[x] = clampCol(cols, at);
  }

  return {
    rows: [padRow(out, cols)],
    applied: 'repeat',
    map: (x) => ({ row: 0, x: where[clampIndex(cells, x)] }),
  };
}

/**
 * A span is a LABEL when it carries a colon with an alphanumeric before it, in
 * the same column: `Bytes:`, `Init Baud is:`, `Top Uploader Last Period:`. The
 * bare `:` that `ctop` leaves in a column of its own after
 * `Top Uploader Record     : DeaTure` is deliberately NOT one - it is a
 * separator the door padded away from its label, and one of those alone is not
 * evidence that the row is a stat row.
 */
/** The span's last non-blank character is a colon: a label with its value padded into the NEXT column. */
function danglingLabel(cells: Row, [a, b]: [number, number]): boolean {
  for (let x = b - 1; x >= a; x--) if (!isBlank(cells[x])) return cells[x].ch === ':';
  return false;
}

/** Width of a bound group of columns, one blank between each. */
const unitWidth = (unit: number[], widths: number[]) =>
  unit.reduce((n, i) => n + widths[i], 0) + (unit.length - 1);

function isLabelSpan(cells: Row, [a, b]: [number, number]): boolean {
  let alnum = false;
  for (let x = a; x < b; x++) {
    if (/[A-Za-z0-9]/.test(cells[x].ch)) { alnum = true; continue; }
    if (cells[x].ch === ':' && alnum) return true;
  }
  return false;
}

/**
 * LOSSLESS, as many rows as it takes: the rung for a `Label: value` row.
 *
 * `narrow` shrinks the WIDEST column until the row fits. On a table of small
 * fixed columns that is right - it costs a description its tail and keeps the
 * table one row tall. On a label/value row it is exactly wrong, because the
 * widest column is the one carrying the VALUE:
 *
 *   ctop     `Bytes:   2,020,282,473`   narrowed to   `Bytes: 2,020,282>`
 *   ctop     `Top Uploader Last Period: NONE`   narrowed to   `Top Uploader Last Per>`
 *   SysInfo  `Init Baud is: 115200 Baud`  narrowed to  `Init Baud is: >`
 *   SysInfo  `Sysop Status: Busy at the Moment!`  narrowed to  `Sysop Status: B>`
 *
 * `2,020,282>` is not a shortened number, it is a DIFFERENT number, and the
 * others are values deleted outright. An abbreviated label is still readable; a
 * truncated value is simply wrong. So this rung never shortens anything: it
 * PACKS the row's columns onto as many 40-column rows as they need, one blank
 * between columns, and never splits a column across a row boundary. A column's
 * own internal padding collapses to one blank, which is the same thing `narrow`
 * and `gutter` already do and the only thing this rung drops.
 *
 * WHY PACKING RATHER THAN ABBREVIATING THE LABEL IN PLACE: the label of
 * `2,020,282,473 Files:` is `Files:` and it sits AFTER its own number, while
 * the label of `Top Uploader Last Period: NONE` sits before it, and `ctop`
 * paints both shapes in the same row. Deciding which side of a column is the
 * label needs the door's intent; deciding that a column must not be cut in half
 * needs only its boundaries, which `columnSpans` already knows. The weaker
 * decision is the one that always holds, so it is the one the rung is built on.
 *
 * A column that is NOTHING BUT A LABEL (`Bytes:`) is bound to the column after
 * it, because on its own it says nothing: `ctop` pads `Bytes:` and its number
 * into separate columns and packing them separately stranded `Bytes:` at the
 * end of one row with its `0` at the start of the next. The binding is dropped
 * the moment the bound group would not fit a row, so it can never create a
 * group the rung then has to cut.
 *
 * DECLINES (returns null), and the caller falls through to `narrow`, when:
 *
 * - the columns joined by single blanks already FIT. `narrow` then shortens
 *   nothing and keeps the row one row tall, which is strictly better.
 * - there are fewer than two columns. One column is not a row of fields; it is
 *   prose or a banner, and `reflow`/`deindent` own it.
 * - NO column is a label (`isLabelSpan`). This is the guard that keeps the
 *   rung off tables: `ulist`'s ten user rows, `who`'s node rows and `ustats`'
 *   file listings carry no colon-labelled column, and a table packed
 *   column-by-column stops being a table - its rows stop lining up, which is
 *   the whole reason `narrow` exists.
 * - ONE COLUMN IS WIDER THAN THE SCREEN. This is the honest-degradation case:
 *   the rung cannot place that column without cutting it, and cutting it
 *   silently is the defect it exists to remove. It declines instead, `narrow`
 *   takes the row, and the reader sees the truncation mark '>' - a visible
 *   statement that something was cut, in the one case where nothing else is
 *   possible at 40 columns.
 */
export function statRow(cells: Row, cols: number): RuleResult | null {
  const spans = columnSpans(cells);
  if (spans.length < 2) return null;
  // Each column as the source indices it KEEPS: a run of blanks inside a
  // column collapses to its first cell, the same squeeze `gutter` applies.
  const kept = spans.map(([a, b]) => {
    const keep: number[] = [];
    for (let x = a; x < b; x++) {
      if (isBlank(cells[x]) && x > a && isBlank(cells[x - 1])) continue;
      keep.push(x);
    }
    return keep;
  });
  const widths = kept.map((k) => k.length);
  if (widths.reduce((n, w) => n + w, 0) + (widths.length - 1) <= cols) return null;
  if (!spans.some((span) => isLabelSpan(cells, span))) return null;
  if (widths.some((w) => w > cols)) return null;

  // A column that is NOTHING BUT A LABEL means nothing on its own, so it is
  // bound to the column after it and the two are placed together or not at
  // all. `ctop` pads `Bytes:` and its number into separate columns, and
  // packing them separately stranded `Bytes:` at the end of one row with its
  // `0` at the start of the next. Binding stops as soon as the bound group
  // would not fit a row, so no group is ever wider than the screen.
  const units: number[][] = [];
  for (let i = 0; i < spans.length; i++) {
    const last = units[units.length - 1];
    const bound = last !== undefined
      && danglingLabel(cells, spans[last[last.length - 1]])
      && unitWidth(last, widths) + 1 + widths[i] <= cols;
    if (bound) last.push(i);
    else units.push([i]);
  }

  const rows: Cell[][] = [];
  const where: Array<RuleCursor | undefined> = new Array(cells.length);
  let line: Cell[] = [];
  for (const unit of units) {
    if (line.length > 0 && line.length + 1 + unitWidth(unit, widths) > cols) { rows.push(line); line = []; }
    for (const i of unit) {
      if (line.length > 0) line.push(blankCell());
      let x = spans[i][0];
      for (const source of kept[i]) {
        const at: RuleCursor = { row: rows.length, x: clampCol(cols, line.length) };
        // every source cell up to and including this one - i.e. the blanks a
        // collapsed run dropped - answers with the cell that stands for them
        for (; x <= source; x++) where[x] = at;
        line.push(cloneCell(cells[source]));
      }
    }
  }
  if (line.length > 0) rows.push(line);

  // Total map over 0..cells.length-1: the indent, the gutters and the trailing
  // blanks land at the last position a real column reached (or at the very
  // start, before the first one).
  let previous: RuleCursor = { row: 0, x: 0 };
  for (let k = 0; k < where.length; k++) {
    if (where[k]) previous = where[k] as RuleCursor;
    else where[k] = previous;
  }

  return {
    rows: rows.map((r) => padRow(r, cols)),
    applied: 'stat',
    map: (x) => where[clampIndex(cells, x)] as RuleCursor,
  };
}

export function applyRule(rule: AdaptRule, cells: Row, cols: number): RuleResult {
  switch (rule) {
    case 'crop': return cropRow(cells, cols);
    case 'deindent': return deindentRow(cells, cols);
    // A pinned 'narrow' on a row `narrowRow` declines falls through to the
    // rule it would have had before the ladder grew: plain halves.
    case 'narrow': return narrowRow(cells, cols) ?? splitRow(cells, cols);
    // A pinned 'repeat' on a row whose columns are not all the same falls
    // through to the rung that owns columnar rows.
    case 'repeat': return repeatRow(cells, cols) ?? applyRule('narrow', cells, cols);
    // A pinned 'record' on a row that is not one falls through to the rule the
    // row would have had without the pin.
    case 'record': return recordRow(cells, cols) ?? applyRule(classifiedRule(cells), cells, cols);
    // A pinned 'stat' on a row it declines falls through to the rung that owns
    // columnar rows, exactly as a pinned 'repeat' does.
    case 'stat': return statRow(cells, cols) ?? applyRule('narrow', cells, cols);
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
