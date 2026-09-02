/**
 * Row classification for the C64 adapter's rule ladder - and, since Phase 3
 * Task 1, the board's own art/paint detectors.
 *
 * `looksLikeAsciiArt` and `positionsCursorAbsolutely` LIVE HERE and nowhere
 * else: web/backend/src/utils/ascii-art.util.ts:28 is one `export ... from`
 * line onto this file, so the 80-COLUMN path reaches them through it -
 * amiga-emulation/xim/io.ts's line-wrap safety net, wrap-for-session.util.ts,
 * dir-file.util.ts. They are FROZEN. Changing either moves bytes on every ANSI
 * session, PETSCII or not.
 *
 * Everything else in this file - `classifyRow`, `isRuleRow`, `columnSpans`,
 * `columnParts`, `hasColumnStructure` - is ladder-only routing that no ANSI
 * session reaches, which is exactly what lets the ladder change without moving
 * one 80-column byte. Two tests hold that line:
 * web/backend/tests/petscii-frame/classify-parity.test.ts (the re-export is
 * real and no second copy crept back) and .../frozen-detectors-only.test.ts
 * (the 80-column files import the two frozen names and nothing else).
 *
 * Pure TypeScript: no DOM, no Node imports.
 */
import { Cell, isBlank } from './types';

/**
 * `'bordered'` (Phase 3 Task 2) is a row with COLUMN STRUCTURE and
 * alphanumeric content - a box row or a gutter-separated menu row - and it is
 * decided AHEAD of the art test, because `looksLikeAsciiArt` (frozen: the
 * board's 80-column path shares it) calls most of them art and the ladder then
 * split them in half, doubling a 25-row door screen to 34-46 rows.
 *
 * `'table'` is vestigial IN PRACTICE, not unreachable: almost every row this
 * classifier used to call 'table' satisfies `hasColumnStructure` too, so
 * 'bordered' answers first. The gap is REVERSE-VIDEO gutters - `isBlank` calls
 * a reverse space content (it paints a coloured block) while
 * `hasTabularGutters` reads its character, so a row whose gutters are reverse
 * spaces has tabular gutters and no column structure, and still classifies
 * 'table'. The member and its `chooseRule` case therefore stay live.
 */
export type RowClass = 'blank' | 'bordered' | 'art' | 'table' | 'prose';

/**
 * CUP/HVP, cursor up/down/forward/back, column and line positioning, erase
 * display/line, save/restore cursor, bare home. SGR deliberately not
 * matched. Kept in lockstep with web/backend/src/utils/ascii-art.util.ts
 * (see classify-parity.test.ts) - J/K/s/u added for Task 10 of the
 * petscii-full-canvas plan.
 */
export function positionsCursorAbsolutely(line: string): boolean {
  return /\x1b\[[0-9;]*[HfABCDGdEFJKsu]/.test(line);
}

/**
 * Most colon-labelled stat rows (e.g. "uSeR nAME: Sysop ... dOWNLoADeD tODaY:
 * 0 bYTeS") are classified ART, not TABLE, by the indent/symbol-count and
 * long-gap/symbol-count branches below - so they split as prose fragments
 * rather than gutter-align as a table. classifyRow's fixture pack pins the
 * better split; this is a known property of the ported heuristic, not a bug
 * introduced here.
 *
 * Two branches below are dead by construction in the ORIGINAL heuristic and
 * are kept anyway because this is a verbatim port (parity test proves the
 * two copies stay identical, not that every branch is reachable):
 * - `symbolCount >= 3 && ratio < 0.4`: whenever ratio < 0.4 and
 *   trimmed.length >= 4, punctuationRatio (= 1 - ratio) is already >= 0.6,
 *   so the punctuationRatio branch above always fires first; when
 *   trimmed.length < 4, symbolCount >= 3 forces letters+digits === 0, so the
 *   letters+digits===0 branch fires first instead.
 * - `borderedLine`: its conditions (starts/ends with '|', symbolCount >= 4)
 *   are a strict subset of `borderArt`'s (starts/ends with '|' or ':',
 *   symbolCount >= 2), which is checked first and always matches whenever
 *   borderedLine would.
 */
export function looksLikeAsciiArt(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return true;
  }

  const letters = (trimmed.match(/[A-Za-z]/g) || []).length;
  const digits = (trimmed.match(/[0-9]/g) || []).length;
  const nonAlphanumeric = trimmed.length - letters - digits;
  const punctuationRatio = nonAlphanumeric / trimmed.length;
  const symbolMatch = trimmed.match(/[:\-_/\\|=+*~`@#%^&\[\]\(\)<>]/g);
  const symbolCount = symbolMatch ? symbolMatch.length : 0;
  const leadingIndent = line.match(/^\s+/)?.[0].length || 0;

  if (leadingIndent >= 33) {
    return true;
  }

  if (letters + digits === 0 && nonAlphanumeric > 0) {
    return true;
  }

  if (punctuationRatio >= 0.6 && trimmed.length >= 4) {
    return true;
  }

  if (symbolCount >= 3 && (letters + digits) / trimmed.length < 0.4) {
    return true;
  }

  if (leadingIndent >= 4 && symbolCount >= 2) {
    return true;
  }

  const longSpaceRuns = (line.match(/\s{4,}/g) || []).length;
  if (longSpaceRuns >= 2 && symbolCount >= 3) {
    return true;
  }

  const artChars = (line.match(/[|_\/\\\-()]/g) || []).length;
  if (artChars >= 8 && letters + digits < trimmed.length * 0.8) {
    return true;
  }

  const borderArt = /^[|:][\s\S]*[:|]$/.test(trimmed);
  if (borderArt && symbolCount >= 2) {
    return true;
  }

  const borderedLine =
    trimmed.length >= 20 &&
    trimmed.startsWith('|') &&
    trimmed.endsWith('|') &&
    trimmed.split('|').length >= 3 &&
    symbolCount >= 4;
  if (borderedLine) {
    return true;
  }

  return false;
}

/** Characters of a row, trailing blanks trimmed. A reverse-video space is content and is kept. */
export function rowText(cells: ReadonlyArray<Readonly<Cell>>): string {
  return cells.slice(0, contentWidth(cells)).map((c) => c.ch).join('');
}

/** 1 + index of the last non-blank cell; 0 for an empty row. */
export function contentWidth(cells: ReadonlyArray<Readonly<Cell>>): number {
  for (let x = cells.length - 1; x >= 0; x--) if (!isBlank(cells[x])) return x + 1;
  return 0;
}

/** Two or more runs of two-plus spaces INSIDE the text: columns separated by gutters. */
export function hasTabularGutters(text: string): boolean {
  return (text.trim().match(/ {2,}/g) || []).length >= 2;
}

/**
 * A HORIZONTAL RULE: every non-blank cell is non-alphanumeric and not reverse
 * video. `.-----.`, `` `-----' ``, `|__|__|`, `|--v--v--|`. Truncating a rule
 * to 40 columns still leaves a rule, so a rule is croppable - which
 * `isCroppable`'s one-repeated-glyph test cannot see, because a rule mixes '-'
 * with its corners. A reverse-video cell is excluded: it paints a coloured
 * block, and cropping that drops content, not decoration.
 */
export function isRuleRow(cells: ReadonlyArray<Readonly<Cell>>): boolean {
  const width = contentWidth(cells);
  let any = false;
  for (let x = 0; x < width; x++) {
    const c = cells[x];
    if (isBlank(c)) continue;
    any = true;
    if (c.rvs || /[A-Za-z0-9]/.test(c.ch)) return false;
  }
  return any;
}

/** Trim blanks off both ends of a span; an all-blank span comes back empty (`a === b`). */
function trimSpan(cells: ReadonlyArray<Readonly<Cell>>, from: number, to: number): [number, number] {
  let a = from;
  let b = to;
  while (a < b && isBlank(cells[a])) a++;
  while (b > a && isBlank(cells[b - 1])) b--;
  return [a, b];
}

/**
 * The row's columns, in order, each trimmed and carrying its own cells (so a
 * part keeps its colours).
 *
 * Split on '|' cells when the row is BORDERED - its first and last non-blank
 * cells are both '|', so the outer parts are empty and drop out - otherwise on
 * INTERIOR runs of two or more blanks, of which there must be at least two. A
 * leading indent is not a column break, and neither is a single space, so
 * "Local Console" stays one column.
 *
 * The border test is what keeps prose out: `He said "a|b" and then wrote |c|`
 * has two '|' glyphs and no border, and reading them as separators would
 * delete them and truncate the sentence at a column boundary. Such a row falls
 * through to the gutter branch, and on to reflow, exactly as before.
 *
 * Returns [] when the row has no column structure at all, which is exactly
 * what `hasColumnStructure` asks.
 */
export function columnParts(cells: ReadonlyArray<Readonly<Cell>>): Array<ReadonlyArray<Readonly<Cell>>> {
  return columnSpans(cells).map(([a, b]) => cells.slice(a, b));
}

/**
 * `columnParts` as SOURCE COLUMN RANGES `[start, end)`, trimmed and in order.
 * `narrowRow` needs the indices, not just the cells: its cursor map answers in
 * source columns, and a part that gets shortened has to know which source cell
 * its truncation mark stands for.
 */
export function columnSpans(cells: ReadonlyArray<Readonly<Cell>>): Array<[number, number]> {
  const width = contentWidth(cells);
  if (width === 0) return [];

  const bounds: number[] = [];               // exclusive end of each span, in source columns
  const starts: number[] = [0];
  let first = 0;
  while (first < width && isBlank(cells[first])) first++;
  const bordered = first < width && cells[first].ch === '|' && cells[width - 1].ch === '|' && first < width - 1;

  if (bordered) {
    for (let x = 0; x < width; x++) {
      if (cells[x].ch !== '|') continue;
      bounds.push(x);
      starts.push(x + 1);
    }
    bounds.push(width);
  } else {
    let indent = 0;
    while (indent < width && isBlank(cells[indent])) indent++;
    const runs: Array<[number, number]> = [];
    for (let x = indent; x < width; x++) {
      if (!isBlank(cells[x])) continue;
      const start = x;
      while (x < width && isBlank(cells[x])) x++;
      if (x - start >= 2 && x < width) runs.push([start, x]);   // interior only
    }
    if (runs.length < 2) return [];
    starts.length = 0;
    starts.push(indent);
    for (const [a, b] of runs) { bounds.push(a); starts.push(b); }
    bounds.push(width);
  }

  const spans: Array<[number, number]> = [];
  for (let i = 0; i < bounds.length; i++) {
    const span = trimSpan(cells, starts[i], bounds[i]);
    if (span[1] > span[0]) spans.push(span);
  }
  return spans;
}

/**
 * The row is a table row `narrowRow` can shrink in place instead of splitting
 * in half. ONE surviving column is enough when the structure is a border
 * (`| WHAT: Transfer Activities v2.0 ... |`): the border is the evidence that
 * the row is a box row, and narrowing keeps the box one row tall, which is the
 * whole point of the rule.
 */
export function hasColumnStructure(cells: ReadonlyArray<Readonly<Cell>>): boolean {
  return columnSpans(cells).length > 0;
}

export function classifyRow(cells: ReadonlyArray<Readonly<Cell>>): RowClass {
  if (contentWidth(cells) === 0) return 'blank';
  const text = rowText(cells);
  if (/[A-Za-z0-9]/.test(text) && hasColumnStructure(cells)) return 'bordered';
  if (looksLikeAsciiArt(text)) return 'art';
  if (hasTabularGutters(text)) return 'table';
  return 'prose';
}
