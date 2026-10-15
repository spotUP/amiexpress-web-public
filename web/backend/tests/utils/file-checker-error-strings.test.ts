/**
 * A disk checker's verdict is express.e's, not a guess at its wording.
 *
 * express.e checkFileExternal (18546-18650) ignores the checker's exit code
 * and fails the file only when a line of its output contains one of the
 * sysop's ERROR.1..n tooltype strings (18604-18620). The port failed on the
 * words error/failed/corrupt/bad/invalid anywhere in the output and on any
 * non-zero exit, and overwrote the output with its own "ERROR: <exec text>" so
 * the uploader never saw the checker's line - useless for amiscan, which exits
 * 1 for "infected" and prints one line.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('../../src/database', () => ({
  db: { query: async () => ({ rows: [] }) },
}));

import { config as appConfig } from '../../src/config';

const {
  testFile,
  TestResult,
  clearFileCheckerCache,
  loadFileCheckersForTesting,
  readErrorStrings,
} = require('../../src/utils/file-test.util');

describe('a disk checker is judged by its ERROR.n strings', () => {
  let root: string;
  let previousDataDir: string;
  let upload: string;

  /** A checker script that prints `line` and exits with `code`. */
  function install(line: string, code: number, tooltypes: string[]): void {
    const script = path.join(root, 'checker.sh');
    fs.writeFileSync(script, `#!/bin/sh\necho "${line}"\nexit ${code}\n`, { mode: 0o755 });
    const dir = path.join(root, 'FCheck');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'LHA.info'),
      [`CHECKER=${script}`, ...tooltypes].join('\n') + '\n',
    );
    clearFileCheckerCache();
  }

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'fcheck-errors-'));
    previousDataDir = appConfig.get('dataDir');
    appConfig.set('dataDir', root);
    upload = path.join(root, 'GAME.LHA');
    fs.writeFileSync(upload, 'lha bytes');
    clearFileCheckerCache();
  });

  afterEach(() => {
    appConfig.set('dataDir', previousDataDir);
    clearFileCheckerCache();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('fails the file when the output contains an ERROR.n string, exit code or not', async () => {
    install('GAME.LHA: infected (Test virus)', 1, ['ERROR.1=infected', 'ERROR.2=corrupted']);

    expect(await testFile(upload, root)).toBe(TestResult.FAILURE);
  });

  it('fails on the second ERROR.n string too', async () => {
    install('GAME.LHA: corrupted archive', 2, ['ERROR.1=infected', 'ERROR.2=corrupted']);

    expect(await testFile(upload, root)).toBe(TestResult.FAILURE);
  });

  it('passes a non-zero exit whose output matches no ERROR.n string', async () => {
    install('GAME.LHA: could not check (password)', 3, ['ERROR.1=infected', 'ERROR.2=corrupted']);

    expect(await testFile(upload, root)).toBe(TestResult.SUCCESS);
  });

  it('passes output that merely says error or failed when no ERROR.n names it', async () => {
    install('0 errors, 0 failed, nothing bad or invalid', 0, ['ERROR.1=infected']);

    expect(await testFile(upload, root)).toBe(TestResult.SUCCESS);
  });

  it('passes everything when the checker declares no ERROR.n strings', async () => {
    install('infected', 1, []);

    expect(await testFile(upload, root)).toBe(TestResult.SUCCESS);
  });

  it('matches case-sensitively, as InStr does', async () => {
    install('GAME.LHA: INFECTED', 1, ['ERROR.1=infected']);

    expect(await testFile(upload, root)).toBe(TestResult.SUCCESS);
  });

  it('keeps the checker\'s own line in OutPut_Of_Test and hands it to the caller', async () => {
    install('GAME.LHA: infected (Test virus)', 1, ['ERROR.1=infected']);
    const shown: string[] = [];

    await testFile(upload, root, { onCheckerOutput: (text: string) => shown.push(text) });

    expect(fs.readFileSync(path.join(root, 'OutPut_Of_Test'), 'utf8')).toContain('infected (Test virus)');
    expect(shown.join('')).toContain('infected (Test virus)');
  });

  it('passes a three-letter extension with no FCheck info, as checkFileExternal does', async () => {
    const bad = path.join(root, 'BAD.ZIP');
    fs.writeFileSync(bad, 'not a zip at all');

    expect(await testFile(bad, root)).toBe(TestResult.SUCCESS);
  });

  it('runs no checker for a two-letter extension (express.e:18663 wants three)', async () => {
    install('infected', 1, ['ERROR.1=infected']);
    fs.copyFileSync(path.join(root, 'FCheck', 'LHA.info'), path.join(root, 'FCheck', 'LZ.info'));
    clearFileCheckerCache();
    const two = path.join(root, 'GAME.LZ');
    fs.writeFileSync(two, 'x');

    expect(await testFile(two, root)).toBe(TestResult.NOT_TESTED);
  });

  it('reads ERROR.1..n contiguous from 1 and stops at the first gap', () => {
    install('x', 0, ['ERROR.1=a', 'ERROR.2=b', 'ERROR.4=d']);

    expect(loadFileCheckersForTesting().get('LHA').errors).toEqual(['a', 'b']);
    expect(readErrorStrings(new Map([['ERROR.2', 'b']]))).toEqual([]);
  });
});
