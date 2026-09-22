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

    expect(numbers).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });

  it('puts every message count in the same column - the report itself', () => {
    const ends = new Set(entryRows(rowsAtForty()).map(row => row.replace(/\s+$/, '').length));

    expect([...ends]).toHaveLength(1);
  });

  it('keeps the header and the rule above each half', () => {
    const rows = rowsAtForty();

    expect(rows.filter(row => row.startsWith('No# Username'))).toHaveLength(2);
    expect(rows.filter(row => /^===-=+/.test(row)).length).toBeGreaterThanOrEqual(2);
  });

  it('carries every name across, and none of them twice', () => {
    const names = entryRows(rowsAtForty()).map(row => row.replace(/^\s*\d+\.\s+/, '').replace(/\s+\d+$/, ''));

    expect(names).toContain('Phantasm');
    expect(names).toContain('K.A.L.L.E.ab');
    expect(names).toContain('discord-bridge');
    // `Creep` really is on this board twice, at 15 and 16; everything else is
    // one caller, one row.
    expect(new Set(names).size).toBe(names.length - 1);
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
