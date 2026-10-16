/**
 * A RESTORED WEB CALLER IS WRITTEN TO ON HIS NEW SOCKET.
 *
 * Every web session carries `webLink`, the link over the socket it lives on
 * (server/web-connection.ts), and the session-emitter registry answers that
 * link ahead of `session.socketId`. When a browser drops and comes back on a
 * new socket within the grace, `restore-session` (server/auth-socket-handlers.ts)
 * moves the old session onto the new socket. If it moves `socketId` but not
 * `webLink`, the session keeps pointing at the link that ended with the old
 * socket: every registry write to the caller goes nowhere and his room joins
 * land on the dead socket. The invariant is that `socketId` and `webLink`
 * move together.
 *
 * Both rows drive the browser caller's real entry point, acceptWebConnection,
 * with stand-in raw sockets; the password exchange is stood in for (the
 * session is put where the post-auth pipeline leaves a caller).
 */
import 'reflect-metadata';
import { EventEmitter } from 'events';

jest.mock('../../src/index', () => {
  const states = require('../../src/constants/bbs-states');
  return {
    BBSState: states.BBSState,
    LoggedOnSubState: states.LoggedOnSubState,
    LOCALHOST_IPS: [],
  };
});
jest.mock('../../src/amiga-emulation/loader/LibraryLoader', () => ({ LibraryLoader: jest.fn() }));
jest.mock('../../src/amiga-emulation/AmigaDoorSession', () => ({ AmigaDoorSession: jest.fn() }));
jest.mock('../../src/services/DoorDropFileManager');
jest.mock('../../src/services/CallersLogManager');
jest.mock('../../src/doors/amigaDoorManager', () => ({
  getAmigaDoorManager: () => ({ scanInstalledDoors: async () => [] }),
}));
// The restore takes the caller from its token (auth-socket-handlers), the way
// tests/server/door-survives-reconnect.test.ts stands the account in.
jest.mock('../../src/database', () => {
  const actual = jest.requireActual('../../src/database');
  return {
    ...actual,
    db: new Proxy(actual.db as object, {
      get(target: Record<string | symbol, unknown>, prop: string | symbol) {
        if (prop === 'verifyAccessToken') return async (token: string) => ({ userId: token });
        if (prop === 'getUserById') return async (id: string) => ({ id: Number(id), username: `CALLER${id}`, baud: 0 });
        return target[prop];
      },
    }),
  };
});

import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';
import { acceptWebConnection } from '../../src/server/web-connection';
import { getSession, sessions, userSessions, socketToUser } from '../../src/server/session-manager';
import { emitterForSession, socketIoSocketFor } from '../../src/server/session-emitter-registry';
import type { BBSSession } from '../../src/index';

type Raw = EventEmitter & Record<string, unknown>;

function rawSocket(id: string) {
  const sent: Array<[string, unknown[]]> = [];
  const raw = new EventEmitter() as Raw;
  Object.assign(raw, {
    id, connected: true, rooms: new Set<string>(),
    handshake: { address: '127.0.0.1', headers: {}, auth: {} },
    nsp: { sockets: new Map() },
    join: () => undefined, leave: () => undefined, disconnect: jest.fn(),
    onAny: () => undefined, offAny: () => undefined,
    onAnyOutgoing: () => undefined, offAnyOutgoing: () => undefined,
  });
  raw.emit = (event: string | symbol, ...args: unknown[]) => { sent.push([String(event), args]); return true; };
  /** What the client sends: a socket.io event INTO the server's listeners. */
  const receive = (event: string, ...args: unknown[]) => EventEmitter.prototype.emit.call(raw, event, ...args);
  return { raw, sent, receive };
}

async function connect(id: string, nodeId: number) {
  const r = rawSocket(id);
  await acceptWebConnection({ sockets: { sockets: new Map() } } as never, r.raw as never, {
    nodeManager: {
      assignSessionToNode: async () => ({ nodeId }),
      releaseSession: async () => undefined,
    } as never,
    chatState: { sessions: [], messages: [] } as never,
  });
  return { ...r, session: getSession(id)! };
}

/** Where the post-auth pipeline leaves a caller: logged on, at the prompt, in userSessions. */
function logOn(session: BBSSession, socketId: string, userId: number): void {
  Object.assign(session, {
    state: BBSState.LOGGEDON, subState: LoggedOnSubState.READ_COMMAND, commandBuffer: '',
    user: { id: userId, username: `CALLER${userId}`, secLevel: 255, securityFlags: 'T'.repeat(200) },
  });
  userSessions.set(String(userId), session);
  socketToUser.set(socketId, String(userId));
}

describe('a dropped web caller', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    sessions.clear();
    userSessions.clear();
    socketToUser.clear();
  });

  it('restored on a new socket is written to on that socket, not on the link that ended', async () => {
    const a = await connect('restore-raw-a', 94);
    logOn(a.session, 'restore-raw-a', 94);
    const existing = a.session;
    expect(existing.webLink?.raw).toBe(a.raw);

    // The browser drops: socket.io fires 'disconnect' on the raw socket.
    a.receive('disconnect', 'transport close');
    expect(existing.webLink?.ended).toBe(true);

    // ...and comes back on a new socket, asking for its session back.
    const b = await connect('restore-raw-b', 95);
    b.receive('restore-session', { token: '94', userId: '94', username: 'CALLER94' });
    for (let waited = 0; getSession('restore-raw-b') !== existing && waited < 5000; waited += 20) {
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(getSession('restore-raw-b')).toBe(existing);
    expect(existing.socketId).toBe('restore-raw-b');

    // The registry answers the new socket: a write reaches raw B, and nothing reaches raw A.
    const emitter = emitterForSession(existing);
    expect(emitter).not.toBeNull();
    emitter!.emit('restore-probe', 'AFTER-RESTORE');
    expect(b.sent.some(([e, args]) => e === 'restore-probe' && args[0] === 'AFTER-RESTORE')).toBe(true);
    expect(a.sent.some(([e]) => e === 'restore-probe')).toBe(false);
    // Room operations land on the new raw socket.
    expect(socketIoSocketFor(existing)).toBe(b.raw);

    // The old socket's grace passes and sees the session rebound: the caller stays on.
    await new Promise((r) => setTimeout(r, 3200));
    expect(userSessions.get('94')).toBe(existing);
    expect(getSession('restore-raw-b')).toBe(existing);
  }, 20000);

  it('not restored, is torn down after the grace', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const c = await connect('drop-raw-c', 96);
    logOn(c.session, 'drop-raw-c', 96);

    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    c.receive('disconnect', 'transport close');
    // The 3 s reconnect wait, then the logoff grace.
    await jest.advanceTimersByTimeAsync(3100);
    expect(userSessions.get('96')).toBe(c.session);
    await jest.advanceTimersByTimeAsync(16000);
    jest.useRealTimers();
    for (let waited = 0; userSessions.has('96') && waited < 3000; waited += 20) {
      await new Promise((r) => setTimeout(r, 20));
    }

    expect(userSessions.has('96')).toBe(false);
    expect(socketToUser.has('drop-raw-c')).toBe(false);
    expect(getSession('drop-raw-c')).toBeUndefined();
  }, 30000);
});
