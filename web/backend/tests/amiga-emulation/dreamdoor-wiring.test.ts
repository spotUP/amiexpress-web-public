/**
 * dreamdoor.library wiring (DayDream door compatibility).
 *
 * Three things have to be true for a DayDream door's first dreamdoor.library
 * call to reach the board instead of running straight through an RTS stub:
 *
 *  1. OpenLibrary("dreamdoor.library") must fill the whole -6..-144 LVO range
 *     with stub jump-table slots (24 of them, 6 bytes apart); 20 used to stop
 *     short of DDCommand at -132 and the unnamed -138/-144 slots.
 *  2. LibraryManager's OpenLibrary callback must install the dreamdoor vectors
 *     (0x4AFC ILLEGAL at base+offset for every DREAMDOOR_VECTORS entry).
 *  3. The install must push those trap addresses to MOIRA, or the WASM batch
 *     loop runs straight through them - the same rule installFameVectors keeps.
 *
 * Driven at runtime: the real ExecLibrary, the real LibraryManager
 * initialization over a memory-backed stub emulator, then a real
 * openLibraryHybrid("dreamdoor.library"). What is asserted is what the
 * emulator was told - the words written and the trap addresses synced.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ExecLibrary } from '../../src/amiga-emulation/api/ExecLibrary';
import { LibraryManager } from '../../src/amiga-emulation/LibraryManager';
import { DREAMDOOR_VECTORS } from '../../src/amiga-emulation/api/library-vectors';

/**
 * A memory-backed emulator. Every method the launch path calls that this
 * does not model is a no-op, so initialization runs through; the
 * two MOIRA trap-set calls are recorded.
 */
function memoryEmulator() {
  const mem = new Map<number, number>();
  let moiraTraps = new Set<number>();
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
    readString: (a: number) => { let s = ''; for (let i = a; r8(i) !== 0; i++) s += String.fromCharCode(r8(i)); return s; },
    getMemory: () => new Uint8Array(0),
    getRegister: () => 0,
    getPC: () => 0x1000,
    getSP: () => 0x80000,
    clearTrapAddresses: () => { moiraTraps = new Set(); },
    addTrapAddress: (a: number) => { moiraTraps.add(a >>> 0); },
  };
  const emu = new Proxy(known, {
    get: (target, prop: string) => (prop in target ? target[prop] : () => undefined),
  });
  return { emu, r16, moiraTraps: () => moiraTraps };
}

describe('dreamdoor.library wiring', () => {
  it('OpenLibrary fills all 24 stub jump-table slots, -6 through -144', () => {
    const { emu, r16 } = memoryEmulator();
    const exec = new ExecLibrary(emu as never);
    exec.initialize();

    exec.openLibraryHybrid('dreamdoor.library', 0, false);
    const base = exec.getLibraryBase('dreamdoor.library');
    expect(base).not.toBe(0);

    const RTS = 0x4e75;
    for (let offset = -6; offset >= -144; offset -= 6) {
      expect({ offset, word: r16(base + offset) }).toEqual({ offset, word: RTS });
    }
  });

  it('opening dreamdoor.library installs its vectors and syncs them to MOIRA', async () => {
    const { emu, r16, moiraTraps } = memoryEmulator();
    // A scratch board root: the launch path creates Node dirs and a Kickstart
    // module cache under it, and none of that belongs in the checkout.
    const bbsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dreamdoor-wiring-'));
    const manager = new LibraryManager(
      emu as never,
      { id: 'test', on: () => {}, emit: () => {} } as never,
      {
        doorType: 'XIM',
        executablePath: path.join(bbsRoot, 'Doors', 'DDTest', 'DDTest'),
        bbsSession: { nodeId: 1, username: 'sysop', bbsRoot },
      } as never,
      undefined,
      null,
    );
    try {
      await manager.initialize();
    } finally {
      fs.rmSync(bbsRoot, { recursive: true, force: true });
    }
    const exec = manager.execLibrary!;
    expect(exec).not.toBeNull();

    exec.openLibraryHybrid('dreamdoor.library', 0, false);
    const base = exec.getLibraryBase('dreamdoor.library');
    expect(base).not.toBe(0);

    expect(DREAMDOOR_VECTORS.length).toBeGreaterThan(0);
    const synced = moiraTraps();
    for (const vector of DREAMDOOR_VECTORS) {
      const addr = (base + vector.offset) >>> 0;
      expect({ name: vector.name, word: r16(addr) }).toEqual({ name: vector.name, word: 0x4afc });
      expect({ name: vector.name, synced: synced.has(addr) }).toEqual({ name: vector.name, synced: true });
    }
  });
});
