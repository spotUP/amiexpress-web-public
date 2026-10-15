/**
 * A date the board stores is express.e's getSystemTime() value, and reads back
 * as the moment it was.
 *
 * express.e (MiscFuncs.e:463-469):
 *
 *   getSystemTime() = (Mul(Mul(days+2922,1440),60) + minute*60 + tick/50) + 21600
 *
 * with days/minute/tick from DateStamp() - the board's LOCAL wall clock,
 * counted from 1978-01-01. The port stored plain Unix seconds, so an
 * AmiExpress reader showed a message posted at 13:52 in a Swedish summer as
 * 05:52 (live Conf1 message 267, 2026-09-30).
 */
process.env.TZ = 'Europe/Stockholm';

import { toAmigaTime, fromAmigaTime, encodeAmigaDate, decodeAmigaDate, decodeAmigaDateToUnix } from '../../src/utils/date-time.util';

/** The E formula, with the DateStamp of the moment worked out by hand. */
function expressValue(days: number, minute: number, tick: number): number {
  return (days + 2922) * 1440 * 60 + minute * 60 + Math.floor(tick / 50) + 21600;
}

describe('the date express.e stores', () => {
  test('a summer afternoon in Stockholm is stored as express.e stores it', () => {
    // 2026-09-30 13:52:16 CEST = 11:52:16Z. 2026-09-30 is day 17804 after
    // 1978-01-01; 13:52 is minute 832; 16 s is tick 800.
    const posted = new Date('2026-09-30T11:52:16Z');
    expect(toAmigaTime(posted)).toBe(expressValue(17804, 832, 800));
    expect(toAmigaTime(posted)).toBe(0x6abd6870);
    // The value the port used to store, and the 8 hours between them.
    expect(toAmigaTime(posted) - posted.getTime() / 1000).toBe(21600 + 7200);
  });

  test('a winter time is one hour less ahead', () => {
    // 2026-02-11 20:34:00 CET = 19:34:00Z; day 17573, minute 1234.
    const t = new Date('2026-02-11T19:34:00Z');
    expect(toAmigaTime(t)).toBe(expressValue(17573, 1234, 0));
    expect(toAmigaTime(t) - t.getTime() / 1000).toBe(21600 + 3600);
  });

  test('a stored value reads back as the moment it was written', () => {
    for (const iso of ['2026-09-30T11:52:16Z', '2026-02-11T19:34:00Z', '1995-12-25T08:00:59Z', '2026-10-25T00:30:00Z']) {
      const when = new Date(iso);
      expect(fromAmigaTime(toAmigaTime(when)).toISOString()).toBe(when.toISOString());
    }
  });

  test('a value an Amiga wrote reads as the wall-clock time it names', () => {
    // A real recv stamp off the reference-boardBBS Conf2 HeaderFile.
    const d = fromAmigaTime(1687536471);
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()])
      .toEqual([2023, 6, 23, 10, 7, 51]);
  });

  test('0 is "never" both ways, and a field takes Unix seconds or a Date', () => {
    expect(encodeAmigaDate(0)).toBe(0);
    expect(encodeAmigaDate(undefined)).toBe(0);
    expect(decodeAmigaDate(0)).toBeUndefined();
    expect(decodeAmigaDateToUnix(0)).toBe(0);
    expect(encodeAmigaDate(1790769136)).toBe(0x6abd6870);
    expect(encodeAmigaDate(new Date(1790769136 * 1000))).toBe(0x6abd6870);
    expect(decodeAmigaDateToUnix(0x6abd6870)).toBe(1790769136);
  });
});
