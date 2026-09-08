/**
 * One board, two names, and the certificate a caller is actually served.
 *
 * `uptown.uprough.net` is the address the sysop gives out; `bbs.uprough.net`
 * is what everything internal uses. They resolve to the same machine, but a
 * TLS certificate is issued for a NAME - a client dialling uptown and handed
 * the bbs certificate refuses the connection, and no client-side setting
 * fixes that. So the FTP server carries a certificate per name and picks by
 * SNI during the `AUTH TLS` handshake.
 *
 * The certificates here are generated for this file, one per name, with
 * DIFFERENT common names - which is the only way to tell which one the server
 * chose. `rejectUnauthorized: false` on the client is deliberate: what is
 * under test is WHICH certificate arrives, not whether a self-signed one
 * validates.
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import * as tls from 'tls';

import { FtpServer } from '../../src/ftp/ftp-server';
import type { FtpDeps, FtpUser } from '../../src/ftp/ftp-session';

const UPTOWN = 'uptown.uprough.net';
const BBS = 'bbs.uprough.net';

const SYSOP: FtpUser = { id: 1, username: 'sysop' };

function deps(): FtpDeps {
  return {
    authenticate: async () => SYSOP,
    reserveNode: async () => 3,
    releaseNode: async () => undefined,
    log: () => undefined,
  };
}

/** A self-signed pair whose CN is the host, so the choice is visible. */
function certFor(host: string): { cert: Buffer; key: Buffer } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ftp-sni-'));
  const certPath = path.join(dir, 'cert.pem');
  const keyPath = path.join(dir, 'key.pem');
  execFileSync(
    'openssl',
    [
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
      '-keyout', keyPath, '-out', certPath,
      '-days', '1', '-subj', `/CN=${host}`,
    ],
    { stdio: 'ignore' }
  );
  return { cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) };
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

describe('the certificate follows the name the caller dialled', () => {
  const uptown = certFor(UPTOWN);
  const bbs = certFor(BBS);
  let server: FtpServer;
  let port: number;

  beforeAll(async () => {
    server = new FtpServer(
      {
        port: 0,
        host: '127.0.0.1',
        // The default context is uptown's, as in production: the first name
        // in FTP_TLS_HOSTS is both preferred and the no-SNI fallback.
        tls: uptown,
        tlsHosts: { [UPTOWN]: uptown, [BBS]: bbs },
      },
      deps()
    );
    await server.start();
    port = server.address()!.port;
  });

  afterAll(async () => {
    await server.stop();
  });

  /** Greet, AUTH TLS, handshake asking for `servername`, report the CN served. */
  async function commonNameFor(servername?: string): Promise<string> {
    const raw = net.createConnection({ port, host: '127.0.0.1' });
    const plain = new Lines(raw);
    expect(await plain.next()).toBe('220 Welcome to Ami-Express FTP server.');

    raw.write('AUTH TLS\r\n');
    expect(await plain.next()).toBe('234 AUTH TLS successful');

    const secured = tls.connect({
      socket: raw,
      rejectUnauthorized: false,
      ...(servername ? { servername } : {}),
    });
    await new Promise<void>((resolve) => secured.once('secureConnect', () => resolve()));
    const subject = secured.getPeerCertificate().subject as { CN?: string };
    secured.destroy();
    raw.destroy();
    return subject.CN ?? '';
  }

  it('serves the uptown certificate to a caller who asked for uptown', async () => {
    expect(await commonNameFor(UPTOWN)).toBe(UPTOWN);
  });

  it('serves the bbs certificate to a caller who asked for bbs', async () => {
    // The regression this file exists for: before SNI, BOTH answers were the
    // bbs certificate, so the official address could not be used at all.
    expect(await commonNameFor(BBS)).toBe(BBS);
  });

  it('falls back to the default for a client that sends no server name', async () => {
    // An IP-address connection sends no SNI. Something has to be served, and
    // the first configured name is it.
    expect(await commonNameFor(undefined)).toBe(UPTOWN);
  });

  it('falls back to the default for a name it has no certificate for', async () => {
    expect(await commonNameFor('someone-elses.example.net')).toBe(UPTOWN);
  });
});
