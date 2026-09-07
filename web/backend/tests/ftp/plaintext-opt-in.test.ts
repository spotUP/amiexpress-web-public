/**
 * The escape hatch from the plaintext refusal, and how firmly it is shut.
 *
 * The board's policy is explicit FTPS: a caller off the box issues `AUTH TLS`
 * or he is refused at `USER` (`tls-policy.test.ts`). That policy assumes the
 * client can do it, and on 2026-09-07 the sysop's could not find the option -
 * "i dont see that ftp mode in transmit on mac" - which leaves a server that
 * is reachable and admits nobody.
 *
 * So `FTP_ALLOW_PLAINTEXT=1` turns the refusal off. What is pinned here is
 * that it is genuinely opt-in: unset, empty, `0`, `no`, or a typo all leave
 * the policy standing, and only an explicit yes opens it. A weakening that a
 * misspelling could switch on would not be a decision anybody made.
 */
import * as net from 'net';

import { FtpSession, type FtpDeps, type FtpUser } from '../../src/ftp/ftp-session';
import { ftpAllowsPlaintext, startFtpServer } from '../../src/ftp/start-ftp';

const SYSOP: FtpUser = { id: 1, username: 'sysop' };

/** The caller is off the box: the one thing a 127.0.0.1 test cannot arrange. */
const REMOTE = '203.0.113.5';

function deps(): FtpDeps {
  return {
    authenticate: async (u, p) => (u === 'sysop' && p === 'correct-horse' ? SYSOP : null),
    reserveNode: async () => 3,
    releaseNode: async () => undefined,
    log: () => undefined,
    timeRemainingMinutes: () => 42,
  };
}

/** Reads whole lines and keeps the remainder - a reply can arrive in one packet. */
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
    return new Promise((resolve) => {
      this.waiting = resolve;
      this.drain();
    });
  }
}

/** A one-connection server whose session is told the peer is remote. */
async function remoteSession(allowPlaintext: boolean) {
  const server = net.createServer((socket) => {
    new FtpSession(socket, deps(), REMOTE, { allowPlaintext }).start();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as net.AddressInfo).port;

  const client = net.createConnection({ port, host: '127.0.0.1' });
  const lines = new Lines(client);
  expect(await lines.next()).toBe('220 Welcome to Ami-Express FTP server.');

  return {
    lines,
    client,
    async close() {
      client.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

describe('the plaintext escape hatch is off unless it is asked for', () => {
  it('reads only an explicit yes as yes', () => {
    expect(ftpAllowsPlaintext({ FTP_ALLOW_PLAINTEXT: '1' })).toBe(true);
    expect(ftpAllowsPlaintext({ FTP_ALLOW_PLAINTEXT: 'true' })).toBe(true);
    expect(ftpAllowsPlaintext({ FTP_ALLOW_PLAINTEXT: 'YES' })).toBe(true);
  });

  it('reads everything else as no, including the near misses', () => {
    expect(ftpAllowsPlaintext({})).toBe(false);
    expect(ftpAllowsPlaintext({ FTP_ALLOW_PLAINTEXT: '' })).toBe(false);
    expect(ftpAllowsPlaintext({ FTP_ALLOW_PLAINTEXT: '0' })).toBe(false);
    expect(ftpAllowsPlaintext({ FTP_ALLOW_PLAINTEXT: 'no' })).toBe(false);
    expect(ftpAllowsPlaintext({ FTP_ALLOW_PLAINTEXT: 'false' })).toBe(false);
    // A typo must not open a board up.
    expect(ftpAllowsPlaintext({ FTP_ALLOW_PLAINTEXT: 'ture' })).toBe(false);
    expect(ftpAllowsPlaintext({ FTP_ALLOW_PLAINTEXT: 'yes please' })).toBe(false);
  });
});

describe('a caller off the box, in the clear', () => {
  it('is refused while the policy stands - the default', async () => {
    const session = await remoteSession(false);

    session.client.write('USER sysop\r\n');
    expect(await session.lines.next()).toBe('534 Policy requires TLS - issue AUTH TLS first');

    await session.close();
  });

  it('is let in once the sysop switches the policy off', async () => {
    const session = await remoteSession(true);

    session.client.write('USER sysop\r\n');
    expect(await session.lines.next()).toBe('331 Password required');

    session.client.write('PASS correct-horse\r\n');
    expect(await session.lines.next()).toMatch(/^230 /);

    await session.close();
  });

  it('is still refused a WRONG password - the hatch opens the door, not the lock', async () => {
    const session = await remoteSession(true);

    session.client.write('USER sysop\r\n');
    expect(await session.lines.next()).toBe('331 Password required');

    session.client.write('PASS wrong\r\n');
    expect(await session.lines.next()).toBe('430 Invalid username or password');

    await session.close();
  });
});

describe('the environment reaches the listener', () => {
  /**
   * The behaviour above is proved on a session built by hand. This is the hop
   * that a hand-built session cannot show: `FTP_ALLOW_PLAINTEXT` in the
   * environment has to become the server's option, or the sysop sets the
   * variable, reads the warning in the log, and is still refused.
   */
  const boardConfig = { ftp_enabled: true, ftp_port: 0 };

  it('carries the sysop decision from the variable to the server', async () => {
    const server = await startFtpServer(boardConfig, deps(), {
      FTP_ALLOW_PLAINTEXT: '1',
    });
    expect(server).not.toBeNull();
    expect((server as unknown as { options: { allowPlaintext?: boolean } }).options.allowPlaintext)
      .toBe(true);
    await server!.stop();
  });

  it('leaves it off when the variable is not set', async () => {
    const server = await startFtpServer(boardConfig, deps(), {});
    expect((server as unknown as { options: { allowPlaintext?: boolean } }).options.allowPlaintext)
      .toBe(false);
    await server!.stop();
  });

  it('starts nothing at all while the sysop has FTP switched off', async () => {
    expect(await startFtpServer({ ftp_enabled: false }, deps(), { FTP_ALLOW_PLAINTEXT: '1' }))
      .toBeNull();
  });
});
