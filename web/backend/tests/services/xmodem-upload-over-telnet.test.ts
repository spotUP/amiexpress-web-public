/**
 * An XMODEM upload over telnet lands, and leaves the line fit for the next.
 *
 * Two defects found tracing the sysop's "file transfers have issues via
 * telnet" (2026-09-27):
 *
 *   - XMODEM carries no filename, and the upload was handed the playpen
 *     DIRECTORY as its file: every upload failed at EOT with EISDIR. It now
 *     receives into the name the caller typed at `FileName 1:`.
 *   - Finishing any XMODEM/YMODEM/Punter transfer cleared the transport's own
 *     sender, so the next transfer in the call wrote into a no-op.
 *
 * Driven through the real U entry (startZmodemUpload) and the real manager,
 * with one real checksum-mode XMODEM block on the wire.
 */
process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/services/post-upload.service', () => ({ runPostUpload: jest.fn(async () => {}) }));
jest.mock('../../src/services/resume-stuff.service', () => ({
  startResumeStuff: (_s: any, _sess: any, _p: string, _c: any, done: (r: any) => void) => done({ resumed: 0 }),
}));

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { startZmodemUpload } from '../../src/handlers/commands/user-commands.handler';

const SOH = 0x01, EOT = 0x04, SUB = 0x1a;

function block(n: number, text: string): Buffer {
  const data = Buffer.alloc(128, SUB);
  data.write(text, 'latin1');
  const sum = data.reduce((a, b) => (a + b) & 0xff, 0);
  return Buffer.concat([Buffer.from([SOH, n, 255 - n]), data, Buffer.from([sum])]);
}

const settle = () => new Promise((r) => setTimeout(r, 20));

function aTelnetCaller(root: string) {
  const sent: Buffer[] = [];
  const send = (buf: Buffer) => { sent.push(Buffer.from(buf)); };
  const session: any = {
    bbsPath: root, nodeId: 1, currentConf: 1, connectionType: 'telnet',
    user: { id: 'u1', username: 'sysop', protocol: 'xmodem' },
    transferRawSend: send, transferRawSendUnescaped: () => {},
    tempData: { uploadBatch: [{ filename: 'HELLO.TXT', description: 'a test' }] },
  };
  const socket: any = { id: 'xm-1', emit: () => true, on: () => {} };
  return { session, socket, send, sent };
}

describe('an XMODEM upload over telnet', () => {
  let root: string;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'xmodem-up-')); });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('lands in the playpen under the name typed at FileName 1:', async () => {
    const { session, socket } = aTelnetCaller(root);
    startZmodemUpload(socket, session);
    await settle();
    expect(typeof session.transferRawSink).toBe('function');

    session.transferRawSink(block(1, 'hello from xmodem'));
    session.transferRawSink(Buffer.from([EOT]));
    await settle();

    const landed = path.join(root, 'Node1', 'Playpen', 'HELLO.TXT');
    expect(fs.existsSync(landed)).toBe(true);
    expect(fs.readFileSync(landed, 'latin1')).toBe('hello from xmodem');
  });

  it('leaves the transport\'s sender in place for the next transfer', async () => {
    const { session, socket, send } = aTelnetCaller(root);
    startZmodemUpload(socket, session);
    await settle();

    session.transferRawSink(block(1, 'x'));
    session.transferRawSink(Buffer.from([EOT]));
    await settle();

    expect(session.transferRawActive).toBe(false);
    expect(session.transferRawSend).toBe(send);
  });

  it('refuses to start without a name, rather than failing at the end', async () => {
    const { session, socket } = aTelnetCaller(root);
    session.tempData.uploadBatch = [];
    startZmodemUpload(socket, session);
    await settle();

    expect(session.transferRawActive).toBeFalsy();
  });
});
