/**
 * MAGAZINE VIDEO CACHE: the door-facing side (plan 2026-10-19-mag-linked-media-ascii, M6b).
 *
 * The backend owns one conversion job per (clip URL, size) and appends coloured
 * ASCII frames to a `.frames` file; the MAG door asks for a clip, then tails the
 * file with readFrames(). The door never imports backend source: the backend
 * registers its service on globalThis under VIDEO_SERVICE_KEY and the door
 * reads it through getMagazineVideoService() (a door loaded by await import()
 * gets its own module copies, so a required service would hold a second job
 * registry).
 *
 * FILE LAYOUT
 *   While converting (gzip form), the file is a sequence of chunks:
 *       [u32 BE n][n bytes = one complete gzip member]
 *   Each member inflates to whole records and a chunk is written with a single
 *   append, so a reader takes only chunks whose n bytes are all present.
 *   After `complete` the backend replaces the file with the brotli form:
 *       "MAGB" + one brotli stream of the same concatenated records.
 *   "MAGB" is only ever written for a finished clip.
 *   Records (inside the inflated stream):  [u32 BE n][u8 type][n-1 bytes]
 *       type 0  header, JSON {v, cols, rows, fps}  (always the first record)
 *       type 1  frame, one codec packet (encodeRichFrame): dots = the cell's
 *               character code, colors = fg | (bg << 4); first frame is a
 *               keyframe, later ones deltas against the previous frame
 *       type 2  end marker, empty: the `complete` marker, written last
 *   A file without an end record is a clip still converting (or cut off).
 */
import * as fs from 'fs';
import * as zlib from 'zlib';
import { decodeRichFrame, type AnsiCellGrid, type PaletteName, type RichFrame } from '../media/ascii';

/** Part of the clip file name: bump it when the converter changes so cached clips re-render. 2: joint glyph/fg/bg colour pick. 3: glyphs matched to the picture inside each cell. */
export const VIDEO_FILE_VERSION = 3;
export const BROTLI_MAGIC = Buffer.from('MAGB');
export const REC_HEADER = 0;
export const REC_FRAME = 1;
export const REC_END = 2;

export interface ClipInfo { v: number; cols: number; rows: number; fps: number }

export type ClipFailure =
  | '404' | 'oversize' | 'bad-content-type' | 'robots' | 'decode' | 'timeout'
  | 'too-small' | 'no-ffmpeg' | 'no-yt-dlp';
export type ClipOutcome = 'complete' | ClipFailure;

export interface ClipRequest {
  url: string;
  kind: 'video' | 'embed';
  cols: number;
  rows: number;
  palette: PaletteName;
}

export interface ClipHandle {
  /** The `.frames` file the job writes (may not exist yet). */
  path: string;
  /** Settles when the file is complete (cache hit: already resolved) or the job failed. */
  done: Promise<ClipOutcome>;
}

export interface MagazineVideoService {
  requestClip(req: ClipRequest): ClipHandle;
}

export const VIDEO_SERVICE_KEY = Symbol.for('amiexpress.magazineVideoService');

export function registerMagazineVideoService(svc: MagazineVideoService | null): void {
  (globalThis as unknown as Record<symbol, unknown>)[VIDEO_SERVICE_KEY] = svc ?? undefined;
}

/** The backend's service, or null (no backend registered it, e.g. a standalone door). */
export function getMagazineVideoService(): MagazineVideoService | null {
  return ((globalThis as unknown as Record<symbol, unknown>)[VIDEO_SERVICE_KEY] as MagazineVideoService | undefined) ?? null;
}

/** Where a reader is in a clip file. Start with newFrameCursor(). */
export interface FrameCursor {
  /** File bytes consumed (gzip form). */
  bytes: number;
  /** Frame records delivered so far (lets a reader survive gzip -> brotli). */
  frames: number;
  prev: RichFrame | null;
  info: ClipInfo | null;
}

export function newFrameCursor(): FrameCursor {
  return { bytes: 0, frames: 0, prev: null, info: null };
}

export interface FrameRead {
  /** Whole frames decoded since the cursor, in order. */
  frames: RichFrame[];
  cursor: FrameCursor;
  /** The end marker has been read: no more frames will come. */
  complete: boolean;
}

interface Rec { type: number; body: Buffer }

function parseRecords(buf: Buffer): Rec[] {
  const out: Rec[] = [];
  let at = 0;
  while (at + 4 <= buf.length) {
    const n = buf.readUInt32BE(at);
    if (n < 1 || at + 4 + n > buf.length) break;
    out.push({ type: buf[at + 4], body: buf.subarray(at + 5, at + 4 + n) });
    at += 4 + n;
  }
  return out;
}

function applyRecords(recs: Rec[], cursor: FrameCursor, skipFrames: number): { frames: RichFrame[]; complete: boolean } {
  const frames: RichFrame[] = [];
  let complete = false;
  let seen = 0;
  for (const r of recs) {
    if (r.type === REC_HEADER) {
      cursor.info ??= JSON.parse(r.body.toString('utf8')) as ClipInfo;
    } else if (r.type === REC_FRAME) {
      if (seen++ < skipFrames) continue;
      const pkt = decodeRichFrame(r.body, cursor.prev);
      if (!pkt) continue;
      cursor.prev = pkt.frame;
      cursor.frames++;
      frames.push(pkt.frame);
    } else if (r.type === REC_END) {
      complete = true;
    }
  }
  return { frames, complete };
}

/**
 * Tail a clip file: the whole frames written since `cursor`, the advanced
 * cursor, and whether the clip is complete. A missing file reads as nothing yet.
 */
export function readFrames(file: string, cursor: FrameCursor = newFrameCursor()): FrameRead {
  let data: Buffer;
  try { data = fs.readFileSync(file); } catch { return { frames: [], cursor, complete: false }; }
  const next: FrameCursor = { ...cursor };
  if (data.length >= 4 && data.subarray(0, 4).equals(BROTLI_MAGIC)) {
    const recs = parseRecords(zlib.brotliDecompressSync(data.subarray(4)));
    const r = applyRecords(recs, next, cursor.frames);
    next.bytes = data.length;
    return { frames: r.frames, cursor: next, complete: r.complete };
  }
  let at = cursor.bytes;
  const recs: Rec[] = [];
  while (at + 4 <= data.length) {
    const n = data.readUInt32BE(at);
    if (at + 4 + n > data.length) break;
    recs.push(...parseRecords(zlib.gunzipSync(data.subarray(at + 4, at + 4 + n))));
    at += 4 + n;
  }
  next.bytes = at;
  const r = applyRecords(recs, next, 0);
  return { frames: r.frames, cursor: next, complete: r.complete };
}

/** A decoded frame as the converter's cell grid (char, fg, bg). */
export function richFrameToCells(frame: RichFrame, cols: number, rows: number): AnsiCellGrid {
  const grid: AnsiCellGrid = [];
  for (let y = 0; y < rows; y++) {
    const row = [];
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      row.push({ char: String.fromCharCode(frame.dots[i]), fg: frame.colors[i] & 15, bg: frame.colors[i] >> 4 });
    }
    grid.push(row);
  }
  return grid;
}
