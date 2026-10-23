/**
 * exec.library AddLibrary (-396) and OpenLibrary of an added library.
 *
 * The Kickstart 3.1 A1200 dos.library init builds its library, calls
 * AddLibrary on it, then calls OpenLibrary("dos.library") on itself. AddLibrary
 * had no vector (an auto-stub returned 0 and recorded nothing), so that
 * OpenLibrary found no dos.library, ran the ROM resident's init again, and the
 * init recursed ~369 times until it raised Alert 0x87000000. Real exec's
 * OpenLibrary only searches SysBase->LibList and calls the library's own Open
 * vector (LVO -6) with D0=version, A6=base; it never re-runs an init.
 */
import { EXEC_VECTORS } from '../../src/amiga-emulation/api/library-vectors/exec-vectors';
import { ExecLibrary } from '../../src/amiga-emulation/api/ExecLibrary';

const LIB_BASE = 0x123c0c;
const NAME_PTR = 0x123d00;

function fakeEmulator(version: number) {
  const bytes = new Map<number, number>();
  return {
    readMemory32: jest.fn((addr: number) => (addr === LIB_BASE + 10 ? NAME_PTR : 0)),
    readString: jest.fn((addr: number) => (addr === NAME_PTR ? 'dos.library' : '')),
    readMemory: jest.fn((addr: number) => bytes.get(addr) ?? 0),
    writeMemory: jest.fn((addr: number, v: number) => bytes.set(addr, v)),
    readMemory16: jest.fn((addr: number) => (addr === LIB_BASE + 20 ? version : 0)),
    bytes,
  };
}

function execWith(emu: ReturnType<typeof fakeEmulator>): ExecLibrary {
  const lib = Object.create(ExecLibrary.prototype) as ExecLibrary;
  Object.assign(lib, {
    emulator: emu,
    addedLibraries: new Map<string, number>(),
    pendingTrapJumpPc: null,
    pendingTrapJumpName: null,
    pendingTrapJumpRegs: null,
    pendingTrapJumpIsInit: false,
    useNativeLibraries: true,
    openLibraryFromRomResident: jest.fn(() => 0),
  });
  return lib;
}

describe('exec.library AddLibrary (-396)', () => {
  it('has a vector at -396 that passes A1 to addLibrary', () => {
    const vector = EXEC_VECTORS.find((v) => v.offset === -396);
    expect(vector?.name).toBe('AddLibrary');

    const emu = { getRegister: jest.fn((r: number) => (r === 9 ? LIB_BASE : 0)) };
    const lib = { addLibrary: jest.fn() };
    vector!.handler(emu as never, lib as never);

    expect(lib.addLibrary).toHaveBeenCalledWith(LIB_BASE);
  });

  it('opens an added library through its Open vector instead of re-running the ROM init', () => {
    const emu = fakeEmulator(40);
    const lib = execWith(emu);
    lib.addLibrary(LIB_BASE);

    expect(emu.bytes.get(LIB_BASE + 14)).toBe(0x02); // LIBF_CHANGED

    const result = lib.openLibraryHybrid('DOS.library', 37, true);

    expect(result).toEqual({ success: true, address: LIB_BASE, isNative: true });
    expect((lib as unknown as { openLibraryFromRomResident: jest.Mock }).openLibraryFromRomResident)
      .not.toHaveBeenCalled();
    expect(lib.consumeTrapJump()).toEqual({
      pc: LIB_BASE - 6,
      name: 'DOS.library',
      isInit: false,
      regs: { d0: 37, a6: LIB_BASE },
    });
  });

  it('refuses an added library older than the asked version', () => {
    const lib = execWith(fakeEmulator(36));
    lib.addLibrary(LIB_BASE);

    expect(lib.openLibraryHybrid('dos.library', 37, true).success).toBe(false);
    expect(lib.consumeTrapJump()).toBeNull();
  });

  it('schedules no jump for a host-side open (no 68K caller)', () => {
    const lib = execWith(fakeEmulator(40));
    lib.addLibrary(LIB_BASE);

    expect(lib.openLibraryHybrid('dos.library', 37, false).address).toBe(LIB_BASE);
    expect(lib.consumeTrapJump()).toBeNull();
  });
});
