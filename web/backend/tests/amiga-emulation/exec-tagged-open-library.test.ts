/**
 * exec.library TaggedOpenLibrary (private LVO -810, V39+).
 *
 * The Kickstart 3.1 A1200/A4000 dos.library init opens utility.library with
 * `moveq #7,d0; jsr -810(a6)` and raises Alert 0x87000000 when it gets 0.
 * The exec jump table used to end at -780 (RemMemHandler), so -810 held no
 * trap: the ROM's call ran into unmapped bytes, slid into the AddMemHandler
 * stub at -774, got D0=0 back and the dos init died. These tests pin the
 * vector and the tag-to-name mapping without needing a ROM image.
 */
import { EXEC_VECTORS } from '../../src/amiga-emulation/api/library-vectors/exec-vectors';
import { ExecLibrary } from '../../src/amiga-emulation/api/ExecLibrary';

describe('exec.library TaggedOpenLibrary (-810)', () => {
  it('has a vector at -810 that passes D0 as the tag and returns the base', () => {
    const vector = EXEC_VECTORS.find((v) => v.offset === -810);
    expect(vector?.name).toBe('TaggedOpenLibrary');

    const emu = { getRegister: jest.fn((r: number) => (r === 0 ? 7 : 0xdead)) };
    const lib = { taggedOpenLibrary: jest.fn(() => 0x123450) };
    const result = vector!.handler(emu as never, lib as never);

    expect(lib.taggedOpenLibrary).toHaveBeenCalledWith(7);
    expect(result).toBe(0x123450);
  });

  it('maps tag 7 to utility.library and opens it at version 0', () => {
    const openLibraryByName = jest.fn(() => 0x2000);
    const fakeThis = { openLibraryByName, emulator: {} };
    const base = ExecLibrary.prototype.taggedOpenLibrary.call(fakeThis as never, 7);

    expect(openLibraryByName).toHaveBeenCalledWith('utility.library', 0);
    expect(base).toBe(0x2000);
  });

  it('opens nothing for tag 0 or an unknown tag', () => {
    const openLibraryByName = jest.fn(() => 0x2000);
    const fakeThis = { openLibraryByName, emulator: {} };

    expect(ExecLibrary.prototype.taggedOpenLibrary.call(fakeThis as never, 0)).toBe(0);
    expect(ExecLibrary.prototype.taggedOpenLibrary.call(fakeThis as never, 99)).toBe(0);
    expect(openLibraryByName).not.toHaveBeenCalled();
  });
});
