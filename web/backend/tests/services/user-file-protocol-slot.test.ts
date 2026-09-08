/**
 * An imported account keeps the transfer protocol it arrived with.
 *
 * P3-4, transfer row 3. `xferProtocol` in the on-disk user struct is an INDEX
 * into the BOARD's own XprTypes list (express.e:15618, :11388) - not a global
 * protocol id - and this port mapped only 0..3. Every other slot read back as
 * `/X Zmodem` and was written out as 0 on the next save: a caller whose board
 * had Hydra at slot 8 lost the setting silently and permanently, one account
 * at a time, and nothing in the port ever said so.
 *
 * The fix does not invent names for slots whose meaning depends on a board
 * this port has never seen. It carries the number.
 */
process.env.SKIP_DB_INIT = '1';

import { UserFileManager } from '../../src/services/UserFileManager';

/** The two private halves of the mapping, which is what the struct uses. */
const toInt = (name: string): number =>
  (UserFileManager.prototype as any).protocolToInt.call(null, name);
const toName = (slot: number): string =>
  (UserFileManager.prototype as any).intToProtocol.call(null, slot);

describe('the four slots this port can name', () => {
  it('round-trip by name', () => {
    for (const [slot, name] of [[0, '/X Zmodem'], [1, 'Zmodem'], [2, 'Ymodem'], [3, 'Xmodem']] as const) {
      expect(toName(slot)).toBe(name);
      expect(toInt(name)).toBe(slot);
    }
  });
});

describe('a slot from a board this port has never seen', () => {
  it('survives the round trip instead of collapsing to zero', () => {
    // Hydra at slot 8 on a board with eleven XprTypes entries - the report's
    // own example.
    expect(toName(8)).toBe('/X 8');
    expect(toInt('/X 8')).toBe(8);
  });

  it('survives every slot the INT field can hold', () => {
    for (const slot of [4, 7, 11, 255, 32767]) {
      expect(toInt(toName(slot))).toBe(slot);
    }
  });

  it('is not confused with the name that happens to look like it', () => {
    // `/X Zmodem` is slot 0 and `/X 0` is also slot 0; neither may become the
    // other's number.
    expect(toInt('/X Zmodem')).toBe(0);
    expect(toInt('/X 0')).toBe(0);
    expect(toName(0)).toBe('/X Zmodem');
  });
});

describe('nonsense', () => {
  it('falls back to slot 0 rather than writing something the struct cannot hold', () => {
    expect(toInt('carrier pigeon')).toBe(0);
    expect(toInt('/X ')).toBe(0);
    expect(toInt('/X -3')).toBe(0);
    expect(toInt('/X 99999')).toBe(0);
    expect(toInt('')).toBe(0);
  });

  it('reads a negative or absurd slot back as the default name', () => {
    expect(toName(-1)).toBe('/X Zmodem');
    expect(toName(NaN as unknown as number)).toBe('/X Zmodem');
  });
});
