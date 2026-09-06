/**
 * Task TP-1 of `thoughts/shared/plans/2026-09-03-ssh-telnet-parity.md`:
 * THE FIVE SYMPTOMS, NAMED THE WAY A SYSOP WOULD NAME THEM.
 *
 * This suite is committed RED on purpose. Four of its five cases fail against
 * today's tree with an assertion diff, and each one is turned green by a named
 * later task: case 1 by TP-5 (the wire encoder), case 2's adapter successor by
 * TP-3, case 3 by TP-6 (the browser-door gate), case 4 by TP-10 (the
 * session-emitter registry) and case 5 by TP-7 (game mode's transport guard).
 * It must therefore land on `main` only together with those tasks.
 *
 * THE MOCK-WRITE TRAP, AND THE RULE THAT CLOSES IT.
 * The emitter suites in this repo inject a fake `connection.write` that does
 * `Buffer.from(data, 'latin1')` (tests/server/eighty-col-choke-identity.test.ts
 * :370-378). That fake ALREADY produces the bytes TP-5 is meant to produce, so
 * an encoding test written on that idiom is green on arrival and proves
 * nothing: the defect is one layer lower, in `TelnetConnection.write`'s
 * `Buffer.from(data)` (src/server/telnet-server.ts:495 - no encoding argument,
 * i.e. UTF-8) and in `SSHConnection.write`'s `this.stream.write(data)`
 * (src/server/ssh-server.ts:136, Node's UTF-8 default).
 *
 * So every byte assertion here drives a REAL `TelnetConnection` over a stub
 * `net.Socket` and reads the bytes the SOCKET received. A mock
 * `connection.write` is banned, and the first case below asserts that ban
 * against this file's own source so the rule cannot rot.
 *
 * `src/index.ts` is mocked away: it runs a top-level IIFE that starts the
 * HTTP/telnet/SSH servers on module load, and `telnet-server.ts`,
 * `door.handler.ts` and `session-manager.ts` all import from it.
 */
process.env.SKIP_DB_INIT = '1';

import 'reflect-metadata';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EventEmitter } from 'events';
import { readFileSync } from 'fs';

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

import { TelnetConnection } from '../../src/server/telnet-server';
import { buildConnectionEmitter } from '../../src/server/connection-emitter';
import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';
import { flushAllBuffers } from '../../src/utils/ansi-buffer.util';
import { executeDoor, setHelpers } from '../../src/handlers/door.handler';
import {
  handleNMConfirm,
  setMessageCommandsDependencies,
} from '../../src/handlers/message/message-commands.handler';
import { setSession, deleteSession } from '../../src/server/session-manager';
import { setupTelnetSSHHandler } from '../../src/server/transport-session';
import { createBBSApi } from '../../src/doors/BBSApi';
import { getClientDoorBridge } from '../../src/doors/client-door-bridge';
import { DoorInputManager } from '../../../../sdk/utils/door-input-manager';
import { config } from '../../src/config';
import type { Door } from '../../src/types';
import type { BBSSession } from '../../src/index';

setHelpers({
  callersLog: async () => undefined,
  getRecentCallerActivity: async () => [],
});

/**
 * The stub `net.Socket` every byte case is driven over. Only the two members
 * `TelnetConnection`'s constructor and `write` path touch: `on` (three
 * handlers) and the write sink. Deliberately NOT a stub of the connection -
 * see this file's header.
 */
class StubNetSocket extends EventEmitter {
  public remoteAddress = '127.0.0.1';
  public written: Buffer[] = [];
  public ended = 0;

  constructor() {
    super();
    // Assignment form, not an object literal, so the self-check below can ban
    // the mock-write idiom outright.
    this.write = this.write.bind(this);
  }

  write(data: Buffer | string): boolean {
    this.written.push(typeof data === 'string' ? Buffer.from(data, 'latin1') : Buffer.from(data));
    return true;
  }

  end(): void {
    this.ended += 1;
  }

  /** Bytes written since `from`, concatenated. */
  since(from: number): Buffer {
    return Buffer.concat(this.written.slice(from));
  }
}

function ansiTelnetSession(nodeId: number, overrides: Partial<BBSSession> = {}): BBSSession {
  return {
    state: BBSState.LOGGEDON,
    subState: LoggedOnSubState.DISPLAY_MENU,
    user: { id: nodeId, username: `TELNET${nodeId}`, secLevel: 100 },
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
  const session = ansiTelnetSession(nodeId, sessionOverrides);
  connection.session = session;
  const emitter = buildConnectionEmitter(connection);
  // initializeTelnet() wrote seven negotiation commands in the constructor;
  // everything a case asserts on starts after this mark.
  const preamble = socket.written.length;
  return { socket, connection, session, emitter, preamble };
}

describe('TP-1 - the five symptoms a sysop would report', () => {
  it('this suite never fakes the write that carries the bytes', () => {
    // The self-enforcing half of the mock-write ban (plan TP-1). A fake
    // `connection.write` in an object literal already encodes latin1 and would
    // make every encoding case pass on today's broken code.
    const source = String(readFileSync(__filename));
    expect(source).not.toMatch(/write:\s*\(/);
  });

  it("a telnet caller's art arrives in the bytes the file holds", () => {
    // Screens/BBSTITLE.txt carries 240 of U+00B7. Latin-1 / CP437 clients read
    // it as the single byte 0xB7; UTF-8 encoding turns it into 0xC2 0xB7, which
    // is the mojibake and the one-column overrun a classic client shows.
    const { socket, emitter, preamble } = realTelnetCaller(71);

    emitter.emit('ansi-output', 'A\u00B7B');

    const bytes = socket.since(preamble);
    expect(bytes.toString('hex')).toBe(Buffer.from([0x41, 0xb7, 0x42]).toString('hex'));
  });

  it('an event the emitter cannot render leaves a ruled, counted trace', () => {
    // TP-3's SUCCESSOR FORM. The case landed with TP-1 asserting today's
    // observables only - zero bytes, an `undefined` return, zero log lines -
    // because the adapter did not exist and the test could not name it. That
    // triple WAS the silent drop, and its RED evidence is in the ledger.
    //
    // TP-3 built the adapter, so the case now asserts what a drop must leave
    // behind: a record on the CONNECTION (`connection.transportDrops`), the
    // ruling that classified it, an occurrence count, and exactly ONE log line
    // however many times the name is emitted. Still no bytes: `door:load-client`
    // is browser-only and a byte terminal must not be sent anything for it.
    const { socket, connection, emitter, preamble } = realTelnetCaller(72);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => undefined);
    let errorCalls: string[] = [];
    let debugCalls: string[] = [];

    try {
      for (let i = 0; i < 3; i += 1) {
        emitter.emit('door:load-client', {
          doorId: 'arkanoid',
          sessionId: 'client-door-1',
          bundleUrl: '/api/doors/arkanoid/bundle.js',
        });
      }
    } finally {
      // The counts are TAKEN before the spies are restored: `mockRestore()`
      // resets the mock's own state, so a `toHaveBeenCalledTimes` after it
      // reads zero however many calls there were - which is exactly how this
      // case's TP-1 form could assert "zero log lines" and mean nothing.
      errorCalls = errorSpy.mock.calls.map((c) => String(c[0]));
      debugCalls = debugSpy.mock.calls.map((c) => String(c[0]));
      errorSpy.mockRestore();
      debugSpy.mockRestore();
    }

    const drops = (connection as unknown as {
      transportDrops?: Map<string, { event: string; count: number; ruling: string }>;
    }).transportDrops;

    expect(drops).toBeDefined();
    expect(drops?.get('door:load-client')).toEqual({
      event: 'door:load-client',
      count: 3,
      ruling: 'web-only',
    });
    // Ruled, so it is not the loud path.
    expect(errorCalls).toEqual([]);
    // Once per name per connection, not once per occurrence: a door emitting a
    // dropped name sixty times a second must not be able to fill the log.
    expect(debugCalls).toHaveLength(1);
    expect(debugCalls[0]).toContain("web-only event 'door:load-client'");
    // And still nothing on the wire.
    expect(socket.since(preamble).length).toBe(0);
  });

  it('a browser-only door refuses a telnet caller instead of freezing it', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tp1-client-door-'));
    const doorDir = path.join(root, 'Doors', 'BrowserOnly');
    fs.mkdirSync(doorDir, { recursive: true });
    fs.writeFileSync(
      path.join(doorDir, 'package.json'),
      JSON.stringify({ name: 'browseronly', version: '1.0.0', runtime: 'client' }),
    );
    const previousBbsRoot = process.env.BBS_ROOT;
    process.env.BBS_ROOT = root;
    const realConfigGet = config.get.bind(config);
    jest.spyOn(config, 'get').mockImplementation(((key: string) =>
      key === 'dataDir' ? root : (realConfigGet as (k: string) => unknown)(key)) as never);

    const { socket, session, emitter, preamble } = realTelnetCaller(73, {
      subState: LoggedOnSubState.PROCESS_COMMAND,
    });

    const door = {
      id: 'browseronly',
      name: 'BrowserOnly',
      description: 'a client-only door',
      command: 'BROWSERONLY',
      path: 'Doors/BrowserOnly',
      accessLevel: 0,
      enabled: true,
      type: 'typescript',
    } as unknown as Door;

    try {
      await executeDoor(emitter, session, door);
      flushAllBuffers();

      const wire = socket.since(preamble).toString('latin1');
      // TP-6's DOOR_NEEDS_BROWSER_NOTICE, uppercase-only ASCII per the
      // DOOR_NEEDS_80_NOTICE rule (utils/door-min-columns.util.ts:37-39).
      expect(wire).toContain('THIS DOOR NEEDS A WEB BROWSER');
      expect(session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
      expect(session.inDoorManager).toBeUndefined();
    } finally {
      // executeClientDoor started a bridge session with a 30 s keepalive
      // interval (doors/client-door-bridge.ts:324, :433-447). It is the very
      // thing TP-6 stops happening on a byte transport; until then the test
      // has to close it or jest hangs on the open handle.
      const bridge = getClientDoorBridge();
      const liveSessions = (bridge as unknown as { sessions: Map<string, unknown> }).sessions;
      for (const id of Array.from(liveSessions.keys())) bridge.endSession(id);
      jest.restoreAllMocks();
      if (previousBbsRoot === undefined) delete process.env.BBS_ROOT;
      else process.env.BBS_ROOT = previousBbsRoot;
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 20000);

  it('a telnet caller can be kicked', () => {
    const sysopEmitted: Array<{ event: string; data: unknown }> = [];
    const sysopSocket = {
      id: 'tp1-sysop-socket',
      connected: true,
      emit(event: string, data?: unknown) {
        sysopEmitted.push({ event, data });
        return true;
      },
      on() {
        return this;
      },
      off() {
        return this;
      },
      disconnect() {
        return this;
      },
    };

    const { socket, connection, session: victim, preamble } = realTelnetCaller(74);
    victim.currentStat = 0;

    const sysopSession = ansiTelnetSession(75, { connectionType: 'web' });
    const sessions = new Map<string, BBSSession>();
    sessions.set('74', victim);
    sessions.set('75', sysopSession);

    // The telnet caller is registered exactly the way telnet-server.ts
    // registers one: by the CONNECTION's sessionId. There is no socket.io
    // socket for it, so the io namespace cannot hold it - which is the
    // defect this case names.
    setSession(connection.sessionId, victim);

    // TP-10: and the caller is driven through the REAL transport entry point,
    // the one telnet-server.ts hands every connection to. That is where the
    // session is bound to its connection emitter
    // (server/session-emitter-registry.ts), so the kick can find a caller who
    // is in no socket.io room at all. Nothing here is a test-only shortcut:
    // this is the same call index.ts makes on 'connection'.
    setupTelnetSSHHandler(connection, 'telnet', {
      io: { sockets: { sockets: new Map() } } as never,
      sessions,
      nodeManager: { releaseSession: async () => undefined },
      handleCommand: () => undefined,
    });

    setMessageCommandsDependencies({
      messageBases: [],
      conferences: [],
      sessions,
      io: { sockets: { sockets: new Map() } } as never,
      joinConference: async () => true,
      displayScreen: () => true,
      resetNewMailScanPointers: async () => 0,
      resetLastMessageReadPointers: async () => 0,
      getConferenceStats: async () => ({}),
      updateMessageNumberRange: async () => true,
      getMailStatFile: async () => ({}),
    });

    jest.useFakeTimers();
    try {
      sysopSession.tempData = { nmNode: 74, nmOp: 'kick' };
      handleNMConfirm(sysopSocket, sysopSession, 'Y');
      // The kick's own 500 ms disconnect timer, but not the 1000 ms node-list
      // repaint that follows it.
      jest.advanceTimersByTime(600);
      flushAllBuffers();

      const wire = socket.since(preamble).toString('latin1');
      expect(wire).toContain('*** Disconnected by SYSOP ***');
      expect(socket.ended).toBeGreaterThan(0);
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
      deleteSession(connection.sessionId);
    }
  });

  it('a telnet arcade door moves on a keypress', () => {
    // isKeyStateActive() must answer "does this transport deliver key-down /
    // key-up EDGES". A character stream has no key-up, so a telnet caller must
    // get false and the door must take the character path it already has.
    const { emitter, session } = realTelnetCaller(76);
    const bbs = createBBSApi(emitter, session);

    const screen = {
      on: () => undefined,
      program: undefined,
    };
    const manager = new DoorInputManager({ bbs } as never, screen as never, {
      trackHeldKeys: true,
      enableMouse: false,
      enableAutoSuspend: false,
    });
    manager.enable();

    try {
      expect(manager.isKeyStateActive()).toBe(false);
    } finally {
      manager.disable();
    }
  });
});
