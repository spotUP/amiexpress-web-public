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
import { spawnSync } from 'child_process';

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
// The board's OWN files, not copies: the FCheck icons, the checker and its
// advert under Doors/multi-check, and the archivers under C/. The test proves
// the configuration the live board ships, not a hand-typed stand-in for it.
const CHECKER = path.join(REPO_ROOT, 'Doors', 'multi-check', 'mULTI-cHECK');
const ADVERT = path.join(REPO_ROOT, 'Doors', 'multi-check', 'uprough.txt');
const ARCHIVE = path.join(__dirname, 'fixtures', 'archives', 'checked.lha');
const ZIP_ARCHIVE = path.join(__dirname, 'fixtures', 'archives', 'checked.zip');
const LHA = path.join(REPO_ROOT, 'C', 'LhA');
const ZIP = path.join(REPO_ROOT, 'C', 'Zip');
const runnable = [CHECKER, ADVERT, ARCHIVE, ZIP_ARCHIVE, LHA, ZIP].every((p) => fs.existsSync(p));
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
    fs.copyFileSync(ZIP, path.join(dataDir, 'C', 'Zip'));
    fs.mkdirSync(path.join(dataDir, 'Doors', 'multi-check'), { recursive: true });
    fs.copyFileSync(CHECKER, path.join(dataDir, 'Doors', 'multi-check', 'mULTI-cHECK'));
    fs.copyFileSync(ADVERT, path.join(dataDir, 'Doors', 'multi-check', 'uprough.txt'));
    fs.mkdirSync(path.join(dataDir, 'FCheck'));
    for (const ext of ['LHA', 'ZIP']) {
      fs.copyFileSync(path.join(REPO_ROOT, 'FCheck', `${ext}.info`), path.join(dataDir, 'FCheck', `${ext}.info`));
    }
    const playpen = path.join(dataDir, 'Node1', 'Playpen');
    fs.mkdirSync(playpen, { recursive: true });
    fs.copyFileSync(ARCHIVE, path.join(playpen, 'GOOD.LHA'));
    // Same archive, compressed data damaged: LhA's CRC check fails.
    const bad = fs.readFileSync(ARCHIVE);
    for (let i = 200; i < 600; i++) bad[i] ^= 0x5a;
    fs.writeFileSync(path.join(playpen, 'BAD.LHA'), bad);
    fs.copyFileSync(ZIP_ARCHIVE, path.join(playpen, 'GOOD.ZIP'));
    // Same zip cut short: the end-of-central-directory record is gone.
    fs.writeFileSync(path.join(playpen, 'BAD.ZIP'), fs.readFileSync(ZIP_ARCHIVE).subarray(0, 6600));
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

  /** The accepted upload, wherever the board filed it (the playpen copy is moved). */
  function uploaded(name: string): string {
    const filed = path.join(dataDir, 'Conf1', 'Files', name);
    return fs.existsSync(filed) ? filed : path.join(dataDir, 'Node1', 'Playpen', name);
  }

  const outputOfTest = () => fs.readFileSync(path.join(dataDir, 'Node1', 'Work', 'OutPut_Of_Test'), 'latin1');

  function expectCheckerLaunchedOn(file: string, packer = 'LHA', type = 'LHA') {
    expect(launched).toHaveBeenCalledTimes(1);
    const [program, options] = launched.mock.calls[0] as [string, runner.RunAmigaProgramOptions];
    expect(program).toBe(path.join(dataDir, 'Doors', 'multi-check', 'mULTI-cHECK'));
    // PACKER and TYPE are both /A in multi-check's template: the shipped icon must carry them.
    expect(options.args).toEqual([
      'ADVERT=DOORS:multi-check/uprough.txt',
      'BBS-PATH=BBS:',
      `PACKER=C:${packer}`,
      `TYPE=${type}`,
      `"BBS:Node1/Playpen/${file}"`,
    ]);
    // express.e:18567-18580: NP_STACKSIZE is Val(STACK), 4096 when the icon has none.
    // The shipped icons say STACK=SAME, and Val('SAME') is 0: the caller's stack.
    expect(options.stackSize).toBe(0);
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
    // The advert went in: the archive now lists it (host lha, not our own parser).
    const listing = spawnSync('lha', ['l', uploaded('GOOD.LHA')], { encoding: 'utf8' });
    if (!listing.error) expect(listing.stdout).toMatch(/uprough\.txt/);
    expect(outputOfTest()).toMatch(/aDDED !/);
  }, 240_000);

  test('a good zip passes with C:Zip and takes the advert', async () => {
    const screen = await upload('GOOD.ZIP');
    expectCheckerLaunchedOn('GOOD.ZIP', 'Zip', 'ZIP');
    expect(outputOfTest()).toMatch(/pASSED !/);
    expect(screen).toContain('Tested Ok');
    expect(screen).not.toContain('Requires review');
    const listing = spawnSync('unzip', ['-l', uploaded('GOOD.ZIP')], { encoding: 'utf8' });
    if (!listing.error) expect(listing.stdout).toMatch(/uprough\.txt/);
  }, 240_000);

  test('a truncated zip fails: C:Zip rejects it and the uploader sees Archive Corrupt!', async () => {
    const screen = await upload('BAD.ZIP');
    expectCheckerLaunchedOn('BAD.ZIP', 'Zip', 'ZIP');
    expect(outputOfTest()).toMatch(/Archive Corrupt!/);
    expect(screen).toContain('Requires review, possibly bad format');
    expect(screen).not.toContain('Tested Ok');
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
