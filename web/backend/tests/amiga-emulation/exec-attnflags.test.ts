/**
 * Symptom: C/LZX prints "This version of LZX requires at least a 68020" and
 * exits 100. SysBase->AttnFlags (ExecBase+296) was never written, so it read 0
 * (a 68000), although the Moira core is built with setModel(Model::M68020).
 * AttnFlags must carry exactly the bits of the emulated CPU.
 */
import * as fs from 'fs';
import * as path from 'path';
import { ExecLibrary } from '../../src/amiga-emulation/api/ExecLibrary';
import { EMULATED_ATTN_FLAGS, AFF_68010, AFF_68020 } from '../../src/amiga-emulation/cpu/emulated-cpu';
import { STRUCT_FIELDS } from '../../src/amiga-emulation/constants/struct-fields.generated';

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
  return { emu, r16, mem, moiraTraps: () => moiraTraps };
}


describe('ExecBase AttnFlags', () => {
  it('reads 68010|68020 (not 0) after ExecLibrary.initialize, at the offset the NDK table gives', () => {
    const { emu, r16 } = memoryEmulator();
    new ExecLibrary(emu as never).initialize();
    const field = Object.values(STRUCT_FIELDS as Record<string, Array<{ name: string; offset: number }>>)
      .flat().find((f) => f.name === 'AttnFlags');
    expect(field?.offset).toBe(296);
    expect(r16(0x80000 + 296)).toBe(AFF_68010 | AFF_68020);
    expect(r16(0x80000 + 296)).toBe(EMULATED_ATTN_FLAGS);
  });

  it('names the same CPU the C++ core is constructed with', () => {
    const cpp = fs.readFileSync(path.join(__dirname, '../../src/amiga-emulation/cpu/moira-wrapper.cpp'), 'utf8');
    expect(cpp).toMatch(/setModel\(Model::M68020\)/);
  });
});
