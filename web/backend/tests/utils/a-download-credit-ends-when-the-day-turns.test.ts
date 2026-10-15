/**
 * A DOWNLOAD CREDIT ENDS WHEN THE DAY TURNS.
 *
 * express.e:28512-28523 (processLoggedOnUser) sets todaysBytesLimit at every
 * logon: a new day puts it back to dailyBytesLimit, dropping the extra bytes
 * a sysop's Q edit (21537-21544) or an upload (19531) added; the same day
 * keeps the extra but lifts it to the daily limit, and a zero daily limit
 * makes today's zero. The port stored the field (user.data) but never reset
 * it at logon, so yesterday's credit stood for ever.
 *
 * login-post.service.ts applies this to the session's user before the
 * record reaches user.data at logoff.
 */
import { logonTodaysBytesLimit } from '../../src/utils/time-tracking.util';

describe('todaysBytesLimit at logon (express.e:28512-28523)', () => {
  it('drops yesterday\'s extra bytes on the first call of a new day', () => {
    expect(logonTodaysBytesLimit(5_000_000, 1_000_000, true)).toBe(1_000_000);
  });

  it('keeps today\'s extra bytes on a second call the same day', () => {
    expect(logonTodaysBytesLimit(5_000_000, 1_000_000, false)).toBe(5_000_000);
  });

  it('lifts a stale limit below the daily one on the same day', () => {
    expect(logonTodaysBytesLimit(10, 1_000_000, false)).toBe(1_000_000);
  });

  it('makes today\'s limit unlimited (0) when the daily limit is 0', () => {
    expect(logonTodaysBytesLimit(5_000_000, 0, false)).toBe(0);
    expect(logonTodaysBytesLimit(5_000_000, 0, true)).toBe(0);
  });
});
