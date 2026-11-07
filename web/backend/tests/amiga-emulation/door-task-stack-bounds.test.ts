/**
 * The door's Task struct carries the real stack bounds.
 *
 * vbcc's startup.o (vbcc 0.9hp3, targets/m68k-amigaos/lib/startup.o) sizes
 * its stack straight from the task FindTask(NULL) returns:
 *
 *     move.l  62(a3),d0      ; tc_SPUpper
 *     movea.l 58(a3),a0      ; tc_SPLower
 *     sub.l   a0,d0
 *     move.l  ___stack,d4
 *     cmp.l   d4,d0
 *     bcc.s   .enough
 *     ...AllocVec(___stack+20), StackSwap   ; door now runs on a heap stack
 *
 * ExecLibrary wrote tc_SPLower = tc_SPUpper = 0, so every vbcc door
 * (LIVECHAT68 and the sdk/c doors) swapped onto a 4 KB AllocVec in the
 * AllocMem heap (0x123560-0x124560 on the mirror), next to the door's heap
 * buffers, instead of running on DoorLoader's 256 KB stack. LIVECHAT68 then
 * jumped into zeroed heap after its first chat poll reply.
 *
 * Drives the real ExecLibrary task allocation and DoorLoader CPU/stack setup,
 * then applies vbcc's own check to what FindTask(NULL) points at.
 */
import { ExecLibrary } from '../../src/amiga-emulation/api/ExecLibrary';
import { DoorLoader } from '../../src/amiga-emulation/DoorLoader';
import { DOOR_STACK_BASE, DOOR_STACK_TOP } from '../../src/amiga-emulation/memory-map';

function memoryEmulator() {
  const mem = new Map<number, number>();
  const regs = new Map<number, number>();
  const r8 = (a: number) => mem.get(a >>> 0) ?? 0;
  const w8 = (a: number, v: number) => { mem.set(a >>> 0, v & 0xff); };
  const r16 = (a: number) => (r8(a) << 8) | r8(a + 1);
  const w16 = (a: number, v: number) => { w8(a, v >>> 8); w8(a + 1, v); };
  const r32 = (a: number) => ((r16(a) << 16) | r16(a + 2)) >>> 0;
  const w32 = (a: number, v: number) => { w16(a, v >>> 16); w16(a + 2, v); };
  const known: Record<string, unknown> = {
    readMemory: r8, readMemory8: r8, writeMemory: w8, writeMemory8: w8,
    readMemory16: r16, writeMemory16: w16, readMemory32: r32, writeMemory32: w32,
    writeString: (a: number, s: string) => { for (let i = 0; i < s.length; i++) w8(a + i, s.charCodeAt(i)); w8(a + s.length, 0); },
    readString: (a: number) => { let s = ''; for (let i = 0; i < 256; i++) { const c = r8(a + i); if (!c) break; s += String.fromCharCode(c); } return s; },
    getMemory: () => new Uint8Array(0),
    getRegister: (r: number) => regs.get(r) ?? 0,
    setRegister: (r: number, v: number) => { regs.set(r, v >>> 0); },
  };
  return new Proxy(known, { get: (t, prop: string) => (prop in t ? t[prop] : () => undefined) }) as any;
}

const TC_SPREG = 0x36;
const TC_SPLOWER = 0x3a;
const TC_SPUPPER = 0x3e;
const PR_STACKSIZE = 0x84;
const PR_STACKBASE = 0x90;
/** vbcc's default ___stack: a door that sets no __stack asks for 4 KB. */
const VBCC_DEFAULT_STACK = 0x1000;
const A7 = 15;

function loadDoor(stack?: number) {
  const emu = memoryEmulator();
  const exec = new ExecLibrary(emu);
  exec.allocateDoorTask();
  const loader = new DoorLoader(emu, exec, {
    executablePath: '/doors/LIVECHAT68/LIVECHAT68',
    doorType: 'XIM',
    args: [],
    stack,
  } as any);
  const hunks = {
    segments: [
      { type: 'CODE', address: 0x2000, size: 0x10000, bptr: 0x800 },
      { type: 'DATA', address: 0x12000, size: 0x1000, bptr: 0x4800 },
    ],
    entryPoint: 0x2000,
  };
  (loader as unknown as { setupCpuRegisters(h: unknown): void }).setupCpuRegisters(hunks);
  const task = exec.findTask(0);
  return { emu, exec, task, stackBounds: DoorLoader.computeStackBounds(hunks.segments, stack) };
}

describe("the door's task struct holds its real stack", () => {
  it('tc_SPLower/tc_SPUpper are the DoorLoader stack, so vbcc startup keeps it (no StackSwap)', () => {
    const { emu, exec, task, stackBounds } = loadDoor(20000);
    expect(task).not.toBe(0);
    const lower = emu.readMemory32(task + TC_SPLOWER);
    const upper = emu.readMemory32(task + TC_SPUPPER);
    const sp = emu.getRegister(A7);

    expect(lower).toBe(stackBounds.stackBaseAddr);
    expect(upper).toBe(stackBounds.stackBaseAddr + stackBounds.stackSizeBytes);
    expect(lower).toBeGreaterThanOrEqual(DOOR_STACK_BASE);
    expect(upper).toBeLessThanOrEqual(DOOR_STACK_TOP);
    // Same bounds exec reports for StackSwap symmetry.
    expect(lower).toBe(exec.getStackLower());
    expect(upper).toBe(exec.getStackUpper());

    // The initial SP is inside the bounds, and tc_SPReg agrees with it.
    expect(sp).toBeGreaterThan(lower);
    expect(sp).toBeLessThan(upper);
    expect(emu.readMemory32(task + TC_SPREG)).toBe(sp);

    // vbcc startup.o: tc_SPUpper - tc_SPLower >= ___stack means no swap.
    expect(((upper - lower) >>> 0) >= VBCC_DEFAULT_STACK).toBe(true);
  });

  it('pr_StackSize is the stack size and pr_StackBase a BPTR to its top', () => {
    const { emu, task, stackBounds } = loadDoor();
    const top = stackBounds.stackBaseAddr + stackBounds.stackSizeBytes;
    expect(emu.readMemory32(task + PR_STACKSIZE)).toBe(stackBounds.stackSizeBytes);
    expect(emu.readMemory32(task + PR_STACKBASE)).toBe(top >>> 2);
  });
});
