/**
 * Regression: processBatchFile must not overwrite session.subState with
 * UPLOAD_DESC_INPUT after handleDizExtractionAndDescription has already
 * completed the batch (last-file-with-DIZ path).
 *
 * Root cause: when the last file in a ZMODEM batch has FILE_ID.DIZ,
 * handleDizExtractionAndDescription → processBatchFile →
 * handleUploadBatchComplete → runPostUpload → clearUploadContext clears
 * tempData and sets subState=DISPLAY_MENU before returning to the outer
 * processBatchFile.  The unconditional
 *   session.subState = UPLOAD_DESC_INPUT
 * on line 789 then put the session back into UPLOAD_DESC_INPUT with
 * tempData=undefined, causing:
 *   TypeError: Cannot read properties of undefined (reading 'currentLineBuffer')
 * on every subsequent keypress — an infinite "[ERROR] Command processing
 * failed" loop after a successful upload.
 *
 * Fix: guard the UPLOAD_DESC_INPUT assignment with `if (session.tempData)`,
 * in the processBatchFile queue walker and in both callers that start the
 * DIZ/description flow after a ZMODEM receive (RZ and U).
 *
 * Driven end to end: the RZ command (`handleZmodemUploadCommand`) and the U
 * command (`startZmodemUpload`) run with a fake lrzsz manager whose
 * onComplete reports archives in the playpen of a temp board, then the real
 * filing pipeline runs (catalog stubbed as in
 * tests/storage/upload-into-pool.test.ts). An all-DIZ batch must end at the
 * menu with the upload context gone; a file with no DIZ must still stop at
 * the description prompt.
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
const mockDb = {
  query: jest.fn(async () => ({ rows: [] })),
  createFileEntry: jest.fn(async () => 1),
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
(globalThis as any).__dizSubstateMockDb = mockDb;
jest.mock('../src/database', () => ({
  db: new Proxy({} as any, { get: (_t, prop) => (globalThis as any).__dizSubstateMockDb[prop] }),
}));
jest.mock('../src/server/database-helpers', () => ({ callersLog: jest.fn(async () => undefined) }));
jest.mock('../src/utils/download-logging.util', () => ({
  writeUDSessionHeader: jest.fn(async () => undefined),
  writeToCallersLog: jest.fn(async () => undefined),
  writeToUDLog: jest.fn(async () => undefined),
  logUpload: jest.fn(async () => undefined),
}));
jest.mock('../src/utils/clean-playpen.util', () => ({ cleanPlayPen: jest.fn(async () => undefined) }));
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

import {
  handleZmodemUploadCommand,
  setTransferMiscCommandsDependencies,
} from '../src/handlers/commands/transfer-misc-commands.handler';
import { startZmodemUpload } from '../src/handlers/commands/user-commands.handler';
import { BBSPaths } from '../src/utils/bbs-paths.util';
import { LoggedOnSubState } from '../src/constants/bbs-states';
import { config } from '../src/config';

let board: string;
let restoreConfig: () => void;
beforeEach(() => {
  lrzszManagers.length = 0;
  board = fs.mkdtempSync(path.join(os.tmpdir(), 'diz-substate-'));
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

function aTelnetCaller(): { socket: any; session: any } {
  const socket: any = { id: `diz-substate-${Math.random().toString(36).slice(2)}`, emit: () => true, on: () => undefined, once: () => undefined };
  const session: any = {
    nodeId: 1,
    currentConf: 1,
    bbsPath: board,
    connectionType: 'telnet',
    transferRawSend: jest.fn(),
    transferRawSendUnescaped: jest.fn(),
    user: { id: 'u1', username: 'spot', name: 'spot', securityFlags: 'T'.repeat(100), secLibrary: 0 },
  };
  return { socket, session };
}

/** An archive in the playpen, with a FILE_ID.DIZ when `diz` is given. */
function archive(name: string, diz?: string): string {
  const playpen = new BBSPaths(board).node(1).playpen();
  fs.mkdirSync(playpen, { recursive: true });
  const zip = new AdmZip();
  if (diz) zip.addFile('FILE_ID.DIZ', Buffer.from(diz));
  zip.addFile('payload.bin', Buffer.from(`payload of ${name}`));
  const full = path.join(playpen, name);
  zip.writeZip(full);
  return full;
}

async function receive(
  begin: (socket: any, session: any) => unknown,
  received: string[],
): Promise<any> {
  const { socket, session } = aTelnetCaller();
  await begin(socket, session);
  expect(lrzszManagers).toHaveLength(1);
  await lrzszManagers[0].opts.onComplete(true, { received, skipped: [] });
  return session;
}

const RZ = (so: any, se: any) => handleZmodemUploadCommand(so, se);
const U = (so: any, se: any) => startZmodemUpload(so, se);

describe('an all-DIZ ZMODEM batch ends at the menu, not at a dead description prompt', () => {
  test('RZ, one file: the RZ onComplete guard', async () => {
    const session = await receive(RZ, [archive('ONE.ZIP', 'First release')]);
    expect(session.tempData).toBeUndefined();
    expect(session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
  });

  test('U, one file: the U-command guard', async () => {
    const session = await receive(U, [archive('ONE.ZIP', 'First release')]);
    expect(session.tempData).toBeUndefined();
    expect(session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
  });

  test('RZ, two files: the processBatchFile queue walker guard', async () => {
    const session = await receive(RZ, [archive('ONE.ZIP', 'First release'), archive('TWO.ZIP', 'Second release')]);
    expect(session.tempData).toBeUndefined();
    expect(session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
  });
});

describe('a file with no DIZ still stops at the description prompt', () => {
  test.each([['RZ', RZ], ['U', U]])('%s', async (_name, begin) => {
    const session = await receive(begin, [archive('BARE.ZIP')]);
    expect(session.tempData).toBeDefined();
    expect(session.subState).toBe(LoggedOnSubState.UPLOAD_DESC_INPUT);
  });
});
