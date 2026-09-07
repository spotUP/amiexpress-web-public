/**
 * Pins the telnet TTYPE payload coupling: TelnetConnection.handleTerminalType
 * (web/backend/src/server/telnet-server.ts, the `this.emit('terminal-type', ...)`
 * call) hardcodes `width: isC64 ? 40 : 80, height: isC64 ? 25 : 24`. That
 * payload is what index.ts's "terminal-type" handler feeds into
 * applyClientReportedGeometry - so if this emit ever drifted (e.g. someone
 * "simplifying" it to always send 80), a C64 connection would carry an
 * 80-column width into the session despite the gate.
 *
 * Drives the real IAC/TTYPE wire protocol through TelnetConnection.handleData
 * with a stubbed socket (no real TCP) - no mocking of the width logic itself.
 *
 * src/index.ts is mocked away: telnet-server.ts imports LOCALHOST_IPS and the
 * BBSSession type from it, and the real module boots servers on import.
 */
jest.mock('../../src/index', () => ({ LOCALHOST_IPS: [] }));

import { EventEmitter } from 'events';
import { TelnetConnection } from '../../src/server/telnet-server';

const IAC = 255;
const SB = 250;
const SE = 240;
const TELOPT_TTYPE = 24;
const TTYPE_IS = 0;

function makeFakeSocket() {
  const socket: any = new EventEmitter();
  socket.remoteAddress = '127.0.0.1';
  socket.write = jest.fn();
  socket.end = jest.fn();
  return socket;
}

/** Feeds a TTYPE IS <name> subnegotiation reply through the real IAC state machine. */
function sendTtypeReply(connection: TelnetConnection, socket: any, terminalName: string) {
  const nameBytes = Array.from(terminalName).map((c) => c.charCodeAt(0));
  const bytes = [IAC, SB, TELOPT_TTYPE, TTYPE_IS, ...nameBytes, IAC, SE];
  socket.emit('data', Buffer.from(bytes));
}

describe('TelnetConnection terminal-type emits geometry matching the detected terminal', () => {
  it('a C64-detected connection emits width 40 / height 25', () => {
    const socket = makeFakeSocket();
    const connection = new TelnetConnection(socket);
    const events: any[] = [];
    connection.on('terminal-type', (info) => events.push(info));

    sendTtypeReply(connection, socket, 'C64');

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ isC64: true, width: 40, height: 25 });
  });

  it('an ANSI (xterm) connection emits width 80', () => {
    const socket = makeFakeSocket();
    const connection = new TelnetConnection(socket);
    const events: any[] = [];
    connection.on('terminal-type', (info) => events.push(info));

    sendTtypeReply(connection, socket, 'XTERM');

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ isC64: false, width: 80, height: 24 });
  });

  /**
   * THE SYSOP'S BBSTITLE (2026-09-07, telnet at 200 columns: "wide as ever"
   * after the board learned to fold its screens for a wide caller - while the
   * MENU folded correctly a few seconds later).
   *
   * Measured in his login's log, in order: `NAWS: 200x66`, then TTYPE
   * `XTERM-256COLOR - 80x24`, then BBSTITLE. The TTYPE reply carries no
   * geometry at all - this emit INVENTED 80x24 for any non-C64 terminal - and
   * `applyTerminalTypeReport` writes the payload's width over the session with
   * the same call NAWS uses. So the real 200 became a made-up 80 just before
   * BBSTITLE drew, nothing folded, and the menu was right only because his
   * terminal had re-sent NAWS by then.
   *
   * The report now carries the size the terminal actually negotiated when it
   * has, and the old fallback only when it has not (the case pinned above).
   */
  it('a TTYPE reply after NAWS carries the negotiated size, not an invented 80x24', () => {
    const socket = makeFakeSocket();
    const connection = new TelnetConnection(socket);
    const events: any[] = [];
    connection.on('terminal-type', (info) => events.push(info));

    // IAC SB NAWS width(2) height(2) IAC SE - 200 x 66.
    socket.emit('data', Buffer.from([IAC, SB, 31, 0, 200, 0, 66, IAC, SE]));
    sendTtypeReply(connection, socket, 'XTERM-256COLOR');

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ isC64: false, width: 200, height: 66 });
  });

  it('a C64 is forty columns whatever NAWS claimed - the screen is 40 by definition', () => {
    const socket = makeFakeSocket();
    const connection = new TelnetConnection(socket);
    const events: any[] = [];
    connection.on('terminal-type', (info) => events.push(info));

    socket.emit('data', Buffer.from([IAC, SB, 31, 0, 200, 0, 66, IAC, SE]));
    sendTtypeReply(connection, socket, 'C64');

    expect(events[0]).toMatchObject({ isC64: true, width: 40, height: 25 });
  });
});

