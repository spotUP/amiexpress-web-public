/**
 * What a new day gives back, and when the day actually turns.
 *
 * express.e:531-542:
 *
 *     currDay:=Div(currTime-21600,86400)
 *     IF (currDay<>logonDay)
 *       loggedOnUser.timeTotal:=loggedOnUser.timeLimit
 *       loggedOnUser.dailyBytesDld:=0
 *       loggedOnUser.timeUsed:=0
 *       loggedOnUser.chatRemain:=loggedOnUser.chatLimit
 *
 * Two things were wrong with ours, both found while fixing the -1 sentinel.
 *
 * THE DOWNLOAD ALLOWANCE WAS NEVER GIVEN BACK. Nothing in the codebase reset
 * `dailyBytesDld` - the only assignments to zero are in the user.data
 * serialisers, which hardcode it on write - so it only ever grew, while
 * file-status.handler.ts:154 computes `bytesAvail = todaysBytesLimit -
 * dailyBytesDld`. A caller who hit their daily limit stayed blocked for ever.
 *
 * AND THE DAY TURNED AT THE WRONG MOMENT. `currTime` is getSystemTime(), the
 * board's local seconds plus 21600, so the day turns at the board's LOCAL
 * midnight. This file used to pin 06:00 UTC - subtracting 21600 from UTC
 * seconds, a misreading corrected 2026-10-04 with the stored-date fix.
 */
process.env.TZ = 'Europe/Stockholm';
jest.mock('../../src/handlers/screen.handler', () => ({
  displayScreen: jest.fn().mockResolvedValue(false),
}));

import { updateTimeUsed, amiExpressDay } from '../../src/utils/time-tracking.util';
import { BBSSession } from '../../src/index';

const socket = { emit: jest.fn() } as any;
const DAY = 86400;

/** Midnight in Stockholm (CEST) starting 2026-09-15, the instant express.e turns that day. */
const DAY_START = Math.floor(Date.UTC(2026, 8, 14, 22, 0, 0) / 1000);

function sessionAt(seconds: number, over: Partial<any> = {}): BBSSession {
  return {
    user: {
      username: 'tester', secLevel: 5,
      timeLimit: 3600, timeTotal: 3600, timeUsed: 1200,
      chatLimit: 600, chatUsed: 300, dailyBytesDld: 5_000_000,
      ...over,
    },
    logonTime: seconds,
    lastTimeUpdate: seconds,
  } as any;
}

function tickAt(session: BBSSession, unixSeconds: number): void {
  Date.now = jest.fn(() => unixSeconds * 1000);
  updateTimeUsed(socket, session);
}

describe('the AmiExpress day', () => {
  const realNow = Date.now;
  afterEach(() => { Date.now = realNow; });

  it('turns at the board\'s local midnight, as express.e:529 counts it', () => {
    expect(amiExpressDay(DAY_START)).toBe(amiExpressDay(DAY_START + 3600));
    expect(amiExpressDay(DAY_START - 1)).toBe(amiExpressDay(DAY_START) - 1);
  });

  it('does NOT turn at 06:00 UTC, which is what we used to compute', () => {
    const sixUtc = Math.floor(Date.UTC(2026, 8, 15, 6, 0, 0) / 1000);
    // 08:00 local on the 15th: the same day that began at local midnight.
    expect(amiExpressDay(sixUtc)).toBe(amiExpressDay(DAY_START));
    expect(amiExpressDay(sixUtc - 1)).toBe(amiExpressDay(DAY_START));
  });
});

describe('crossing into a new day mid-session', () => {
  const realNow = Date.now;
  afterEach(() => { Date.now = realNow; });

  it('gives the DOWNLOAD allowance back - the one nothing reset', () => {
    const session = sessionAt(DAY_START + 3600);
    tickAt(session, DAY_START + 3600 + 60);      // same day, no reset
    expect(session.user!.dailyBytesDld).toBe(5_000_000);

    tickAt(session, DAY_START + DAY + 60);       // next day
    expect(session.user!.dailyBytesDld).toBe(0);
  });

  it('gives the time and chat allowances back with it', () => {
    const session = sessionAt(DAY_START + 3600);
    tickAt(session, DAY_START + DAY + 60);

    expect(session.user!.timeUsed).toBe(0);
    expect(session.user!.chatUsed).toBe(0);
    expect(session.user!.timeTotal).toBe(3600);
  });

  it('LEAVES logonTime ALONE, where express.e moves it to the day start', () => {
    // mci-dispatch renders this to the caller and clean-playpen attributes
    // files by it; 06:00 would be a lie to one and a wider net for the other.
    const loggedOnAt = DAY_START + 3600;
    const session = sessionAt(loggedOnAt);

    tickAt(session, DAY_START + DAY + 60);

    expect(session.logonTime).toBe(loggedOnAt);
  });

  it('does not reset twice for the same day', () => {
    const session = sessionAt(DAY_START + 3600);
    tickAt(session, DAY_START + DAY + 60);
    session.user!.dailyBytesDld = 900;

    tickAt(session, DAY_START + DAY + 120);

    expect(session.user!.dailyBytesDld).toBe(900);
  });
});
