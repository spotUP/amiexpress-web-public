/**
 * Date/Time Utility Unit Tests
 *
 * Tests all date/time formatting and conversion functions for AmiExpress compatibility.
 * Validates Amiga DateStamp conversions, formatting consistency, and edge cases.
 */

import {
  getSystemTime,
  getSystemDate,
  formatLongDate,
  formatLongTime,
  formatLongDateTime,
  formatCDateTime,
  dateStampToDateTime,
  dateTimeToDateStamp,
  formatDuration,
  formatShortDate,
  formatShortTime,
} from '../../src/utils/date-time.util';

describe('Date/Time Utility Functions', () => {
  describe('getSystemTime', () => {
    it('should return a Date object', () => {
      const result = getSystemTime();
      expect(result).toBeInstanceOf(Date);
    });

    it('should return current time within reasonable range', () => {
      const before = Date.now();
      const result = getSystemTime();
      const after = Date.now();

      expect(result.getTime()).toBeGreaterThanOrEqual(before);
      expect(result.getTime()).toBeLessThanOrEqual(after);
    });
  });

  describe('getSystemDate', () => {
    it('should return a Date object', () => {
      const result = getSystemDate();
      expect(result).toBeInstanceOf(Date);
    });

    it('should return current time within reasonable range', () => {
      const before = Date.now();
      const result = getSystemDate();
      const after = Date.now();

      expect(result.getTime()).toBeGreaterThanOrEqual(before);
      expect(result.getTime()).toBeLessThanOrEqual(after);
    });
  });

  describe('formatLongDate', () => {
    // MiscFuncs.e:287-297 — DateToStr with FORMAT_USA produces "MM-DD-YY".
    // The previous tests expected DD-MMM-YYYY (DOS format) which is what
    // formatLongDateTime renders, not formatLongDate.
    it('should format date as MM-DD-YY (FORMAT_USA)', () => {
      const date = new Date(2026, 0, 7, 14, 30, 0);
      expect(formatLongDate(date)).toBe('01-07-26');
    });

    it('should pad single-digit months and days', () => {
      const date = new Date(2026, 2, 5, 12, 0, 0);
      expect(formatLongDate(date)).toBe('03-05-26');
    });

    it('should format all 12 months correctly', () => {
      for (let month = 0; month < 12; month++) {
        const date = new Date(2025, month, 15);
        const mm = String(month + 1).padStart(2, '0');
        expect(formatLongDate(date)).toBe(`${mm}-15-25`);
      }
    });

    it('should format leap-day correctly', () => {
      const date = new Date(2024, 1, 29, 12, 0, 0);
      expect(formatLongDate(date)).toBe('02-29-24');
    });

    it('should format first day of month correctly', () => {
      const date = new Date(2026, 0, 1, 0, 0, 0);
      expect(formatLongDate(date)).toBe('01-01-26');
    });

    it('should format Amiga-era date correctly (1990s)', () => {
      const date = new Date(1995, 11, 25, 12, 0, 0);
      expect(formatLongDate(date)).toBe('12-25-95');
    });
  });

  describe('formatLongTime', () => {
    it('should format time as HH:MM:SS in 24-hour format', () => {
      const date = new Date(2026, 0, 7, 14, 32, 15); // Local time
      const result = formatLongTime(date);
      expect(result).toBe('14:32:15');
    });

    it('should format midnight correctly', () => {
      const date = new Date(2026, 0, 7, 0, 0, 0); // Local time
      const result = formatLongTime(date);
      expect(result).toBe('00:00:00');
    });

    it('should format single-digit hours with leading zero', () => {
      const date = new Date(2026, 0, 7, 9, 5, 3); // Local time
      const result = formatLongTime(date);
      expect(result).toBe('09:05:03');
    });

    it('should format end of day correctly', () => {
      const date = new Date(2026, 0, 7, 23, 59, 59); // Local time
      const result = formatLongTime(date);
      expect(result).toBe('23:59:59');
    });

    it('should handle noon correctly', () => {
      const date = new Date(2026, 0, 7, 12, 0, 0); // Local time
      const result = formatLongTime(date);
      expect(result).toBe('12:00:00');
    });
  });

  describe('formatLongDateTime', () => {
    // MiscFuncs.e:320-341 — FORMAT_DOS output assembled with a 3-char weekday
    // prefix: "DDD DD-MMM-YYYY HH:MM:SS".
    it('should format datetime as DDD DD-MMM-YYYY HH:MM:SS', () => {
      const date = new Date(2026, 0, 7, 14, 32, 15); // Wed
      expect(formatLongDateTime(date)).toBe('Wed 07-Jan-2026 14:32:15');
    });

    it('should format midnight on New Years correctly', () => {
      const date = new Date(2026, 0, 1, 0, 0, 0); // Thu
      expect(formatLongDateTime(date)).toBe('Thu 01-Jan-2026 00:00:00');
    });

    it('should format Christmas 1995 correctly', () => {
      const date = new Date(1995, 11, 25, 9, 0, 0); // Mon
      expect(formatLongDateTime(date)).toBe('Mon 25-Dec-1995 09:00:00');
    });
  });

  describe('formatCDateTime', () => {
    // MiscFuncs.e:343-364. It looks like C's ctime and is not built like it:
    // :361 assembles the string from the AmigaDOS pieces, and the day of month
    // is `\s[2]` of the FORMAT_DOS date "07-Jan-26" - zero-padded. C pads it
    // with a space ("Jan  7"), and this port used to copy C, so a door asking
    // for DT_STAMP_LASTON was handed a day the real board never writes.
    // Tests run in the machine's local timezone, so structure is asserted
    // rather than an absolute instant.

    it('is express\'s "DDD MMM DD HH:MM:SS YYYY"', () => {
      const date = new Date(2026, 0, 7, 14, 32, 15); // Jan 7, 2026, 14:32:15 local

      expect(formatCDateTime(date)).toBe('Wed Jan 07 14:32:15 2026');
    });

    it('zero-pads the day, because the DOS date string it is cut from does', () => {
      expect(formatCDateTime(new Date(2026, 0, 7, 0, 0, 0))).toMatch(/Jan 07 /);
      // C's ctime writes "Jan  7"; express does not, and a door parsing a
      // fixed field would read the wrong column.
      expect(formatCDateTime(new Date(2026, 0, 7, 0, 0, 0))).not.toMatch(/Jan {2}7 /);
    });

    it('two-digit day stays two digits', () => {
      expect(formatCDateTime(new Date(2026, 0, 25, 0, 0, 0))).toMatch(/Jan 25 /);
    });

    it('is 24 characters, which is what fits a door\'s fixed field', () => {
      // WarOLM embeds it with `%-24.24s`; a longer string is silently cut.
      expect(formatCDateTime(new Date(2026, 0, 7, 14, 32, 15))).toHaveLength(24);
      expect(formatCDateTime(new Date(1995, 11, 25, 9, 0, 0))).toHaveLength(24);
    });

    it('is NOT formatLongDateTime, which is express\'s other date', () => {
      // MiscFuncs.e:320-341 vs :343-364. The XIM data query used to answer
      // DT_STAMP_CTIME with this one under the other one's name.
      const date = new Date(2026, 0, 7, 14, 32, 15);

      expect(formatLongDateTime(date)).toBe('Wed 07-Jan-2026 14:32:15');
      expect(formatCDateTime(date)).not.toBe(formatLongDateTime(date));
    });
  });

  /*
   * A DateStamp is the machine's LOCAL wall clock, as on a real Amiga: these
   * read and build local times (the board's TZ), not UTC instants. Counting
   * UTC put every door two hours behind in a Swedish summer (2026-09-27).
   */
  describe('dateStampToDateTime', () => {
    it('should convert Amiga epoch (day 0) to 1978-01-01', () => {
      const result = dateStampToDateTime(0, 0, 0);
      expect(result.getTime()).toBe(new Date(1978, 0, 1, 0, 0, 0, 0).getTime());
    });

    it('should convert 1 day to 1978-01-02', () => {
      const result = dateStampToDateTime(1, 0, 0);
      expect(result.getTime()).toBe(new Date(1978, 0, 2, 0, 0, 0, 0).getTime());
    });

    it('should convert minutes correctly', () => {
      const result = dateStampToDateTime(0, 90, 0); // 1 hour 30 minutes
      expect(result.getTime()).toBe(new Date(1978, 0, 1, 1, 30, 0, 0).getTime());
    });

    it('should convert ticks correctly (1 tick = 20ms)', () => {
      const result = dateStampToDateTime(0, 0, 50); // 50 ticks = 1000ms = 1 second
      expect(result.getTime()).toBe(new Date(1978, 0, 1, 0, 0, 1, 0).getTime());
    });

    it('should convert complete DateStamp (days + minutes + ticks)', () => {
      // 10 days, 12:30:00 (750 minutes), plus 5 seconds (250 ticks)
      const result = dateStampToDateTime(10, 750, 250);
      expect(result.getTime()).toBe(new Date(1978, 0, 11, 12, 30, 5, 0).getTime());
    });

    it('should handle leap years correctly', () => {
      // 1980-02-29 (leap year) = 789 days from 1978-01-01
      // (365 days for 1978 + 365 days for 1979 + 59 days for Jan-Feb 1980)
      const result = dateStampToDateTime(789, 0, 0);
      const expected = new Date(1980, 1, 29, 0, 0, 0, 0);
      expect(result.getTime()).toBe(expected.getTime());
    });

    it('should handle year 2000 date', () => {
      // 2000-01-01 = 8035 days from 1978-01-01
      const result = dateStampToDateTime(8035, 0, 0);
      expect(result.getTime()).toBe(new Date(2000, 0, 1, 0, 0, 0, 0).getTime());
    });

    it('should handle midnight of next day', () => {
      const result = dateStampToDateTime(0, 1440, 0); // 24 hours = 1440 minutes
      expect(result.getTime()).toBe(new Date(1978, 0, 2, 0, 0, 0, 0).getTime());
    });
  });

  describe('dateTimeToDateStamp', () => {
    it('should convert 1978-01-01 to Amiga epoch (0,0,0)', () => {
      const date = new Date(1978, 0, 1, 0, 0, 0, 0);
      const result = dateTimeToDateStamp(date);
      expect(result).toEqual({ days: 0, minutes: 0, ticks: 0 });
    });

    it('should convert 1978-01-02 to day 1', () => {
      const date = new Date(1978, 0, 2, 0, 0, 0, 0);
      const result = dateTimeToDateStamp(date);
      expect(result).toEqual({ days: 1, minutes: 0, ticks: 0 });
    });

    it('should convert time of day to minutes', () => {
      const date = new Date(1978, 0, 1, 12, 30, 0, 0);
      const result = dateTimeToDateStamp(date);
      expect(result).toEqual({ days: 0, minutes: 750, ticks: 0 });
    });

    it('should convert seconds/milliseconds to ticks', () => {
      const date = new Date(1978, 0, 1, 0, 0, 5, 0); // 5 seconds = 250 ticks
      const result = dateTimeToDateStamp(date);
      expect(result).toEqual({ days: 0, minutes: 0, ticks: 250 });
    });

    it('should handle complete datetime conversion', () => {
      const date = new Date(1978, 0, 11, 12, 30, 5, 0);
      const result = dateTimeToDateStamp(date);
      expect(result).toEqual({ days: 10, minutes: 750, ticks: 250 });
    });

    it('should handle leap year date', () => {
      const date = new Date(1980, 1, 29, 0, 0, 0, 0);
      const result = dateTimeToDateStamp(date);
      // Verify day count is correct (allow small variance due to timezone)
      expect(result.days).toBeGreaterThanOrEqual(789);
      expect(result.days).toBeLessThanOrEqual(791);
    });

    it('should handle year 2000 date', () => {
      const date = new Date(2000, 0, 1, 0, 0, 0, 0);
      const result = dateTimeToDateStamp(date);
      expect(result.days).toBe(8035);
      expect(result.minutes).toBe(0);
      expect(result.ticks).toBe(0);
    });

    it('should handle milliseconds within a second', () => {
      const date = new Date(1978, 0, 1, 0, 0, 0, 500); // 500ms = 25 ticks
      const result = dateTimeToDateStamp(date);
      expect(result.ticks).toBe(25);
    });
  });

  describe('dateStamp round-trip conversion', () => {
    it('should preserve date through round-trip conversion', () => {
      const original = new Date('1995-12-25T14:30:15.000Z');
      const stamp = dateTimeToDateStamp(original);
      const converted = dateStampToDateTime(stamp.days, stamp.minutes, stamp.ticks);

      expect(converted.toISOString()).toBe(original.toISOString());
    });

    it('should preserve Amiga epoch through round-trip', () => {
      const original = dateStampToDateTime(0, 0, 0);
      const stamp = dateTimeToDateStamp(original);
      const converted = dateStampToDateTime(stamp.days, stamp.minutes, stamp.ticks);

      expect(converted.toISOString()).toBe(original.toISOString());
    });

    it('should preserve complex timestamp through round-trip', () => {
      const original = dateStampToDateTime(5000, 890, 1234);
      const stamp = dateTimeToDateStamp(original);
      const converted = dateStampToDateTime(stamp.days, stamp.minutes, stamp.ticks);

      expect(converted.toISOString()).toBe(original.toISOString());
    });
  });

  describe('formatDuration', () => {
    it('should format zero seconds', () => {
      const result = formatDuration(0);
      expect(result).toBe('00:00:00');
    });

    it('should format seconds only', () => {
      const result = formatDuration(45);
      expect(result).toBe('00:00:45');
    });

    it('should format minutes and seconds', () => {
      const result = formatDuration(125); // 2 minutes 5 seconds
      expect(result).toBe('00:02:05');
    });

    it('should format hours, minutes, and seconds', () => {
      const result = formatDuration(3665); // 1 hour 1 minute 5 seconds
      expect(result).toBe('01:01:05');
    });

    it('should format exactly 1 hour', () => {
      const result = formatDuration(3600);
      expect(result).toBe('01:00:00');
    });

    it('should format exactly 1 minute', () => {
      const result = formatDuration(60);
      expect(result).toBe('00:01:00');
    });

    it('should format multi-digit hours', () => {
      const result = formatDuration(36000); // 10 hours
      expect(result).toBe('10:00:00');
    });

    it('should format maximum values (99:59:59)', () => {
      const result = formatDuration(359999); // 99 hours 59 minutes 59 seconds
      expect(result).toBe('99:59:59');
    });

    it('should handle fractional seconds by flooring', () => {
      const result = formatDuration(90.7);
      expect(result).toBe('00:01:30');
    });
  });

  describe('formatShortDate', () => {
    it('should format date as DD/MM/YYYY', () => {
      const date = new Date('2026-01-07T14:30:00Z');
      const result = formatShortDate(date);
      expect(result).toBe('07/01/2026');
    });

    it('should format single-digit days with leading zero', () => {
      const date = new Date('2026-03-05T12:00:00Z');
      const result = formatShortDate(date);
      expect(result).toBe('05/03/2026');
    });

    it('should format single-digit months with leading zero', () => {
      const date = new Date('2026-01-15T12:00:00Z');
      const result = formatShortDate(date);
      expect(result).toBe('15/01/2026');
    });

    it('should format double-digit days and months', () => {
      const date = new Date('2026-12-25T12:00:00Z');
      const result = formatShortDate(date);
      expect(result).toBe('25/12/2026');
    });

    it('should format leap year date', () => {
      const date = new Date('2024-02-29T12:00:00Z');
      const result = formatShortDate(date);
      expect(result).toBe('29/02/2024');
    });
  });

  describe('formatShortTime', () => {
    it('should format time as HH:MM without seconds', () => {
      const date = new Date(2026, 0, 7, 14, 32, 15); // Local time
      const result = formatShortTime(date);
      expect(result).toBe('14:32');
    });

    it('should format midnight correctly', () => {
      const date = new Date(2026, 0, 7, 0, 0, 0); // Local time
      const result = formatShortTime(date);
      expect(result).toBe('00:00');
    });

    it('should format single-digit hours with leading zero', () => {
      const date = new Date(2026, 0, 7, 9, 5, 3); // Local time
      const result = formatShortTime(date);
      expect(result).toBe('09:05');
    });

    it('should format end of day correctly', () => {
      const date = new Date(2026, 0, 7, 23, 59, 59); // Local time
      const result = formatShortTime(date);
      expect(result).toBe('23:59');
    });

    it('should ignore seconds in output', () => {
      const date = new Date(2026, 0, 7, 12, 34, 56); // Local time
      const result = formatShortTime(date);
      expect(result).toBe('12:34');
    });
  });
});

/**
 * The door's clock is the board's clock, summer and winter.
 * QuickNew printed "Time : 19:48:21" at 21:48 CEST (the telnet regression
 * suite, 2026-09-27): DateStamp counted UTC. Written as properties of the
 * process's own zone, because jest cannot change TZ inside a test; the
 * board's zone itself is pinned by tests/deploy/the-board-keeps-local-time.
 */
describe('a DateStamp counts the local wall clock', () => {
  it('holds the local hour and minute, in summer and in winter', () => {
    for (const when of [new Date(2026, 8, 27, 15, 4, 0), new Date(2026, 0, 15, 14, 4, 0)]) {
      const stamp = dateTimeToDateStamp(when);
      expect(stamp.minutes).toBe(when.getHours() * 60 + when.getMinutes());
    }
  });

  it('turns over the day at local midnight', () => {
    const before = dateTimeToDateStamp(new Date(2026, 8, 27, 23, 30, 0));
    const after = dateTimeToDateStamp(new Date(2026, 8, 28, 0, 30, 0));
    expect(after.days).toBe(before.days + 1);
    expect(after.minutes).toBe(30);
  });

  it('comes back as the same instant', () => {
    const now = new Date('2026-09-27T13:04:08.120Z');
    const s = dateTimeToDateStamp(now);
    expect(dateStampToDateTime(s.days, s.minutes, s.ticks).getTime()).toBe(now.getTime());
  });
});
