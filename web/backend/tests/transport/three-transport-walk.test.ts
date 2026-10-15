/**
 * TWO REAL CALLERS, TWO REAL SERVERS, THE SAME BYTES.
 *
 * TP-14's first step, and the first test in this repo that opens a socket
 * to more than one server and compares what comes back.
 *
 * The servers are started BY THIS TEST - a `TelnetServer` and an
 * `SSHServerImpl` on ephemeral ports, each wired to the real
 * `setupTelnetSSHHandler` - which is only possible because TP-2 made the
 * entry point importable. Nothing here mocks a socket.
 *
 * WHAT IS PINNED: step 01, connect to the graphics prompt. Until TP-13a
 * that step was a graphics prompt on the byte transports and eight further
 * lines of connect banner on the browser; now the two byte transports must
 * deliver it byte for byte, and this is what says so.
 *
 * WHAT IS NOT HERE, and why: the plan's steps 02-16 (a graphics answer, a
 * login as sysop, four pauses, WHO, DOORS, the door list, goodbye) each
 * need a BOOTED BOARD - a database with that user in it, the screens on
 * disk, the conferences - because the graphics answer is routed through
 * `handleCommand` and everything after it reads the board. Driving that
 * from a test needs the temp-board fixture, and it is a piece of work in
 * its own right rather than something to bolt onto this file. Measured,
 * not assumed: with a stub `handleCommand`, step 02 returns 0 bytes.
 */
process.env.SKIP_DB_INIT = '1';

import * as crypto from 'crypto';
import * as net from 'net';
import { Client as SSHClient } from 'ssh2';
import { TelnetServer, TelnetConnection } from '../../src/server/telnet-server';
import { SSHServerImpl } from '../../src/server/ssh-server';
import {
  setupTelnetSSHHandler,
  whenTeardownsSettle,
  type TransportSessionDeps,
} from '../../src/server/transport-session';
import { ANSI_GRAPHICS_PROMPT } from '../../src/services/login-connect.service';
import { untilSettled } from './helpers/wire-quiet';

jest.setTimeout(60000);

/** The sentinel step 01 reads until - the prompt's own last characters. */
const STEP_01_SENTINEL = 'A/R/P/P8/T/N';

const deps = (): TransportSessionDeps => ({
  io: {} as never,
  sessions: new Map(),
  nodeManager: { releaseSession: jest.fn(async () => undefined) },
  handleCommand: jest.fn(),
} as unknown as TransportSessionDeps);

/**
 * IAC negotiation removed, so a telnet stream can be compared with an SSH
 * one at all. Everything else - every printable byte, every escape - stays.
 */
function stripTelnetNegotiation(raw: Buffer): Buffer {
  const out: number[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    if (raw[i] !== 255) { out.push(raw[i]); continue; }
    const verb = raw[i + 1];
    if (verb === 250) {                       // SB ... IAC SE
      i += 2;
      while (i < raw.length && !(raw[i] === 255 && raw[i + 1] === 240)) i += 1;
      i += 1;
    } else if (verb === 255) {                // escaped 0xFF
      out.push(255);
      i += 1;
    } else {                                  // WILL/WONT/DO/DONT <option>
      i += 2;
    }
  }
  return Buffer.from(out);
}

/**
 * Read from a stream until the sentinel arrives AND the paint has finished.
 *
 * Resolving on the sentinel alone snapshots whatever shared its TCP chunk.
 * The prompt is followed by ESC 7 (DECSC, `line-input.util.ts:354`), which
 * telnet usually delivers in the same chunk and SSH, framed by its own
 * record layer, usually does not - so two legs painting identical bytes
 * compared unequal, and which leg "won" depended on machine load. Waiting
 * for the capture to stop growing is what makes the comparison about the
 * board rather than about chunk boundaries.
 */
function readUntil(
  attach: (onData: (chunk: Buffer) => void) => void,
  sentinel: string,
  what: string,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const seen = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(
        `${what}: never reached "${sentinel}" - got ${Buffer.concat(chunks).length} bytes: ` +
        JSON.stringify(Buffer.concat(chunks).toString('latin1').slice(-200)),
      ));
    }, 20000);
    attach((chunk) => {
      chunks.push(chunk);
      if (stripTelnetNegotiation(Buffer.concat(chunks)).toString('latin1').includes(sentinel)) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  return seen
    .then(() => untilSettled(() => Buffer.concat(chunks).length))
    .then(() => Buffer.concat(chunks));
}

/** An RSA host key, made here so the SSH server has something to offer. */
function hostKey(): Buffer {
  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
  });
  return Buffer.from(privateKey);
}

async function telnetStep01(): Promise<Buffer> {
  const server = new TelnetServer(0);
  await server.start();
  server.on('connection', (c: TelnetConnection) => setupTelnetSSHHandler(c, 'telnet', deps()));
  const port = (server as any).server.address().port;

  const client = net.connect(port);
  client.on('error', () => undefined);
  try {
    return await readUntil((onData) => client.on('data', onData), STEP_01_SENTINEL, 'telnet');
  } finally {
    client.destroy();
    await (server as any).stop?.();
    // The close handler logs the caller off asynchronously. Returning before
    // that finishes leaves it running into jest's teardown, where its
    // `require` throws "imported after the environment has been torn down".
    await whenTeardownsSettle();
  }
}

async function sshStep01(): Promise<Buffer> {
  const server = new SSHServerImpl(0, [hostKey()]);
  // The same handler the telnet leg gets, and the same one index.ts wires:
  // without it the SSH server accepts a shell and the BBS never speaks.
  server.on('connection', (connection: any) => setupTelnetSSHHandler(connection, 'ssh', deps()));
  await server.start();
  const port = (server as any).server.address().port;

  const client = new SSHClient();
  try {
    const stream: any = await new Promise((resolve, reject) => {
      client.on('ready', () => {
        client.shell({ term: 'xterm-256color', cols: 80, rows: 24 } as any, (err: Error | undefined, s: any) => {
          if (err) reject(err); else resolve(s);
        });
      });
      client.on('error', reject);
      // A username the BBS never checks: SSH here is a pure transport.
      client.connect({ host: '127.0.0.1', port, username: 'walker', password: 'ignored' });
    });
    return await readUntil((onData) => stream.on('data', onData), STEP_01_SENTINEL, 'ssh');
  } finally {
    client.end();
    await (server as any).stop?.();
    await whenTeardownsSettle();
  }
}

describe('step 01 - connect, to the graphics prompt', () => {
  /**
   * ONE connect per transport, and every assertion made on it.
   *
   * Not two tests: the FRONTEND syscmd runs on every connect, and under
   * jest its dynamic import of `Doors/telnet-front/index.ts` cannot
   * resolve - so a SECOND connect in the same file diverts to "Press any
   * key to continue" instead of the graphics prompt. That is a property of
   * running a door under jest, not of the board, and connecting once keeps
   * this file measuring the transports rather than the module loader.
   */
  it('is the same banner and the same prompt on a real telnet socket and a real ssh2 shell', async () => {
    const [telnetRaw, sshRaw] = await Promise.all([telnetStep01(), sshStep01()]);
    const telnet = stripTelnetNegotiation(telnetRaw).toString('latin1');
    const ssh = sshRaw.toString('latin1');

    // The clock, and the node each caller happened to get, are the only
    // things that cannot repeat between two connects.
    const stable = (t: string) =>
      t.replace(/Connection occured at [^.]+\./, 'Connection occured at <time>.')
       .replace(/node \d+/g, 'node <n>')
       .replace(/Node \d+/g, 'Node <n>');

    expect(stable(ssh)).toBe(stable(telnet));

    for (const text of [telnet, ssh]) {
      // TP-13a: these lines used to reach the browser and nobody else.
      expect(text).toContain('CONNECT 19200');
      expect(text).toContain('**EMSI_IRQ8E08');
      expect(text).toContain('Welcome to');
      expect(text).toContain('Connection occured at');
      // ...and the prompt they precede.
      expect(text).toContain(STEP_01_SENTINEL);
    }

    // Both legs said something substantial, so an empty stream cannot pass
    // the comparison above by matching another empty stream.
    // (300: the two '/X Native Telnet' lines are gone - express.e has none.)
    expect(telnet.length).toBeGreaterThan(300);
    expect(ssh.length).toBeGreaterThan(300);
  });
});

const asTextOf = (b: Buffer) => b.toString('latin1');
