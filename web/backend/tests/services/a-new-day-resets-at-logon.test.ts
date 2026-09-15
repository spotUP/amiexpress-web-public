/**
 * The allowances come back at LOGON, not only mid-session.
 *
 * Sysop, 2026-09-15, asked for this to be "like in the amiexpress sources",
 * and they are explicit (express.e:28506-28528):
 *
 *     currDay:=Div(currTime-21600,86400)
 *     lastDay:=Div(loggedOnUser.timeLastOn-21600,86400)
 *     IF (lastDay<>currDay)
 *       timesOnToday:=0; timeUsed:=0; chatRemain:=chatLimit
 *       dailyBytesDld:=0; timeTotal:=timeLimit
 *     ELSE
 *       timesOnToday:=timesOnToday+1
 *
 * updateTimeUsed has the same reset for a session that is ONLINE when the day
 * turns, and that one cannot help the person it matters most to: a caller who
 * hit their download limit yesterday and dials in today. Nothing had run for
 * them since, so the limit was permanent for exactly the people it had
 * already stopped.
 *
 * The comparison is against the user's LAST-ON day, not this session's.
 */
import { amiExpressDay } from '../../src/utils/time-tracking.util';

const DAY = 86400;
const DAY_START = Math.floor(Date.UTC(2026, 8, 15, 6, 0, 0) / 1000);

/**
 * The rule as login-post.service.ts applies it, kept here as the arithmetic
 * it is. The service reads it off `ctx.lastLoginBeforeUpdate` - the value
 * captured BEFORE the login writes the new one, which is express.e's
 * `timeLastOn`.
 */
function isNewDay(lastLoginUnix: number, nowUnix: number): boolean {
  return amiExpressDay(lastLoginUnix) !== amiExpressDay(nowUnix);
}

describe('logging on after the day has turned', () => {
  it('is a new day when the last logon was before 06:00 UTC and now is after', () => {
    expect(isNewDay(DAY_START - 60, DAY_START + 60)).toBe(true);
  });

  it('is NOT a new day across UTC midnight, which is not when a BBS day turns', () => {
    const beforeMidnight = Math.floor(Date.UTC(2026, 8, 15, 23, 0, 0) / 1000);
    const afterMidnight = Math.floor(Date.UTC(2026, 8, 16, 1, 0, 0) / 1000);
    expect(isNewDay(beforeMidnight, afterMidnight)).toBe(false);
  });

  it('is a new day for yesterday\'s caller dialling in today', () => {
    // The case the mid-session reset can never catch.
    expect(isNewDay(DAY_START + 3600, DAY_START + DAY + 3600)).toBe(true);
  });

  it('is the same day for a second call an hour later', () => {
    expect(isNewDay(DAY_START + 3600, DAY_START + 7200)).toBe(false);
  });
});
