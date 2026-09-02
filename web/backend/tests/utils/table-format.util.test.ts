/**
 * C64/40-col plan, Task 5: the shared 40-column table conventions.
 *
 * Only the NARROW layer is shared. Every 80-column table keeps its own
 * literal in its own handler and is pinned byte-for-byte by
 * tests/handlers/narrow-tables.test.ts - see the module header of
 * src/utils/table-format.util.ts for why.
 *
 * The width every full-width narrow line is built to is 39, not 40: a C64
 * that receives 40 printable characters has already wrapped to the next
 * row by the time the CRLF arrives, so a 40-column line double-spaces the
 * whole table. 39 is the widest line that does not.
 */
import {
  isNarrow,
  NARROW_LINE_WIDTH,
  narrowField,
  narrowFileLines,
  narrowRule,
} from '../../src/utils/table-format.util';
import { printableLength } from '../../src/utils/wrap-for-session.util';

describe('isNarrow', () => {
  it('a PETSCII session is narrow; an 80-column one is not', () => {
    expect(isNarrow({ petsciiMode: true })).toBe(true);
    expect(isNarrow({ petsciiMode: true, screenWidth: 40 })).toBe(true);
    expect(isNarrow({ screenWidth: 80 })).toBe(false);
    expect(isNarrow({})).toBe(false);
  });

  it('a narrow ANSI terminal is NOT narrow - petsciiMode is the only switch', () => {
    // A phone in portrait reports 40 columns over NAWS and is not a C64;
    // sessionColumns() floors every non-PETSCII session at 80.
    expect(isNarrow({ screenWidth: 40 })).toBe(false);
  });
});

describe('narrowFileLines (C64 two-line convention)', () => {
  it('line 1 is name + right-aligned size at 39 columns', () => {
    const lines = narrowFileLines({ filename: 'ALKYS241.LHA', sizeKB: 88 });
    expect(lines[0]).toBe('ALKYS241.LHA'.padEnd(35) + ' 88K');
    expect(printableLength(lines[0])).toBe(NARROW_LINE_WIDTH);
  });

  it('wraps the description onto its own indented lines', () => {
    const lines = narrowFileLines({
      filename: 'ALKYS241.LHA',
      sizeKB: 88,
      description:
        'A long description of this fine Amiga release that will not fit on one forty column line',
    });
    expect(lines.length).toBeGreaterThan(2);
    for (const l of lines) expect(printableLength(l)).toBeLessThanOrEqual(NARROW_LINE_WIDTH);
    expect(lines.slice(1).join(' ')).toContain('A long description');
  });

  it('clips an over-long filename instead of overflowing', () => {
    const lines = narrowFileLines({ filename: 'X'.repeat(30) + '.LHA', sizeKB: 5 });
    expect(printableLength(lines[0])).toBe(NARROW_LINE_WIDTH);
  });
});

describe('narrowField / narrowRule', () => {
  it('field lines and rules stay inside the narrow line width', () => {
    expect(narrowField('Subject', 'S'.repeat(60)).length).toBe(NARROW_LINE_WIDTH);
    expect(narrowField('Date', '01-Jan-26 12:34')).toBe('Date   : 01-Jan-26 12:34');
    expect(narrowRule()).toBe('-'.repeat(39));
    expect(NARROW_LINE_WIDTH).toBe(39);
  });
});
