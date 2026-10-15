/**
 * dos.library LoadSeg for programs loaded at run time - the one hunk-loading
 * path shared by dos.library LoadSeg/RunCommand/SystemTagList and the RexxMast
 * service (which loads rexxc this way).
 *
 * HunkLoader packs a binary's segments upward from a base address; the door
 * itself is loaded at DOOR_SEGMENT_BASE by DoorLoader. A program loaded while
 * another runs must not overwrite it, so the caller supplies the place:
 * either a fixed base (RexxMast) or an allocator (dos.library: exec AllocMem)
 * that is asked for the span the segments need.
 *
 * Segment layout is HunkLoader's: BPTR<<2 is the segment header
 * [size in longs][next BPTR], the code starts 8 bytes later. `entry` is where
 * a process started from this segment list begins.
 */
import type { MoiraEmulator } from '../cpu/MoiraEmulator';
import { HunkLoader } from './HunkLoader';

/** First longword of an AmigaDOS load file (HUNK_HEADER). */
export const HUNK_HEADER = 0x000003f3;

export interface LoadedSegList {
  /** BPTR of the first segment, as LoadSeg returns it. */
  bptr: number;
  /** Address of the first instruction. */
  entry: number;
  /** The block reserved for the segments (span 0 for a fixed base). */
  base: number;
  span: number;
  segments: Array<{ address: number; bptr: number; size: number }>;
}

const SEGMENT_ALIGN = 0x100; // HunkLoader aligns every segment to 256 bytes

export function isHunkExecutable(bytes: Buffer): boolean {
  return bytes.length >= 4 && bytes.readUInt32BE(0) === HUNK_HEADER;
}

/**
 * Load `bytes` into emulator memory.
 *
 * `place` is either a fixed base address, or a function that reserves `span`
 * bytes and returns where (0 = no memory). Returns null when the file is not
 * a load file or there is no room; HunkLoader errors propagate.
 */
export function loadSegList(
  emulator: MoiraEmulator,
  bytes: Buffer,
  name: string,
  place: number | ((span: number) => number),
): LoadedSegList | null {
  if (!isHunkExecutable(bytes)) return null;

  // A fixed base, or reserve the span the segments need: measure at base 0,
  // then add one alignment step, since the allocator need not hand back an
  // address aligned the way HunkLoader packs segments.
  let base: number;
  let reserved: number;
  let span = 0;
  if (typeof place === 'number') {
    base = reserved = place >>> 0;
  } else {
    const measured = new HunkLoader().parse(bytes, 0);
    if (!measured.segments.length) return null;
    span = Math.max(...measured.segments.map((s) => s.headerAddress + 8 + s.size)) + SEGMENT_ALIGN;
    reserved = place(span) >>> 0;
    if (reserved === 0) return null;
    base = ((reserved + SEGMENT_ALIGN - 1) & ~(SEGMENT_ALIGN - 1)) >>> 0;
  }

  const hunkLoader = new HunkLoader();
  const hunks = hunkLoader.parse(bytes, base);
  if (!hunks.segments.length) return null;
  hunkLoader.load(emulator, hunks, name);
  const segments = hunks.segments.map((s) => ({ address: s.address >>> 0, bptr: s.bptr >>> 0, size: s.size >>> 0 }));
  return { bptr: segments[0].bptr, entry: segments[0].address, base: reserved, span, segments };
}
