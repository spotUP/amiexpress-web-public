/**
 * Regression: library-trap dispatch must preserve the caller's A6 register.
 *
 * Background:
 *   The published Amiga ABI guarantees that library functions are
 *   callee-saved with respect to A6 — the autodocs document only D0/D1
 *   (and sometimes A0/A1) as scratch. SAS/C exploits this in optimized
 *   code: it stashes a pointer in A6 (e.g. a `static const int *col_x[]`
 *   base) and calls a runtime helper via `jsr (a2)` WITHOUT touching A6.
 *   Real exec/utility/etc. preserve A6 so the next instruction can index
 *   via A6 again.
 *
 *   Our dispatcher used to overwrite A6 with the library base after every
 *   trap. That broke the second pattern: DOORSMENU's draw_menu loop did
 *
 *      jsr (a2)                   ; SDivMod32 — A6 is still col_x base here
 *      lsl.l #2, d0
 *      addq.l #4, a7
 *      move.l (a6, d0.l), (a7)    ; reads col_x[col]
 *
 *   With the old dispatcher, A6 came back as utility.library@0xF0000 and
 *   the col_x read returned 0 (the lib's first jump-table slot), so every
 *   menu item rendered at column 0 instead of column 30.
 *
 *   The fix in `LibraryTraps.handleTrap` (and the second dispatch path)
 *   restores A6 to its value at trap entry. For "well-formed" callers that
 *   set A6 = lib base before `jsr -X(a6)`, that value comes back unchanged.
 *   For SAS/C-optimized callers that use `jsr (an)` without touching A6,
 *   the application pointer survives.
 */

import { LibraryTraps } from '../../src/amiga-emulation/api/LibraryTraps';

// We reach into the dispatcher with a hand-rolled fake emulator so we can
// observe register state across `handleTrap` without spinning up MOIRA.

interface Registers {
  d: number[]; // D0..D7
  a: number[]; // A0..A6 (A7 = SP)
  sp: number;
  pc: number;
  sr: number;
}

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

describe('LibraryTraps.handleTrap — A6 preservation across library calls (regression)', () => {
  test('DOORSMENU shape: A6 holds application pointer through utility.library SMult32', () => {
    const { regs, mem, emu } = makeFake();
    const lt = new LibraryTraps(emu);

    // Stand up a minimal utility.library trap: just SMult32 (LVO -138).
    // Pretend the library base is 0xF0000 and the trap address is 0xeff76.
    // We don't go through ExecLibrary — we register the vector directly so
    // we can drive the dispatcher in isolation.
    const utilityBase = 0xf0000;
    const smultTrapAddr = utilityBase - 0x8a; // -138 → 0xeff76
    const fakeUtility = { __isUtility: true } as any;
    // Register as the real utilityLibrary so dispatcher's `library === this.utilityLibrary`
    // check matches — that's the path that USED to clobber A6 to lib base.
    lt.setUtilityLibrary(fakeUtility);
    lt.registerCustomTrap(
      smultTrapAddr,
      'SMult32',
      (e) => {
        // Pure D0/D1 math, no side effects on A6 — matches the real autodoc spec.
        const d0 = e.getRegister(0) | 0;
        const d1 = e.getRegister(1) | 0;
        return ((d0 * d1) | 0) >>> 0;
      },
      fakeUtility,
    );

    // Pretend this is the SAS/C `jsr (a2)` shape: caller pushed a return
    // address on the stack and never touched A6. A6 holds the app pointer.
    const APP_PTR = 0x3cca; // col_x_2 array address in DOORSMENU
    const RETURN_ADDR = 0x31a0;
    regs.sp = 0x10000;
    emu.writeMemory32(regs.sp, RETURN_ADDR); // simulate JSR pushed retaddr
    regs.a[6] = APP_PTR; // A6 = application pointer (NOT library base)
    regs.d[0] = 7;
    regs.d[1] = 10;

    const handled = lt.handleTrap(smultTrapAddr);

    expect(handled).toBe(true);
    // D0 holds the math result
    expect(emu.getRegister(0)).toBe(70);
    // PC moved to caller's return address
    expect(emu.getRegister(16)).toBe(RETURN_ADDR);
    // *** Key assertion: A6 is still the application pointer, NOT 0xF0000 ***
    expect(emu.getRegister(14)).toBe(APP_PTR);
  });

  test('Standard caller pattern: A6 = lib base on entry stays = lib base on exit', () => {
    const { regs, mem, emu } = makeFake();
    const lt = new LibraryTraps(emu);

    const utilityBase = 0xf0000;
    const smultTrapAddr = utilityBase - 0x8a;
    const fakeUtility = { __isUtility: true } as any;
    lt.registerCustomTrap(
      smultTrapAddr,
      'SMult32',
      (e) => ((e.getRegister(0) | 0) * (e.getRegister(1) | 0)) >>> 0,
      fakeUtility,
    );

    // Standard `move.l a6,-(sp); movea.l <base>,a6; jsr -X(a6); ...` caller —
    // by trap entry, A6 is already the library base (the application's old A6
    // is on the stack, to be popped by the caller after the JSR returns).
    regs.sp = 0x10000;
    emu.writeMemory32(regs.sp, 0x31a0);
    regs.a[6] = utilityBase;
    regs.d[0] = 3;
    regs.d[1] = 4;

    lt.handleTrap(smultTrapAddr);

    expect(emu.getRegister(0)).toBe(12);
    expect(emu.getRegister(14)).toBe(utilityBase); // unchanged (a6Before == lib base)
  });

  test('Dispatcher does not clobber any callee-saved data register (D2-D7)', () => {
    const { regs, mem, emu } = makeFake();
    const lt = new LibraryTraps(emu);

    const utilityBase = 0xf0000;
    const smultTrapAddr = utilityBase - 0x8a;
    const fakeUtility = { __isUtility: true } as any;
    lt.registerCustomTrap(
      smultTrapAddr,
      'SMult32',
      (e) => ((e.getRegister(0) | 0) * (e.getRegister(1) | 0)) >>> 0,
      fakeUtility,
    );

    regs.sp = 0x10000;
    emu.writeMemory32(regs.sp, 0x31a0);
    // Sentinels in D2-D7
    regs.d[2] = 0xa1a1a1a1;
    regs.d[3] = 0xb2b2b2b2;
    regs.d[4] = 0xc3c3c3c3;
    regs.d[5] = 0xd4d4d4d4;
    regs.d[6] = 0xe5e5e5e5;
    regs.d[7] = 0xf6f6f6f6;
    // Sentinels in A2-A5
    regs.a[2] = 0x12340002;
    regs.a[3] = 0x12340003;
    regs.a[4] = 0x12340004;
    regs.a[5] = 0x12340005;
    regs.a[6] = utilityBase;
    regs.d[0] = 5;
    regs.d[1] = 6;

    lt.handleTrap(smultTrapAddr);

    // Math in D0 only, all callee-saved regs untouched
    expect(emu.getRegister(0)).toBe(30);
    expect(emu.getRegister(2)).toBe(0xa1a1a1a1);
    expect(emu.getRegister(3)).toBe(0xb2b2b2b2);
    expect(emu.getRegister(4)).toBe(0xc3c3c3c3);
    expect(emu.getRegister(5)).toBe(0xd4d4d4d4);
    expect(emu.getRegister(6)).toBe(0xe5e5e5e5);
    expect(emu.getRegister(7)).toBe(0xf6f6f6f6);
    expect(emu.getRegister(10)).toBe(0x12340002);
    expect(emu.getRegister(11)).toBe(0x12340003);
    expect(emu.getRegister(12)).toBe(0x12340004);
    expect(emu.getRegister(13)).toBe(0x12340005);
  });
});
