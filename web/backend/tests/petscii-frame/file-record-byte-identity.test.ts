/**
 * THE CLAIM THE WHOLE C64 FILE VIEW RESTS ON: the board's own listing and a
 * 68K door's listing, adapted, print the SAME BYTES for the same record.
 *
 * Three assertions, and the third is the one that matters:
 *
 *   a. the two paths agree for a record
 *   b. they agree because they consumed the SAME LAYOUT - proved by the sha1
 *      the loader stamps on it, not by their output matching today
 *   c. under a DIFFERENT layout the output CHANGES and they still agree
 *
 * Without (c) a pair of hardcoded formatters passes (a) and (b) for ever: they
 * would agree with each other and ignore the file. (c) is what proves both
 * paths follow the data.
 */
import { adaptRows, makeFrame, blankCell } from '@amiexpress/bbs-door-sdk/petscii/frame';
import type { Cell, Frame } from '@amiexpress/bbs-door-sdk/petscii/frame';
import { renderFileRow } from '@amiexpress/bbs-door-sdk/petscii/frame';

import { compileFileLayout } from '../../src/services/file-layout.service';
import { fileRecordRung } from '../../src/server/c64-file-record-rung';
import { parseDirRecordRow, dirSizeToBytes } from '@amiexpress/bbs-door-sdk/petscii/frame';

/** A DIR row exactly as AquaScan prints one, and as the DIR file holds it. */
const ROW = 'BS1-10.ZIP   P    64MB  03-28-18  BS1 - THE ADF COLLECTION     [10/81]';
const CONTINUATION = ' '.repeat(33) + 'a second line of the description';

const frameOf = (lines: string[]): Frame =>
  makeFrame(80, lines.length, lines.map((text) =>
    Array.from({ length: 80 }, (_, i) => ({ ...blankCell(), ch: text[i] ?? ' ' }))), { x: 0, y: 0 });

const textOf = (cells: readonly Readonly<Cell>[]) =>
  cells.map((c) => c.ch).join('').replace(/\s+$/, '');

/** What the DOOR path produces for that row, through the adapter's rung. */
function doorPath(layout: ReturnType<typeof compileFileLayout>): string {
  let n = 0;
  const out = adaptRows(frameOf([ROW, CONTINUATION]), {
    cols: 40,
    blockRenderer: fileRecordRung({ layout, cols: 40, nextOrdinal: () => ++n }),
  });
  return textOf(out.rows[0].cells);
}

/** What the INTERNAL path produces for the same record. */
function internalPath(layout: ReturnType<typeof compileFileLayout>): string {
  const record = parseDirRecordRow(ROW)!;
  return renderFileRow(
    {
      num: 1,
      name: record.filename,
      sizeBytes: dirSizeToBytes(record.sizeText),
      sizeText: record.sizeText,
      flag: record.marker,
      isNew: false,
      date: record.dateText,
    },
    layout.row,
    40,
  ).replace(/~[^|]*\|/g, '').replace(/\s+$/, '');
}

describe('the two paths, on the shipped layout', () => {
  const layout = compileFileLayout(undefined);

  it('(a) print the same row for the same record', () => {
    expect(doorPath(layout)).toBe(internalPath(layout));
  });

  it('(b) consumed the same layout, and can prove it', () => {
    // Not "they match today" - they match BECAUSE the same bytes configured
    // them, and the sha1 is what says so.
    const again = compileFileLayout(undefined);
    expect(again.sha1).toBe(layout.sha1);
    expect(doorPath(again)).toBe(internalPath(layout));
  });

  it('renders the record, not the door\'s own row', () => {
    const row = doorPath(layout);
    expect(row).toContain('BS1-10.ZIP');
    expect(row).toContain('64MB');
    expect(row.length).toBeLessThanOrEqual(40);
    // The description was CONSUMED, not printed: a list row carries none.
    expect(row).not.toContain('ADF COLLECTION');
  });

  it('swallows the continuation row instead of adapting it separately', () => {
    let n = 0;
    const out = adaptRows(frameOf([ROW, CONTINUATION]), {
      cols: 40,
      blockRenderer: fileRecordRung({ layout, cols: 40, nextOrdinal: () => ++n }),
    });
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].rule).toBe('stack');
  });
});

describe('(c) under a DIFFERENT layout', () => {
  // The assertion that stops two hardcoded formatters passing: change the
  // file, and BOTH paths change with it, together.
  const other = compileFileLayout(
    '[ROW]\n~c7|~12F_NAME|~t14|~6F_SIZE_RAW|~t22|~9F_DATE|\n'
  );
  const shipped = compileFileLayout(undefined);

  it('the output changes', () => {
    expect(doorPath(other)).not.toBe(doorPath(shipped));
    expect(other.sha1).not.toBe(shipped.sha1);
  });

  it('and the two paths STILL agree', () => {
    expect(doorPath(other)).toBe(internalPath(other));
  });

  it('and it is the new layout they agree on', () => {
    // Filename first now, not the ordinal.
    expect(doorPath(other).startsWith('BS1-10.ZIP')).toBe(true);
  });
});

describe('what the rung refuses', () => {
  const layout = compileFileLayout(undefined);

  it('leaves a row that is not a record to the ladder', () => {
    let n = 0;
    const menu = 'AquaScan v1.0 by Aquarius/Outlaws';
    const out = adaptRows(frameOf([menu]), {
      cols: 40,
      blockRenderer: fileRecordRung({ layout, cols: 40, nextOrdinal: () => ++n }),
    });
    expect(out.rows[0].rule).not.toBe('stack');
    expect(textOf(out.rows[0].cells)).toContain('AquaScan');
  });

  it('does not claim a file is new to a caller it knows nothing about', () => {
    // A door was given no new-since date, so the flag column holds its place
    // rather than asserting something untrue.
    const row = doorPath(layout);
    expect(row[13]).toBe(' ');
  });
});

describe('the rung refuses a row that merely LOOKS like a record', () => {
  const layout = compileFileLayout(undefined);
  const claimed = (line: string): boolean => {
    let n = 0;
    const out = adaptRows(frameOf([line]), {
      cols: 40,
      blockRenderer: fileRecordRung({ layout, cols: 40, nextOrdinal: () => ++n }),
    });
    return out.rows[0].rule === 'stack';
  };

  it('does not claim a menu row with a P where the marker would be', () => {
    // On disk a DIR file holds nothing but records, so a shape test is enough
    // for the reader. A DOOR paints anything: `games`, `what` and `dRE!WAll`
    // each have a row that passes the shape test, and the rung rendered a
    // "record" made of a menu until it also demanded a size and a date.
    expect(claimed('SOME MENU TEXT P here is more text')).toBe(false);
  });

  it('does not claim a row whose size field is not a number', () => {
    expect(claimed('LOOKSLIKE.ZIP P  huge  03-28-18  x')).toBe(false);
  });

  it('does not claim a row with no date at all', () => {
    expect(claimed('LOOKSLIKE.ZIP P  40960  not-a-date  x')).toBe(false);
  });

  it('still claims a real one', () => {
    expect(claimed(ROW)).toBe(true);
  });
});
