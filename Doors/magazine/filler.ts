/**
 * Filler: the artist Mortimer's ASCII clipart, set into the empty tail of a column.
 *
 * A short article leaves the second and third column empty, and the last page
 * of a long one ends half way down. That space is decoration room. Sixty-five
 * pieces by Mortimer ("Mt", each signed (c)Mt - the signature is part of the
 * piece and is never cut) ship in `Doors/magazine/art/fill/` as latin1 text,
 * one file each; `<board root>/Magazine/art/fill/` wins when it holds any.
 *
 * RULES. A piece is placed whole or not at all. Filler never moves or hides
 * text (it only takes rows a column does not use), is never counted when the
 * text is paged, and carries no listing item, so the cursor skips it. The
 * choice is a hash of the view and the column: the same page shows the same
 * piece, and one spread never shows a piece twice.
 *
 * THE C64. Pieces are drawn in glyphs the board's transducer must map back to
 * PETSCII. Every piece is checked at load against that transducer: one
 * character that comes out as '?' makes the piece unusable for a PETSCII
 * caller (and for any screen of forty columns or fewer).
 */
import * as fs from 'fs';
import * as path from 'path';
import { AnsiToPetsciiTransducer } from '@amiexpress/bbs-door-sdk/petscii';
import type { ArtSources } from './art';

/** A column needs at least this many empty rows at its foot before filler is considered. */
export const FILLER_MIN_GAP = 6;

export interface FillerPiece {
  /** File name, e.g. `mortimer_07.txt`. */
  file: string;
  /** Rows as read: no trailing blanks, ragged, never padded. */
  rows: string[];
  width: number;
  height: number;
  /** Carries the (c)Mt signature. */
  signed: boolean;
  /** Every glyph survives the PETSCII transducer (no '?'). */
  petsciiOk: boolean;
}

/** What the layout needs to place filler: the pieces on offer and what identifies the view. */
export interface FillerOptions {
  pieces: readonly FillerPiece[];
  /** Same view, same key: a story id, or a listing's name. */
  key: string;
}

const glyphCache = new Map<string, boolean>();

/** True when the board's transducer renders `ch` as something other than a '?' it was not given. */
function glyphMaps(ch: string): boolean {
  let ok = glyphCache.get(ch);
  if (ok === undefined) {
    ok = ch === '?' || !Array.from(new AnsiToPetsciiTransducer().transduce(ch)).includes(0x3f);
    glyphCache.set(ch, ok);
  }
  return ok;
}

/** Whether every glyph in `text` reaches a C64 as itself (or its fold), never as '?'. */
export function petsciiMappable(text: string): boolean {
  for (const ch of text) if (ch !== '\n' && !glyphMaps(ch)) return false;
  return true;
}

/** Parse one piece from its bytes; null for a file that is not plain printable latin1 art. */
export function parsePiece(file: string, bytes: Buffer): FillerPiece | null {
  const text = bytes.toString('latin1').replace(/\r\n?/g, '\n');
  // Plain art only: no escape, no control character, no C1 byte.
  if (/[\x00-\x09\x0b-\x1f\x7f-\x9f]/.test(text)) return null;
  const rows = text.split('\n').map((r) => r.replace(/\s+$/, ''));
  while (rows.length && rows[rows.length - 1] === '') rows.pop();
  while (rows.length && rows[0] === '') rows.shift();
  if (rows.length === 0) return null;
  const width = Math.max(...rows.map((r) => r.length));
  return {
    file,
    rows,
    width,
    height: rows.length,
    signed: rows.some((r) => r.includes('©Mt')),
    petsciiOk: petsciiMappable(rows.join('\n')),
  };
}

function piecesIn(dir: string): FillerPiece[] {
  let names: string[];
  try {
    names = fs.readdirSync(dir).filter((n) => n.endsWith('.txt')).sort();
  } catch {
    return [];
  }
  const out: FillerPiece[] = [];
  for (const name of names) {
    try {
      const piece = parsePiece(name, fs.readFileSync(path.join(dir, name)));
      if (piece) out.push(piece);
    } catch { /* an unreadable file is a missing piece */ }
  }
  return out;
}

/**
 * The pieces for one caller: the sysop's `fill/` when it holds any, else the
 * shipped ones. A caller that reads PETSCII (or a screen of forty columns or
 * fewer) gets only the pieces that map.
 */
export function loadFiller(sources: ArtSources, petsciiLike: boolean): FillerPiece[] {
  let pieces = piecesIn(path.join(sources.overrideDir, 'fill'));
  if (pieces.length === 0 && sources.shippedDir) pieces = piecesIn(path.join(sources.shippedDir, 'fill'));
  return petsciiLike ? pieces.filter((p) => p.petsciiOk) : pieces;
}

/** FNV-1a, 32 bit: small, stable, and the same on every machine. */
export function hashKey(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * The piece for one gap: those that fit `width` x `height` whole, starting at
 * the hashed one and skipping any already used on this spread. Null when
 * nothing fits or everything that fits is used.
 */
export function chooseFiller(
  pieces: readonly FillerPiece[],
  seed: string,
  width: number,
  height: number,
  used: ReadonlySet<string>,
): FillerPiece | null {
  const fits = pieces.filter((p) => p.width <= width && p.height <= height);
  if (fits.length === 0) return null;
  const start = hashKey(seed) % fits.length;
  for (let i = 0; i < fits.length; i++) {
    const piece = fits[(start + i) % fits.length];
    if (!used.has(piece.file)) return piece;
  }
  return null;
}

/** Where a piece sits in a column of `room` rows whose text ends after `textRows`. */
export interface FillerPlacement {
  piece: FillerPiece;
  /** First row of the piece inside the column. */
  top: number;
  /** Blank cells left of the piece, centring it in the column. */
  indent: number;
}

/**
 * Filler for the columns of one spread. `textRows[c]` is how many rows column
 * `c` uses; `room` is the rows each column has. One entry per column, null
 * where nothing is placed. The piece is centred in the gap, one blank row
 * away from the text above it.
 */
export function placeFiller(
  options: FillerOptions,
  spreadNo: number,
  textRows: readonly number[],
  room: number,
  colWidth: number,
): Array<FillerPlacement | null> {
  const used = new Set<string>();
  return textRows.map((n, c) => {
    const gap = room - n;
    if (gap < FILLER_MIN_GAP) return null;
    const spacer = n > 0 ? 1 : 0;
    const piece = chooseFiller(options.pieces, `${options.key}:${spreadNo}:${c}`, colWidth, gap - spacer, used);
    if (!piece) return null;
    used.add(piece.file);
    return {
      piece,
      top: n + spacer + Math.floor((gap - spacer - piece.height) / 2),
      indent: Math.floor((colWidth - piece.width) / 2),
    };
  });
}
