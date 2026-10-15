/**
 * A TABLE PRINTED TWICE ACROSS THE PAGE IS READ DOWN THE SCREEN AT FORTY.
 *
 * The fixture is `Bulletins/bull3.txt` off the live volume, 2026-09-22:
 * MultiTop's message-count table, thirty names in fifteen rows, printed as
 * two columns of `No# Username (Handle) Msgs` with a single blank between
 * them at column 38.
 *
 * What the sysop was handed at forty columns, and reported with a
 * screenshot - "those zeroes are not aligned", "the second column is not
 * aligned at all":
 *
 *     1. Phantasm 1 16. Creep 0
 *     2. Radavi 0 17. h7 0
 *
 * That is the ladder's `narrow` rung doing exactly what it is written to do:
 * shorten the runs of blanks between columns until the row fits. The row is
 * not one record, though - it is two, and each of them already fits a C64's
 * screen. So the fix is a different SHAPE rather than a better squeeze, and
 * what this file pins is the shape: one list, down the screen, every value
 * in the same column.
 */
import * as fs from 'fs';
import * as path from 'path';

import { adaptAnsiScreenToForty, FORTY } from '../../src/screens/adapt-ansi-to-forty';

const BULLETIN = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'multitop-bull3.txt'),
  'latin1',
);

/** The adapted screen, colours stripped, as plain rows. */
function rowsAtForty(): string[] {
  const out = adaptAnsiScreenToForty(BULLETIN);
  expect(out).not.toBeNull();
  return out!.split('\r\n').map(line => line.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, ''));
}

/** The rows that are a numbered entry: `NN. name ... value`. */
function entryRows(rows: string[]): string[] {
  return rows.filter(row => /^\s*\d+\.\s/.test(row));
}

describe('the bulletin at forty columns', () => {
  it('fits the screen, every row', () => {
    for (const row of rowsAtForty()) expect(row.length).toBeLessThanOrEqual(FORTY);
  });

  it('gives every caller a row of their own, in order', () => {
    const numbers = entryRows(rowsAtForty()).map(row => parseInt(row.trim(), 10));

    // The TOP of the chart, one place per row. The chart is cut where a C64
    // screen ends rather than paged - see the cut test below.
    expect(numbers).toEqual(Array.from({ length: numbers.length }, (_, i) => i + 1));
    expect(numbers.length).toBeGreaterThanOrEqual(10);
  });

  it('puts every message count in the same column - the report itself', () => {
    const ends = new Set(entryRows(rowsAtForty()).map(row => row.replace(/\s+$/, '').length));

    expect([...ends]).toHaveLength(1);
  });

  it('keeps the header above the table and the rule under it', () => {
    const rows = rowsAtForty();

    expect(rows.filter(row => row.startsWith('No# Username'))).toHaveLength(1);
    expect(rows.filter(row => /^===-=+/.test(row)).length).toBeGreaterThanOrEqual(2);
  });

  /*
   * "the multitop bulls are too tall cut the last positions in the chart to
   * fit it" (the sysop, 2026-09-22). Thirty entries stacked are forty rows
   * with the masthead and the totals, so the caller pages through a
   * top-fifteen list to reach a second one. The chart is cut instead, and
   * what is left fits the glass with the board's own `(Pause)` prompt still
   * to come.
   */
  it('fits one C64 screen, prompt and all', () => {
    expect(rowsAtForty().length).toBeLessThanOrEqual(23);
  });

  it('carries the names it keeps, each on its own row', () => {
    const names = entryRows(rowsAtForty()).map(row => row.replace(/^\s*\d+\.\s+/, '').replace(/\s+\d+$/, ''));

    expect(names[0]).toBe('Phantasm');
    expect(new Set(names).size).toBe(names.length);
    // ...and the places past the cut are gone rather than squeezed onto a row
    // with somebody else.
    expect(rowsAtForty().some(row => row.includes('K.A.L.L.E.ab'))).toBe(false);
  });
});

describe('a row that is genuinely one record', () => {
  it('is left to the ladder', () => {
    const rows = rowsAtForty();

    // The totals block under the table is `Label: value` prose, not a table:
    // the stat rung wraps it and it must not be split down the middle.
    expect(rows.some(row => row.startsWith('Uploaded Bytes:'))).toBe(true);
    expect(rows.some(row => row.includes('Users: 41'))).toBe(true);
  });
});
