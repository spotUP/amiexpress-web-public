/**
 * The emulator's fixed memory map, and the one rule a door binary must obey.
 *
 * MEMORY_REGIONS below is the ONE map: every region the emulator places
 * anything in at a fixed address (ExecBase, the library stubs, the CLI
 * block, the traps, the exception handlers, the MULTICOM table, the stub and
 * native libraries, the door stack, the ROM). Everything else - tasks, ports,
 * dos objects, environment variables, tag lists, DiskObjects, socket buffers
 * - is exec AllocMem, as on AmigaOS, inside "the AllocMem heap" region.
 * assertMemoryMapDisjoint() runs when exec.library is built, so two regions
 * can never be made to overlap silently again.
 *
 * `HunkLoader.allocateSegmentAddresses` packs a door's hunks upward from
 * 0x2000 and knows nothing about the regions above, so a door whose
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
 * BEFORE `HunkLoader.load` writes a byte. The stack is not the door
 * region's: it has its own (DOOR_STACK_BASE-DOOR_STACK_TOP).
 */

/** Where HunkLoader starts packing a door's segments. */
export const DOOR_SEGMENT_BASE = 0x2000;

/**
 * A library's LVO jump table sits at NEGATIVE offsets from its base, so
 * exec.library's vectors occupy the kilobyte immediately BELOW ExecBase
 * (the lowest one observed in practice is FindTask's neighbourhood at
 * 0x7fcf4, 780 bytes down). The door region has to stop below those, not
 * below ExecBase itself. Every stub library reserves the same 4 KB below its
 * base for its table.
 */
export const EXEC_LVO_TABLE_BYTES = 0x1000;
export const LIBRARY_LVO_TABLE_BYTES = 0x1000;

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

/**
 * First address a door's hunks may NOT occupy. Gives a door 0x2000-0x7f000,
 * i.e. 500 KB of CODE + DATA + BSS - the "0x001000-0x07FFFF: Door code
 * segments (512KB max)" line that ExecLibrary's map comment has always
 * claimed and nothing has ever enforced.
 */
export const DOOR_SEGMENT_LIMIT = EXEC_BASE_ADDR - EXEC_LVO_TABLE_BYTES;

/** The BBS handler task (owns AEDoorPort) and its message port. */
export const BBS_TASK_ADDR = 0x088000;
export const BBS_TASK_PORT_ADDR = 0x08805c;

/** intuition.library's stand-in Window and Screen handles. */
export const INTUITION_WINDOW_HANDLE = 0x099000;
export const INTUITION_SCREEN_HANDLE = 0x09a000;

/**
 * The door's CommandLineInterface (pr_CLI) and its strings, built once per
 * door by DoorLoader: the 128-byte CLI, the command-name BSTR, the argument
 * string GetArgStr()/A0 point at, and the argument BSTR the Amiga E startup
 * reads at -32(a5).
 */
export const DOOR_CLI_ADDR = 0x0a0000;
export const DOOR_CLI_COMMAND_NAME_ADDR = 0x0a0080;
export const DOOR_CLI_ARGS_ADDR = 0x0a0200;
export const DOOR_CLI_ARGS_BSTR_ADDR = 0x0a0600;
/** Longest argument string (with its newline) the CLI block holds. */
export const DOOR_CLI_ARGS_MAX = 0x3ff;
const DOOR_CLI_END = 0x0a0800;

/** ExecLibrary's AllocMem arena. */
export const ALLOCMEM_HEAP_BASE = 0x100000;

/**
 * Four-byte scratch longs the utility.library tag helpers use as a
 * TagItem cursor (0x1fe000-0x1fe033).
 */
export const UTILITY_SCRATCH_ADDR = 0x1fe000;

/**
 * First address the AllocMem heap may NOT hand out: the system pages
 * (utility scratch, the door exit and child return traps, the XIM command
 * string). AllocMem fails (returns 0) for a request that does not fit below it.
 */
export const ALLOCMEM_HEAP_END = UTILITY_SCRATCH_ADDR;

/** The address DoorLoader parks as the door's outermost return address. */
export const DOOR_EXIT_TRAP_ADDR = 0x1ff000;

/**
 * Where a program started by RunCommand / Execute / SystemTagList returns
 * to. Its stack's return address is this trap; the trap hands the program's
 * return code back to the program that started it (dos.library child frames).
 */
export const CHILD_RETURN_TRAP_ADDR = 0x1ff100;

/** The XIM door command string (XIMProtocol). */
export const XIM_DOOR_COMMAND_ADDR = 0x1ff800;

// ---------------------------------------------------------------------------
// Fast RAM (0x200000 up). MoiraCPU maps 2 MB of chip RAM and puts the rest of
// the emulator's memory above it, so these exist only when the emulator has
// at least MEMORY_MAP_TOP bytes (assertMemoryMapFits).
// ---------------------------------------------------------------------------

/**
 * exec's 64 CPU exception handlers (32 bytes each, ADDQ.L #2,2(SP); RTE),
 * then the RTS stub low-memory vectors 0xf4-0xfc point at.
 */
export const EXCEPTION_HANDLERS_BASE = 0x200000;
export const EXCEPTION_HANDLER_SIZE = 32;
export const EXCEPTION_HANDLERS_END = EXCEPTION_HANDLERS_BASE + 64 * EXCEPTION_HANDLER_SIZE;
export const RTS_STUB_ADDR = EXCEPTION_HANDLERS_END;

/**
 * The MULTICOM node table (express.e masterNode semaphore, myNode array,
 * singlePort structures). Fixed, not allocated: it holds absolute pointers
 * and MulticomManager copies it byte for byte between every node's emulator,
 * so it must sit at the same address in all of them.
 */
export const MULTICOM_BASE = 0x201000;
export const MULTICOM_MY_NODE_ARRAY = MULTICOM_BASE + 0x3a;
export const MULTICOM_SINGLE_PORTS = MULTICOM_BASE + 0x1000;
export const MULTICOM_END = MULTICOM_SINGLE_PORTS + 32 * 512;

/**
 * Generic stub libraries (a standard system library with no disk image or
 * fixed stub: asl, gadtools, ...). One slot each; the base sits
 * LIBRARY_LVO_TABLE_BYTES into the slot so the jump table stays inside it.
 */
export const STUB_LIBRARY_SLOTS_BASE = 0x210000;
export const STUB_LIBRARY_SLOT_SIZE = 0x2000;
export const STUB_LIBRARY_SLOTS_END = 0x250000;

/** Real 68K libraries LibraryLoader loads from disk, packed upward. */
export const NATIVE_LIBRARY_BASE = 0x250000;
export const NATIVE_LIBRARY_END = 0x2f0000;

/** Lowest emulator memory size every region above exists in. */
export const MEMORY_MAP_TOP = 0x400000;

/**
 * The door process's stack: tc_SPLower DOOR_STACK_BASE, tc_SPUpper
 * DOOR_STACK_TOP, growing down. The 16 bytes above DOOR_STACK_TOP hold the
 * top-of-stack return fallback DoorLoader writes at the frame base. A door
 * gets at most DOOR_STACK_TOP - DOOR_STACK_BASE (a little over 1 MB).
 */
export const DOOR_STACK_BASE = NATIVE_LIBRARY_END;
export const DOOR_STACK_TOP = MEMORY_MAP_TOP - 0x10;

/** Kickstart ROM, and the 0xffff00 exit sentinel inside it. */
export const KICKSTART_ROM_BASE = 0xf80000;

/**
 * exec AllocMem/FreeMem, for a library that keeps memory for a program
 * (ExecLibrary satisfies it). Everything not in a MEMORY_REGIONS entry comes
 * from here.
 */
export interface ExecMemory {
  allocMem(size: number, flags: number): number;
  freeMem(addr: number, size: number): void;
}

/** MEMF_PUBLIC | MEMF_CLEAR */
export const MEMF_PUBLIC_CLEAR = 0x10001;

export interface MemoryRegion {
  /** Lowest address the region occupies. */
  start: number;
  /** First address past it. */
  end: number;
  /** Human-readable name, used verbatim in load errors. */
  name: string;
}

const libraryRegion = (base: number, nextBase: number, name: string): MemoryRegion => ({
  start: base - LIBRARY_LVO_TABLE_BYTES,
  end: nextBase - LIBRARY_LVO_TABLE_BYTES,
  name,
});

/**
 * THE memory map: every region the emulator places something in, lowest
 * first. Anything written at a fixed address belongs to one of these; all
 * other memory a door or the emulator uses comes from exec AllocMem, inside
 * "the AllocMem heap". assertMemoryMapDisjoint() proves no two overlap.
 */
export const MEMORY_REGIONS: readonly MemoryRegion[] = [
  { start: 0x000000, end: DOOR_SEGMENT_BASE, name: "CPU vectors and the low system page" },
  { start: DOOR_SEGMENT_BASE, end: DOOR_SEGMENT_LIMIT, name: "door segments" },
  { start: DOOR_SEGMENT_LIMIT, end: EXEC_BASE_ADDR, name: "exec.library LVO jump table" },
  { start: EXEC_BASE_ADDR, end: BBS_TASK_ADDR, name: "ExecBase" },
  { start: BBS_TASK_ADDR, end: BBS_TASK_ADDR + 0x1000, name: "the BBS handler task" },
  { start: INTUITION_WINDOW_HANDLE, end: INTUITION_SCREEN_HANDLE + 0x1000, name: "intuition window and screen handles" },
  { start: DOOR_CLI_ADDR, end: DOOR_CLI_END, name: "the door CLI block" },
  libraryRegion(DOS_LIB_ADDR, AEDOOR_LIB_ADDR, "dos.library"),
  libraryRegion(AEDOOR_LIB_ADDR, ICON_LIB_ADDR, "AEDoor.library"),
  libraryRegion(ICON_LIB_ADDR, INTUITION_LIB_ADDR, "icon.library"),
  libraryRegion(INTUITION_LIB_ADDR, GRAPHICS_LIB_ADDR, "intuition.library"),
  libraryRegion(GRAPHICS_LIB_ADDR, UTILITY_LIB_ADDR, "graphics.library"),
  libraryRegion(UTILITY_LIB_ADDR, BSDSOCKET_LIB_ADDR, "utility.library"),
  libraryRegion(BSDSOCKET_LIB_ADDR, AMISSLMASTER_LIB_ADDR, "bsdsocket.library"),
  libraryRegion(AMISSLMASTER_LIB_ADDR, AMISSL_LIB_ADDR, "amisslmaster.library"),
  libraryRegion(AMISSL_LIB_ADDR, DREAMDOOR_LIB_ADDR, "amissl.library"),
  libraryRegion(DREAMDOOR_LIB_ADDR, REXXSUPPORT_LIB_ADDR, "dreamdoor.library"),
  libraryRegion(REXXSUPPORT_LIB_ADDR, REXXARPLIB_LIB_ADDR, "rexxsupport.library"),
  libraryRegion(REXXARPLIB_LIB_ADDR, FAME_LIB_ADDR, "rexxarplib.library"),
  { start: FAME_LIB_ADDR - LIBRARY_LVO_TABLE_BYTES, end: ALLOCMEM_HEAP_BASE, name: "fame.library" },
  { start: ALLOCMEM_HEAP_BASE, end: ALLOCMEM_HEAP_END, name: "the AllocMem heap" },
  { start: UTILITY_SCRATCH_ADDR, end: UTILITY_SCRATCH_ADDR + 0x40, name: "utility.library scratch" },
  { start: DOOR_EXIT_TRAP_ADDR, end: CHILD_RETURN_TRAP_ADDR, name: "the door exit trap" },
  { start: CHILD_RETURN_TRAP_ADDR, end: CHILD_RETURN_TRAP_ADDR + 0x100, name: "the child return trap" },
  { start: XIM_DOOR_COMMAND_ADDR, end: 0x200000, name: "the XIM door command" },
  { start: EXCEPTION_HANDLERS_BASE, end: RTS_STUB_ADDR + 0x10, name: "exec exception handlers" },
  { start: MULTICOM_BASE, end: MULTICOM_END, name: "the MULTICOM node table" },
  { start: STUB_LIBRARY_SLOTS_BASE, end: STUB_LIBRARY_SLOTS_END, name: "stub libraries" },
  { start: NATIVE_LIBRARY_BASE, end: NATIVE_LIBRARY_END, name: "loaded 68K libraries" },
  { start: DOOR_STACK_BASE, end: MEMORY_MAP_TOP, name: "the door stack" },
  { start: KICKSTART_ROM_BASE, end: 0x1000000, name: "Kickstart ROM" },
];

const hex = (n: number) => `0x${n.toString(16)}`;

/** Throws when two regions of `regions` overlap or one is empty/inverted. */
export function assertMemoryMapDisjoint(
  regions: readonly MemoryRegion[] = MEMORY_REGIONS,
): void {
  const sorted = [...regions].sort((a, b) => a.start - b.start);
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    if (!(r.end > r.start)) {
      throw new Error(`memory map: ${r.name} is empty (${hex(r.start)}-${hex(r.end)})`);
    }
    const next = sorted[i + 1];
    if (next && next.start < r.end) {
      throw new Error(
        `memory map: ${r.name} (${hex(r.start)}-${hex(r.end)}) overlaps ` +
          `${next.name} (${hex(next.start)}-${hex(next.end)})`,
      );
    }
  }
}

/** Throws when the emulator's memory does not reach every RAM region. */
export function assertMemoryMapFits(memorySize: number): void {
  if (memorySize < MEMORY_MAP_TOP) {
    throw new Error(
      `memory map: the emulator has ${hex(memorySize)} bytes; the map needs ` +
        `${hex(MEMORY_MAP_TOP)} (the door stack ends there)`,
    );
  }
}

/** The region containing `addr`, or undefined for unmapped memory. */
export function regionAt(addr: number): MemoryRegion | undefined {
  return MEMORY_REGIONS.find((r) => addr >= r.start && addr < r.end);
}

/**
 * Everything a door's segments would destroy if they ran past the limit,
 * lowest first. Used only to name the damage in the error message.
 */
export const RESERVED_REGIONS: readonly MemoryRegion[] = MEMORY_REGIONS.filter(
  (r) => r.start >= DOOR_SEGMENT_LIMIT,
);

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
