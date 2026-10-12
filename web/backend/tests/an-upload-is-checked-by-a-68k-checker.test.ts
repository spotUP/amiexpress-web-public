/**
 * One reachability test: an LHA upload, through the entry the web/Zmodem
 * socket path uses (processBatchFile -> testFile), is checked by the board's
 * real 68K CHECKER named on an Amiga path (express.e:18546-18650
 * checkFileExternal): FCheck/LHA.info says
 *
 *     CHECKER=DOORS:multi-check/mULTI-cHECK
 *     OPTIONS=BBS-PATH=BBS: PACKER=C:LHA TYPE=LHA
 *
 * mULTI-cHECK runs C:LHA -F t on `BBS:Node1/Playpen/<file>` through
 * SystemTagList (a-checker-runs-the-real-archiver.test.ts proves that half),
 * prints its verdict to Output(), and the board writes that to OutPut_Of_Test,
 * shows it to the uploader and reads ERROR.1 in it. The sentinel that the
 * checker really ran is the launcher call itself (utils/amiga-program-runner)
 * with the real program path and the Amiga file argument; the verdicts only
 * the real LhA can produce are the other half.
 *
 * The runner's "[68K] X exited with ..." notice is a log line now: it must
 * not be in the program's output.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/* eslint-disable @typescript-eslint/no-explicit-any */

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
};
(globalThis as any).__check68kMockDb = mockDb;
jest.mock('../src/database', () => ({
  db: new Proxy({} as any, { get: (_target, prop) => (globalThis as any).__check68kMockDb[prop] }),
}));
jest.mock('../src/server/database-helpers', () => ({ callersLog: jest.fn(async () => undefined) }));
jest.mock('../src/services/post-upload.service', () => ({ runPostUpload: jest.fn(async () => undefined) }));
jest.mock('../src/handlers/command-execution.handler', () => ({
  hasSysCommand: () => false,
  runSysCommandInFlow: jest.fn(async () => -1),
}));

// Call-through: the sentinel is that the board's launcher was asked to run the real program.
jest.mock('../src/utils/amiga-program-runner.util', () => {
  const actual = jest.requireActual('../src/utils/amiga-program-runner.util');
  return { ...actual, runAmigaProgram: jest.fn(actual.runAmigaProgram) };
});

import { processBatchFile } from '../src/server/file-socket-handlers';
import { setStorageContext } from '../src/storage/storage-context';
import { config } from '../src/config';
import { clearFileCheckerCache } from '../src/utils/file-test.util';
import * as runner from '../src/utils/amiga-program-runner.util';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const CHECKER = path.join(__dirname, 'fixtures', 'multi-check', 'mULTI-cHECK');
const ARCHIVE = path.join(__dirname, 'fixtures', 'archives', 'checked.lha');
const LHA = path.join(REPO_ROOT, 'C', 'LhA');
const runnable = [CHECKER, ARCHIVE, LHA].every((p) => fs.existsSync(p));
const describeMaybe = runnable ? describe : describe.skip;

describeMaybe('an upload is checked by a 68K CHECKER named on an Amiga path', () => {
  let dataDir: string;
  let restoreConfig: () => void;
  const launched = runner.runAmigaProgram as unknown as jest.Mock;
  const savedRamDir = process.env.RAM_DIR;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-68k-check-'));
    process.env.RAM_DIR = path.join(dataDir, 'ram');
    const original = config.get.bind(config);
    const spy = jest.spyOn(config, 'get')
      .mockImplementation((key: string) => (key === 'dataDir' ? dataDir : original(key as never)));
    restoreConfig = () => spy.mockRestore();
    launched.mockClear();
    setStorageContext(null);
    clearFileCheckerCache();

    fs.mkdirSync(path.join(dataDir, 'Conf1', 'Files'), { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'Conf1', 'DIR1'), '');
    fs.mkdirSync(path.join(dataDir, 'C'));
    fs.copyFileSync(LHA, path.join(dataDir, 'C', 'LhA'));
    fs.mkdirSync(path.join(dataDir, 'Doors', 'multi-check'), { recursive: true });
    fs.copyFileSync(CHECKER, path.join(dataDir, 'Doors', 'multi-check', 'mULTI-cHECK'));
    fs.mkdirSync(path.join(dataDir, 'FCheck'));
    fs.writeFileSync(
      path.join(dataDir, 'FCheck', 'LHA.info'),
      'CHECKER=DOORS:multi-check/mULTI-cHECK\nOPTIONS=BBS-PATH=BBS: PACKER=C:LHA TYPE=LHA\nERROR.1=Archive Corrupt!\n',
    );
    const playpen = path.join(dataDir, 'Node1', 'Playpen');
    fs.mkdirSync(playpen, { recursive: true });
    fs.copyFileSync(ARCHIVE, path.join(playpen, 'GOOD.LHA'));
    // Same archive, compressed data damaged: LhA's CRC check fails.
    const bad = fs.readFileSync(ARCHIVE);
    for (let i = 200; i < 600; i++) bad[i] ^= 0x5a;
    fs.writeFileSync(path.join(playpen, 'BAD.LHA'), bad);
  });

  afterEach(() => {
    restoreConfig();
    clearFileCheckerCache();
    if (savedRamDir === undefined) delete process.env.RAM_DIR;
    else process.env.RAM_DIR = savedRamDir;
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  async function upload(filename: string): Promise<string> {
    const out: string[] = [];
    const playpenFile = path.join(dataDir, 'Node1', 'Playpen', filename);
    const session: any = {
      user: { id: 1, username: 'spot', securityFlags: 'T'.repeat(100), secLibrary: 0 },
      currentConf: 1,
      nodeId: 1,
      subState: 'upload_in_progress',
      tempData: {
        uploadMode: true,
        fileArea: { id: 1, conferenceId: 1, dirNumber: 1, name: 'Conf1 - Dir 1', dlPath: 'BBS:Conf1/Files/', ulPath: 'BBS:Conf1/Files/' },
        uploadSessionId: 'sess-1',
        uploadBatch: [{ filename, description: '', isPrivate: false }],
        uploadCount: 1, currentUploadIndex: 0, uploadStartTime: Date.now(),
        webUploadMode: true, pendingZmodemFiles: [],
      },
    };
    await processBatchFile(
      { id: 'socket-68k', emit: (_event: string, text: string) => { out.push(String(text)); return true; } } as any,
      session,
      { filename, originalname: filename, size: fs.statSync(playpenFile).size, path: playpenFile },
      config,
    );
    return out.join('');
  }

  const outputOfTest = () => fs.readFileSync(path.join(dataDir, 'Node0', 'Work', 'OutPut_Of_Test'), 'latin1');

  function expectCheckerLaunchedOn(file: string) {
    expect(launched).toHaveBeenCalledTimes(1);
    const [program, options] = launched.mock.calls[0] as [string, runner.RunAmigaProgramOptions];
    expect(program).toBe(path.join(dataDir, 'Doors', 'multi-check', 'mULTI-cHECK'));
    expect(options.args).toEqual(['BBS-PATH=BBS:', 'PACKER=C:LHA', 'TYPE=LHA', `"BBS:Node1/Playpen/${file}"`]);
  }

  test('a good archive passes: the checker ran and its verdict is the uploader\'s', async () => {
    const screen = await upload('GOOD.LHA');
    expectCheckerLaunchedOn('GOOD.LHA');
    expect(outputOfTest()).toMatch(/pASSED !/);
    expect(outputOfTest()).not.toMatch(/\[68K\]/);
    expect(screen).toContain('pASSED !');
    expect(screen).toContain('Tested Ok');
    expect(screen).not.toContain('Requires review');
    expect(screen).not.toContain('[68K]');
  }, 240_000);

  test('a damaged archive fails: the uploader sees Archive Corrupt! and it is held', async () => {
    const screen = await upload('BAD.LHA');
    expectCheckerLaunchedOn('BAD.LHA');
    expect(outputOfTest()).toMatch(/Archive Corrupt!/);
    expect(outputOfTest()).not.toMatch(/\[68K\]/);
    expect(screen).toContain('Archive Corrupt!');
    expect(screen).toContain('Requires review, possibly bad format');
    expect(screen).not.toContain('Tested Ok');
    expect(screen).not.toContain('[68K]');
  }, 240_000);
});
