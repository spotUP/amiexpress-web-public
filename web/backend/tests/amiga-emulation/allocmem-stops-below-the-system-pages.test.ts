/**
 * AllocMem's heap ran from ALLOCMEM_HEAP_BASE up to a "16 MB" limit, so a
 * large or long run of allocations was handed the utility scratch page, the
 * door exit trap at 0x1ff000, the child return trap, the XIM buffers and,
 * at 0x200000, the loaded 68K libraries - memory that is not free. exec's
 * contract: a request that does not fit returns NULL (0).
 */
import { ExecLibrary } from '../../src/amiga-emulation/api/ExecLibrary';
import {
  ALLOCMEM_HEAP_BASE,
  ALLOCMEM_HEAP_END,
  DOOR_EXIT_TRAP_ADDR,
  NATIVE_LIBRARY_BASE,
} from '../../src/amiga-emulation/memory-map';

function memoryEmulator() {
  const mem = new Map<number, number>();
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
    readString: () => '',
    getMemory: () => new Uint8Array(0),
    getRegister: () => 0,
  };
  return new Proxy(known, { get: (t, prop: string) => (prop in t ? t[prop] : () => undefined) });
}

describe('AllocMem stops below the system pages', () => {
  it('returns 0 for a request that would reach the exit trap or the libraries, instead of handing them out', () => {
    const exec = new ExecLibrary(memoryEmulator() as never);
    const ends: number[] = [];
    // 64 KB blocks until exec says no (MEMF_PUBLIC, no clear).
    for (let i = 0; i < 64; i++) {
      const addr = exec.allocMem(0x10000, 1);
      if (addr === 0) break;
      ends.push(addr + 0x10000);
    }
    expect(ends.length).toBeGreaterThan(0);
    expect(ends.length).toBeLessThan(64);
    for (const end of ends) {
      expect(end).toBeLessThanOrEqual(ALLOCMEM_HEAP_END);
    }
    expect(ALLOCMEM_HEAP_END).toBeLessThanOrEqual(DOOR_EXIT_TRAP_ADDR);
    expect(ALLOCMEM_HEAP_END).toBeLessThan(NATIVE_LIBRARY_BASE);
    expect(ALLOCMEM_HEAP_BASE).toBeLessThan(ALLOCMEM_HEAP_END);
    // What still fits is still handed out.
    expect(exec.allocMem(16, 1)).not.toBe(0);
  });
});
