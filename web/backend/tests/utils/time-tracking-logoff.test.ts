/**
 * Regression: time-limit exceeded must DISCONNECT the caller.
 *
 * Bug (2026-09-08): a telnet caller who exhausted their daily time saw the
 * LOGON24 "time exceeded" screen but the socket stayed OPEN forever. The port
 * of express.e:556-568 checkTimeUsed kept the screen + the LOGOFF substate but
 * dropped express.e's modemOffHook() (the carrier drop). Setting a substate is
 * inert — nothing in this port turns subState=LOGOFF into a disconnect — so the
 * line was never dropped.
 *
 * Fix routes the time-exceeded logoff through beginLogoff(), the canonical
 * teardown (server/logoff.ts): sets session.state=LOGGING_OFF and force-closes
 * the transport. This test asserts the OBSERVABLE effect (state transition +
 * socket.disconnect actually fired), not that a particular function was called.
 */

process.env.SKIP_DB_INIT = 'true';

import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';

// Type-only stand-in for '../index' so importing the util under test does not
// boot the emulator/DB (see commandHandlers.test.ts).
jest.mock('../../src/index', () => ({}));

// LOGON24 screen "present" — matches the real report, where the fancy
// time-exceeded ANSI rendered. displayScreen resolving true means the fallback
// text branch is skipped; the disconnect must still happen.
jest.mock('../../src/handlers/screen.handler', () => ({
  displayScreen: jest.fn().mockResolvedValue(true),
}));

// User is NOT a sysop -> time limit is enforced (no OVERRIDE_TIMELIMIT).
jest.mock('../../src/utils/acs.util', () => ({
  checkSecurity: jest.fn().mockReturnValue(false),
}));

import { checkTimeUsed } from '../../src/utils/time-tracking.util';

function makeSocket() {
  return {
    connected: true,
    emit: jest.fn(),
    disconnect: jest.fn(),
  };
}

function makeSession(overrides: any = {}): any {
  return {
    state: BBSState.LOGGEDON,
    subState: LoggedOnSubState.READ_COMMAND,
    user: { id: 1, username: 'N', timeTotal: 3600, timeUsed: 3601 }, // over by 1s
    ...overrides,
  };
}

describe('checkTimeUsed - daily time exceeded drops the line', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });
  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('force-closes the socket AND enters LOGGING_OFF when time is exhausted', async () => {
    const socket = makeSocket();
    const session = makeSession();

    const timeUp = await checkTimeUsed(socket, session);

    expect(timeUp).toBe(true);
    // beginLogoff sets the terminal top-level state synchronously.
    // Before the fix, checkTimeUsed only set the (inert) subState, so state
    // stayed LOGGEDON and this assertion failed.
    expect(session.state).toBe(BBSState.LOGGING_OFF);

    // The disconnect is scheduled behind a read-delay so the screen is visible.
    expect(socket.disconnect).not.toHaveBeenCalled();
    jest.advanceTimersByTime(5000);
    expect(socket.disconnect).toHaveBeenCalled();
  });

  it('does nothing when the caller is still under the limit', async () => {
    const socket = makeSocket();
    const session = makeSession({ user: { id: 1, username: 'N', timeTotal: 3600, timeUsed: 60 } });

    const timeUp = await checkTimeUsed(socket, session);

    expect(timeUp).toBe(false);
    expect(session.state).toBe(BBSState.LOGGEDON);
    jest.advanceTimersByTime(5000);
    expect(socket.disconnect).not.toHaveBeenCalled();
  });
});
