/**
 * exec.library OpenLibrary must not run a boot-strap ROM resident's init.
 *
 * The Kickstart 3.1 A1200 dos.library romtag has rt_Flags=0 (no RTF_AUTOINIT,
 * no COLDSTART/SINGLETASK/AFTERDOS). Its rt_Init is the one-shot boot entry:
 * it builds dos, spawns the boot CLI, then calls RemTask(NULL) and falls into
 * Alert(0x87000000) when that returns. Real exec never InitResidents dos on
 * OpenLibrary (dos is in LibList from boot), so a door's
 * OpenLibrary("dos.library") jumped into that init and died. A resident with
 * none of those flags is not initialised on OpenLibrary; the opener falls back
 * to the emulator's own library.
 */
import { ExecLibrary } from '../../src/amiga-emulation/api/ExecLibrary';

const TAG = 0xf9f2b8;
const LIB_BASE = 0x123c0c;

function execWith(flags: number) {
  const lib = Object.create(ExecLibrary.prototype) as ExecLibrary;
  const initResident = jest.fn(() => LIB_BASE);
  Object.assign(lib, {
    emulator: {
      readMemory: jest.fn((addr: number) => {
        if (addr === TAG + 10) return flags;
        if (addr === TAG + 11) return 40;
        return 0;
      }),
    },
    romResidentCache: new Map<string, number>([['dos.library', TAG]]),
    initResident,
  });
  const open = (name: string, v: number) =>
    (
      lib as unknown as {
        openLibraryFromRomResident: (n: string, v: number, t: boolean) => number | null;
      }
    ).openLibraryFromRomResident(name, v, true);
  return { open, initResident };
}

describe('ExecLibrary.openLibraryFromRomResident', () => {
  it('does not run the init of a resident with rt_Flags=0 (boot-strap entry)', () => {
    const { open, initResident } = execWith(0x00);
    expect(open('dos.library', 0)).toBeNull();
    expect(initResident).not.toHaveBeenCalled();
  });

  it.each([
    ['RTF_AUTOINIT', 0x80],
    ['RTF_SINGLETASK', 0x02],
    ['RTF_COLDSTART', 0x01],
    ['RTF_AFTERDOS', 0x04],
  ])('still initialises a resident flagged %s', (_label, flags) => {
    const { open, initResident } = execWith(flags);
    expect(open('dos.library', 0)).toBe(LIB_BASE);
    expect(initResident).toHaveBeenCalledWith(TAG, 0, true);
  });
});
