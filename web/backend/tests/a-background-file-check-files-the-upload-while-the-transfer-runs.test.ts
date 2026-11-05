/**
 * ONE reachability test: BGFILECHECK, through the RZ command's own upload
 * (handleZmodemUploadCommand -> the transfer manager it builds -> the
 * onComplete it hands that manager), with the board's real 68K CHECKER.
 *
 * express.e (createBackgroundFileCheckThread 16922, doBgCheck 18474,
 * backgroundFileCheckThread 18495, doBackgroundCheck 19551, fileReceive end
 * 17327-17347, receivePlayPen 18015, uploadaFile 19059-19086): with the node's
 * BGFILECHECK, the caller's USER_BGFILECHECK and an RZ upload, each file is
 * checked and FILED while the transfer is still running - no prompt, the
 * checker's output not shown - and what the thread filed is counted in the
 * stats banner and left out of the filing loop.
 *
 * Sentinels: the launcher (utils/amiga-program-runner) is called once per
 * file with the real checker, and the playpen is emptied by the thread, not by
 * the filing loop (which never sees the files: no "Testing..." line).
 *
 * Fixtures and the sentinel are an-upload-is-checked-by-a-68k-checker's.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

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
(globalThis as any).__bgCheckMockDb = mockDb;
jest.mock('../src/database', () => ({
  db: new Proxy({} as any, { get: (_t, prop) => (globalThis as any).__bgCheckMockDb[prop] }),
}));
jest.mock('../src/server/database-helpers', () => ({ callersLog: jest.fn(async () => undefined) }));
jest.mock('../src/utils/download-logging.util', () => ({
  writeUDSessionHeader: jest.fn(async () => undefined),
  writeToCallersLog: jest.fn(async () => undefined),
  writeToUDLog: jest.fn(async () => undefined),
  logUpload: jest.fn(async () => undefined),
}));
jest.mock('../src/utils/clean-playpen.util', () => ({ cleanPlayPen: jest.fn(async () => undefined) }));
const postUploads: any[] = [];
jest.mock('../src/services/post-upload.service', () => ({
  runPostUpload: jest.fn(async (_e: unknown, _s: unknown, ctx: unknown) => { postUploads.push(ctx); }),
}));
jest.mock('../src/handlers/command-execution.handler', () => ({
  hasSysCommand: () => false,
  runSysCommandInFlow: jest.fn(async () => -1),
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
    start() { /* no rz: the test is the sender */ }
    handleInput() { /* no rz */ }
  },
}));
// The description EXAMINE would have produced: the DIZ is not what is under test.
jest.mock('../src/utils/file-diz.util', () => ({
  ...jest.requireActual('../src/utils/file-diz.util'),
  extractAndReadDiz: jest.fn(async (file: string) => [`Described ${path.basename(file)}`, 'second line']),
}));
// Call-through: the sentinel is that the launcher was asked to run the real checker.
jest.mock('../src/utils/amiga-program-runner.util', () => {
  const actual = jest.requireActual('../src/utils/amiga-program-runner.util');
  return { ...actual, runAmigaProgram: jest.fn(actual.runAmigaProgram) };
});

import {
  handleZmodemUploadCommand,
  setTransferMiscCommandsDependencies,
} from '../src/handlers/commands/transfer-misc-commands.handler';
import { config } from '../src/config';
import { clearFileCheckerCache } from '../src/utils/file-test.util';
import { clearNodeTooltypeCache } from '../src/utils/node-tooltypes.util';
import { UserFlag } from '../src/constants/express-flags';
import * as runner from '../src/utils/amiga-program-runner.util';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const CHECKER = path.join(__dirname, 'fixtures', 'multi-check', 'mULTI-cHECK');
const ARCHIVE = path.join(__dirname, 'fixtures', 'archives', 'checked.lha');
const LHA = path.join(REPO_ROOT, 'board', 'C', 'LhA');
const runnable = [CHECKER, ARCHIVE, LHA].every((p) => fs.existsSync(p));
const describeMaybe = runnable ? describe : describe.skip;

describeMaybe('BGFILECHECK checks and files an RZ upload while the transfer runs', () => {
  let board: string;
  let restoreConfig: () => void;
  const launched = runner.runAmigaProgram as unknown as jest.Mock;
  const savedRamDir = process.env.RAM_DIR;

  beforeEach(() => {
    board = fs.mkdtempSync(path.join(os.tmpdir(), 'bgcheck-'));
    process.env.RAM_DIR = path.join(board, 'ram');
    const original = config.get.bind(config);
    const spy = jest.spyOn(config, 'get').mockImplementation((key: string) => (key === 'dataDir' ? board : original(key as never)));
    restoreConfig = () => spy.mockRestore();
    launched.mockClear();
    createdEntries.length = 0;
    lrzszManagers.length = 0;
    postUploads.length = 0;
    clearFileCheckerCache();
    clearNodeTooltypeCache();
    setTransferMiscCommandsDependencies({ setEnvStat: jest.fn() } as any);

    fs.mkdirSync(path.join(board, 'Conf1', 'Files'), { recursive: true });
    fs.writeFileSync(path.join(board, 'Conf1', 'DIR1'), '');
    fs.mkdirSync(path.join(board, 'C'));
    fs.copyFileSync(LHA, path.join(board, 'C', 'LhA'));
    fs.mkdirSync(path.join(board, 'Doors', 'multi-check'), { recursive: true });
    fs.copyFileSync(CHECKER, path.join(board, 'Doors', 'multi-check', 'mULTI-cHECK'));
    fs.mkdirSync(path.join(board, 'FCheck'));
    fs.writeFileSync(
      path.join(board, 'FCheck', 'LHA.info'),
      'CHECKER=DOORS:multi-check/mULTI-cHECK\nOPTIONS=BBS-PATH=BBS: PACKER=C:LHA TYPE=LHA\nERROR.1=Archive Corrupt!\n',
    );
    // The node's own switch (express.e:25614).
    fs.writeFileSync(path.join(board, 'Node1.info'), 'BGFILECHECK\n');
    fs.mkdirSync(path.join(board, 'Node1', 'Playpen'), { recursive: true });
  });

  afterEach(() => {
    restoreConfig();
    clearFileCheckerCache();
    clearNodeTooltypeCache();
    if (savedRamDir === undefined) delete process.env.RAM_DIR;
    else process.env.RAM_DIR = savedRamDir;
    fs.rmSync(board, { recursive: true, force: true });
  });

  function aCaller(userFlags: number) {
    const lines: string[] = [];
    const socket: any = {
      id: `bg-${Math.random().toString(36).slice(2)}`,
      emit: (event: string, payload: unknown) => { if (event === 'ansi-output') lines.push(String(payload)); return true; },
      on: () => undefined,
      once: () => undefined,
    };
    const session: any = {
      nodeId: 1,
      currentConf: 1,
      connectionType: 'telnet',
      bbsPath: board,
      transferRawSend: jest.fn(),
      transferRawSendUnescaped: jest.fn(),
      user: {
        id: 'u1', username: 'spot', name: 'spot', location: 'Uprough',
        securityFlags: 'T'.repeat(100), secLibrary: 0, userFlags,
      },
    };
    return { socket, session, said: () => lines.join('') };
  }

  test('each file is checked by the real 68K checker and filed before the transfer ends; the loop never sees them', async () => {
    const c = aCaller(UserFlag.BGFILECHECK);
    await handleZmodemUploadCommand(c.socket, c.session);
    expect(lrzszManagers).toHaveLength(1);
    const { opts } = lrzszManagers[0];
    // The handler wired the background check into the transfer.
    expect(typeof opts.onFileReceived).toBe('function');

    const playpen = path.join(board, 'Node1', 'Playpen');
    const good = path.join(playpen, 'GOOD.LHA');
    const bad = path.join(playpen, 'BAD.LHA');
    fs.copyFileSync(ARCHIVE, good);
    const damaged = fs.readFileSync(ARCHIVE);
    for (let i = 200; i < 600; i++) damaged[i] ^= 0x5a; // LhA's CRC check fails
    fs.writeFileSync(bad, damaged);
    const goodSize = fs.statSync(good).size;

    // What rz does: each file is whole in turn; then the transfer ends.
    opts.onFileReceived(good);
    opts.onFileReceived(bad);
    await opts.onComplete(true, { received: [good, bad], skipped: [] });

    // The sentinel: the real checker ran, once per file, from the thread.
    expect(launched).toHaveBeenCalledTimes(2);
    for (const call of launched.mock.calls as Array<[string, runner.RunAmigaProgramOptions]>) {
      expect(call[0]).toBe(path.join(board, 'Doors', 'multi-check', 'mULTI-cHECK'));
    }
    const checked = (launched.mock.calls as Array<[string, runner.RunAmigaProgramOptions]>)
      .map((call) => call[1].args!.slice(-1)[0]).sort();
    expect(checked).toEqual(['"BBS:Node1/Playpen/BAD.LHA"', '"BBS:Node1/Playpen/GOOD.LHA"']);

    // Filed: the good one into the area with its description, the failed one held.
    expect(fs.existsSync(path.join(board, 'Conf1', 'Files', 'GOOD.LHA'))).toBe(true);
    expect(fs.existsSync(path.join(board, 'Conf1', 'Files', 'BAD.LHA'))).toBe(false);
    expect(fs.existsSync(path.join(board, 'Conf1', 'HOLD', 'BAD.LHA'))).toBe(true);
    expect(fs.readdirSync(playpen)).toEqual([]);
    const dir = fs.readFileSync(path.join(board, 'Conf1', 'DIR1'), 'latin1');
    expect(dir).toMatch(/^GOOD\.LHA\s.*\sP?/m);
    expect(dir).toContain('Described GOOD.LHA');
    expect(createdEntries.map((entry) => entry.filename).sort()).toEqual(['BAD.LHA', 'GOOD.LHA']);

    // Credit as doBackgroundCheck gives it: the passed file only.
    expect(c.session.user.uploads).toBe(1);
    expect(c.session.user.bytesUpload).toBe(goodSize);

    // Nothing of the checker reached the caller, and the filing loop never ran.
    expect(c.said()).not.toContain('pASSED');
    expect(c.said()).not.toContain('Archive Corrupt!');
    expect(c.said()).not.toContain('Testing...');
    expect(c.said()).toContain('Waiting for background filecheck to complete...');

    // The stats count what the thread filed, and the banner says so.
    expect(postUploads).toHaveLength(1);
    expect(postUploads[0]).toMatchObject({ uploadedFiles: 2, backgroundChecked: 2 });
  }, 400_000);
});
