/**
 * A-3 connect-time bump (express.e:28734-28738 / 29129-29135).
 *
 * When a node carries a reservation and a caller whose name does not match it
 * authenticates to that node, express.e prints "420 Node is currently reserved
 * for another user." and disconnects. `doReserve()` at express.e:29129-29135
 * uses StriCmp, so the comparison is case-insensitive.
 *
 * THIS USED TO BE A GREP over `server/auth-socket-handlers.ts`, because that
 * file was called a heavyweight surface that could not be unit-loaded. Two
 * things changed with TP-9b. The check MOVED - it lived inside the web
 * `login` handler's credential arm, which is retired, and it now sits in
 * `runPostAuthLogin`, the one pipeline every transport's successful login runs
 * through. And a grep would have gone green against a file that no longer
 * performs the check while telnet, SSH and token logins all went unguarded -
 * which is precisely the failure a source pin cannot see.
 *
 * So this drives the pipeline instead. The bump is its FIRST act, before the
 * database is touched, so nothing heavier than the reservation service and the
 * logoff have to exist for the assertion to mean something.
 */
process.env.SKIP_DB_INIT = '1';

const isReservationMatch = jest.fn();
jest.mock('../../src/services/node-reservation.service', () => ({
  ...jest.requireActual('../../src/services/node-reservation.service'),
  isReservationMatch,
}));

const beginLogoff = jest.fn();
jest.mock('../../src/server/logoff', () => ({
  ...jest.requireActual('../../src/server/logoff'),
  beginLogoff,
}));

/** Nothing past the bump may run; if it does, these say so by throwing. */
jest.mock('../../src/database', () => ({
  db: {
    updateUser: jest.fn(async () => {
      throw new Error('the pipeline advanced past a reserved node');
    }),
    generateAccessToken: jest.fn(async () => 'token'),
    generateRefreshToken: jest.fn(async () => 'refresh'),
  },
}));

import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';

function emitter() {
  const emitted: Array<{ event: string; data: unknown }> = [];
  return {
    emitted,
    id: 'reservation-socket',
    emit(event: string, data?: unknown) { emitted.push({ event, data }); return true; },
    on() { return this; },
    join() { return this; },
  } as any;
}

function session(connectionType: 'web' | 'telnet'): any {
  return {
    state: BBSState.LOGON,
    subState: LoggedOnSubState.READ_COMMAND,
    connectionType,
    nodeId: 4,
    tempData: {},
  };
}

const USER = { id: 'u-9', username: 'newcomer', slotNumber: 0, calls: 0, callsToday: 0, ansi: true };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('a caller who does not match the node reservation is bumped, on every transport', () => {
  it.each(['web', 'telnet'] as const)('%s: says 420 and does not log in', async (transport) => {
    isReservationMatch.mockReturnValue(false);
    const { runPostAuthLogin } = require('../../src/services/login-post.service');
    const socket = emitter();
    const s = session(transport);

    const result = await runPostAuthLogin(socket, s, USER, { lastLoginBeforeUpdate: new Date(0) });

    expect(result).toEqual({ ok: false, terminated: 'reserved-node' });
    expect(isReservationMatch).toHaveBeenCalledWith(4, 'newcomer');
    expect(beginLogoff).toHaveBeenCalledTimes(1);
    expect(beginLogoff.mock.calls[0][2]).toEqual({
      message: '\r\n420 Node is currently reserved for another user.\r\n',
    });
    // The bump happens BEFORE the session is marked logged on.
    expect(s.state).toBe(BBSState.LOGON);
  });

  it('a caller who DOES match is not bumped', async () => {
    isReservationMatch.mockReturnValue(true);
    const { runPostAuthLogin } = require('../../src/services/login-post.service');
    const socket = emitter();
    const s = session('telnet');

    // The stubbed `updateUser` throws, which is how this test proves the
    // pipeline went PAST the bump rather than returning at it.
    await expect(
      runPostAuthLogin(socket, s, USER, { lastLoginBeforeUpdate: new Date(0) }),
    ).rejects.toThrow('the pipeline advanced past a reserved node');
    expect(beginLogoff).not.toHaveBeenCalled();
  });

  it('a session with no node number is not asked about a reservation', async () => {
    isReservationMatch.mockReturnValue(false);
    const { runPostAuthLogin } = require('../../src/services/login-post.service');
    const s = session('telnet');
    delete s.nodeId;

    await expect(
      runPostAuthLogin(emitter(), s, USER, { lastLoginBeforeUpdate: new Date(0) }),
    ).rejects.toThrow('the pipeline advanced past a reserved node');
    expect(isReservationMatch).not.toHaveBeenCalled();
    expect(beginLogoff).not.toHaveBeenCalled();
  });
});
