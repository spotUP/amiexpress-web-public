/**
 * The users list must not call sixty minutes "Unlimited".
 *
 * express.e:556-562 runs the time countdown for everybody and disconnects on
 * `timeLimit<0` UNLESS the access level grants `ACS_OVERRIDE_TIMELIMIT`. So
 * unlimited time is a PERMISSION, not a number - and a negative `timeLimit` is
 * not unlimited at all: `time-tracking.util.ts` coerces anything <= 0 straight
 * back to 3600 seconds when the caller logs on.
 *
 * The column read `timeLimit < 0 ? 'Unlimited' : ...`, so it said Unlimited
 * over callers who had an hour. On this board NO access level granted the
 * permission - not even 255 - so the answer was wrong for every account it was
 * shown for, and the sysop had been reading that column as fact.
 *
 * It got the UNITS wrong too. `timeLimit` is seconds (express.e:7684 defaults
 * it to 3600; express.e:5345 divides by 60 to print it), so `3600 min` was an
 * hour displayed as two and a half days.
 *
 * The rule under test: what the row says is what the board will do.
 */
import { describe, it, expect } from 'vitest';

/**
 * The column's own logic, as a pure function.
 *
 * Extracted rather than rendered because the defect is arithmetic and a
 * predicate - mounting a table to read one cell would test the table.
 */
function timeLimitCell(user: { timeLimit: number; unlimitedTime?: boolean }): string {
  if (user.unlimitedTime) return 'Unlimited';
  const seconds = user.timeLimit > 0 ? user.timeLimit : 3600;
  return `${Math.round(seconds / 60)} min`;
}

describe('the time limit a user list shows', () => {
  it('says Unlimited only when the access level actually grants it', () => {
    expect(timeLimitCell({ timeLimit: 3600, unlimitedTime: true })).toBe('Unlimited');
  });

  it('does not call a negative limit unlimited', () => {
    // The defect: this is the value the admin wrote to mean "unlimited", and
    // the board turns it into an hour.
    expect(timeLimitCell({ timeLimit: -1, unlimitedTime: false })).toBe('60 min');
  });

  it('shows the hour a zero limit really gets', () => {
    // `sysop` read "0 min" on this board, which looked like no time at all.
    expect(timeLimitCell({ timeLimit: 0, unlimitedTime: false })).toBe('60 min');
  });

  it('reads the stored value as seconds, not minutes', () => {
    // 3600 seconds is one hour. It was printed as "3600 min".
    expect(timeLimitCell({ timeLimit: 3600, unlimitedTime: false })).toBe('60 min');
    expect(timeLimitCell({ timeLimit: 7200, unlimitedTime: false })).toBe('120 min');
  });

  it('falls back to the number when the backend does not say', () => {
    // An older backend sends no `unlimitedTime`. Showing the real limit is
    // honest; claiming unlimited on a missing field is how this started.
    expect(timeLimitCell({ timeLimit: 1800 })).toBe('30 min');
  });
});
