/**
 * memory-map.ts MEMORY_REGIONS is the one memory map. Fixed structures used
 * to sit inside the AllocMem heap (0x100000-0x1fe000) - exception handlers
 * at 0x180000, environment variables at 0x120000/0x130000, dos objects at
 * 0x160000, utility.library tag lists at random 0x1f0000-0x1f9000 addresses,
 * stub libraries from 0x100000, LibraryLoader stepping down from 0x200000 -
 * so a door's own AllocMem block was overwritten by them, or they by it.
 * DoorLoader also wrote a CLI copy at 0x28000, inside the door's own hunks,
 * and put the stack just above the hunks, over ExecBase and the CLI block.
 *
 * Each test fills a door-owned block with a pattern, makes the emulator place
 * its structure, and checks the pattern survived (or the address lies in the
 * structure's own region).
 */
import { ExecLibrary } from '../../src/amiga-emulation/api/ExecLibrary';
import { DosLibrary } from '../../src/amiga-emulation/api/DosLibrary';
import { UtilityLibrary } from '../../src/amiga-emulation/api/UtilityLibrary';
import { UTILITY_VECTORS } from '../../src/amiga-emulation/api/library-vectors/utility-vectors';
import { LibraryLoader } from '../../src/amiga-emulation/loader/LibraryLoader';
import { DoorLoader } from '../../src/amiga-emulation/DoorLoader';
import { CPURegister } from '../../src/amiga-emulation/cpu/MoiraEmulator';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  ALLOCMEM_HEAP_BASE,
  ALLOCMEM_HEAP_END,
  DOOR_CLI_ADDR,
  DOOR_STACK_BASE,
  DOOR_STACK_TOP,
  EXCEPTION_HANDLERS_BASE,
  EXCEPTION_HANDLERS_END,
  EXEC_BASE_ADDR,
  MEMORY_REGIONS,
  NATIVE_LIBRARY_BASE,
  NATIVE_LIBRARY_END,
  STUB_LIBRARY_SLOTS_BASE,
  STUB_LIBRARY_SLOTS_END,
  assertMemoryMapDisjoint,
} from '../../src/amiga-emulation/memory-map';

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

/** A door-owned block filled with 0xA5; `intact()` says whether it still is. */
function doorBlock(emu: any, addr: number, size: number) {
  for (let i = 0; i < size; i++) emu.writeMemory(addr + i, 0xa5);
  return {
    intact: () => {
      for (let i = 0; i < size; i++) if (emu.readMemory(addr + i) !== 0xa5) return false;
      return true;
    },
  };
}

const inside = (addr: number, start: number, end: number) => addr >= start && addr < end;

describe('no fixed structure overlaps the AllocMem heap', () => {
  it('the memory map has no two overlapping regions', () => {
    expect(() => assertMemoryMapDisjoint()).not.toThrow();
    expect(() =>
      assertMemoryMapDisjoint([
        { start: 0x100000, end: 0x1fe000, name: 'heap' },
        { start: 0x180000, end: 0x180800, name: 'handlers' },
      ]),
    ).toThrow(/handlers|heap/);
    const heap = MEMORY_REGIONS.filter((r) => r.start < ALLOCMEM_HEAP_END && r.end > ALLOCMEM_HEAP_BASE);
    expect(heap.map((r) => r.name)).toEqual(['the AllocMem heap']);
  });

  it('an AllocMem block never overlaps the exception handlers', () => {
    const emu = memoryEmulator();
    const exec = new ExecLibrary(emu);
    exec.initialize();
    const illegalHandler = emu.readMemory32(4 * 4);
    expect(inside(illegalHandler, EXCEPTION_HANDLERS_BASE, EXCEPTION_HANDLERS_END)).toBe(true);
    expect(inside(illegalHandler, ALLOCMEM_HEAP_BASE, ALLOCMEM_HEAP_END)).toBe(false);
  });

  it('a stub library never sits in the AllocMem heap', () => {
    const exec = new ExecLibrary(memoryEmulator());
    exec.registerLibraryPlaceholder('gadtools.library');
    const base = exec.getLibraryBase('gadtools.library');
    expect(inside(base, STUB_LIBRARY_SLOTS_BASE, STUB_LIBRARY_SLOTS_END)).toBe(true);
  });

  it("SetVar and AllocDosObject never write into a door's AllocMem block", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'memmap-'));
    try {
      const emu = memoryEmulator();
      const exec = new ExecLibrary(emu);
      const dos = new DosLibrary(emu, root);
      dos.setExecLibrary(exec as any);
      // The door's first block covers 0x100000-0x170000: the old env (0x120000,
      // 0x130000) and dos object (0x160000) addresses.
      const blockAddr = exec.allocMem(0x70000, 1);
      expect(blockAddr).toBe(ALLOCMEM_HEAP_BASE);
      const block = doorBlock(emu, blockAddr, 0x70000);

      dos.initializeEnvironmentVariables(1, 1, 'sysop', 255);
      emu.setRegister(CPURegister.D1, 2); // DOS_FIB
      emu.setRegister(CPURegister.D2, 0);
      dos.AllocDosObject();
      const fib = emu.getRegister(CPURegister.D0);

      expect(fib).not.toBe(0);
      expect(inside(fib, blockAddr, blockAddr + 0x70000)).toBe(false);
      expect(block.intact()).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("AllocateTagItems and CloneTagItems never write into a door's AllocMem block", () => {
    const emu = memoryEmulator();
    const exec = new ExecLibrary(emu);
    // The door takes the whole heap but its last 16 KB, which covers the
    // 0x1f0000-0x1f9000 the tag lists were randomly written to.
    const size = ALLOCMEM_HEAP_END - ALLOCMEM_HEAP_BASE - 0x4000;
    const blockAddr = exec.allocMem(size, 1);
    const block = doorBlock(emu, blockAddr, size);
    const utility = new UtilityLibrary(emu, null, exec);
    const vector = (name: string) => UTILITY_VECTORS.find((v) => v.name === name)!;

    emu.setRegister(0, 8);
    const tags = vector('AllocateTagItems').handler(emu, utility);
    emu.setRegister(8, tags);
    const clone = vector('CloneTagItems').handler(emu, utility);

    expect(tags).not.toBe(0);
    expect(clone).not.toBe(0);
    expect(block.intact()).toBe(true);
  });

  it('a loaded 68K library never lies in the AllocMem heap', () => {
    const loader = new LibraryLoader(memoryEmulator(), [], null) as unknown as {
      allocateLibraryBase(span: number): number;
    };
    const first = loader.allocateLibraryBase(0x9000);
    const second = loader.allocateLibraryBase(0x9000);
    for (const base of [first, second]) {
      expect(inside(base, NATIVE_LIBRARY_BASE, NATIVE_LIBRARY_END)).toBe(true);
    }
    expect(second).toBeGreaterThanOrEqual(first + 0x9000);
  });

  it("a door's stack never overlaps ExecBase or the CLI block", () => {
    // A 384 KB door: its hunks end at 0x62000.
    const { stackBaseAddr, stackSizeBytes } = DoorLoader.computeStackBounds(
      [{ type: 'CODE', address: 0x2000, size: 0x60000 }],
      0,
    );
    const top = stackBaseAddr + stackSizeBytes;
    expect(stackBaseAddr).toBeGreaterThanOrEqual(DOOR_STACK_BASE);
    expect(top).toBeLessThanOrEqual(DOOR_STACK_TOP);
    expect(inside(EXEC_BASE_ADDR, stackBaseAddr, top)).toBe(false);
    expect(inside(DOOR_CLI_ADDR, stackBaseAddr, top)).toBe(false);
  });

  it("building the CLI never writes into the door's own hunks", () => {
    const emu = memoryEmulator();
    const exec = new ExecLibrary(emu);
    exec.allocateDoorTask();
    const loader = new DoorLoader(emu, exec, {
      executablePath: '/doors/big/big',
      doorType: 'XIM',
      args: [],
    } as any);
    // A 256 KB CODE hunk; 0x28000 (the old CLI copy) is inside it.
    const hunks = { segments: [{ type: 'CODE', address: 0x2000, size: 0x40000, bptr: 0x800 }], entryPoint: 0x2000 };
    const code = doorBlock(emu, 0x27f00, 0x300);
    (loader as unknown as { setupCpuRegisters(h: unknown): void }).setupCpuRegisters(hunks);
    expect(emu.readMemory32(exec.getCurrentTaskAddress() + 0xac)).toBe(DOOR_CLI_ADDR >> 2);
    expect(code.intact()).toBe(true);
  });
});
