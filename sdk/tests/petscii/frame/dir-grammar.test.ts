/**
 * express.e's DIR-entry grammar, and why there is exactly one of it.
 *
 * Two things read a DIR record and they must not drift: the board's own
 * listing, which reads the files off disk, and the C64 frame adapter, which
 * reads the SAME rows back out of what a 68K door PRINTED. If those two
 * disagreed about what a record is, one would render a record the other did
 * not - and the byte-identity the whole C64 file view rests on would be gone.
 *
 * The rows below are REAL, taken from the live board's DIR files.
 */
import {
  dirSizeToBytes,
  isDirContinuationRow,
  isDirRecordRow,
  parseDirRecordRow,
} from '../../../petscii/frame/dir-grammar';

/** Conf12/DIR1 on the live board. */
const LIVE_ROW = 'BS1-INDX.ZIP P  100596  03-28-18  - - -- ------------------------------ --- --';
/** Conf3/DIR1, with the older date shape and an N marker. */
const LIVE_N_ROW = '-D-CALC.LHA  N  10431  01-21-26         CALCULATOR V1.0 by VASCAL/DLT';

describe('what counts as the start of a record', () => {
  it('takes a real row from the board', () => {
    expect(isDirRecordRow(LIVE_ROW)).toBe(true);
    expect(isDirRecordRow(LIVE_N_ROW)).toBe(true);
  });

  it('refuses a continuation row, which is the description at indent 33', () => {
    const continuation = ' '.repeat(33) + 'and the second line of a DIZ';
    expect(isDirRecordRow(continuation)).toBe(false);
    expect(isDirContinuationRow(continuation)).toBe(true);
  });

  it('refuses a row whose marker column holds something else', () => {
    expect(isDirRecordRow('NOTAFILE.LHA X  1024  03-28-18  nope')).toBe(false);
  });

  it('refuses a filename that runs into the marker column', () => {
    // 13 characters: express.e's grammar caps a name at 12, and a longer one
    // is not a record at all - which a fixture found the hard way.
    expect(isDirRecordRow('OLD-THING.LHA P  1024  12-24-92  too long')).toBe(false);
  });
});

describe('the fields of a record', () => {
  it('reads the live row', () => {
    const row = parseDirRecordRow(LIVE_ROW)!;
    expect(row.filename).toBe('BS1-INDX.ZIP');
    expect(row.marker).toBe('P');
    expect(row.sizeText).toBe('100596');
    expect(row.dateText).toBe('03-28-18');
    expect(row.description.startsWith('- - --')).toBe(true);
  });

  it('reads the other date shape this board also carries', () => {
    const row = parseDirRecordRow('MODERN.LHA   P  108741  24-Aug-26  A modern row')!;
    expect(row.dateText).toBe('24-Aug-26');
    expect(row.description).toBe('A modern row');
  });

  it('returns the size and date AS WRITTEN, never reformatted', () => {
    // Reformatting either would diverge from what express.e prints, and the
    // adapter could not reproduce it from a door's output anyway.
    const row = parseDirRecordRow('SHORT.LHA    P  117K  03-28-18  x')!;
    expect(row.sizeText).toBe('117K');
    expect(row.dateText).toBe('03-28-18');
  });

  it('keeps the description verbatim, art and spacing included', () => {
    const row = parseDirRecordRow(LIVE_N_ROW)!;
    expect(row.description).toBe('       CALCULATOR V1.0 by VASCAL/DLT');
  });

  it('answers null for a row that is not a record', () => {
    expect(parseDirRecordRow(' '.repeat(33) + 'a continuation')).toBeNull();
  });
});

describe('sizes, however they were written', () => {
  it('reads bytes and suffixed forms alike', () => {
    expect(dirSizeToBytes('100596')).toBe(100596);
    expect(dirSizeToBytes('117K')).toBe(117 * 1024);
    expect(dirSizeToBytes('2M')).toBe(2 * 1024 * 1024);
    expect(dirSizeToBytes('nonsense')).toBe(0);
  });

  it('reads the TWO-LETTER form this board actually uses', () => {
    // 160 of the 213 records on the live board are written `75MB`. A reader
    // that knew only `M` read `82MB` as 82 BYTES and printed `1K` beside an
    // 82 megabyte archive (sysop, live, 2026-09-07).
    expect(dirSizeToBytes('82MB')).toBe(82 * 1024 * 1024);
    expect(dirSizeToBytes('75MB')).toBe(75 * 1024 * 1024);
    expect(dirSizeToBytes('512KB')).toBe(512 * 1024);
    expect(dirSizeToBytes('2GB')).toBe(2 * 1024 * 1024 * 1024);
  });

  it('answers 0 for a field it cannot read, rather than guessing', () => {
    expect(dirSizeToBytes('82MBX')).toBe(0);
    expect(dirSizeToBytes('')).toBe(0);
  });
});
