/**
 * dos.library's own structures (locks, file handles, ReadArgs buffers,
 * environment variables) take their memory from exec AllocMem, the allocator
 * the program's own allocations come from.
 *
 * They used to be bump-allocated from fixed addresses - 0x120000 (env),
 * 0x122000 (env strings), 0x140000 (ReadArgs AND locks/file handles) - inside
 * AllocMem's own arena. Measured on mULTI-cHECK: its AllocMem got 0x122520,
 * in the environment strings, and the stack of the C:LhA it ran ended at
 * 0x142e40, over the ReadArgs strings mULTI-cHECK still needed afterwards.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DosLibrary, type ProcessExec } from '../../src/amiga-emulation/api/DosLibrary';
import { CPURegister } from '../../src/amiga-emulation/cpu/MoiraEmulator';

class StubEmulator {
  private regs = new Map<number, number>();
  private mem = new Map<number, number>();
  getRegister(reg: number): number { return this.regs.get(reg) ?? 0; }
  setRegister(reg: number, val: number): void { this.regs.set(reg, val >>> 0); }
  readMemory(addr: number): number { return this.mem.get(addr >>> 0) ?? 0; }
  writeMemory(addr: number, byte: number): void { this.mem.set(addr >>> 0, byte & 0xff); }
  readMemory32(addr: number): number {
    return ((this.readMemory(addr) << 24) | (this.readMemory(addr + 1) << 16) |
      (this.readMemory(addr + 2) << 8) | this.readMemory(addr + 3)) >>> 0;
  }
  writeMemory32(addr: number, val: number): void {
    for (let i = 0; i < 4; i++) this.writeMemory(addr + i, (val >>> (24 - 8 * i)) & 0xff);
  }
  writeString(addr: number, s: string): void {
    for (let i = 0; i < s.length; i++) this.writeMemory(addr + i, s.charCodeAt(i));
    this.writeMemory(addr + s.length, 0);
  }
}

/** exec's AllocMem arena as the emulator lays it out: a bump allocator over 0x100000+. */
class FakeExec implements ProcessExec {
  next = 0x100000;
  blocks: Array<{ addr: number; size: number }> = [];
  allocMem(size: number): number {
    const addr = this.next;
    this.next += (size + 3) & ~3;
    this.blocks.push({ addr, size });
    return addr;
  }
  freeMem(): void { /* not needed */ }
  getCurrentTaskAddress(): number { return 0; }
  setStackBounds(): void { /* not needed */ }
  getStackLower(): number { return 0; }
  getStackUpper(): number { return 0; }
}

describe("dos.library's memory comes from AllocMem", () => {
  it('a lock is not handed the same address as the program\'s own AllocMem', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dosmem-'));
    const stub = new StubEmulator();
    const dos = new DosLibrary(stub as any, root);
    const exec = new FakeExec();
    dos.setExecLibrary(exec);

    // The door allocates 320 KB first: its block covers 0x100000-0x150000,
    // which is where the fixed regions (0x120000 env, 0x140000 locks) sit.
    const doorBlock = exec.allocMem(0x50000);

    stub.writeString(0x10000, root);
    stub.setRegister(CPURegister.D1, 0x10000);
    stub.setRegister(CPURegister.D2, -2 >>> 0); // ACCESS_READ
    dos.handleCall(-84); // Lock
    const lock = (stub.getRegister(CPURegister.D0) << 2) >>> 0;

    expect(lock).not.toBe(0);
    const insideDoorBlock = lock >= doorBlock && lock < doorBlock + 0x50000;
    expect(insideDoorBlock).toBe(false);
    expect(exec.blocks.some((b) => lock >= b.addr && lock < b.addr + b.size && b.addr !== doorBlock)).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
