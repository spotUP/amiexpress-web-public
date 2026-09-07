/**
 * `RETR`: the bytes, through the board's own gates.
 *
 * Phase 4. Three things have to be true and only one of them is the happy
 * path:
 *
 *  1. the bytes arrive, and `REST` resumes part-way through one
 *  2. a caller over his RATIO is refused BEFORE anything moves, in the gate's
 *     own words - served-then-charged is not a refusal
 *  3. a storage volume that is down is not reported as "no such file". That
 *     confusion is how a sysop deletes the catalogue row for a file that was
 *     always fine, and it is the defect the whole storage layer is written
 *     around.
 *
 * Driven over a real socket pair with a real passive listener, because the
 * ORDER of the replies is what clients are unforgiving about: 150 before the
 * data connection is used, bytes, close, then 226.
 */
import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import type { AddressInfo } from 'net';

import { FtpSession, type FtpDeps, type FtpUser } from '../../src/ftp/ftp-session';
import { FtpFilesystem } from '../../src/ftp/ftp-filesystem';

const SYSOP: FtpUser = { id: 1, username: 'sysop' };
const PAYLOAD = Buffer.from('UPROUGH DEMO PAYLOAD 0123456789', 'latin1');

let board: string;
let filePath: string;

/** A board with one conference and one file that is really on disk. */
function makeFilesystem(): FtpFilesystem {
  return new FtpFilesystem({
    conferences: () => [{ conference_id: 1, name: 'General' }],
    canAccess: () => true,
    bbsRoot: board,
  });
}

interface Rig {
  server: net.Server;
  port: number;
  /** What the session was asked to charge, if anything. */
  charged: number[];
  refusals: number;
}

/** A server whose deps are built per test, so a gate can be made to refuse. */
async function listen(overrides: Partial<FtpDeps> = {}): Promise<Rig> {
  const charged: number[] = [];
  const rig: Partial<Rig> = { charged, refusals: 0 };

  const deps: FtpDeps = {
    authenticate: async (u, p) => (u === 'sysop' && p === 'correct-horse' ? SYSOP : null),
    reserveNode: async () => 3,
    releaseNode: async () => undefined,
    log: () => undefined,
    timeRemainingMinutes: () => 42,
    filesystem: makeFilesystem(),
    passivePorts: () => ({ first: 34_201, last: 34_210 }),
    passiveAddress: () => '127.0.0.1',
    resolveFile: async () => ({ path: filePath, size: PAYLOAD.length, name: 'DEMO.LHA' }),
    mayDownload: async () => ({ allowed: true }),
    recordDownload: async (_user, size) => {
      charged.push(size);
    },
    ...overrides,
  };

  const server = net.createServer((socket) => {
    new FtpSession(socket, deps, socket.remoteAddress).start();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    server,
    port: (server.address() as AddressInfo).port,
    charged,
    refusals: rig.refusals ?? 0,
  };
}

/** Reads whole lines and keeps the remainder. */
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

/**
 * Logged in and standing INSIDE the conference.
 *
 * Files live in a conference; the root holds conferences. A `RETR` at the root
 * is `550 no such file` and rightly so - which is what this helper got wrong
 * the first time, and it looked exactly like a parser bug.
 */
async function login(port: number) {
  const control = net.createConnection({ port, host: '127.0.0.1' });
  const lines = new Lines(control);
  expect(await lines.next()).toBe('220 Welcome to Ami-Express FTP server.');
  control.write('USER sysop\r\n');
  expect(await lines.next()).toBe('331 Password required');
  control.write('PASS correct-horse\r\n');
  expect(await lines.next()).toMatch(/^230 /);
  control.write('CWD 001-General\r\n');
  expect(await lines.next()).toBe('250 Directory changed to /001-General');
  return { control, lines };
}

function portFromPasv(reply: string): number {
  const parts = reply.match(/\((\d+(?:,\d+){5})\)/)![1].split(',').map(Number);
  return parts[4] * 256 + parts[5];
}

/** PASV, then RETR, collecting whatever comes back on the data connection. */
async function retrieve(
  port: number,
  command: string,
  before?: (io: { control: net.Socket; lines: Lines }) => Promise<void> | void
): Promise<{ replies: string[]; body: Buffer; control: net.Socket }> {
  const io = await login(port);
  // Awaited: a command sent here has a REPLY, and leaving it in the buffer
  // makes the next read return it instead of the 227 this function expects.
  await before?.(io);

  io.control.write('PASV\r\n');
  const pasv = await io.lines.next();
  const replies = [pasv];

  const data = net.createConnection({ port: portFromPasv(pasv), host: '127.0.0.1' });
  const received: Buffer[] = [];
  data.on('data', (chunk) => received.push(chunk));
  // A refused transfer ENDS this connection - that is the server being prompt,
  // not an error, and an unhandled 'error' here would fail the run.
  data.on('error', () => undefined);
  const closed = new Promise<void>((resolve) => data.once('close', () => resolve()));

  io.control.write(`${command}\r\n`);
  const first = await io.lines.next();
  replies.push(first);

  if (first.startsWith('150')) {
    await closed;
    replies.push(await io.lines.next());
  } else {
    data.destroy();
  }

  return { replies, body: Buffer.concat(received), control: io.control };
}

beforeAll(() => {
  board = fs.mkdtempSync(path.join(os.tmpdir(), 'ftp-dl-'));
  const conf = path.join(board, 'Conf1');
  fs.mkdirSync(conf, { recursive: true });
  // The board's own column grammar: name padded to 12, a space, the status
  // marker, then the size RIGHT-aligned. Left-aligning the size is not a
  // cosmetic difference - `parseDirFile` does not see a file at all.
  fs.writeFileSync(
    path.join(conf, 'DIR1'),
    `DEMO.LHA     N ${String(PAYLOAD.length).padStart(7)}  01-01-26         A demo release\r\n`,
    'latin1'
  );
  filePath = path.join(conf, 'DEMO.LHA');
  fs.writeFileSync(filePath, PAYLOAD);
});

afterAll(() => {
  fs.rmSync(board, { recursive: true, force: true });
});

describe('a caller downloading a file', () => {
  it('gets the bytes, and is charged for them once', async () => {
    const rig = await listen();

    const { replies, body, control } = await retrieve(rig.port, 'RETR DEMO.LHA');

    expect(replies[1]).toMatch(/^150 .*DEMO\.LHA/);
    expect(replies[2]).toBe('226 Transfer complete');
    expect(body.equals(PAYLOAD)).toBe(true);
    expect(rig.charged).toEqual([PAYLOAD.length]);

    control.destroy();
    await new Promise<void>((resolve) => rig.server.close(() => resolve()));
  });

  it('resumes at the REST offset instead of sending the file again', async () => {
    const rig = await listen();
    const offset = 10;

    const { body, control } = await retrieve(rig.port, 'RETR DEMO.LHA', async (io) => {
      io.control.write(`REST ${offset}\r\n`);
      expect(await io.lines.next()).toBe(`350 Restarting at ${offset}. Send RETR to resume`);
    });

    expect(body.toString('latin1')).toBe(PAYLOAD.subarray(offset).toString('latin1'));
    // Charged for what actually moved, not for the whole file.
    expect(rig.charged).toEqual([PAYLOAD.length - offset]);

    control.destroy();
    await new Promise<void>((resolve) => rig.server.close(() => resolve()));
  });

  it('refuses a name that is not in the listing', async () => {
    const rig = await listen();

    const { replies, control } = await retrieve(rig.port, 'RETR NOTHERE.LHA');

    expect(replies[1]).toBe('550 NOTHERE.LHA: no such file');
    expect(rig.charged).toEqual([]);

    control.destroy();
    await new Promise<void>((resolve) => rig.server.close(() => resolve()));
  });
});

describe('the gates a download passes', () => {
  it('refuses a caller over his ratio in the gate\'s own words, moving nothing', async () => {
    const rig = await listen({
      mayDownload: async () => ({
        allowed: false,
        message: 'You have 0 bytes of download credit left today',
      }),
    });

    const { replies, body, control } = await retrieve(rig.port, 'RETR DEMO.LHA');

    expect(replies[1]).toBe('550 You have 0 bytes of download credit left today');
    expect(body.length).toBe(0);
    expect(rig.charged).toEqual([]);

    control.destroy();
    await new Promise<void>((resolve) => rig.server.close(() => resolve()));
  });

  it('says a volume is DOWN rather than that the file is missing', async () => {
    // The distinction the storage layer exists for: 451 is "try later", 550 is
    // "there is no such file", and a sysop who is told the second about the
    // first deletes a catalogue row for a file that was always fine.
    const rig = await listen({
      resolveFile: async () => {
        throw new Error('the volume did not answer');
      },
    });

    const { replies, control } = await retrieve(rig.port, 'RETR DEMO.LHA');

    expect(replies[1]).toMatch(/^451 The storage this file lives on did not answer/);
    expect(rig.charged).toEqual([]);

    control.destroy();
    await new Promise<void>((resolve) => rig.server.close(() => resolve()));
  });

  it('says so when the board lists a file whose bytes are not there', async () => {
    const rig = await listen({ resolveFile: async () => null });

    const { replies, control } = await retrieve(rig.port, 'RETR DEMO.LHA');

    expect(replies[1]).toBe('550 DEMO.LHA: the board lists it, but its bytes are not here');
    expect(rig.charged).toEqual([]);

    control.destroy();
    await new Promise<void>((resolve) => rig.server.close(() => resolve()));
  });

  it('needs a data connection first, like every other transfer', async () => {
    const rig = await listen();
    const { control, lines } = await login(rig.port);

    control.write('RETR DEMO.LHA\r\n');
    expect(await lines.next()).toBe('425 Use PASV first');

    control.destroy();
    await new Promise<void>((resolve) => rig.server.close(() => resolve()));
  });
});
