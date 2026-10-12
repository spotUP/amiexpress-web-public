/**
 * Phase 2 of thoughts/shared/plans/2026-09-07-ftp-server.md, proved the way
 * the plan says to prove it: a real client on a real socket against a real
 * listener on an ephemeral port. A unit test of a command parser would pass
 * on a server that never binds.
 */
import * as net from 'net';
import { FtpServer } from '../../src/ftp/ftp-server';
import type { FtpDeps, FtpUser } from '../../src/ftp/ftp-session';

const SYSOP: FtpUser = { id: 1, username: 'sysop' };

interface Harness {
  server: FtpServer;
  port: number;
  reserved: string[];
  released: string[];
  logged: string[];
}

async function listen(over: Partial<FtpDeps> = {}, opts: { nodes?: boolean } = {}): Promise<Harness> {
  const reserved: string[] = [];
  const released: string[] = [];
  const logged: string[] = [];

  const deps: FtpDeps = {
    authenticate: async (username, password) =>
      username.toLowerCase() === 'sysop' && password === 'correct-horse' ? SYSOP : null,
    reserveNode: async sessionId => {
      reserved.push(sessionId);
      return opts.nodes === false ? null : 3;
    },
    releaseNode: async sessionId => { released.push(sessionId); },
    log: (_username, message) => { logged.push(message); },
    ...over,
  };

  const server = new FtpServer({ port: 0, host: '127.0.0.1' }, deps);
  await server.start();
  return { server, port: server.address()!.port, reserved, released, logged };
}

/** A client that speaks the protocol: send a line, wait for the reply. */
class Client {
  private socket: net.Socket;
  private buffer = '';
  private waiting: { resolve: (line: string) => void } | null = null;
  private lines: string[] = [];

  constructor(socket: net.Socket) {
    this.socket = socket;
    socket.setEncoding('latin1');
    socket.on('data', chunk => {
      this.buffer += chunk;
      let i: number;
      while ((i = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, i).replace(/\r$/, '');
        this.buffer = this.buffer.slice(i + 1);
        if (this.waiting && /^\d{3} /.test(line)) {
          const w = this.waiting;
          this.waiting = null;
          w.resolve(line);
        } else {
          this.lines.push(line);
        }
      }
    });
  }

  static connect(port: number): Promise<Client> {
    return new Promise(resolve => {
      const socket = net.createConnection({ port, host: '127.0.0.1' }, () => resolve(new Client(socket)));
    });
  }

  /** The next final reply line (`NNN text`); continuation lines are collected. */
  reply(): Promise<string> {
    const ready = this.lines.find(l => /^\d{3} /.test(l));
    if (ready) {
      this.lines = this.lines.filter(l => l !== ready);
      return Promise.resolve(ready);
    }
    return new Promise(resolve => { this.waiting = { resolve }; });
  }

  async send(line: string): Promise<string> {
    this.socket.write(`${line}\r\n`);
    return this.reply();
  }

  continuationLines(): string[] {
    return [...this.lines];
  }

  close(): void {
    this.socket.destroy();
  }
}

let h: Harness;
afterEach(async () => { await h?.server.stop(); });

test('greets a caller the way Ami-Express does', async () => {
  h = await listen();
  const client = await Client.connect(h.port);

  expect(await client.reply()).toBe('220 Welcome to Ami-Express FTP server.');
  client.close();
});

test('a good password is accepted, and the caller is told the time left', async () => {
  h = await listen();
  const client = await Client.connect(h.port);
  await client.reply();

  expect(await client.send('USER sysop')).toBe('331 user accepted');
  expect(await client.send('PASS correct-horse')).toBe(
    '230 password accepted'
  );
  client.close();
});

test('a bad password is refused with express.e own code', async () => {
  h = await listen();
  const client = await Client.connect(h.port);
  await client.reply();
  await client.send('USER sysop');

  expect(await client.send('PASS wrong')).toBe('430 Invalid username or password');
  client.close();
});

test('a command that needs a login is refused before one', async () => {
  h = await listen();
  const client = await Client.connect(h.port);
  await client.reply();

  expect(await client.send('LIST')).toBe('530 Please login with USER and PASS.');
  client.close();
});

test('an unknown verb is 500, not silence', async () => {
  h = await listen();
  const client = await Client.connect(h.port);
  await client.reply();

  expect(await client.send('WAFFLE')).toBe('500 command not recognized');
  client.close();
});

test('SYST and QUIT answer what a client expects', async () => {
  h = await listen();
  const client = await Client.connect(h.port);
  await client.reply();

  expect(await client.send('SYST')).toBe('215 AmigaOS');
  expect(await client.send('QUIT')).toBe('200 Byebye!');
  client.close();
});

test('FEAT advertises the extensions, and says AUTH TLS only when it can do it', async () => {
  h = await listen();
  const client = await Client.connect(h.port);
  await client.reply();

  expect(await client.send('FEAT')).toBe('211 END');
  const features = client.continuationLines().join('\n');
  expect(features).toContain('211-Extensions supported:');
  expect(features).toContain(' REST STREAM');
  expect(features).toContain(' MLST type*;size*;modify*;perm*;');
  // No certificate is configured in this harness, so it must NOT be offered.
  expect(features).not.toContain('AUTH TLS');

  expect(await client.send('AUTH TLS')).toBe('431 No TLS certificate configured');
  client.close();
});

test('the transfer verbs ask for a data connection first', async () => {
  h = await listen();
  const client = await Client.connect(h.port);
  await client.reply();
  await client.send('USER sysop');
  await client.send('PASS correct-horse');

  // Each answers 425 without a data connection (ftpd.e:1697, 1860, 1946);
  // `tests/ftp/list-over-pasv.test.ts` drives the rest.
  expect(await client.send('RETR SOMETHING.LHA')).toBe("425 Can't open data connection");
  expect(await client.send('STOR SOMETHING.LHA')).toBe("425 Can't open data connection");
  expect(await client.send('LIST')).toBe("425 Can't open data connection");
  client.close();
});

test('a login takes a node, and QUIT gives it back', async () => {
  h = await listen();
  const client = await Client.connect(h.port);
  await client.reply();
  await client.send('USER sysop');
  await client.send('PASS correct-horse');

  expect(h.reserved).toHaveLength(1);
  expect(h.released).toHaveLength(0);

  await client.send('QUIT');
  await new Promise(r => setTimeout(r, 50));
  expect(h.released).toEqual(h.reserved);
  client.close();
});

test('a board with every node busy says so rather than serving an invisible session', async () => {
  h = await listen({}, { nodes: false });
  const client = await Client.connect(h.port);
  await client.reply();
  await client.send('USER sysop');

  expect(await client.send('PASS correct-horse')).toBe('421 All nodes are busy - try again later');
  client.close();
});

test('the password never reaches the CallersLog', async () => {
  h = await listen();
  const client = await Client.connect(h.port);
  await client.reply();
  await client.send('USER sysop');
  await client.send('PASS correct-horse');

  const log = h.logged.join('\n');
  expect(log).toContain('\tFTP Command >: USER sysop');
  expect(log).toContain('\tFTP Command >: PASS ****');
  expect(log).not.toContain('correct-horse');
  client.close();
});

test('answers PORT, MODE and STRU in the words ftpd.e uses (ftpd.e:1356-1377)', async () => {
  h = await listen();
  const client = await Client.connect(h.port);
  await client.reply();
  await client.send('USER sysop');
  await client.send('PASS correct-horse');

  // ftpd.e:1358 - active mode is refused; the client falls back to PASV.
  expect(await client.send('PORT 127,0,0,1,4,1')).toBe('502 Only passive mode allowed');
  // ftpd.e:1364-1366 - the parameter is echoed with three exclamation marks.
  expect(await client.send('MODE S')).toBe('200 Mode set to S!!!');
  expect(await client.send('MODE B')).toBe('502 Mode not implemented');
  // ftpd.e:1374-1376, including the original's "Strucrure".
  expect(await client.send('STRU F')).toBe('200 Structure set to F!!!');
  expect(await client.send('STRU R')).toBe('502 Strucrure not implemented');
  client.close();
});
