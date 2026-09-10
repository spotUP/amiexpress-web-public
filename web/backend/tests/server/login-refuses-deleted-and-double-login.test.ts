/**
 * Two gates express has at logon that this port had lost, or never called.
 *
 * 1. DELETED ACCOUNT (express.e:29701-29711). Deleting a user does not remove
 *    the record - the sysop's DELETE sets `slotNumber := 0` (express.e:21365)
 *    and leaves the row - so the account still authenticates. express refuses
 *    it after the credentials are accepted with "That account has been
 *    deleted." and disconnects. This port had the check in the web login
 *    handler's credential arm; that arm was retired and the check went with
 *    it, leaving `auth-socket-handlers.ts` with no mention of slotNumber and
 *    every transport letting deleted accounts in.
 *
 * 2. ALREADY ON ANOTHER NODE (express.e:29715-29727). `checkUserOnLine(1)`
 *    refuses a second simultaneous login by the same account, logging "User
 *    <name> already on another node!" and showing the ONENODE screen.
 *    `userAlreadyOnNode` was written, documented, imported at the top of
 *    login-post.service.ts - and never called, so one account could hold as
 *    many nodes as it could open connections.
 *
 * Both are driven through `runPostAuthLogin`, the one pipeline every
 * transport's successful login runs through, for the reason the neighbouring
 * reservation test gives: a source pin would go green against a file that no
 * longer performs the check.
 */
process.env.SKIP_DB_INIT = '1';

const isReservationMatch = jest.fn(() => true);
jest.mock('../../src/services/node-reservation.service', () => ({
  ...jest.requireActual('../../src/services/node-reservation.service'),
  isReservationMatch,
}));

const beginLogoff = jest.fn();
jest.mock('../../src/server/logoff', () => ({
  ...jest.requireActual('../../src/server/logoff'),
  beginLogoff,
}));

const userAlreadyOnNode = jest.fn(() => null as number | null);
jest.mock('../../src/services/user-already-online', () => ({
  ...jest.requireActual('../../src/services/user-already-online'),
  userAlreadyOnNode,
}));

const displayScreen = jest.fn(async () => true);
jest.mock('../../src/handlers/screen.handler', () => ({
  ...jest.requireActual('../../src/handlers/screen.handler'),
  displayScreen,
  doPause: jest.fn(async () => undefined),
}));

/** Past both gates lies the rest of the login; this says so by throwing. */
jest.mock('../../src/database', () => ({
  db: {
    updateUser: jest.fn(async () => undefined),
    generateAccessToken: jest.fn(async () => 'token'),
    generateRefreshToken: jest.fn(async () => 'refresh'),
    getUserByUsername: jest.fn(async () => null),
  },
  getDatabase: () => ({
    updateUser: jest.fn(async () => undefined),
    getUserByUsername: jest.fn(async () => null),
  }),
}));

import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';

function emitter() {
  const emitted: Array<{ event: string; data: unknown }> = [];
  return {
    emitted,
    id: 'gate-socket',
    emit(event: string, data?: unknown) { emitted.push({ event, data }); return true; },
    on() { return this; },
    join() { return this; },
  } as any;
}

function session(): any {
  return {
    state: BBSState.LOGON,
    subState: LoggedOnSubState.READ_COMMAND,
    connectionType: 'telnet',
    nodeId: 4,
    tempData: {},
  };
}

/** A live account: slots are allocated MAX(slotnumber)+1, so a real one is >= 1. */
const LIVE_USER = {
  id: 'u-1', username: 'spot', slotNumber: 7,
  calls: 0, callsToday: 0, ansi: true,
};

/** A deleted account: express zeroes slotNumber and leaves the record. */
const DELETED_USER = { ...LIVE_USER, id: 'u-2', username: 'ghost', slotNumber: 0 };

function output(socket: ReturnType<typeof emitter>): string {
  return socket.emitted
    .filter((entry: { event: string }) => entry.event === 'ansi-output')
    .map((entry: { data: unknown }) => String(entry.data))
    .join('');
}

beforeEach(() => {
  jest.clearAllMocks();
  isReservationMatch.mockReturnValue(true);
  userAlreadyOnNode.mockReturnValue(null);
  displayScreen.mockResolvedValue(true);
});

describe('a deleted account', () => {
  it('is refused with express\'s own line, and disconnected', async () => {
    const { runPostAuthLogin } = require('../../src/services/login-post.service');
    const socket = emitter();

    const result = await runPostAuthLogin(socket, session(), DELETED_USER, {
      lastLoginBeforeUpdate: new Date(0),
    });

    expect(result).toEqual({ ok: false, terminated: 'deleted-account' });
    expect(output(socket)).toContain('That account has been deleted.');
    expect(beginLogoff).toHaveBeenCalledTimes(1);
  });

  it('lets a live account past that gate', async () => {
    const { runPostAuthLogin } = require('../../src/services/login-post.service');
    const socket = emitter();

    const result = await runPostAuthLogin(socket, session(), LIVE_USER, {
      lastLoginBeforeUpdate: new Date(0),
    });

    expect(result).not.toEqual({ ok: false, terminated: 'deleted-account' });
    expect(output(socket)).not.toContain('That account has been deleted.');
  });
});

describe('the same account logging in twice', () => {
  it('is refused, logged, and shown the ONENODE screen', async () => {
    userAlreadyOnNode.mockReturnValue(2);
    const { runPostAuthLogin } = require('../../src/services/login-post.service');
    const socket = emitter();

    const result = await runPostAuthLogin(socket, session(), LIVE_USER, {
      lastLoginBeforeUpdate: new Date(0),
    });

    expect(result).toEqual({ ok: false, terminated: 'already-on-another-node' });
    expect(userAlreadyOnNode).toHaveBeenCalled();
    expect(displayScreen).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), 'ONENODE', false,
    );
    expect(beginLogoff).toHaveBeenCalledTimes(1);
  });

  it('falls back to a line of its own when the board has no ONENODE screen', async () => {
    // express.e:29719 - `IF displayScreen(SCREEN_ONENODE)=FALSE THEN aePuts(...)`.
    userAlreadyOnNode.mockReturnValue(2);
    displayScreen.mockResolvedValue(false);
    const { runPostAuthLogin } = require('../../src/services/login-post.service');
    const socket = emitter();

    await runPostAuthLogin(socket, session(), LIVE_USER, {
      lastLoginBeforeUpdate: new Date(0),
    });

    expect(output(socket)).toContain('You are already logged into another node!');
  });

  it('does not refuse a caller who is on no other node', async () => {
    const { runPostAuthLogin } = require('../../src/services/login-post.service');
    const socket = emitter();

    const result = await runPostAuthLogin(socket, session(), LIVE_USER, {
      lastLoginBeforeUpdate: new Date(0),
    });

    expect(result).not.toEqual({ ok: false, terminated: 'already-on-another-node' });
    expect(userAlreadyOnNode).toHaveBeenCalled();
  });

  it('replaces instead of refusing when the socket never let them go', async () => {
    // Reload -> restore -> login form -> submit: the restored session
    // still holds the same user, so the already-on check would refuse
    // the caller against themselves (ghostlogoff 2026-09-10).
    userAlreadyOnNode.mockReturnValue(2);
    const { runPostAuthLogin } = require('../../src/services/login-post.service');
    const socket = emitter();
    const s = session();
    (s as any).user = { ...LIVE_USER };

    const result = await runPostAuthLogin(socket, s, LIVE_USER, {
      lastLoginBeforeUpdate: new Date(0),
    });

    expect(userAlreadyOnNode).not.toHaveBeenCalled();
    expect(result).not.toEqual({ ok: false, terminated: 'already-on-another-node' });
  });

  it('asks about the caller by name, excluding the node being joined', async () => {
    const { runPostAuthLogin } = require('../../src/services/login-post.service');

    await runPostAuthLogin(emitter(), session(), LIVE_USER, {
      lastLoginBeforeUpdate: new Date(0),
    });

    expect(userAlreadyOnNode).toHaveBeenCalledWith(expect.any(String), 'spot', 4, expect.any(Function));
  });
});
