/**
 * TP-8 of `thoughts/shared/plans/2026-09-03-ssh-telnet-parity.md`: ONE input
 * pipeline.
 *
 * Five behaviours existed in the web `command` handler and in NO telnet path,
 * and each of the first six cases below is one of them, driven through the
 * REAL telnet entry point - `setupTelnetSSHHandler`'s `data` handler, the
 * function every keystroke of a telnet caller passes through. Each was RED
 * before the extraction, and the failure was not subtle: a telnet caller's
 * arrow keys did nothing, a paste arrived as one opaque command, a pause
 * prompt never saw the key that was meant to dismiss it, and a mouse report
 * was typed onto the screen.
 *
 * WEB IS THE OTHER HALF, and it is pinned by not moving: the web handler keeps
 * its own door routing, its own echo and its own early returns, and the suites
 * that already drive it (tests/server/, tests/handlers/) are what say so. What
 * this file adds for web is the PURE half - the chunking and normalisation
 * rules web has always had are now a function with a name, so telnet can have
 * the same one rather than a second copy that drifts.
 */
process.env.SKIP_DB_INIT = '1';

import { EventEmitter } from 'events';
import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';
import {
  setupTelnetSSHHandler,
  type TransportSessionDeps,
} from '../../src/server/transport-session';
import {
  classifyTerminalInput,
  commandPieces,
  normaliseCursorKeys,
  splitInputForDispatch,
  isStrayMouseReport,
} from '../../src/server/terminal-input';
import type { TelnetConnection } from '../../src/server/telnet-server';
import type { BBSSession } from '../../src/index';

class FakeTransportConnection extends EventEmitter {
  public sessionId: string;
  public nodeId: number;
  public session: BBSSession | null = null;
  public written: Buffer[] = [];

  constructor(nodeId: number) {
    super();
    this.nodeId = nodeId;
    this.sessionId = `telnet-${nodeId}-terminal-input-test`;
  }

  write(data: Buffer | string): void {
    this.written.push(typeof data === 'string' ? Buffer.from(data, 'latin1') : Buffer.from(data));
  }

  close(): void { /* not used here */ }
  getRemoteAddress(): string { return '127.0.0.1'; }
}

function loggedOnSession(nodeId: number): BBSSession {
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
    terminalType: 'modern',
    screenWidth: 80,
    screenHeight: 24,
    tempData: {},
  } as unknown as BBSSession;
}

function makeDeps() {
  const handleCommand = jest.fn();
  const deps: TransportSessionDeps = {
    io: {} as never,
    sessions: new Map<string, BBSSession>(),
    nodeManager: { releaseSession: jest.fn(async () => undefined) },
    handleCommand,
  };
  return { deps, handleCommand };
}

/** A live telnet caller, ready to be typed at. */
function telnetCaller(nodeId: number) {
  const connection = new FakeTransportConnection(nodeId);
  connection.session = loggedOnSession(nodeId);
  const { deps, handleCommand } = makeDeps();
  setupTelnetSSHHandler(connection as unknown as TelnetConnection, 'telnet', deps);
  const type = (bytes: string) => connection.emit('data', Buffer.from(bytes, 'latin1'));
  const inputs = () => handleCommand.mock.calls.map((call) => call[2]);
  return { connection, session: connection.session, handleCommand, type, inputs };
}

describe('TP-8 - a telnet caller gets the web caller\'s input pipeline', () => {
  it('an arrow key in application-cursor mode works (divergence 21)', () => {
    // A terminal in DECCKM sends SS3, and the command handler only knows CSI.
    const caller = telnetCaller(21);
    caller.type('\x1bOA');
    expect(caller.inputs()).toEqual(['\x1b[A']);
  });

  it('a paste is not one opaque command (divergence 22)', async () => {
    const caller = telnetCaller(22);
    caller.type('ABC');
    // Each key waits for the one before it (dispatchInOrder), so the last two
    // land a tick later - in order, which is the point.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(caller.inputs()).toEqual(['A', 'B', 'C']);
  });

  it('an escape sequence is not split', () => {
    const caller = telnetCaller(23);
    caller.type('\x1b[A');
    expect(caller.inputs()).toEqual(['\x1b[A']);
  });

  it('a pause prompt eats the keystroke, and the line reaches its handler (divergence 23)', () => {
    const caller = telnetCaller(24);
    const answered: string[] = [];
    (caller.session as unknown as { checkPauseHandler?: (line: string) => void })
      .checkPauseHandler = (line) => answered.push(line);

    caller.type('N');
    caller.type('S');
    caller.type('\r');

    expect(answered).toEqual(['NS']);
    expect(caller.handleCommand).not.toHaveBeenCalled();
    // The handler is cleared once it has run, so the NEXT key is the BBS's.
    expect((caller.session as unknown as { checkPauseHandler?: unknown }).checkPauseHandler)
      .toBeUndefined();
  });

  it('an answer and its RETURN in one packet submit the pause (CR LF, 2026-10-02)', () => {
    // A telnet client sent `n\r\n` as one packet; the whole packet was
    // stored as typed text and the logon scan's More prompt never ended.
    const caller = telnetCaller(24);
    const answered: string[] = [];
    (caller.session as unknown as { checkPauseHandler?: (line: string) => void })
      .checkPauseHandler = (line) => answered.push(line);

    caller.type('n\r\n');

    expect(answered).toEqual(['n']);
    expect(caller.handleCommand).not.toHaveBeenCalled();
  });

  it('a RETURN alone as CR LF submits the pause too', () => {
    const caller = telnetCaller(24);
    const answered: string[] = [];
    (caller.session as unknown as { checkPauseHandler?: (line: string) => void })
      .checkPauseHandler = (line) => answered.push(line);

    caller.type('n');
    caller.type('\r\n');

    expect(answered).toEqual(['n']);
  });

  it('a flag-pause prompt does the same, and backspace takes a character back', () => {
    const caller = telnetCaller(25);
    const answered: string[] = [];
    (caller.session as unknown as { flagPauseHandler?: (line: string) => void })
      .flagPauseHandler = (line) => answered.push(line);

    caller.type('1');
    caller.type('2');
    caller.type('\x7f');
    caller.type('3');
    caller.type('\r');

    expect(answered).toEqual(['13']);
    expect(caller.handleCommand).not.toHaveBeenCalled();
  });

  it("a client door's keystrokes do not reach the BBS (divergence 24)", () => {
    const caller = telnetCaller(26);
    (caller.session as unknown as { clientDoorActive?: boolean }).clientDoorActive = true;
    caller.type('X');
    expect(caller.handleCommand).not.toHaveBeenCalled();
  });

  /**
   * The other half of the game-mode ruling, and the reason the guard takes the
   * transport's answer rather than reading the session alone: a browser sends
   * key-down/key-up events instead of characters, and a telnet caller has
   * nothing but characters. Returning here for telnet dropped every keystroke
   * a game-mode door was sent - GRANDMASTER drew perfectly and took no input.
   */
  it('game mode does NOT swallow a telnet keystroke, because telnet has no key events', () => {
    const caller = telnetCaller(27);
    (caller.session as unknown as { gameModeEnabled?: boolean }).gameModeEnabled = true;
    caller.type('X');
    expect(caller.inputs()).toEqual(['X']);
  });

  it('a stray mouse report is not typed onto the screen (divergence 25)', () => {
    const caller = telnetCaller(28);
    caller.type('\x1b[<0;10;5M');
    expect(caller.handleCommand).not.toHaveBeenCalled();
  });

  it('a line pasted into the operator chat arrives whole, as it does on web (audit item 7)', () => {
    const caller = telnetCaller(31);
    (caller.session as unknown as { subState: string }).subState = 'operator_chat_active';
    caller.type('tell me about fairlight');
    expect(caller.inputs()).toEqual(['tell me about fairlight']);
  });

  it('a command that throws is reported to the caller, as it is on web (audit item 9)', async () => {
    const caller = telnetCaller(32);
    caller.handleCommand.mockImplementation(async () => { throw new Error('boom'); });
    caller.type('X');
    await new Promise((resolve) => setTimeout(resolve, 10));
    const shown = caller.connection.written.map((b) => b.toString('latin1')).join('');
    expect(shown).toContain('Command processing failed');
  });

  it('a transfer sink takes the bytes, and nothing else sees them', () => {
    const caller = telnetCaller(29);
    const sunk: Buffer[] = [];
    const session = caller.session as unknown as {
      transferRawActive?: boolean;
      transferRawSink?: (b: Buffer) => void;
    };
    session.transferRawActive = true;
    session.transferRawSink = (b) => sunk.push(b);

    caller.type('\x01\x02\x03');

    expect(Buffer.concat(sunk)).toEqual(Buffer.from([0x01, 0x02, 0x03]));
    expect(caller.handleCommand).not.toHaveBeenCalled();
  });
});

describe('TP-8 - the rules themselves, one copy for both transports', () => {
  it('SS3 becomes CSI, and nothing else is touched', () => {
    expect(normaliseCursorKeys('\x1bOA')).toBe('\x1b[A');
    expect(normaliseCursorKeys('\x1bOP')).toBe('\x1b[P');
    expect(normaliseCursorKeys('\x1b[A')).toBe('\x1b[A');
    expect(normaliseCursorKeys('AB')).toBe('AB');
    // Too short to be a sequence: left alone rather than half-rewritten.
    expect(normaliseCursorKeys('\x1bO')).toBe('\x1bO');
  });

  it('an escape sequence stays whole and everything else is split per character', () => {
    expect(splitInputForDispatch('\x1b[A')).toEqual(['\x1b[A']);
    expect(splitInputForDispatch('\x1b[<0;1;1M')).toEqual(['\x1b[<0;1;1M']);
    expect(splitInputForDispatch('ABC')).toEqual(['A', 'B', 'C']);
    expect(splitInputForDispatch('')).toEqual([]);
  });

  it('only a complete SGR mouse report is recognised as one', () => {
    expect(isStrayMouseReport('\x1b[<0;10;5M')).toBe(true);
    expect(isStrayMouseReport('\x1b[<35;1;1m')).toBe(true);
    expect(isStrayMouseReport('\x1b[A')).toBe(false);
    expect(isStrayMouseReport('M')).toBe(false);
  });

  it('commandPieces normalises, drops a mouse report, and splits - in that order', () => {
    expect(commandPieces('\x1bOB')).toEqual(['\x1b[B']);
    expect(commandPieces('\x1b[<0;10;5M')).toEqual([]);
    expect(commandPieces('hi')).toEqual(['h', 'i']);
  });

  it('classify answers "route" when nothing has claimed the keystroke', () => {
    const session = loggedOnSession(30);
    expect(classifyTerminalInput(session, 'A')).toEqual({ kind: 'route' });
  });

  it('game mode is only a swallow for a transport that delivers key events', () => {
    const session = loggedOnSession(31);
    (session as unknown as { gameModeEnabled?: boolean }).gameModeEnabled = true;
    expect(classifyTerminalInput(session, 'A', { deliversKeyEvents: true }))
      .toEqual({ kind: 'swallow', why: 'game-mode' });
    expect(classifyTerminalInput(session, 'A', { deliversKeyEvents: false }))
      .toEqual({ kind: 'route' });
  });

  it('a pause handler that registers a NEW one is not cleared under it', () => {
    const session = loggedOnSession(32);
    const state = session as unknown as { checkPauseHandler?: (line: string) => void };
    const second = jest.fn();
    const first = jest.fn(() => { state.checkPauseHandler = second; });
    state.checkPauseHandler = first;

    const decision = classifyTerminalInput(session, '\r');
    expect(decision.kind).toBe('pause');
    if (decision.kind !== 'pause') throw new Error('unreachable');
    decision.handler?.(decision.line as string);

    const { clearPauseHandler } = require('../../src/server/terminal-input');
    clearPauseHandler(session, 'check', first);
    expect(state.checkPauseHandler).toBe(second);
  });
});
