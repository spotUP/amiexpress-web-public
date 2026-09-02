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
});
