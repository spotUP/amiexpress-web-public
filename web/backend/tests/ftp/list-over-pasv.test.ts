/**
 * A listing, end to end: PASV, a second socket, rows, 226.
 *
 * The sysop's report that this closes: Transmit logged in, asked for `/`, and
 * got `502 CWD not implemented yet` - a login with nothing behind it. What is
 * driven here is the real command loop over a real socket pair, with a real
 * passive listener and a real second connection, because every part of this
 * that goes wrong goes wrong in the ORDER of the replies rather than in any
 * one of them:
 *
 *   150 before the data connection is used, rows, close, THEN 226.
 *
 * A 226 that arrives before the data socket closes is read by clients as a
 * truncated listing, and a server that opens the listener after answering 227
 * is a race a fast client wins.
 */
import * as net from 'net';
import type { AddressInfo } from 'net';

import { FtpSession, type FtpDeps, type FtpUser } from '../../src/ftp/ftp-session';
import { FtpFilesystem } from '../../src/ftp/ftp-filesystem';
import { parsePortRange, passiveReplyAddress } from '../../src/ftp/ftp-data-channel';

const SYSOP: FtpUser = { id: 1, username: 'sysop' };

/** Two conferences, no DIR files: the ROOT listing is what this file drives. */
const filesystem = new FtpFilesystem({
  conferences: () => [
    { conference_id: 1, name: 'General' },
    { conference_id: 2, name: 'Elite' },
    { conference_id: 3, name: 'Hidden', exclude_ftp: true },
  ],
  canAccess: () => true,
  bbsRoot: '/nonexistent-board',
});

function deps(): FtpDeps {
  return {
    authenticate: async (u, p) => (u === 'sysop' && p === 'correct-horse' ? SYSOP : null),
    reserveNode: async () => 3,
    releaseNode: async () => undefined,
    log: () => undefined,
    filesystem,
    // The whole ephemeral range would be wrong: the point of the setting is
    // that only a published range is reachable. A small one also proves the
    // "no free port" path is not hit for a single transfer.
    passivePorts: () => ({ first: 34_101, last: 34_110 }),
    passiveAddress: () => '127.0.0.1',
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

let server: net.Server;
let port: number;

beforeAll(async () => {
  server = net.createServer((socket) => {
    // Loopback, so the plaintext policy lets the login through without TLS -
    // what is under test here is the listing, not the policy.
    new FtpSession(socket, deps(), socket.remoteAddress).start();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** A logged-in control connection. */
async function login() {
  const control = net.createConnection({ port, host: '127.0.0.1' });
  const lines = new Lines(control);
  expect(await lines.next()).toBe('220 Welcome to Ami-Express FTP server.');

  control.write('USER sysop\r\n');
  expect(await lines.next()).toBe('331 user accepted');
  control.write('PASS correct-horse\r\n');
  expect(await lines.next()).toMatch(/^230 /);

  return { control, lines };
}

/** `227 Entering Passive Mode (h1,h2,h3,h4,p1,p2)` -> the port to dial. */
function portFromPasv(reply: string): number {
  const numbers = reply.match(/\((\d+(?:,\d+){5})\)/);
  expect(numbers).not.toBeNull();
  const parts = numbers![1].split(',').map(Number);
  return parts[4] * 256 + parts[5];
}

describe('a caller who has just logged in', () => {
  it('is told where he is, instead of 502', async () => {
    const { control, lines } = await login();

    control.write('PWD\r\n');
    expect(await lines.next()).toBe('257 "/" is current directory.');

    control.destroy();
  });

  it('can enter a conference and come back out', async () => {
    const { control, lines } = await login();

    control.write('CWD 001-General\r\n');
    expect(await lines.next()).toBe('250 CWD command successful.');
    control.write('PWD\r\n');
    expect(await lines.next()).toBe('257 "/001-General" is current directory.');
    control.write('CDUP\r\n');
    expect(await lines.next()).toBe('250 CWD command successful.');

    control.destroy();
  });

  it('is refused a conference that is not his, by name', async () => {
    const { control, lines } = await login();

    control.write('CWD 003-Hidden\r\n');
    // ftpd.e:1261 - a conference and a subdirectory read the same to a caller.
    expect(await lines.next()).toBe('550 003-Hidden: No such file or directory.');

    control.destroy();
  });

  it('names the path the caller sent when he tries to leave the root (ftpd.e:1261)', async () => {
    const { control, lines } = await login();

    control.write('CWD ../../etc\r\n');
    expect(await lines.next()).toBe('550 ../../etc: No such file or directory.');

    control.destroy();
  });

  it('answers LIST and NLST with a path, a mixed argument or a bare space as 500, as ftpd.e does (ftpd.e:1978-1985, 2047)', async () => {
    const { control, lines } = await login();

    for (const request of ['LIST 003-Hidden', 'LIST ', 'NLST 001-General', 'LIST -la 001-General']) {
      control.write(`${request}\r\n`);
      expect(await lines.next()).toBe('500 command not recognized');
    }

    control.destroy();
  });

  it('lists the current directory for LIST -la and NLST -a (WEB_ deviation from ftpd.e:1978/1982)', async () => {
    const { control, lines } = await login();

    for (const [request, expected] of [
      ['LIST -la', /001-General/],
      ['NLST -a', /^001-General\r\n002-Elite\r\n$/],
      ['NLST -l -a', /^001-General\r\n002-Elite\r\n$/],
    ] as const) {
      control.write('PASV\r\n');
      const data = net.createConnection({
        port: portFromPasv(await lines.next()),
        host: '127.0.0.1',
      });
      const received: Buffer[] = [];
      data.on('data', (chunk) => received.push(chunk));
      const closed = new Promise<void>((resolve) => data.once('close', () => resolve()));

      control.write(`${request}\r\n`);
      expect(await lines.next()).toMatch(/^150 /);
      await closed;
      expect(await lines.next()).toBe('226 Transfer Complete');
      expect(Buffer.concat(received).toString('latin1')).toMatch(expected);
    }

    control.destroy();
  });

  it('is answered 200 for PBSZ, which a client sends before it will transfer', async () => {
    // It answered 500 - "command not recognized" - and Transmit read that as
    // "this server cannot protect data" and gave up on the connection.
    const { control, lines } = await login();

    control.write('PBSZ 0\r\n');
    expect(await lines.next()).toBe('200 PBSZ=0');

    control.destroy();
  });

  it('takes TYPE A and TYPE I, and refuses the rest', async () => {
    const { control, lines } = await login();

    control.write('TYPE I\r\n');
    expect(await lines.next()).toBe('200 Type set to I!!!');
    control.write('TYPE A\r\n');
    expect(await lines.next()).toBe('200 Type set to A!!!');
    control.write('TYPE Q\r\n');
    expect(await lines.next()).toBe('502 Type not implemented');
    // ftpd.e:1348 knows only I and A: L is refused, and so is a parameter
    // that merely starts with one.
    control.write('TYPE L 8\r\n');
    expect(await lines.next()).toBe('502 Type not implemented');
    control.write('TYPE AB\r\n');
    expect(await lines.next()).toBe('502 Type not implemented');

    control.destroy();
  });
});

describe('LIST over a passive connection', () => {
  it('delivers the caller\'s conferences, in the order 150 - rows - 226', async () => {
    const { control, lines } = await login();

    control.write('PASV\r\n');
    const pasv = await lines.next();
    expect(pasv).toMatch(/^227 Entering Passive Mode \(127,0,0,1,\d+,\d+\)$/);

    const data = net.createConnection({ port: portFromPasv(pasv), host: '127.0.0.1' });
    const received: Buffer[] = [];
    data.on('data', (chunk) => received.push(chunk));
    const closed = new Promise<void>((resolve) => data.once('close', () => resolve()));

    control.write('LIST\r\n');
    expect(await lines.next()).toBe('150 Opening Binary connection for directory listing');

    await closed;
    expect(await lines.next()).toBe('226 Transfer Complete');

    const body = Buffer.concat(received).toString('latin1');
    const rows = body.split('\r\n').filter((row) => row.length > 0);
    expect(rows).toHaveLength(2);
    // ftpd.e:891 - `dr--r--r--   1 root  root`, read-only and root-owned.
    expect(rows[0]).toMatch(/^dr--r--r--   1 root  root/);
    expect(body).toContain('001-General');
    expect(body).toContain('002-Elite');
    // EXCLUDE_FTP is honoured through the whole path, not only in the unit.
    expect(body).not.toContain('Hidden');

    control.destroy();
  });

  it('gives NLST the same rows as bare names', async () => {
    const { control, lines } = await login();

    control.write('PASV\r\n');
    const data = net.createConnection({
      port: portFromPasv(await lines.next()),
      host: '127.0.0.1',
    });
    const received: Buffer[] = [];
    data.on('data', (chunk) => received.push(chunk));
    const closed = new Promise<void>((resolve) => data.once('close', () => resolve()));

    control.write('NLST\r\n');
    expect(await lines.next()).toMatch(/^150 /);
    await closed;
    expect(await lines.next()).toBe('226 Transfer Complete');

    expect(Buffer.concat(received).toString('latin1')).toBe('001-General\r\n002-Elite\r\n');

    control.destroy();
  });

  /**
   * The listing a modern client ACTUALLY asks for.
   *
   * The sysop's session stopped dead after PWD with no error he could read:
   * `FEAT` advertised `MLST`, so Transmit sent `MLSD` and never sent `LIST` at
   * all - and `MLSD` answered `502 not implemented yet`. A server must not
   * advertise a listing it refuses.
   */
  it('answers MLSD, which is what FEAT promises', async () => {
    const { control, lines } = await login();

    control.write('PASV\r\n');
    const data = net.createConnection({
      port: portFromPasv(await lines.next()),
      host: '127.0.0.1',
    });
    const received: Buffer[] = [];
    data.on('data', (chunk) => received.push(chunk));
    const closed = new Promise<void>((resolve) => data.once('close', () => resolve()));

    control.write('MLSD\r\n');
    expect(await lines.next()).toMatch(/^150 /);
    await closed;
    expect(await lines.next()).toBe('226 Transfer Complete');

    const rows = Buffer.concat(received).toString('latin1').split('\r\n').filter(Boolean);
    expect(rows).toHaveLength(2);
    // The facts FEAT names - type, size, modify, perm - then the name.
    // ftpd.e:881 - capitalised facts, and `Perm=r`.
    expect(rows[0]).toMatch(/^Type=dir;Modify=\d{14};Perm=r; 001-General$/);
    expect(rows[1]).toContain('002-Elite');

    control.destroy();
  });

  it('refuses MLSD of any path but none or / (ftpd.e:1907-1917)', async () => {
    const { control, lines } = await login();

    control.write('MLSD 001-General\r\n');
    expect(await lines.next()).toBe('550 001-General: No such file or directory');

    control.destroy();
  });

  it('promises nothing in FEAT that it will not answer', async () => {
    const { control, lines } = await login();

    control.write('FEAT\r\n');
    const feature: string[] = [];
    let line = await lines.next();
    expect(line).toBe('211-Extensions supported:');
    while (!(line = await lines.next()).startsWith('211 ')) feature.push(line.trim());

    // Every advertised extension is a verb the server answers. MLST was the
    // one that was not, and the client that believed it got nothing.
    expect(feature).toContain('EPSV');
    if (feature.some((f) => f.startsWith('MLST'))) {
      control.write('MLST /\r\n');
      expect(await lines.next()).toBe('250-Listing');
      expect(await lines.next()).toMatch(/^ Type=dir;/);
      expect(await lines.next()).toBe('250 END');
    }

    control.destroy();
  });

  it('takes the OPTS a client sends before a machine listing', async () => {
    // Transmit sends `OPTS MLST modify;` and read the 500 it used to get as
    // "no machine listing here".
    const { control, lines } = await login();

    control.write('OPTS MLST modify;\r\n');
    expect(await lines.next()).toBe('200 MLST OPTS type;size;modify;perm;');

    control.destroy();
  });

  /**
   * What a modern client tries FIRST.
   *
   * curl sends EPSV and falls back to PASV when refused, costing a round
   * trip; a client that does not fall back gets no data connection at all.
   * Measured against the real server on 2026-09-07: `500 command not
   * recognized`, then "Failed EPSV attempt. Disabling EPSV".
   */
  it('answers EPSV, which clients send before PASV', async () => {
    const { control, lines } = await login();

    control.write('EPSV\r\n');
    const reply = await lines.next();
    expect(reply).toMatch(/^229 Entering Extended Passive Mode \(\|\|\|\d+\|\)$/);

    const port = Number(reply.match(/\|\|\|(\d+)\|/)![1]);
    const data = net.createConnection({ port, host: '127.0.0.1' });
    const received: Buffer[] = [];
    data.on('data', (chunk) => received.push(chunk));
    const closed = new Promise<void>((resolve) => data.once('close', () => resolve()));

    control.write('LIST\r\n');
    expect(await lines.next()).toMatch(/^150 /);
    await closed;
    expect(await lines.next()).toBe('226 Transfer Complete');
    expect(Buffer.concat(received).toString('latin1')).toContain('001-General');

    control.destroy();
  });

  it('refuses a LIST with no PASV before it, rather than hanging', async () => {
    // A client that gets no answer here waits for its own timeout; 425 tells
    // it what to do instead.
    const { control, lines } = await login();

    control.write('LIST\r\n');
    expect(await lines.next()).toBe("425 Can't open data connection");

    control.destroy();
  });
});

describe('asking about one file', () => {
  /**
   * The sysop's client asked `MLST 1oo-olsk.txt` and `SIZE 1oo-olsk.txt` about
   * a file that was in the listing, and got `550 no such directory` and `502
   * not implemented yet`. The tree could only answer about directories.
   *
   * These cases use the ROOT, whose entries are conferences, because this
   * suite's filesystem has no DIR files behind it - what is pinned is that a
   * single name is answered at all, and refused cleanly when it is not there.
   */
  it('answers MLST about a path that exists', async () => {
    const { control, lines } = await login();

    control.write('MLST 001-General\r\n');
    expect(await lines.next()).toBe('250-Listing');
    expect(await lines.next()).toMatch(/^ Type=dir;Modify=\d{14};Perm=r; \/001-General$/);
    expect(await lines.next()).toBe('250 END');

    control.destroy();
  });

  it('refuses SIZE and MDTM for a name that is not there, by name', async () => {
    const { control, lines } = await login();

    control.write('SIZE nothing.lha\r\n');
    expect(await lines.next()).toBe('550 nothing.lha: No such file or directory');
    control.write('MDTM nothing.lha\r\n');
    expect(await lines.next()).toBe('550 nothing.lha: No such file or directory');

    control.destroy();
  });

  it('refuses SIZE on a directory rather than answering 0', async () => {
    const { control, lines } = await login();

    control.write('SIZE 001-General\r\n');
    // A directory is not a plain file, and express does not distinguish.
    expect(await lines.next()).toBe('550 001-General: No such file or directory');

    control.destroy();
  });
});

describe('verbs ftpd.e does not have', () => {
  /**
   * ftpd.e:2047 answers every verb outside its dispatcher (2012-2036) with
   * `500 command not recognized` - DELE, RMD, MKD, RNFR, RNTO, SITE, STOU and
   * APPE included. The port used to invent 550 / 502 sentences for them.
   */
  it('answers DELE RMD MKD RNFR RNTO SITE STOU APPE with ftpd.e\'s 500', async () => {
    const { control, lines } = await login();

    for (const verb of ['DELE X.LHA', 'RMD 001-General', 'MKD newthing', 'RNFR X.LHA',
      'RNTO Y.LHA', 'SITE HELP', 'STOU', 'APPE X.LHA']) {
      control.write(`${verb}\r\n`);
      expect(await lines.next()).toBe('500 command not recognized');
    }

    control.destroy();
  });

  it('still asks the built transfer verbs for a data connection', async () => {
    const { control, lines } = await login();

    // Built, and therefore asking for a data connection rather than saying no.
    control.write('RETR SOMETHING.LHA\r\n');
    expect(await lines.next()).toBe("425 Can't open data connection");
    control.write('STOR SOMETHING.LHA\r\n');
    expect(await lines.next()).toBe("425 Can't open data connection");

    control.destroy();
  });
});

describe('the passive settings', () => {
  it('reads the range shapes the board writes', () => {
    expect(parsePortRange('50101-50107')).toEqual({ first: 50101, last: 50107 });
    expect(parsePortRange('50101,50102,50103')).toEqual({ first: 50101, last: 50103 });
    expect(parsePortRange('50101')).toEqual({ first: 50101, last: 50101 });
    expect(parsePortRange('')).toBeNull();
    expect(parsePortRange(null)).toBeNull();
    expect(parsePortRange('nonsense')).toBeNull();
  });

  it('encodes the address the way PASV requires', () => {
    expect(passiveReplyAddress('203.0.113.10', 50101)).toBe('89,167,21,154,195,181');
    expect(195 * 256 + 181).toBe(50101);
  });

  it('refuses an address it cannot encode, instead of advertising nonsense', () => {
    expect(() => passiveReplyAddress('bbs.uprough.net', 50101)).toThrow(/IPv4/);
  });
});
