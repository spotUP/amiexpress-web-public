// @ts-nocheck
/**
 * #78 Phase 4 — host-port message servicer.
 *
 * Drives a synthesised host port + RexxMsg through the dispatch
 * pipeline using the same FakeMoiraEmulator + FakeExecLibrary scaffold
 * the rexxsyslib-library tests use. Validates:
 *
 *   - empty mp_MsgList is a clean no-op
 *   - one message → dispatched, result1/result2/Args[1] written, replied
 *   - multiple queued messages drain in FIFO order
 *   - unknown command → result1=10, still replied so the script
 *     unblocks
 *   - non-RexxMsg garbage is returned to the originator without crash
 */

import {
  serviceInboundMessages,
} from '../../src/services/arexx/rexx-host-servicer';
import { RexxSysLibLibrary } from '../../src/amiga-emulation/api/RexxSysLibLibrary';
import {
  registerHostCommand,
  _resetHostCommandRegistry,
} from '../../src/services/arexx/rexx-host-dispatch';

class FakeMoiraEmulator {
  mem: Uint8Array;
  constructor(size = 1 << 17) {
    this.mem = new Uint8Array(size);
  }
  readMemory(a: number) { return this.mem[a >>> 0] || 0; }
  writeMemory(a: number, v: number) { this.mem[a >>> 0] = v & 0xff; }
  readMemory16(a: number) { return ((this.mem[a] << 8) | this.mem[a + 1]) >>> 0; }
  writeMemory16(a: number, v: number) {
    this.mem[a] = (v >>> 8) & 0xff; this.mem[a + 1] = v & 0xff;
  }
  readMemory32(a: number) {
    return ((this.mem[a] << 24) | (this.mem[a+1] << 16) | (this.mem[a+2] << 8) | this.mem[a+3]) >>> 0;
  }
  writeMemory32(a: number, v: number) {
    this.mem[a] = (v >>> 24) & 0xff;
    this.mem[a+1] = (v >>> 16) & 0xff;
    this.mem[a+2] = (v >>> 8) & 0xff;
    this.mem[a+3] = v & 0xff;
  }
}

class FakeExecLibrary {
  liveBytes = 0;
  blocks = new Map<number, number>();
  next: number;
  constructor(public emu: FakeMoiraEmulator, base = 0x10000) {
    this.next = base;
  }
  allocMem(size: number, _flags: number): number {
    if (size <= 0) return 0;
    const aligned = (size + 3) & ~3;
    const a = this.next;
    this.next += aligned;
    this.blocks.set(a, aligned);
    this.liveBytes += aligned;
    for (let i = 0; i < aligned; i++) this.emu.writeMemory(a + i, 0);
    return a;
  }
  freeMem(a: number, _size: number) {
    const t = this.blocks.get(a);
    if (t === undefined) return;
    this.blocks.delete(a);
    this.liveBytes -= t;
  }
}

/**
 * Build an empty MsgPort at portAddr matching the layout
 * RexxMastService.setupHostPort produces.
 */
function initPort(emu: FakeMoiraEmulator, portAddr: number, nameAddr: number): void {
  // ln_Type = NT_MSGPORT
  emu.writeMemory(portAddr + 0x08, 4);
  emu.writeMemory32(portAddr + 0x0a, nameAddr);
  emu.writeMemory(portAddr + 0x0e, 0);   // mp_Flags
  emu.writeMemory(portAddr + 0x0f, 13);  // mp_SigBit
  emu.writeMemory32(portAddr + 0x10, 0); // mp_SigTask
  // Empty list — lh_Head -> lh_Tail (which sits at +0x18, conventionally 0)
  emu.writeMemory32(portAddr + 0x14, portAddr + 0x18);
  emu.writeMemory32(portAddr + 0x18, 0);
  emu.writeMemory32(portAddr + 0x1c, portAddr + 0x14);
}

/**
 * Append msgAddr to the end of the port's mp_MsgList. Mirrors what
 * exec.library PutMsg does. Used here to simulate RexxMast putting a
 * message on our host port.
 */
function putMsg(emu: FakeMoiraEmulator, portAddr: number, msgAddr: number): void {
  const head = emu.readMemory32(portAddr + 0x14) >>> 0;
  const tailPred = emu.readMemory32(portAddr + 0x1c) >>> 0;
  emu.writeMemory32(msgAddr + 0, 0);          // ln_Succ
  emu.writeMemory32(msgAddr + 4, tailPred);    // ln_Pred
  emu.writeMemory32(tailPred + 0, msgAddr);    // old tail-pred's succ
  emu.writeMemory32(portAddr + 0x1c, msgAddr); // list's tail-pred
  if (head === ((portAddr + 0x18) >>> 0)) {
    emu.writeMemory32(portAddr + 0x14, msgAddr);
  }
}

function setup() {
  const emu = new FakeMoiraEmulator();
  const exec = new FakeExecLibrary(emu);
  const rexxSysLib = new RexxSysLibLibrary(emu as any, exec as any);

  // Allocate a name string + port struct.
  const name = 'AMIEXPRESS';
  const nameAddr = exec.allocMem(name.length + 1, 0x10001);
  for (let i = 0; i < name.length; i++) emu.writeMemory(nameAddr + i, name.charCodeAt(i));
  emu.writeMemory(nameAddr + name.length, 0);

  // Reply port for the script's task to receive replies on.
  const replyPort = exec.allocMem(34, 0x10001);
  initPort(emu, replyPort, nameAddr);

  // Host port (the BBS).
  const hostPort = exec.allocMem(34, 0x10001);
  initPort(emu, hostPort, nameAddr);

  return { emu, exec, rexxSysLib, hostPort, replyPort };
}

/**
 * Build a RexxMsg with rm_Args[0] set to the supplied command line
 * (allocated as an argstring). Returns the msg address.
 */
function buildRexxMsg(rexxSysLib: any, replyPort: number, commandLine: string): number {
  const msg = rexxSysLib.createRexxMsg(replyPort, 0, 0);
  // rm_Args[0] = argstring carrying the command line.
  // createArgstring wants source bytes in MOIRA memory + length.
  // We stage the bytes in a temp buffer first.
  const buf = (rexxSysLib as any).execLibrary.allocMem(commandLine.length + 1, 0x10001);
  const emu = (rexxSysLib as any).emulator;
  for (let i = 0; i < commandLine.length; i++) {
    emu.writeMemory(buf + i, commandLine.charCodeAt(i));
  }
  emu.writeMemory(buf + commandLine.length, 0);
  const argstring = rexxSysLib.createArgstring(buf, commandLine.length);
  emu.writeMemory32(msg + 40, argstring); // rm_Args[0]
  return msg;
}

describe('serviceInboundMessages — Phase 4 host-port servicer', () => {
  beforeEach(() => {
    _resetHostCommandRegistry();
  });

  test('empty list is a clean no-op', async () => {
    const { emu, rexxSysLib, hostPort } = setup();
    const stats = await serviceInboundMessages(emu, rexxSysLib, hostPort, { output: [] });
    expect(stats.messagesProcessed).toBe(0);
    expect(stats.errors).toBe(0);
    expect(stats.unknownCommands).toBe(0);
  });

  test('zero hostPortAddr is a clean no-op', async () => {
    const { emu, rexxSysLib } = setup();
    const stats = await serviceInboundMessages(emu, rexxSysLib, 0, { output: [] });
    expect(stats.messagesProcessed).toBe(0);
  });

  test('dispatches a single message + writes result back + replies', async () => {
    const { emu, rexxSysLib, hostPort, replyPort } = setup();
    registerHostCommand('PING', async () => ({
      result1: 0, result2: 7, resultString: 'pong',
    }));

    const msg = buildRexxMsg(rexxSysLib, replyPort, 'PING');
    putMsg(emu, hostPort, msg);

    const stats = await serviceInboundMessages(emu, rexxSysLib, hostPort, { output: [] });
    expect(stats.messagesProcessed).toBe(1);
    expect(stats.errors).toBe(0);

    // rm_Result1 / rm_Result2 written.
    expect(emu.readMemory32(msg + 32)).toBe(0);
    expect(emu.readMemory32(msg + 36)).toBe(7);
    // rm_Args[1] points at an argstring containing 'pong'.
    const arg1 = emu.readMemory32(msg + 44);
    expect(arg1).not.toBe(0);
    expect(emu.readMemory(arg1)).toBe('p'.charCodeAt(0));
    expect(emu.readMemory(arg1 + 1)).toBe('o'.charCodeAt(0));
    expect(emu.readMemory(arg1 + 2)).toBe('n'.charCodeAt(0));
    expect(emu.readMemory(arg1 + 3)).toBe('g'.charCodeAt(0));
    expect(emu.readMemory(arg1 + 4)).toBe(0);

    // Message landed back on replyPort's list.
    const replyHead = emu.readMemory32(replyPort + 0x14);
    expect(replyHead).toBe(msg);
  });

  test('drains multiple queued messages in FIFO order', async () => {
    const { emu, rexxSysLib, hostPort, replyPort } = setup();
    const order: string[] = [];
    registerHostCommand('LOG', async (args) => {
      order.push(args.join(' '));
      return { result1: 0 };
    });

    const m1 = buildRexxMsg(rexxSysLib, replyPort, 'LOG first');
    const m2 = buildRexxMsg(rexxSysLib, replyPort, 'LOG second');
    const m3 = buildRexxMsg(rexxSysLib, replyPort, 'LOG third');
    putMsg(emu, hostPort, m1);
    putMsg(emu, hostPort, m2);
    putMsg(emu, hostPort, m3);

    const stats = await serviceInboundMessages(emu, rexxSysLib, hostPort, { output: [] });
    expect(stats.messagesProcessed).toBe(3);
    expect(order).toEqual(['first', 'second', 'third']);
  });

  test('unknown command produces result1=10 + still replies', async () => {
    const { emu, rexxSysLib, hostPort, replyPort } = setup();
    const msg = buildRexxMsg(rexxSysLib, replyPort, 'NOPE');
    putMsg(emu, hostPort, msg);

    const stats = await serviceInboundMessages(emu, rexxSysLib, hostPort, { output: [] });
    expect(stats.messagesProcessed).toBe(1);
    expect(stats.unknownCommands).toBe(1);
    expect(emu.readMemory32(msg + 32)).toBe(10); // RC=ERROR
    expect(emu.readMemory32(replyPort + 0x14)).toBe(msg);
  });

  test('non-RexxMsg garbage is replied unchanged + counted as error', async () => {
    const { emu, exec, rexxSysLib, hostPort, replyPort } = setup();
    // Synthesise a struct Message (no RexxMsg magic) on the host port.
    const garbage = exec.allocMem(34, 0x10001);
    emu.writeMemory32(garbage + 14, replyPort); // mn_ReplyPort
    putMsg(emu, hostPort, garbage);

    const stats = await serviceInboundMessages(emu, rexxSysLib, hostPort, { output: [] });
    expect(stats.errors).toBe(1);
    expect(stats.messagesProcessed).toBe(0);
    expect(emu.readMemory32(replyPort + 0x14)).toBe(garbage);
  });

  test('list invariant restored after draining all messages', async () => {
    const { emu, rexxSysLib, hostPort, replyPort } = setup();
    registerHostCommand('NOOP', async () => ({ result1: 0 }));
    putMsg(emu, hostPort, buildRexxMsg(rexxSysLib, replyPort, 'NOOP'));
    putMsg(emu, hostPort, buildRexxMsg(rexxSysLib, replyPort, 'NOOP'));

    await serviceInboundMessages(emu, rexxSysLib, hostPort, { output: [] });

    // Empty-list invariant: lh_Head → lh_Tail field, lh_TailPred → lh_Head field.
    expect(emu.readMemory32(hostPort + 0x14)).toBe(hostPort + 0x18);
    expect(emu.readMemory32(hostPort + 0x1c)).toBe(hostPort + 0x14);
  });
});
