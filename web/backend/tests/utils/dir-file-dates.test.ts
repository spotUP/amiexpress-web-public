/**
 * THE DIR DATE COLUMN IS `mm-dd-yy`, and reading it wrong made every file new.
 *
 * express.e identifies the column by shape - eight characters, leading digit,
 * `-` at [2] and [5] (express.e:27962) - and its own prompt names the format:
 * "Date as (mm-dd-yy) to search from" (express.e:27873). Every DIR file this
 * board inherited is written that way: `Conf12/Dir1` on the live volume holds
 * 81 records dated like `03-28-18`.
 *
 * This reader accepted only `23-Oct-25`, the form `utils/dir-file.util.ts`
 * writes. A real record therefore had its date swept into the DESCRIPTION and
 * its `uploadDate` DEFAULTED TO NOW - so a 2018 upload read as uploaded today,
 * `FR` sorted by nothing, and `N` was meaningless because every file was
 * newer than any date a caller could give.
 *
 * Found 2026-09-07 while answering "how do I get N to list files?".
 */
import { parseDirFile } from '../../src/utils/dir-file-reader.util';
import { buildDirEntryLine } from '../../src/utils/dir-file.util';

/** A row as it actually appears in Conf12/Dir1 on the live board. */
const LIVE_ROW = 'BS1-INDX.ZIP P  100596  03-28-18  The index, uploaded in 2018';
/** A row as this port wrote one until the writer was corrected. */
const PORT_ROW = 'MODERN.LHA   P  108741  24-Aug-26  Written by dir-file.util.ts';
/** A row whose date column is junk - it must not become "now". */
const UNDATED  = 'MYSTERY.LHA  P   20000  ??-???-??  No date this reader knows';

const parse = (line: string) => parseDirFile(line + '\n')[0];

describe('the DIR reader reads the date column express.e writes', () => {
  it('reads mm-dd-yy, the format the board\'s own files carry', () => {
    const entry = parse(LIVE_ROW);
    expect(entry.uploadDate.getFullYear()).toBe(2018);
    expect(entry.uploadDate.getMonth()).toBe(2);   // March
    expect(entry.uploadDate.getDate()).toBe(28);
    expect(entry.uploadDateDisplay).toBe('03-28-18');
  });

  it('keeps the date out of the description, where it used to land', () => {
    // The symptom a caller saw: the date printed as part of the text.
    expect(parse(LIVE_ROW).description).toBe('The index, uploaded in 2018');
  });

  it('still reads dd-Mon-yy, which this port wrote until 2026-09-07', () => {
    const entry = parse(PORT_ROW);
    expect(entry.uploadDate.getFullYear()).toBe(2026);
    expect(entry.uploadDate.getMonth()).toBe(7);   // August
    expect(entry.uploadDate.getDate()).toBe(24);
  });

  it('does not date an unreadable record NOW, which made it the newest file on the board', () => {
    const entry = parse(UNDATED);
    const now = Date.now();
    expect(entry.uploadDate.getTime()).toBeLessThan(now - 365 * 24 * 3600 * 1000);
    expect(entry.uploadDateDisplay).toBe('');
  });

  it('puts a two-digit year in the right century, as an Amiga-era upload needs', () => {
    // express.e compares two-digit years raw; a Date needs a century, and 80
    // is the pivot - `12-24-92` is a 1992 upload, not a 2092 one.
    expect(parse('OLDIE.LHA    P    1024  12-24-92  From the Amiga days').uploadDate.getFullYear())
      .toBe(1992);
  });
});

describe('what this port writes, express.e can read back', () => {
  it('round-trips a row through the writer and the reader', () => {
    const when = new Date(2026, 8, 7);
    const line = buildDirEntryLine('ROUND.LHA', 40960, when, 'A round trip', 'P');
    const back = parseDirFile(line)[0];

    expect(back).toBeDefined();
    expect(back.filename.trim()).toBe('ROUND.LHA');
    expect(back.uploadDate.getFullYear()).toBe(2026);
    expect(back.uploadDate.getMonth()).toBe(8);
    expect(back.uploadDate.getDate()).toBe(7);
    expect(back.description).toContain('A round trip');
  });

  it('writes a date column express.e will accept as a date', () => {
    // express.e:27962-27963 decides between "this field is the date" and
    // "shift the columns" on exactly this test. Failing it is what mangled a
    // row for a real AmiExpress reading a file this port wrote.
    const line = buildDirEntryLine('SHAPE.LHA', 1024, new Date(2026, 11, 24), 'x', 'P');
    const field = line.trim().split(/\s+/).find((f) => /^\d{2}-\d{2}-\d{2}$/.test(f));
    expect(field).toBe('12-24-26');
  });
});
