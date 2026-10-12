/**
 * A checker the board had to kill holds the upload for the sysop; it never
 * passes it.
 *
 * express.e checkFileExternal (18581) starts the checker with SystemTagList,
 * which blocks until the checker ends: an Amiga never files an upload whose
 * check did not finish. The port kills a checker after a timeout, and a killed
 * checker printed no ERROR.n line, so the file passed: on 2026-10-12 a damaged
 * RGBROKE1.LHA was filed into Conf1 after "mULTI-cHECK timed out after 120s".
 * Sysop decision 2026-10-12: a timed-out check is RESULT_FAILURE, the file goes
 * to HOLD ("Requires review") on every upload path.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('../../src/database', () => ({ db: { query: async () => ({ rows: [] }) } }));

// The 68K launcher: the real one runs the emulator; this one reports what the
// launcher reports when its timeout killed the program.
const launches: Array<{ program: string; timeoutMs?: number }> = [];
let launchResult = { output: '', code: null as number | null, killed: true };
jest.mock('../../src/utils/amiga-program-runner.util', () => ({
  runAmigaProgram: jest.fn(async (program: string, options: { timeoutMs?: number }) => {
    launches.push({ program, timeoutMs: options.timeoutMs });
    return launchResult;
  }),
}));

import { config as appConfig } from '../../src/config';
import { testFile, TestResult, clearFileCheckerCache } from '../../src/utils/file-test.util';

describe('a checker killed by the timeout holds the file', () => {
  let root: string;
  let previousDataDir: string;
  let upload: string;

  function icon(lines: string[]): void {
    fs.mkdirSync(path.join(root, 'FCheck'), { recursive: true });
    fs.writeFileSync(path.join(root, 'FCheck', 'LHA.info'), lines.join('\n') + '\n');
    clearFileCheckerCache();
  }

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'fcheck-timeout-'));
    previousDataDir = appConfig.get('dataDir');
    appConfig.set('dataDir', root);
    fs.mkdirSync(path.join(root, 'Node1', 'Playpen'), { recursive: true });
    upload = path.join(root, 'Node1', 'Playpen', 'GAME.LHA');
    fs.writeFileSync(upload, 'lha bytes');
    launches.length = 0;
    launchResult = { output: '', code: null, killed: true };
    clearFileCheckerCache();
  });

  afterEach(() => {
    appConfig.set('dataDir', previousDataDir);
    clearFileCheckerCache();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('a native checker still running at the timeout fails the file, whatever it printed so far', async () => {
    const script = path.join(root, 'slow-check.sh');
    // `exec`: the timeout's signal reaches the process holding the output pipe.
    fs.writeFileSync(script, '#!/bin/sh\necho "GAME.LHA: testing..."\nexec sleep 30\n', { mode: 0o755 });
    icon([`CHECKER=${script}`, 'ERROR.1=infected']);

    const started = Date.now();
    const verdict = await testFile(upload, path.join(root, 'Node1', 'Work'), { nodeId: 1, checkerTimeoutMs: 500 });

    expect(verdict).toBe(TestResult.FAILURE);
    expect(Date.now() - started).toBeLessThan(10_000);
  });

  it('a 68K checker the launcher killed fails the file, with the timeout it was given', async () => {
    fs.mkdirSync(path.join(root, 'Doors', 'multi-check'), { recursive: true });
    fs.writeFileSync(path.join(root, 'Doors', 'multi-check', 'mULTI-cHECK'), 'hunk');
    icon(['CHECKER=DOORS:multi-check/mULTI-cHECK', 'OPTIONS=TYPE=LHA', 'ERROR.1=Archive Corrupt!']);
    launchResult = { output: 'tESTING aRCHIVE...', code: null, killed: true };

    const verdict = await testFile(upload, path.join(root, 'Node1', 'Work'), { nodeId: 1, checkerTimeoutMs: 1234 });

    expect(launches).toHaveLength(1);
    expect(launches[0].timeoutMs).toBe(1234);
    expect(verdict).toBe(TestResult.FAILURE);
  });

  it('a 68K checker that finished with a clean line still passes the file', async () => {
    fs.mkdirSync(path.join(root, 'Doors', 'multi-check'), { recursive: true });
    fs.writeFileSync(path.join(root, 'Doors', 'multi-check', 'mULTI-cHECK'), 'hunk');
    icon(['CHECKER=DOORS:multi-check/mULTI-cHECK', 'OPTIONS=TYPE=LHA', 'ERROR.1=Archive Corrupt!']);
    launchResult = { output: 'pASSED !', code: 0, killed: false };

    expect(await testFile(upload, path.join(root, 'Node1', 'Work'), { nodeId: 1 })).toBe(TestResult.SUCCESS);
    // The board's own limit when the caller names none: 120 s.
    expect(launches[0].timeoutMs).toBe(120_000);
  });
});
