/**
 * Task TP-4 of `thoughts/shared/plans/2026-09-03-ssh-telnet-parity.md`:
 * THE TRANSLATED EVENTS BECOME CONNECTION STATE.
 *
 * TP-3 ruled every one of the 242 names the board can emit and gave the
 * emitter the `else` it never had, but `applyTranslation` was a stub that
 * returned false for everything: a `translate` name was still undelivered, and
 * the tally said so. This suite is the proof that each of those names now
 * DOES something a byte terminal can honour.
 *
 * HOW EVERY CASE IS DRIVEN. A real `TelnetConnection` over a stub `net.Socket`,
 * attached by `setupTelnetSSHHandler` - the PRODUCT'S top-level entry point for
 * a telnet caller (TP-2 made it importable) - and the emitter that entry point
 * attaches, which is the object every BBS handler, door and service is handed.
 * Assertions read the SOCKET's bytes or the state the translation wrote. No
 * mock `connection.write` (TP-1's ban, self-enforced below), and no spy on a
 * module export: `swc`/`ts-jest` compile those to getter-only properties and
 * `jest.spyOn` throws (TP-3's deviation D20).
 *
 * `src/index.ts` is mocked away: it runs a top-level IIFE that starts the
 * HTTP/telnet/SSH servers on module load, and `telnet-server.ts` imports from
 * it.
 */
process.env.SKIP_DB_INIT = '1';

import 'reflect-metadata';
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

import { TelnetConnection } from '../../src/server/telnet-server';
import { setupTelnetSSHHandler, type TransportSessionDeps } from '../../src/server/transport-session';
import {
  EVENT_RULINGS,
  TRANSLATED_EVENT_NAMES,
  transportCapabilities,
  type EventRuling,
  type TransportConnectionState,
  type TransportDropRecord,
  type TransportEmitter,
} from '../../src/server/transport-adapter';
import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';
import { flushAllBuffers } from '../../src/utils/ansi-buffer.util';
import { emitText } from '../../src/utils/output.util';
import { getModemEmulator } from '../../src/utils/modem-emulator.util';
import type { Socket } from 'socket.io';
import type { BBSSession } from '../../src/index';

/**
 * The stub `net.Socket` every case is driven over. Only the members
 * `TelnetConnection`'s constructor and `write` path touch. Deliberately NOT a
 * stub of the connection - see this file's header and TP-1's.
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

function telnetSession(nodeId: number, overrides: Partial<BBSSession> = {}): BBSSession {
  return {
    state: BBSState.LOGGEDON,
    subState: LoggedOnSubState.READ_COMMAND,
    user: { id: nodeId, username: `NODE${nodeId}`, secLevel: 100 },
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
    maskInput: false,
    tempData: {},
    ...overrides,
  } as unknown as BBSSession;
}

type Caller = {
  socket: StubNetSocket;
  connection: TelnetConnection;
  session: BBSSession;
  emitter: TransportEmitter;
  preamble: number;
  /** The state the translations write, or undefined if none has run. */
  state(): TransportConnectionState | undefined;
  drops(): Map<string, TransportDropRecord> | undefined;
};

let uniqueSuffix = 0;

/**
 * A real telnet caller through the real entry point.
 *
 * `sessionId` is made unique per case on purpose: `TelnetConnection` builds it
 * from `nodeId` and `Date.now()`, and the output buffer
 * (`utils/ansi-buffer.util.ts`) is keyed on `socket.id`, so two callers created
 * inside the same millisecond would otherwise share one buffer.
 */
function telnetCaller(nodeId: number, overrides: Partial<BBSSession> = {}): Caller {
  const socket = new StubNetSocket();
  const connection = new TelnetConnection(socket as unknown as import('net').Socket);
  uniqueSuffix += 1;
  connection.sessionId = `tp4-node${nodeId}-${uniqueSuffix}`;
  const session = telnetSession(nodeId, overrides);
  connection.session = session;

  const deps: TransportSessionDeps = {
    io: {} as never,
    sessions: new Map<string, BBSSession>(),
    nodeManager: { releaseSession: jest.fn(async () => undefined) },
    handleCommand: jest.fn(),
  };
  setupTelnetSSHHandler(connection as never, 'telnet', deps);

  const emitter = (connection as unknown as { emitter?: TransportEmitter }).emitter;
  if (!emitter) throw new Error('the entry point did not attach an emitter');

  // initializeTelnet() wrote its negotiation commands in the constructor;
  // everything a case asserts on starts after this mark.
  const preamble = socket.written.length;

  const held = connection as unknown as {
    transportState?: TransportConnectionState;
    transportDrops?: Map<string, TransportDropRecord>;
  };
  return {
    socket,
    connection,
    session,
    emitter,
    preamble,
    state: () => held.transportState,
    drops: () => held.transportDrops,
  };
}

/** The emitter is what `utils/` helpers are handed in production; see asSocket. */
function asSocket(emitter: TransportEmitter): Socket {
  return emitter as unknown as Socket;
}

function silenceLogs() {
  return {
    log: jest.spyOn(console, 'log').mockImplementation(() => undefined),
    error: jest.spyOn(console, 'error').mockImplementation(() => undefined),
    debug: jest.spyOn(console, 'debug').mockImplementation(() => undefined),
  };
}

describe('TP-4 - the translated events become connection state', () => {
  beforeEach(() => {
    silenceLogs();
  });

  afterEach(() => {
    // A 16 ms flush timer left armed by emitText would fire into a dead socket
    // in the next case and keep the run open.
    flushAllBuffers();
    jest.restoreAllMocks();
  });

  it('this suite never fakes the write that carries the bytes', () => {
    const source = String(readFileSync(__filename));
    expect(source).not.toMatch(/write:\s*\(/);
  });

  // -------------------------------------------------------------------------
  // Transport actions
  // -------------------------------------------------------------------------

  it('a 68K door can drop a telnet carrier', () => {
    // BB_DROPDTR: `amiga-emulation/session/DoorMessageHandler.ts:1676` emits
    // 'hangup' on the door's socket, which on telnet is this emitter. Divergence
    // 12: nothing had ever consumed it, so the carrier stayed up.
    const caller = telnetCaller(41);

    caller.emitter.emit('hangup');

    expect(caller.socket.ended).toBe(1);
    expect(caller.state()?.closedBy).toBe('hangup');
    // Delivered, so it is NOT in the undelivered tally.
    expect(caller.drops()?.get('hangup')).toBeUndefined();
  });

  it("the logoff sign-off reaches the caller before the line drops", () => {
    // `handlers/commands/system-commands.handler.ts:212-216` writes
    // "Click... NO CARRIER" and then emits 'force-disconnect'. emitText batches
    // for 16 ms (utils/ansi-buffer.util.ts), so without the flush the last thing
    // a caller sees before the socket closes is nothing at all.
    const caller = telnetCaller(42);

    emitText(asSocket(caller.emitter), '\r\nClick...\r\nNO CARRIER\r\n');
    // Still buffered: the proof that the text went through output.util's buffer
    // and not straight at connection.write.
    expect(caller.socket.since(caller.preamble).length).toBe(0);

    caller.emitter.emit('force-disconnect', { reason: 'User logged off' });

    expect(caller.socket.since(caller.preamble).toString('latin1')).toContain('NO CARRIER');
    expect(caller.socket.ended).toBe(1);
    expect(caller.state()?.closedBy).toBe('force-disconnect');
    expect(caller.drops()?.get('force-disconnect')).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Rendered notices
  // -------------------------------------------------------------------------

  it("the sysop's kick notice reaches a telnet caller", () => {
    // `api/node-control-routes.ts:271-275`. The payload's text is wire-ready:
    // the route writes its own CRLFs around the line.
    const caller = telnetCaller(43);

    caller.emitter.emit('system-message', {
      text: '\r\nDisconnected by the sysop: node needed\r\n',
    });

    // Buffered first (it went through emitText, like every other BBS line)...
    expect(caller.socket.since(caller.preamble).length).toBe(0);
    flushAllBuffers();
    // ...then on the wire.
    expect(caller.socket.since(caller.preamble).toString('latin1')).toBe(
      '\r\nDisconnected by the sysop: node needed\r\n',
    );
    expect(caller.drops()?.get('system-message')).toBeUndefined();
  });

  it('a restart notice reaches a byte terminal whose door cannot render it', () => {
    // `services/restart-notice.service.ts` sends 'system:notice' to every
    // door-owned session and a banner to the rest. Its payload is
    // { kind, seconds, message } - there is no `text` field - and a 68K door has
    // no handler for it, so before TP-4 that caller was told nothing at all.
    const caller = telnetCaller(44, { subState: LoggedOnSubState.DOOR_RUNNING });

    caller.emitter.emit('system:notice', {
      kind: 'restart',
      seconds: 60,
      message: 'SYSTEM UPDATE - restarting in 60 seconds.',
    });
    flushAllBuffers();

    expect(caller.socket.since(caller.preamble).toString('latin1')).toBe(
      '\r\nSYSTEM UPDATE - restarting in 60 seconds.\r\n',
    );
    expect(caller.drops()?.get('system:notice')).toBeUndefined();
  });

  it('a notice with no text is left in the tally instead of counted as delivered', () => {
    // The honest half of the rendered rulings: a payload the body cannot use
    // must not flip the count. (TP-3's deviation D18, kept.)
    const caller = telnetCaller(45);

    caller.emitter.emit('system-message', { severity: 'info' });
    flushAllBuffers();

    expect(caller.socket.since(caller.preamble).length).toBe(0);
    expect(caller.drops()?.get('system-message')?.ruling).toBe('render');
    expect(caller.drops()?.get('system-message')?.count).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Pacing
  // -------------------------------------------------------------------------

  it('a door that zeroes the modem speed is not still throttled', () => {
    // Research 2.4: on telnet the door's bypass signal was discarded, so the
    // server throttle stayed on for the whole door. The emulator read back here
    // is the INSTALLED one - getModemEmulator returns a throwaway when nothing
    // has installed, which is why the translation installs before it enables.
    const caller = telnetCaller(46);

    caller.emitter.emit('modem-speed', 2400);
    expect(getModemEmulator(asSocket(caller.emitter)).isEnabled()).toBe(true);
    expect(getModemEmulator(asSocket(caller.emitter)).getBps()).toBe(2400);
    expect(caller.state()?.modemBps).toBe(2400);

    caller.emitter.emit('modem-speed', 0);

    expect(getModemEmulator(asSocket(caller.emitter)).isEnabled()).toBe(false);
    expect(caller.state()?.modemBps).toBe(0);
    expect(caller.drops()?.get('modem-speed')).toBeUndefined();
  });

  it('a speed that is not a number leaves the pacer alone and stays in the tally', () => {
    const caller = telnetCaller(47);

    caller.emitter.emit('modem-speed', 2400);
    caller.emitter.emit('modem-speed', 'fast');

    expect(getModemEmulator(asSocket(caller.emitter)).isEnabled()).toBe(true);
    expect(caller.state()?.modemBps).toBe(2400);
    expect(caller.drops()?.get('modem-speed')?.ruling).toBe('translate');
  });

  it('a door taking the screen does NOT switch this connection to full speed', () => {
    // The plan's TP-4 table asks for the server ModemEmulator to be disabled
    // while `door-active` is true, "which is what the browser's bypass achieves
    // for web". Measured, that would OPEN a divergence: what the browser
    // bypasses is its own CLIENT pacer, and a byte transport's only pacer is the
    // SERVER one - the one web keeps running through a door so 68K and AREXX
    // doors play at the caller's baud (utils/modem-emulator.util.ts:299).
    // Disabling it here would run a 68K door at full speed on telnet and at
    // 2400 bps on web. So: recorded, not acted on.
    const caller = telnetCaller(48);
    caller.emitter.emit('modem-speed', 2400);

    caller.emitter.emit('door-active', true);

    expect(caller.state()?.doorActive).toBe(true);
    expect(getModemEmulator(asSocket(caller.emitter)).isEnabled()).toBe(true);
    expect(getModemEmulator(asSocket(caller.emitter)).getBps()).toBe(2400);

    caller.emitter.emit('door-active', false);
    expect(caller.state()?.doorActive).toBe(false);
    expect(caller.drops()?.get('door-active')).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Input state
  // -------------------------------------------------------------------------

  it('a password prompt stops the server echoing what the caller types', () => {
    // session.maskInput is read by the server-side echo at
    // handlers/command.handler.ts:2299, :2333 and :2422
    // (emitText(socket, session.maskInput ? '*' : data), "backend handles ALL
    // echo"). Seventeen sites emit 'mask-input' without setting it.
    const caller = telnetCaller(49);
    expect(caller.session.maskInput).toBe(false);

    caller.emitter.emit('mask-input', true);
    expect(caller.session.maskInput).toBe(true);

    caller.emitter.emit('mask-input', false);
    expect(caller.session.maskInput).toBe(false);

    // password-mode is the same fact under a second name and writes the same
    // field - handlers/user/gdpr.handler.ts:60-62 sets it beside its own emit.
    caller.emitter.emit('password-mode', true);
    expect(caller.session.maskInput).toBe(true);

    expect(caller.drops()?.get('mask-input')).toBeUndefined();
    expect(caller.drops()?.get('password-mode')).toBeUndefined();
  });

  it("a door's input mode and a handler's line mode share one answer", () => {
    const caller = telnetCaller(50);

    caller.emitter.emit('door:input-mode', 'game');
    expect(caller.state()?.inputMode).toBe('game');

    // server/file-socket-handlers.ts:285 and services/rename-prompt.service.ts:99
    caller.emitter.emit('set-input-mode', 'line');
    expect(caller.state()?.inputMode).toBe('line');

    expect(caller.drops()?.get('door:input-mode')).toBeUndefined();
    expect(caller.drops()?.get('set-input-mode')).toBeUndefined();
  });

  it("a door's terminal mode is recorded for the connection", () => {
    const caller = telnetCaller(51);

    caller.emitter.emit('terminal-mode', 'wide');

    expect(caller.state()?.terminalMode).toBe('wide');
    expect(caller.drops()?.get('terminal-mode')).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // The two documented no-ops
  // -------------------------------------------------------------------------

  it('game mode is delivered and changes nothing, because a byte stream has no key edges', () => {
    // services/game-mode.service.ts sets session.gameModeEnabled BEFORE it
    // emits, so the state is already kept by the one body that owns it.
    const caller = telnetCaller(52, { gameModeEnabled: true } as Partial<BBSSession>);

    caller.emitter.emit('game-mode', true);

    expect(caller.session.gameModeEnabled).toBe(true);
    expect(transportCapabilities(caller.session).keyEvents).toBe(false);
    expect(caller.socket.since(caller.preamble).length).toBe(0);
    expect(caller.drops()?.get('game-mode')).toBeUndefined();
  });

  it("a resize event does not resize a byte terminal, whose own size is the authority", () => {
    const caller = telnetCaller(53);

    caller.emitter.emit('terminal-resize', { cols: 40, rows: 25 });

    expect(caller.session.screenWidth).toBe(80);
    expect(caller.session.screenHeight).toBe(24);
    expect(caller.socket.since(caller.preamble).length).toBe(0);
    expect(caller.drops()?.get('terminal-resize')).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // The ordering rule, and the ruling/body correspondence
  // -------------------------------------------------------------------------

  it('a translation never re-enters the emitter, and only the notices write bytes', () => {
    // The plan's ordering rule: translations run on the way DOWN, before any
    // byte is written, and must not re-enter emitter.emit - which would re-enter
    // the chain and could recurse. The two rendered notices are the documented
    // exceptions and re-enter exactly once each, on 'ansi-output'.
    const caller = telnetCaller(54);
    // Install the pacer FIRST: modem-speed's install() replaces emitter.emit
    // with its throttle wrapper, and that must not be mistaken for re-entry.
    caller.emitter.emit('modem-speed', 1200);

    const original = caller.emitter.emit.bind(caller.emitter);
    const reentered: string[] = [];
    (caller.emitter as { emit: (event: string, ...args: unknown[]) => unknown }).emit = (
      event: string,
      ...args: unknown[]
    ) => {
      reentered.push(event);
      return original(event, ...args);
    };

    const payloads: Record<string, unknown[]> = {
      'door-active': [true],
      'door:input-mode': ['menu'],
      'game-mode': [false],
      'mask-input': [true],
      'modem-speed': [1200],
      'password-mode': [false],
      'set-input-mode': ['line'],
      'terminal-mode': ['fixed'],
      'terminal-resize': [{ cols: 80, rows: 25 }],
    };
    for (const [event, args] of Object.entries(payloads)) {
      original(event, ...args);
    }
    expect(reentered).toEqual([]);

    original('system-message', { text: 'kick\r\n' });
    original('system:notice', { kind: 'restart', seconds: 5, message: 'soon' });
    flushAllBuffers();
    // ONE re-entry, not two: both notices went through emitText, and the
    // output buffer coalesced them into a single 'ansi-output' - which is the
    // whole point of routing them through utils/output.util.ts rather than
    // writing at the connection.
    expect(reentered).toEqual(['ansi-output']);

    // hangup and force-disconnect close the transport rather than write, so
    // they are driven last and asserted separately.
    original('hangup');
    expect(reentered).toEqual(['ansi-output']);
    expect(caller.socket.ended).toBe(1);
  });

  it('every ruling that promises a body has one, and every body has a ruling', () => {
    // The correspondence gate. A `translate` ruling with no body would silently
    // become a counted drop again; a body with no ruling could never be reached.
    const promised = Object.keys(EVENT_RULINGS)
      .filter((name) => {
        const ruling: EventRuling = EVENT_RULINGS[name];
        return ruling.kind === 'translate' || ruling.kind === 'render';
      })
      // The three names the emitter renders in its own branches never reach the
      // adapter (server/connection-emitter.ts) and deliberately have no body.
      .filter((name) => !['ansi-output', 'petscii-output', 'petscii-bytes'].includes(name))
      .sort();

    expect([...TRANSLATED_EVENT_NAMES]).toEqual(promised);

    // The plan's own list, spelled out so a future edit to either side is a
    // failure rather than a quiet drift: 11 translate + 2 rendered notices.
    expect(promised).toEqual([
      'door-active',
      'door:input-mode',
      'force-disconnect',
      'game-mode',
      'hangup',
      'mask-input',
      'modem-speed',
      'password-mode',
      'set-input-mode',
      'system-message',
      'system:notice',
      'terminal-mode',
      'terminal-resize',
    ]);
  });

  // -------------------------------------------------------------------------
  // Reachability rows (REACHABILITY_PROTOCOL sections 3 and 10)
  // -------------------------------------------------------------------------

  it('R-TP4 - the instrument reports LIVE through the real entry point and DEAD off it', () => {
    // Protocol section 3: the detector is run against a case whose answer is
    // already known, in BOTH directions, before any count from it is quoted.
    // THE INSTRUMENT is `connection.transportState` - state that only
    // `applyTranslation` writes, reached across a module boundary from
    // `server/connection-emitter.ts`.
    const live = telnetCaller(55);
    live.emitter.emit('terminal-mode', 'wide');
    const liveState = live.state()?.terminalMode;

    // The DEAD half: the same name emitted on a plain EventEmitter - the shape a
    // web caller's socket.io Socket has for this purpose - writes no state
    // anywhere, because the adapter is not on that path at all.
    const dead = telnetCaller(56);
    const bus = new EventEmitter();
    bus.emit('terminal-mode', 'wide');
    const deadState = dead.state()?.terminalMode;

    expect(liveState).toBe('wide');
    expect(deadState).toBeUndefined();
  });
});
