/**
 * exec.library function vectors
 * Reference: NDK3.2R4/Include_I/lvo/exec_lib.i
 */

import { LibraryVector } from "./types";
import { ExecLibrary } from "../ExecLibrary";
import { debugLog } from "../../../utils/debug-log";
import * as fs from "fs";
import * as path from "path";
import { getSystemTime } from '../../../utils/date-time.util';

// PERFORMANCE: Debug logging disabled by default - synchronous file I/O is slow
const TRAP_DEBUG_ENABLED = process.env.DEBUG_TRAP === '1';

// Cached at module load — read by per-message hot paths (FindPort/PutMsg/
// GetMsg/CreateMsgPort) hundreds of times per second during door execution.
const DEBUG_ENABLED = process.env.DEBUG_68K === '1' || process.env.DEBUG_68K === 'true';

// File-based debug logging for trap handlers
function logTrap(message: string): void {
  if (!TRAP_DEBUG_ENABLED) return;

  try {
    // BBS_DATA_DIR, or this checkout's root - not one developer's
    // absolute path, which on any other machine names a directory that
    // does not exist and sends the debug log nowhere.
    const bbsRoot = process.env.BBS_DATA_DIR || path.resolve(__dirname, '../../../../../..');
    const logFile = path.join(bbsRoot, "logs", "backend.log");
    const line = `[TrapDebug] ${getSystemTime().toISOString()} ${message}\n`;
    fs.appendFileSync(logFile, line, { encoding: "utf8" });
  } catch (e) {
console.error(`[TrapDebug] Failed to write log: ${e}`);
  }
}

export const EXEC_VECTORS: LibraryVector[] = [
  {
    // LVO -336 FreeSignal (RKRM Libraries §Exec). D0 = signal bit.
    // Without this vector the LVO falls through to the auto-installed
    // stub that does nothing — the bit stays allocated, future
    // AllocSignal calls in the same door run out of bits or get the
    // wrong one. Bulk-probe (2026-05-12, 50 archives) showed 3 doors
    // calling FreeSignal as a stub. Safe under all states — the
    // freeSignal impl already validates the bit range + no-ops on
    // unallocated bits.
    offset: -336,
    name: "FreeSignal",
    handler: (emu, lib: ExecLibrary) => {
      const signalBit = emu.getRegister(0); // D0
      lib.freeSignalPublic(signalBit);
      return 0;
    },
  },
  {
    // LVO -360 RemPort (RKRM Libraries §Exec). A1 = port address.
    // Spec: unlink port from ExecBase->PortList. Membership-guarded
    // via ExecLibrary.remPort() — silently ignores ports that were
    // never added (a previous unguarded attempt corrupted the global
    // list head/tailPred when the door called RemPort on its own
    // private reply port, which AEDoor.library allocates without
    // adding to ExecBase->PortList).
    offset: -360,
    name: "RemPort",
    handler: (emu, lib: ExecLibrary) => {
      const portAddr = emu.getRegister(9); // A1
      lib.remPort(portAddr);
      return 0;
    },
  },
  // ============================================
  // Device / IO request family — defensive impls. Doors typically open
  // timer.device, console.device, or serial.device and do DoIO for
  // timing or character output we model elsewhere (XIM protocol). The
  // door doesn't care about real device behaviour as long as the open
  // claims success and DoIO returns 0. Pair Open/CloseDevice + Create/
  // DeleteIORequest + DoIO/WaitIO/CheckIO/AbortIO so any door using
  // any subset gets a consistent stack. Bulk-probe 2026-05-12 ranked
  // these (post-FreeSignal/RemPort fix) as the highest-doors-hit stubs:
  // OpenDevice 51, CloseDevice 21, CreateIORequest 12, DoIO 8.
  // ============================================
  {
    // -444 OpenDevice. A0=devName, D0=unit, A1=ioRequest, D1=flags.
    // Sets io_Error in the IORequest (offset 31, 1 byte) to 0 and
    // returns 0 in D0 = "success". Doors then call DoIO which we
    // also return 0 from.
    offset: -444,
    name: "OpenDevice",
    handler: (emu, _lib: ExecLibrary) => {
      const ioReq = emu.getRegister(9); // A1
      if (ioReq !== 0) {
        emu.writeMemory(ioReq + 31, 0); // io_Error = 0
      }
      return 0; // D0 = 0 success
    },
  },
  {
    // -450 CloseDevice. A1=ioRequest. Void return per autodoc.
    offset: -450,
    name: "CloseDevice",
    handler: () => 0,
  },
  {
    // -456 DoIO. A1=ioRequest. Returns io_Error (we set 0 = ok).
    offset: -456,
    name: "DoIO",
    handler: (emu, _lib: ExecLibrary) => {
      const ioReq = emu.getRegister(9); // A1
      if (ioReq !== 0) {
        emu.writeMemory(ioReq + 31, 0); // io_Error = 0
      }
      return 0;
    },
  },
  {
    // -468 CheckIO. A1=ioRequest. Returns ioRequest if complete else 0.
    // We always claim complete — our synchronous model has no in-flight IO.
    offset: -468,
    name: "CheckIO",
    handler: (emu, _lib: ExecLibrary) => emu.getRegister(9), // A1
  },
  {
    // -474 WaitIO. A1=ioRequest. Returns io_Error.
    offset: -474,
    name: "WaitIO",
    handler: (emu, _lib: ExecLibrary) => {
      const ioReq = emu.getRegister(9); // A1
      if (ioReq !== 0) {
        emu.writeMemory(ioReq + 31, 0);
      }
      return 0;
    },
  },
  {
    // -480 AbortIO. A1=ioRequest. Void. Our IO is always-complete; no abort needed.
    offset: -480,
    name: "AbortIO",
    handler: () => 0,
  },
  {
    // -654 CreateIORequest. A0=replyPort, D0=size. Allocates a zeroed
    // block and writes mn_ReplyPort + mn_Length. Returns block addr.
    // Pair with DeleteIORequest. Real spec is allocMem then memset 0;
    // we do the same via existing exec.allocMem helper.
    offset: -654,
    name: "CreateIORequest",
    handler: (emu, lib: ExecLibrary) => {
      const replyPort = emu.getRegister(8); // A0
      const size = emu.getRegister(0); // D0
      if (size <= 0) return 0;
      const addr = (lib as any).allocMem(size, 0x10001); // MEMF_PUBLIC | MEMF_CLEAR
      if (addr !== 0) {
        emu.writeMemory32(addr + 14, replyPort); // mn_ReplyPort
        emu.writeMemory16(addr + 18, size);      // mn_Length
        emu.writeMemory(addr + 8, 5);            // ln_Type = NT_REPLYMSG
      }
      return addr;
    },
  },
  {
    // -660 DeleteIORequest. A0=ioRequest. Frees the block.
    offset: -660,
    name: "DeleteIORequest",
    handler: (emu, lib: ExecLibrary) => {
      const ioReq = emu.getRegister(8); // A0
      if (ioReq !== 0) {
        const size = emu.readMemory16(ioReq + 18); // mn_Length
        try { (lib as any).freeMem(ioReq, size || 64); } catch { /* best-effort */ }
      }
      return 0;
    },
  },
  {
    // -222 AllocEntry. A0=memList. Spec: walk memList allocating each
    // entry. Defensive impl: return the input MemList unchanged (claim
    // "no allocations needed"). Doors that pass a MemList with N
    // entries get back the same pointer; downstream FreeEntry no-ops.
    // Only correct if doors don't actually USE the .me_Addr fields — most
    // pass-through cases do work this way. We'll revisit if a real door
    // breaks. 28 doors hit this stub.
    offset: -222,
    name: "AllocEntry",
    handler: (emu, _lib: ExecLibrary) => emu.getRegister(8), // A0
  },
  {
    // -228 FreeEntry. A0=memList. Void return.
    offset: -228,
    name: "FreeEntry",
    handler: () => 0,
  },
  // ============================================
  // Batch 2 (long-tail stubs — 1–6 doors each from 993-archive sample).
  // All safe defensive impls: return success/null/no-op per autodoc.
  // ============================================
  {
    // -498 OpenResource. A1=name. Returns NULL = "not found", which is
    // the spec-correct response when a resource isn't loaded. Doors
    // handle NULL gracefully via the standard resource error path.
    offset: -498,
    name: "OpenResource",
    handler: () => 0,
  },
  {
    // -420 SetFunction. A1=lib, A0=newFunc, D0=offset. Real impl
    // replaces an LVO and returns the previous. Defensive: return 0
    // — doors patching libs (rare) will see "no previous patch" and
    // mostly do nothing destructive. SetFunction is dangerous; even
    // a real impl would be risky against our emulated libraries.
    offset: -420,
    name: "SetFunction",
    handler: () => 0,
  },
  {
    // -282 AddTask. A1=task, A2=initPC, A3=finalPC. Spec returns the
    // task ptr. We don't run multitask, but returning input keeps
    // doors that just register tasks for later cleanup happy.
    offset: -282,
    name: "AddTask",
    handler: (emu, _lib: ExecLibrary) => emu.getRegister(9), // A1
  },
  {
    // -600 AddSemaphore. A1=sigSem. Void return. We don't lock,
    // but the door's semaphore-init path needs the call to succeed.
    offset: -600,
    name: "AddSemaphore",
    handler: () => 0,
  },
  {
    // -168 AddIntServer. D0=intNumber, A1=intServer. Void. No real
    // hardware interrupts in our emulation.
    offset: -168,
    name: "AddIntServer",
    handler: () => 0,
  },
  {
    // -648 CacheControl. D0=cacheBits, D1=cacheMask. Returns previous
    // cache state. Defensive: return 0 (no cache state).
    offset: -648,
    name: "CacheControl",
    handler: () => 0,
  },
  {
    // -132 RemMemHandler. A1=handler. Void. Pair with AddMemHandler
    // which we also no-op. Doors that allocate memhandler for low-mem
    // recovery skip the recovery path entirely.
    offset: -132,
    name: "RemMemHandler",
    handler: () => 0,
  },
  {
    // -162 SetIntVector. D0=vector, A1=interrupt. Returns previous
    // handler. Real impl installs an interrupt handler — we have no
    // real interrupts in our emulation. Return 0 (no previous handler).
    offset: -162,
    name: "SetIntVector",
    handler: () => 0,
  },
  // ============================================
  // Batch 4 — long-tail stubs surfaced in the post-LVO-batch-3 scan.
  // Two of these (AllocTrap / FreeTrap) were hit 84 408 times per door
  // in 2 doors, so almost certainly another spin loop fixed by
  // returning the canonical "no trap available" value.
  // ============================================
  {
    // -342 AllocTrap. D0=trapNum (or -1 = any). Returns trap number,
    // or -1 on failure. Defensive: -1 (no trap available). Doors that
    // poll AllocTrap in a loop checking for a free trap get a quick
    // exit. (84 408 calls per door = the loop.)
    offset: -342,
    name: "AllocTrap",
    handler: () => -1,
  },
  {
    // -348 FreeTrap. D0=trapNum. Void. Paired with AllocTrap; no-op
    // since we never actually allocate.
    offset: -348,
    name: "FreeTrap",
    handler: () => 0,
  },
  {
    // -462 SendIO. A1=ioRequest. Spec is "begin IO asynchronously,
    // return immediately, complete signals replyPort". Our IO model
    // is synchronous (DoIO already returns immediately) — set
    // io_Error=0 + reply asynchronously (via a microtask) so the
    // door's WaitPort/WaitIO sees the reply. Defensive default:
    // io_Error = 0 and return 0 like DoIO.
    offset: -462,
    name: "SendIO",
    handler: (emu, _lib: ExecLibrary) => {
      const ioReq = emu.getRegister(9); // A1
      if (ioReq !== 0) emu.writeMemory(ioReq + 31, 0);
      return 0;
    },
  },
  {
    // -426 SumLibrary. A1=library. Recomputes the library's checksum
    // after a SetFunction patch. Void/returns 0. We don't track
    // library checksums, so always-success.
    offset: -426,
    name: "SumLibrary",
    handler: () => 0,
  },
  {
    offset: -552, // LVO -552 (0xFDD8)
    name: "OpenLibrary",
    handler: (emu, lib: ExecLibrary) => {
      const nameAddr = emu.getRegister(9); // A1
      const version = emu.getRegister(0); // D0
      const name = emu.readString(nameAddr, 64);
      console.log(`[exec-vectors] OpenLibrary TRAP: name="${name}" version=${version}`);
      const result = lib.openLibrary(nameAddr, version);
      console.log(`[exec-vectors] OpenLibrary TRAP result: 0x${result.toString(16)}`);
      return result;
    },
  },
  {
    offset: -414, // LVO -414 (0xFE62)
    name: "CloseLibrary",
    handler: (emu, lib: ExecLibrary) => {
      const libAddr = emu.getRegister(9); // A1
      lib.closeLibrary(libAddr);
      return 0; // No return value
    },
  },
  {
    offset: -522, // RawDoFmt
    name: "RawDoFmt",
    handler: (emu, lib: ExecLibrary) => {
      return lib.rawDoFmt();
    },
  },
  {
    offset: -78, // LVO -78 (InitStruct)
    name: "InitStruct",
    handler: (emu, lib: ExecLibrary) => {
      const initTable = emu.getRegister(9); // A1
      const memory = emu.getRegister(10); // A2
      const size = emu.getRegister(0); // D0
      lib.initStructForTrap(initTable, memory, size);
      return 0;
    },
  },
  {
    offset: -84, // LVO -84 (MakeLibrary)
    name: "MakeLibrary",
    handler: (emu, lib: ExecLibrary) => {
      const vectors = emu.getRegister(8); // A0
      const initStruct = emu.getRegister(9); // A1
      const initFunc = emu.getRegister(10); // A2
      const dataSize = emu.getRegister(0); // D0
      const segList = emu.getRegister(1); // D1
      return lib.makeLibrary(vectors, initStruct, initFunc, dataSize, segList);
    },
  },
  {
    offset: -90, // LVO -90 (MakeFunctions)
    name: "MakeFunctions",
    handler: (emu, lib: ExecLibrary) => {
      const target = emu.getRegister(8); // A0
      const functionArray = emu.getRegister(9); // A1
      const funcDispBase = emu.getRegister(10); // A2
      return lib.makeFunctions(target, functionArray, funcDispBase);
    },
  },
  {
    offset: -96, // LVO -96 (FindResident)
    name: "FindResident",
    handler: (emu, lib: ExecLibrary) => {
      const nameAddr = emu.getRegister(9); // A1
      const name = nameAddr ? emu.readString(nameAddr, 128) : "";
      return name ? lib.findResidentByName(name) : 0;
    },
  },
  {
    offset: -102, // LVO -102 (InitResident)
    name: "InitResident",
    handler: (emu, lib: ExecLibrary) => {
      const residentAddr = emu.getRegister(9); // A1
      const segList = emu.getRegister(1); // D1
      return lib.initResidentTrap(residentAddr, segList);
    },
  },
  {
    offset: -108, // LVO -108 (Alert)
    name: "Alert",
    handler: (emu, lib: ExecLibrary) => {
      const code = emu.getRegister(0); // D0
console.warn(
        `[ExecLibrary] Alert() called (code=0x${code.toString(16)})`
      );
      return lib.handleRomInitAlert();
    },
  },
  {
    offset: -132, // LVO -132 (0xFF7C)
    name: "Forbid",
    handler: (emu, lib: ExecLibrary) => {
console.log("[ExecLibrary] Forbid() - stub (no-op)");
      // Preserve D0/condition flags; Forbid has no return value
      return emu.getRegister(0);
    },
  },
  {
    offset: -138, // LVO -138 (0xFF76)
    name: "Permit",
    handler: (emu, lib: ExecLibrary) => {
console.log("[ExecLibrary] Permit() - stub (no-op)");
      return emu.getRegister(0);
    },
  },
  {
    offset: -150, // LVO -150 (0xFF6A)
    name: "SuperState",
    handler: (emu, _lib: ExecLibrary) => {
      // SuperState: enter supervisor mode, return old user stack in D0
      // In emulation there's no privilege distinction; return current SP
      return emu.getRegister(15); // A7 (SP)
    },
  },
  {
    offset: -156, // LVO -156 (0xFF64)
    name: "UserState",
    handler: (emu, _lib: ExecLibrary) => {
      // UserState(sysStack): return to user mode, D0 = old supervisor stack
      // In emulation there's no privilege distinction; return current SP
      return emu.getRegister(15); // A7 (SP)
    },
  },
  {
    offset: -186, // LVO -186
    name: "Allocate",
    handler: (emu, _lib: ExecLibrary) => {
      // Allocate(memHeader, byteSize) -> memBlock or NULL
      //
      // Low-level chunk allocator. Walks the MemHeader's free-chunk list
      // (mh_First at A0+16) and returns the first chunk >= byteSize, splitting
      // off the remainder. Required by SAS/C's __MERGE pool runtime — when
      // this returns NULL, the SAS/C ctor at startup calls __exit(20)/FAIL.
      //
      // MemHeader layout (exec/memory.h):
      //   +0   mh_Node (LN_SIZE = 14 bytes)
      //   +14  mh_Attributes (UWORD)
      //   +16  mh_First   (APTR -> MemChunk)
      //   +20  mh_Lower   (APTR)
      //   +24  mh_Upper   (APTR)
      //   +28  mh_Free    (ULONG)
      //
      // MemChunk layout:
      //   +0   mc_Next  (APTR -> MemChunk)
      //   +4   mc_Bytes (ULONG)
      const memHeader = emu.getRegister(8); // A0
      let byteSize = emu.getRegister(0) >>> 0; // D0
      if (memHeader === 0 || byteSize === 0) return 0;

      // Round up to multiple of 8 (MEM_BLOCKSIZE for AmigaOS 1.x; 2.0+ uses 16
      // but exec internally still aligns to 8 for compatibility with old code).
      byteSize = (byteSize + 7) & ~7;

      const mhFirstAddr = memHeader + 16;
      const mhFreeAddr = memHeader + 28;

      // Walk the chunk list. prevPtrAddr is the address of the pointer that
      // currently references the candidate chunk — either mh_First (initial)
      // or the previous chunk's mc_Next field.
      let prevPtrAddr = mhFirstAddr;
      let chunk = emu.readMemory32(prevPtrAddr) >>> 0;
      while (chunk !== 0) {
        const chunkBytes = emu.readMemory32(chunk + 4) >>> 0;
        if (chunkBytes >= byteSize) {
          if (chunkBytes === byteSize) {
            // Exact fit — unlink the chunk
            const nextChunk = emu.readMemory32(chunk) >>> 0;
            emu.writeMemory32(prevPtrAddr, nextChunk);
          } else {
            // Split: leave a smaller chunk at chunk+byteSize
            const newChunkAddr = chunk + byteSize;
            const nextChunk = emu.readMemory32(chunk) >>> 0;
            emu.writeMemory32(newChunkAddr, nextChunk);          // mc_Next
            emu.writeMemory32(newChunkAddr + 4, chunkBytes - byteSize); // mc_Bytes
            emu.writeMemory32(prevPtrAddr, newChunkAddr);
          }
          // Update mh_Free
          const oldFree = emu.readMemory32(mhFreeAddr) >>> 0;
          emu.writeMemory32(mhFreeAddr, (oldFree - byteSize) >>> 0);
          return chunk >>> 0;
        }
        prevPtrAddr = chunk; // mc_Next is at offset 0 of chunk
        chunk = emu.readMemory32(chunk) >>> 0;
      }

      // No chunk fits — return NULL
      return 0;
    },
  },
  {
    offset: -234, // LVO -234
    name: "Insert",
    handler: (emu, lib: ExecLibrary) => {
      const listAddr = emu.getRegister(8);  // A0
      const nodeAddr = emu.getRegister(9);  // A1
      const afterAddr = emu.getRegister(10); // A2
      lib.insert(listAddr, nodeAddr, afterAddr);
      return emu.getRegister(0);
    },
  },
  {
    offset: -240, // LVO -240
    name: "AddHead",
    handler: (emu, lib: ExecLibrary) => {
      const listAddr = emu.getRegister(8); // A0
      const nodeAddr = emu.getRegister(9); // A1
      lib.addHead(listAddr, nodeAddr);
      return emu.getRegister(0);
    },
  },
  {
    offset: -246, // LVO -246
    name: "AddTail",
    handler: (emu, lib: ExecLibrary) => {
      const listAddr = emu.getRegister(8); // A0
      const nodeAddr = emu.getRegister(9); // A1
      lib.addTail(listAddr, nodeAddr);
      return emu.getRegister(0);
    },
  },
  {
    offset: -252, // LVO -252
    name: "Remove",
    handler: (emu, lib: ExecLibrary) => {
      const nodeAddr = emu.getRegister(9); // A1
      lib.remove(nodeAddr);
      return emu.getRegister(0);
    },
  },
  {
    offset: -258, // LVO -258
    name: "RemHead",
    handler: (emu, lib: ExecLibrary) => {
      const listAddr = emu.getRegister(8); // A0
      return lib.remHead(listAddr);
    },
  },
  {
    offset: -264, // LVO -264
    name: "RemTail",
    handler: (emu, _lib: ExecLibrary) => {
      // RemTail: remove last node from list, return it (or NULL if empty)
      // Rarely used by SAS/C runtime; stub as NULL for now
      return 0;
    },
  },
  {
    offset: -270, // LVO -270
    name: "Enqueue",
    // Enqueue(list, node): insert node into priority-sorted list. Real
    // exec walks lh_Head and stops at the first node whose ln_Pri is
    // LESS than the inserted node's ln_Pri, then links in front of it.
    // The AmiExpress RexxMast daemon uses Enqueue to drop received
    // RexxMsgs onto its global pending list before dispatching them
    // to the (in-rexxsyslib) interpreter — without a working impl
    // the list stays empty and the daemon's RemHead loop spins on
    // garbage list pointers.
    handler: (emu, lib: ExecLibrary) => {
      const listAddr = emu.getRegister(8) >>> 0; // A0
      const nodeAddr = emu.getRegister(9) >>> 0; // A1
      if (listAddr === 0 || nodeAddr === 0) return emu.getRegister(0);
      // ln_Pri is a signed BYTE at +9.
      const newPriRaw = emu.readMemory(nodeAddr + 9) & 0xff;
      const newPri = newPriRaw > 0x7f ? newPriRaw - 0x100 : newPriRaw;
      // Walk list: head is at +0, tail sentinel is +4 (lh_Tail = 0).
      const tailAddr = listAddr + 4;
      let curr = emu.readMemory32(listAddr) >>> 0;
      while (curr !== 0 && curr !== tailAddr) {
        const currPriRaw = emu.readMemory(curr + 9) & 0xff;
        const currPri = currPriRaw > 0x7f ? currPriRaw - 0x100 : currPriRaw;
        if (currPri < newPri) break;
        curr = emu.readMemory32(curr) >>> 0; // ln_Succ
      }
      // Insert node BEFORE curr (or at tail if list is empty / all
      // higher priority). Equivalent to standard exec Enqueue.
      if (curr === 0 || curr === tailAddr) {
        // Append to tail.
        lib.addTail(listAddr, nodeAddr);
      } else {
        const prev = emu.readMemory32(curr + 4) >>> 0; // ln_Pred
        emu.writeMemory32(nodeAddr + 0, curr);          // ln_Succ
        emu.writeMemory32(nodeAddr + 4, prev);          // ln_Pred
        emu.writeMemory32(curr + 4, nodeAddr);          // curr.ln_Pred
        emu.writeMemory32(prev + 0, nodeAddr);          // prev.ln_Succ
      }
      return emu.getRegister(0);
    },
  },
  {
    offset: -558, // LVO -558
    name: "InitSemaphore",
    handler: (emu, _lib: ExecLibrary) => {
      // InitSemaphore(signalSemaphore) - no-op in single-threaded emulation
      return emu.getRegister(0);
    },
  },
  {
    offset: -564, // LVO -564
    name: "ObtainSemaphore",
    handler: (emu, _lib: ExecLibrary) => {
      // ObtainSemaphore(signalSemaphore) - no-op in single-threaded emulation
      return emu.getRegister(0);
    },
  },
  {
    offset: -570, // LVO -570
    name: "ReleaseSemaphore",
    handler: (emu, _lib: ExecLibrary) => {
      // ReleaseSemaphore(signalSemaphore) - no-op in single-threaded emulation
      return emu.getRegister(0);
    },
  },
  {
    offset: -576, // LVO -576 (AttemptSemaphore)
    name: "AttemptSemaphore",
    handler: (_emu, _lib: ExecLibrary) => {
      // AttemptSemaphore -> return TRUE (1) = semaphore obtained
      return 1;
    },
  },
  {
    offset: -594, // LVO -594 (FindSemaphore)
    name: "FindSemaphore",
    handler: (emu, _lib: ExecLibrary) => {
      // A1 = name of semaphore to find
      // Return 0 (not found) - we don't maintain a semaphore list
      const nameAddr = emu.getRegister(9); // A1
      const name = emu.readString(nameAddr, 64);
      console.log(`[exec-vectors] FindSemaphore: "${name}" -> 0 (not found)`);
      return 0;
    },
  },
  {
    offset: -408, // LVO -408 (OldOpenLibrary)
    name: "OldOpenLibrary",
    handler: (emu, lib: ExecLibrary) => {
      // OldOpenLibrary: A1 = library name, no version check (version=0)
      const nameAddr = emu.getRegister(9); // A1
      const name = emu.readString(nameAddr, 64);
      console.log(`[exec-vectors] OldOpenLibrary TRAP: name="${name}"`);
      const result = lib.openLibrary(nameAddr, 0);
      console.log(`[exec-vectors] OldOpenLibrary TRAP result: 0x${result.toString(16)}`);
      return result;
    },
  },
  {
    offset: -120, // LVO -120 (Disable)
    name: "Disable",
    handler: (_emu, _lib: ExecLibrary) => {
      // Disable interrupts - no-op in emulated single-threaded environment
      return 0;
    },
  },
  {
    offset: -126, // LVO -126 (Enable)
    name: "Enable",
    handler: (_emu, _lib: ExecLibrary) => {
      // Enable interrupts - no-op in emulated single-threaded environment
      return 0;
    },
  },
  {
    offset: -192, // LVO -192 (Deallocate)
    name: "Deallocate",
    handler: (_emu, _lib: ExecLibrary) => {
      // Deallocate memory from a MemHeader region - no-op (we use AllocMem/FreeMem)
      return 0;
    },
  },
  {
    offset: -216, // LVO -216 (AvailMem)
    name: "AvailMem",
    handler: (_emu, _lib: ExecLibrary) => {
      // Return available memory - report 4MB available
      return 4 * 1024 * 1024;
    },
  },
  {
    offset: -276, // LVO -276 (FindName)
    name: "FindName",
    handler: (emu, _lib: ExecLibrary) => {
      // A0 = list, A1 = name string. Search list for node with matching ln_Name.
      // Return 0 (not found) - most callers handle this gracefully
      const nameAddr = emu.getRegister(9); // A1
      const name = emu.readString(nameAddr, 64);
      console.log(`[exec-vectors] FindName: "${name}" -> 0 (not found)`);
      return 0;
    },
  },
  {
    offset: -534, // LVO -534 (TypeOfMem)
    name: "TypeOfMem",
    handler: (_emu, _lib: ExecLibrary) => {
      // D1 = address. Return memory attributes.
      // MEMF_PUBLIC (1) | MEMF_FAST (4) = 5
      return 5;
    },
  },
  {
    offset: -636, // LVO -636 (CacheClearU)
    name: "CacheClearU",
    handler: (_emu, _lib: ExecLibrary) => {
      // Clear all CPU caches - no-op in emulation
      return 0;
    },
  },
  {
    offset: -642, // LVO -642 (CacheClearE)
    name: "CacheClearE",
    handler: (_emu, _lib: ExecLibrary) => {
      // Clear specific cache lines - no-op in emulation
      return 0;
    },
  },
  {
    offset: -678, // LVO -678 (ObtainSemaphoreShared)
    name: "ObtainSemaphoreShared",
    handler: (_emu, _lib: ExecLibrary) => {
      // Same as ObtainSemaphore but for shared/read access - no-op
      return 0;
    },
  },
  {
    offset: -198, // LVO -198 (0xFF3A)
    name: "AllocMem",
    handler: (emu, lib: ExecLibrary) => {
      const size = emu.getRegister(0); // D0
      const flags = emu.getRegister(1); // D1
      console.log(`[exec-vectors] AllocMem TRAP: size=${size} (0x${size.toString(16)}) flags=0x${flags.toString(16)}`);
      if (process.env.DOOR_TRACE_ALLOCMEM_CTX === '1') {
        try {
          const a3 = emu.getRegister(11);
          const a2 = emu.getRegister(10);
          const d7 = emu.getRegister(7);
          const d6 = emu.getRegister(6);
          const d4 = emu.getRegister(4);
          const mems: string[] = [];
          for (let off = -16; off < 64; off += 4) {
            try { mems.push(`${off >= 0 ? '+' : ''}${off}=0x${emu.readMemory32(a3 + off).toString(16)}`); } catch { mems.push(`${off}=?`); }
          }
          console.log(`[exec-vectors] AllocMem CTX: A3=0x${a3.toString(16)} A2=0x${a2.toString(16)} D4=0x${d4.toString(16)} D6=0x${d6.toString(16)} D7=0x${d7.toString(16)}`);
          console.log(`[exec-vectors] AllocMem mem near A3: ${mems.join(' ')}`);
        } catch { /* ignore */ }
      }
      const result = lib.allocMem(size, flags);
      console.log(`[exec-vectors] AllocMem TRAP result: 0x${result.toString(16)}`);
      return result;
    },
  },
  {
    offset: -210, // LVO -210 (0xFF2E)
    name: "FreeMem",
    handler: (emu, lib: ExecLibrary, returnAddr?: number) => {
      const memAddr = emu.getRegister(9); // A1
      const size = emu.getRegister(0); // D0
      lib.freeMem(memAddr, size);
      // When the door tears down its heap and returns to the CLI stub (PC around 0x119a),
      // make sure the stack top holds the original seglist return so the final RTS
      // does not jump into random data.
      if (returnAddr === 0x119a) {
        const spAfterPop = emu.getRegister(15);
        const exitTrapAddr = 0x1ff000;
        emu.writeMemory32(spAfterPop, exitTrapAddr);
console.log(
          `[ExecLibrary] FreeMem exit fix: seeded exit trap 0x${exitTrapAddr.toString(
            16
          )} at SP=0x${spAfterPop.toString(16)}`
        );
      }
      return 0;
    },
  },
  {
    offset: -294, // LVO -294 (0xFED6)
    name: "FindTask",
    handler: (emu, lib: ExecLibrary) => {
      const nameAddr = emu.getRegister(9); // A1
      const name = nameAddr ? emu.readString(nameAddr, 64) : "(null - current task)";
      console.log(`[exec-vectors] FindTask TRAP: name="${name}"`);
      const result = lib.findTask(nameAddr);
      console.log(`[exec-vectors] FindTask TRAP result: 0x${result.toString(16)}`);
      return result;
    },
  },
  {
    offset: -300, // LVO -300 (SetTaskPri - CORRECTED offset)
    name: "SetTaskPri",
    handler: (emu, lib: ExecLibrary) => {
      const taskAddr = emu.getRegister(9); // A1
      const newPri = emu.getRegister(0); // D0
      return lib.setTaskPri(taskAddr, newPri);
    },
  },
  {
    offset: -306, // LVO -306 (SetSignal)
    name: "SetSignal",
    handler: (emu, lib: ExecLibrary) => {
      const newSignals = emu.getRegister(0); // D0
      const signalMask = emu.getRegister(1); // D1
      return lib.setSignal(newSignals, signalMask);
    },
  },
  {
    offset: -390, // LVO -390 (0xFFFFFE7A)
    name: "FindPort",
    handler: (emu, lib: ExecLibrary) => {
      const nameAddr = emu.getRegister(9); // A1
      const result = lib.findPort(nameAddr);
      // Hot path — fires per door message. Gated to keep latency low.
      debugLog(`[exec-vectors] FindPort TRAP: name=0x${nameAddr.toString(16)} result=0x${result.toString(16)}`);
      return result;
    },
  },
  {
    offset: -366, // LVO -366 (0xFFFFFE72)
    name: "PutMsg",
    handler: (emu, lib: ExecLibrary) => {
      const portAddr = emu.getRegister(8); // A0
      const msgAddr = emu.getRegister(9); // A1
      // Hot path — fires per door message. Gated to keep latency low.
      debugLog(`[exec-vectors] PutMsg TRAP: port=0x${portAddr.toString(16)} msg=0x${msgAddr.toString(16)}`);
      lib.putMsg(portAddr, msgAddr);
      return 0;
    },
  },
  {
    offset: -372, // LVO -372 (0xFFFFFE6C)
    name: "GetMsg",
    handler: (emu, lib: ExecLibrary) => {
      const portAddr = emu.getRegister(8); // A0
      const portName = portAddr ? lib.getPortName(portAddr) : "";
      logTrap(`GetMsg TRAP HIT! port=0x${portAddr.toString(16)} name=${portName}`);
      // Hot path — fires per door message round-trip. Gated to avoid the
      // ~3-5ms per-call disk-I/O cost on a busy backend.log.
      debugLog(
        `[ExecLibrary][Trap][GetMsg] port=0x${portAddr.toString(
          16
        )} name=${portName}`
      );
      const result = lib.getMsg(portAddr);
      logTrap(`GetMsg returning 0x${result.toString(16)}`);

      // Debug: dump reply message contents when door receives a message.
      // Skip the entire message-parse + 5 console.logs unless DEBUG_68K
      // is on — saves ~1ms per receive on a hot inbox.
      if (result !== 0 && DEBUG_ENABLED) {
        const msgType = emu.readMemory(result + 8); // ln_Type
        const command = emu.readMemory32(result + 0xE0); // Command at offset 224
        const data = emu.readMemory32(result + 0xDC); // Data at offset 220
        const strStart = result + 0x14; // String at offset 20
        let str = '';
        for (let i = 0; i < 32; i++) {
          const ch = emu.readMemory(strStart + i);
          if (ch === 0) break;
          str += String.fromCharCode(ch);
        }
        debugLog(`[ExecLibrary][GetMsg] Door received message:`);
        debugLog(`  msgAddr=0x${result.toString(16)} ln_Type=${msgType} (6=NT_REPLYMSG)`);
        debugLog(`  Command=${command} (at 0xE0)`);
        debugLog(`  Data=${data} (at 0xDC)`);
        debugLog(`  String="${str}" (at 0x14)`);
        // DEBUG dRE!WAll: dump raw bytes at offsets 0x00, 0x14, 0x100 to rule out field confusion
        if (process.env.DREWALL_TRACE === '1' && command === 100) {
          const dump = (off: number, len: number) => {
            const bs: number[] = [];
            for (let i = 0; i < len; i++) bs.push(emu.readMemory(result + off + i));
            return bs.map(b => b.toString(16).padStart(2, '0')).join(' ');
          };
          console.log(`  [DT_NAME_DEBUG] getMsg raw @msg+0x00..0x13: ${dump(0, 20)}`);
          console.log(`  [DT_NAME_DEBUG] getMsg raw @msg+0x14..0x27: ${dump(0x14, 20)}`);
          console.log(`  [DT_NAME_DEBUG] getMsg raw @msg+0x100..0x107: ${dump(0x100, 8)} (strPtr)`);
        }
      }

      return result;
    },
  },
  {
    offset: -318, // LVO -318 (0xFFFFFEC2)
    name: "Wait",
    handler: (emu, lib: ExecLibrary) => {
      const signalMask = emu.getRegister(0); // D0
console.log(`[ExecLibrary][Trap][Wait] signalMask=0x${signalMask.toString(16)}`);
      const result = lib.wait(signalMask);
console.log(`[ExecLibrary][Trap][Wait] returned 0x${result.toString(16)}`);
      return result;
    },
  },
  {
    offset: -324, // LVO -324 (0xFFFFFEBC)
    name: "Signal",
    handler: (emu, lib: ExecLibrary) => {
      const taskAddr = emu.getRegister(9); // A1
      const signals = emu.getRegister(0); // D0
      lib.signal(taskAddr, signals);
      return 0;
    },
  },
  {
    offset: -30, // LVO -30 (0xFFFFFFE2)
    name: "Supervisor",
    handler: (emu: any, lib: any, returnAddr: any) => {
      // Supervisor() - Execute a function in supervisor mode
      // Input: A5 = function pointer to execute
      // The function is called with return address on stack
      // Returns: D0 = result from supervisor function

      const a5 = emu.getRegister(13); // A5 - supervisor function pointer
console.log(
        `[LibraryTraps] Supervisor: calling function at 0x${a5.toString(
          16
        )}, returnAddr=0x${returnAddr.toString(16)}`
      );

      // Set PC to the supervisor function address
      // The function will execute and eventually RTS back to returnAddr
      emu.setRegister(16, a5); // PC = supervisor function
      emu.refillPrefetch(); // CRITICAL: Refill prefetch after changing PC

      // CRITICAL: Do NOT push return address - it's already on stack from JSR to Supervisor
      // The supervisor function will RTS to returnAddr (which handleTrap already popped)
      // So we need to push returnAddr back for the supervisor function to RTS to
      const sp = emu.getRegister(15);
      emu.writeMemory32(sp - 4, returnAddr);
      emu.setRegister(15, sp - 4);

console.log(
        `[LibraryTraps] Supervisor: PC set to 0x${a5.toString(
          16
        )}, return will go to 0x${returnAddr.toString(16)}`
      );

      // Return 0 - actual return value will come from supervisor function via D0
      return 0;
    },
  },
  {
    offset: -330, // LVO -330 (0xFFFFFEB6)
    name: "AllocSignal",
    handler: (emu, lib: ExecLibrary) => {
      const signalNum = emu.getRegister(0); // D0 (signed byte, -1 = any free signal)
      const result = lib.AllocSignal(signalNum);
      return result; // Return signal number or -1 in D0
    },
  },
  {
    offset: -354, // LVO -354 (0xFFFFFE9E)
    name: "AddPort",
    handler: (emu, lib: ExecLibrary) => {
      const portAddr = emu.getRegister(9); // A1 - port pointer
      lib.addPort(portAddr);
      return 0; // AddPort has no return value
    },
  },
  {
    offset: -378, // LVO -378 (0xFFFFFE86)
    name: "ReplyMsg",
    handler: (emu, lib: ExecLibrary) => {
      const msgAddr = emu.getRegister(9); // A1
      lib.replyMsg(msgAddr);
      return 0;
    },
  },
  {
    offset: -384, // LVO -384 (0xFFFFFE80)
    name: "WaitPort",
    handler: (emu, lib: ExecLibrary) => {
      const portAddr = emu.getRegister(8); // A0
      const portName = portAddr ? lib.getPortName(portAddr) : "";
console.log(
        `[ExecLibrary][Trap][WaitPort] port=0x${portAddr.toString(
          16
        )} name=${portName}`
      );
      return lib.waitPort(portAddr);
    },
  },
  {
    offset: -114, // LVO -114 (0xFF8E) - amiga.lib CreatePort
    name: "CreatePort",
    handler: (emu, lib: ExecLibrary) => {
      const nameAddr = emu.getRegister(8); // A0 = name pointer
      const priority = emu.getRegister(0); // D0 = priority
      debugLog(`[ExecLibrary][Trap][CreatePort] nameAddr=0x${nameAddr.toString(16)}, priority=${priority}`);
      return lib.createPort(nameAddr, priority);
    },
  },
  {
    offset: -666, // LVO -666 (0xFFFFFD66)
    name: "CreateMsgPort",
    handler: (emu, lib: ExecLibrary) => {
      const result = lib.createMsgPort();
      debugLog(`[exec-vectors] CreateMsgPort TRAP: result=0x${result.toString(16)}`);
      return result;
    },
  },
  {
    offset: -672, // LVO -672 (0xFFFFFD60)
    name: "DeleteMsgPort",
    handler: (emu, lib: ExecLibrary) => {
      const portAddr = emu.getRegister(8); // A0
      lib.deleteMsgPort(portAddr);
      return 0;
    },
  },
  {
    offset: -684, // LVO -684 (0xFFFFFD4C)
    name: "AllocVec",
    handler: (emu, lib: ExecLibrary) => {
      const byteSize = emu.getRegister(0); // D0
      const requirements = emu.getRegister(1); // D1
console.log(
        `[ExecLibrary] AllocVec(${byteSize}, 0x${requirements.toString(16)})`
      );
      return lib.allocVec(byteSize, requirements);
    },
  },
  {
    offset: -690, // LVO -690 (0xFFFFFD46)
    name: "FreeVec",
    handler: (emu, lib: ExecLibrary) => {
      const memPtr = emu.getRegister(9); // A1
      if (memPtr === 0) return 0; // NULL is valid no-op for FreeVec
      lib.freeVec(memPtr);
      return 0;
    },
  },
  {
    offset: -696, // LVO -696 (0xFFFFFD40)
    name: "CreatePool",
    handler: (emu, lib: ExecLibrary) => {
      const requirements = emu.getRegister(0); // D0
      const puddleSize = emu.getRegister(1); // D1
      const threshSize = emu.getRegister(2); // D2
console.log(
        `[ExecLibrary] CreatePool(${requirements}, ${puddleSize}, ${threshSize}) - REAL IMPLEMENTATION`
      );

      // Allocate PoolHeader structure (minimum 32 bytes)
      const poolSize = Math.max(puddleSize, 32);
      const poolAddr = lib.allocMem(poolSize, requirements);

      if (poolAddr !== 0) {
        // Initialize PoolHeader structure
        // This is a simplified AmigaOS PoolHeader structure
console.log(
          `[ExecLibrary] Created pool at 0x${poolAddr.toString(
            16
          )}, size ${puddleSize}`
        );

        // Store pool parameters for later use by AllocPooled/FreePooled
        // We'll use the emulator's memory to track pool info
        const poolInfoAddr = poolAddr + 0x20; // Use space after header for our data
        emu.writeMemory32(poolInfoAddr + 0, puddleSize); // puddleSize
        emu.writeMemory32(poolInfoAddr + 4, threshSize); // threshSize
        emu.writeMemory32(poolInfoAddr + 8, requirements); // requirements
        emu.writeMemory32(poolInfoAddr + 12, poolAddr + 32); // available memory start
        emu.writeMemory32(poolInfoAddr + 16, poolAddr + poolSize); // available memory end
      } else {
console.log(`[ExecLibrary] CreatePool FAILED - returned NULL`);
      }

      return poolAddr;
    },
  },
  {
    offset: -702, // LVO -702 (0xFFFFFD3A)
    name: "DeletePool",
    handler: (emu, lib: ExecLibrary) => {
      const pool = emu.getRegister(9); // A1
console.log(`[ExecLibrary] DeletePool(0x${pool.toString(16)})`);
      if (pool !== 0) {
        // For now, just log - actual implementation would free all pool allocations
console.log(
          `[ExecLibrary] Pool 0x${pool.toString(16)} marked for deletion`
        );
      }
      return 0;
    },
  },
  {
    offset: -708, // LVO -708 (0xFFFFFD34)
    name: "AllocPooled",
    handler: (emu, lib: ExecLibrary) => {
      const pool = emu.getRegister(9); // A1
      const size = emu.getRegister(0); // D0
console.log(
        `[ExecLibrary] AllocPooled(0x${pool.toString(
          16
        )}, ${size}) - REAL IMPLEMENTATION`
      );

      if (pool === 0) {
console.log(`[ExecLibrary] AllocPooled FAILED - NULL pool pointer`);
        return 0;
      }

      // Check if allocation size is reasonable
      if (size > 0x1000) {
console.log(
          `[ExecLibrary] AllocPooled - Large allocation ${size}, may fail`
        );
      }

      // Allocate memory using our pool management
      const allocation = lib.allocMem(size, 0x10001); // MEMF_PUBLIC | MEMF_CLEAR
console.log(
        `[ExecLibrary] AllocPooled allocated 0x${allocation.toString(
          16
        )} from pool 0x${pool.toString(16)}`
      );

      return allocation; // Return valid memory address, NOT NULL!
    },
  },
  {
    offset: -714, // LVO -714 (0xFFFFFD2E)
    name: "FreePooled",
    handler: (emu, lib: ExecLibrary) => {
      const pool = emu.getRegister(9); // A1
      const mem = emu.getRegister(0); // D0
      const size = emu.getRegister(1); // D1
console.log(
        `[ExecLibrary] FreePooled(0x${pool.toString(16)}, 0x${mem.toString(
          16
        )}, ${size})`
      );

      if (mem !== 0) {
        lib.freeMem(mem, size);
console.log(
          `[ExecLibrary] Freed memory at 0x${mem.toString(
            16
          )} back to pool 0x${pool.toString(16)}`
        );
      }
      return 0;
    },
  },
  {
    // _LVOCopyMem — critical for any V36+ binary doing struct copies (memcpy semantics).
    // Previously missing from the vector list AND missing from LVOs.i stub fallback (wrong path).
    // Symptom: doors call `jsr -0x270(a6)` and the copy silently no-ops, leaving allocated
    // buffers zero-filled where they should contain the source data.
    offset: -624,
    name: "CopyMem",
    handler: (emu, lib: ExecLibrary) => {
      const src = emu.getRegister(8);  // A0 = source
      const dst = emu.getRegister(9);  // A1 = destination
      const size = emu.getRegister(0); // D0 = size in bytes
      lib.copyMem(src, dst, size);
      return 0; // CopyMem returns void
    },
  },
  {
    offset: -630,
    name: "CopyMemQuick",
    handler: (emu, lib: ExecLibrary) => {
      const src = emu.getRegister(8);
      const dst = emu.getRegister(9);
      const size = emu.getRegister(0);
      lib.copyMemQuick(src, dst, size);
      return 0;
    },
  },
  {
    offset: -732, // LVO -732 (0xFFFFFD28)
    name: "StackSwap",
    handler: (emu, lib: ExecLibrary) => {
      const structAddr = emu.getRegister(8); // A0
      try {
        const oldSP = emu.getRegister(15);
        const ln = emu.readMemory32(structAddr); // ln_Succ
        const stNew = emu.readMemory32(structAddr + 4); // stk_Lower
        const stUpper = emu.readMemory32(structAddr + 8); // stk_Upper
        const stSP = emu.readMemory32(structAddr + 12); // stk_Pointer
console.log(
          `[StackSwap] struct=0x${structAddr.toString(
            16
          )} ln=0x${ln.toString(16)} lower=0x${stNew.toString(
            16
          )} upper=0x${stUpper.toString(16)} newSP=0x${stSP.toString(
            16
          )} oldSP=0x${oldSP.toString(16)}`
        );
      } catch (err) {
console.log(`[StackSwap] failed to read struct at 0x${structAddr.toString(16)}`);
      }
      lib.stackSwap(structAddr);
      return 0;
    },
  },
];
