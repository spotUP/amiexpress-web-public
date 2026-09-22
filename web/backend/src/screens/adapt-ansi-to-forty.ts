/**
 * An 80-column ANSI screen, ADAPTED to forty columns, at the moment it is
 * served.
 *
 * WHY THIS EXISTS. The board's 40-column callers met one of two answers for
 * an art-scoring screen: a reflow, which smears a picture, or
 * `[80-COLUMN ANSI SCREEN - SKIPPED]`, which shows nothing at all. The sysop,
 * 2026-09-15, walking the board on a C64 after the generated PETSCII defaults
 * shipped: "i still get a lot of warning during log in and bulls etc".
 *
 * A GENERATED `.seq` CANNOT ANSWER FOR THESE. The screens he means are the
 * ones the board writes for itself - MultiTop rewrites bull1-6 at every
 * logoff, the achievements board rewrites AchieveTop, the news tick rewrites
 * bull7/bull8, ctop-updater rewrites the conference tops - so a file drawn
 * beside them freezes last week's numbers in front of exactly the callers who
 * cannot see the real ones (dev/scripts/generate-default-petscii-screens.ts
 * leaves all of them alone for that reason). The adaptation has to happen
 * when the screen is read, every time.
 *
 * THE RULE LADDER IS NOT A NEW ONE. This is the C64 door adapter's, the same
 * `FrameReconstructor` -> `adaptRows(cols: 40)` the 68K doors have used since
 * the C64 adapter landed: `crop` for a row that already fits, `deindent`,
 * `leader` for a dot-leader, `stat` for `Label: value`, `record` for a
 * message with an author at column 61, `narrow` for a table, `reflow` for a
 * sentence. A bulletin is a TABLE, and `narrow` is the rung written for
 * tables: every column stays in place and in order, and what it pays with is
 * documented - the runs of blanks between columns, and the tail of a cell too
 * wide to fit, marked `>`.
 *
 * WHAT COMES BACK IS ANSI, not PETSCII bytes. Everything downstream is
 * unchanged: the session's transducer turns it into Commodore glyphs on the
 * way out, as it does for every other screen this board serves a C64.
 */
import { FrameReconstructor, adaptRows, solidifyRules } from '@amiexpress/bbs-door-sdk/petscii/frame';
import type { Cell } from '@amiexpress/bbs-door-sdk/petscii/frame';

import { twoColumnTableBlock } from './two-column-table';
import { mastheadBlock } from './banner-row';

/** A C64's screen. */
export const FORTY = 40;

/** VIC index -> the SGR the session's transducer resolves back to that index. */
const VIC_TO_SGR: readonly string[] = [
  '\x1b[30m', '\x1b[37;1m', '\x1b[31m', '\x1b[36;1m',
  '\x1b[35m', '\x1b[32m', '\x1b[34m', '\x1b[33;1m',
  '\x1b[33m', '\x1b[33m', '\x1b[31;1m', '\x1b[30;1m',
  '\x1b[37m', '\x1b[32;1m', '\x1b[34;1m', '\x1b[37m',
];

const trimEnd = (cells: Cell[]): Cell[] => {
  let last = cells.length - 1;
  while (last >= 0 && cells[last].ch === ' ' && !cells[last].rvs) last--;
  return cells.slice(0, last + 1);
};

/** One adapted row as ANSI: a colour byte only where the colour changes. */
function rowToAnsi(cells: Cell[]): string {
  let out = '';
  let fg = -1;
  let rvs = false;
  for (const cell of trimEnd(cells)) {
    if (cell.fg !== fg) { out += VIC_TO_SGR[cell.fg & 0x0f]; fg = cell.fg; }
    if (cell.rvs !== rvs) { out += cell.rvs ? '\x1b[7m' : '\x1b[27m'; rvs = cell.rvs; }
    out += cell.ch;
  }
  if (rvs) out += '\x1b[27m';
  return out;
}

/**
 * `content` replayed onto an 80-column grid and re-emitted at forty.
 *
 * Returns null when there is nothing to show - an empty screen is the one
 * case where the caller is better served by the notice than by a blank.
 */
export function adaptAnsiScreenToForty(content: string, cols = FORTY): string | null {
  /*
   * The table is asked FIRST. Its header row has a margin-sized gap in it
   * too - `No# Username (Handle) Uploaded Bytes` printed twice - and the
   * masthead rule would otherwise read that as a title and a credit.
   */
  return adaptAnsiScreenToFortyWith(content, cols, (frame, y) =>
    twoColumnTableBlock(frame, y, cols) ?? mastheadBlock(frame, y, cols));
}

/**
 * THE BLOCK RULES ALONE, ON A FILE A DOOR IS ABOUT TO SHOW.
 *
 * `B` on this board is a 68K door that hands `Bulletins/bullN.txt` back
 * through JH_SF, so MultiTop's chart reaches the caller down the DOOR
 * adapter's ladder and never meets the rules that fold it. Running the whole
 * screen adaptation over the file first was the obvious answer and the wrong
 * one: the door's ladder then adapted already-adapted rows, and BBSLINK's
 * games menu - twenty-five rows that used to pause part-way - came out a
 * different height.
 *
 * So this applies the BLOCK rules and nothing else. A row no rule claims is
 * left exactly as the frame holds it, and when no rule fires at all the
 * caller gets the file untouched (`null`), which is every screen on the
 * board that is not one of these charts.
 */
export function foldScreenBlocks(content: string, cols = FORTY): string | null {
  const lines = content.split(/\r?\n/);
  const reconstructor = new FrameReconstructor({ cols: 80, rows: Math.max(25, lines.length + 4) });
  reconstructor.write(content.replace(/\r?\n/g, '\r\n'));
  const frame = reconstructor.snapshot();

  const out: string[] = [];
  let fired = false;
  for (let y = 0; y < frame.rows; ) {
    const block = twoColumnTableBlock(frame, y, cols) ?? mastheadBlock(frame, y, cols);
    if (block) {
      fired = true;
      for (const row of block.rows) out.push(rowToAnsi(solidifyRules(row)));
      y += Math.max(1, block.consumed);
      continue;
    }
    out.push(rowToAnsi(frame.cells[y].map((c) => ({ ...c }))));
    y++;
  }
  if (!fired) return null;

  // The blank tail of the grid is not content.
  while (out.length > 0 && out[out.length - 1].trim() === '') out.pop();
  return out.join('\r\n') + '\r\n';
}

/**
 * The same adaptation with the caller's OWN block hook.
 *
 * Split out so a caller can find out WHETHER a block fired - the screen plan
 * sends a text screen down the prose path, and a table has to be recognised
 * before it can be rescued from it (`two-column-table.ts`).
 */
export function adaptAnsiScreenToFortyWith(
  content: string,
  cols: number,
  blockRenderer: (frame: Parameters<typeof adaptRows>[0], y: number) => { rows: Cell[][]; consumed: number } | null,
): string | null {
  const lines = content.split(/\r?\n/);
  const reconstructor = new FrameReconstructor({ cols: 80, rows: Math.max(25, lines.length + 4) });
  reconstructor.write(content.replace(/\r?\n/g, '\r\n'));
  const frame = reconstructor.snapshot();

  /*
   * THE BLOCK HOOK IS WHERE A BULLETIN'S SHAPE IS DECIDED, not the ladder.
   * MultiTop prints one table twice across the page, and no row-local rung
   * can read that as two records - see `two-column-table.ts` for the rows the
   * sysop was handed before this.
   */
  const adapted = adaptRows(frame, { cols, blockRenderer });
  /*
   * A RUN OF DASHES IS A LINE, and a C64 can draw a line - see
   * `solid-rules.ts`. On the ADAPTED rows, so an eighty-column caller's
   * screen is byte-identical and only the forty-column one changes.
   */
  const rows = adapted.rows.map((r) => rowToAnsi(solidifyRules(r.cells)));

  // Trailing blank rows are the grid's, not the screen's: the reconstructor
  // pads to its own height and a caller should not page through that.
  let last = rows.length - 1;
  while (last >= 0 && rows[last].trim() === '') last--;
  if (last < 0) return null;

  return rows.slice(0, last + 1).join('\r\n') + '\x1b[0m\r\n';
}
