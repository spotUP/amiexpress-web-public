/**
 * Task OC-7 of `thoughts/shared/plans/2026-09-02-petscii-oracle-at-the-choke.md`:
 * THE 80-COLUMN IDENTITY GUARD.
 *
 * The oracle plan moves a MODEL, never a byte. Every ANSI session's output -
 * web and telnet - must be byte-identical before and after it, so this suite
 * is the standing guard the plan is re-run against after OC-3, OC-4, OC-5 and
 * OC-6; a red here stops the plan.
 *
 * The baseline is BUILT BY THIS TEST from its own raw input (review M5): the
 * producer's own strings, recorded above the emitter, normalized the way the
 * non-PETSCII branch normalizes them (`connection-emitter.ts`,
 * `data.replace(/\r?\n/g, '\r\n')`). No stored fixture, no capture from
 * `origin/main` - a pin that has to be re-captured is a pin that rots, and a
 * capture taken from the branch under test proves nothing.
 *
 * Reachability (`~/.claude/REACHABILITY_PROTOCOL.md` gate 3): the web walk is
 * driven through the PRODUCT'S entry points - the real
 * `registerSocketHandlers` (which is what installs the choke on every live
 * socket, `server/socket-handlers.ts`), then a real dispatcher paint through
 * `handleCommand`, a real `.TXT` and a real paginated `.TXT` through
 * `displayScreen` / `handlePaginatedScreenInput`, and a real door frame
 * through the `BBSApi` a door is handed. Not a hand-made emit.
 *
 * Every "the model never ran" sentinel counts
 * `AnsiToPetsciiTransducer.prototype.transduce` / `.observe`. A spy on the
 * module export `petsciiTerminalModelFor` would record ZERO whether the path
 * runs or not - the transpiler binds intra-module calls locally - so it would
 * pass on a broken build (plan I4). The spies are validated on a known-live
 * PETSCII session in the same test before their zero is quoted
 * (REACHABILITY_PROTOCOL section 3).
 *
 * The six suites the plan lists as the rest of this guard must stay green with
 * ZERO edits; their presence unedited is the pin:
 *   tests/petscii-frame/c64-door-adapter-identity.test.ts
 *   tests/doors/door-min-columns-gate.test.ts
 *   tests/doors/door-min-columns-dispatch.test.ts
 *   tests/forty-col-sweep.test.ts
 *   tests/utils/emit-text-wrap.test.ts
 *   tests/server/connection-emitter-petscii.test.ts
 *
 * `src/index.ts` runs a top-level IIFE that starts the HTTP/telnet/SSH servers
 * on module load, so it is mocked away, along with the emulator modules
 * `command.handler.ts` imports statically. The screen handler, the BBSApi, the
 * socket registrar and the connection emitter are all REAL - they are what is
 * under test.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('../../src/index', () => {
  const states = require('../../src/constants/bbs-states');
  return {
    BBSState: states.BBSState,
    LoggedOnSubState: states.LoggedOnSubState,
    LOCALHOST_IPS: [],
    initializeSecurity: jest.fn(),
    setSecurityDependencies: jest.fn(),
    setMessageCommandsDependencies: jest.fn(),
    setDisplayFileCommandsDependencies: jest.fn(),
    setPreferenceChatCommandsDependencies: jest.fn(),
    setSystemCommandsDependencies: jest.fn(),
    setNavigationCommandsDependencies: jest.fn(),
    setAdvancedCommandsDependencies: jest.fn(),
    setInfoCommandsDependencies: jest.fn(),
    setUtilityCommandsDependencies: jest.fn(),
    setMessageEntryDependencies: jest.fn(),
    setSysopCommandsDependencies: jest.fn(),
    setTransferMiscDependencies: jest.fn(),
    setMessagingDependencies: jest.fn(),
    setDatabaseDependencies: jest.fn(),
    setCommandHandlerDependencies: jest.fn(),
    setConfigDependencies: jest.fn(),
    setDoorDependencies: jest.fn(),
    setNodeServices: jest.fn(),
    setServiceDependencies: jest.fn(),
    setChatDependencies: jest.fn(),
    setAmigaExports: jest.fn(),
    setServerState: jest.fn(),
    setAmigaDoorDependencies: jest.fn(),
    setUserServices: jest.fn(),
    setWebhookDependencies: jest.fn(),
    setBulletinDependencies: jest.fn(),
    setFileMaintenanceDependencies: jest.fn(),
    setUserCommandsDependencies: jest.fn(),
    setMessageHandlersDependencies: jest.fn(),
    setSessionManager: jest.fn(),
    setConferences: jest.fn(),
    setMessageBases: jest.fn(),
    setFileAreas: jest.fn(),
    setDoors: jest.fn(),
    setProcessOlmMessageQueue: jest.fn(),
    setCheckSecurity: jest.fn(),
    setSetEnvStat: jest.fn(),
    setGetRecentCallerActivity: jest.fn(),
  };
});

jest.mock('../../src/amiga-emulation/loader/LibraryLoader', () => ({ LibraryLoader: jest.fn() }));
jest.mock('../../src/amiga-emulation/AmigaDoorSession', () => ({ AmigaDoorSession: jest.fn() }));

import { AnsiToPetsciiTransducer } from '@amiexpress/bbs-door-sdk/petscii';
import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';
import { handleCommand } from '../../src/handlers/command.handler';
import { displayScreen, handlePaginatedScreenInput } from '../../src/handlers/screen.handler';
import { createBBSApi } from '../../src/doors/BBSApi';
import { flushAllBuffers } from '../../src/utils/ansi-buffer.util';
import { buildConnectionEmitter } from '../../src/server/connection-emitter';
import { installPetsciiModelChoke } from '../../src/utils/petscii-session-model';

/** require() after jest.mock so the module graph sees the stubbed index. */
const sessionManager = () => require('../../src/server/session-manager');
const socketHandlers = () => require('../../src/server/socket-handlers');

interface Tuple {
  event: string;
  args: any[];
  /** A unique object per call, so "the return value is the downstream's" is provable. */
  ret: any;
}

interface ProducerTuple {
  event: string;
  args: any[];
  returned: any;
}

let socketCounter = 0;

/**
 * A socket.io-shaped mock whose OWN emit is the bottom of the wrapper stack -
 * the spy installed BELOW `installPetsciiModelChoke`. It records what actually
 * reached the wire and returns a fresh object per call so the return value can
 * be traced back through every wrapper above it.
 *
 * Each socket gets its own id: the AnsiBuffer is cached per socket in a
 * module-level map with no test-scoped reset, so a shared id leaks
 * buffered-but-unflushed text between tests.
 */
function makeSocket(belowChoke: Tuple[]) {
  socketCounter += 1;
  const handlers: Record<string, (...args: any[]) => any> = {};
  const socket: any = {
    id: `eighty-col-identity-${socketCounter}`,
    handshake: { address: '127.0.0.1' },
    connected: true,
    nsp: { sockets: new Map<string, any>() },
    handlers,
    emit(event: string, ...args: any[]) {
      const ret = { call: belowChoke.length };
      belowChoke.push({ event, args, ret });
      return ret;
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

function makeIo(sockets: any[] = []) {
  const map = new Map<string, any>();
  for (const s of sockets) map.set(s.id, s);
  return {
    sockets: { sockets: map },
    emit() { return true; },
    to() { return { emit() { return true; } }; },
  } as any;
}

/** An ordinary 80-column ANSI caller. Nothing here wants PETSCII. */
function ansiSession(nodeId: number, socketId: string): any {
  return {
    nodeId,
    socketId,
    state: BBSState.AWAIT,
    subState: LoggedOnSubState.DISPLAY_CONNECT,
    terminalType: 'modern',
    petsciiMode: false,
    ansiEnabled: true,
    screenWidth: 80,
    screenHeight: 24,
    currentConf: 0,
    tempData: { inputBuffer: '' },
    commandBuffer: '',
    inputBuffer: '',
    menuPause: true,
    cmdShortcuts: false,
    shortcuts: new Map(),
    timeRemaining: 60,
    lastActivity: Date.now(),
    displayFlowPaused: false,
    doorExpertMode: false,
    lastScreenHadPause: false,
    user: { username: 'Spot' },
  };
}

/** Every temp dir this suite made, removed in `afterAll`. */
const tempDirs: string[] = [];

function writeScreen(base: string, body: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eighty-col-identity-'));
  tempDirs.push(dir);
  const file = path.join(dir, base);
  fs.writeFileSync(file, Buffer.from(body, 'latin1'));
  return file;
}

const MENU_TXT = () => writeScreen('MENU.TXT', '\x1b[2J\x1b[H\x1b[1;32m(A)rea (B)ulletins (Q)uit\x1b[0m\r\n');
const PAGED_TXT = () => {
  const lines: string[] = [];
  for (let i = 0; i < 40; i++) lines.push(`LINE ${i} ${'-'.repeat(40)}`);
  return writeScreen('PAGED.TXT', lines.join('\r\n'));
};

/**
 * THE 80-COLUMN WALK, driven through product entry points only.
 *
 * 1. a real dispatcher paint: the connect screen's keypress puts the graphics
 *    prompt on the wire (`command.handler.ts`, the DISPLAY_CONNECT branch);
 * 2. a menu paint and a paginated `.TXT` through the real screen handler,
 *    answered the way the socket input handler answers `More(y/n/ns)?`;
 * 3. a door frame through the seam every TypeScript door takes
 *    (`BBSApi.write`).
 */
async function eightyColumnWalk(socket: any, session: any): Promise<void> {
  await handleCommand(socket, session, ' ');

  expect(await displayScreen(socket, session, MENU_TXT())).toBe(true);
  expect(await displayScreen(socket, session, PAGED_TXT())).toBe(true);
  expect(session.paginatedScreen).toBeDefined();
  expect(await handlePaginatedScreenInput(socket, session, '')).toBe(true);

  createBBSApi(socket, session).write('\x1b[10;5H\x1b[33mDOOR FRAME\x1b[0m\r\n');

  // Output leaves on a 16 ms AnsiBuffer timer; nothing below can be asserted
  // until it has drained.
  flushAllBuffers();
}

describe('OC-7: the 80-column path is byte-identical, and pays for no model', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
    tempDirs.length = 0;
  });

  it("an 80-column web session's emits are the same objects, in the same order", async () => {
    const belowChoke: Tuple[] = [];
    const socket = makeSocket(belowChoke);
    const { setSession, deleteSession, sessions } = sessionManager();
    const { registerSocketHandlers } = socketHandlers();
    const session = ansiSession(81, socket.id);
    setSession(socket.id, session);
    // emitText's wrap choke reads socket.session (index.ts assigns it on the
    // live web path); wrapForSession is identity at >= 80 columns.
    socket.session = session;

    try {
      // The choke is installed by the REAL registrar, last among the
      // registration-time wrappers.
      registerSocketHandlers(makeIo([socket]), socket);

      // The producer side: everything a caller's output passes on its way
      // INTO the wrapper stack, recorded above the choke.
      const aboveChoke: ProducerTuple[] = [];
      const downstream = socket.emit.bind(socket);
      socket.emit = function (event: string, ...args: any[]): any {
        const returned = downstream(event, ...args);
        aboveChoke.push({ event, args, returned });
        return returned;
      };

      await eightyColumnWalk(socket, session);

      // Non-vacuous: the walk really painted.
      expect(aboveChoke.length).toBeGreaterThan(3);
      expect(aboveChoke.filter((t) => t.event === 'ansi-output').length).toBeGreaterThan(2);

      // Same count, same order, same argument INSTANCES, and each call's
      // return value is the one the bottom of the stack produced.
      expect(belowChoke).toHaveLength(aboveChoke.length);
      for (let i = 0; i < aboveChoke.length; i++) {
        expect(belowChoke[i].event).toBe(aboveChoke[i].event);
        expect(belowChoke[i].args).toHaveLength(aboveChoke[i].args.length);
        for (let a = 0; a < aboveChoke[i].args.length; a++) {
          // toBe (Object.is): the SAME instance for a buffer or an object,
          // and the exact same characters for a string primitive - so a byte
          // added, dropped or re-encoded anywhere in the wrapper stack fails
          // here, which is the whole 80-column claim.
          expect(belowChoke[i].args[a]).toBe(aboveChoke[i].args[a]);
        }
        expect(aboveChoke[i].returned).toBe(belowChoke[i].ret);
      }
    } finally {
      deleteSession(socket.id);
      sessions.delete('81');
    }
  });

  it('an 80-column session never builds a model', async () => {
    // Review M3: the claim is pinned through the REAL registrar and a REAL
    // paint, not through a hand-made emit on a hand-installed choke.
    const belowChoke: Tuple[] = [];
    const socket = makeSocket(belowChoke);
    const { setSession, deleteSession, getSession, sessions } = sessionManager();
    const { registerSocketHandlers } = socketHandlers();
    const session = ansiSession(82, socket.id);
    setSession(socket.id, session);
    socket.session = session;

    try {
      registerSocketHandlers(makeIo([socket]), socket);
      await eightyColumnWalk(socket, session);

      // The walk reached the wire (otherwise "no model" is vacuous)...
      expect(belowChoke.filter((t) => t.event === 'ansi-output').length).toBeGreaterThan(2);
      // ...and the choke really is on this socket, resolving this session.
      expect(getSession(socket.id)).toBe(session);
      // ...and not one byte of it built a terminal model.
      expect(session.petsciiTransducer).toBeUndefined();
      // Nor did anything push the session into the raw-byte transport.
      expect(belowChoke.some((t) => t.event === 'petscii-bytes')).toBe(false);
      expect(belowChoke.some((t) => t.event === 'petscii-output')).toBe(false);

      // THE GUARD IS ARMED, not absent: flip this very socket's session to
      // PETSCII and the same emit path builds the model on the next string.
      // Without this control, "no model" could equally mean "no choke on this
      // socket", and the test would pass on a build that never installed one.
      session.petsciiMode = true;
      socket.emit('ansi-output', 'HI');
      expect(session.petsciiTransducer).toBeDefined();
      session.petsciiMode = false;
      session.petsciiTransducer = undefined;
    } finally {
      deleteSession(socket.id);
      sessions.delete('82');
    }
  });

  it("an 80-column telnet session's bytes are unchanged", async () => {
    // M5: the baseline is built from this test's OWN raw input - the strings
    // the producers actually passed, normalized the way the emitter's
    // non-PETSCII branch normalizes them. Not a stored fixture and not a
    // capture from another branch, so the pin cannot rot.
    const written: Buffer[] = [];
    const session = ansiSession(83, 'eighty-col-identity-telnet');
    const connection: any = {
      sessionId: 'eighty-col-identity-telnet',
      session,
      write: (data: Buffer | string) =>
        written.push(typeof data === 'string' ? Buffer.from(data, 'latin1') : Buffer.from(data)),
      on: () => undefined,
      off: () => undefined,
      close: () => undefined,
    };
    const emitter = buildConnectionEmitter(connection);

    // The producer side, recorded above the emitter's own emit.
    const produced: Array<{ event: string; data: any }> = [];
    const emitterEmit = emitter.emit;
    emitter.emit = (event: string, data: any) => {
      produced.push({ event, data });
      return emitterEmit(event, data);
    };

    await eightyColumnWalk(emitter, session);
    // A binary payload too: ZMODEM buffers must pass untouched.
    const binary = Buffer.from([0x18, 0x42, 0x00, 0xff, 0x0a]);
    emitter.emit('ansi-output', binary);

    const ansiOut = produced.filter((p) => p.event === 'ansi-output');
    expect(ansiOut.length).toBeGreaterThan(2);
    // An 80-column session never reaches the raw-byte transport, so the
    // baseline below covers everything that could have been written.
    expect(produced.some((p) => p.event === 'petscii-bytes' || p.event === 'petscii-output')).toBe(false);

    const baseline = Buffer.concat(
      ansiOut.map((p) =>
        typeof p.data === 'string'
          ? Buffer.from(p.data.replace(/\r?\n/g, '\r\n'), 'latin1')
          : Buffer.from(p.data),
      ),
    );

    expect(baseline.length).toBeGreaterThan(0);
    // latin1 is a lossless byte-per-character mapping, so this string form is
    // the same claim as the Buffer compare below - it is here because it
    // prints WHICH byte moved when it fails.
    expect(Buffer.concat(written).toString('latin1')).toBe(baseline.toString('latin1'));
    expect(Buffer.concat(written).equals(baseline)).toBe(true);
    // The binary tail is verbatim, and it is the last thing written.
    expect(written[written.length - 1].equals(binary)).toBe(true);
    expect(session.petsciiTransducer).toBeUndefined();

    // THE GUARD IS ARMED, not absent: the same emitter transduces the moment
    // the session wants PETSCII, so the identity above is a statement about
    // the 80-column BRANCH and not about a dead emitter.
    const before = written.length;
    session.petsciiMode = true;
    emitter.emit('ansi-output', 'HI\n');
    session.petsciiMode = false;
    expect(written[before].equals(Buffer.from('HI\r\n', 'latin1'))).toBe(false);
    expect(session.petsciiTransducer).toBeDefined();
  });

  it('the choke costs an 80-column session no model at all', async () => {
    // I4: PROTOTYPE spies. A spy on the module export petsciiTerminalModelFor
    // records ZERO whether the path runs or not - the transpiler binds
    // intra-module calls locally - so it would report a broken build as clean.
    const transduce = jest.spyOn(AnsiToPetsciiTransducer.prototype, 'transduce');
    const observe = jest.spyOn(AnsiToPetsciiTransducer.prototype, 'observe');

    const belowChoke: Tuple[] = [];
    const socket = makeSocket(belowChoke);
    const { setSession, deleteSession, sessions } = sessionManager();
    const { registerSocketHandlers } = socketHandlers();
    const session = ansiSession(84, socket.id);
    setSession(socket.id, session);
    socket.session = session;

    try {
      registerSocketHandlers(makeIo([socket]), socket);
      await eightyColumnWalk(socket, session);

      expect(belowChoke.filter((t) => t.event === 'ansi-output').length).toBeGreaterThan(2);
      expect(transduce).not.toHaveBeenCalled();
      expect(observe).not.toHaveBeenCalled();
      expect(session.petsciiTransducer).toBeUndefined();

      // THE INSTRUMENT CHECK (REACHABILITY_PROTOCOL section 3): the same two
      // spies, on a known-live path, must report LIVE - otherwise the zeros
      // above are the report of a broken detector.
      const c64Emits: Tuple[] = [];
      const c64Socket = makeSocket(c64Emits);
      const c64Session: any = { nodeId: 85, socketId: c64Socket.id, petsciiMode: true, screenWidth: 40, screenHeight: 25 };
      c64Socket.session = c64Session;
      installPetsciiModelChoke(c64Socket);
      c64Socket.emit('ansi-output', 'HI\x1b[5;3H');
      c64Socket.emit('petscii-bytes', Buffer.from([0x93]).toString('base64'));
      expect(transduce).toHaveBeenCalledTimes(1);
      expect(observe).toHaveBeenCalledTimes(1);
    } finally {
      deleteSession(socket.id);
      sessions.delete('84');
    }
  });
});
