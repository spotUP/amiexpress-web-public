/**
 * Symptom: C/DMS calls OldOpenLibrary("Bootblock.library"); the library file
 * does not exist, yet the call returned a non-NULL base (0x210000) with no
 * vectors, and DMS then jumped through it ("Invalid PC detected: 0x21091b").
 * AmigaOS returns NULL for a library that does not exist.
 */
import { ExecLibrary } from '../../src/amiga-emulation/api/ExecLibrary';

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


function open(name: string, old: boolean) {
  const { emu, mem } = memoryEmulator();
  const exec = new ExecLibrary(emu as never);
  exec.initialize();
  const nameAddr = 0x2000;
  for (let i = 0; i < name.length; i++) mem.set(nameAddr + i, name.charCodeAt(i));
  mem.set(nameAddr + name.length, 0);
  return exec.openLibrary(nameAddr, old ? 0 : 33);
}

describe('OpenLibrary of a library that does not exist', () => {
  it.each([true, false])('returns NULL for Bootblock.library (OldOpenLibrary=%s)', (old) => {
    expect(open('Bootblock.library', old)).toBe(0);
    expect(open('nosuchthing.library', old)).toBe(0);
  });

  it('returns NULL for locale.library so C/Zip does not spin on a zero-returning stub', () => {
    expect(open('locale.library', false)).toBe(0);
  });

  // A base whose calls all answer 0 (or crash) is a lie about the machine: a
  // stock library with no implemented function is absent, like a machine
  // without it. Measured 2026-10-12: no repo door opens any of these.
  it.each([
    'commodities.library', 'cybergraphics.library', 'datatypes.library',
    'diskfont.library', 'gadtools.library', 'iffparse.library',
    'keymap.library', 'layers.library', 'realtime.library', 'workbench.library',
  ])('returns NULL for %s, which has no implemented function', (name) => {
    expect(open(name, false)).toBe(0);
  });

  it.each([
    'mathffp.library', 'mathtrans.library', 'mathieeedoubbas.library',
    'mathieeedoubtrans.library', 'mathieeesingbas.library', 'mathieeesingtrans.library',
    'dos.library',
    // stub-only, kept: AEreg / SmartShowCfg / ShowConfig refuse to start without the open
    'asl.library', 'expansion.library',
  ])('still answers %s with a base', (name) => {
    expect(open(name, false)).not.toBe(0);
  });
});
