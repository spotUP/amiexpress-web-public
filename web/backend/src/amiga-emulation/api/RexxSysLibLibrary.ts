/**
 * rexxsyslib.library — message + argstring plumbing for native AREXX.
 *
 * #78 Phase 2. Implements the 10 LVO functions RexxMast and ARexx host
 * binaries call to allocate / free / query the structures REXX uses
 * for inter-task communication. None of these touch script
 * interpretation directly — that's RexxMast's job (Phase 3); this
 * file is just the memory + struct plumbing underneath.
 *
 * LVO offsets (from `Libs/rexxsyslib.library` FD file, axconsts pin):
 *   -126 CreateArgstring (UBYTE *string, ULONG length)
 *   -132 DeleteArgstring (UBYTE *argstring)
 *   -138 LengthArgstring (UBYTE *argstring)
 *   -144 CreateRexxMsg   (struct MsgPort *port, UBYTE *ext, UBYTE *host)
 *   -150 DeleteRexxMsg   (struct RexxMsg *packet)
 *   -156 ClearRexxMsg    (struct RexxMsg *msg, ULONG count)
 *   -162 FillRexxMsg     (struct RexxMsg *msg, ULONG count, ULONG mask)
 *   -168 IsRexxMsg       (struct RexxMsg *msg)
 *   -450 LockRexxBase    (ULONG resource)
 *   -456 UnlockRexxBase  (ULONG resource)
 *
 * ARGSTRING layout (RKRM, "Using ARexx" appendix B):
 *   offset -8:  hash (ULONG, optional — we leave 0)
 *   offset -4:  length (ULONG, in bytes, NOT including the NUL)
 *   offset  0:  string data + NUL terminator
 * The pointer returned to the caller points to offset 0.
 *
 * REXXMSG layout (struct RexxMsg from <rexx/storage.h>, 128 bytes):
 *   +0   rm_Node       struct Message  (20 bytes)
 *   +20  rm_TaskBlock  APTR
 *   +24  rm_LibBase    APTR  (used by IsRexxMsg as the magic cookie —
 *                              we write REXXSYSLIB_MAGIC here)
 *   +28  rm_Action     LONG
 *   +32  rm_Result1    LONG
 *   +36  rm_Result2    LONG
 *   +40  rm_Args[16]   STRPTR  (16 × 4 bytes = 64)
 *   +104 rm_PassPort   APTR
 *   +108 rm_CommAddr   STRPTR
 *   +112 rm_FileExt    STRPTR
 *   +116 rm_Stdin      LONG
 *   +120 rm_Stdout     LONG
 *   +124 rm_avail      LONG
 * Total: 128 bytes.
 *
 * struct Message (Exec, 20 bytes):
 *   +0  ln_Succ       APTR
 *   +4  ln_Pred       APTR
 *   +8  ln_Type       UBYTE  (NT_REXXMSG = 21 → IsRexxMsg checks this)
 *   +9  ln_Pri        BYTE
 *   +10 ln_Name       STRPTR
 *   +14 mn_ReplyPort  APTR
 *   +18 mn_Length     UWORD
 */

import { MoiraEmulator } from '../cpu/MoiraEmulator';
import { ExecLibrary } from './ExecLibrary';

// ----- Argstring constants -------------------------------------------------
const ARGSTRING_HEADER = 8;       // 4 bytes hash + 4 bytes length
const ARGSTRING_LENGTH_OFFSET = -4;
const ARGSTRING_HASH_OFFSET = -8;

// ----- RexxMsg constants ---------------------------------------------------
const REXXMSG_SIZE = 128;
const RM_TASKBLOCK = 20;
const RM_LIBBASE = 24;
const RM_ACTION = 28;
const RM_RESULT1 = 32;
const RM_RESULT2 = 36;
const RM_ARGS = 40;          // base of rm_Args[16]
const RM_ARGS_COUNT = 16;
const RM_PASSPORT = 104;
const RM_COMMADDR = 108;
const RM_FILEEXT = 112;
const RM_STDIN = 116;
const RM_STDOUT = 120;
const RM_AVAIL = 124;

// struct Node fields (offsets within rm_Node)
const LN_TYPE = 8;
const LN_PRI = 9;
const MN_REPLYPORT = 14;
const MN_LENGTH = 18;

// NT_REXXMSG (from <exec/nodes.h>) — the marker IsRexxMsg checks for.
const NT_REXXMSG = 21;

// MEMF_CLEAR | MEMF_PUBLIC — same flags used by other libraries
// (see ExecLibrary callers).
const MEMF_PUBLIC_CLEAR = 0x10001;

/**
 * Magic cookie written into rm_LibBase by CreateRexxMsg so IsRexxMsg
 * has a reliable way to recognise our messages even when the caller
 * synthesises one outside CreateRexxMsg. Real Amiga writes the
 * RexxSysBase pointer here; our pointer is conceptual.
 */
const REXXSYSLIB_MAGIC = 0x52455858; // 'REXX'

export class RexxSysLibLibrary {
  private emulator: MoiraEmulator;
  private execLibrary: ExecLibrary;

  /**
   * Track every argstring we allocate so DeleteArgstring can verify
   * it's a real one (defends against the ARexx host accidentally
   * passing us a non-argstring pointer — common bug pattern).
   */
  private argstringRegistry = new Set<number>();

  /** Same idea for RexxMsg: bookkeeping + leak detection in tests. */
  private rexxMsgRegistry = new Set<number>();

  /**
   * The rexxsyslib library base — used as the cookie in rm_LibBase
   * (real Commodore RexxMaster compares to RexxSysBase directly, not
   * a magic constant). RexxMastService sets this once at boot via
   * setLibraryBase. For TS-only paths that don't have a real base
   * loaded, we keep the literal 'REXX' magic as a fallback so
   * IsRexxMsg still recognises our own messages.
   */
  private libraryBase: number = REXXSYSLIB_MAGIC;

  constructor(emulator: MoiraEmulator, execLibrary: ExecLibrary) {
    this.emulator = emulator;
    this.execLibrary = execLibrary;
  }

  /**
   * Tell the helper which rexxsyslib base to stamp in rm_LibBase. Set
   * by RexxMastService after the library loads — without this the
   * daemon's own libBase comparison rejects our messages because real
   * rexxsyslib stamps the actual library base, not a magic constant.
   */
  setLibraryBase(base: number): void {
    this.libraryBase = base >>> 0 || REXXSYSLIB_MAGIC;
  }

  // -------------------------------------------------------------------------
  // CreateArgstring (LVO -126)
  // Input:  A0 = pointer to source bytes, D0 = length
  // Output: D0 = pointer to argstring data (0 on failure)
  // -------------------------------------------------------------------------
  createArgstring(srcAddr: number, length: number): number {
    if (length < 0) length = 0;
    // Always reserve at least 1 byte for the NUL even if length=0.
    const totalSize = ARGSTRING_HEADER + length + 1;
    const blockBase = this.execLibrary.allocMem(totalSize, MEMF_PUBLIC_CLEAR);
    if (blockBase === 0) {
      console.warn(`[RexxSysLib] CreateArgstring(len=${length}): AllocMem failed`);
      return 0;
    }

    const dataAddr = blockBase + ARGSTRING_HEADER;

    // Length goes in the header at offset -4 from the data pointer.
    this.emulator.writeMemory32(dataAddr + ARGSTRING_LENGTH_OFFSET, length >>> 0);
    // Hash (offset -8) stays 0; real ARexx uses it for symbol-table
    // lookups but our path doesn't need it.

    // Copy source bytes if any.
    if (length > 0 && srcAddr !== 0) {
      for (let i = 0; i < length; i++) {
        const byte = this.emulator.readMemory(srcAddr + i);
        this.emulator.writeMemory(dataAddr + i, byte);
      }
    }
    // NUL terminator.
    this.emulator.writeMemory(dataAddr + length, 0);

    this.argstringRegistry.add(dataAddr);
    return dataAddr;
  }

  // -------------------------------------------------------------------------
  // DeleteArgstring (LVO -132)
  // Input: A0 = argstring data pointer (NULL is a no-op per RKRM)
  // -------------------------------------------------------------------------
  deleteArgstring(argstringAddr: number): number {
    if (argstringAddr === 0) return 0;
    if (!this.argstringRegistry.has(argstringAddr)) {
      console.warn(`[RexxSysLib] DeleteArgstring(0x${argstringAddr.toString(16)}): not a known argstring`);
      return 0;
    }
    const length = this.emulator.readMemory32(argstringAddr + ARGSTRING_LENGTH_OFFSET);
    const totalSize = ARGSTRING_HEADER + (length >>> 0) + 1;
    const blockBase = argstringAddr - ARGSTRING_HEADER;
    this.execLibrary.freeMem(blockBase, totalSize);
    this.argstringRegistry.delete(argstringAddr);
    return 0;
  }

  // -------------------------------------------------------------------------
  // LengthArgstring (LVO -138)
  // Input:  A0 = argstring pointer
  // Output: D0 = length (in bytes, excluding NUL)
  // -------------------------------------------------------------------------
  lengthArgstring(argstringAddr: number): number {
    if (argstringAddr === 0) return 0;
    return this.emulator.readMemory32(argstringAddr + ARGSTRING_LENGTH_OFFSET) >>> 0;
  }

  // -------------------------------------------------------------------------
  // CreateRexxMsg (LVO -144)
  // Input:  A0 = port, A1 = extension string (or 0), D0 = host name string
  // Output: D0 = pointer to RexxMsg (0 on failure)
  //
  // Per RKRM: extension and host are duplicated into argstrings owned
  // by the message. They live in rm_FileExt and rm_CommAddr so when
  // the message is deleted those sub-allocations are cleaned up.
  // -------------------------------------------------------------------------
  createRexxMsg(portAddr: number, extensionAddr: number, hostAddr: number): number {
    const msgAddr = this.execLibrary.allocMem(REXXMSG_SIZE, MEMF_PUBLIC_CLEAR);
    if (msgAddr === 0) {
      console.warn('[RexxSysLib] CreateRexxMsg: AllocMem(128) failed');
      return 0;
    }

    // ln_Type = NT_REXXMSG so IsRexxMsg recognises us.
    this.emulator.writeMemory(msgAddr + LN_TYPE, NT_REXXMSG);
    this.emulator.writeMemory(msgAddr + LN_PRI, 0);
    // mn_ReplyPort = port the script's reply lands at.
    this.emulator.writeMemory32(msgAddr + MN_REPLYPORT, portAddr >>> 0);
    // mn_Length records the structure size for ReplyMsg() routing.
    this.emulator.writeMemory16(msgAddr + MN_LENGTH, REXXMSG_SIZE);
    // rm_LibBase = rexxsyslib library base. Real Commodore RexxMaster
    // compares this to its own library base for validity, not against
    // a magic constant — so we must stamp the real base here for the
    // daemon to accept our messages. Falls back to 'REXX' magic when
    // no base is set (e.g. unit-test paths without a loaded library).
    this.emulator.writeMemory32(msgAddr + RM_LIBBASE, this.libraryBase);

    // Duplicate extension into an argstring (rm_FileExt).
    if (extensionAddr !== 0) {
      const extLen = this.cStringLength(extensionAddr);
      const extDup = this.createArgstring(extensionAddr, extLen);
      this.emulator.writeMemory32(msgAddr + RM_FILEEXT, extDup);
    }
    // Duplicate host into an argstring (rm_CommAddr).
    if (hostAddr !== 0) {
      const hostLen = this.cStringLength(hostAddr);
      const hostDup = this.createArgstring(hostAddr, hostLen);
      this.emulator.writeMemory32(msgAddr + RM_COMMADDR, hostDup);
    }

    this.rexxMsgRegistry.add(msgAddr);
    return msgAddr;
  }

  // -------------------------------------------------------------------------
  // DeleteRexxMsg (LVO -150)
  // Input: A0 = RexxMsg pointer (NULL is a no-op)
  // Frees the message and any owned argstrings (Args, FileExt, CommAddr).
  // -------------------------------------------------------------------------
  deleteRexxMsg(msgAddr: number): number {
    if (msgAddr === 0) return 0;
    if (!this.rexxMsgRegistry.has(msgAddr)) {
      console.warn(`[RexxSysLib] DeleteRexxMsg(0x${msgAddr.toString(16)}): not a known RexxMsg`);
      return 0;
    }
    // Free any rm_Args entries that are non-NULL argstrings.
    for (let i = 0; i < RM_ARGS_COUNT; i++) {
      const argAddr = this.emulator.readMemory32(msgAddr + RM_ARGS + i * 4) >>> 0;
      if (argAddr !== 0 && this.argstringRegistry.has(argAddr)) {
        this.deleteArgstring(argAddr);
      }
    }
    // Free rm_FileExt and rm_CommAddr.
    const extAddr = this.emulator.readMemory32(msgAddr + RM_FILEEXT) >>> 0;
    if (extAddr !== 0) this.deleteArgstring(extAddr);
    const commAddr = this.emulator.readMemory32(msgAddr + RM_COMMADDR) >>> 0;
    if (commAddr !== 0) this.deleteArgstring(commAddr);

    this.execLibrary.freeMem(msgAddr, REXXMSG_SIZE);
    this.rexxMsgRegistry.delete(msgAddr);
    return 0;
  }

  // -------------------------------------------------------------------------
  // ClearRexxMsg (LVO -156)
  // Input: A0 = msg, D0 = count of arg slots to clear
  // Frees argstrings in rm_Args[0..count-1] and zeros the slots.
  // Also zeros rm_Action / rm_Result1 / rm_Result2 (per RKRM).
  // -------------------------------------------------------------------------
  clearRexxMsg(msgAddr: number, count: number): number {
    if (msgAddr === 0) return 0;
    const limit = Math.min(count >>> 0, RM_ARGS_COUNT);
    for (let i = 0; i < limit; i++) {
      const argSlot = msgAddr + RM_ARGS + i * 4;
      const argAddr = this.emulator.readMemory32(argSlot) >>> 0;
      if (argAddr !== 0 && this.argstringRegistry.has(argAddr)) {
        this.deleteArgstring(argAddr);
      }
      this.emulator.writeMemory32(argSlot, 0);
    }
    this.emulator.writeMemory32(msgAddr + RM_ACTION, 0);
    this.emulator.writeMemory32(msgAddr + RM_RESULT1, 0);
    this.emulator.writeMemory32(msgAddr + RM_RESULT2, 0);
    return 0;
  }

  // -------------------------------------------------------------------------
  // FillRexxMsg (LVO -162)
  // Input: A0 = msg, D0 = count, D1 = mask (bit i set → arg i is an
  //   argstring to keep / track; bit clear → leave as raw pointer)
  //
  // Per RKRM: this is called by RexxMast when populating a message
  // from a host's reply — the mask tells which slots received
  // freshly-allocated argstrings (so they get registered for later
  // DeleteArgstring). Non-masked slots stay as the host wrote them
  // (typically NULL or non-argstring pointers).
  //
  // We register matching slots so subsequent DeleteRexxMsg cleans them
  // up. Returns 1 (success) per RKRM.
  // -------------------------------------------------------------------------
  fillRexxMsg(msgAddr: number, count: number, mask: number): number {
    if (msgAddr === 0) return 0;
    const limit = Math.min(count >>> 0, RM_ARGS_COUNT);
    for (let i = 0; i < limit; i++) {
      if (((mask >>> i) & 1) === 0) continue;
      const argSlot = msgAddr + RM_ARGS + i * 4;
      const argAddr = this.emulator.readMemory32(argSlot) >>> 0;
      if (argAddr !== 0) {
        // Track it if we haven't already — host may have synthesised
        // an argstring with the proper header but bypassed our
        // CreateArgstring path.
        this.argstringRegistry.add(argAddr);
      }
    }
    return 1;
  }

  // -------------------------------------------------------------------------
  // IsRexxMsg (LVO -168)
  // Input:  A0 = potential RexxMsg pointer
  // Output: D0 = 1 if it's a RexxMsg, 0 otherwise
  // -------------------------------------------------------------------------
  isRexxMsg(msgAddr: number): number {
    if (msgAddr === 0) return 0;
    try {
      const lnType = this.emulator.readMemory(msgAddr + LN_TYPE);
      const libBase = this.emulator.readMemory32(msgAddr + RM_LIBBASE) >>> 0;
      // Accept either form: the magic cookie (TS-only path that didn't
      // load a real library) or the configured library base (live
      // RexxMast bring-up that stamped the real address).
      const acceptable =
        libBase === REXXSYSLIB_MAGIC ||
        (this.libraryBase !== REXXSYSLIB_MAGIC && libBase === this.libraryBase);
      return (lnType === NT_REXXMSG && acceptable) ? 1 : 0;
    } catch {
      return 0;
    }
  }

  // -------------------------------------------------------------------------
  // LockRexxBase / UnlockRexxBase (LVO -450 / -456)
  // No-ops: we run single-threaded; the semaphore semantics are only
  // meaningful when multiple tasks contend for the rexxsyslib globals.
  // Real RKRM: D0 carries a resource id; we ignore it but accept any.
  // -------------------------------------------------------------------------
  lockRexxBase(_resource: number): number { return 0; }
  unlockRexxBase(_resource: number): number { return 0; }

  // -------------------------------------------------------------------------
  // initRexxPort (LVO -228) — Commodore rexxsyslib's private MsgPort
  // initialiser. Our generated LVO table mislabels this as
  // AllocNamedObjectA (utility.library spec), but the AmiExpress
  // RexxMast binary actually calls it as a "build a named MsgPort"
  // helper:
  //
  //   IN:  A0 = port struct buffer (caller pre-allocated, zeroed)
  //        A1 = name string (NUL-terminated)
  //        A6 = rexxsyslib base
  //   OUT: A0 = port (unchanged)
  //        A1 = port (so the next JSR -354(A6) AddPort gets it in A1)
  //        D0 = sigbit (the daemon does `BSET D0,D7` to build its
  //             Wait mask — so D0 must be a small bit number, not a
  //             pointer; pointer-mod-32 was random-bit chaos)
  //
  // Side effects on the port struct (offsets per <exec/ports.h>):
  //   +0x08 ln_Type   = NT_MSGPORT (4)
  //   +0x0a ln_Name   = A1
  //   +0x0e mp_Flags  = PA_SIGNAL (0)
  //   +0x0f mp_SigBit = sigbit (allocated below)
  //   +0x10 mp_SigTask= ExecBase->ThisTask (so PutMsg signals the
  //                     RexxMast process the same way real Amiga does)
  //   +0x14..0x1f mp_MsgList: empty (head→tail, tail=0, tailpred→head)
  //
  // Sigbit allocation: each call hands out the next free bit starting
  // at 13. Real AmigaOS uses AllocSignal(); our singleton has no
  // contention so a counter is enough. Bits stay below 32 so they fit
  // in MOIRA's signal-bit conventions, and avoid bits 0/4/8/12 which
  // are reserved by Exec for system-wide events (CTRL-C, CTRL-D, etc).
  // -------------------------------------------------------------------------
  private nextRexxPortSigBit: number = 13;
  initRexxPort(portAddr: number, nameAddr: number): number {
    if (!portAddr) return 0;
    const sigBit = this.nextRexxPortSigBit;
    this.nextRexxPortSigBit++;
    if (this.nextRexxPortSigBit > 30) this.nextRexxPortSigBit = 13;
    // Resolve mp_SigTask via ExecBase->ThisTask (offset +276). Falls
    // back to 0 if ExecBase isn't set up yet — safe degradation since
    // putMsg ignores zero sigTask.
    let sigTask = 0;
    try {
      const execBasePtr = this.emulator.readMemory32(0x4) >>> 0;
      if (execBasePtr) {
        sigTask = this.emulator.readMemory32(execBasePtr + 276) >>> 0;
      }
    } catch { /* leave sigTask = 0 */ }
    // Node header
    this.emulator.writeMemory(portAddr + 0x08, 4);              // ln_Type = NT_MSGPORT
    this.emulator.writeMemory(portAddr + 0x09, 0);              // ln_Pri
    this.emulator.writeMemory32(portAddr + 0x0a, nameAddr >>> 0); // ln_Name
    // MsgPort fields
    this.emulator.writeMemory(portAddr + 0x0e, 0);              // mp_Flags = PA_SIGNAL
    this.emulator.writeMemory(portAddr + 0x0f, sigBit);
    this.emulator.writeMemory32(portAddr + 0x10, sigTask);
    // Empty mp_MsgList: lh_Head -> lh_Tail (=0), lh_TailPred -> lh_Head.
    this.emulator.writeMemory32(portAddr + 0x14, portAddr + 0x18);
    this.emulator.writeMemory32(portAddr + 0x18, 0);
    this.emulator.writeMemory32(portAddr + 0x1c, portAddr + 0x14);
    this.emulator.writeMemory(portAddr + 0x20, 5);              // lh_Type = NT_MESSAGE
    this.emulator.writeMemory(portAddr + 0x21, 0);
    return sigBit;
  }

  /** Test-only: peek at the next sigbit allocator state. */
  _peekNextRexxPortSigBit(): number { return this.nextRexxPortSigBit; }

  // -------------------------------------------------------------------------
  // Diagnostics — exposed for tests so we can assert on outstanding
  // allocations without poking at the private registries.
  // -------------------------------------------------------------------------
  _outstandingArgstringCount(): number { return this.argstringRegistry.size; }
  _outstandingRexxMsgCount(): number { return this.rexxMsgRegistry.size; }

  // -------------------------------------------------------------------------
  // Helper: read a NUL-terminated C string length, capped to 4KB so a
  // missing-NUL pointer doesn't run away through emulator memory.
  // -------------------------------------------------------------------------
  private cStringLength(addr: number): number {
    const MAX = 4096;
    for (let i = 0; i < MAX; i++) {
      if (this.emulator.readMemory(addr + i) === 0) return i;
    }
    return MAX;
  }
}
