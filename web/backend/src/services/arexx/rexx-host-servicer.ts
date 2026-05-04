/**
 * REXX host-port inbound message servicer.
 *
 * #78 Phase 4 — when RexxMast (or any AREXX host running under MOIRA)
 * sends a RexxMsg to our 'AMIEXPRESS' port via PutMsg, the message
 * lands on the port's mp_MsgList. Real exec.library wakes the
 * port-owner via mp_SigBit; our singleton process model just polls
 * the list between cycle slices.
 *
 * This file holds the polling/dispatch loop. Each iteration:
 *   1. Read mp_MsgList head
 *   2. If it's not the empty-list sentinel, REMOVE the head node
 *   3. Read rm_Args[0] as an argstring (NUL-terminated, length at -4)
 *   4. parseHostCommand + dispatchHostCommand
 *   5. Write the result back into the message:
 *        rm_Result1 = result.result1 ?? 0
 *        rm_Result2 = result.result2 ?? 0
 *        if resultString:
 *          - allocate a fresh argstring via RexxSysLib.createArgstring
 *          - rm_Args[1] = pointer to it
 *   6. ReplyMsg — link onto mp_MsgList of the message's mn_ReplyPort
 *      and signal the waiting task. We use ExecLibrary.replyMsg if
 *      available, else write the linkage manually.
 *
 * Independent of the RexxMast lifecycle: as long as the host port
 * struct + execLibrary are wired (Phase 4 host-port commit), the
 * servicer can drain messages even before the emulator boots. That
 * makes the dispatch path unit-testable without a live RexxMast.
 */

import {
  parseHostCommand,
  dispatchHostCommand,
  HostCommandContext,
} from './rexx-host-dispatch';

// MsgPort.mp_MsgList lives at port + 0x14 (matches the layout
// RexxMastService.setupHostPort writes).
const MP_MSGLIST_HEAD = 0x14;
const MP_MSGLIST_TAIL = 0x18;
const MP_MSGLIST_TAILPRED = 0x1c;

// struct Message — the head fields of every RexxMsg.
const LN_SUCC = 0;
const LN_PRED = 4;
const MN_REPLYPORT = 14;

// RexxMsg fields (matches RexxSysLibLibrary).
const RM_LIBBASE = 24;
const RM_ACTION = 28;
const RM_RESULT1 = 32;
const RM_RESULT2 = 36;
const RM_ARGS = 40;
const ARGSTRING_LENGTH_OFFSET = -4;
const REXXSYSLIB_MAGIC = 0x52455858; // 'REXX'

/**
 * Read a NUL-terminated argstring at addr. Caps at 4096 to defend
 * against missing terminators (matches RexxSysLibLibrary.cStringLength).
 */
function readArgstring(emu: any, addr: number): string {
  if (addr === 0) return '';
  const len = emu.readMemory32(addr + ARGSTRING_LENGTH_OFFSET) >>> 0;
  // Trust the length header if it's reasonable; fall back to scanning
  // for NUL if the header is out of bounds (defensive — a malformed
  // argstring shouldn't crash the servicer).
  const cap = Math.min(len, 4096);
  let out = '';
  for (let i = 0; i < cap; i++) {
    const b = emu.readMemory(addr + i);
    if (b === 0) break;
    out += String.fromCharCode(b);
  }
  return out;
}

/**
 * Pop the head node off a mp_MsgList. Returns the message address
 * or 0 if the list was empty.
 *
 * Empty-list invariant (exec/lists.h NewList macro):
 *   lh_Head      → lh_Tail (which sits at MP_MSGLIST_TAIL = 0)
 *   lh_TailPred  → lh_Head
 * After popping, the list must still satisfy that invariant.
 */
function popMessage(emu: any, portAddr: number): number {
  const headPtr = emu.readMemory32(portAddr + MP_MSGLIST_HEAD) >>> 0;
  // The "list is empty" sentinel: lh_Head points at the lh_Tail field.
  // The lh_Tail field's address is portAddr + MP_MSGLIST_TAIL.
  if (headPtr === 0 || headPtr === (portAddr + MP_MSGLIST_TAIL) >>> 0) {
    return 0;
  }
  const msgAddr = headPtr;
  // Successor of the message we're popping becomes the new head.
  const nextNode = emu.readMemory32(msgAddr + LN_SUCC) >>> 0;
  // If next is the lh_Tail sentinel (0), the list becomes empty —
  // restore the NewList invariant.
  if (nextNode === 0) {
    emu.writeMemory32(portAddr + MP_MSGLIST_HEAD, (portAddr + MP_MSGLIST_TAIL) >>> 0);
    emu.writeMemory32(portAddr + MP_MSGLIST_TAILPRED, (portAddr + MP_MSGLIST_HEAD) >>> 0);
  } else {
    // Move head forward; lh_TailPred unchanged.
    emu.writeMemory32(portAddr + MP_MSGLIST_HEAD, nextNode);
    // Update the new head's ln_Pred to point back at the list head field.
    emu.writeMemory32(nextNode + LN_PRED, (portAddr + MP_MSGLIST_HEAD) >>> 0);
  }
  return msgAddr;
}

/**
 * Append a message to the END of a mp_MsgList. Used when ReplyMsg
 * routes a message back to the originator's reply port.
 */
function appendMessage(emu: any, portAddr: number, msgAddr: number): void {
  const oldTailPred = emu.readMemory32(portAddr + MP_MSGLIST_TAILPRED) >>> 0;
  // New node's successor = lh_Tail (sentinel = 0); pred = old tail-pred.
  emu.writeMemory32(msgAddr + LN_SUCC, 0);
  emu.writeMemory32(msgAddr + LN_PRED, oldTailPred);
  // Old tail-pred's successor = new node.
  emu.writeMemory32(oldTailPred + LN_SUCC, msgAddr);
  // List's tail-pred = new node.
  emu.writeMemory32(portAddr + MP_MSGLIST_TAILPRED, msgAddr);
  // If the list was empty, also fix lh_Head.
  const head = emu.readMemory32(portAddr + MP_MSGLIST_HEAD) >>> 0;
  if (head === ((portAddr + MP_MSGLIST_TAIL) >>> 0)) {
    emu.writeMemory32(portAddr + MP_MSGLIST_HEAD, msgAddr);
  }
}

/**
 * Reply a message — link it onto its mn_ReplyPort's MsgList and
 * (for a real Amiga) signal the waiting task. We skip the signal
 * because nothing in our singleton model is blocked on Wait() yet
 * (Phase 4-real wires that when RexxMast actually runs).
 */
export function replyMessage(emu: any, msgAddr: number): void {
  const replyPort = emu.readMemory32(msgAddr + MN_REPLYPORT) >>> 0;
  if (replyPort === 0) return;
  appendMessage(emu, replyPort, msgAddr);
  // Phase 4-real: signal the task here.
}

export interface ServicerStats {
  messagesProcessed: number;
  errors: number;
  unknownCommands: number;
}

/**
 * Drain every pending message on the host port. Returns stats so
 * callers can log progress / budget how often to call.
 *
 * Caller must pass:
 *   - emu: MoiraEmulator (or compatible read/write/readMemory32 API)
 *   - rexxSysLib: RexxSysLibLibrary instance for createArgstring
 *   - hostPortAddr: address of the BBS port (status.hostPortAddr)
 *   - ctx: HostCommandContext for the dispatched commands
 */
export async function serviceInboundMessages(
  emu: any,
  rexxSysLib: any,
  hostPortAddr: number,
  ctx: HostCommandContext,
): Promise<ServicerStats> {
  const stats: ServicerStats = { messagesProcessed: 0, errors: 0, unknownCommands: 0 };
  if (!emu || !hostPortAddr) return stats;

  // Cap iterations so a malformed list can't spin forever.
  const MAX_ITERS = 256;
  for (let i = 0; i < MAX_ITERS; i++) {
    const msgAddr = popMessage(emu, hostPortAddr);
    if (msgAddr === 0) break;

    // Verify it looks like a RexxMsg (defence against accidental
    // PutMsg of a bare struct Message).
    const libBase = emu.readMemory32(msgAddr + RM_LIBBASE) >>> 0;
    if (libBase !== REXXSYSLIB_MAGIC) {
      // Not our RexxMsg — reply unchanged so the originator unblocks.
      replyMessage(emu, msgAddr);
      stats.errors++;
      continue;
    }

    const arg0 = emu.readMemory32(msgAddr + RM_ARGS) >>> 0;
    const cmdLine = readArgstring(emu, arg0);
    const parsed = parseHostCommand(cmdLine);
    let result;
    try {
      result = await dispatchHostCommand(parsed, ctx);
    } catch (err: any) {
      result = {
        result1: 20,
        result2: 0,
        resultString: `dispatcher faulted: ${err?.message || err}`,
      };
      stats.errors++;
    }
    if (result.result1 === 10) stats.unknownCommands++;

    emu.writeMemory32(msgAddr + RM_RESULT1, (result.result1 ?? 0) >>> 0);
    emu.writeMemory32(msgAddr + RM_RESULT2, (result.result2 ?? 0) >>> 0);

    // Result string lands in rm_Args[1] as a fresh argstring. Using
    // RexxSysLib.createArgstring keeps it tracked + freed via the
    // standard argstring registry when DeleteRexxMsg fires later.
    if (result.resultString && rexxSysLib) {
      const len = result.resultString.length;
      // Stage the bytes in a temporary buffer in MOIRA RAM. We borrow
      // the argstring's own header by writing through createArgstring
      // with srcAddr=0 + length, then patching the bytes after.
      const argAddr = rexxSysLib.createArgstring(0, len);
      if (argAddr !== 0) {
        for (let j = 0; j < len; j++) {
          emu.writeMemory(argAddr + j, result.resultString.charCodeAt(j) & 0xff);
        }
        emu.writeMemory(argAddr + len, 0); // NUL terminator
        emu.writeMemory32(msgAddr + RM_ARGS + 4, argAddr); // rm_Args[1]
      }
    }

    replyMessage(emu, msgAddr);
    stats.messagesProcessed++;
  }
  return stats;
}
