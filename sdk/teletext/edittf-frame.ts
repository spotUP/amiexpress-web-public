/**
 * edit.tf frames for native .tti pages.
 *
 * edit.tf (rawles/edit.tf, vendored for the admin's .tti editor) holds one
 * 25 x 40 frame of 7-bit teletext codes and reads/writes it only as a URL
 * hash. This module is the board's side of that bridge:
 *
 *   ttiToFrame   .tti text  -> 1000 cells + the records the frame cannot hold
 *   frameToTti   cells+meta -> .tti text
 *   frameToHash  cells      -> edit.tf hash  (`<nybble>:<1167 base64url>`)
 *   hashToFrame  hash       -> cells
 *
 * The .tti side goes through the same vendored packet engine the board
 * renders with (`importTti` + `compileRow`), so a cell is exactly the byte
 * the caller's screen is built from. The frame is the FIRST subpage; a
 * carousel's later subpages ride along verbatim in `meta.tail`.
 *
 * Pure and I/O-free (no fs, no Buffer): the admin bundles it.
 */
import { importTti, lexTti, encodeOLContent } from './marco/tti/index';
import { compileRow } from './marco/compile/index';

export const FRAME_ROWS = 25;
export const FRAME_COLS = 40;
export const FRAME_CELLS = FRAME_ROWS * FRAME_COLS;

/** What a .tti carries besides the first subpage's OL rows. */
export interface TtiFrameMeta {
  /**
   * The first subpage's non-OL records (DE, PN, SC, PS, CT, FL, ...),
   * raw lines verbatim, in file order.
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
const HASH_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
/** 25 rows: 7000 bits in 6-bit groups, two trailing pad bits. */
const HASH_LEN_25 = Math.ceil((FRAME_CELLS * 7) / 6);
/** edit.tf's legacy 24-row form: 6720 bits exactly. */
const HASH_LEN_24 = ((FRAME_CELLS - FRAME_COLS) * 7) / 6;

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
    } else if (parseInt(rec.parts[0] ?? '', 10) === 24) {
      row24 = rec.parts[1] ?? '';
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
 * rows omitted, trailing spaces trimmed), then any later subpages.
 *
 * Control codes are written as single chars 0x80-0x9F (`encodeOLContent`),
 * so the result must be stored one byte per char (latin1), never UTF-8.
 */
export function frameToTti(cells: Uint8Array, meta: TtiFrameMeta): string {
  if (cells.length !== FRAME_CELLS) {
    throw new Error(`frameToTti: expected ${FRAME_CELLS} cells, got ${cells.length}`);
  }
  const lines = [...meta.head];
  for (let r = 0; r < FRAME_ROWS; r++) {
    const row = Array.from(cells.subarray(r * FRAME_COLS, (r + 1) * FRAME_COLS), (b) => b & 0x7f);
    let end = row.length;
    while (end > 0 && row[end - 1] === SPACE) end--;
    if (end === 0) continue;
    lines.push(`OL,${r},${encodeOLContent(row.slice(0, end))}`);
  }
  lines.push(...meta.tail);
  return lines.join(meta.eol) + meta.eol;
}

/**
 * edit.tf's URL hash for a frame, bit for bit as its `save_to_hash`:
 * metadata nybble (bit 3 black foreground, bits 0-2 character set), ':',
 * then the 7-bit cells row-major MSB first, packed into 6-bit base64url
 * groups (no padding; the last two bits are zero).
 */
export function frameToHash(cells: Uint8Array, charset = 0, blackForeground = false): string {
  if (cells.length !== FRAME_CELLS) {
    throw new Error(`frameToHash: expected ${FRAME_CELLS} cells, got ${cells.length}`);
  }
  if (!Number.isInteger(charset) || charset < 0 || charset > 7) {
    throw new Error(`frameToHash: character set must be 0-7, got ${charset}`);
  }
  const groups = new Uint8Array(HASH_LEN_25);
  for (let i = 0; i < FRAME_CELLS; i++) {
    const code = cells[i] & 0x7f;
    for (let b = 0; b < 7; b++) {
      if (code & (1 << (6 - b))) {
        const bit = 7 * i + b;
        groups[Math.floor(bit / 6)] |= 1 << (5 - (bit % 6));
      }
    }
  }
  let out = (charset + (blackForeground ? 8 : 0)).toString(16) + ':';
  for (const g of groups) out += HASH_ALPHABET.charAt(g);
  return out;
}

export interface HashFrame {
  cells: Uint8Array;
  /** Character set 0-7 from the metadata nybble (0 when absent). */
  charset: number;
  blackForeground: boolean;
  /** edit.tf's trailing `KEY=VAL` fields (PN, SC, PS, X270, ...), verbatim. */
  extras: string[];
}

/**
 * Decode an edit.tf hash (with or without the leading '#'). Accepts the
 * 25-row form (1167 chars) and the legacy 24-row form (1120 chars, row 24
 * left as spaces), as edit.tf's `load_from_hashstring` does.
 */
export function hashToFrame(hash: string): HashFrame {
  let data = hash.startsWith('#') ? hash.slice(1) : hash;
  let charset = 0;
  let blackForeground = false;
  let extras: string[] = [];
  if (data.includes(':')) {
    const parts = data.split(':');
    const metadata = parseInt(parts[0], 16);
    if (!Number.isNaN(metadata)) {
      charset = metadata % 8;
      blackForeground = metadata >= 8;
    }
    data = parts[1];
    extras = parts.slice(2);
  }
  if (data.length !== HASH_LEN_25 && data.length !== HASH_LEN_24) {
    throw new Error(`hashToFrame: frame data must be ${HASH_LEN_25} or ${HASH_LEN_24} chars, got ${data.length}`);
  }
  const cells = new Uint8Array(FRAME_CELLS).fill(SPACE);
  const cellCount = data.length === HASH_LEN_25 ? FRAME_CELLS : FRAME_CELLS - FRAME_COLS;
  for (let i = 0; i < cellCount; i++) {
    let code = 0;
    for (let b = 0; b < 7; b++) {
      const bit = 7 * i + b;
      const group = HASH_ALPHABET.indexOf(data.charAt(Math.floor(bit / 6)));
      if (group < 0) throw new Error(`hashToFrame: invalid character at ${Math.floor(bit / 6)}`);
      if (group & (1 << (5 - (bit % 6)))) code |= 1 << (6 - b);
    }
    cells[i] = code;
  }
  return { cells, charset, blackForeground, extras };
}
