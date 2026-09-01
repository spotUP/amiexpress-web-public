/**
 * Task 10: dedicated PETSCII telnet port.
 *
 * Synchronet convention: a port whose connections are PETSCII from byte
 * one — the strongest autodetect for real C64s, whose WiFi modems
 * negotiate no telnet options at all. `TelnetServer`'s `petsciiDefault`
 * option synthesizes the same `terminal-type` event shape
 * `handleTerminalType` (telnet-server.ts) emits for a real TTYPE C64
 * response, so it flows through the exact same session-application code
 * (this file's own `showPrompt()` c64 branch) instead of a second
 * hand-rolled copy of session init.
 *
 * These tests drive a REAL TCP connection against a REAL `TelnetServer`
 * bound to an ephemeral port — no mocked socket — so the assertions prove
 * the wire-level behavior a real C64 (or a test harness standing in for
 * one) actually sees, not just that some internal method was called.
 */
process.env.SKIP_DB_INIT = '1';

import * as net from 'net';
import { TelnetServer, TelnetConnection } from '../../src/server/telnet-server';

// RFC 854 / RFC 1091 constants, mirrored from telnet-server.ts (not
// exported — this test drives the wire protocol from the outside, the way
// a real telnet client would).
const IAC = 255;
const WILL = 251;
const SB = 250;
const SE = 240;
const TELOPT_TTYPE = 24;
const TTYPE_SEND = 1;
const TTYPE_IS = 0;

function ttypeIsResponse(terminalType: string): Buffer {
  const bytes = terminalType.split('').map((c) => c.charCodeAt(0));
  return Buffer.from([IAC, SB, TELOPT_TTYPE, TTYPE_IS, ...bytes, IAC, SE]);
}

function getPort(server: TelnetServer): number {
  const address = (server as any).server.address();
  return address.port;
}

describe('dedicated PETSCII port (petsciiDefault)', () => {
  let server: TelnetServer | null = null;
  let client: net.Socket | null = null;

  afterEach(async () => {
    if (client) {
      client.destroy();
      client = null;
      // Give the server-side socket's async FIN teardown (and its
      // console.log in TelnetConnection.handleClose) a moment to run
      // before the test finishes, or jest reports a "log after tests are
      // done" warning.
      await new Promise((r) => setTimeout(r, 50));
    }
    if (server) {
      await server.stop();
      server = null;
    }
  });

  it('emits a synthetic C64 terminal-type immediately on connect, with no TTYPE negotiation', async () => {
    server = new TelnetServer(0, { petsciiDefault: true });
    await server.start();

    const infoPromise = new Promise<any>((resolve) => {
      server!.once('connection', (connection: TelnetConnection) => {
        connection.once('terminal-type', resolve);
      });
    });

    client = net.connect(getPort(server));
    client.on('error', () => {});

    const info = await infoPromise;

    expect(info).toEqual({
      terminalType: 'PETSCII-PORT',
      isC64: true,
      isAmiga: false,
      unicodeCapable: false,
      width: 40,
      height: 25,
    });
  });

  it('applies the synthetic event through the real session-init path (petsciiMode/screen/charset prelude)', async () => {
    server = new TelnetServer(0, { petsciiDefault: true });
    await server.start();

    const connection = await new Promise<TelnetConnection>((resolve) => {
      server!.once('connection', resolve);
      client = net.connect(getPort(server!));
      client.on('error', () => {});
    });

    // The synthetic emit + showPrompt() run synchronously inside
    // handleConnection; give the event loop one tick so the promise chain
    // that registered the listeners has fully unwound.
    await new Promise((r) => setImmediate(r));

    expect(connection.session?.terminalType).toBe('c64');
    expect(connection.session?.petsciiMode).toBe(true);
    expect(connection.session?.screenWidth).toBe(40);
    expect(connection.session?.screenHeight).toBe(25);
    expect((connection.session as any)?.needsCharsetPrelude).toBe(true);
  });

  it('a plain (non-petsciiDefault) telnet port does not synthesize a terminal-type event', async () => {
    server = new TelnetServer(0);
    await server.start();

    let fired = false;
    server.once('connection', (connection: TelnetConnection) => {
      connection.once('terminal-type', () => {
        fired = true;
      });
    });

    client = net.connect(getPort(server));
    client.on('error', () => {});

    await new Promise((r) => setTimeout(r, 100));
    expect(fired).toBe(false);
  });

  it('a TTYPE response arriving later on a petsciiDefault connection does not downgrade the session', async () => {
    server = new TelnetServer(0, { petsciiDefault: true });
    await server.start();

    let terminalTypeEventCount = 0;
    const connection = await new Promise<TelnetConnection>((resolve) => {
      server!.once('connection', (conn: TelnetConnection) => {
        conn.on('terminal-type', () => {
          terminalTypeEventCount++;
        });
        resolve(conn);
      });
      client = net.connect(getPort(server!));
      const received: Buffer[] = [];
      client.on('data', (chunk: Buffer) => received.push(chunk));
      client.on('error', () => {});
      // Stash for the negotiation step below.
      (client as any)._received = received;
    });

    // Synthetic emission has already fired by now (registered above,
    // before this promise resolved).
    await new Promise((r) => setImmediate(r));
    expect(terminalTypeEventCount).toBe(1);
    expect(connection.session?.terminalType).toBe('c64');
    expect(connection.session?.petsciiMode).toBe(true);
    expect(connection.session?.screenWidth).toBe(40);

    // A client that (unlike a real C64 over a WiFi modem) DOES negotiate
    // TTYPE, and reports a non-C64 terminal. This must not be trusted on
    // a dedicated PETSCII port.
    client!.write(Buffer.from([IAC, WILL, TELOPT_TTYPE]));

    // Wait for the server's TTYPE SEND request to prove negotiation
    // actually happened at the wire level.
    await new Promise<void>((resolve, reject) => {
      const deadline = Date.now() + 2000;
      const check = () => {
        const buffered = Buffer.concat((client as any)._received);
        const sendSeq = Buffer.from([IAC, SB, TELOPT_TTYPE, TTYPE_SEND, IAC, SE]);
        if (buffered.indexOf(sendSeq) >= 0) {
          resolve();
        } else if (Date.now() > deadline) {
          reject(new Error('server never requested TTYPE'));
        } else {
          setTimeout(check, 10);
        }
      };
      check();
    });

    client!.write(ttypeIsResponse('VT100'));
    await new Promise((r) => setTimeout(r, 50));

    // No second terminal-type event, and the session is still locked to
    // the PETSCII-port defaults set at connect time.
    expect(terminalTypeEventCount).toBe(1);
    expect(connection.session?.terminalType).toBe('c64');
    expect(connection.session?.petsciiMode).toBe(true);
    expect(connection.session?.screenWidth).toBe(40);
    expect(connection.session?.screenHeight).toBe(25);
  });
});
