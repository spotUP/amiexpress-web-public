/**
 * Regression test for E-15: post-upload completion banner / stats / time bonus.
 *
 * express.e:19053 — aePuts('\b\n\b\nFile Uploading Complete...\b\n')
 * express.e:19072 — StringF(' \d file(s), \sk bytes, \d minute(s). \d second(s), \d cps, \d% efficiency.', ...)
 * express.e:19127 — StringF('Time increased by \d mins.\b\n\b\n', Div(peff,60))
 *
 * The three emits MUST land in that order, in the runPostUpload()
 * pipeline (services/post-upload.service.ts) — the shared post-receive
 * code that web (handleUploadBatchComplete), telnet, and SSH all call.
 *
 * These catch regressions where someone removes the banner, drops the
 * stats line, or skips the time-bonus credit (which silently denies users
 * the time award). The first block drives the real `runPostUpload` with its
 * loggers stubbed. The second drives `handleUploadBatchComplete` and a whole
 * two-file RZ batch - `handleZmodemUploadCommand` with a fake lrzsz manager
 * whose onComplete reports two FILE_ID.DIZ archives in the playpen - on a
 * temp board, with the upload-into-pool mock set for the catalog. Both files
 * must be filed, and the banner and stats must appear exactly once: a path
 * that skipped the shared pipeline, or re-implemented it inline, shows up as
 * zero or two.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import AdmZip = require('adm-zip');

/* eslint-disable @typescript-eslint/no-explicit-any */

jest.mock('../src/index', () => {
  const states = require('../src/constants/bbs-states');
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
(globalThis as any).__bannerMockDb = mockDb;
jest.mock('../src/database', () => ({
  db: new Proxy({} as any, { get: (_t, prop) => (globalThis as any).__bannerMockDb[prop] }),
}));
const callersLog = jest.fn(async (..._args: unknown[]) => undefined);
jest.mock('../src/server/database-helpers', () => ({ callersLog: (...a: unknown[]) => callersLog(...a) }));
jest.mock('../src/utils/download-logging.util', () => ({
  writeUDSessionHeader: jest.fn(async () => undefined),
  writeToCallersLog: jest.fn(async () => undefined),
  writeToUDLog: jest.fn(async () => undefined),
  logUpload: jest.fn(async () => undefined),
}));
const doUploadNotify = jest.fn(async () => undefined);
jest.mock('../src/utils/upload-notify.util', () => ({
  ...jest.requireActual('../src/utils/upload-notify.util'),
  doUploadNotify: () => doUploadNotify(),
}));
jest.mock('../src/utils/clean-playpen.util', () => ({ cleanPlayPen: jest.fn(async () => undefined) }));
const handleGoodbyeCommand = jest.fn();
jest.mock('../src/handlers/commands/system-commands.handler', () => ({
  handleGoodbyeCommand: (...a: unknown[]) => handleGoodbyeCommand(...a),
}));
jest.mock('../src/services/resume-stuff.service', () => ({
  startResumeStuff: (_s: unknown, _sess: unknown, _p: unknown, _c: unknown, done: (r: unknown) => void) => done({ resumed: 0 }),
}));
const lrzszManagers: any[] = [];
jest.mock('../src/services/lrzsz-transfer.service', () => ({
  isLrzszAvailable: () => true,
  LrzszTransferManager: class {
    opts: any;
    constructor(opts: any) { this.opts = opts; lrzszManagers.push(this); }
    start() { /* no rz */ }
    handleInput() { /* no rz */ }
  },
}));

import { runPostUpload } from '../src/services/post-upload.service';
import { handleUploadBatchComplete } from '../src/server/file-socket-handlers';
import {
  handleZmodemUploadCommand,
  setTransferMiscCommandsDependencies,
} from '../src/handlers/commands/transfer-misc-commands.handler';
import { BBSPaths } from '../src/utils/bbs-paths.util';
import { LoggedOnSubState } from '../src/constants/bbs-states';
import { config } from '../src/config';

function aCaller(over: Record<string, unknown> = {}) {
  const lines: string[] = [];
  const socket: any = {
    id: `banner-${Math.random().toString(36).slice(2)}`,
    emit: (event: string, payload: unknown) => { if (event === 'ansi-output') lines.push(String(payload)); return true; },
    on: () => undefined,
    once: () => undefined,
  };
  const session: any = {
    nodeId: 1,
    currentConf: 1,
    user: { id: 'u1', username: 'spot', name: 'spot', location: 'Uprough', securityFlags: 'T'.repeat(100), secLibrary: 0 },
    ...over,
  };
  return { socket, session, said: () => lines.join('') };
}
const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

beforeEach(() => {
  jest.clearAllMocks();
  createdEntries.length = 0;
  lrzszManagers.length = 0;
});
afterEach(() => jest.restoreAllMocks());

describe('Post-upload banner + stats + time bonus (E-15, express.e:19053/19072/19127)', () => {
  const NOW = 1_800_000_000_000;
  function finished(over: Record<string, unknown> = {}) {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    // 90 seconds, 10240 bytes: 113 cps; peff = 90*3/2 + 60 = 195 s = 3 mins.
    return { uploadStartTime: NOW - 90_000, uploadedFiles: 2, uploadedBytes: 10240, efficiencyPct: 77, ...over };
  }
  const STATS = ' 2 file(s), 10k bytes, 1 minute(s). 30 second(s), 113 cps, 77% efficiency.';

  test('emits banner, stats line and time bonus, in that order', async () => {
    const c = aCaller();
    await runPostUpload(c.socket, c.session, finished());
    const out = c.said();

    const complete = out.indexOf('\r\n\r\nFile Uploading Complete...\r\n');
    const stats = out.indexOf(`${STATS}\r\n`);
    const bonus = out.indexOf('Time increased by 3 mins.\r\n\r\n');
    expect(complete).toBeGreaterThan(-1);
    expect(stats).toBeGreaterThan(complete);
    expect(bonus).toBeGreaterThan(stats);
    // 19073 prints the stats with no break; 19089 adds exactly two.
    expect(out).toContain(`${STATS}\r\n\r\nTime increased`);
  });

  test('credits (ulTTTM * 3 / 2) + 60 seconds to the session time limit (express.e:19109, 19130)', async () => {
    const c = aCaller({ timeLimit: 3600 });
    await runPostUpload(c.socket, c.session, finished());
    expect(c.session.timeLimit).toBe(3600 + 195);
  });

  test('credits nothing, and says 0 mins, when no file arrived', async () => {
    const c = aCaller({ timeLimit: 3600 });
    await runPostUpload(c.socket, c.session, finished({ uploadedFiles: 0, uploadedBytes: 0 }));
    expect(c.session.timeLimit).toBe(3600);
    expect(c.said()).toContain('Time increased by 0 mins.');
  });

  test('callersLog gets the stats line only when a file was received, else "Upload Failed.." (express.e:19094)', async () => {
    const ok = aCaller();
    await runPostUpload(ok.socket, ok.session, finished());
    expect(callersLog).toHaveBeenCalledWith('u1', 'spot', `\t${STATS}`);

    callersLog.mockClear();
    const none = aCaller();
    await runPostUpload(none.socket, none.session, finished({ uploadedFiles: 0, uploadedBytes: 0 }));
    expect(callersLog).toHaveBeenCalledWith('u1', 'spot', '\tUpload Failed..');
  });

  test('doUploadNotify fires only when a file was received', async () => {
    const ok = aCaller();
    await runPostUpload(ok.socket, ok.session, finished());
    expect(doUploadNotify).toHaveBeenCalledTimes(1);

    doUploadNotify.mockClear();
    const none = aCaller();
    await runPostUpload(none.socket, none.session, finished({ uploadedFiles: 0, uploadedBytes: 0 }));
    expect(doUploadNotify).not.toHaveBeenCalled();
  });

  test('goodbye-after-transfer hands over to handleGoodbyeCommand (express.e:25657)', async () => {
    const c = aCaller();
    await runPostUpload(c.socket, c.session, finished({ goodbyeAfter: true }));
    expect(handleGoodbyeCommand).toHaveBeenCalledWith(c.socket, c.session, 'Y');
    expect(c.said()).not.toContain('Press any key to continue');
  });
});

describe('Web handleUploadBatchComplete delegates to runPostUpload (no duplication)', () => {
  test('prints the banner, stats and bonus exactly once, and clears the upload context', async () => {
    const c = aCaller({ tempData: { uploadStartTime: Date.now() - 5000, uploadedFiles: 1, uploadedBytes: 2048 } });

    await handleUploadBatchComplete(c.socket, c.session);

    expect(count(c.said(), 'File Uploading Complete...')).toBe(1);
    expect(count(c.said(), ' 1 file(s), 2k bytes,')).toBe(1);
    expect(count(c.said(), 'Time increased by')).toBe(1);
    expect(c.session.tempData).toBeUndefined();
  });
});

describe('Telnet/SSH lrzsz onComplete routes through web pipeline (no duplication)', () => {
  let board: string;
  let restoreConfig: () => void;
  beforeEach(() => {
    board = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-banner-'));
    fs.mkdirSync(path.join(board, 'Conf1', 'Files'), { recursive: true });
    const original = config.get.bind(config);
    const spy = jest.spyOn(config, 'get').mockImplementation((key: string) => (key === 'dataDir' ? board : original(key as never)));
    restoreConfig = () => spy.mockRestore();
    setTransferMiscCommandsDependencies({ setEnvStat: jest.fn() } as any);
  });
  afterEach(() => {
    restoreConfig();
    fs.rmSync(board, { recursive: true, force: true });
  });

  function dizZip(dir: string, name: string, diz: string): string {
    const zip = new AdmZip();
    zip.addFile('FILE_ID.DIZ', Buffer.from(diz));
    zip.addFile('payload.bin', Buffer.from(`payload of ${name}`));
    const full = path.join(dir, name);
    zip.writeZip(full);
    return full;
  }

  test('a two-file RZ batch files both, then prints one banner and one stats line for the pair', async () => {
    const c = aCaller({ connectionType: 'telnet', bbsPath: board, transferRawSend: jest.fn(), transferRawSendUnescaped: jest.fn() });
    await handleZmodemUploadCommand(c.socket, c.session);
    expect(lrzszManagers).toHaveLength(1);

    const playpen = new BBSPaths(board).node(1).playpen();
    const received = [dizZip(playpen, 'ONE.ZIP', 'First release'), dizZip(playpen, 'TWO.ZIP', 'Second release')];
    await lrzszManagers[0].opts.onComplete(true, { received, skipped: [] });

    // Files 2..N were queued and walked: both reached the catalog.
    expect(createdEntries.map((e) => e.filename)).toEqual(['ONE.ZIP', 'TWO.ZIP']);
    expect(count(c.said(), 'File Uploading Complete...')).toBe(1);
    expect(count(c.said(), ' 2 file(s),')).toBe(1);
    expect(count(c.said(), 'file(s),')).toBe(1);
    expect(c.session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
    // express.e:19257-19300 examines each file without a word.
    expect(c.said()).not.toMatch(/File selected|Checking for FILE_ID|FILE_ID\.DIZ found|No FILE_ID/);
  });

  // express.e:19051-19053: a receive that fails still prints "File Uploading
  // Complete..." and the stats, and only the logs say "Upload Failed.."
  // (19093-19096). The port printed an invented "Upload aborted" instead.
  test('a failed RZ receive ends like express: banner, 0 file(s), "Upload Failed.." logged', async () => {
    const c = aCaller({ connectionType: 'telnet', bbsPath: board, transferRawSend: jest.fn(), transferRawSendUnescaped: jest.fn() });
    await handleZmodemUploadCommand(c.socket, c.session);
    await lrzszManagers[0].opts.onComplete(false, { received: [], skipped: [] });

    expect(c.said()).not.toContain('Upload aborted');
    expect(count(c.said(), 'File Uploading Complete...')).toBe(1);
    expect(c.said()).toContain(' 0 file(s),');
    expect(callersLog.mock.calls.some(call => call[2] === '\tUpload Failed..')).toBe(true);
    expect(c.session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
  });
});
