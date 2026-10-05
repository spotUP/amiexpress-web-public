/**
 * Every ZMODEM receive files what it received, and ends through endUpload.
 *
 * RZ and U are one procedure in express.e: internalCommandRZ (25608-25619)
 * and internalCommandU both call uploadaFile, which files each received file
 * (DIR entry, CallersLog, credit - 19400-19500) and returns to its caller.
 *
 * The U command's zmodem.js receive - the one used when lrzsz is not on the
 * host - printed the transfer stats and went to the menu: nothing was filed,
 * the file stayed in the playpen and logoff parked it as a partial. The RZ
 * command kept its own copy of the filing and ended without endUpload, so a
 * procedure waiting on its upload was never told.
 *
 * Driven through the U transfer (startZmodemUpload) and the RZ command
 * (handleZmodemUploadCommand), with the receive's completion delivered by the
 * test.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('../../src/index', () => {
  const states = require('../../src/constants/bbs-states');
  return { BBSState: states.BBSState, LoggedOnSubState: states.LoggedOnSubState, LOCALHOST_IPS: [] };
});
const createdEntries: any[] = [];
const mockDb = {
  query: jest.fn(async () => ({ rows: [] })),
  createFileEntry: jest.fn(async (entry: any) => { createdEntries.push(entry); return createdEntries.length; }),
  recordLocation: jest.fn(),
  run: jest.fn(async () => undefined),
  getConfigRepository: () => ({ getNodeConfig: () => ({ sentby_files: false }) }),
  getConferences: jest.fn(async () => []),
  updateConference: jest.fn(async () => undefined),
  getConferenceById: jest.fn(async () => ({ id: 1, name: 'Conf1' })),
  getWebhooksByTrigger: jest.fn(async () => []),
  getFileAreas: jest.fn(async () => [{
    id: 1, conferenceId: 1, dirNumber: 1, name: 'Conf1 - Dir 1', dlPath: 'BBS:Conf1/Files/', ulPath: 'BBS:Conf1/Files/',
  }]),
};
(globalThis as any).__zmNoLrzszDb = mockDb;
jest.mock('../../src/database', () => ({
  db: new Proxy({} as any, { get: (_t, prop) => (globalThis as any).__zmNoLrzszDb[prop] }),
}));
jest.mock('../../src/server/database-helpers', () => ({ callersLog: jest.fn(async () => undefined) }));
// The CallersLog's upload lines (express.e:18081 "Uploading <name> <n> bytes").
const loggedUploads: string[] = [];
(globalThis as any).__zmNoLrzszLogged = loggedUploads;
jest.mock('../../src/utils/download-logging.util', () => ({
  writeUDSessionHeader: jest.fn(async () => undefined),
  writeToCallersLog: jest.fn(async () => undefined),
  writeToUDLog: jest.fn(async () => undefined),
  formatFtpUploadLines: jest.fn(() => []),
  logUpload: jest.fn(async (name: string) => { (globalThis as any).__zmNoLrzszLogged.push(name); }),
}));
jest.mock('../../src/utils/clean-playpen.util', () => ({ cleanPlayPen: jest.fn(async () => undefined) }));
jest.mock('../../src/services/resume-stuff.service', () => ({
  startResumeStuff: (_s: unknown, _sess: unknown, _p: unknown, _c: unknown, done: (r: unknown) => void) => done({ resumed: 0 }),
}));

// The receives: which one is installed is the test's choice, and the test
// delivers what each received.
let lrzszInstalled = false;
const receivers: any[] = [];
jest.mock('../../src/services/lrzsz-transfer.service', () => ({
  isLrzszAvailable: () => lrzszInstalled,
  LrzszTransferManager: class {
    opts: any;
    constructor(opts: any) { this.opts = opts; receivers.push(this); }
    start() { /* the test delivers the receive */ }
    handleInput() { /* nothing on the wire */ }
  },
}));
jest.mock('../../src/services/zmodem-transfer.service', () => ({
  ZmodemTransferManager: class {
    opts: any;
    constructor(opts: any) { this.opts = opts; receivers.push(this); }
    start() { /* the test delivers the receive */ }
    handleInput() { /* nothing on the wire */ }
  },
}));

import { config } from '../../src/config';
import { startZmodemUpload } from '../../src/handlers/commands/user-commands.handler';
import {
  handleZmodemUploadCommand, setTransferMiscCommandsDependencies,
} from '../../src/handlers/commands/transfer-misc-commands.handler';
import { awaitUploadEnd } from '../../src/services/upload-end.service';
import { LoggedOnSubState } from '../../src/constants/bbs-states';

const settle = (ms = 50) => new Promise((r) => setTimeout(r, ms));

let board = '';
let restoreConfig: () => void = () => {};
beforeEach(() => {
  board = fs.mkdtempSync(path.join(os.tmpdir(), 'zmodem-no-lrzsz-'));
  fs.mkdirSync(path.join(board, 'Conf1', 'Files'), { recursive: true });
  const original = config.get.bind(config);
  const spy = jest.spyOn(config, 'get').mockImplementation((key: string) => (key === 'dataDir' ? board : original(key as never)));
  restoreConfig = () => spy.mockRestore();
  setTransferMiscCommandsDependencies({ setEnvStat: jest.fn() } as any);
  receivers.length = 0;
  createdEntries.length = 0;
  loggedUploads.length = 0;
});
afterEach(() => {
  restoreConfig();
  fs.rmSync(board, { recursive: true, force: true });
});

function aTelnetCaller() {
  const out: string[] = [];
  const socket: any = {
    id: `zm-${Math.random().toString(36).slice(2)}`,
    emit: (event: string, payload: any) => { if (event === 'ansi-output') out.push(String(payload)); return true; },
    on: () => undefined,
    once: () => undefined,
  };
  const session: any = {
    nodeId: 1, currentConf: 1, bbsPath: board, connectionType: 'telnet',
    transferRawSend: jest.fn(), transferRawSendUnescaped: jest.fn(),
    user: { id: 'u1', username: 'spot', name: 'spot', protocol: 'zmodem', securityFlags: 'T'.repeat(100), secLibrary: 0 },
    // Described before the transfer, so the filing needs no prompt.
    tempData: { uploadBatch: [{ filename: 'HELLO.TXT', description: 'a test' }] },
  };
  return { socket, session, said: () => out.join('') };
}

/** A file the receive put in the caller's playpen. */
function received(): string {
  const playpen = path.join(board, 'Node1', 'Playpen');
  fs.mkdirSync(playpen, { recursive: true });
  const fp = path.join(playpen, 'HELLO.TXT');
  fs.writeFileSync(fp, 'hello');
  return fp;
}

const dirEntries = () => {
  const dir = path.join(board, 'Conf1', 'DIR1');
  return fs.existsSync(dir) ? fs.readFileSync(dir, 'latin1') : '';
};

describe('a ZMODEM upload', () => {
  it('received by zmodem.js (no lrzsz on the host) through U is filed', async () => {
    lrzszInstalled = false;
    const c = aTelnetCaller();
    startZmodemUpload(c.socket, c.session);
    await settle();
    expect(receivers).toHaveLength(1);

    await receivers[0].opts.onComplete(true, { received: [received()], skipped: [] });
    await settle(300);

    expect(createdEntries.map((e) => e.filename)).toEqual(['HELLO.TXT']);
    expect(dirEntries()).toContain('HELLO.TXT');
    expect(loggedUploads).toEqual(['HELLO.TXT']);
  });

  it('through RZ is filed the same way, and ends through endUpload', async () => {
    lrzszInstalled = true;
    const c = aTelnetCaller();
    c.session.subState = LoggedOnSubState.READ_COMMAND;
    const ended = awaitUploadEnd(c.session);
    await handleZmodemUploadCommand(c.socket, c.session);
    await settle();
    expect(receivers).toHaveLength(1);

    await receivers[0].opts.onComplete(true, { received: [received()], skipped: [] });
    await settle(300);

    expect(createdEntries.map((e) => e.filename)).toEqual(['HELLO.TXT']);
    expect(dirEntries()).toContain('HELLO.TXT');
    expect(loggedUploads).toEqual(['HELLO.TXT']);
    await expect(Promise.race([ended, settle(200).then(() => 'still waiting')])).resolves.toBe('success');
    expect(c.session.subState).toBe(LoggedOnSubState.READ_COMMAND);
  });

  it('through RZ that the caller aborts ends through endUpload as a failure', async () => {
    lrzszInstalled = true;
    const c = aTelnetCaller();
    c.session.subState = LoggedOnSubState.READ_COMMAND;
    const ended = awaitUploadEnd(c.session);
    await handleZmodemUploadCommand(c.socket, c.session);
    await settle();

    await receivers[0].opts.onComplete(false, {});
    await expect(Promise.race([ended, settle(200).then(() => 'still waiting')])).resolves.toBe('failure');
    expect(createdEntries).toHaveLength(0);
  });
});
