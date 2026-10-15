/**
 * `STOR`: the caller's bytes, into the board's own filing.
 *
 * Phase 5. What matters here is not that a file arrives - that is a socket
 * copying bytes - but WHERE it goes and WHEN a caller is told no:
 *
 *  1. the bytes land in the node's PLAYPEN, never straight into an area. The
 *     duplicate check, the archive test and the quarantine all decide where a
 *     file belongs, and a file already sitting in the area cannot be sent to
 *     HOLD without a second move that can fail on its own.
 *  2. a refusal happens BEFORE the transfer. A caller told no after ten
 *     megabytes has been told no expensively - so NO_FTP_UPLOADS, a bad
 *     filename and a conference with no upload area are all answered at the
 *     command, not at the end.
 *  3. what the board decided reaches the caller. "Uploaded" and "uploaded and
 *     waiting for the sysop" are different outcomes and he must not have to
 *     guess which one happened.
 */
import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import type { AddressInfo } from 'net';
import type { Duplex } from 'stream';

import { FtpSession, type FtpDeps, type FtpUser } from '../../src/ftp/ftp-session';
import { FtpFilesystem } from '../../src/ftp/ftp-filesystem';

const SYSOP: FtpUser = { id: 1, username: 'sysop' };
const PAYLOAD = Buffer.from('THE CALLER\'S FILE, BYTE FOR BYTE', 'latin1');

let board: string;

interface Rig {
  server: net.Server;
  port: number;
  /** Every upload the session handed to the board, in order. */
  filed: Array<{ filename: string; bytes: number; conferenceId: number }>;
}

async function listen(over: Partial<FtpDeps> = {}): Promise<Rig> {
  const filed: Rig['filed'] = [];

  const deps: FtpDeps = {
    authenticate: async (u, p) => (u === 'sysop' && p === 'correct-horse' ? SYSOP : null),
    reserveNode: async () => 3,
    releaseNode: async () => undefined,
    log: () => undefined,
    filesystem: new FtpFilesystem({
      conferences: () => [{ conference_id: 1, name: 'General' }],
      canAccess: () => true,
      bbsRoot: board,
    }),
    passivePorts: () => ({ first: 34_301, last: 34_310 }),
    passiveAddress: () => '127.0.0.1',
    refuseUpload: async () => undefined,
    uppercaseUploads: () => false,
    acceptUpload: async (request, data: Duplex) => {
      // The real wiring writes into the playpen and calls the filing service;
      // here the bytes are counted so the transfer itself is what is proved.
      const bytes = await new Promise<number>((resolve, reject) => {
        let seen = 0;
        data.on('data', (chunk: Buffer | string) => {
          seen += typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length;
        });
        data.on('error', reject);
        data.on('close', () => resolve(seen));
      });
      filed.push({ filename: request.filename, bytes, conferenceId: request.conferenceId });
      request.onReceived?.();
      return { bytes, accepted: true, notices: [] };
    },
    ...over,
  };

  const server = net.createServer((socket) => {
    new FtpSession(socket, deps, socket.remoteAddress).start();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, port: (server.address() as AddressInfo).port, filed };
}

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

/** Logged in and standing in the conference - uploads go into one, not the root. */
async function login(port: number, cwd = '001-General') {
  const control = net.createConnection({ port, host: '127.0.0.1' });
  const lines = new Lines(control);
  expect(await lines.next()).toBe('220 Welcome to Ami-Express FTP server.');
  control.write('USER sysop\r\n');
  expect(await lines.next()).toBe('331 user accepted');
  control.write('PASS correct-horse\r\n');
  expect(await lines.next()).toMatch(/^230 /);
  if (cwd) {
    control.write(`CWD ${cwd}\r\n`);
    expect(await lines.next()).toMatch(/^250 /);
  }
  return { control, lines };
}

function portFromPasv(reply: string): number {
  const parts = reply.match(/\((\d+(?:,\d+){5})\)/)![1].split(',').map(Number);
  return parts[4] * 256 + parts[5];
}

/** PASV, STOR, send the payload, collect the replies. */
async function upload(port: number, command: string, cwd?: string) {
  const io = await login(port, cwd);
  io.control.write('PASV\r\n');
  const pasv = await io.lines.next();

  const data = net.createConnection({ port: portFromPasv(pasv), host: '127.0.0.1' });
  data.on('error', () => undefined); // a refusal ends this connection; not an error
  await new Promise<void>((resolve) => data.once('connect', () => resolve()));

  io.control.write(`${command}\r\n`);
  const opening = await io.lines.next();

  const replies = [opening];
  if (opening.startsWith('150')) {
    await new Promise<void>((resolve) => data.end(PAYLOAD, () => resolve()));
    let line = await io.lines.next();
    while (line.startsWith('226-')) {
      replies.push(line);
      line = await io.lines.next();
    }
    replies.push(line);
  } else {
    data.destroy();
  }

  return { replies, control: io.control };
}

beforeAll(() => {
  board = fs.mkdtempSync(path.join(os.tmpdir(), 'ftp-up-'));
  fs.mkdirSync(path.join(board, 'Conf1'), { recursive: true });
});

afterAll(() => {
  fs.rmSync(board, { recursive: true, force: true });
});

describe('a caller uploading a file', () => {
  it('sends the bytes, and the board is handed them for filing', async () => {
    const rig = await listen();

    const { replies, control } = await upload(rig.port, 'STOR DEMO.LHA');

    // ftpd.e:1580 and 1690 - "150 Opening Binary connection", the file-check
    // conversation, then "226 <name> ... Transfer Complete".
    expect(replies[0]).toBe('150 Opening Binary connection');
    expect(replies).toContain('226-DEMO.LHA ... Upload complete, file check in progress.. ');
    expect(replies[replies.length - 1]).toBe('226 DEMO.LHA ... Transfer Complete');
    expect(rig.filed).toEqual([{ filename: 'DEMO.LHA', bytes: PAYLOAD.length, conferenceId: 1 }]);

    control.destroy();
    await new Promise<void>((resolve) => rig.server.close(() => resolve()));
  });

  it('tells the caller what the board decided, before the 226', async () => {
    // A duplicate is filed, not rejected - it goes to the sysop's directory.
    // The caller has to be told that, or "226" reads as "it is in the area".
    const rig = await listen({
      acceptUpload: async (_request, data: Duplex) => {
        // `resume()` matters: a stream with no consumer stays PAUSED, the
        // caller's bytes sit in the buffer and `close` never comes. The real
        // wiring pipes into a file, which resumes it implicitly.
        data.resume();
        await new Promise<void>((resolve) => data.on('close', () => resolve()));
        return {
          bytes: PAYLOAD.length,
          accepted: true,
          notices: ['File already exists, moving to Sysop\'s private directory'],
        };
      },
    });

    const { replies, control } = await upload(rig.port, 'STOR DEMO.LHA');

    expect(replies).toContain("226-File already exists, moving to Sysop's private directory");
    expect(replies[replies.length - 1]).toBe('226 DEMO.LHA ... Transfer Complete');

    control.destroy();
    await new Promise<void>((resolve) => rig.server.close(() => resolve()));
  });

  it('tells the caller to wait for every ten seconds the check runs (ftpd.e:1676-1686)', async () => {
    const rig = await listen({
      acceptUpload: async (request, data: Duplex) => {
        data.resume();
        await new Promise<void>((resolve) => data.on('close', () => resolve()));
        request.onReceived?.();
        request.onChecking?.();
        request.onChecking?.();
        return { bytes: PAYLOAD.length, accepted: true, notices: [] };
      },
    });

    const { replies, control } = await upload(rig.port, 'STOR DEMO.LHA');

    expect(replies.slice(1)).toEqual([
      '226-DEMO.LHA ... Upload complete, file check in progress.. ',
      '226-Please wait, Checking..',
      '226-Please wait, Checking..',
      '226 DEMO.LHA ... Transfer Complete',
    ]);

    control.destroy();
    await new Promise<void>((resolve) => rig.server.close(() => resolve()));
  });

  it('strips a path from the name - a caller names a FILE, not a place', async () => {
    const rig = await listen();

    const { control } = await upload(rig.port, 'STOR /etc/passwd');

    expect(rig.filed.map((f) => f.filename)).toEqual(['passwd']);

    control.destroy();
    await new Promise<void>((resolve) => rig.server.close(() => resolve()));
  });
});

describe('what is refused, and when', () => {
  it('refuses BEFORE the transfer when the conference forbids uploads', async () => {
    const rig = await listen({
      refuseUpload: async () => ({
        code: 550,
        text: 'Uploads are not accepted in this conference',
        logAs: 'Uploads blocked for',
      }),
    });

    const { replies, control } = await upload(rig.port, 'STOR DEMO.LHA');

    // 550 instead of 150: nothing was transferred, which is the point.
    expect(replies[0]).toBe('550 Uploads are not accepted in this conference');
    expect(rig.filed).toEqual([]);

    control.destroy();
    await new Promise<void>((resolve) => rig.server.close(() => resolve()));
  });

  it('refuses an upload at the ROOT, where there is no conference to file it in', async () => {
    const rig = await listen();

    const { replies, control } = await upload(rig.port, 'STOR DEMO.LHA', '');

    // ftpd.e:1513 - express's own words for an upload at the root.
    expect(replies[0]).toBe('550 Cant upload here');
    expect(rig.filed).toEqual([]);

    control.destroy();
    await new Promise<void>((resolve) => rig.server.close(() => resolve()));
  });

  it('uses express\'s own codes: 553 for a name, 550 for a policy', async () => {
    // A client acts on the difference. 553 says "pick another name"; 550 says
    // "this board will not take it" (ftpd.e:1463-1553).
    const rig = await listen({
      refuseUpload: async (_user, _conf, filename) => ({
        code: 553,
        text: `${filename}: Duplicate file skipped`,
        logAs: 'Skipped',
      }),
    });

    const { replies, control } = await upload(rig.port, 'STOR DEMO.LHA');

    expect(replies[0]).toBe('553 DEMO.LHA: Duplicate file skipped');
    expect(rig.filed).toEqual([]);

    control.destroy();
    await new Promise<void>((resolve) => rig.server.close(() => resolve()));
  });

  it('answers 426 when the board could not file the upload at all', async () => {
    // ftpd.e:1690. A file that reached the playpen and nowhere else is not a
    // completed transfer, whatever the socket managed.
    const rig = await listen({
      acceptUpload: async (_request, data) => {
        data.resume();
        await new Promise<void>((resolve) => data.on('close', () => resolve()));
        return {
          bytes: PAYLOAD.length,
          accepted: false,
          notices: ['DEMO.LHA could not be filed anywhere and needs a sysop'],
        };
      },
    });

    const { replies, control } = await upload(rig.port, 'STOR DEMO.LHA');

    expect(replies[replies.length - 1]).toBe('426 DEMO.LHA ... Transfer aborted');

    control.destroy();
    await new Promise<void>((resolve) => rig.server.close(() => resolve()));
  });

  it('uppercases the name when FILENAMECAPS is set, before anything reads it', async () => {
    // ftpd.e:1443, and the ORDER matters: the dupe check and the DIR entry
    // have to agree about what the file is called.
    const rig = await listen({ uppercaseUploads: () => true });

    const { control } = await upload(rig.port, 'STOR quiet.lha');

    expect(rig.filed.map((f) => f.filename)).toEqual(['QUIET.LHA']);

    control.destroy();
    await new Promise<void>((resolve) => rig.server.close(() => resolve()));
  });

  it('needs a data connection first', async () => {
    const rig = await listen();
    const { control, lines } = await login(rig.port);

    control.write('STOR DEMO.LHA\r\n');
    expect(await lines.next()).toBe("425 Can't open data connection");

    control.destroy();
    await new Promise<void>((resolve) => rig.server.close(() => resolve()));
  });
});
