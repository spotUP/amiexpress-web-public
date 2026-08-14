/**
 * FAME.library Emulation (minimal)
 *
 * FAME BBS compatibility layer for 68K doors written against the FIM
 * ("FAME Interface Module") door protocol. This class implements the
 * small MVP subset of FAME_lib.fd's exported functions that AmiExpress
 * doors actually call today (object alloc/free for the FAMEDoorMsg
 * structure, string copy, ascii-to-long, and memset-family helpers).
 *
 * LVO Offsets (see library-vectors/fame-vectors.ts for the full table):
 *   -150: FAMEStrCopy
 *   -204: FAMEAllocObject
 *   -210: FAMEFreeObject
 *   -354: FAMEAtol
 *
 * Source of truth for offsets:
 * amiexpress_doors/Sources/_C/FAMECFPR/Pre-Release/include/fd/FAME_lib.fd
 * (##bias 30, offset = -(30 + 6*index)).
 */

import { MoiraEmulator } from "../cpu/MoiraEmulator";
import { FAMEDOORMSG_SIZE } from "../fim/fim-constants";

const MEMF_CLEAR = 1 << 16;

/**
 * Minimal exec.library memory allocator surface FameLibrary depends on.
 * Production wiring passes closures over ExecLibrary.allocMem/freeMem;
 * tests pass a lightweight stub so they don't need the full ExecLibrary.
 */
export interface FameMemAllocator {
  allocMem(size: number, flags: number): number;
  freeMem(addr: number, size: number): void;
}

export class FameLibrary {
  private emulator: MoiraEmulator;
  private allocator: FameMemAllocator;

  constructor(emulator: MoiraEmulator, allocator: FameMemAllocator) {
    this.emulator = emulator;
    this.allocator = allocator;
  }

  /**
   * Mirrors DreamDoorLibrary's setSession so LibraryManager can call it
   * uniformly with the other compat-layer libraries. FameLibrary's MVP
   * subset (object alloc/free, string copy, ascii-to-long, memset) doesn't
   * actually need bbsSession/socket — unlike fim-protocol.ts's FIMProtocol,
   * which is the class that talks to the terminal/session for FAME doors —
   * so this is intentionally a no-op rather than storing unused fields.
   */
  setSession(_bbsSession: unknown, _socket: unknown): void {
    // Intentionally empty — see doc comment above.
  }

  /**
   * FAMEAllocObject (LVO -204)
   * Input: D0 = object type
   * Output: D0 = allocated address (0 on failure)
   *
   * Doors only request type 1 (FAMEDoorMsg) today. Per the task brief,
   * allocate FAMEDOORMSG_SIZE zeroed bytes for ANY type — returning 0 for
   * unknown types is wrong; log unexpected types for visibility instead.
   */
  allocObject(type: number): number {
    if (type !== 1) {
      console.log(`[FAME.library] FAMEAllocObject: unexpected type=${type}, allocating FAMEDoorMsg anyway`);
    }
    const addr = this.allocator.allocMem(FAMEDOORMSG_SIZE, MEMF_CLEAR);
    console.log(`[FAME.library] FAMEAllocObject(type=${type}) -> 0x${addr.toString(16)}`);
    return addr;
  }

  /**
   * FAMEFreeObject (LVO -210)
   * Input: A1 = object address
   */
  freeObject(addr: number): void {
    console.log(`[FAME.library] FAMEFreeObject(0x${addr.toString(16)})`);
    this.allocator.freeMem(addr, FAMEDOORMSG_SIZE);
  }

  /**
   * FAMEStrCopy (LVO -150)
   * Input: A0 = source, A1 = destination, D0 = maxLen
   * Output: D0 = number of bytes copied (excluding NUL terminator)
   *
   * Copies a C string, capped at maxLen-1 characters, and always
   * NUL-terminates the destination (matching the .fd's maxLen semantics).
   */
  strCopy(srcAddr: number, dstAddr: number, maxLen: number): number {
    if (maxLen <= 0) {
      return 0;
    }
    const limit = maxLen - 1;
    let copied = 0;
    while (copied < limit) {
      const byte = this.emulator.readMemory(srcAddr + copied);
      if (byte === 0) {
        break;
      }
      this.emulator.writeMemory(dstAddr + copied, byte);
      copied++;
    }
    this.emulator.writeMemory(dstAddr + copied, 0);
    return copied;
  }

  /**
   * FAMEAtol (LVO -354)
   * Input: A0 = buffer (NUL-terminated ASCII string)
   * Output: D0 = parsed integer value (supports leading whitespace/sign)
   */
  atol(bufAddr: number): number {
    const str = this.emulator.readString(bufAddr, 32);
    const value = parseInt(str.trim(), 10);
    return Number.isNaN(value) ? 0 : value;
  }

  /**
   * FAMEStrFil / FAMEFillMem / FAMEMemSet (LVOs -72 / -120 / -174)
   * Input: A0 = buffer, D0 = fill char, D1 = number of chars
   * All three .fd entries share the same (buffer, char, count) signature
   * and semantics — a plain memset.
   */
  memSet(bufAddr: number, fillChar: number, count: number): void {
    for (let i = 0; i < count; i++) {
      this.emulator.writeMemory(bufAddr + i, fillChar & 0xff);
    }
  }

  /**
   * Fallback for LVOs registered in fame-vectors.ts but not yet given a
   * real implementation. Logs and returns 0 so callers relying on a
   * "success" nonzero return fail loudly during debugging rather than
   * silently succeeding.
   */
  stub(name: string): number {
    console.log(`[FAME.library] STUB ${name}`);
    return 0;
  }
}
