/**
 * Minimal emulator stub: byte-addressable memory map (pattern from
 * tests/amiga-emulation/datestamp-d0-return.test.ts).
 *
 * Extracted from fame-library.test.ts (Task 3) so both fame-library.test.ts
 * and fim-protocol.test.ts share a single MemStub implementation.
 */
export class MemStub {
  mem = new Map<number, number>();
  regs = new Map<number, number>();
  readMemory(a: number) { return this.mem.get(a) ?? 0; }
  writeMemory(a: number, v: number) { this.mem.set(a, v & 0xff); }
  readMemory32(a: number) {
    return (((this.readMemory(a) << 24) | (this.readMemory(a + 1) << 16) |
      (this.readMemory(a + 2) << 8) | this.readMemory(a + 3)) >>> 0);
  }
  writeMemory32(a: number, v: number) {
    this.writeMemory(a, v >>> 24); this.writeMemory(a + 1, v >>> 16);
    this.writeMemory(a + 2, v >>> 8); this.writeMemory(a + 3, v);
  }
  getRegister(r: number) { return this.regs.get(r) ?? 0; }
  setRegister(r: number, v: number) { this.regs.set(r, v >>> 0); }
}
