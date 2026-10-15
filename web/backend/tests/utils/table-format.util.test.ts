/**
 * C64/40-col plan, Task 5: the shared 40-column table conventions.
 *
 * Only the NARROW layer is shared. Every 80-column table keeps its own
 * literal in its own handler and is pinned byte-for-byte by
 * tests/handlers/narrow-tables.test.ts - see the module header of
 * src/utils/table-format.util.ts for why.
 *
 * WIDTH RULING (2026-09-02): a CRLF-terminated ROW uses all forty columns.
 * The PETSCII transducer latches pendingWrap on the 40th glyph and
 * newline() consumes the latch without emitting a $0D of its own
 * (sdk/petscii/ansi-to-petscii.ts:108, :259-263, :289-301), so an exactly
 * 40-column row costs no blank line - and a table built to 39 throws a
 * column away on every row. Only a trailing PROMPT, which no CRLF follows
 * and on which the cursor rests, stops at 39.
 */
import {
  isNarrow,
  NARROW_PROMPT_WIDTH,
  NARROW_WIDTH,
  narrowClip,
  narrowField,
  narrowFileLines,
  narrowMailRow,
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

describe('the width ruling', () => {
  it('a row is forty columns; a trailing prompt is thirty-nine', () => {
    expect(NARROW_WIDTH).toBe(40);
    expect(NARROW_PROMPT_WIDTH).toBe(39);
  });

  it('a full-width rule uses all forty columns', () => {
    expect(narrowRule()).toBe('-'.repeat(40));
    expect(narrowRule('=')).toBe('='.repeat(40));
  });

  it('narrowClip defaults to the row width', () => {
    expect(narrowClip('X'.repeat(60))).toHaveLength(40);
    expect(narrowClip('X'.repeat(60), NARROW_PROMPT_WIDTH)).toHaveLength(39);
  });
});

describe('narrowFileLines (C64 two-line convention)', () => {
  it('line 1 is name + right-aligned size, filling the row', () => {
    const lines = narrowFileLines({ filename: 'ALKYS241.LHA', sizeKB: 88 });
    expect(lines[0]).toBe('ALKYS241.LHA'.padEnd(36) + ' 88K');
    expect(printableLength(lines[0])).toBe(NARROW_WIDTH);
  });

  it('wraps the description onto its own indented lines', () => {
    const lines = narrowFileLines({
      filename: 'ALKYS241.LHA',
      sizeKB: 88,
      description:
        'A long description of this fine Amiga release that will not fit on one forty column line',
    });
    expect(lines.length).toBeGreaterThan(2);
    for (const l of lines) expect(printableLength(l)).toBeLessThanOrEqual(NARROW_WIDTH);
    expect(lines.slice(1).join(' ')).toContain('A long description');
  });

  it('clips an over-long filename instead of overflowing', () => {
    const lines = narrowFileLines({ filename: 'X'.repeat(40) + '.LHA', sizeKB: 5 });
    expect(printableLength(lines[0])).toBe(NARROW_WIDTH);
  });
});

describe('narrowField', () => {
  it('field lines stay inside a row', () => {
    expect(narrowField('Subject', 'S'.repeat(60))).toHaveLength(NARROW_WIDTH);
    expect(narrowField('Date', '01-Jan-26 12:34')).toBe('Date   : 01-Jan-26 12:34');
  });
});

describe('narrowMailRow', () => {
  it('is the one stacked shape both message tables use', () => {
    expect(
      narrowMailRow({ msgNum: 42, isPrivate: false, from: 'ZAPHOD', subject: 'Demo ready' })
    ).toEqual(['000042 Public ', '  ZAPHOD', '  Demo ready']);
    expect(narrowMailRow({ msgNum: 7, isPrivate: true, from: 'A', subject: 'B' })[0]).toBe(
      '000007 Private'
    );
  });

  it('clips a long sender or subject to the row width', () => {
    const lines = narrowMailRow({
      msgNum: 1,
      isPrivate: false,
      from: 'F'.repeat(60),
      subject: 'S'.repeat(60),
    });
    for (const l of lines) expect(printableLength(l)).toBeLessThanOrEqual(NARROW_WIDTH);
  });
});
