/**
 * A client that PROMISES a terminal type (IAC WILL TTYPE) is classified by the
 * type it sends, however late it arrives.
 *
 * The board used to show the first screen 500 ms after connect whether or not
 * the TTYPE reply had come in. A PETSCII client whose reply took longer - an
 * emulated Amiga running DCTelnet through Amiberry's network stack, 2026-09-24
 * - got the ANSI front door, and the "PETSCII" that arrived a moment later
 * (logs/backend.log: TELNET-FRONT display, THEN `terminal type: "PETSCII"`)
 * could no longer change it. The same client won the race on one connection
 * and lost it on the next.
 *
 * The tests pin both sides of the rule: a promised type is waited for, and
 * a client that makes no promise (a real C64 behind a WiFi modem, CGTerm)
 * still gets the prompt on the old 500 ms timer.
 *
 * Harness: a real TelnetServer on an ephemeral port through the same
 * setupTelnetSSHHandler index.ts wires, as in reachability-r1-telnet.test.ts.
 */
import * as net from 'net';
import { TelnetServer, TelnetConnection } from '../../src/server/telnet-server';
import {
  setupTelnetSSHHandler,
  whenTeardownsSettle,
  type TransportSessionDeps,
} from '../../src/server/transport-session';

jest.setTimeout(30000);

const IAC = 255, SB = 250, SE = 240, WILL = 251, WONT = 252, DO = 253;
const TTYPE = 24, TTYPE_IS = 0, TTYPE_SEND = 1;

/** The ANSI graphics prompt's option list - on the wire only on the ANSI path. */
const ANSI_PROMPT_SENTINEL = 'A/R/P/P8/T/N';

const deps = (): TransportSessionDeps => ({
  io: {} as never,
  sessions: new Map(),
  nodeManager: { releaseSession: jest.fn(async () => undefined) },
  handleCommand: jest.fn(),
} as unknown as TransportSessionDeps);

function contains(haystack: Buffer, needle: number[]): boolean {
  return haystack.indexOf(Buffer.from(needle)) !== -1;
}

async function withBoard(
  client: (socket: net.Socket, chunks: Buffer[]) => void,
  body: (server: TelnetServer, chunks: Buffer[]) => Promise<void>,
): Promise<void> {
  const server = new TelnetServer(0);
  await server.start();
  server.on('connection', (c: TelnetConnection) => setupTelnetSSHHandler(c, 'telnet', deps()));
  const port = (server as any).server.address().port;
  const socket = net.connect(port);
  socket.on('error', () => undefined);
  const chunks: Buffer[] = [];
  socket.on('data', (c: Buffer) => chunks.push(c));
  client(socket, chunks);
  try {
    await body(server, chunks);
  } finally {
    socket.destroy();
    await (server as any).stop?.();
    await whenTeardownsSettle();
  }
}

describe('a promised terminal type is waited for', () => {
  it('classifies a PETSCII client whose TTYPE reply arrives after 500 ms as a C64', async () => {
    const REPLY_DELAY_MS = 1200;
    await withBoard(
      (socket, chunks) => {
        let willSent = false, isScheduled = false;
        socket.on('data', () => {
          const all = Buffer.concat(chunks);
          if (!willSent && contains(all, [IAC, DO, TTYPE])) {
            willSent = true;
            socket.write(Buffer.from([IAC, WILL, TTYPE]));
          }
          if (!isScheduled && contains(all, [IAC, SB, TTYPE, TTYPE_SEND, IAC, SE])) {
            isScheduled = true;
            setTimeout(() => socket.write(Buffer.concat([
              Buffer.from([IAC, SB, TTYPE, TTYPE_IS]),
              Buffer.from('PETSCII', 'latin1'),
              Buffer.from([IAC, SE]),
            ])), REPLY_DELAY_MS);
          }
        });
      },
      async (server, chunks) => {
        const detected = await new Promise<boolean>((resolve) => {
          const timer = setTimeout(() => resolve(false), REPLY_DELAY_MS + 5000);
          server.once('c64-detected', () => { clearTimeout(timer); resolve(true); });
        });
        expect(detected).toBe(true);
        expect(Buffer.concat(chunks).toString('latin1')).not.toContain(ANSI_PROMPT_SENTINEL);
      },
    );
  });

});

/**
 * The state the prompt timer reads. Driven through the connection's real
 * socket 'data' handler, so the IAC parser is the one production runs.
 */
describe('TelnetConnection.isTerminalTypePending', () => {
  function connection(): { conn: TelnetConnection; feed: (bytes: number[] | Buffer) => void } {
    const { EventEmitter } = require('events');
    const socket = Object.assign(new EventEmitter(), {
      write: jest.fn(() => true),
      remoteAddress: '127.0.0.1',
      destroyed: false,
      end: jest.fn(),
      destroy: jest.fn(),
    });
    const conn = new TelnetConnection(socket as unknown as net.Socket);
    return { conn, feed: (bytes) => socket.emit('data', Buffer.from(bytes as number[])) };
  }

  it('is false for a client that has negotiated nothing (real C64, CGTerm)', () => {
    expect(connection().conn.isTerminalTypePending).toBe(false);
  });

  it('is true once the client promises a terminal type, false once it arrives', () => {
    const { conn, feed } = connection();
    feed([IAC, WILL, TTYPE]);
    expect(conn.isTerminalTypePending).toBe(true);
    feed(Buffer.concat([
      Buffer.from([IAC, SB, TTYPE, TTYPE_IS]), Buffer.from('PETSCII', 'latin1'), Buffer.from([IAC, SE]),
    ]));
    expect(conn.isTerminalTypePending).toBe(false);
    expect(conn.terminalType).toBe('PETSCII');
  });

  it('is false again when the client withdraws the promise with WONT', () => {
    const { conn, feed } = connection();
    feed([IAC, WILL, TTYPE]);
    feed([IAC, WONT, TTYPE]);
    expect(conn.isTerminalTypePending).toBe(false);
  });

  it('is settled by a malformed reply, so the prompt does not wait for the cap', () => {
    const { conn, feed } = connection();
    const settled = jest.fn();
    conn.on('terminal-type-settled', settled);
    feed([IAC, WILL, TTYPE]);
    feed([IAC, SB, TTYPE, 7, IAC, SE]);
    expect(conn.isTerminalTypePending).toBe(false);
    expect(settled).toHaveBeenCalledTimes(1);
  });
});
