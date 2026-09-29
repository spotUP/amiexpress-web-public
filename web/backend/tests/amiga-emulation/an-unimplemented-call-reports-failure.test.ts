/**
 * An unimplemented library call answers "failed" (0), not whatever was in D0.
 *
 * Every LVO without a real handler gets an auto-stub. It returned D0
 * UNCHANGED, so a call that returns a pointer or a choice handed the door
 * whatever the register happened to hold: OpenWindowTagList "opened" a window
 * at a garbage address and the door went on to draw through it, and
 * EasyRequestArgs picked an arbitrary button (68K stub audit, 2026-09-28).
 * AmigaOS reports failure as 0/NULL/FALSE for those calls, and a void call
 * ignores D0, so 0 is the one safe answer for "not implemented".
 */
import { LibraryTraps } from '../../src/amiga-emulation/api/LibraryTraps';
import { ExecLibrary } from '../../src/amiga-emulation/api/ExecLibrary';
import * as fs from 'fs';
import { amigaGaps } from '../../src/amiga-emulation/instrumentation/amiga-gaps';

interface Registers { d: number[]; a: number[]; sp: number; pc: number; sr: number }

function makeFake(): {
  regs: Registers;
  mem: Map<number, number>;
  emu: any;
} {
  const regs: Registers = {
    d: new Array(8).fill(0),
    a: new Array(7).fill(0),
    sp: 0,
    pc: 0,
    sr: 0,
  };
  const mem = new Map<number, number>();

  function read32(addr: number): number {
    const b0 = mem.get(addr) ?? 0;
    const b1 = mem.get(addr + 1) ?? 0;
    const b2 = mem.get(addr + 2) ?? 0;
    const b3 = mem.get(addr + 3) ?? 0;
    return ((b0 << 24) | (b1 << 16) | (b2 << 8) | b3) >>> 0;
  }
  function write32(addr: number, value: number) {
    mem.set(addr, (value >>> 24) & 0xff);
    mem.set(addr + 1, (value >>> 16) & 0xff);
    mem.set(addr + 2, (value >>> 8) & 0xff);
    mem.set(addr + 3, value & 0xff);
  }
  function read16(addr: number) {
    return (((mem.get(addr) ?? 0) << 8) | (mem.get(addr + 1) ?? 0)) & 0xffff;
  }

  // Map register indices used by MoiraEmulator: 0..7 = D, 8..14 = A0..A6, 15 = SP, 16 = PC, 17 = SR.
  const emu = {
    getRegister(idx: number): number {
      if (idx <= 7) return regs.d[idx] >>> 0;
      if (idx <= 14) return regs.a[idx - 8] >>> 0;
      if (idx === 15) return regs.sp >>> 0;
      if (idx === 16) return regs.pc >>> 0;
      if (idx === 17) return regs.sr >>> 0;
      return 0;
    },
    setRegister(idx: number, value: number) {
      const v = value >>> 0;
      if (idx <= 7) regs.d[idx] = v;
      else if (idx <= 14) regs.a[idx - 8] = v;
      else if (idx === 15) regs.sp = v;
      else if (idx === 16) regs.pc = v;
      else if (idx === 17) regs.sr = v;
    },
    readMemory(addr: number) {
      return mem.get(addr) ?? 0;
    },
    writeMemory(addr: number, value: number) {
      mem.set(addr, value & 0xff);
    },
    readMemory32: read32,
    writeMemory32: write32,
    readMemory16: read16,
    writeMemory16(addr: number, value: number) {
      mem.set(addr, (value >>> 8) & 0xff);
      mem.set(addr + 1, value & 0xff);
    },
    refillPrefetch() {},
    addTrapAddress() {},
    clearTrapAddresses() {},
  };

  return { regs, mem, emu };
}


it('a stubbed call returns 0 whatever the caller left in D0', () => {
  const { regs, emu } = makeFake();
  const lt = new LibraryTraps(emu, new ExecLibrary(emu));
  const intuitionBase = 0x200000;
  lt.installStubVectorsForLibrary('intuition.library', intuitionBase);

  const openWindowTagList = (lt as any).trapMap.get(intuitionBase - 606);
  expect(openWindowTagList?.isStub).toBe(true);

  regs.d[0] = 0x00c0ffee; // what the door had in D0 before the call
  expect(openWindowTagList.handler(emu)).toBe(0);
});

it("is written to the board's gap log, under the door that asked", () => {
  // The sysop, 2026-09-28: "we need to log all unimplemented amiga stuff so we
  // can implement it." Driven through handleTrap - the path a real door takes
  // - with the emulator named as its session names it.
  amigaGaps.reset();
  try { fs.rmSync(amigaGaps.file()); } catch { /* none yet */ }
  const { regs, emu } = makeFake();
  (emu as any).doorName = '5D_Page';
  const lt = new LibraryTraps(emu, new ExecLibrary(emu));
  const intuitionBase = 0x200000;
  lt.installStubVectorsForLibrary('intuition.library', intuitionBase);
  regs.sp = 0x10000;
  emu.writeMemory32(regs.sp, 0x31a0); // the caller's return address

  lt.handleTrap(intuitionBase - 606);
  amigaGaps.flush();

  const logged = JSON.parse(fs.readFileSync(amigaGaps.file(), 'utf8'));
  const gap = logged.find((g: any) => g.kind === 'library' && /OpenWindowTagList/.test(g.what));
  expect(gap).toMatchObject({ count: 1, doors: { '5D_Page': 1 } });
});

it('finds its LVO table inside web/backend, the tree the image ships', () => {
  // The table lived under Documentation/, which .dockerignore keeps out of the
  // image: on live every door start logged "LVOs.i not found; stub vectors
  // disabled", so the two tests above never held there (2026-09-29).
  const said: string[] = [];
  const spy = jest.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { said.push(a.join(' ')); });
  const warn = jest.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => { said.push(a.join(' ')); });
  try {
    const { emu } = makeFake();
    new LibraryTraps(emu, new ExecLibrary(emu)).installStubVectorsForLibrary('intuition.library', 0x200000);
  } finally {
    spy.mockRestore();
    warn.mockRestore();
  }
  const loaded = said.find((l) => l.includes('Loaded LVOs from'));
  expect(said.some((l) => l.includes('LVOs.i not found'))).toBe(false);
  expect(loaded).toMatch(/[\\/]web[\\/]backend[\\/]src[\\/]/);
});
