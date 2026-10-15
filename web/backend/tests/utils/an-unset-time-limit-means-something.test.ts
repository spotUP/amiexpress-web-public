/**
 * A stored time limit of -1 used to mean nothing at all.
 *
 * Sysop, 2026-09-15: "all users seem to have unlimited time hardcoded" and
 * then "fix the -1 properly". Measured on the live board: every account
 * carried `timelimit = -1` and `chatlimit = -1`, a sentinel from an old
 * "negative means unlimited" convention that nothing honours any more - and
 * `updateTimeUsed` quietly coerced anything <= 0 to one hour. So the stored
 * number said one thing and the board did another, and the only way to learn
 * which was to sit there for an hour.
 *
 * The citation the coercion carried was wrong too, which is why it read as
 * deliberate: express.e:7660/7684/7740 set the GLOBAL timeLimit to 3600 for a
 * LOCAL CONSOLE logon. They are not a default for a user record, and express.e
 * has no such coercion anywhere.
 *
 * These pin the rule now that it has a name. They do NOT assert that one hour
 * is right - that is the sysop's to set per account - only that an unset
 * limit resolves to one known number instead of arithmetic on a sentinel.
 */
jest.mock('../../src/handlers/screen.handler', () => ({
  displayScreen: jest.fn().mockResolvedValue(false),
}));

import {
  updateTimeUsed,
  DEFAULT_DAILY_TIME_LIMIT_SECONDS,
} from '../../src/utils/time-tracking.util';
import { BBSSession } from '../../src/index';

const socket = { emit: jest.fn() } as any;

function sessionWith(userOver: Partial<any>): BBSSession {
  return {
    user: {
      username: 'tester', secLevel: 5,
      timeLimit: 0, timeTotal: 0, timeUsed: 0, chatLimit: 0, chatUsed: 0,
      ...userOver,
    },
    logonTime: 0,
    lastTimeUpdate: 0,
  } as any;
}

describe('a time limit nobody set', () => {
  const realNow = Date.now;
  afterEach(() => { Date.now = realNow; });

  it('is one known number, not a sentinel left to arithmetic', () => {
    // -1 is what every account on the live board actually carried.
    const session = sessionWith({ timeLimit: -1 });
    Date.now = jest.fn(() => 1640000000000);

    updateTimeUsed(socket, session);

    expect(session.user!.timeLimit).toBe(DEFAULT_DAILY_TIME_LIMIT_SECONDS);
  });

  it('treats zero the same way, because zero is also nobody setting one', () => {
    const session = sessionWith({ timeLimit: 0 });
    Date.now = jest.fn(() => 1640000000000);

    updateTimeUsed(socket, session);

    expect(session.user!.timeLimit).toBe(DEFAULT_DAILY_TIME_LIMIT_SECONDS);
  });

  it('LEAVES A REAL LIMIT ALONE - the whole point of fixing the data', () => {
    // A sysop who types 600 in the admin must get ten minutes, not an hour.
    const session = sessionWith({ timeLimit: 600 });
    Date.now = jest.fn(() => 1640000000000);

    updateTimeUsed(socket, session);

    expect(session.user!.timeLimit).toBe(600);
  });

  it('gives the session its budget from that limit', () => {
    const session = sessionWith({ timeLimit: 600, timeTotal: 0 });
    Date.now = jest.fn(() => 1640000000000);

    updateTimeUsed(socket, session);

    expect(session.user!.timeTotal).toBe(600);
  });
});
