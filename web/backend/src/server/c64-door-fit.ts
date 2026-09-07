/**
 * Making a door's screen FIT the 25 rows a C64 caller has, so xim/io.ts never
 * has to open a pause on it.
 *
 * The rule ladder can only make a screen taller: an 80-column row that will not
 * fit 40 becomes two. Measured over the corpus, `ctop` needs 27 rows where it
 * used 22, `gwall` 28 where it used 23. Everything past 25 is a page the caller
 * is prompted through, and the sysop asked for those prompts to stop
 * (2026-09-07).
 *
 * Two reducers, in the order they are applied, each doing NOTHING while the
 * screen already fits:
 *
 *   1. `collapseBlankRunsToFit` - vertical whitespace only. An empty
 *      conference is eleven blank rows between ctop's ruled header and its
 *      totals; at 40 columns a row is worth more than the gap.
 *   2. `dropOldestEntriesToFit` - the OLDEST entries of a wall, and only for a
 *      door that declares `C64_DROP_OLDEST`. Nothing infers this: a table's
 *      first row is its oldest only where the door says so.
 *
 * Both work on the SOURCE frame and re-measure through the real ladder after
 * every step, because how many rows a source row costs is the ladder's answer,
 * not something this file may assume.
 */
import {
  adaptRows,
  blankCell,
  isBlank,
  isRuleRow,
  makeFrame,
  type Cell,
  type Frame,
} from '@amiexpress/bbs-door-sdk/petscii/frame';

export interface FitOptions {
  /** The caller's columns - what the ladder adapts to. */
  cols: number;
  /** The caller's rows - what has to fit. */
  rows: number;
}

/** Painted height of `frame` once the ladder has had it: blank tail excluded. */
export function adaptedHeight(frame: Frame, cols: number): number {
  const { rows } = adaptRows(frame, { cols });
  let end = rows.length;
  while (end > 0 && rows[end - 1].cells.every(isBlank)) end--;
  return end;
}

/** The same frame with source row `y` removed and everything below it moved up. */
function withoutRow(frame: Frame, y: number): Frame {
  const kept: Cell[][] = frame.cells
    .filter((_, i) => i !== y)
    .map((row) => row.map((c) => ({ ...c })));
  kept.push(Array.from({ length: frame.cols }, () => blankCell()));
  const cursorY = frame.cursor.y > y ? frame.cursor.y - 1 : frame.cursor.y;
  return makeFrame(frame.cols, frame.rows, kept, { x: frame.cursor.x, y: cursorY });
}

/**
 * A gap of three or more blank rows becomes one, always - fitting or not.
 *
 * This is the "mostly black" the sysop reported on 2026-09-07: an empty
 * conference at 40 columns is ctop's header, NINE blank rows where its slots
 * were, and then the totals. The screen fits, so `collapseBlankRunsToFit`
 * below never touches it, and the caller reads a hole.
 *
 * Three, not two: one or two blank rows are a door's own spacing - the line
 * between a header and its table, the gap above a footer - and squeezing
 * those changes the look of every adapted screen for nothing. A run of three
 * or more is a place where content was expected and is not there.
 *
 * One row is kept, never zero: the blocks either side of a gap are separate
 * and should stay separate.
 */
export function collapseLongBlankRuns(frame: Frame, minRun = 3): Frame {
  let current = frame;
  // A run is a candidate once, on the frame as it ARRIVED. Re-deciding on the
  // shrinking frame would stop at `minRun - 1` rows and leave two blanks where
  // the promise is one; deciding once and trimming to a single row keeps the
  // threshold ("three or more is a hole") and the outcome ("one blank") from
  // being the same number.
  const longRun = (rows: ReadonlyArray<boolean>, y: number): boolean => {
    let end = y;
    while (end < rows.length && rows[end]) end += 1;
    return end - y >= minRun && end < rows.length;
  };
  const seeded = current.cells.map((row) => row.every(isBlank));
  const candidates = new Set<number>();
  for (let y = 0; y < seeded.length; y += 1) {
    if (seeded[y] && (y === 0 || !seeded[y - 1]) && longRun(seeded, y)) {
      let end = y;
      while (end < seeded.length && seeded[end]) end += 1;
      for (let k = y; k < end; k += 1) candidates.add(k);
    }
  }
  if (candidates.size === 0) return current;

  for (let guard = 0; guard < frame.rows; guard += 1) {
    const blanks = current.cells.map((row) => row.every(isBlank));
    let found = -1;
    for (let y = 0; y < blanks.length; ) {
      if (!blanks[y]) { y += 1; continue; }
      let end = y;
      while (end < blanks.length && blanks[end]) end += 1;
      // Two or more here, because a candidate run is being taken down to ONE.
      // The blank TAIL of the grid is not a gap; it is the end of the screen.
      if (end - y >= 2 && end < blanks.length) { found = y; break; }
      y = end;
    }
    if (found < 0) return current;
    // Remove ONE row per pass and look again: the loop below is what takes the
    // run down to the single blank the doc-comment promises, and re-finding
    // the run each time keeps this correct while rows shift under it.
    current = withoutRow(current, found);
  }
  return current;
}

/**
 * Squeeze runs of blank rows until the screen fits.
 *
 * One row per pass, from the LONGEST run, so a screen two rows over loses two
 * blanks out of eleven rather than a whole gap. A run of one is never touched:
 * a single blank row is the space between a header and its table, and losing
 * it reads as a bug.
 */
export function collapseBlankRunsToFit(frame: Frame, opts: FitOptions): Frame {
  let current = frame;
  for (let guard = 0; guard < frame.rows; guard += 1) {
    if (adaptedHeight(current, opts.cols) <= opts.rows) return current;
    const blanks = current.cells.map((row) => row.every(isBlank));
    let best = -1;
    let bestLen = 1;
    for (let y = 0; y < blanks.length; ) {
      if (!blanks[y]) { y += 1; continue; }
      let end = y;
      while (end < blanks.length && blanks[end]) end += 1;
      if (end - y > bestLen) { bestLen = end - y; best = y; }
      y = end;
    }
    if (best < 0) return current; // no run of two or more: nothing free left
    current = withoutRow(current, best);
  }
  return current;
}

/**
 * Drop the oldest entries of a list until the screen fits.
 *
 * "Oldest" is the first entry row BELOW the list's ruled header - `isRuleRow`
 * is the ladder's own answer to what a rule is, so a door's logo, its column
 * headings and its footer are never candidates. Only a door that declares
 * `C64_DROP_OLDEST` gets here: on a table that is not a wall the first row is
 * simply the first, and dropping it would be a lie.
 */
/**
 * Drop entries from the BOTTOM of a ranked list until the screen fits.
 *
 * THE OTHER END, AND WHY IT IS A SEPARATE RULE. `dropOldestEntriesToFit`
 * below takes the first entry under the list's header, which on a wall is the
 * comment nobody minds losing. On ctop and conftop that same row is RANK ONE -
 * the biggest uploader on the board - and the sysop's answer when it was put
 * to him was the plain one: "we dont want to drop top uploaders, the ones at
 * the bottom of the list could be dropped" (2026-09-07).
 *
 * So a ranked list sheds from its tail: the last entry of the block, then the
 * one above it. The block ENDS where the table's own footer begins - ctop
 * closes its rows with a second rule (`===-===...`) and prints its totals
 * under it - so the search runs from the first rule to the next one and never
 * touches what is below.
 *
 * Never the last entry standing: a top-uploaders table with no uploader in it
 * says less than a page prompt does.
 */
export function dropLastEntriesToFit(frame: Frame, opts: FitOptions): Frame {
  let current = frame;
  for (let guard = 0; guard < frame.rows; guard += 1) {
    if (adaptedHeight(current, opts.cols) <= opts.rows) return current;

    const rules: number[] = [];
    current.cells.forEach((row, y) => {
      if (isRuleRow(row as Cell[])) rules.push(y);
    });
    if (rules.length === 0) return current;

    // Between the header's rule and whatever closes the block: the next rule
    // if there is one, else the end of the painted rows.
    const from = rules[0];
    const to = rules.length > 1 ? rules[1] : current.rows;

    const entries: number[] = [];
    for (let y = from + 1; y < to; y += 1) {
      if (!current.cells[y].every(isBlank)) entries.push(y);
    }
    if (entries.length <= 1) return current;

    current = withoutRow(current, entries[entries.length - 1]);
  }
  return current;
}

export function dropOldestEntriesToFit(frame: Frame, opts: FitOptions): Frame {
  let current = frame;
  for (let guard = 0; guard < frame.rows; guard += 1) {
    if (adaptedHeight(current, opts.cols) <= opts.rows) return current;
    const firstRule = current.cells.findIndex((row) => isRuleRow(row as Cell[]));
    if (firstRule < 0) return current;
    const oldest = current.cells.findIndex(
      (row, y) => y > firstRule && !row.every(isBlank) && !isRuleRow(row as Cell[]),
    );
    // Never eat the last entry: a wall with nothing on it is worse than a page.
    const remaining = current.cells.filter(
      (row, y) => y > firstRule && !row.every(isBlank) && !isRuleRow(row as Cell[]),
    ).length;
    if (oldest < 0 || remaining <= 1) return current;
    current = withoutRow(current, oldest);
  }
  return current;
}
