/**
 * Who may fetch the BBC ROMs.
 *
 * The board asks callers to show they own the ROMs before it will run the
 * machine for them. `/beeb/roms` used to be plain static serving, so anyone
 * could simply fetch the file they were being asked to produce - which
 * would have made the whole arrangement a formality.
 */
import {
  grantRomAccess,
  romAccessHolder,
  revokeRomAccess,
  cookieValue,
  clearRomAccess,
  ROM_COOKIE,
} from '../../src/server/beeb-rom-access';

beforeEach(() => clearRomAccess());

describe('the ROM grant', () => {
  it('lets the holder through and nobody else', () => {
    const token = grantRomAccess('42');
    expect(romAccessHolder(token)).toBe('42');
    expect(romAccessHolder('something-else')).toBeNull();
    expect(romAccessHolder(undefined)).toBeNull();
  });

  it('issues a different token every time', () => {
    // A predictable grant is no grant at all.
    const tokens = new Set([grantRomAccess('a'), grantRomAccess('a'), grantRomAccess('a')]);
    expect(tokens.size).toBe(3);
  });

  it('can be taken back', () => {
    const token = grantRomAccess('42');
    revokeRomAccess(token);
    expect(romAccessHolder(token)).toBeNull();
  });

  it('expires, so a leaked URL is not a standing grant', () => {
    const token = grantRomAccess('42');
    const realNow = Date.now;
    try {
      Date.now = () => realNow() + 31 * 60 * 1000;
      expect(romAccessHolder(token)).toBeNull();
    } finally {
      Date.now = realNow;
    }
  });
});

describe('reading the cookie the emulator page leaves', () => {
  it('finds the value among others', () => {
    const header = `theme=dark; ${ROM_COOKIE}=abc123; other=x`;
    expect(cookieValue(header, ROM_COOKIE)).toBe('abc123');
  });

  it('is not confused by a name that merely ends the same', () => {
    expect(cookieValue(`not${ROM_COOKIE}=nope`, ROM_COOKIE)).toBeUndefined();
  });

  it('answers nothing for a request that carries no cookies', () => {
    expect(cookieValue(undefined, ROM_COOKIE)).toBeUndefined();
    expect(cookieValue('', ROM_COOKIE)).toBeUndefined();
  });
});
