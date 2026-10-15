/**
 * express.e's DIR-entry grammar, in one place.
 *
 * A DIR row is a fixed-column record:
 *
 *   filename(12) SPACE marker(1) size  date  description
 *   ^0-11        ^12   ^13       ^14+  ...
 *
 * (express.e:19454 writes it, express.e:27953 `dirLineNewFile` recognises it,
 * and express.e:27204 replaces column 13 with a space before parsing the rest
 * as fields.)
 *
 * WHY IT LIVES IN THE SDK. Two things read this grammar and they must not
 * drift: the board's own listing, which reads DIR files off disk, and the C64
 * frame adapter, which reads the SAME rows back out of what a 68K door
 * PRINTED. If those two disagree about what a record is, one of them renders a
 * record the other does not, and the byte-identity the whole C64 file view is
 * built on is gone. Pure, no imports, so both sides can have it.
 */

/** The status markers express.e writes at column 13. */
export type DirStatusMarker = 'P' | 'F' | 'N' | 'D';

export interface DirRecordRow {
  filename: string;
  marker: DirStatusMarker;
  /** The size field as written - `40960` or `117K`, never reformatted here. */
  sizeText: string;
  /** The date field as written - `03-28-18` or `24-Aug-26`. */
  dateText: string;
  /** Whatever followed the date on the entry row, verbatim. */
  description: string;
}

/**
 * Is this row the START of a file entry?
 *
 * express.e:27953 `dirLineNewFile`: a marker at column 13, a space at column
 * 12, and a filename that is not blank - a blank one is a CONTINUATION row,
 * which carries the description at indent 33.
 */
export function isDirRecordRow(line: string): boolean {
  if (line.length < 14) return false;
  const marker = line[13];
  if (marker !== 'P' && marker !== 'F' && marker !== 'N' && marker !== 'D') return false;
  if (line[12] !== ' ') return false;
  return line.substring(0, 12).trim().length > 0;
}

/** Is this row a CONTINUATION - the description block at indent 33? */
export function isDirContinuationRow(line: string): boolean {
  return line.length > 33 && line.slice(0, 33).trim() === '';
}

/**
 * The fields of one entry row, or null when it is not one.
 *
 * The size and date are returned AS WRITTEN. This board's DIR files carry both
 * `03-28-18` and `24-Aug-26` dates and both `40960` and `117K` sizes; anything
 * that reformats them here would diverge from what express.e prints, and the
 * adapter could not reproduce it from a door's output anyway.
 */
export function parseDirRecordRow(line: string): DirRecordRow | null {
  if (!isDirRecordRow(line)) return null;

  const filename = line.substring(0, 12).trim();
  const marker = line[13] as DirStatusMarker;

  // express.e:27204 blanks column 13 and parses the remainder as fields.
  const rest = line.slice(14);
  const sizeMatch = rest.match(/^\s*(\S+)/);
  const sizeText = sizeMatch?.[1] ?? '';
  const afterSize = rest.slice(sizeMatch?.[0].length ?? 0);

  // The date is the next field, and it is a DATE only if it has the shape of
  // one - express.e:27962 makes the same test before trusting the column.
  const dateMatch = afterSize.match(/^\s*(\d{2}-\d{2}-\d{2}|\d{1,2}-[A-Za-z]{3}-\d{2})/);
  const dateText = dateMatch?.[1] ?? '';
  const afterDate = dateMatch ? afterSize.slice(dateMatch[0].length) : afterSize;

  return {
    filename,
    marker,
    sizeText,
    dateText,
    // Verbatim: express.e writes exactly two spaces after the date, and the
    // rest is the uploader's own text - art included, spacing included.
    description: afterDate.replace(/^ {1,2}/, '').replace(/\s+$/, ''),
  };
}

/**
 * Bytes from a size field, whichever way it was written.
 *
 * THE UNIT IS PART OF THE FIELD, and boards write it more than one way.
 * Measured over this board's own DIR files: 160 records say `75MB` and 53 say
 * `100596`. A reader that only knew a single-letter suffix read `82MB` as 82
 * BYTES and printed `1K` for three quarters of the base (sysop, live,
 * 2026-09-07: "1K P" beside an 82 megabyte archive).
 *
 * So both spellings count, and an unreadable field is 0 rather than a guess.
 */
export function dirSizeToBytes(sizeText: string): number {
  const text = sizeText.trim().toUpperCase();
  const match = text.match(/^(\d+)\s*(KB?|MB?|GB?)?$/);
  if (!match) return 0;
  const value = parseInt(match[1], 10);
  if (!Number.isFinite(value)) return 0;
  switch (match[2]?.[0]) {
    case 'K': return value * 1024;
    case 'M': return value * 1024 * 1024;
    case 'G': return value * 1024 * 1024 * 1024;
    default: return value;
  }
}
