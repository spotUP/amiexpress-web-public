/**
 * Who may fetch the BBC ROMs.
 *
 * The board asks callers to show they own the ROMs before it will run the
 * machine for them. `/beeb/roms` used to be plain static serving, so anyone
 * could simply fetch the file they were being asked to produce - which
 * would have made the whole arrangement a formality.
 */
import {
  queryWithoutGrant,
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

describe('taking the grant back off the URL', () => {
  it('leaves every other byte exactly as it arrived', () => {
    /*
     * THE BUG THIS EXISTS FOR. Rebuilding the query through
     * URLSearchParams writes a space as `+`. jsbeeb does not read `+` as a
     * space, so the command came back as `CHAIN+"GOMOKU"` and the machine
     * typed the plus: "No such variable".
     */
    const url = '/beeb/?model=B-DFS1.2&disc1=ceefax-1985.ssd&autotype=CHAIN%20%22GOMOKU%22%0A&grant=abc123';
    const rest = queryWithoutGrant(url);
    expect(rest).toBe('model=B-DFS1.2&disc1=ceefax-1985.ssd&autotype=CHAIN%20%22GOMOKU%22%0A');
    expect(rest).not.toContain('+');
    expect(rest).not.toContain('grant');
  });

  it('removes the grant wherever it sits', () => {
    expect(queryWithoutGrant('/beeb/?grant=x&model=B')).toBe('model=B');
    expect(queryWithoutGrant('/beeb/?model=B&grant=x&autoboot')).toBe('model=B&autoboot');
  });

  it('keeps a valueless flag the emulator reads', () => {
    // `autoboot` carries no value and must survive as itself.
    expect(queryWithoutGrant('/beeb/?disc1=a.ssd&autoboot&grant=x')).toBe('disc1=a.ssd&autoboot');
  });

  it('is empty when the grant was all there was', () => {
    expect(queryWithoutGrant('/beeb/?grant=x')).toBe('');
    expect(queryWithoutGrant('/beeb/')).toBe('');
  });

  it('does not mistake a name that merely ends in grant', () => {
    expect(queryWithoutGrant('/beeb/?upgrant=keepme&grant=x')).toBe('upgrant=keepme');
  });
});
