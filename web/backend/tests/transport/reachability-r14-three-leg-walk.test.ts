/**
 * R14 - the walk: all three legs, real sockets, one connection each, compared
 * step by step.
 *
 * `three-transport-walk.test.ts` compares telnet against SSH at step 01. This
 * adds the WEB leg and goes PAST the prompt, which needed a board behind the
 * handler - with a stub, step 02 paints nothing at all
 * (`walk-step02-needs-a-board.test.ts` pins that from both directions).
 *
 * ONE CONNECTION PER TRANSPORT, and every step taken on it. Not a connection
 * per step: the FRONTEND syscmd runs on every connect and its dynamic import
 * of a door cannot resolve under jest, so a SECOND connect on the same
 * transport diverts to "Press any key to continue" instead of the prompt. That
 * is a property of running a door under jest, not of the board.
 *
 * THE THREE ALLOWED DIFFERENCES, and there are exactly three, each of which is
 * a fact about the caller rather than about the transport:
 *
 *   1. the clock          - "Connection occured at <time>"
 *   2. the node they got  - "node 3" / "Node 3"
 *   3. the transport's own framing - telnet IAC negotiation, which SSH and a
 *      socket.io frame have no equivalent of
 *
 * Anything else that differs between the legs is a parity defect, which is the
 * whole point of the row: three callers, three wires, one board.
 */
import * as crypto from 'crypto';
import * as http from 'http';
import * as net from 'net';
import { Client as SSHClient, type ClientChannel } from 'ssh2';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { bootBoard, type BootedBoard } from '../support/booted-board';
import { untilSettled } from './helpers/wire-quiet';

jest.setTimeout(300000);

const STEP_01 = 'A/R/P/P8/T/N';

/** Telnet's own framing is difference 3; remove it so bytes can be compared. */
function stripTelnetNegotiation(raw: Buffer): Buffer {
  const out: number[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    if (raw[i] !== 255) { out.push(raw[i]); continue; }
    const verb = raw[i + 1];
    if (verb === 250) {
      i += 2;
      while (i < raw.length && !(raw[i] === 255 && raw[i + 1] === 240)) i += 1;
      i += 1;
    } else if (verb === 255) { out.push(255); i += 1; } else { i += 2; }
  }
  return Buffer.from(out);
}

/** Differences 1 and 2: the clock, and whichever node the caller was given. */
const stable = (t: string): string =>
  t.replace(/Connection occured at [^.]+\./, 'Connection occured at <time>.')
   .replace(/node \d+/g, 'node <n>')
   .replace(/Node \d+/g, 'Node <n>');

function hostKey(): Buffer {
  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
  });
  return Buffer.from(privateKey);
}

/** One leg's transcript: what arrived for each step, in order. */
interface Leg { step01: string; step02: string }

describe('R14 - three legs, one board', () => {
  let board: BootedBoard;

  beforeAll(async () => { board = await bootBoard('r14-walk-'); });
  afterAll(() => board?.cleanup());

  /** Wire a connection the way index.ts does, with the REAL handleCommand. */
  function transportDeps() {
    const { handleCommand } = require('../../src/handlers/command.handler');
    return {
      io: {} as never,
      sessions: new Map(),
      nodeManager: { releaseSession: async () => undefined },
      handleCommand,
    } as never;
  }

  async function telnetLeg(): Promise<Leg> {
    const { TelnetServer } = require('../../src/server/telnet-server');
    const { setupTelnetSSHHandler } = require('../../src/server/transport-session');
    const { createSession, setSession } = require('../../src/server/session-manager');

    const server = new TelnetServer(0);
    await server.start();
    server.on('connection', (c: { nodeId?: number; sessionId: string; session: unknown }) => {
      const s = createSession(c.nodeId ?? 1, { connectionType: 'telnet' });
      c.session = s; setSession(c.sessionId, s);
      setupTelnetSSHHandler(c as never, 'telnet', transportDeps());
    });
    const port = (server as unknown as { server: { address(): { port: number } } }).server.address().port;

    const client = net.connect(port);
    client.on('error', () => undefined);
    const chunks: Buffer[] = [];
    client.on('data', (c: Buffer) => chunks.push(c));
    const text = () => stripTelnetNegotiation(Buffer.concat(chunks)).toString('latin1');

    try {
      await until(() => text().includes(STEP_01), 25000, () => `telnet step01: ${text().slice(-120)}`);
      // The sentinel is mid-line; the paint is not over until the capture
      // stops growing. See helpers/wire-quiet.ts - the prompt's trailing
      // ESC 7 arrives in a different chunk on each transport.
      await untilSettled(() => text().length);
      const step01 = text();
      client.write('Y\r');
      await pause(4000);
      const step02 = text().slice(step01.length);
      return { step01, step02 };
    } finally {
      client.destroy();
      await (server as unknown as { stop?: () => Promise<void> }).stop?.();
    }
  }

  async function sshLeg(): Promise<Leg> {
    const { SSHServerImpl } = require('../../src/server/ssh-server');
    const { setupTelnetSSHHandler } = require('../../src/server/transport-session');
    const { createSession, setSession } = require('../../src/server/session-manager');

    const server = new SSHServerImpl(0, [hostKey()]);
    server.on('connection', (c: { nodeId?: number; sessionId: string; session: unknown }) => {
      const s = createSession(c.nodeId ?? 2, { connectionType: 'ssh' });
      c.session = s; setSession(c.sessionId, s);
      setupTelnetSSHHandler(c as never, 'ssh', transportDeps());
    });
    await server.start();
    const port = (server as unknown as { server: { address(): { port: number } } }).server.address().port;

    const client = new SSHClient();
    // UTF-8, whole: the pty below names xterm-256color, and since the pty's
    // report reaches the session (web-vs-telnet audit item 1, 2026-09-28) an
    // SSH caller on a UTF-8 terminal gets a UTF-8 wire. Decoded from the
    // concatenated bytes so a character split across packets survives.
    const chunks: Buffer[] = [];
    const text = () => Buffer.concat(chunks).toString('utf-8');
    try {
      const stream: ClientChannel =
        await new Promise<ClientChannel>((resolve, reject) => {
          client.on('ready', () => {
            client.shell({ term: 'xterm-256color', cols: 80, rows: 24 } as never,
              (err, s) => { if (err) reject(err); else resolve(s); });
          });
          client.on('error', reject);
          client.connect({ host: '127.0.0.1', port, username: 'walker', password: 'ignored' });
        });
      stream.on('data', (d: Buffer) => chunks.push(Buffer.from(d)));

      await until(() => text().includes(STEP_01), 25000, () => `ssh step01: ${text().slice(-120)}`);
      await untilSettled(() => text().length);
      const step01 = text();
      stream.write('Y\r');
      await pause(4000);
      const step02 = text().slice(step01.length);
      return { step01, step02 };
    } finally {
      client.end();
      await (server as unknown as { stop?: () => Promise<void> }).stop?.();
    }
  }

  async function webLeg(): Promise<Leg> {
    const { registerSocketHandlers } = require('../../src/server/socket-handlers');
    const { runPreLoginConnect } = require('../../src/services/login-connect.service');
    const { createSession, setSession } = require('../../src/server/session-manager');

    const httpServer = http.createServer();
    const sockets = new Set<{ destroy: () => void }>();
    httpServer.on('connection', (s) => { sockets.add(s as never); s.on('close', () => sockets.delete(s as never)); });
    const io = new SocketIOServer(httpServer, { cors: { origin: '*' } });

    io.on('connection', (socket) => {
      const session = createSession(3, { connectionType: 'web' });
      (socket as unknown as { session: unknown }).session = session;
      setSession(socket.id, session);
      registerSocketHandlers(io, socket);
      /*
       * The SOCKET itself, not a connection emitter. index.ts:1449 passes the
       * socket straight to runPreLoginConnect for a web caller - wrapping it
       * in buildConnectionEmitter (which is the BYTE transports' path) emits
       * nothing this client can hear, and the leg reads as a board that never
       * spoke.
       */
      void runPreLoginConnect(socket as never, session, { socketId: socket.id, postBannerDelayMs: 0 });
    });

    await new Promise<void>((r) => httpServer.listen(0, '127.0.0.1', r));
    const port = (httpServer.address() as { port: number }).port;

    const client: ClientSocket = ioClient(`http://127.0.0.1:${port}`, {
      transports: ['websocket'], forceNew: true, reconnection: false,
    });
    const chunks: string[] = [];
    const text = () => chunks.join('');
    // SUBSCRIBED BEFORE THE CONNECT RESOLVES. The board paints its banner the
    // moment the connection handler runs, and a listener attached after
    // `await connect` misses all of it - which reads exactly like a web leg
    // that was never served.
    client.on('ansi-output', (d: string) => chunks.push(String(d)));
    try {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('web never connected')), 15000);
        client.on('connect', () => { clearTimeout(t); resolve(); });
        client.on('connect_error', reject);
      });

      await until(() => text().includes(STEP_01), 25000, () => `web step01: ${text().slice(-120)}`);
      await untilSettled(() => text().length);
      const step01 = text();
      client.emit('command', 'Y');
      client.emit('command', '\r');
      await pause(4000);
      const step02 = text().slice(step01.length);
      return { step01, step02 };
    } finally {
      client.close();
      io.close();
      for (const s of sockets) { try { s.destroy(); } catch { /* gone */ } }
      await new Promise<void>((resolve) => {
        const done = setTimeout(resolve, 2000);
        httpServer.close(() => { clearTimeout(done); resolve(); });
      });
    }
  }

  it('paints the same board on telnet, SSH and the browser, step for step', async () => {
    // Sequential, not parallel: each leg boots a server on an ephemeral port
    // and the board's node allocation is shared state.
    const telnet = await telnetLeg();
    const ssh = await sshLeg();
    const web = await webLeg();

    // Step 01 - the connect banner and the graphics prompt.
    expect(stable(ssh.step01)).toBe(stable(telnet.step01));
    expect(stable(web.step01)).toBe(stable(telnet.step01));

    // Not vacuous: an empty stream must not match another empty stream.
    for (const leg of [telnet, ssh, web]) {
      // ~400 bytes; the two invented '/X Native Telnet' lines went 2026-10-04.
      expect(leg.step01.length).toBeGreaterThan(300);
      expect(leg.step01).toContain(STEP_01);
      expect(leg.step01).toContain('Connection occured at');
    }

    // Step 02 - what answering the prompt paints. This is the step that could
    // not be written before the board fixture existed.
    for (const leg of [telnet, ssh, web]) {
      expect(leg.step02.length).toBeGreaterThan(0);
    }
    expect(stable(ssh.step02)).toBe(stable(telnet.step02));
  });
});

/** Poll until `ok`, or fail saying what actually arrived. */
async function until(ok: () => boolean, ms: number, what: () => string): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (ok()) return;
    await pause(100);
  }
  throw new Error(`timed out - ${what()}`);
}
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
