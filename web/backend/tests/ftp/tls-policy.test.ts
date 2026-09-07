/**
 * The plaintext policy, and the upgrade that is the way around it.
 *
 * The sysop's decision (thoughts/shared/plans/2026-09-07-ftp-server.md): this
 * board is on the public internet, so a password may not cross it in the
 * clear. Explicit FTPS - `AUTH TLS` after the greeting - is how a caller gets
 * in from outside; a loopback caller (an SSH tunnel, the container itself)
 * still works in the clear.
 *
 * Note what is NOT done: refusing at the greeting. The plan's own wording said
 * that, and it is wrong - `AUTH TLS` comes AFTER the greeting, so a server that
 * hangs up at 220 can never be upgraded by anybody. The refusal belongs on
 * USER, the first command that starts to hand over a password.
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import * as tls from 'tls';

import { FtpServer } from '../../src/ftp/ftp-server';
import { FtpSession, isLoopback, type FtpDeps, type FtpUser } from '../../src/ftp/ftp-session';

const SYSOP: FtpUser = { id: 1, username: 'sysop' };

function deps(): FtpDeps {
  return {
    authenticate: async (u, p) => (u === 'sysop' && p === 'correct-horse' ? SYSOP : null),
    reserveNode: async () => 3,
    releaseNode: async () => undefined,
    log: () => undefined,
    timeRemainingMinutes: () => 42,
  };
}

/**
 * A throwaway self-signed certificate, so the handshake is a real one.
 *
 * Generated ONCE for the file: `openssl req` takes long enough that doing it
 * per test blew jest's 5s budget whenever this file ran alongside the other
 * FTP suites - green alone, red in the directory, which is the worst way for a
 * test to fail.
 */
let cached: { cert: Buffer; key: Buffer } | null = null;
function selfSigned(): { cert: Buffer; key: Buffer } {
  if (cached) return cached;
  cached = generateSelfSigned();
  return cached;
}

function generateSelfSigned(): { cert: Buffer; key: Buffer } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ftp-tls-'));
  const keyPath = path.join(dir, 'key.pem');
  const certPath = path.join(dir, 'cert.pem');
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', keyPath, '-out', certPath, '-days', '1',
    '-subj', '/CN=localhost',
  ], { stdio: 'ignore' });
  return { cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) };
}

/**
 * A line reader that keeps what it did not use.
 *
 * The naive version - attach `data`, resolve on the first newline, detach -
 * throws away the rest of the chunk. `FEAT` answers three lines that arrive in
 * ONE packet, so the second read waited for bytes that had already been
 * delivered and the test hung until jest killed it.
 */
class Lines {
  private buffer = '';
  private waiting: ((line: string) => void) | null = null;

  constructor(stream: NodeJS.ReadableStream) {
    stream.on('data', (chunk: Buffer | string) => {
      this.buffer += chunk.toString('latin1' as BufferEncoding);
      this.drain();
    });
  }

  private drain(): void {
    if (!this.waiting) return;
    const i = this.buffer.indexOf('\n');
    if (i < 0) return;
    const line = this.buffer.slice(0, i).replace(/\r$/, '');
    this.buffer = this.buffer.slice(i + 1);
    const resolve = this.waiting;
    this.waiting = null;
    resolve(line);
  }

  next(): Promise<string> {
    return new Promise(resolve => {
      this.waiting = resolve;
      this.drain();
    });
  }
}

describe('who may talk to us in the clear', () => {
  it('knows loopback from the rest, including IPv4-mapped IPv6', () => {
    expect(isLoopback('127.0.0.1')).toBe(true);
    expect(isLoopback('::1')).toBe(true);
    expect(isLoopback('::ffff:127.0.0.1')).toBe(true);
    expect(isLoopback('203.0.113.5')).toBe(false);
    expect(isLoopback(undefined)).toBe(false);
  });

  it('refuses a plaintext login from off the box, and says how to fix it', async () => {
    // A real socket pair, with the session told the peer is not local - which
    // is the one thing an ephemeral-port test on 127.0.0.1 cannot arrange.
    const server = net.createServer(socket => {
      new FtpSession(socket, deps(), '203.0.113.5').start();
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as net.AddressInfo).port;

    const client = net.createConnection({ port, host: '127.0.0.1' });
    const lines = new Lines(client);
    expect(await lines.next()).toBe('220 Welcome to Ami-Express FTP server.');

    client.write('USER sysop\r\n');
    expect(await lines.next()).toBe('534 Policy requires TLS - issue AUTH TLS first');

    client.destroy();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  it('lets that same caller in once the connection is secured', async () => {
    const server = new FtpServer({ port: 0, host: '127.0.0.1', tls: selfSigned() }, deps());
    await server.start();
    const port = server.address()!.port;

    const raw = net.createConnection({ port, host: '127.0.0.1' });
    const plain = new Lines(raw);
    expect(await plain.next()).toBe('220 Welcome to Ami-Express FTP server.');

    raw.write('AUTH TLS\r\n');
    expect(await plain.next()).toBe('234 AUTH TLS successful');

    // From here the SAME connection continues inside TLS - that is what
    // explicit FTPS is. The raw socket must stay in buffer mode: an encoding
    // set on it makes it emit strings, which is not a transport TLS can wrap.
    const secured = tls.connect({ socket: raw, rejectUnauthorized: false });
    await new Promise<void>(resolve => secured.once('secureConnect', () => resolve()));

    const inside = new Lines(secured);
    secured.write('USER sysop\r\n');
    expect(await inside.next()).toBe('331 Password required');
    secured.write('PASS correct-horse\r\n');
    expect(await inside.next()).toBe('230 password accepted. Time remaining for today 42 mins.');

    secured.destroy();
    await server.stop();
  });

  it('offers AUTH TLS in FEAT when a certificate is configured', async () => {
    const server = new FtpServer({ port: 0, host: '127.0.0.1', tls: selfSigned() }, deps());
    await server.start();
    const port = server.address()!.port;

    const client = net.createConnection({ port, host: '127.0.0.1' });
    const lines = new Lines(client);
    await lines.next();

    client.write('FEAT\r\n');
    // Three lines in one packet - the reason Lines buffers.
    expect(await lines.next()).toBe('211-Extensions supported:');
    expect(await lines.next()).toBe(' AUTH TLS');

    client.destroy();
    await server.stop();
  });
});
