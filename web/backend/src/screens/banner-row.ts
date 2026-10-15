/**
 * A MASTHEAD PRINTED ACROSS EIGHTY COLUMNS, ON ONE C64 ROW.
 *
 * MultiTop tops every bulletin with three rows: an underlined bar, a title
 * line with the door's name at the left and its credit pushed to the right
 * margin, and a blank. On an eighty-column page that is a masthead. On a C64
 * it is three of twenty-five rows spent on decoration, and the title line
 * itself is forty-six columns wide, so the ladder wraps it and the chart
 * underneath is pushed off the bottom.
 *
 * The sysop, 2026-09-22: "its still too tall - you consolidate the headline
 * 'Multitop-II Design created ....' to Multitop-II (c)1994 Bobo/Mystic",
 * "then it will fit on one row".
 *
 * So it does. The title keeps its place, the credit is cut back until the
 * pair fits - at its copyright mark first, which is the part that names
 * whose work it is, then at a dash - and the bar and the blank around it go
 * with the rows they were decorating.
 *
 * THIS IS A SCREEN RULE, like `two-column-table.ts`, handed to `adaptRows`
 * through the SDK's block hook. A door's own masthead is drawn by the door
 * and never comes through here.
 */
import { DEFAULT_BG } from '@amiexpress/bbs-door-sdk/petscii/frame';
import type { Cell, Frame } from '@amiexpress/bbs-door-sdk/petscii/frame';

/** Blanks that mean "pushed to the other margin" rather than a word space. */
const MARGIN_GAP = 4;

/** Decoration rows this will swallow on either side of the title. */
const MAX_DECORATION = 1;

const isBlank = (cell: Cell | undefined): boolean => cell === undefined || cell.ch === ' ';
const hasAlnum = (cells: readonly Cell[]): boolean => cells.some(c => /[A-Za-z0-9]/.test(c.ch));

function contentWidth(cells: readonly Cell[]): number {
  let width = cells.length;
  while (width > 0 && isBlank(cells[width - 1])) width--;
  return width;
}

/** A bar or a gap: something with styling and no words in it. */
function isDecoration(cells: readonly Cell[] | undefined): boolean {
  if (!cells) return false;
  return !hasAlnum(cells.slice(0, contentWidth(cells)));
}

function textOf(cells: readonly Cell[]): string {
  return cells.slice(0, contentWidth(cells)).map(c => c.ch).join('');
}

/**
 * The title and the credit of a masthead row, or null.
 *
 * A masthead is wider than the screen and holds exactly two runs of words
 * with a margin-sized gap between them. A table row has a gap like that too,
 * which is why the table hook is asked first: whatever it claims never
 * reaches here.
 */
export function splitMasthead(text: string, cols: number): { title: string; credit: string } | null {
  if (text.trim().length === 0) return null;
  if (text.trimEnd().length <= cols) return null;

  const gap = new RegExp(`\\s{${MARGIN_GAP},}`);
  const parts = text.trim().split(gap).map(p => p.trim()).filter(p => p.length > 0);
  if (parts.length !== 2) return null;

  const [title, credit] = parts;
  if (!/[A-Za-z0-9]/.test(title) || !/[A-Za-z0-9]/.test(credit)) return null;
  return { title, credit };
}

/** The one line the pair becomes, never wider than the caller's screen. */
export function mastheadLine(title: string, credit: string, cols: number): string {
  const joined = (tail: string) => `${title} ${tail}`;

  let tail = credit;
  if (joined(tail).length > cols) {
    const copyright = tail.search(/\((c|C)\)/);
    if (copyright > 0) tail = tail.slice(copyright);
  }
  if (joined(tail).length > cols) {
    const dash = tail.indexOf(' - ');
    if (dash > 0) tail = tail.slice(0, dash);
  }
  return joined(tail).slice(0, cols);
}

/** Paint `text` into one row of `cols` cells, in the style of `like`. */
function rowOf(text: string, like: readonly Cell[], cols: number): Cell[] {
  const pen = like.find(c => c.ch !== ' ') ?? like[0] ?? ({ ch: ' ', fg: 1, bg: 0, bold: false, rvs: false } as Cell);
  const out: Cell[] = [];
  for (let i = 0; i < cols; i++) {
    out.push({ ...pen, ch: text[i] ?? ' ', rvs: false });
  }
  return out;
}

/**
 * The block hook: at row `y`, a three-row masthead as one row, or nothing.
 */
export function mastheadBlock(frame: Frame, y: number, cols: number): { rows: Cell[][]; consumed: number } | null {
  let titleRow = y;
  let leading = 0;
  while (leading < MAX_DECORATION && isDecoration(frame.cells[titleRow])) {
    titleRow++;
    leading++;
  }

  const cells = frame.cells[titleRow];
  if (!cells) return null;

  /*
   * A COLOURED BAR IS WHAT MAKES IT A MASTHEAD.
   *
   * A title on the left and a credit on the right margin is not rare, and
   * the first cut of this rule collapsed BBSLINK's games menu, whose rows
   * are `[ARCL] The Arcadian Legends` and a second game across the page -
   * a DOOR's own screen, which is not this rule's business. MultiTop paints
   * its title on a BACKGROUND (`ESC[4;33;44m`); a menu row has none, and
   * the C64 has no per-cell background to spend on one either.
   */
  if (!cells.some(c => c.ch !== ' ' && c.bg !== DEFAULT_BG)) return null;
  const split = splitMasthead(textOf(cells), cols);
  if (!split) return null;

  let end = titleRow;
  let trailing = 0;
  while (trailing < MAX_DECORATION && isDecoration(frame.cells[end + 1])) {
    end++;
    trailing++;
  }

  return {
    rows: [rowOf(mastheadLine(split.title, split.credit, cols), cells, cols)],
    consumed: end - y + 1,
  };
}
