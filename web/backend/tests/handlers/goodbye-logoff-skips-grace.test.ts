/**
 * The ghost-logoff wiring (ghostlogoff 2026-09-10), driven through the real
 * modules.
 *
 * A caller who said G and logged straight back in was refused as "already on
 * another node": his own session was still waiting out the disconnect grace.
 * The grace timers are gone (session-persistence S7: one mechanism, parking).
 * Two pieces, each asserted where it runs:
 *
 * 1. G (the real handleGoodbyeCommand) marks session.cleanLogoff on the
 *    normal logout - and not on relogon, where the same socket keeps living.
 *    That flag is what makes a G drop end at once instead of parking:
 *    tests/server/a-parked-session-ends-for-good.test.ts ("G (cleanLogoff)").
 * 2. The real runPostAuthLogin (the mock set of
 *    tests/server/login-refuses-deleted-and-double-login.test.ts) ends the
 *    caller's own PARKED session (session-parking.ts) BEFORE the already-on
 *    check reads the board.
 *
 * The same-socket re-auth skip is in
 * tests/server/login-refuses-deleted-and-double-login.test.ts ("replaces
 * instead of refusing when the socket never let them go").
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/index', () => ({}));

// G's LOGOFF sys-commands run doors; not what is under test.
jest.mock('../../src/handlers/command-execution.handler', () => ({
  runSysCommand: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/server/logoff', () => ({
  ...jest.requireActual('../../src/server/logoff'),
  beginLogoff: jest.fn(),
}));

// Records whether a PARKED session of the account was still on the board at
// the moment the already-on check ran (the fresh login's own session is on
// the board too, holding the same account).
const mockGhostPendingWhenChecked: boolean[] = [];
jest.mock('../../src/services/user-already-online', () => ({
  ...jest.requireActual('../../src/services/user-already-online'),
  userAlreadyOnNode: jest.fn(() => {
    const { sessions } = require('../../src/server/session-manager');
    mockGhostPendingWhenChecked.push([...sessions.values()].some((x: any) => x.user?.id === 'u-ghost' && x.detachedAt !== undefined));
    return null;
  }),
}));

jest.mock('../../src/handlers/screen.handler', () => ({
  ...jest.requireActual('../../src/handlers/screen.handler'),
  displayScreen: jest.fn(async () => true),
  doPause: jest.fn(async () => undefined),
}));

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
import { handleGoodbyeCommand, setSystemCommandsDependencies } from '../../src/handlers/commands/system-commands.handler';
import { registerDisconnectHandler } from '../../src/server/socket-handlers';
import {
  setSession, deleteSession, userSessions, socketToUser,
} from '../../src/server/session-manager';

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('G marks a deliberate logoff', () => {
  function sayGoodbye(extra: Record<string, unknown> = {}) {
    jest.useFakeTimers(); // the 2 s force-disconnect timer
    setSystemCommandsDependencies({ displayScreen: async () => true, findSecurityScreen: () => null } as any);
    const socket: any = { emit: jest.fn(), disconnect: jest.fn() };
    const session: any = {
      nodeId: 5, tempData: {}, shortcuts: new Map(),
      user: { username: 'spot', slotNumber: 2 },
      flagManager: { getCount: () => 0, save: jest.fn() },
      ...extra,
    };
    return handleGoodbyeCommand(socket, session, 'Y').then(() => session);
  }

  test('the normal-logout path sets session.cleanLogoff', async () => {
    const session = await sayGoodbye();
    expect(session.state).toBe(BBSState.AWAIT);
    expect(session.cleanLogoff).toBe(true);
  });

  test('the relogon path does not (same socket keeps living)', async () => {
    const session = await sayGoodbye({ relogon: true });
    expect(session.state).toBe(BBSState.LOGON);
    expect(session.cleanLogoff).toBeUndefined();
  });
});

describe('fresh login ends its own parked session first', () => {
  /** A raw socket.io socket, enough for a SessionLink to bind to. */
  function fakeRaw(id: string) {
    const { EventEmitter } = require('events');
    const ee: any = new EventEmitter();
    ee.id = id; ee.connected = true; ee.handshake = { address: '127.0.0.1', headers: {}, auth: {} };
    ee.join = () => {}; ee.leave = () => {}; ee.onAny = () => {}; ee.offAny = () => {};
    ee.onAnyOutgoing = () => {}; ee.offAnyOutgoing = () => {};
    ee.fire = (e: string, ...a: unknown[]) => EventEmitter.prototype.emit.call(ee, e, ...a);
    ee.emit = () => true;
    ee.disconnect = () => { ee.connected = false; ee.fire('disconnect', 'server namespace disconnect'); };
    return ee;
  }

  test('a fresh WEB login ends the parked session for good: node freed, token dead, before the already-on check', async () => {
    // B1 (S6 review): login-post maps the fresh socket to the account
    // (socketToUser) before it ends the parked session, and the disconnect
    // handler's multi-tab shortcut used to see that mapping and keep the
    // parked node for ever. The parked session is built the way production
    // builds it: a real link, the real parking rule, the real disconnect
    // handler, the real socketToUser mapping of its first login.
    const { sessions } = require('../../src/server/session-manager');
    const { createSessionLink } = require('../../src/server/session-link');
    const { installParking, isParked } = require('../../src/server/session-parking');
    const { issueResumeToken, lookupResumeToken } = require('../../src/server/resume-tokens');
    const old = fakeRaw('parked-socket');
    const link = createSessionLink(old);
    const parked: any = {
      nodeId: 4, tempData: {}, state: BBSState.LOGGEDON, connectionType: 'web',
      user: { id: 'u-ghost', username: 'spot' }, webLink: link,
    };
    installParking(link, parked);
    registerDisconnectHandler(link);
    setSession('parked-socket', parked);
    socketToUser.set('parked-socket', 'u-ghost');
    const token = issueResumeToken(parked, 'u-ghost', 4);
    old.connected = false; old.fire('disconnect', 'transport close');
    expect(isParked(parked)).toBe(true);

    const fresh: any = { state: BBSState.LOGON, subState: LoggedOnSubState.READ_COMMAND, connectionType: 'web', nodeId: 5, tempData: {} };
    setSession('fresh-socket', fresh);
    mockGhostPendingWhenChecked.length = 0;
    const { runPostAuthLogin } = require('../../src/services/login-post.service');
    const emitter: any = {
      id: 'fresh-socket',
      emit() { return true; }, on() { return this; }, join() { return this; },
    };
    try {
      await runPostAuthLogin(
        emitter, fresh,
        { id: 'u-ghost', username: 'spot', slotNumber: 7, calls: 0, callsToday: 0, ansi: true },
        { lastLoginBeforeUpdate: new Date(0) },
      );
      expect(link.ended).toBe(true);
      expect(sessions.has('4')).toBe(false);                      // the node is free
      expect(lookupResumeToken(token)).toEqual({ ok: false, reason: 'unknown' });
      expect(socketToUser.get('fresh-socket')).toBe('u-ghost');   // the new login keeps its mapping
      expect(sessions.get('5')).toBe(fresh);
      expect(mockGhostPendingWhenChecked).toEqual([false]);
    } finally {
      sessions.delete('4');
      deleteSession('fresh-socket');
      socketToUser.delete('fresh-socket');
      userSessions.delete('u-ghost');
    }
  });
});
