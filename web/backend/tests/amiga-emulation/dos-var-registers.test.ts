/**
 * SetVar, GetVar and DeleteVar take their arguments where dos.library says.
 *
 * dos.library passes arguments in D1 upward, not A0/A1 - vbcc's own
 * inline/dos_protos.h:
 *
 *   __GetVar(a6, d1 name, d2 buffer, d3 size, d4 flags)
 *   __SetVar(a6, d1 name, d2 buffer, d3 size, d4 flags)
 *   __DeleteVar(a6, d1 name, d2 flags)
 *
 * and Open() in the same emulated library has always read D1/D2 for exactly
 * this reason. These three read A0/A1/D0/D1 instead, so a door calling
 * GetVar got whatever happened to be in those registers: measured
 * 2026-09-06 on THEMEC, the call arrived as
 *
 *   [dos.library] GetVar("", bufferSize=1, flags=15740)
 *
 * The board sets AE_HOST, AE_CAPS and the rest for every door (utils/
 * host-vars.ts), and NO 68K door could read any of them - so every one of
 * them believed it was on classic AmiExpress. THEMEC said so out loud:
 * "This board cannot keep a theme" (sysop, 2026-09-06).
 *
 * The env layer was already tested (environment-vars.test.ts) and passed
 * throughout: it drives EnvironmentManager, which is downstream of the
 * registers. This one is at the entry point the door reaches.
 */
process.env.SKIP_DB_INIT = '1';

import { DosLibrary } from '../../src/amiga-emulation/api/DosLibrary';
import { CPURegister } from '../../src/amiga-emulation/cpu/MoiraEmulator';

/** Just enough emulator: registers and byte memory. */
function makeEmulator() {
  const regs = new Map<number, number>();
  const mem = new Map<number, number>();
  return {
    getRegister: (r: number) => regs.get(r) ?? 0,
    setRegister: (r: number, v: number) => { regs.set(r, v); },
    readMemory: (a: number) => mem.get(a) ?? 0,
    writeMemory: (a: number, v: number) => { mem.set(a, v & 0xff); },
    readMemory8: (a: number) => mem.get(a) ?? 0,
    writeMemory8: (a: number, v: number) => { mem.set(a, v & 0xff); },
    readMemory16: () => 0,
    writeMemory16: () => undefined,
    readMemory32: () => 0,
    writeMemory32: () => undefined,
    readString: (addr: number, max = 256) => {
      let out = '';
      for (let i = 0; i < max; i++) {
        const b = mem.get(addr + i) ?? 0;
        if (b === 0) break;
        out += String.fromCharCode(b);
      }
      return out;
    },
    writeString: (addr: number, text: string) => {
      for (let i = 0; i < text.length; i++) mem.set(addr + i, text.charCodeAt(i));
      mem.set(addr + text.length, 0);
    },
  } as any;
}

const NAME = 0x40000;
const VALUE = 0x40100;
const BUFFER = 0x40200;

describe('a door reading an environment variable', () => {
  it('finds AE_HOST, which is how it knows what board it is on', () => {
    const emulator = makeEmulator();
    const dos = new DosLibrary(emulator);

    // The board sets the variable, exactly as EnvironmentManager does.
    (dos as any).envManager.setVar('AE_HOST', 'amiexpress-web');

    emulator.writeString(NAME, 'AE_HOST');
    emulator.setRegister(CPURegister.D1, NAME);
    emulator.setRegister(CPURegister.D2, BUFFER);
    emulator.setRegister(CPURegister.D3, 32);
    emulator.setRegister(CPURegister.D4, 0);

    dos.GetVar();

    expect(emulator.readString(BUFFER, 32)).toBe('amiexpress-web');
    // GetVar answers with the length; ae_host.c treats <= 0 as "no board".
    expect(emulator.getRegister(CPURegister.D0)).toBe('amiexpress-web'.length);
  });

  it('is told when there is no such variable, rather than reading rubbish', () => {
    const emulator = makeEmulator();
    const dos = new DosLibrary(emulator);

    emulator.writeString(NAME, 'AE_NOT_A_VARIABLE');
    emulator.setRegister(CPURegister.D1, NAME);
    emulator.setRegister(CPURegister.D2, BUFFER);
    emulator.setRegister(CPURegister.D3, 32);
    emulator.setRegister(CPURegister.D4, 0);

    dos.GetVar();

    expect(emulator.getRegister(CPURegister.D0)).toBe(-1);
  });

  it('sets one, and reads back what it set', () => {
    const emulator = makeEmulator();
    const dos = new DosLibrary(emulator);

    emulator.writeString(NAME, 'DOOR_WROTE_THIS');
    emulator.writeString(VALUE, 'yes');
    emulator.setRegister(CPURegister.D1, NAME);
    emulator.setRegister(CPURegister.D2, VALUE);
    emulator.setRegister(CPURegister.D3, -1);   // null-terminated
    emulator.setRegister(CPURegister.D4, 0);

    dos.SetVar();

    expect((dos as any).envManager.getVar('DOOR_WROTE_THIS')).toBe('yes');
  });

  it('deletes one by the name in D1', () => {
    const emulator = makeEmulator();
    const dos = new DosLibrary(emulator);
    (dos as any).envManager.setVar('GOING_AWAY', 'here');

    emulator.writeString(NAME, 'GOING_AWAY');
    emulator.setRegister(CPURegister.D1, NAME);
    emulator.setRegister(CPURegister.D2, 0);

    dos.DeleteVar();

    expect((dos as any).envManager.getVar('GOING_AWAY')).toBeUndefined();
  });
});
