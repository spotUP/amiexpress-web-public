/**
 * BGFILECHECK on every upload path express.e routes through fileReceive.
 *
 * express.e starts the check thread in fileReceive for EVERY protocol (xpr
 * library, xymodem, hydra, internal zmodem: 17279-17283) and each finished
 * file is posted to it - xprfclose 13921 for an xpr library, zmuploadcompleted
 * 16825 for the internal receives (xymodem passes zmfclose, 17160-17230). The
 * port wired only the lrzsz receive; the zmodem.js fallback and the
 * XMODEM / YMODEM / Punter managers never started a thread, so those uploads
 * were checked only at the end by the filing loop.
 *
 * The reachability tests drive the U transfer's real entry (startZmodemUpload)
 * with the real XMODEM and YMODEM managers on the wire. The sentinel is the
 * checker being asked (testFile) for the file, from the thread, while the
 * transfer's own completion has not run. The zmodem.js and Punter managers
 * are driven below the entry (a fake zsession; the manager's own save): the
 * handler's wiring of those two is the same call, the manager's call of the
 * callback is what is proved there.
 *
 * Also the flag express.e raises before each upload (25652 U, 25614 RZ, 28130
 * URG, 17514 lost-carrier restart), and the W menu's rule (25872, 26085).
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('../src/services/post-upload.service', () => ({ runPostUpload: jest.fn(async () => {}) }));
jest.mock('../src/services/resume-stuff.service', () => ({
  startResumeStuff: (_s: any, _sess: any, _p: string, _c: any, done: (r: any) => void) => done({ resumed: 0 }),
}));
// What the thread asks of the board: the sentinel is the checker being run.
jest.mock('../src/utils/file-test.util', () => ({
  ...jest.requireActual('../src/utils/file-test.util'),
  testFile: jest.fn(async () => 0),
}));
jest.mock('../src/utils/file-diz.util', () => ({
  ...jest.requireActual('../src/utils/file-diz.util'),
  extractAndReadDiz: jest.fn(async (file: string) => [`Described ${path.basename(file)}`]),
}));
jest.mock('../src/services/upload-filing.service', () => ({
  areaForConference: jest.fn(async () => ({ id: 1 })),
  fileUploadedFile: jest.fn(async () => ({ duplicate: false, status: 'active', orphaned: false })),
}));
jest.mock('../src/server/file-socket-handlers', () => ({
  bookUploadCredit: jest.fn(async () => undefined),
  announceFiledUpload: jest.fn(async () => undefined),
  handleDizExtractionAndDescription: jest.fn(async () => undefined),
  handleUploadBatchComplete: jest.fn(async () => undefined),
}));

import { startZmodemUpload, handleUploadCommand } from '../src/handlers/commands/user-commands.handler';
import { config } from '../src/config';
import { UserFlag } from '../src/constants/express-flags';
import { clearNodeTooltypeCache } from '../src/utils/node-tooltypes.util';
import { testFile } from '../src/utils/file-test.util';
import { XmodemTransferManager } from '../src/services/xmodem-transfer.service';
import { PunterTransferManager } from '../src/services/punter-transfer.service';
import { ZmodemTransferManager } from '../src/services/zmodem-transfer.service';
import {
  raiseBackgroundFileCheck,
  userMayToggleBackgroundFileCheck,
} from '../src/services/background-file-check.service';

const checked = testFile as unknown as jest.Mock;
const SOH = 0x01, EOT = 0x04, SUB = 0x1a;
const settle = (ms = 30) => new Promise((r) => setTimeout(r, ms));

function crc16(data: Buffer): number {
  let crc = 0;
  for (const byte of data) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc & 0xffff;
}
function xmodemBlock(n: number, text: string): Buffer {
  const data = Buffer.alloc(128, SUB);
  data.write(text, 'latin1');
  const sum = data.reduce((a, b) => (a + b) & 0xff, 0);
  return Buffer.concat([Buffer.from([SOH, n, 255 - n]), data, Buffer.from([sum])]);
}
function ymodemBlock(n: number, payload: Buffer): Buffer {
  const crc = crc16(payload);
  return Buffer.concat([Buffer.from([SOH, n, 255 - n]), payload, Buffer.from([(crc >> 8) & 0xff, crc & 0xff])]);
}

describe('BGFILECHECK on every protocol express.e routes through fileReceive', () => {
  let root: string;
  let playpen: string;
  let previousDataDir: string;
  const callers: any[] = [];

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'bgproto-'));
    playpen = path.join(root, 'Node1', 'Playpen');
    previousDataDir = config.get('dataDir');
    config.set('dataDir', root);
    clearNodeTooltypeCache();
    checked.mockClear();
  });
  afterEach(() => {
    // A transfer left waiting (YMODEM waits for the batch-end block) keeps its
    // timeout armed past the suite; end it so the timer cannot fire after teardown.
    for (const c of callers) c.transferManager?.cancel?.();
    callers.length = 0;
    config.set('dataDir', previousDataDir);
    clearNodeTooltypeCache();
    fs.rmSync(root, { recursive: true, force: true });
  });

  function aCaller(protocol: string, withName = 'HELLO.TXT') {
    const session: any = {
      bbsPath: root, nodeId: 1, currentConf: 1, connectionType: 'telnet',
      bgFileCheck: true,
      user: { id: 'u1', username: 'sysop', protocol, userFlags: UserFlag.BGFILECHECK, uploads: 0, bytesUpload: 0 },
      transferRawSend: () => {}, transferRawSendUnescaped: () => {},
      tempData: {
        uploadBatch: [{ filename: withName, description: 'a test' }],
        fileArea: { id: 1, conferenceId: 1, name: 'Uploads', path: 'Conf1/Files' },
      },
    };
    callers.push(session);
    const socket: any = { id: 'bg-1', emit: () => true, on: () => {}, once: () => {} };
    return { session, socket };
  }

  it('XMODEM: the thread checks the file the moment it is whole, before the transfer completes', async () => {
    const { session, socket } = aCaller('xmodem');
    startZmodemUpload(socket, session);
    await settle();

    session.transferRawSink(xmodemBlock(1, 'hello from xmodem'));
    session.transferRawSink(Buffer.from([EOT]));
    await settle(200);

    expect(checked).toHaveBeenCalledTimes(1);
    expect(checked.mock.calls[0][0]).toBe(path.join(playpen, 'HELLO.TXT'));
  });

  it('YMODEM: the thread checks the received file', async () => {
    const { session, socket } = aCaller('ymodem');
    startZmodemUpload(socket, session);
    await settle();

    const header = Buffer.alloc(128);
    header.write('HELLO.LHA\x0017 0 0 0 1 17', 'latin1');
    session.transferRawSink(ymodemBlock(0, header));
    await settle();
    const data = Buffer.alloc(128, SUB);
    data.write('hello from ymodem', 'latin1');
    session.transferRawSink(ymodemBlock(1, data));
    session.transferRawSink(Buffer.from([EOT]));
    session.transferRawSink(Buffer.from([EOT]));
    await settle(200);

    expect(checked).toHaveBeenCalledTimes(1);
    expect(checked.mock.calls[0][0]).toBe(path.join(playpen, 'HELLO.LHA'));
  });

  it('an upload with the flag off starts no thread (the loop checks it, as before)', async () => {
    const { session, socket } = aCaller('xmodem');
    session.user.userFlags = 0;
    startZmodemUpload(socket, session);
    await settle();
    session.transferRawSink(xmodemBlock(1, 'x'));
    session.transferRawSink(Buffer.from([EOT]));
    await settle(100);

    expect(session.backgroundFileCheck).toBeUndefined();
    expect(checked).not.toHaveBeenCalled();
  });

  it('the XMODEM manager reports the file it saved; so does Punter', async () => {
    const seen: string[] = [];
    const xm = new XmodemTransferManager({ mode: 'checksum', onFileReceived: (p) => seen.push(p) });
    xm.setSendCallback(() => {});
    await xm.startReceive(path.join(root, 'X.BIN'));
    xm.handleInput(xmodemBlock(1, 'x'));
    xm.handleInput(Buffer.from([EOT]));
    await settle();
    expect(seen).toEqual([path.join(root, 'X.BIN')]);

    const punter = new PunterTransferManager({ onFileReceived: (p) => seen.push(p) });
    punter.setSendCallback(() => {});
    await punter.startReceive(path.join(root, 'P.PRG'));
    (punter as any).receivedData = [Buffer.from('prg')];
    (punter as any).saveReceivedFile();
    expect(seen).toEqual([path.join(root, 'X.BIN'), path.join(root, 'P.PRG')]);
    expect(fs.readFileSync(path.join(root, 'P.PRG'), 'latin1')).toBe('prg');
  });

  it('the zmodem.js manager reports each file once it is flushed to disk', async () => {
    const seen: Array<{ path: string; bytes: number }> = [];
    fs.mkdirSync(playpen, { recursive: true });
    const manager = new ZmodemTransferManager({
      session: { transferRawActive: true } as any,
      transport: { type: 'telnet', send: () => {} } as any,
      direction: 'upload',
      paths: [playpen],
      onFileReceived: (p) => seen.push({ path: p, bytes: fs.statSync(p).size }),
    });
    const handlers: Record<string, (x: any) => void> = {};
    const zsession = { on: (evt: string, fn: (x: any) => void) => { handlers[evt] = fn; }, start: () => {} };
    (manager as any).startReceive(zsession);
    let onInput: (o: Uint8Array) => void = () => {};
    handlers.offer({
      get_details: () => ({ name: 'ZM.LHA', size: 3 }),
      on: (_e: string, fn: (o: Uint8Array) => void) => { onInput = fn; },
      accept: async () => { onInput(new Uint8Array([1, 2, 3])); },
    });
    await settle(100);

    expect(seen).toEqual([{ path: path.join(playpen, 'ZM.LHA'), bytes: 3 }]);
  });

  describe('the flag express.e raises before an upload', () => {
    it('is the node BGFILECHECK tooltype', () => {
      fs.writeFileSync(path.join(root, 'Node1.info'), 'BGFILECHECK\n');
      const on: any = { nodeId: 1 };
      raiseBackgroundFileCheck(on);
      expect(on.bgFileCheck).toBe(true);

      fs.writeFileSync(path.join(root, 'Node2.info'), 'FORCE_BGFILECHECK\n');
      const off: any = { nodeId: 2, bgFileCheck: true };
      raiseBackgroundFileCheck(off);
      expect(off.bgFileCheck).toBe(false);
    });
  });

  describe('the U command', () => {
    it('raises the flag from the node tooltype before the upload starts (express.e:25652)', () => {
      fs.writeFileSync(path.join(root, 'Node1.info'), 'BGFILECHECK\n');
      const socket: any = { id: 'u-1', emit: () => true, on: () => {}, once: () => {} };
      const session: any = {
        nodeId: 1, currentConf: 1, bbsPath: root, connectionType: 'telnet',
        user: { id: 'u1', username: 'sysop', securityFlags: 'T'.repeat(100), secLevel: 255 },
      };
      // The flag is set before the first await; what the upload does next is not this test's.
      const started = handleUploadCommand(socket, session);
      started.catch(() => undefined);
      expect(session.bgFileCheck).toBe(true);
    });
  });

  describe('the user toggle follows the node tooltype (express.e:25872, 26085)', () => {
    it('is allowed only with BGFILECHECK and without FORCE_BGFILECHECK', () => {
      fs.writeFileSync(path.join(root, 'Node1.info'), 'BGFILECHECK\n');
      fs.writeFileSync(path.join(root, 'Node2.info'), 'BGFILECHECK\nFORCE_BGFILECHECK\n');
      fs.writeFileSync(path.join(root, 'Node3.info'), 'SOMETHING\n');
      expect(userMayToggleBackgroundFileCheck(1)).toBe(true);
      expect(userMayToggleBackgroundFileCheck(2)).toBe(false);
      expect(userMayToggleBackgroundFileCheck(3)).toBe(false);
    });
  });
});
