/**
 * edit.tf-style frames for native .tti pages.
 *
 * The admin's .tti editor works on edit.tf's frame model: one 25 x 40 grid
 * of 7-bit teletext codes (row 24 is the fastext row). This module is the
 * bridge between that frame and the board's .tti text:
 *
 *   ttiToFrame   .tti text  -> 1000 cells + the records the frame cannot hold
 *   frameToTti   cells+meta -> .tti text
 *
 * It goes through the same vendored packet engine the board renders with
 * (`importTti` + `compileRow`), so a cell is exactly the byte the caller's
 * screen is built from. The frame is the FIRST subpage; a carousel's later
 * subpages ride along verbatim in `meta.tail`.
 *
 * Pure and I/O-free (no fs, no Buffer): the admin bundles it.
 */
import { importTti, lexTti, encodeOLContent } from './marco/tti/index';
import { compileRow } from './marco/compile/index';

export const FRAME_ROWS = 25;
export const FRAME_COLS = 40;
export const FRAME_CELLS = FRAME_ROWS * FRAME_COLS;
/** The page number a .tti gets when it was drawn from nothing. */
export const DEFAULT_PN = 'PN,10000';

/** What a .tti carries besides the first subpage's OL rows. */
export interface TtiFrameMeta {
  /**
   * The first subpage's non-OL records (DE, PN, SC, PS, CT, FL, ...),
   * raw lines verbatim, in file order - plus its OL records past the frame
   * (OL,25 and up), which are not screen rows: OL,25 is the hidden row 25
   * and OL,26/27/28 are packets X/26 (enhancement triplets), X/27 (page
   * links) and X/28 (page enhancement). MRG ttiformat v1.1 s.2.6 allows
   * OL,1..27; vbit2 (filemonitor.cpp, MAXROW 29) stores OL,0..29 and
   * transmits >= 26 as enhancement packets. They ride along byte-exact and
   * are written after the frame rows.
   */
  head: string[];
  /**
   * Everything from the second PN record on (a carousel's later subpages),
   * raw lines verbatim. Empty for a single-subpage file.
   */
  tail: string[];
  /** Line ending of the source file, reused on write. */
  eol: '\n' | '\r\n';
}

export interface TtiFrame {
  /** 25 rows x 40 columns, row-major, 7-bit codes (0x00-0x7F). */
  cells: Uint8Array;
  meta: TtiFrameMeta;
}

const SPACE = 0x20;

/** One row through the board's own pipeline: OL payload -> 40 bytes. */
function compileOlPayload(payload: string): Uint8Array {
  // importTti keeps rows 0-23 only; row 24 (edit.tf's fastext row) is
  // compiled by parsing its payload as a row-0 line, so it gets the very
  // same decode/token/pad rules as every other row.
  const subpage = importTti(`PN,10000\nOL,0,${payload}`).pages[0]?.subpages[0];
  const row = subpage?.rows[0];
  return row ? compileRow(row).bytes40 : new Uint8Array(FRAME_COLS).fill(SPACE);
}

/** Parse .tti text into an edit.tf frame (first subpage) plus its meta. */
export function ttiToFrame(text: string): TtiFrame {
  const eol: TtiFrameMeta['eol'] = text.includes('\r\n') ? '\r\n' : '\n';
  const records = lexTti(text);
  const head: string[] = [];
  const tail: string[] = [];
  const firstGroup: string[] = [];
  let row24: string | null = null;
  let pnSeen = 0;

  for (const rec of records) {
    if (rec.command === 'PN') pnSeen++;
    if (pnSeen >= 2) {
      tail.push(rec.raw);
      continue;
    }
    firstGroup.push(rec.raw);
    if (rec.command !== 'OL') {
      head.push(rec.raw);
    } else {
      const olRow = parseInt(rec.parts[0] ?? '', 10);
      if (olRow === 24) row24 = rec.parts[1] ?? '';
      else if (olRow >= FRAME_ROWS) head.push(rec.raw);
    }
  }

  const cells = new Uint8Array(FRAME_CELLS).fill(SPACE);
  const subpage = importTti(firstGroup.join('\n')).pages[0]?.subpages[0];
  if (subpage) {
    for (const row of subpage.rows) {
      if (row.index < 0 || row.index >= FRAME_ROWS) continue;
      const bytes = compileRow(row).bytes40;
      for (let c = 0; c < FRAME_COLS; c++) cells[row.index * FRAME_COLS + c] = bytes[c] & 0x7f;
    }
  }
  if (row24 !== null) {
    const bytes = compileOlPayload(row24);
    for (let c = 0; c < FRAME_COLS; c++) cells[24 * FRAME_COLS + c] = bytes[c] & 0x7f;
  }

  return { cells, meta: { head, tail, eol } };
}

/**
 * Write a frame back to .tti: the kept records, then OL,0..24 (all-space
 * rows omitted, trailing spaces trimmed), then the kept OL,25+ records
 * verbatim, then any later subpages.
 *
 * Control codes are written as single chars 0x80-0x9F (`encodeOLContent`),
 * so the result must be stored one byte per char (latin1), never UTF-8.
 */
export function frameToTti(cells: Uint8Array, meta: TtiFrameMeta): string {
  if (cells.length !== FRAME_CELLS) {
    throw new Error(`frameToTti: expected ${FRAME_CELLS} cells, got ${cells.length}`);
  }
  // A page with no PN record is not a page: looksNativeTti still matches it,
  // but importTti yields no subpage, so renderNativeTti returns null and the
  // door-art PUT refuses it. A surface drawn from nothing has an empty head,
  // so give it the default page number rather than write an unrenderable file.
  const records = meta.head.filter((line) => !isOlRecord(line));
  const packets = meta.head.filter(isOlRecord);
  const lines = records.some((line) => line.startsWith('PN,'))
    ? records
    : [DEFAULT_PN, ...records];
  for (let r = 0; r < FRAME_ROWS; r++) {
    const row = Array.from(cells.subarray(r * FRAME_COLS, (r + 1) * FRAME_COLS), (b) => b & 0x7f);
    let end = row.length;
    while (end > 0 && row[end - 1] === SPACE) end--;
    if (end === 0) continue;
    lines.push(`OL,${r},${encodeOLContent(row.slice(0, end))}`);
  }
  lines.push(...packets);
  lines.push(...meta.tail);
  return lines.join(meta.eol) + meta.eol;
}

/** An OL record kept in `meta.head` (rows 25+; see TtiFrameMeta.head). */
function isOlRecord(line: string): boolean {
  return /^OL,/i.test(line);
}

