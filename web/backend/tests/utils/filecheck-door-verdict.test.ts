/**
 * express.e testFile (18639-18648).
 *
 * FILECHECK is a SYSTEM COMMAND, a door on the caller's screen:
 *   StringF(temp2,'FILECHECK \s',str)
 *   IF (processSysCommand(temp2)=RESULT_SUCCESS) AND (aeGoodFile<>RESULT_NOT_TESTED)
 *     RETURN aeGoodFile
 * The port ran a `system_commands` row as a shell string and read the words
 * error/failed/corrupt in its output. The door's own verdict is DT_GOODFILE
 * (DoorMessageHandler -> session.aeGoodFile).
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('../../src/database', () => ({
  db: { query: async () => ({ rows: [] }) },
}));

const runSysCommandInFlow = jest.fn();
jest.mock('../../src/handlers/command-execution.handler', () => ({
  hasSysCommand: () => true,
  runSysCommandInFlow: (...args: unknown[]) => runSysCommandInFlow(...args),
}));

import { config as appConfig } from '../../src/config';

const {
  testFile,
  TestResult,
  clearFileCheckerCache,
  testResultFromGoodFile,
} = require('../../src/utils/file-test.util');

describe('FILECHECK runs as the SysCmd door and its DT_GOODFILE is the verdict', () => {
  let root: string;
  let previousDataDir: string;
  let upload: string;
  let sentinel: string;
  const socket = { emit: jest.fn() };

  /** An LHA checker that leaves a sentinel: it ran, so the door did not decide. */
  function installExtensionChecker(): void {
    sentinel = path.join(root, 'extension-checker-ran');
    const script = path.join(root, 'checker.sh');
    fs.writeFileSync(script, `#!/bin/sh\nprintf ran > '${sentinel}'\necho clean\n`, { mode: 0o755 });
    fs.mkdirSync(path.join(root, 'FCheck'), { recursive: true });
    fs.writeFileSync(path.join(root, 'FCheck', 'LHA.info'), `CHECKER=${script}\nERROR.1=infected\n`);
    clearFileCheckerCache();
  }

  /** The door ran (RESULT_SUCCESS) and reported `goodFile` through DT_GOODFILE. */
  function doorReports(goodFile: number | undefined): void {
    runSysCommandInFlow.mockImplementation(async (_socket: unknown, session: any) => {
      if (goodFile !== undefined) session.aeGoodFile = goodFile;
      return 0;
    });
  }

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'filecheck-door-'));
    previousDataDir = appConfig.get('dataDir');
    appConfig.set('dataDir', root);
    upload = path.join(root, 'GAME.LHA');
    fs.writeFileSync(upload, 'lha bytes');
    runSysCommandInFlow.mockReset();
    installExtensionChecker();
  });

  afterEach(() => {
    appConfig.set('dataDir', previousDataDir);
    clearFileCheckerCache();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const caller = () => ({ socket, session: { subState: 'upload_in_progress' } });

  it('runs FILECHECK with the file name and returns a good verdict without running the extension checker', async () => {
    doorReports(0);

    const result = await testFile(upload, root, { caller: caller() });

    expect(result).toBe(TestResult.SUCCESS);
    expect(runSysCommandInFlow).toHaveBeenCalledTimes(1);
    expect(runSysCommandInFlow.mock.calls[0].slice(2)).toEqual(['FILECHECK', 'GAME.LHA']);
    expect(fs.existsSync(sentinel)).toBe(false);
  });

  it('returns the door\'s failure verdict (DT_GOODFILE arrives as an unsigned 32-bit -1)', async () => {
    doorReports(0xffffffff);

    expect(await testFile(upload, root, { caller: caller() })).toBe(TestResult.FAILURE);
    expect(fs.existsSync(sentinel)).toBe(false);
  });

  it('falls through to the extension checker when the door leaves the file NOT_TESTED', async () => {
    doorReports(2);

    expect(await testFile(upload, root, { caller: caller() })).toBe(TestResult.SUCCESS);
    expect(fs.existsSync(sentinel)).toBe(true);
  });

  it('falls through when no FILECHECK command ran', async () => {
    runSysCommandInFlow.mockResolvedValue(-1);

    expect(await testFile(upload, root, { caller: caller() })).toBe(TestResult.SUCCESS);
    expect(fs.existsSync(sentinel)).toBe(true);
  });

  it('a door that ran and set no verdict leaves the file NOT_ALLOWED, as aeGoodFile starts', async () => {
    doorReports(undefined);

    expect(await testFile(upload, root, { caller: caller() })).toBe(TestResult.NOT_ALLOWED);
    expect(fs.existsSync(sentinel)).toBe(false);
  });

  it('does not run FILECHECK without a caller (the FTP background check has no screen)', async () => {
    doorReports(-1);

    expect(await testFile(upload, root)).toBe(TestResult.SUCCESS);
    expect(runSysCommandInFlow).not.toHaveBeenCalled();
  });

  it('maps every RESULT_* a door can report', () => {
    expect(testResultFromGoodFile(0)).toBe(TestResult.SUCCESS);
    expect(testResultFromGoodFile(-1)).toBe(TestResult.FAILURE);
    expect(testResultFromGoodFile(2)).toBe(TestResult.NOT_TESTED);
    expect(testResultFromGoodFile(1)).toBe(TestResult.NOT_ALLOWED);
  });
});
