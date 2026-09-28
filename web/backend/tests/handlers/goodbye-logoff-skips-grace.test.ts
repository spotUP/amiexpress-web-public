/**
 * The ghost-logoff wiring (ghostlogoff 2026-09-10), driven through the real
 * modules.
 *
 * A caller who said G and logged straight back in was refused as "already on
 * another node": his own session was still waiting out the disconnect grace.
 * Three pieces, each asserted where it runs:
 *
 * 1. G (the real handleGoodbyeCommand) marks session.cleanLogoff on the
 *    normal logout - and not on relogon, where the same socket keeps living.
 * 2. The real disconnect handler (registerDisconnectHandler, the technique of
 *    tests/petscii/render-ctx-disposal.test.ts) honours the flag at BOTH
 *    grace periods: no 3 s reconnect wait, and no 15 s pending logoff.
 * 3. The real runPostAuthLogin (the mock set of
 *    tests/server/login-refuses-deleted-and-double-login.test.ts) reclaims the
 *    caller's own grace ghost BEFORE the already-on check reads the board.
 *
 * The semantics of wantsImmediateTeardown / reclaimGraceGhost are in
 * tests/server/disconnect-grace.test.ts; the same-socket re-auth skip is in
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

// Records what the board looked like at the moment the already-on check ran.
const mockGhostPendingWhenChecked: boolean[] = [];
jest.mock('../../src/services/user-already-online', () => ({
  ...jest.requireActual('../../src/services/user-already-online'),
  userAlreadyOnNode: jest.fn(() => {
    const { pendingDisconnects } = require('../../src/server/session-manager');
    mockGhostPendingWhenChecked.push(pendingDisconnects.has('u-ghost'));
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
  setSession, deleteSession, pendingDisconnects, clearPendingDisconnect,
  trackPendingDisconnect, userSessions, socketToUser,
} from '../../src/server/session-manager';
import { registerConnectionEmitter } from '../../src/server/session-emitter-registry';

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

describe('disconnects honor the flag at both grace periods', () => {
  function makeSocket(id: string) {
    const handlers = new Map<string, (...args: any[]) => any>();
    const socket: any = {
      id, handshake: { address: '127.0.0.1' }, connected: true,
      emit: () => true, join: () => {}, leave: () => {}, disconnect: () => {}, onAny: () => {},
      once: (e: string, h: any) => { handlers.set(e, h); return socket; },
      on: (e: string, h: any) => { handlers.set(e, h); return socket; },
      removeAllListeners: () => socket, removeListener: () => socket, listenerCount: () => 0,
    };
    return { socket, handlers };
  }

  test('a G caller\'s socket closing waits out neither grace period', async () => {
    const socketId = `clean-g-${Date.now()}`;
    const session: any = {
      nodeId: 93, tempData: {}, currentConfName: 'Main',
      user: { id: 'u-clean', username: 'spot' },
      cleanLogoff: true,
    };
    setSession(socketId, session);
    // The same account is live on another connection, so the final cleanup
    // stops after its "still on the board" check: the teardown under test is
    // the grace decision, not the logoff paperwork.
    const elsewhere: any = { nodeId: 94, user: { id: 'u-clean' } };
    registerConnectionEmitter(elsewhere, { emit: () => true } as any);
    userSessions.set('u-clean', elsewhere);

    const { socket, handlers } = makeSocket(socketId);
    registerDisconnectHandler(socket);
    const started = Date.now();
    try {
      await handlers.get('disconnect')!('transport close');
      // 3 s reconnect wait skipped.
      expect(Date.now() - started).toBeLessThan(2500);
      // 15 s disconnect grace skipped: no pending logoff was scheduled.
      expect(pendingDisconnects.has('u-clean')).toBe(false);
    } finally {
      clearPendingDisconnect('u-clean');
      userSessions.delete('u-clean');
      socketToUser.delete(socketId);
      deleteSession(socketId);
    }
  }, 10000);
});

describe('fresh login reclaims its own grace-ghost first', () => {
  test('the ghost is gone by the time the already-on check reads the board', async () => {
    // A web caller dropped; his logoff is pending on a socket that no longer
    // exists (the emitter below has no namespace, so nothing is alive).
    const timer = setTimeout(() => {}, 60000);
    trackPendingDisconnect('u-ghost', 'dead-socket', 4, timer);
    mockGhostPendingWhenChecked.length = 0;
    const { runPostAuthLogin } = require('../../src/services/login-post.service');
    const emitter: any = {
      id: 'fresh-socket',
      emit() { return true; }, on() { return this; }, join() { return this; },
    };
    try {
      await runPostAuthLogin(
        emitter,
        { state: BBSState.LOGON, subState: LoggedOnSubState.READ_COMMAND, connectionType: 'telnet', nodeId: 4, tempData: {} },
        { id: 'u-ghost', username: 'spot', slotNumber: 7, calls: 0, callsToday: 0, ansi: true },
        { lastLoginBeforeUpdate: new Date(0) },
      );
      expect(mockGhostPendingWhenChecked).toEqual([false]);
    } finally {
      clearPendingDisconnect('u-ghost');
    }
  });
});
