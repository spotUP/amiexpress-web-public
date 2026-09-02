/**
 * Task OC-5 of `thoughts/shared/plans/2026-09-02-petscii-oracle-at-the-choke.md`:
 * the session's ONE PETSCII terminal model is RESET at every site where a
 * session becomes PETSCII, so the pre-session prefix cannot poison it.
 *
 * The naive story - "the connect screen and the graphics prompt are transduced
 * into the model after the DEL-probe stamps c64" - is wrong, and a test built
 * on it would stage an order production never produces: the stamp
 * (`src/index.ts`, gated on terminalType being absent or 'unknown') happens on
 * a dispatch whose screens were emitted while it still WAS, and the dispatch
 * that follows takes a c64 branch with no emit in between
 * (`handlers/command.handler.ts`'s own comment says exactly this).
 *
 * Two windows ARE reachable, and they are what these tests drive:
 *
 *  (a) output that drains AFTER the stamp. `emitText` leaves on a 16 ms
 *      AnsiBuffer timer (`utils/ansi-buffer.util.ts`), and the graphics prompt
 *      can be deferred behind `session.pendingScreenCommand`. Either can land
 *      on the wire once terminalType is already 'c64' - i.e. with
 *      `sessionWantsPetscii` TRUE - and be transduced into the model as if it
 *      were C64 screen content. Test 1.
 *  (b) the web `P` answer (`handlers/command-handler/pre-login.ts`). Before it
 *      the model does not exist; the reset there DEFINES the origin from which
 *      everything after - the terminal-resize, the SIMULATING banner, the
 *      first screen - is legitimately modelled. Tests 2 and 3.
 *
 * The model state is sampled ABOVE the choke, immediately BEFORE each emit is
 * transduced, which is what "the model at the flip" means: the cursor the
 * first post-flip byte is encoded against.
 *
 * Mock harness copied from `tests/handlers/c64-connect-probe.test.ts`, the
 * suite that already drives this dispatcher safely (command.handler.ts has
 * many static imports that would otherwise boot real servers/DB/emulators at
 * require() time).
 */
process.env.SKIP_DB_INIT = '1';

import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';

const loadBBSConfigMock = jest.fn(() => ({ system_password: '' }));

/**
 * A `.seq` paint, standing in for the real BBSTITLE.SEQ: `$93` (clear+home).
 * It is what makes test 3's "the reset is at the flip, not at the first
 * `.seq`" assertion have a first `.seq` to be earlier than.
 */
const BBSTITLE_SEQ_BYTES = Buffer.from([0x93]);
const displayScreenMock = jest.fn(async (socket: any, _session: any, _name: string) => {
  socket.emit('petscii-bytes', BBSTITLE_SEQ_BYTES.toString('base64'));
  return true;
});
const doPauseMock = jest.fn();

jest.mock('../../src/index', () => {
  const states = require('../../src/constants/bbs-states');
  return {
    BBSState: states.BBSState,
    LoggedOnSubState: states.LoggedOnSubState,
    // telnet-server.ts imports this (and the BBSSession type) from index.
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

jest.mock('../../src/handlers/screen.handler', () => ({
  displayScreen: displayScreenMock,
  doPause: doPauseMock,
  handlePaginatedScreenInput: jest.fn(async () => true),
}));

jest.mock('../../src/amiga-emulation/loader/LibraryLoader', () => ({ LibraryLoader: jest.fn() }));
jest.mock('../../src/amiga-emulation/AmigaDoorSession', () => ({ AmigaDoorSession: jest.fn() }));
jest.mock('../../src/handlers/operations/conference.handler', () => ({
  displayConferenceBulletins: jest.fn(async () => true),
  joinConference: jest.fn(async () => true),
}));
jest.mock('../../src/handlers/message/message-scan.handler', () => ({
  performConferenceScan: jest.fn(async () => true),
}));
jest.mock('../../src/handlers/door.handler', () => ({
  executeDoor: jest.fn(),
  displayDoorMenu: jest.fn(),
}));
jest.mock('../../src/handlers/command-handler/menu', () => ({
  displayMainMenu: jest.fn(),
  displayMenuPrompt: jest.fn(),
}));
jest.mock('../../src/handlers/file/download.handler', () => ({
  DownloadHandler: {
    handleConfirmInput: jest.fn(),
    handleFilenameInput: jest.fn(),
    handlePGoodbyeInput: jest.fn(),
  },
}));
jest.mock('../../src/utils/conference-tooltypes.util', () => ({
  getConferenceToolFlags: jest.fn(() => ({
    forceNewscan: false, noNewscan: false, showNewFiles: false,
    noNewFiles: false, forceMenus: false, noBulls: false, noConfBulls: false,
  })),
}));
// Empty system password: both flip paths fall straight through to BBSTITLE.
jest.mock('../../src/services/bbs-config-file.service', () => ({
  loadBBSConfig: loadBBSConfigMock,
}));

import { AnsiToPetsciiTransducer } from '@amiexpress/bbs-door-sdk/petscii';
import {
  installPetsciiModelChoke,
  petsciiTerminalModelFor,
} from '../../src/utils/petscii-session-model';
import { emitText } from '../../src/utils/output.util';

interface Snapshot { x: number; y: number; bank: number; pen: number }
interface Seen { event: string; arg0: any; state: Snapshot | null }

/** What the model says the screen looks like right now, or null if it has none. */
function snapshot(session: any): Snapshot | null {
  const model = session.petsciiTransducer;
  if (!model) return null;
  const s = model.machine.state;
  return { x: s.cursorX, y: s.cursorY, bank: s.charsetBank, pen: s.pen };
}

const HOME: Snapshot = { x: 0, y: 0, bank: 0, pen: 14 };
const MODEL_EVENTS = ['ansi-output', 'petscii-output', 'petscii-bytes'];

/**
 * A web-shaped socket carrying the choke, with a recorder installed ABOVE it.
 *
 * Above, not below: the recorder must sample the model BEFORE the emit it is
 * recording is transduced, because the question this suite asks is "what
 * cursor was the first post-flip byte encoded against".
 */
function makeChokedSocket(id: string, session: any) {
  const seen: Seen[] = [];
  const socket: any = {
    id,
    session,
    on() { /* AnsiBuffer registers a disconnect cleanup */ },
    emit(_event: string, ..._args: any[]) { return true; },
  };
  installPetsciiModelChoke(socket);
  const belowChoke = socket.emit;
  socket.emit = function (event: string, ...args: any[]) {
    seen.push({ event, arg0: args[0], state: snapshot(session) });
    return belowChoke.call(socket, event, ...args);
  };
  return { socket, seen };
}

/** The emits the model actually sees, from `from` onwards. */
function modelVisible(seen: Seen[], from = 0): Seen[] {
  return seen.slice(from).filter((e) => MODEL_EVENTS.includes(e.event) && typeof e.arg0 === 'string');
}

let socketCounter = 0;
/**
 * A fresh socket id per test: `utils/ansi-buffer.util.ts` caches one AnsiBuffer
 * per socket id in a module-level Map with no test-scoped reset, so a shared id
 * would leak buffered-but-unflushed text between tests.
 */
const nextId = (name: string) => `oc5-${name}-${(socketCounter += 1)}`;

function baseSession(): any {
  return {
    state: BBSState.AWAIT,
    subState: LoggedOnSubState.DISPLAY_CONNECT,
    terminalType: 'unknown',
    nodeId: 1,
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
  };
}

/** A chunk that leaves the model somewhere no fresh 40x25 screen ever is. */
const POISON = '\x1b[13;1H\x1b[35mhello';

describe('OC-5: the model is reset where a session becomes PETSCII', () => {
  let handleCommand: typeof import('../../src/handlers/command.handler').handleCommand;
  let resetSpy: jest.SpyInstance;
  let transduceSpy: jest.SpyInstance;
  const realReset = AnsiToPetsciiTransducer.prototype.reset;

  beforeAll(() => {
    ({ handleCommand } = require('../../src/handlers/command.handler'));
  });

  beforeEach(() => {
    displayScreenMock.mockClear();
    doPauseMock.mockClear();
    loadBBSConfigMock.mockClear();
    loadBBSConfigMock.mockReturnValue({ system_password: '' });
    // Prototype spies, never a spy on the module export: ts-jest binds
    // intra-module calls locally, so a spy on `petsciiTerminalModelFor` or on
    // `resetPetsciiModel` records ZERO whether the path runs or not (I4).
    resetSpy = jest.spyOn(AnsiToPetsciiTransducer.prototype, 'reset');
    transduceSpy = jest.spyOn(AnsiToPetsciiTransducer.prototype, 'transduce');
  });

  afterEach(() => {
    resetSpy.mockRestore();
    transduceSpy.mockRestore();
    jest.useRealTimers();
  });

  test('a prompt that drains after the C64 is detected does not describe the C64 screen', async () => {
    const session = baseSession();
    const { socket, seen } = makeChokedSocket(nextId('drain'), session);

    // Window (a): a chunk is armed while the caller is still unclassified, so
    // it sits in the 16 ms AnsiBuffer...
    jest.useFakeTimers();
    emitText(socket, POISON);
    expect(modelVisible(seen)).toHaveLength(0);

    // ...index.ts's DEL-probe stamps terminalType='c64' on the raw byte...
    session.terminalType = 'c64';

    // ...and only THEN does the buffer drain, through a choke that now says
    // this session is PETSCII.
    jest.advanceTimersByTime(20);
    jest.useRealTimers();
    expect(modelVisible(seen)).toHaveLength(1);
    const poisoned = snapshot(session);
    expect(poisoned).not.toBeNull();
    expect(poisoned!.y).toBe(12);         // the window is real, not hypothetical
    expect(poisoned!.bank).toBe(1);

    // The flip itself: the live dispatcher's DISPLAY_CONNECT c64 branch.
    const before = seen.length;
    await handleCommand(socket, session, '\x7f');

    expect(session.petsciiMode).toBe(true);
    const after = modelVisible(seen, before);
    expect(after.length).toBeGreaterThan(0);
    // completeRealC64Connect's ESC[2J ESC[H resync is the first byte written
    // after the flip; the model it is encoded against must be a fresh screen.
    expect(after[0].arg0).toBe('\x1b[2J\x1b[H');
    expect(after[0].state).toEqual(HOME);
  });

  test('a web caller who answers P starts at home', async () => {
    const session = baseSession();
    session.subState = LoggedOnSubState.ANSI_PROMPT;
    session.terminalType = 'modern';
    session.tempData = { inputBuffer: 'P' };
    const { socket, seen } = makeChokedSocket(nextId('web-p'), session);

    // Window (b) needs a model that already exists and has already moved.
    petsciiTerminalModelFor(session).transduce(POISON);
    expect(snapshot(session)!.y).toBe(12);

    const before = seen.length;
    await handleCommand(socket, session, '\r');

    expect(session.petsciiMode).toBe(true);
    // The first thing written after the flip - the BBSTITLE `.seq` paint - is
    // encoded against a fresh 40x25 screen, not against the row the model was
    // left on before this caller was PETSCII at all.
    const after = modelVisible(seen, before);
    expect(after.length).toBeGreaterThan(0);
    expect(after[0].state).toEqual(HOME);
    expect(resetSpy).toHaveBeenCalledTimes(1);

    // ...and the SIMULATING banner is modelled, from that origin - it is not
    // written straight to the wire behind the model's back.
    const transduced = transduceSpy.mock.calls.map((c) => String(c[0]));
    expect(transduced.some((t) => t.includes('PETSCII: SIMULATING C64 DISPLAY (40X25)'))).toBe(true);
  });

  test('the reset is at the flip, not at the first .seq', async () => {
    const session = baseSession();
    session.subState = LoggedOnSubState.ANSI_PROMPT;
    session.terminalType = 'modern';
    session.tempData = { inputBuffer: 'P' };
    const { socket, seen } = makeChokedSocket(nextId('sentinel'), session);
    petsciiTerminalModelFor(session).transduce(POISON);

    let seenAtReset = -1;
    resetSpy.mockImplementation(function (this: AnsiToPetsciiTransducer) {
      seenAtReset = seen.length;
      return realReset.call(this);
    });

    await handleCommand(socket, session, '\r');

    expect(resetSpy).toHaveBeenCalledTimes(1);
    const firstSeq = seen.findIndex((e) => e.event === 'petscii-bytes');
    expect(firstSeq).toBeGreaterThanOrEqual(0);   // the .seq paint happened
    expect(seenAtReset).toBeGreaterThanOrEqual(0);
    expect(seenAtReset).toBeLessThanOrEqual(firstSeq);
    expect(seen[firstSeq].state).toEqual(HOME);
  });

  test('a telnet C64 detected after a chunk already drained gets a fresh model', async () => {
    // The telnet flip site, driven through the real TelnetServer connection
    // path: a socket connects, the DEL-probe stamps terminalType='c64' on its
    // first byte (`src/index.ts`), a chunk that was already on its way drains
    // into the model, and only THEN does TTYPE resolve and the session flip.
    // Everything BBSTITLE.SEQ is encoded against starts here.
    jest.useFakeTimers();
    const { TelnetServer } = require('../../src/server/telnet-server');
    const server = new TelnetServer(2323);
    const netSocket: any = new (require('events').EventEmitter)();
    netSocket.remoteAddress = '127.0.0.1';
    netSocket.write = jest.fn();
    netSocket.end = jest.fn();
    netSocket.setNoDelay = jest.fn();

    (server as any).handleConnection(netSocket);
    const connection: any = Array.from((server as any).connections.values())[0];
    expect(connection?.session).toBeDefined();

    connection.session.terminalType = 'c64';                       // the DEL-probe stamp
    petsciiTerminalModelFor(connection.session).transduce(POISON); // the chunk that drained after it
    expect(snapshot(connection.session)!.y).toBe(12);

    let atDetect: Snapshot | null = null;
    server.on('c64-detected', (c: any) => { atDetect = snapshot(c.session); });

    // TTYPE resolves: the once('terminal-type') listener calls showPrompt(),
    // whose C64 branch runs to `this.emit('c64-detected', ...)` with no await
    // in between.
    connection.emit('terminal-type', {
      terminalType: 'C64', isC64: true, isAmiga: false,
      unicodeCapable: false, width: 40, height: 25,
    });

    expect(connection.session.petsciiMode).toBe(true);
    expect(atDetect).toEqual(HOME);
    jest.clearAllTimers();
  });
});
