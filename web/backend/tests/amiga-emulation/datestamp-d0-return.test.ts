/**
 * Regression: dos.library _LVODateStamp must propagate the return value to D0.
 *
 * AmigaOS contract: DateStamp() takes D1 = pointer to DateStamp struct and
 * returns D0 = the same pointer. Amiga E code such as Conftop's
 * `startds := DateStamp(currDate)` reads the result from D0 and dereferences
 * `.days`. If our LVO dispatcher discards the return value, D0 keeps whatever
 * stale value it had (e.g. 0x04006920) and callers compute garbage dates.
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
  readLong(address: number): number {
    return (
      ((this.getMemoryByte(address) << 24) |
        (this.getMemoryByte(address + 1) << 16) |
        (this.getMemoryByte(address + 2) << 8) |
        this.getMemoryByte(address + 3)) >>>
      0
    );
  }
}

describe("DosLibrary _LVODateStamp dispatcher", () => {
  test("propagates return pointer into D0 (regression for Conftop garbage date)", () => {
    const stub = new StubEmulator();
    const dos = new DosLibrary(stub as any, "/tmp");

    const dateStampPtr = 0x10000;
    const stalePriorD0 = 0x04006920; // value Conftop saw written into Conftop.Data

    stub.setRegister(CPURegister.D0, stalePriorD0);
    stub.setRegister(CPURegister.D1, dateStampPtr);

    const handled = dos.handleCall(-192); // _LVODateStamp

    expect(handled).toBe(true);
    expect(stub.getRegister(CPURegister.D0)).toBe(dateStampPtr);
    expect(stub.getRegister(CPURegister.D0)).not.toBe(stalePriorD0);
  });

  test("writes ds_Days/ds_Minute/ds_Tick to the buffer at D1", () => {
    const stub = new StubEmulator();
    const dos = new DosLibrary(stub as any, "/tmp");

    const dateStampPtr = 0x20000;
    stub.setRegister(CPURegister.D1, dateStampPtr);

    dos.handleCall(-192);

    const days = stub.readLong(dateStampPtr);
    const minutes = stub.readLong(dateStampPtr + 4);
    const ticks = stub.readLong(dateStampPtr + 8);

    // Days since 1978-01-01 must be in a sane range (well over 17000 by 2024,
    // never in the 67-million range that triggered the original bug).
    expect(days).toBeGreaterThan(17000);
    expect(days).toBeLessThan(40000);
    expect(minutes).toBeGreaterThanOrEqual(0);
    expect(minutes).toBeLessThan(1440);
    expect(ticks).toBeGreaterThanOrEqual(0);
    expect(ticks).toBeLessThan(3000);
  });
});
