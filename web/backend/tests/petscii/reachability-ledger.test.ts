/**
 * Task OC-10 of `thoughts/shared/plans/2026-09-02-petscii-oracle-at-the-choke.md`:
 * the REACHABILITY LEDGER's own rows.
 *
 * `~/.claude/REACHABILITY_PROTOCOL.md` gate 3b: a feature is done when a test
 * drives the PRODUCT'S TOP-LEVEL entry point and proves the new code RAN - a
 * call count, not a source pin. Most of this wave's rows are already carried by
 * the task suites that landed with them (`oracle-at-the-choke`,
 * `petscii-model-choke`, `model-reset-at-flip`, `model-sees-door-frames`,
 * `eighty-col-choke-identity`); those are cited in `REACHED.tsv` and re-run.
 * The four rows below had no test that drove their entry point, and this file
 * is where OC-10 adds them:
 *
 *   R0  the INSTRUMENT itself, validated before any count it produces is
 *       quoted (protocol section 3): the same prototype spy must report a
 *       wired choke LIVE and an unwired socket DEAD.
 *   R1  a telnet C64's own top level - `handleCommand(emitter, c64Session, 'M')`
 *       on a connection built by the real `buildConnectionEmitter`, then a real
 *       menu paint through `displayScreen`.
 *   R2  a web C64's own top level - the real `registerSocketHandlers(io, socket)`
 *       (the normal-web call site, `src/index.ts`'s socket.io `connection`
 *       handler), then the same dispatch and the same menu paint.
 *   R11 a rendered `.seq` emitted through the `Object.create(socket)` proxy a
 *       door is handed (`handlers/door.handler.ts`'s `createDoorSocketWrapper`):
 *       the self-fed mark is SESSION-keyed, so the choke still consumes it and
 *       the payload is applied to the model exactly ONCE.
 *
 * Every sentinel is a spy on `AnsiToPetsciiTransducer.prototype`. A spy on a
 * module export (`transducePetsciiAtChoke`, `petsciiTerminalModelFor`) records
 * ZERO whether the path runs or not - the transpiler binds intra-module calls
 * locally - so it would report a broken build as clean (plan I4).
 *
 * `src/index.ts` runs a top-level IIFE that starts the HTTP/telnet/SSH servers
 * on module load, so it is mocked away, along with the emulator modules
 * `command.handler.ts` imports statically. The dispatcher, the screen handler,
 * the socket registrar, the connection emitter and the model util are all REAL
 * - they are what is under test.
 *
 * Fixtures are byte arrays built in code. Never write a `.seq` fixture through
 * Edit/Write: the UTF-8 round-trip destroys every high-bit byte.
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

import { AnsiToPetsciiTransducer, PetsciiMachine } from '@amiexpress/bbs-door-sdk/petscii';
import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';
import { handleCommand } from '../../src/handlers/command.handler';
import { displayScreen } from '../../src/handlers/screen.handler';
import { petsciiMachineFor } from '../../src/handlers/petscii-screen.render';
import { buildConnectionEmitter } from '../../src/server/connection-emitter';
import {
  installPetsciiModelChoke,
  petsciiTerminalModelFor,
} from '../../src/utils/petscii-session-model';
import { flushAllBuffers } from '../../src/utils/ansi-buffer.util';

/** require() after jest.mock so the module graph sees the stubbed index. */
const sessionManager = () => require('../../src/server/session-manager');
const socketHandlers = () => require('../../src/server/socket-handlers');

interface Emit {
  event: string;
  args: any[];
}

let socketCounter = 0;

/** A socket.io-shaped mock. Its OWN emit is the bottom of the wrapper stack. */
function makeSocket(emits: Emit[], session?: any) {
  socketCounter += 1;
  const handlers: Record<string, (...args: any[]) => any> = {};
  const socket: any = {
    id: `reach-ledger-${socketCounter}`,
    handshake: { address: '127.0.0.1' },
    connected: true,
    nsp: { sockets: new Map<string, any>() },
    handlers,
    session,
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

function makeIo(sockets: any[] = []) {
  const map = new Map<string, any>();
  for (const s of sockets) map.set(s.id, s);
  return {
    sockets: { sockets: map },
    emit() { return true; },
    to() { return { emit() { return true; } }; },
  } as any;
}

/** A real C64 caller, already flipped: the state every screen after the flip runs in. */
function c64Session(nodeId: number, socketId: string): any {
  return {
    nodeId,
    socketId,
    state: BBSState.AWAIT,
    subState: LoggedOnSubState.ANSI_PROMPT,
    terminalType: 'c64',
    petsciiMode: true,
    ansiEnabled: false,
    screenWidth: 40,
    screenHeight: 25,
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

function writeScreen(base: string, bytes: Buffer): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reach-ledger-'));
  tempDirs.push(dir);
  const file = path.join(dir, base);
  fs.writeFileSync(file, bytes);
  return file;
}

const MENU_TXT = () =>
  writeScreen('MENU.TXT', Buffer.from('\x1b[2J\x1b[H\x1b[1;32m(A)REA (B)ULL (Q)UIT\x1b[0m\r\n', 'latin1'));

/** Fixture builder: latin1 strings, single bytes and byte arrays, in order. */
function seqBytes(...parts: Array<string | number | number[]>): Buffer {
  const out: number[] = [];
  for (const part of parts) {
    if (typeof part === 'string') out.push(...Array.from(Buffer.from(part, 'latin1')));
    else if (typeof part === 'number') out.push(part);
    else out.push(...part);
  }
  return Buffer.from(out);
}

/**
 * The `.seq` under test: the express.e gate byte, a space the tokenizer eats,
 * one substituted value (`~N`) and one art byte - the shape
 * `tests/petscii/oracle-at-the-choke.test.ts` uses.
 */
const VALUE_SEQ = seqBytes(0x7e, 0x20, '~N|', 'Z');

/** A fresh terminal fed everything the producers put on the wire. */
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
  const s = petsciiMachineFor(session).state;
  return { x: s.cursorX, y: s.cursorY, bank: s.charsetBank, pen: s.pen };
};

/**
 * THE WALK both transport rows drive, through product entry points only:
 * the real dispatcher (`handleCommand`, the ANSI_PROMPT echo an already-flipped
 * C64's keypress takes) and a real menu paint through `displayScreen`.
 */
async function c64Walk(target: any, session: any): Promise<void> {
  await handleCommand(target, session, 'M');
  expect(await displayScreen(target, session, MENU_TXT())).toBe(true);
  // Output leaves on a 16 ms AnsiBuffer timer; nothing can be asserted until
  // it has drained.
  flushAllBuffers();
}

describe('OC-10: the reachability ledger rows that no task suite carried', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
    tempDirs.length = 0;
  });

  it('R0: the sentinel reports a wired choke LIVE and an unwired socket DEAD', () => {
    // REACHABILITY_PROTOCOL section 3: run the detector against a case whose
    // answer is already known, in BOTH directions, before quoting any count it
    // produces. The DEAD half is the one that matters - a detector that can
    // only say LIVE cannot report an unreachable path.
    const session: any = { nodeId: 60, petsciiMode: true, screenWidth: 40, screenHeight: 25 };
    const wiredEmits: Emit[] = [];
    const unwiredEmits: Emit[] = [];
    const wired = makeSocket(wiredEmits, session);
    const unwired = makeSocket(unwiredEmits, session);
    installPetsciiModelChoke(wired);          // the arm, on THIS socket only

    const transduce = jest.spyOn(AnsiToPetsciiTransducer.prototype, 'transduce');

    // DEAD: the same session, the same string, a socket the choke was never
    // installed on. The emit still reaches the wire; nothing reaches the model.
    unwired.emit('ansi-output', 'HI\x1b[5;3H');
    expect(transduce).toHaveBeenCalledTimes(0);
    expect(session.petsciiTransducer).toBeUndefined();
    expect(unwiredEmits).toHaveLength(1);

    // LIVE: the wired socket, same session, same string.
    wired.emit('ansi-output', 'HI\x1b[5;3H');
    expect(transduce).toHaveBeenCalledTimes(1);
    expect(transduce.mock.instances[0]).toBe(session.petsciiTransducer);
    expect(wiredEmits).toHaveLength(1);

    // The spec's numbers: `HI` then an absolute move to row 5, column 3 - the
    // transducer counts from 0, so (2, 4), lower-case bank, default pen.
    expect(cursorOf(session)).toEqual({ x: 2, y: 4, bank: 1, pen: 14 });
  });

  it('R1: a telnet C64 keypress and menu paint feed the session model', async () => {
    // The plan's R1 entry point, literally: handleCommand(emitter, c64Session,
    // 'M') where the emitter came from the real buildConnectionEmitter - the
    // telnet/SSH transport's own choke - plus a real menu paint.
    const written: Buffer[] = [];
    const session = c64Session(61, 'reach-ledger-telnet');
    const connection: any = {
      sessionId: 'reach-ledger-telnet',
      session,
      write: (data: Buffer | string) =>
        written.push(typeof data === 'string' ? Buffer.from(data, 'latin1') : Buffer.from(data)),
      on: () => undefined,
      off: () => undefined,
      close: () => undefined,
    };
    const emitter = buildConnectionEmitter(connection);

    // The producer side, recorded ABOVE the emitter's own emit: what the
    // caller's terminal was told, before the transport converted it.
    const produced: Emit[] = [];
    const emitterEmit = emitter.emit;
    emitter.emit = (event: string, data: any) => {
      produced.push({ event, args: [data] });
      return emitterEmit(event, data);
    };

    const transduce = jest.spyOn(AnsiToPetsciiTransducer.prototype, 'transduce');

    await c64Walk(emitter, session);

    // The walk really painted (otherwise every count below is vacuous)...
    const strings = produced.filter(
      (e) => (e.event === 'ansi-output' || e.event === 'petscii-output') && typeof e.args[0] === 'string',
    );
    expect(strings.length).toBeGreaterThan(0);
    // ...the model ran once per string the caller was sent, in order...
    expect(transduce).toHaveBeenCalledTimes(strings.length);
    expect(transduce.mock.calls.map((c) => String(c[0]))).toEqual(strings.map((e) => String(e.args[0])));
    // ...every feed went to THIS session's ONE model...
    for (const instance of transduce.mock.instances) {
      expect(instance).toBe(session.petsciiTransducer);
    }
    // ...and the oracle the `.seq` render reads equals a terminal fed the wire.
    const wire = wireMirror(produced).state;
    expect(cursorOf(session)).toEqual({
      x: wire.cursorX, y: wire.cursorY, bank: wire.charsetBank, pen: wire.pen,
    });

    // The bytes really left as PETSCII, not as the ANSI the producers wrote:
    // the menu's `ESC[2J` became $93 and no ESC survives.
    const wire64 = Buffer.concat(written);
    expect(wire64.length).toBeGreaterThan(0);
    expect(wire64.includes(0x93)).toBe(true);
    expect(wire64.includes(0x1b)).toBe(false);
  });

  it('R2: a web C64 registered by the real registrar feeds the session model', async () => {
    // The plan's R2 entry point: the real `registerSocketHandlers(io, socket)`
    // - the normal-web call site (`src/index.ts`'s socket.io `connection`
    // handler), not the two chat-only registrars - then the same dispatch and
    // the same menu paint.
    const emits: Emit[] = [];
    const socket = makeSocket(emits);
    const { setSession, deleteSession, getSession, sessions } = sessionManager();
    const { registerSocketHandlers } = socketHandlers();
    const session = c64Session(62, socket.id);
    setSession(socket.id, session);
    // emitText's wrap choke reads socket.session, the way index.ts assigns it
    // on the live web path.
    socket.session = session;

    try {
      registerSocketHandlers(makeIo([socket]), socket);

      // The choke is on the socket, once. A second install would transduce
      // every string twice; the marker is socket-keyed to stop exactly that.
      const markers = Object.getOwnPropertySymbols(socket).filter(
        (s) => s.toString() === 'Symbol(petsciiModelChoke)',
      );
      expect(markers).toHaveLength(1);
      expect((socket as any)[markers[0]]).toBe(true);
      expect(getSession(socket.id)).toBe(session);

      const transduce = jest.spyOn(AnsiToPetsciiTransducer.prototype, 'transduce');

      await c64Walk(socket, session);

      const strings = emits.filter(
        (e) => (e.event === 'ansi-output' || e.event === 'petscii-output') && typeof e.args[0] === 'string',
      );
      expect(strings.length).toBeGreaterThan(0);
      expect(transduce.mock.calls.length).toBeGreaterThanOrEqual(1);
      expect(transduce.mock.calls.map((c) => String(c[0]))).toEqual(strings.map((e) => String(e.args[0])));
      for (const instance of transduce.mock.instances) {
        expect(instance).toBe(session.petsciiTransducer);
      }

      const wire = wireMirror(emits).state;
      expect(cursorOf(session)).toEqual({
        x: wire.cursorX, y: wire.cursorY, bank: wire.charsetBank, pen: wire.pen,
      });
    } finally {
      deleteSession(socket.id);
      sessions.delete('62');
    }
  });

  it('R11: a rendered .seq emitted through a door proxy socket is fed exactly once', async () => {
    // I7: a door runs against `Object.create(socket)`
    // (`handlers/door.handler.ts`'s createDoorSocketWrapper). A mark written
    // through the proxy would become a shadowed OWN property of the proxy
    // while the choke - the prototype's emit - reads the prototype and sees
    // nothing, and the render's own bytes would be applied to the model
    // TWICE. The mark is keyed on the SESSION, which both ends hold.
    const emits: Emit[] = [];
    const session = c64Session(63, 'reach-ledger-proxy');
    const socket = makeSocket(emits, session);
    // The socket the session lives on: `socketStillCarriesSession` withholds
    // the model from a socket the session has moved off (a door still writing
    // through a pre-reconnect capture), so the two ids must agree here.
    session.socketId = socket.id;
    installPetsciiModelChoke(socket);
    const doorSocket = Object.create(socket);
    expect(Object.prototype.hasOwnProperty.call(doorSocket, 'emit')).toBe(false);

    const observe = jest.spyOn(AnsiToPetsciiTransducer.prototype, 'observe');

    const seq = writeScreen('T.SEQ', VALUE_SEQ);
    expect(await displayScreen(doorSocket, session, seq)).toBe(true);
    flushAllBuffers();

    const payloads = emits.filter((e) => e.event === 'petscii-bytes');
    expect(payloads.length).toBeGreaterThan(0);
    // Every payload reached the choke, and every one took the MARKED branch:
    // `observe([])` clears the deferred-wrap latch and touches no cell. A
    // socket-keyed mark would score zero empty calls and re-apply the bytes.
    const emptyFeeds = observe.mock.calls.filter((c) => (c[0] as any).length === 0);
    expect(emptyFeeds).toHaveLength(payloads.length);
    expect(observe.mock.calls.filter((c) => (c[0] as any).length > 0)).toHaveLength(0);
    for (const instance of observe.mock.instances) {
      expect(instance).toBe(session.petsciiTransducer);
    }

    // ...and the model is where a terminal fed the same wire once is.
    const wire = wireMirror(emits).state;
    expect(cursorOf(session)).toEqual({
      x: wire.cursorX, y: wire.cursorY, bank: wire.charsetBank, pen: wire.pen,
    });
  });
});
