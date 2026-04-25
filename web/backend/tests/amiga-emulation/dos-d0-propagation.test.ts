/**
 * Regression: dos.library handleCall must propagate D0 for the LVOs whose
 * helpers do not set D0 themselves. Sister of datestamp-d0-return.test.ts.
 *
 * The four LVOs covered here all have an `IF d0 = ...` style of usage in
 * Amiga code:
 *   IoErr  - every door checks d0 after Open/Lock/Read/Write
 *   Input  - returns stdin BPTR, used as fh handle later
 *   Output - returns stdout BPTR, used as fh handle later
 *   Seek   - returns previous position; -1 means error
 *
 * Without dispatcher propagation D0 keeps whatever the caller had stashed
 * there before the JSR, which is whatever scratch register state the trap
 * happened to leave behind.
 */
import { DosLibrary } from "../../src/amiga-emulation/api/DosLibrary";
import { CPURegister } from "../../src/amiga-emulation/cpu/MoiraEmulator";

class StubEmulator {
  private regs = new Map<number, number>();
  private mem = new Map<number, number>();

  getRegister(reg: number): number {
    return this.regs.get(reg) ?? 0;
  }
  setRegister(reg: number, value: number): void {
    this.regs.set(reg, value >>> 0);
  }
  writeMemory(address: number, byte: number): void {
    this.mem.set(address >>> 0, byte & 0xff);
  }
  getMemoryByte(address: number): number {
    return this.mem.get(address >>> 0) ?? 0;
  }
}

const STALE_D0 = 0xdeadbeef;

function makeDos(): { dos: DosLibrary; stub: StubEmulator } {
  const stub = new StubEmulator();
  const dos = new DosLibrary(stub as any, "/tmp");
  stub.setRegister(CPURegister.D0, STALE_D0);
  return { dos, stub };
}

describe("DosLibrary handleCall D0 propagation", () => {
  test("_LVOIoErr (-132) returns the last error code in D0", () => {
    const { dos, stub } = makeDos();

    // SetIoErr to a known sentinel value (205 = ERROR_OBJECT_NOT_FOUND)
    stub.setRegister(CPURegister.D1, 205);
    dos.handleCall(-462); // SetIoErr (already correct, sets D0)
    stub.setRegister(CPURegister.D0, STALE_D0); // wipe D0 so we can prove the next call sets it

    const handled = dos.handleCall(-132); // IoErr
    expect(handled).toBe(true);
    expect(stub.getRegister(CPURegister.D0)).toBe(205);
  });

  test("_LVOInput (-54) returns stdin BPTR in D0", () => {
    const { dos, stub } = makeDos();

    const handled = dos.handleCall(-54);
    expect(handled).toBe(true);
    // Default stdin BPTR is set up by DosLibrary; just assert we left the
    // stale value behind (any non-zero value derived from the helper is
    // acceptable; the bug was D0 staying = STALE_D0).
    expect(stub.getRegister(CPURegister.D0)).not.toBe(STALE_D0);
  });

  test("_LVOOutput (-60) returns stdout BPTR in D0", () => {
    const { dos, stub } = makeDos();

    const handled = dos.handleCall(-60);
    expect(handled).toBe(true);
    expect(stub.getRegister(CPURegister.D0)).not.toBe(STALE_D0);
  });

  test("_LVOSeek (-66) returns previous position in D0 (console handle)", () => {
    const { dos, stub } = makeDos();

    // Use STDIN (BPTR 1) which DosLibrary registers as a console handle that
    // supports Seek(). OFFSET_CURRENT (0) with offset 0 = no-op, returns
    // current position (= 0 for a fresh handle).
    stub.setRegister(CPURegister.D1, 1); // handle = STDIN_BPTR
    stub.setRegister(CPURegister.D2, 0); // offset = 0
    stub.setRegister(CPURegister.D3, 0); // mode = OFFSET_CURRENT

    const handled = dos.handleCall(-66);
    expect(handled).toBe(true);
    // Old position is 0 — we just need to confirm dispatcher propagated the
    // helper return rather than leaving STALE_D0 behind.
    expect(stub.getRegister(CPURegister.D0)).toBe(0);
  });
});
