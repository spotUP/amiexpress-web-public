/**
 * Task OC-3 of `thoughts/shared/plans/2026-09-02-petscii-oracle-at-the-choke.md`:
 * the WEB transport's model choke.
 *
 * A telnet C64 gets its terminal model for free - every byte for the session
 * passes `server/connection-emitter.ts`. A web C64 has no such point: the
 * browser does the PETSCII conversion, so the server sees only a stream of
 * `socket.emit` calls. This suite pins the wrapper that gives web the same
 * model: installed at REGISTRATION so it is the outermost registration-time
 * wrapper, re-armed on the reconnect replacement socket, gated on
 * `sessionWantsPetscii` so an ANSI session pays nothing, and flushed at input
 * arrival the way `index.ts:1144` flushes telnet.
 *
 * Every sentinel counts `AnsiToPetsciiTransducer.prototype.transduce` /
 * `.observe`. A spy on the module export `petsciiTerminalModelFor` would
 * record ZERO whether the path runs or not - ts-jest binds intra-module calls
 * locally - so it would pass on a broken build (I4).
 *
 * `src/index.ts` runs a top-level IIFE that starts the HTTP/telnet/SSH servers
 * on module load, so it is mocked away; everything else is the real module.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/index', () => ({}));

/**
 * `db` is a lazy Proxy whose `get` trap always answers from the singleton, so
 * `jest.spyOn(db, ...)` writes to a target nobody reads. Wrap it instead: one
 * method overridden, everything else forwarded to the real lazy proxy.
 */
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

import { AnsiToPetsciiTransducer, PetsciiMachine } from '@amiexpress/bbs-door-sdk/petscii';
import {
  disposePetsciiSessionModel,
  installPetsciiModelChoke,
  petsciiTerminalModelFor,
  sessionWantsPetscii,
} from '../../src/utils/petscii-session-model';

interface Emit {
  event: string;
  args: any[];
}

type Handlers = Record<string, (...args: any[]) => any>;

/** A socket.io-shaped mock that keeps the handlers registered on it. */
function makeSocket(id: string, emits: Emit[]) {
  const handlers: Handlers = {};
  const socket: any = {
    id,
    handshake: { address: '127.0.0.1' },
    connected: true,
    nsp: { sockets: new Map<string, any>() },
    handlers,
    emit(event: string, ...args: any[]) {
      emits.push({ event, args });
      return true;
    },
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

/**
 * A fresh terminal fed EVERYTHING this socket put on the wire - the definition
 * of "what the caller's terminal has". Same shape as
 * `tests/petscii/seq-pause-and-colour.test.ts:105-119`.
 */
function wireMirror(emits: Emit[]): PetsciiMachine {
  const terminal = new AnsiToPetsciiTransducer();
  for (const e of emits) {
    if (e.event === 'petscii-bytes' && typeof e.args[0] === 'string') {
      terminal.observe(Buffer.from(e.args[0], 'base64'));
    } else if (
      (e.event === 'ansi-output' || e.event === 'petscii-output') &&
      typeof e.args[0] === 'string'
    ) {
      terminal.transduce(e.args[0]);
    }
  }
  return terminal.machine;
}

const cursorOf = (session: any) => {
  const s = petsciiTerminalModelFor(session).machine.state;
  return { x: s.cursorX, y: s.cursorY, bank: s.charsetBank, pen: s.pen };
};

/** require() after jest.mock so the module graph sees the stubbed index. */
const sessionManager = () => require('../../src/server/session-manager');
const socketHandlers = () => require('../../src/server/socket-handlers');

/**
 * `registerSocketHandlers` registers the auth handlers through a dynamic
 * `import()`, so they land a few ticks after it returns.
 */
async function waitForHandler(socket: any, event: string): Promise<(...args: any[]) => any> {
  for (let i = 0; i < 200; i++) {
    const handler = socket.handlers[event];
    if (typeof handler === 'function') return handler;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`handler '${event}' was never registered`);
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

describe('OC-3: the web transport carries the session terminal model', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("a web PETSCII session's menu text moves the server's model", () => {
    const emits: Emit[] = [];
    const socket = makeSocket('choke-menu-1', emits);
    const { setSession, deleteSession, getSession } = sessionManager();
    const session: any = { nodeId: 71, socketId: socket.id, petsciiMode: true, screenWidth: 40, screenHeight: 25 };
    setSession(socket.id, session);
    try {
      installPetsciiModelChoke(socket, () => getSession(socket.id));

      // Reachability sentinel: a PROTOTYPE spy, installed before the emit.
      const transduce = jest.spyOn(AnsiToPetsciiTransducer.prototype, 'transduce');
      socket.emit('ansi-output', 'HI\x1b[5;3H');

      expect(transduce).toHaveBeenCalledTimes(1);
      const wire = wireMirror(emits).state;
      expect(cursorOf(session)).toEqual({
        x: wire.cursorX, y: wire.cursorY, bank: wire.charsetBank, pen: wire.pen,
      });
      // The wire really moved - otherwise the equality above is vacuous.
      expect(wire.cursorY).toBe(4);
    } finally {
      deleteSession(socket.id);
    }
  });

  it("an ANSI session's bytes and emit are untouched", () => {
    const downstream = jest.fn().mockReturnValue('downstream-return');
    const socket: any = { id: 'choke-ansi-1', emit: downstream };
    const { setSession, deleteSession, getSession } = sessionManager();
    const session: any = { nodeId: 72, socketId: socket.id, terminalType: 'modern', screenWidth: 80 };
    setSession(socket.id, session);
    try {
      installPetsciiModelChoke(socket, () => getSession(socket.id));
      const transduce = jest.spyOn(AnsiToPetsciiTransducer.prototype, 'transduce');
      const observe = jest.spyOn(AnsiToPetsciiTransducer.prototype, 'observe');

      const payload = 'MENU\x1b[0m\r\n';
      const returned = socket.emit('ansi-output', payload);

      expect(sessionWantsPetscii(session)).toBe(false);
      expect(downstream).toHaveBeenCalledTimes(1);
      // The IDENTICAL string instance, not a copy of it.
      expect(downstream.mock.calls[0][1]).toBe(payload);
      expect(returned).toBe('downstream-return');
      expect(session.petsciiTransducer).toBeUndefined();
      expect(transduce).not.toHaveBeenCalled();
      expect(observe).not.toHaveBeenCalled();
    } finally {
      deleteSession(socket.id);
    }
  });

  it('a modem re-install does not get a second choke', () => {
    // B1: the sequence the reconnect path actually produces. The modem
    // emulator replaces socket.emit with a wrapper of its OWN
    // (`utils/modem-emulator.util.ts:276`), so a marker keyed on the emit
    // FUNCTION would be gone by the second install and every ansi-output
    // would be transduced twice. Installing back to back with nothing in
    // between is green either way and proves nothing.
    const emits: Emit[] = [];
    const socket = makeSocket('choke-modem-1', emits);
    const { setSession, deleteSession, getSession } = sessionManager();
    const session: any = { nodeId: 73, socketId: socket.id, petsciiMode: true, screenWidth: 40 };
    setSession(socket.id, session);
    try {
      const resolver = () => getSession(socket.id);
      installPetsciiModelChoke(socket, resolver);

      const { getModemEmulator } = require('../../src/utils/modem-emulator.util');
      getModemEmulator(socket).install();

      installPetsciiModelChoke(socket, resolver);

      const transduce = jest.spyOn(AnsiToPetsciiTransducer.prototype, 'transduce');
      socket.emit('ansi-output', 'ONCE');

      expect(transduce).toHaveBeenCalledTimes(1);
      expect(cursorOf(session).x).toBe(4);
      expect(emits.filter((e) => e.event === 'ansi-output')).toHaveLength(1);
    } finally {
      deleteSession(socket.id);
    }
  });

  it("a reconnected session's model starts clean", async () => {
    // Q6 / I1 / I2: the restored session lands on a NEW socket. The model it
    // carried describes a canvas the browser has already thrown away, and the
    // `~SP` segments parked with it were encoded against that model.
    const emits: Emit[] = [];
    const socket = makeSocket('choke-reconnect-new', emits);
    const {
      setSession, deleteSession, getSession, sessions, userSessions, socketToUser, socketToNodeId,
    } = sessionManager();
    const { registerSocketHandlers } = socketHandlers();

    const userId = 'choke-reconnect-user';
    const existingSession: any = {
      nodeId: 74,
      socketId: 'choke-reconnect-dead',
      petsciiMode: true,
      screenWidth: 40,
      screenHeight: 25,
      currentConf: 0,
      user: { id: userId, username: 'Spot' },
    };
    // The pre-disconnect model, at row 12, with a paused `.seq`'s segments
    // parked against it.
    petsciiTerminalModelFor(existingSession).transduce('\x1b[13;1H');
    expect(cursorOf(existingSession).y).toBe(12);
    existingSession.screenSegments = {
      segments: ['leftover'], currentIndex: 0, screenName: 'T',
      inlineMode: true, eventName: 'petscii-output', isFlowScreen: true, petscii: true,
      petsciiCtx: { machine: existingSession.petsciiTransducer.machine },
    };
    userSessions.set(String(userId), existingSession);

    // The throwaway session registration runs with, before the restore swaps
    // the real one in behind this socket id. Its own node, because
    // `setSession` keys the session store by nodeId and refuses nodeId 0.
    const fresh: any = { nodeId: 76, socketId: socket.id, terminalType: 'unknown' };
    setSession(socket.id, fresh);

    mockGetUserById.mockResolvedValue({ id: userId, username: 'Spot', baud: 0 });

    try {
      registerSocketHandlers(makeIo([socket]), socket);
      // registerAuthHandlers is loaded through a dynamic import
      // (`socket-handlers.ts` -> `import('./auth-socket-handlers')`), so the
      // handler appears a few ticks after the registrar returns.
      const restore = await waitForHandler(socket, 'restore-session');

      await restore({ userId, username: 'Spot', savedAt: Date.now() });

      // (a) the model and the segments that were only valid against it are gone
      expect(existingSession.petsciiTransducer).toBeUndefined();
      expect(existingSession.screenSegments).toBeUndefined();
      expect(getSession(socket.id)).toBe(existingSession);

      // (b) the next paint builds a model at home
      const model = petsciiTerminalModelFor(existingSession);
      expect(cursorOf(existingSession)).toEqual({ x: 0, y: 0, bank: 0, pen: 14 });

      // The restore installed the modem emulator on this socket AFTER the
      // choke, so `socket.emit` is now the modem's wrapper. The transduce
      // count below is therefore also the proof that the choke sits UNDER it
      // and is still reached.
      expect((socket as any)._modemEmulatorInstalled).toBe(true);

      // (c) the LIVE socket - resolved the way the cross-session pushes
      // resolve it (`handlers/chat/chat.handler.ts:91`), NOT `session.socket`,
      // which the restore never reassigns - feeds that model.
      const io = makeIo([socket]);
      const live = io.sockets.sockets.get(existingSession.socketId);
      expect(live).toBe(socket);
      const transduce = jest.spyOn(AnsiToPetsciiTransducer.prototype, 'transduce');
      live.emit('ansi-output', '\x1b[3;1HBACK');
      expect(transduce).toHaveBeenCalledTimes(1);
      expect(petsciiTerminalModelFor(existingSession)).toBe(model);
      expect(cursorOf(existingSession)).toEqual({ x: 4, y: 2, bank: 1, pen: 14 });
    } finally {
      userSessions.delete(String(userId));
      socketToUser.delete(socket.id);
      socketToNodeId.delete(socket.id);
      deleteSession(socket.id);
      sessions.delete('74');
      sessions.delete('76');
    }
  });

  it('a keystroke resolves a held carriage return', async () => {
    // Q5: output stops, input begins. A trailing bare CR is held by the
    // transducer until something flushes it; the browser's own transducer
    // flushes on the same edge before it sends the key, so the server's model
    // must too or it is one column out for the whole next screen.
    const emits: Emit[] = [];
    const socket = makeSocket('choke-flush-1', emits);
    const { setSession, deleteSession } = sessionManager();
    const { registerSocketHandlers } = socketHandlers();
    const session: any = {
      nodeId: 75,
      socketId: socket.id,
      petsciiMode: true,
      screenWidth: 40,
      screenHeight: 25,
      // A pause prompt is live inside a door: the real handler accumulates the
      // key and returns, so nothing downstream of the flush repaints and moves
      // the cursor again. `inDoorManager` suppresses the echo for the same
      // reason (doors echo their own).
      inDoorManager: true,
      checkPauseHandler: () => {},
    };
    setSession(socket.id, session);
    try {
      registerSocketHandlers(makeIo([socket]), socket);
      const command = socket.handlers['command'];
      expect(typeof command).toBe('function');

      // OC-10 row R7's sentinel: `flush` is a method on the SAME prototype the
      // other rows count, so a spy on it proves the model's flush RAN - not
      // merely that the cursor ended up in the right column.
      const flush = jest.spyOn(AnsiToPetsciiTransducer.prototype, 'flush');

      socket.emit('ansi-output', 'ready\r');
      // Held, not resolved: the CR is still pending inside the transducer.
      expect(cursorOf(session)).toEqual({ x: 5, y: 0, bank: 1, pen: 14 });
      expect(flush).not.toHaveBeenCalled();

      command('A');

      // Exactly one flush per keystroke, on THIS session's one model.
      expect(flush).toHaveBeenCalledTimes(1);
      expect(flush.mock.instances[0]).toBe(session.petsciiTransducer);

      // The lone CR's $9D walk: column 0 of the SAME row.
      expect(cursorOf(session)).toEqual({ x: 0, y: 0, bank: 1, pen: 14 });
      expect((session as any).checkPauseBuffer).toBe('A');
    } finally {
      deleteSession(socket.id);
    }
  });

  it("a door's stale socket does not feed the model after a reconnect", () => {
    // I2: a door captures its socket at launch and keeps writing through an
    // `Object.create(socket)` proxy over it (`handlers/door.handler.ts`'s
    // createDoorSocketWrapper). When the browser reconnects mid-door,
    // `getSession(oldSocketId)` still resolves the SAME LIVE session for the
    // 3 s grace, so the dead socket's choke would transduce into the model the
    // restore had just disposed - and the first `.seq` after the reconnect
    // would be encoded against a screen nobody has.
    const deadEmits: Emit[] = [];
    const liveEmits: Emit[] = [];
    const dead = makeSocket('choke-stale-dead', deadEmits);
    const live = makeSocket('choke-stale-live', liveEmits);
    const { setSession, deleteSession, getSession, sessions } = sessionManager();
    const session: any = {
      nodeId: 77, socketId: dead.id, petsciiMode: true, screenWidth: 40, screenHeight: 25,
    };
    setSession(dead.id, session);
    installPetsciiModelChoke(dead, () => getSession(dead.id));
    const doorSocket = Object.create(dead);   // the door's own view of it

    try {
      // Before the reconnect the door's frames ARE the caller's screen.
      doorSocket.emit('ansi-output', '\x1b[13;1HDOOR');
      expect(cursorOf(session).y).toBe(12);

      // The reconnect, as `auth-socket-handlers.ts` performs it.
      session.socketId = live.id;
      setSession(live.id, session);
      disposePetsciiSessionModel(session);
      installPetsciiModelChoke(live, () => getSession(live.id));
      // The grace window is real: the dead id still resolves this session.
      expect(getSession(dead.id)).toBe(session);

      const transduce = jest.spyOn(AnsiToPetsciiTransducer.prototype, 'transduce');
      doorSocket.emit('ansi-output', '\x1b[20;1HSTALE');

      // Not one byte of the dead socket's output reaches the model...
      expect(transduce).not.toHaveBeenCalled();
      expect(session.petsciiTransducer).toBeUndefined();
      // ...and the emit is still passed downstream untouched: this gate is
      // about the MODEL, never about swallowing an event.
      expect(deadEmits.filter((e) => e.event === 'ansi-output')).toHaveLength(2);

      // The replacement socket feeds it, from a fresh screen.
      live.emit('ansi-output', '\x1b[3;1HBACK');
      expect(transduce).toHaveBeenCalledTimes(1);
      expect(cursorOf(session)).toEqual({ x: 4, y: 2, bank: 1, pen: 14 });
    } finally {
      deleteSession(dead.id);
      deleteSession(live.id);
      sessions.delete('77');
    }
  });
});
