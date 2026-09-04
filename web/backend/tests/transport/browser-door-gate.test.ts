/**
 * Task TP-6 of `thoughts/shared/plans/2026-09-03-ssh-telnet-parity.md`:
 * THE BROWSER-DOOR TRANSPORT GATE, AND THE R ANSWER AT THE GRAPHICS PROMPT.
 *
 * Every case here drives a REAL path. The door cases go through the real
 * `executeDoor` with a real `TelnetConnection` over a stub `net.Socket` and
 * read the bytes the SOCKET received - the same rule TP-1 set and for the same
 * reason: a mock `connection.write` proves nothing about what a caller sees.
 * The graphics-prompt case goes through the real `handlePreLoginInput`.
 *
 * TP-1 case 3 ("a browser-only door refuses a telnet caller instead of
 * freezing it", tests/transport/parity-symptoms.test.ts) is the symptom this
 * task closes; case 1 below is its sibling with the reachability sentinels the
 * symptom test deliberately does not carry.
 *
 * `src/index.ts` is mocked away: it runs a top-level IIFE that starts the
 * HTTP/telnet/SSH servers on module load.
 */
process.env.SKIP_DB_INIT = '1';

import 'reflect-metadata';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
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

import { TelnetConnection } from '../../src/server/telnet-server';
import { buildConnectionEmitter } from '../../src/server/connection-emitter';
import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';
import { flushAllBuffers } from '../../src/utils/ansi-buffer.util';
import {
  executeDoor,
  displayDoorMenu,
  formatDoorLine,
  setDoors,
  setHelpers,
  type Door,
} from '../../src/handlers/door.handler';
import { handlePreLoginInput } from '../../src/handlers/command-handler/pre-login';
import { displayScreen } from '../../src/handlers/screen.handler';
import { getClientDoorBridge } from '../../src/doors/client-door-bridge';
import { doorDropFileManager } from '../../src/services/DoorDropFileManager';
import { transportCapabilities } from '../../src/server/transport-adapter';
import { DOOR_NEEDS_BROWSER_NOTICE } from '../../src/utils/door-min-columns.util';
import { config } from '../../src/config';
import type { BBSSession } from '../../src/index';

setHelpers({
  callersLog: async () => undefined,
  getRecentCallerActivity: async () => [],
});

/** The stub `net.Socket` every byte case is driven over (TP-1's rule). */
class StubNetSocket extends EventEmitter {
  public remoteAddress = '127.0.0.1';
  public written: Buffer[] = [];

  constructor() {
    super();
    this.write = this.write.bind(this);
  }

  write(data: Buffer | string): boolean {
    this.written.push(typeof data === 'string' ? Buffer.from(data, 'latin1') : Buffer.from(data));
    return true;
  }

  end(): void { /* the close path is TP-13b's */ }

  since(from: number): Buffer {
    return Buffer.concat(this.written.slice(from));
  }
}

function baseSession(nodeId: number, overrides: Partial<BBSSession> = {}): BBSSession {
  return {
    state: BBSState.LOGGEDON,
    subState: LoggedOnSubState.PROCESS_COMMAND,
    user: { id: nodeId, username: `CALLER${nodeId}`, secLevel: 255 },
    nodeId,
    currentConf: 1,
    conferenceId: 1,
    currentMsgBase: 1,
    timeRemaining: 3600,
    lastActivity: Date.now(),
    confRJoin: 1,
    msgBaseRJoin: 1,
    commandBuffer: '',
    menuPause: false,
    inputBuffer: '',
    relConfNum: 1,
    currentConfName: 'Main',
    cmdShortcuts: false,
    doorExpertMode: false,
    connectionType: 'telnet',
    terminalType: 'ansi',
    petsciiMode: false,
    screenWidth: 80,
    screenHeight: 24,
    tempData: {},
    ...overrides,
  } as unknown as BBSSession;
}

/** A real TelnetConnection over a stub socket, plus the real emitter. */
function realTelnetCaller(nodeId: number, sessionOverrides: Partial<BBSSession> = {}) {
  const socket = new StubNetSocket();
  const connection = new TelnetConnection(socket as unknown as import('net').Socket);
  const session = baseSession(nodeId, sessionOverrides);
  connection.session = session;
  const emitter = buildConnectionEmitter(connection);
  // initializeTelnet() wrote seven negotiation commands in the constructor.
  const preamble = socket.written.length;
  return { socket, connection, session, emitter, preamble };
}

/** A browser caller: a socket.io-shaped recorder, `connectionType: 'web'`. */
function webCaller(nodeId: number, sessionOverrides: Partial<BBSSession> = {}) {
  const emitted: Array<{ event: string; data: unknown }> = [];
  const listeners = new EventEmitter();
  const socket = {
    id: `web-socket-${nodeId}`,
    connected: true,
    emit(event: string, data?: unknown) {
      emitted.push({ event, data });
      return true;
    },
    // The output buffer registers a 'disconnect' cleanup handler on every
    // socket it sees (utils/ansi-buffer.util.ts:176); a browser socket has one.
    on(event: string, handler: (...args: unknown[]) => void) { listeners.on(event, handler); return socket; },
    once(event: string, handler: (...args: unknown[]) => void) { listeners.once(event, handler); return socket; },
    off(event: string, handler: (...args: unknown[]) => void) { listeners.off(event, handler); return socket; },
    removeListener(event: string, handler: (...args: unknown[]) => void) { listeners.off(event, handler); return socket; },
  };
  const session = baseSession(nodeId, { connectionType: 'web', ...sessionOverrides });
  return { socket, session, emitted };
}

/** A temporary BBS root with `config` pointed at it. */
function tempBbsRoot(prefix: string): { root: string; cleanup: () => void } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const previousDataDir = process.env.BBS_DATA_DIR;
  const previousRoot = process.env.BBS_ROOT;
  process.env.BBS_DATA_DIR = root;
  process.env.BBS_ROOT = root;
  const realGet = config.get.bind(config);
  const realGetConfig = config.getConfig.bind(config);
  jest.spyOn(config, 'get').mockImplementation(((key: string) =>
    key === 'dataDir' ? root : (realGet as (k: string) => unknown)(key)) as never);
  jest.spyOn(config, 'getConfig').mockImplementation(
    (() => ({ ...(realGetConfig() as unknown as Record<string, unknown>), dataDir: root })) as never,
  );
  return {
    root,
    cleanup: () => {
      jest.restoreAllMocks();
      if (previousDataDir === undefined) delete process.env.BBS_DATA_DIR;
      else process.env.BBS_DATA_DIR = previousDataDir;
      if (previousRoot === undefined) delete process.env.BBS_ROOT;
      else process.env.BBS_ROOT = previousRoot;
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

/** Write a door directory with the given manifest and return the Door record. */
function installDoor(
  root: string,
  name: string,
  manifest: Record<string, unknown>,
  toolTypes?: Record<string, string>,
): Door {
  const dir = path.join(root, 'Doors', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: name.toLowerCase(), version: '1.0.0', ...manifest }));
  return {
    id: name.toLowerCase(),
    name,
    description: `${name} test door`,
    command: name.toUpperCase(),
    path: `Doors/${name}`,
    accessLevel: 0,
    enabled: true,
    type: 'typescript',
    ...(toolTypes ? { toolTypes } : {}),
  } as unknown as Door;
}

/** Every live bridge session, closed. A leak here is an open handle. */
function endAllBridgeSessions(): void {
  const bridge = getClientDoorBridge();
  const sessions = (bridge as unknown as { sessions: Map<string, unknown> }).sessions;
  for (const id of Array.from(sessions.keys())) bridge.endSession(id);
}

describe('TP-6 - the browser-door transport gate', () => {
  beforeEach(() => {
    // The auto-mocked drop-file manager is the "the door was let in" sentinel
    // and is module-level: without this it carries the previous case's count.
    (doorDropFileManager.createAllDropFiles as jest.Mock).mockClear();
  });

  afterEach(() => {
    endAllBridgeSessions();
    jest.restoreAllMocks();
  });

  it('a client-only door refuses a telnet caller', async () => {
    const { root, cleanup } = tempBbsRoot('tp6-client-');
    const door = installDoor(root, 'BrowserOnly', { runtime: 'client' });
    const bridge = getClientDoorBridge();
    const startSession = jest.spyOn(bridge, 'startSession');
    const { socket, session, emitter, preamble } = realTelnetCaller(80);

    try {
      await executeDoor(emitter, session, door);
      flushAllBuffers();

      const wire = socket.since(preamble).toString('latin1');
      expect(wire).toContain('THIS DOOR NEEDS A WEB BROWSER');
      expect(session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
      expect(session.menuPause).toBe(false);
      expect(session.inDoorManager).toBeUndefined();
      // Gate 3b: the refusal is a REFUSAL, not a late teardown. No bridge
      // session was started, so there is no 30 s keepalive and no no-op input
      // handler - the three things that made the screen freeze.
      expect(startSession).toHaveBeenCalledTimes(0);
      expect((session as unknown as { doorInputHandler?: unknown }).doorInputHandler).toBeUndefined();
      // And the door never got as far as being launched.
      expect(doorDropFileManager.createAllDropFiles).not.toHaveBeenCalled();
    } finally {
      cleanup();
    }
  }, 20000);

  it('a hybrid door runs its server half on telnet instead of returning at the client half', async () => {
    // The `if (!hybridSessionId) return;` line: with the client half skipped on
    // a byte transport, control MUST fall through to the type switch. This is
    // the plan's "single most easily-missed line".
    const { root, cleanup } = tempBbsRoot('tp6-hybrid-');
    const door = installDoor(root, 'HybridDoor', {
      runtime: 'hybrid',
      server: { entry: './server.ts' },
      client: { entry: './client.ts' },
    });
    const bridge = getClientDoorBridge();
    const startSession = jest.spyOn(bridge, 'startSession');
    const { socket, session, emitter, preamble } = realTelnetCaller(81);

    try {
      await executeDoor(emitter, session, door);
      flushAllBuffers();

      const wire = socket.since(preamble).toString('latin1');
      expect(wire).not.toContain('THIS DOOR NEEDS A WEB BROWSER');
      expect(startSession).toHaveBeenCalledTimes(0);
      // Sentinel 1: the drop files are written on the line AFTER the hybrid
      // block, so this call can only have happened if the block fell through.
      expect(doorDropFileManager.createAllDropFiles).toHaveBeenCalledTimes(1);
      // Sentinel 2: executeTypeScriptDoor's first act is to hide the cursor.
      // Its bytes on the wire prove the TYPE SWITCH was reached, not merely
      // that executeDoor did not return early.
      expect(wire).toContain('\x1b[?25l');
    } finally {
      cleanup();
    }
  }, 20000);

  it('arkanoid refuses rather than hangs, and its registration is what says so', async () => {
    // The board's own registration carries the tooltype: without it the gate is
    // unreachable in production and this whole task is dead code.
    const registration = fs.readFileSync(
      path.resolve(__dirname, '../../../../Commands/BBSCmd/ARKANOID.info'),
      'latin1',
    );
    expect(registration).toContain('CLIENT_ONLY=YES');

    const { root, cleanup } = tempBbsRoot('tp6-arkanoid-');
    // Arkanoid's real manifest shape: hybrid, with an RPC-only server half.
    const door = installDoor(
      root,
      'Arkanoid',
      { runtime: 'hybrid', server: { entry: './server.ts' }, client: { entry: './client.ts' } },
      { CLIENT_ONLY: 'YES' },
    );
    const bridge = getClientDoorBridge();
    const startSession = jest.spyOn(bridge, 'startSession');
    const { socket, session, emitter, preamble } = realTelnetCaller(82);

    try {
      // No timeout wrapper needed to prove it does not hang: before this task
      // the same call awaited bridge.waitForSessionEnd(), a promise a byte
      // transport can never resolve, and jest killed the suite. It returning
      // at all is the assertion.
      await executeDoor(emitter, session, door);
      flushAllBuffers();

      const wire = socket.since(preamble).toString('latin1');
      expect(wire).toContain('THIS DOOR NEEDS A WEB BROWSER');
      expect(session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
      expect(startSession).toHaveBeenCalledTimes(0);
      expect(doorDropFileManager.createAllDropFiles).not.toHaveBeenCalled();
      expect((bridge as unknown as { sessions: Map<string, unknown> }).sessions.size).toBe(0);
    } finally {
      cleanup();
    }
  }, 20000);

  it('a web caller still gets every client door', async () => {
    // The guard that this task refuses nobody it should not.
    const { root, cleanup } = tempBbsRoot('tp6-web-');
    const clientDoor = installDoor(root, 'BrowserOnly', { runtime: 'client' });
    const arkanoidLike = installDoor(
      root,
      'Arkanoid',
      { runtime: 'hybrid', server: { entry: './server.ts' } },
      { CLIENT_ONLY: 'YES' },
    );
    const bridge = getClientDoorBridge();
    const startSession = jest
      .spyOn(bridge, 'startSession')
      .mockImplementation(() => 'tp6-fake-session');
    // The RPC-only server half parks on this promise until the browser closes
    // the door. There is no browser in a test, so it resolves at once - the
    // case is about the CLIENT half being started, not about the wait.
    jest.spyOn(bridge, 'waitForSessionEnd').mockResolvedValue(undefined as never);

    try {
      for (const door of [clientDoor, arkanoidLike]) {
        startSession.mockClear();
        const { socket, session, emitted } = webCaller(83);
        await executeDoor(socket as never, session, door);
        flushAllBuffers();

        expect(startSession).toHaveBeenCalledTimes(1);
        expect(emitted.map((e) => e.event)).toContain('door:load-client');
        const text = emitted
          .filter((e) => e.event === 'ansi-output')
          .map((e) => String(e.data))
          .join('');
        expect(text).not.toContain('THIS DOOR NEEDS A WEB BROWSER');
      }
    } finally {
      cleanup();
    }
  }, 30000);

  it('the DOORS list marks a browser-only door for a caller with no browser', async () => {
    const { root, cleanup } = tempBbsRoot('tp6-list-');
    fs.mkdirSync(path.join(root, 'Doors', 'Arkanoid'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'Doors', 'Arkanoid', 'package.json'),
      JSON.stringify({ name: 'arkanoid', version: '2.0.0', runtime: 'hybrid' }),
    );
    fs.mkdirSync(path.join(root, 'Doors', 'Dopewars'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'Doors', 'Dopewars', 'package.json'),
      JSON.stringify({ name: 'dopewars', version: '1.0.0', runtime: 'server' }),
    );

    const previousDoors = [
      {
        id: 'arkanoid', name: 'Arkanoid', description: 'a browser-only door',
        command: 'ARKANOID', path: 'Doors/Arkanoid', accessLevel: 0, enabled: true,
        type: 'typescript', toolTypes: { CLIENT_ONLY: 'YES' },
      },
      {
        id: 'dopewars', name: 'Dopewars', description: 'a server door',
        command: 'DOPEWARS', path: 'Doors/Dopewars', accessLevel: 0, enabled: true,
        type: 'typescript',
      },
    ] as unknown as Door[];
    setDoors(previousDoors);

    try {
      const { socket, session, emitter, preamble } = realTelnetCaller(84, {
        subState: LoggedOnSubState.DISPLAY_MENU,
      });
      await displayDoorMenu(emitter, session, '');
      flushAllBuffers();
      const telnetList = socket.since(preamble).toString('latin1');

      const arkanoidRow = telnetList.split('\r\n').find((row) => row.includes('Arkanoid'));
      const dopewarsRow = telnetList.split('\r\n').find((row) => row.includes('Dopewars'));
      expect(arkanoidRow).toBeDefined();
      expect(dopewarsRow).toBeDefined();
      expect(arkanoidRow).toContain('[WEB]');
      expect(dopewarsRow).not.toContain('[WEB]');
      // Marked, never hidden: a sysop's door must not vanish with no reason.
      expect(telnetList).toContain('Arkanoid');

      // The mirror image: the same two doors on a browser caller carry no
      // marker at all, which is what keeps the web list byte-identical.
      const web = webCaller(85, { subState: LoggedOnSubState.DISPLAY_MENU });
      await displayDoorMenu(web.socket as never, web.session, '');
      flushAllBuffers();
      const webList = web.emitted
        .filter((e) => e.event === 'ansi-output')
        .map((e) => String(e.data))
        .join('');
      expect(webList).toContain('Arkanoid');
      expect(webList).not.toContain('[WEB]');
    } finally {
      setDoors([]);
      cleanup();
    }
  }, 30000);

  it('formatDoorLine adds no marker unless the caller is told the browser is missing', () => {
    // The default that keeps every existing caller, and every identity pin
    // built on this function, rendering exactly the bytes it did before.
    const browserOnly = {
      id: 'arkanoid', name: 'Arkanoid', command: 'ARKANOID',
      type: 'typescript', doorType: 'TS', toolTypes: { CLIENT_ONLY: 'YES' },
    };
    expect(formatDoorLine(browserOnly, false)).not.toContain('[WEB]');
    expect(formatDoorLine(browserOnly, false, false, true)).toContain('[WEB]');
  });

  it('a byte transport reports no browser and no RIP; a browser reports both', () => {
    // The instrument this whole task reads, checked against a case whose
    // answer is known (REACHABILITY_PROTOCOL section 3).
    for (const type of ['telnet', 'ssh'] as const) {
      const caps = transportCapabilities({ connectionType: type });
      expect(caps.browser).toBe(false);
      expect(caps.rip).toBe(false);
      expect(caps.bytes).toBe(true);
    }
    const web = transportCapabilities({ connectionType: 'web' });
    expect(web.browser).toBe(true);
    expect(web.rip).toBe(true);
    expect(web.bytes).toBe(false);
  });

  it('the notice is uppercase ASCII, the way a power-on C64 can read it', () => {
    // DOOR_NEEDS_80_NOTICE's rule, applied to its browser cousin.
    expect(DOOR_NEEDS_BROWSER_NOTICE).toBe('\r\nTHIS DOOR NEEDS A WEB BROWSER\r\n');
    expect(DOOR_NEEDS_BROWSER_NOTICE).toMatch(/^[\r\nA-Z0-9 .,:'-]+$/);
  });
});

describe('TP-6 - the R answer at the graphics prompt', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function bbsTitleRoot(prefix: string, nodeId: number) {
    const created = tempBbsRoot(prefix);
    // express.e:6544-6640 - BBSTITLE is read from the CALLER'S node directory.
    // `screenSearchLocations` (utils/screen-security.util.ts) is the one module
    // the loader and the admin's screen manager both read, and for BBSTITLE it
    // lists `Node<N>` and nothing else: the global `Screens/` fallback was this
    // port's invention and has been removed, so a fixture written there is a
    // file the board never looks at. Write where it actually looks.
    fs.mkdirSync(path.join(created.root, `Node${nodeId}`), { recursive: true });
    // A .rip screen exists, so the RIP framing is genuinely available - which
    // is what makes "no framing reached the caller" mean something.
    fs.writeFileSync(
      path.join(created.root, `Node${nodeId}`, 'BBSTITLE.rip'),
      '!|1B00000000000000\r\n',
      'latin1',
    );
    return created;
  }

  async function answerGraphicsPrompt(
    emitterOrSocket: unknown,
    session: BBSSession,
    answer: string,
  ): Promise<void> {
    session.state = BBSState.AWAIT;
    session.subState = LoggedOnSubState.ANSI_PROMPT;
    session.tempData = { inputBuffer: '' };
    for (const ch of answer) {
      await handlePreLoginInput(emitterOrSocket as never, session, ch);
    }
    await handlePreLoginInput(emitterOrSocket as never, session, '\r');
  }

  it('answering R on telnet does not ship RIPscrip source across the screen', async () => {
    const { root, cleanup } = bbsTitleRoot('tp6-rip-telnet-', 86);
    const { socket, session, emitter, preamble } = realTelnetCaller(86);

    try {
      await answerGraphicsPrompt(emitter, session, 'R');
      // The subsequent paint: the one that used to carry `!|` source as text.
      await displayScreen(emitter as never, session, 'BBSTITLE');
      flushAllBuffers();

      const wire = socket.since(preamble).toString('latin1');
      expect(session.ripMode).toBe(false);
      expect(session.ansiEnabled).toBe(true);
      expect(wire).toContain('RIP GRAPHICS NEED A WEB BROWSER - USING ANSI');
      // No pixel-mode framing, and no RIPscrip source either.
      expect(wire).not.toContain('\x1b[1!');
      expect(wire).not.toContain('!|');
    } finally {
      cleanup();
      void root;
    }
  }, 20000);

  it('answering R in a browser still arms the RIP canvas', async () => {
    // The DEAD/LIVE half of the instrument: the same driver, the same screen,
    // a web session - and the framing the telnet case asserts is absent.
    const { cleanup } = bbsTitleRoot('tp6-rip-web-', 87);
    const { socket, session, emitted } = webCaller(87);

    try {
      await answerGraphicsPrompt(socket, session, 'R');
      await displayScreen(socket as never, session, 'BBSTITLE');
      flushAllBuffers();

      const text = emitted
        .filter((e) => e.event === 'ansi-output')
        .map((e) => String(e.data))
        .join('');
      expect(session.ripMode).toBe(true);
      expect(text).not.toContain('RIP GRAPHICS NEED A WEB BROWSER');
      expect(text).toContain('\x1b[1!');
    } finally {
      cleanup();
    }
  }, 20000);
});
