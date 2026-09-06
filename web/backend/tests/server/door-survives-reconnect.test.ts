/**
 * A phone that locks its screen must not lose its door's controls.
 *
 * The session survives a reconnect - `socket-handlers.ts` holds a 3 s grace
 * period before cleanup, and `restore-session` swaps the live session in
 * behind the new socket - so a client door goes on running across the gap.
 * The BROWSER does not know that: it clears its active door on every connect
 * ("CRITICAL: Reset game mode on new connection"), and `door:load-client`
 * never comes again because the bundle is already loaded. The player is left
 * on the generic BBS keyboard, with no pad and no gestures, for the rest of
 * the door: "i cant swipe in gmaster ... and it shows the normal osd
 * keyboard" (2026-09-06).
 *
 * So the restore re-announces which client door is running. Driven through
 * the real `restore-session` handler, not a spy on the emit helper - the
 * failure was a MISSING emit, and a test that calls the announcement itself
 * would pass on the broken build.
 *
 * `src/index.ts` starts the HTTP/telnet/SSH servers on module load, so it is
 * mocked away; `db.getUserById` is wrapped because the real one is a lazy
 * Proxy that `jest.spyOn` cannot write to. Same shape as
 * `tests/server/petscii-model-choke.test.ts`.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/index', () => ({}));

const mockGetUserById = jest.fn();
jest.mock('../../src/database', () => {
  const actual = jest.requireActual('../../src/database');
  return {
    ...actual,
    db: new Proxy(actual.db as object, {
      get(target: any, prop: string | symbol) {
        if (prop === 'getUserById') return mockGetUserById;
        return target[prop];
      },
    }),
  };
});

interface Emit { event: string; args: any[] }
type Handlers = Record<string, (...args: any[]) => any>;

function makeSocket(id: string, emits: Emit[]) {
  const handlers: Handlers = {};
  const socket: any = {
    id,
    handshake: { address: '127.0.0.1' },
    connected: true,
    nsp: { sockets: new Map<string, any>() },
    handlers,
    emit(event: string, ...args: any[]) { emits.push({ event, args }); return true; },
    on(event: string, cb: (...args: any[]) => any) { handlers[event] = cb; return socket; },
    once(event: string, cb: (...args: any[]) => any) { handlers[event] = cb; return socket; },
    onAny() { return socket; },
    join() { return socket; },
    leave() { return socket; },
    disconnect() {},
    removeAllListeners() { return socket; },
    removeListener() { return socket; },
    listenerCount() { return 0; },
  };
  return socket;
}

function makeIo(sockets: any[] = []) {
  const map = new Map<string, any>();
  for (const s of sockets) map.set(s.id, s);
  return {
    sockets: { sockets: map },
    emit() { return true; },
    to() { return { emit() { return true; } }; },
  } as any;
}

const sessionManager = () => require('../../src/server/session-manager');
const socketHandlers = () => require('../../src/server/socket-handlers');

async function waitForHandler(socket: any, event: string): Promise<(...args: any[]) => any> {
  for (let i = 0; i < 200; i++) {
    const handler = socket.handlers[event];
    if (typeof handler === 'function') return handler;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`handler '${event}' was never registered`);
}

/** Restore `session` onto a fresh socket and hand back everything it emitted. */
async function reconnectInto(session: any, socketId: string, nodeId: number): Promise<Emit[]> {
  const emits: Emit[] = [];
  const socket = makeSocket(socketId, emits);
  const { setSession, userSessions } = sessionManager();
  const { registerSocketHandlers } = socketHandlers();

  userSessions.set(String(session.user.id), session);
  setSession(socket.id, { nodeId, socketId: socket.id, terminalType: 'unknown' });
  mockGetUserById.mockResolvedValue({ id: session.user.id, username: 'Spot', baud: 0 });

  registerSocketHandlers(makeIo([socket]), socket);
  const restore = await waitForHandler(socket, 'restore-session');
  await restore({ userId: session.user.id, username: 'Spot', savedAt: Date.now() });

  return emits;
}

function baseSession(userId: string, nodeId: number): any {
  return {
    nodeId,
    socketId: `${userId}-dead`,
    currentConf: 0,
    user: { id: userId, username: 'Spot' },
  };
}

describe('a client door outlives the reconnect, and the browser is told so', () => {
  beforeEach(() => {
    const { sessions, userSessions, socketToNodeId, socketToUser } = sessionManager();
    sessions.clear(); userSessions.clear(); socketToNodeId.clear(); socketToUser.clear();
    mockGetUserById.mockReset();
  });

  afterEach(() => { jest.restoreAllMocks(); });

  it('re-announces the running door, so the pad and the gestures come back', async () => {
    const session = baseSession('reconnect-in-door', 81);
    session.clientDoorActive = true;
    session.clientDoorId = 'gmaster';

    const emits = await reconnectInto(session, 'reconnect-in-door-new', 82);

    const announced = emits.filter((e) => e.event === 'door:active-client');
    expect(announced).toHaveLength(1);
    expect(announced[0].args[0]).toEqual({ doorId: 'gmaster' });
  });

  it('says nothing when no client door is running, so the BBS keyboard stays', async () => {
    const session = baseSession('reconnect-at-menu', 83);

    const emits = await reconnectInto(session, 'reconnect-at-menu-new', 84);

    expect(emits.filter((e) => e.event === 'door:active-client')).toHaveLength(0);
  });

  it('does not re-announce a door that ended while the caller was away', async () => {
    const session = baseSession('reconnect-after-door', 85);
    // What the door's own cleanup leaves behind: the flag down, the id gone.
    session.clientDoorActive = false;
    delete session.clientDoorId;

    const emits = await reconnectInto(session, 'reconnect-after-door-new', 86);

    expect(emits.filter((e) => e.event === 'door:active-client')).toHaveLength(0);
  });
});
