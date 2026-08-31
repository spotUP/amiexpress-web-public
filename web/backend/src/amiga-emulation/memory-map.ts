/**
 * The emulator's fixed memory map, and the one rule a door binary must obey.
 *
 * Everything above the door lives at a HARDCODED address: ExecBase, the
 * library stubs, the AllocMem heap, the environment-variable store, the
 * ReadArgs heap. `HunkLoader.allocateSegmentAddresses` packs a door's hunks
 * upward from 0x2000 and knows nothing about any of it, so a door whose
 * CODE + DATA + BSS is large enough simply runs off the end of its own
 * region and into the system's.
 *
 * That is not a crash. HUNK_BSS is ZEROED at load, so the door's BSS
 * silently blanks exec.library's LVO jump table, ExecBase, dos.library and
 * the heap before its first instruction executes. What the user sees is a
 * door that opens dos.library, allocates 31 bytes and exits RETURN_FAIL for
 * no visible reason.
 *
 * Measured, 2026-08-31, DoorRepo:
 *
 *     20 Aug build   BSS 0x599f4  segments end 0x06e8fc  runs
 *     current build  BSS 0x6a7fc  segments end 0x085d04  exits FAIL,
 *                                 126 exec.library trap vectors zeroed
 *
 * 0x085d04 clears the LVO table at 0x7fcf4 and ExecBase at 0x80000 by only
 * 24 KB — a door does not have to be enormous to do this, it only has to
 * cross a line nothing was watching.
 *
 * `assertDoorSegmentsFit` is what turns that into a named, fatal load error
 * BEFORE `HunkLoader.load` writes a byte. It checks segments only, not the
 * stack: the stack is placed above the highest segment and grows DOWN, so
 * its nominal 256 KB range routinely spans system addresses it never
 * touches. Enforcing the stack too would reject every door that works.
 */

import {
  ENV_VAR_STRUCT_BASE,
  ENV_STRING_BASE,
  READARGS_HEAP_BASE,
} from "./api/dos/dos-types";

/** Where HunkLoader starts packing a door's segments. */
export const DOOR_SEGMENT_BASE = 0x2000;

// Standard library stub bases. ExecLibrary holds the live copies of these
// as its own fields; both read from here so the map has one definition.
export const EXEC_BASE_ADDR = 0x080000;
export const DOS_LIB_ADDR = 0x0b0000;
export const AEDOOR_LIB_ADDR = 0x0c0000;
export const ICON_LIB_ADDR = 0x0d0000;
export const INTUITION_LIB_ADDR = 0x0e0000;
export const GRAPHICS_LIB_ADDR = 0x0e8000;
export const UTILITY_LIB_ADDR = 0x0f0000;
export const BSDSOCKET_LIB_ADDR = 0x0f2000;
export const AMISSLMASTER_LIB_ADDR = 0x0f4000;
export const AMISSL_LIB_ADDR = 0x0f6000;
export const DREAMDOOR_LIB_ADDR = 0x0f8000;
export const REXXSUPPORT_LIB_ADDR = 0x0fa000;
export const REXXARPLIB_LIB_ADDR = 0x0fc000;
export const FAME_LIB_ADDR = 0x0fe000;

/** ExecLibrary's AllocMem arena, and the fallback base for stub libraries. */
export const ALLOCMEM_HEAP_BASE = 0x100000;

/** The address DoorLoader parks as the door's outermost return address. */
export const DOOR_EXIT_TRAP_ADDR = 0x1ff000;

/** LibraryLoader's first base for a real 68K library, stepping downward. */
export const NATIVE_LIBRARY_BASE = 0x200000;

/**
 * A library's LVO jump table sits at NEGATIVE offsets from its base, so
 * exec.library's vectors occupy the kilobyte immediately BELOW ExecBase
 * (the lowest one observed in practice is FindTask's neighbourhood at
 * 0x7fcf4, 780 bytes down). The door region has to stop below those, not
 * below ExecBase itself.
 */
export const EXEC_LVO_TABLE_BYTES = 0x1000;

/**
 * First address a door's hunks may NOT occupy. Gives a door 0x2000-0x7f000,
 * i.e. 500 KB of CODE + DATA + BSS — the "0x001000-0x07FFFF: Door code
 * segments (512KB max)" line that ExecLibrary's map comment has always
 * claimed and nothing has ever enforced.
 */
export const DOOR_SEGMENT_LIMIT = EXEC_BASE_ADDR - EXEC_LVO_TABLE_BYTES;

interface ReservedRegion {
  /** Lowest address the region occupies. */
  start: number;
  /** Human-readable name, used verbatim in the load error. */
  name: string;
}

/**
 * Everything a door's segments would destroy if they ran past the limit,
 * lowest first. Used only to name the damage in the error message.
 */
export const RESERVED_REGIONS: ReservedRegion[] = [
  { start: DOOR_SEGMENT_LIMIT, name: "exec.library LVO jump table" },
  { start: EXEC_BASE_ADDR, name: "ExecBase" },
  { start: DOS_LIB_ADDR, name: "dos.library" },
  { start: AEDOOR_LIB_ADDR, name: "AEDoor.library" },
  { start: ICON_LIB_ADDR, name: "icon.library" },
  { start: INTUITION_LIB_ADDR, name: "intuition.library" },
  { start: GRAPHICS_LIB_ADDR, name: "graphics.library" },
  { start: UTILITY_LIB_ADDR, name: "utility.library" },
  { start: BSDSOCKET_LIB_ADDR, name: "bsdsocket.library" },
  { start: AMISSLMASTER_LIB_ADDR, name: "amisslmaster.library" },
  { start: AMISSL_LIB_ADDR, name: "amissl.library" },
  { start: DREAMDOOR_LIB_ADDR, name: "dreamdoor.library" },
  { start: REXXSUPPORT_LIB_ADDR, name: "rexxsupport.library" },
  { start: REXXARPLIB_LIB_ADDR, name: "rexxarplib.library" },
  { start: FAME_LIB_ADDR, name: "fame.library" },
  { start: ALLOCMEM_HEAP_BASE, name: "the AllocMem heap" },
  { start: ENV_VAR_STRUCT_BASE, name: "environment variable structures" },
  { start: ENV_STRING_BASE, name: "environment variable strings" },
  { start: READARGS_HEAP_BASE, name: "the ReadArgs heap" },
  { start: DOOR_EXIT_TRAP_ADDR, name: "the door exit trap" },
  { start: NATIVE_LIBRARY_BASE, name: "loaded 68K libraries" },
];

/** A hunk segment, in the shape HunkLoader.parse produces. */
export interface DoorSegment {
  address: number;
  size?: number;
  data?: { length: number };
  type?: string;
}

/** Thrown when a door's hunks do not fit in the door region. */
export class DoorTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DoorTooLargeError";
  }
}

function segmentSize(segment: DoorSegment): number {
  return segment.size ?? (segment.data ? segment.data.length : 0);
}

/**
 * Names every reserved region the half-open span [start, end) touches,
 * lowest first. Empty when the span stays inside the door region.
 */
export function reservedRegionsInSpan(start: number, end: number): string[] {
  return RESERVED_REGIONS.filter((r) => r.start >= start && r.start < end).map(
    (r) => r.name,
  );
}

/**
 * Reject a door whose hunks would be loaded on top of the emulator itself.
 *
 * Call this after HunkLoader.parse and BEFORE HunkLoader.load — once load
 * runs, the BSS clear has already happened and the emulator is corrupt.
 *
 * @throws DoorTooLargeError naming the segment, its span, and what it would
 *         have overwritten.
 */
export function assertDoorSegmentsFit(
  segments: DoorSegment[],
  doorLabel: string,
): void {
  let highestEnd = 0;
  let offender: { index: number; segment: DoorSegment; end: number } | null =
    null;

  for (let i = 0; i < segments.length; i++) {
    const end = segments[i].address + segmentSize(segments[i]);
    if (end > highestEnd) highestEnd = end;
    if (end > DOOR_SEGMENT_LIMIT && (!offender || end > offender.end)) {
      offender = { index: i, segment: segments[i], end };
    }
  }

  if (!offender) return;

  const hex = (n: number) => `0x${n.toString(16)}`;
  const kb = (n: number) => `${Math.ceil(n / 1024)} KB`;
  const damage = reservedRegionsInSpan(offender.segment.address, offender.end);
  const type = (offender.segment.type || "unknown").toUpperCase();
  const needed = highestEnd - DOOR_SEGMENT_BASE;
  const budget = DOOR_SEGMENT_LIMIT - DOOR_SEGMENT_BASE;

  throw new DoorTooLargeError(
    `${doorLabel} is too large for the emulator's door region: segment ` +
      `${offender.index} (${type}) spans ${hex(offender.segment.address)}-` +
      `${hex(offender.end)}, past the ${hex(DOOR_SEGMENT_LIMIT)} ceiling. ` +
      `Loading it would overwrite ${damage.join(", ")}. ` +
      `The door needs ${kb(needed)} of CODE+DATA+BSS; a door gets ` +
      `${hex(DOOR_SEGMENT_BASE)}-${hex(DOOR_SEGMENT_LIMIT)} (${kb(budget)}). ` +
      `Reduce its static data (a large BSS is usually oversized global ` +
      `arrays or caches) and rebuild.`,
  );
}
