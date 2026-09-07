/**
 * Regression: a ranked table that will not fit 40 columns loses its LOWEST
 * ranks, never its highest.
 *
 * `C64_DROP_OLDEST` takes the first entry under a list's header, which on a
 * wall is the comment nobody minds losing. On ctop and conftop that row is
 * RANK ONE - the biggest uploader on the board - and the sysop's answer when
 * it was put to him was the plain one: "we dont want to drop top uploaders,
 * the ones at the bottom of the list could be dropped" (2026-09-07). So a
 * ranked list declares `C64_DROP_LAST` instead, and sheds from its tail.
 *
 * Built rather than captured: a full ctop needs a conference with ten real
 * uploaders in it, and the shape is what matters - header, rule, ranked rows,
 * a second rule, totals under it.
 */
import {
  makeFrame,
  blankCell,
  rowText,
  adaptRows,
  isBlank,
  type Cell,
  type Frame,
} from '@amiexpress/bbs-door-sdk/petscii/frame';
import {
  dropLastEntriesToFit,
  dropOldestEntriesToFit,
  adaptedHeight,
} from '../../src/server/c64-door-fit';
import { doorDropsLastAt40 } from '../../src/utils/door-min-columns.util';

const COLS = 80;
const ROWS = 25;
const FIT = { cols: 40, rows: 25 };

function row(text: string): Cell[] {
  const cells = Array.from(text.padEnd(COLS)).map((ch) => ({
    ch, fg: 1, bg: 0, bold: false, rvs: false,
  }));
  return cells;
}

/** A ctop-shaped screen: title, header, rule, `count` ranked rows, rule, totals. */
function rankedTable(count: number): Frame {
  const rows: Cell[][] = [
    row('Conference Top Uploaders (Conftop-II) Coded by REbEL/QTX'),
    row(''),
    row('No# Username (Handle)       Location (Group)         Files Uploaded Bytes'),
    row('===-=======================-========================-=====-=============='),
  ];
  for (let n = 1; n <= count; n += 1) {
    // SHORT enough to survive 40 columns intact: a cropped name would make
    // every `toContain` below pass for the wrong reason.
    rows.push(row(`${String(n).padStart(2)}. RANK${String(n).padStart(2, '0')}`));
  }
  rows.push(row('===-=======================-========================-=====-=============='));
  rows.push(row('Top Uploader Record     : DeaTure          Bytes:   2,020,282,473 Files:   61'));
  // A door paints on a 25-row grid and cannot exceed it; a fixture that did
  // would lose its own footer to the slice below and test nothing.
  expect(rows.length).toBeLessThanOrEqual(ROWS);
  while (rows.length < ROWS) rows.push(Array.from({ length: COLS }, () => blankCell()));
  return makeFrame(COLS, ROWS, rows, { x: 0, y: 0 });
}

/** The adapted rows a caller would see, as text. */
function shown(frame: Frame): string[] {
  const { rows } = adaptRows(frame, { cols: FIT.cols });
  let end = rows.length;
  while (end > 0 && rows[end - 1].cells.every(isBlank)) end--;
  return rows.slice(0, end).map((r) => rowText(r.cells).trimEnd());
}

describe('a ranked list that will not fit', () => {
  // 18 entries: the whole table - header, rules, entries, totals - still fits
  // the 25-row SOURCE grid (a door cannot paint past it), while adapting to
  // more than 25 rows at 40 columns, which is the case this rule is for.
  const table = rankedTable(18);

  test('is too tall to begin with, or this test proves nothing', () => {
    expect(adaptedHeight(table, FIT.cols)).toBeGreaterThan(FIT.rows);
  });

  test('sheds its LOWEST ranks and keeps rank one', () => {
    const trimmed = dropLastEntriesToFit(table, FIT);
    const text = shown(trimmed).join('\n');

    expect(adaptedHeight(trimmed, FIT.cols)).toBeLessThanOrEqual(FIT.rows);
    expect(text).toContain('RANK01');       // the top of the board survives
    expect(text).not.toContain('RANK18');   // the bottom is what went
  });

  test('keeps the totals under the second rule - only the entry block is touched', () => {
    const text = shown(dropLastEntriesToFit(table, FIT)).join('\n');
    expect(text).toContain('Top Uploader Record');
    expect(text).toContain('DeaTure');
  });

  test('the other rule would have taken rank one, which is why this one exists', () => {
    const text = shown(dropOldestEntriesToFit(table, FIT)).join('\n');
    expect(text).not.toContain('RANK01');
  });

  test('never sheds the last entry standing', () => {
    // One entry, and a screen far too small for it: the table keeps its row
    // rather than becoming a header over nothing.
    const one = rankedTable(1);
    const trimmed = dropLastEntriesToFit(one, { cols: 40, rows: 3 });
    expect(shown(trimmed).join('\n')).toContain('RANK01');
  });

  test('does nothing at all to a table that already fits', () => {
    const small = rankedTable(2);
    expect(dropLastEntriesToFit(small, FIT)).toBe(small);
  });
});

describe('the declaration', () => {
  test('reads C64_DROP_LAST wherever the other door flags are read', () => {
    expect(doorDropsLastAt40({ toolTypes: { C64_DROP_LAST: '1' } } as any)).toBe(true);
    expect(doorDropsLastAt40({ doorInfo: { toolTypes: { C64_DROP_LAST: 'YES' } } } as any)).toBe(true);
    expect(doorDropsLastAt40({ toolTypes: { C64_DROP_OLDEST: '1' } } as any)).toBe(false);
    expect(doorDropsLastAt40(null)).toBe(false);
  });
});
