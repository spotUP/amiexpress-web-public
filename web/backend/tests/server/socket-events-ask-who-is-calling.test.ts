/**
 * The socket events ask who is calling (open-surface audit, 2026-10-04).
 *
 * A web caller's socket is registered for every event at CONNECT, and the
 * board makes a session for it there too - so "there is a session" says
 * nothing about who is on the other end. Each case below is one event that
 * acted for a visitor at the login prompt, or on a session the caller did not
 * own, driven through the product's own registration over a real socket.io
 * server and client:
 *
 * - `transfer:start` read (or wrote) any path a visitor named;
 * - `restore-session` handed over a dropped caller's live session to anyone
 *   who sent that caller's id;
 * - the chat events (`room:message` and the rest) ran for a visitor;
 * - `file-upload-ready` told any socket whether a path existed on the server;
 * - `chat:ban` (and the other moderation tools) were open to any chat user;
 * - an operator page's Discord link acted as a sysop on EVERY page;
 * - the chat-only login sent the account's password hash to the browser and
 *   let a deleted or locked account in; `/api/chat/login` minted it a token.
 */
process.env.SKIP_DB_INIT = '1';

// A bare factory, as R3 does: the real command handler's module graph reaches
// index.ts. Nothing here types a command.
jest.mock('../../src/handlers/command.handler', () => ({ handleCommand: jest.fn() }));

// The sentinels: each handler the guard must stand in front of.
jest.mock('../../src/handlers/chat/group-chat.handler', () => ({
  handleRoomMessage: jest.fn(async () => undefined),
}));
jest.mock('../../src/database/moderation-repository', () => {
  const banUser = jest.fn(async () => undefined);
  return { ModerationRepository: jest.fn(() => ({ banUser })), __banUser: banUser };
});
jest.mock('../../src/services/logon-gates', () => ({
  ...jest.requireActual('../../src/services/logon-gates'),
  accountRefusal: jest.fn(() => null),
}));
// The real db is a lazy Proxy jest.spyOn cannot write to (see
// door-survives-reconnect.test.ts); the overrides are read through this one.
const mockDb: Record<string, jest.Mock> = {};
jest.mock('../../src/database', () => {
  const actual = jest.requireActual('../../src/database');
  return {
    ...actual,
    db: new Proxy(actual.db as object, {
      get(target: any, prop: string) {
        return prop in mockDb ? mockDb[prop] : target[prop];
      },
    }),
  };
});
jest.mock('../../src/services/load-account', () => ({
  loadAccount: jest.fn((row: unknown) => ({ user: row, fromDisk: false })),
}));

import * as http from 'http';
import express from 'express';
import request from 'supertest';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { registerSocketHandlers } from '../../src/server/socket-handlers';
import { setSession, sessions, userSessions, socketToNodeId, socketToUser } from '../../src/server/session-manager';
import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';
import { initOperatorChatHandler, stopOperatorChatHandler, operatorMay } from '../../src/handlers/operator-chat.handler';
import { setupChatOnlyLoginHandler } from '../../src/handlers/chat-only-login.handler';
import { createChatRouter } from '../../src/api/chat-routes';

const { handleRoomMessage } = jest.requireMock('../../src/handlers/chat/group-chat.handler') as { handleRoomMessage: jest.Mock };
const { __banUser: banUser } = jest.requireMock('../../src/database/moderation-repository') as { __banUser: jest.Mock };
const { accountRefusal } = jest.requireMock('../../src/services/logon-gates') as { accountRefusal: jest.Mock };

jest.setTimeout(60000);

/** Who the next connecting socket is, as the test names it. */
type Who = { user?: { id: number | string; username: string; secLevel: number }; operatorSession?: Record<string, unknown> };
let nextWho: Who = {};
let nodeSeq = 300;
/** The server-side socket of the last connection. */
let lastServerSocket: Socket | null = null;

const pageRequests: string[] = [];
const fakeOperatorRepo = {
  getPageRequest: (id: string) => { pageRequests.push(id); return null; },
  getPendingPages: () => [],
  updateSysopStatus: () => undefined,
  getPageRequestByToken: () => null,
  getConfig: () => ({}),
};

describe('socket events ask who is calling', () => {
  let server: http.Server;
  let io: SocketIOServer;
  let port: number;
  const tcp = new Set<{ destroy: () => void }>();
  const clients: ClientSocket[] = [];

  beforeAll(async () => {
    server = http.createServer();
    server.on('connection', (s) => { tcp.add(s as never); s.on('close', () => tcp.delete(s as never)); });
    io = new SocketIOServer(server, { cors: { origin: '*' } });
    // index.ts's middleware hangs a JWT's (or a page link's) session on the
    // socket; the operator console reads it from there.
    io.use((socket, next) => {
      if (nextWho.operatorSession) (socket as unknown as { session: unknown }).session = nextWho.operatorSession;
      next();
    });
    io.on('connection', (socket) => {
      lastServerSocket = socket;
      if (nextWho.operatorSession) return;
      setSession(socket.id, {
        state: nextWho.user ? BBSState.LOGGEDON : BBSState.AWAIT,
        subState: nextWho.user ? LoggedOnSubState.READ_COMMAND : undefined,
        nodeId: ++nodeSeq,
        socketId: socket.id,
        connectionType: 'web',
        user: nextWho.user,
        tempData: {},
      } as never);
      registerSocketHandlers(io, socket);
    });
    initOperatorChatHandler(io, fakeOperatorRepo as never);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as { port: number }).port;
  });

  afterAll(async () => {
    for (const c of clients) c.close();
    stopOperatorChatHandler();
    io.close();
    for (const s of tcp) { try { s.destroy(); } catch { /* gone */ } }
    (server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
    await new Promise<void>((resolve) => { const t = setTimeout(resolve, 2000); server.close(() => { clearTimeout(t); resolve(); }); });
  });

  afterEach(() => {
    for (const k of Object.keys(mockDb)) delete mockDb[k];
    handleRoomMessage.mockClear();
    banUser.mockClear();
    accountRefusal.mockReset().mockImplementation(() => null);
    pageRequests.length = 0;
  });

  /** A connected client, as `who`, once its (dynamically imported) handlers are registered. */
  async function connect(who: Who): Promise<ClientSocket> {
    nextWho = who;
    const client = ioClient(`http://127.0.0.1:${port}`, { transports: ['websocket'], forceNew: true, reconnection: false });
    clients.push(client);
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('never connected')), 15000);
      client.on('connect', () => { clearTimeout(t); resolve(); });
      client.on('connect_error', (e) => { clearTimeout(t); reject(e); });
    });
    // registerSocketHandlers loads its modules with import(); let them land.
    await new Promise((r) => setTimeout(r, 400));
    return client;
  }

  /** Every event the client receives in the next `ms`. */
  async function collect(client: ClientSocket, ms: number, act: () => void): Promise<Array<{ event: string; args: unknown[] }>> {
    const got: Array<{ event: string; args: unknown[] }> = [];
    const listener = (event: string, ...args: unknown[]) => got.push({ event, args });
    client.onAny(listener);
    act();
    await new Promise((r) => setTimeout(r, ms));
    client.offAny(listener);
    return got;
  }

  it('does not read a file a visitor names with transfer:start', async () => {
    const visitor = await connect({});
    const answer = await new Promise<unknown>((resolve) => {
      visitor.timeout(1500).emit('transfer:start', { direction: 'download', path: '/etc/hosts' },
        (err: unknown, resp: unknown) => resolve(err ? 'no answer' : resp));
    });
    expect(answer).toBe('no answer');
  });

  it("does not hand a visitor a dropped caller's session for naming its user id", async () => {
    // The victim's session: logged on, its socket gone (a phone that locked,
    // a telnet caller - whose socket is never in this namespace).
    const victim = { nodeId: 290, socketId: 'gone-socket', user: { id: 7, username: 'victim' }, state: BBSState.LOGGEDON } as never;
    sessions.set('290', victim);
    userSessions.set('7', victim);
    mockDb.getUserById = jest.fn(async () => ({ id: 7, username: 'victim', baud: 0 }));
    try {
      const visitor = await connect({});
      const got = await collect(visitor, 1200, () =>
        visitor.emit('restore-session', { userId: '7', username: 'victim', savedAt: Date.now() }));
      expect(got.map((g) => g.event)).not.toContain('session-restored');
      expect(got.map((g) => g.event)).toContain('session-restore-failed');
      expect(socketToNodeId.get(visitor.id ?? '')).not.toBe(290);
    } finally {
      sessions.delete('290');
      userSessions.delete('7');
    }
  });

  it('still restores the session of a browser whose token says it is that caller', async () => {
    const own = { nodeId: 291, socketId: 'gone-socket-2', user: { id: 8, username: 'owner' }, state: BBSState.LOGGEDON } as never;
    sessions.set('291', own);
    userSessions.set('8', own);
    mockDb.getUserById = jest.fn(async () => ({ id: 8, username: 'owner', baud: 0 }));
    const verify = mockDb.verifyAccessToken = jest.fn(async () => ({ userId: '8', username: 'owner', secLevel: 20 }));
    try {
      const caller = await connect({});
      const got = await collect(caller, 1500, () =>
        caller.emit('restore-session', { token: 'the-tabs-token', userId: '999', username: 'owner', savedAt: Date.now() }));
      expect(verify).toHaveBeenCalledWith('the-tabs-token');
      expect(got.map((g) => g.event)).toContain('session-restored');
    } finally {
      sessions.delete('291');
      userSessions.delete('8');
      socketToUser.clear();
    }
  });

  it('does not run a chat event for a visitor, and does for a logged-on caller', async () => {
    const visitor = await connect({});
    await collect(visitor, 300, () => visitor.emit('room:message', { message: 'from nobody' }));
    expect(handleRoomMessage).not.toHaveBeenCalled();

    const caller = await connect({ user: { id: 31, username: 'Caller', secLevel: 20 } });
    await collect(caller, 300, () => caller.emit('room:message', { message: 'hello' }));
    expect(handleRoomMessage).toHaveBeenCalledTimes(1);
  });

  it('does not tell any socket whether a path exists on the server', async () => {
    const visitor = await connect({});
    const got = await collect(visitor, 400, () =>
      visitor.emit('file-upload-ready', { filename: 'x', size: 1, path: '/no/such/dir/secret.key' }));
    const said = got.filter((g) => g.event === 'ansi-output').map((g) => String(g.args[0])).join('');
    expect(said).not.toContain('/no/such/dir/secret.key');
  });

  it("keeps the moderation tools the sysop's", async () => {
    const user = await connect({ user: { id: 32, username: 'Someone', secLevel: 20 } });
    await collect(user, 300, () => user.emit('chat:ban', { roomId: 'r1', targetUserId: '33' }));
    expect(banUser).not.toHaveBeenCalled();

    const sysop = await connect({ user: { id: 1, username: 'Sysop', secLevel: 255 } });
    await collect(sysop, 300, () => sysop.emit('chat:ban', { roomId: 'r1', targetUserId: '33' }));
    expect(banUser).toHaveBeenCalledTimes(1);
  });

  it("lets a page's Discord link act on that page and no other", async () => {
    const link = await connect({ operatorSession: { user: { id: 'operator-page-p1', username: 'Operator (Discord)', secLevel: 100 }, nodeId: 0, pageId: 'p1' } });
    const got = await collect(link, 400, () => link.emit('operator:accept-page', { pageId: 'p2' }));
    expect(pageRequests).not.toContain('p2');
    expect(got.map((g) => g.event)).toContain('operator:error');

    await collect(link, 300, () => link.emit('operator:accept-page', { pageId: 'p1' }));
    expect(pageRequests).toContain('p1');
  });

  it('lets only a sysop type into an operator chat', () => {
    // operator:typing and operator:keystroke asked nobody; they ask this now.
    expect(operatorMay(undefined, 'p1')).toBe(false);
    expect(operatorMay({ user: { secLevel: 20 } }, 'p1')).toBe(false);
    expect(operatorMay({ user: { secLevel: 100 } }, 'p1')).toBe(true);
    expect(operatorMay({ user: { secLevel: 100 }, pageId: 'p1' }, 'p2')).toBe(false);
  });

  it("never sends the chat-only login the account's password hash, and refuses what the logon refuses", async () => {
    const row = { id: 40, username: 'Chatter', secLevel: 20, slotNumber: 4, passwordHash: '$2b$10$secret' };
    mockDb.getUserByUsername = jest.fn(async () => row);
    mockDb.verifyPassword = jest.fn(async () => true);

    const client = await connect({});
    const session: Record<string, unknown> = {};
    setupChatOnlyLoginHandler(lastServerSocket as Socket, session);
    const got = await collect(client, 400, () => client.emit('chat-only-login-submit', { username: 'Chatter', password: 'pw' }));
    const successes = got.filter((g) => g.event === 'chat-only-login-success');
    expect(successes).toHaveLength(1);
    expect(JSON.stringify(successes)).not.toContain('secret');

    accountRefusal.mockImplementation(() => 'deleted-account');
    const client2 = await connect({});
    const session2: Record<string, unknown> = {};
    setupChatOnlyLoginHandler(lastServerSocket as Socket, session2);
    const got2 = await collect(client2, 400, () => client2.emit('chat-only-login-submit', { username: 'Chatter', password: 'pw' }));
    expect(got2.map((g) => g.event)).not.toContain('chat-only-login-success');
    expect(session2.user).toBeUndefined();
  });

  it('does not mint a chat token for an account the logon refuses', async () => {
    const database = { authenticateUser: jest.fn(async () => ({ id: 41, username: 'Gone', secLevel: 20, slotNumber: 0 })) };
    const app = express();
    app.use(express.json());
    app.use('/api/chat', createChatRouter(database as never));

    accountRefusal.mockImplementation(() => 'deleted-account');
    const refused = await request(app).post('/api/chat/login').send({ username: 'Gone', password: 'pw' });
    expect(refused.status).toBe(403);
    expect(JSON.stringify(refused.body)).not.toMatch(/token"\s*:\s*"/);

    accountRefusal.mockImplementation(() => null);
    const allowed = await request(app).post('/api/chat/login').send({ username: 'Gone', password: 'pw' });
    expect(allowed.status).toBe(200);
  });
});
