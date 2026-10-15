/**
 * Regression: Conftop's resetDate flow. The bytes the door writes into
 * each conference's Conftop.Data must decode as a sane AmigaDOS ds_Days
 * value, never the pre-fix 0x04006920 poison pattern.
 *
 * Pre-fix repro:
 *   1. Caller stashed scratch value (e.g. 0x04006920) in D0
 *   2. JSR _LVODateStamp via handleCall(-192)
 *   3. Helper filled the DateStamp struct at D1 but DISCARDED its return
 *   4. Door read D0 expecting "pointer to DateStamp", got 0x04006920 instead
 *   5. Door dereferenced 0x04006920 + 0 to read ds_Days  → garbage
 *   6. Door wrote those 4 bytes into Conftop.Data as resetDate
 *   7. Next reset run reads bytes back, computes (resetDate - today), gets
 *      a value far outside [0..days), bails with
 *      "CONFTOP (ERROR): Reset date is out of range."
 *
 * This test reproduces steps 1-5 against the real DosLibrary dispatcher and
 * asserts the bytes the door would have written are in a sane range. If a
 * future refactor reintroduces the dispatcher discarding D0, this test fails
 * loudly and CTOP/dupestart1 won't silently re-poison Conftop.Data on prod.
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

const POISON_D0 = 0x04006920; // exact byte pattern observed in real Conftop.Data

describe("Conftop resetDate written to disk is a sane ds_Days", () => {
  test("door's DateStamp -> deref -> Write(4) flow yields a non-poison ds_Days", () => {
    const stub = new StubEmulator();
    const dos = new DosLibrary(stub as any, "/tmp");

    // Step 1: caller poisons D0 (could be anything; we use the exact value
    // that appeared in the real corrupted file so this test doubles as a
    // historical artifact).
    stub.setRegister(CPURegister.D0, POISON_D0);

    // Step 2: door sets D1 = pointer to its on-stack DateStamp struct and
    // calls JSR _LVODateStamp -> dispatcher routes to handleCall(-192).
    const dateStampPtr = 0x100000;
    stub.setRegister(CPURegister.D1, dateStampPtr);

    const handled = dos.handleCall(-192);
    expect(handled).toBe(true);

    // Step 3-4: door reads D0 expecting "pointer to DateStamp".
    const returnedPointer = stub.getRegister(CPURegister.D0);
    expect(returnedPointer).toBe(dateStampPtr);
    expect(returnedPointer).not.toBe(POISON_D0);

    // Step 5: door dereferences `*returnedPointer` to read ds_Days, then
    // would `Write(fh, &resetDate, 4)`. We simulate that read here and
    // assert the value is sane.
    const dsDays = stub.readLong(returnedPointer);

    // 17000 ≈ 2024-07; 40000 ≈ 2087. Today (cutoff 2026-01) sits well in
    // that window. The pre-fix value 0x04006920 = 67_133_728 is wildly
    // outside it.
    expect(dsDays).toBeGreaterThan(17000);
    expect(dsDays).toBeLessThan(40000);
    expect(dsDays).not.toBe(POISON_D0);

    // Bonus: confirm the BE byte serialization the door would write to disk
    // matches what readLong returned. This guards against a regression where
    // ds_Days is correct in memory but gets byte-swapped by writeLong.
    const b0 = stub.getMemoryByte(returnedPointer);
    const b1 = stub.getMemoryByte(returnedPointer + 1);
    const b2 = stub.getMemoryByte(returnedPointer + 2);
    const b3 = stub.getMemoryByte(returnedPointer + 3);
    expect((b0 << 24) | (b1 << 16) | (b2 << 8) | b3).toBe(dsDays);

    // The poison file's first 4 bytes were 04 00 69 20. Assert at least one
    // of our high bytes is zero (a sane ds_Days fits in 16 bits for any date
    // before year ~2157), which immediately rules out the 0x04xxxxxx pattern.
    expect(b0).toBe(0);
    expect(b1).toBe(0);
  });

  test("repeated calls do not leak prior D0 into the buffer", () => {
    // Defensive: invoke twice to make sure dispatcher doesn't accidentally
    // OR-in stale state on subsequent calls.
    const stub = new StubEmulator();
    const dos = new DosLibrary(stub as any, "/tmp");

    const ptr1 = 0x200000;
    const ptr2 = 0x300000;

    stub.setRegister(CPURegister.D0, POISON_D0);
    stub.setRegister(CPURegister.D1, ptr1);
    dos.handleCall(-192);
    const days1 = stub.readLong(stub.getRegister(CPURegister.D0));

    stub.setRegister(CPURegister.D0, 0xfeedface);
    stub.setRegister(CPURegister.D1, ptr2);
    dos.handleCall(-192);
    const days2 = stub.readLong(stub.getRegister(CPURegister.D0));

    expect(days1).toBe(days2); // same wall clock, same midnight
    expect(days1).toBeGreaterThan(17000);
    expect(days1).toBeLessThan(40000);
  });
});
