/**
 * The disk side of the test suite.
 *
 * On 2026-09-06 `${TMPDIR}` held 258 `amiexpress-testboard-*` boards (12 GB)
 * and 620 `amiexpress-tests-*` SQLite boards, the disk fell to 287 MiB free,
 * and three sessions spent an hour chasing failures that were really ENOSPC.
 * Both mechanisms are pinned here, and so is the thing they must not cost:
 * the live-board guard those boards exist to provide.
 */
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import { REPO_ROOT, isProtectedLivePath } from '../live-data-guard';
import { hostTmpDir, isStaleRunArtifact, sweepStaleRunDirs, testTmpDir } from '../temp-run-dir';

const BACKEND_ROOT = path.resolve(__dirname, '../..');

describe('the scratch a test run leaves behind', () => {
  let sandbox: string;

  beforeEach(() => {
    sandbox = fs.mkdtempSync(path.join(testTmpDir(), 'lifecycle-'));
  });

  afterEach(() => {
    fs.rmSync(sandbox, { recursive: true, force: true });
  });

  it('a test run leaves no board behind', () => {
    // A whole second jest, pointed at one probe file, with `TMPDIR` aimed at
    // an empty sandbox and every inherited board variable cleared - otherwise
    // the guard short-circuits and seeds nothing, which would pass for the
    // wrong reason. Everything that run creates has to land in the sandbox,
    // and the sandbox has to be empty when it is over.
    const tmp = path.join(sandbox, 'tmp');
    fs.mkdirSync(tmp);
    const report = path.join(sandbox, 'report.json');

    const env: NodeJS.ProcessEnv = { ...process.env, TMPDIR: tmp, TMP: tmp, TEMP: tmp };
    for (const key of [
      'AMIEXPRESS_TEST_RUN_DIR',
      'AMIEXPRESS_TEST_HOST_TMPDIR',
      'BBS_ROOT',
      'BBS_DATA_DIR',
      'DATABASE_DIR',
      'DATABASE_FILE',
    ]) {
      delete env[key];
    }
    env.PROBE_REPORT = report;
    env.AMIEXPRESS_TEST_SWEEP_QUIET = '1';

    const child = spawnSync(
      'npx',
      [
        'jest',
        '--config',
        'dev-scripts/jest.config.ts',
        '--rootDir',
        '.',
        '--testMatch',
        '**/temp-board-probe.testcase.ts',
        '--silent',
        '--ci',
        // Explicit, because jest's default cache directory is derived from
        // `os.tmpdir()`: without this the child would build its cache inside
        // the sandbox and the emptiness check below would be measuring jest.
        '--cacheDirectory',
        path.join(hostTmpDir(), 'amiexpress-probe-cache'),
      ],
      { cwd: BACKEND_ROOT, env, encoding: 'utf8', timeout: 240000 },
    );

    expect(`${child.stdout ?? ''}${child.stderr ?? ''}`).toContain('1 passed');
    expect(child.status).toBe(0);

    const probe = JSON.parse(fs.readFileSync(report, 'utf8')) as {
      bbsRoot: string;
      runDir: string;
      tmpdir: string;
      seededScreens: boolean;
      seededDoorsLink: boolean;
      scratch: string;
    };

    // The board went into this run's own directory, keyed by worker...
    expect(probe.runDir.startsWith(tmp + path.sep)).toBe(true);
    expect(path.basename(probe.runDir)).toMatch(/^amiexpress-testrun-\d+$/);
    expect(path.dirname(probe.bbsRoot)).toBe(probe.runDir);
    expect(path.basename(probe.bbsRoot)).toMatch(/^board-\d+$/);
    // ...it was really seeded, not just an empty pin...
    expect(probe.seededScreens).toBe(true);
    expect(probe.seededDoorsLink).toBe(true);
    // ...a suite reaching for `os.tmpdir()` landed in there too...
    expect(probe.scratch.startsWith(probe.runDir + path.sep)).toBe(true);

    // ...and the run took all of it away with it. Node drops its own compile
    // cache in whatever TMPDIR it is given, for any process; that is the
    // runtime's, it is kilobytes, and it is not what filled the disk.
    const leftBehind = fs
      .readdirSync(tmp)
      .filter(name => !/^(node-compile-cache|v8-compile-cache-\d+)$/.test(name));
    expect(leftBehind).toEqual([]);
  }, 300000);

  it('the guard still refuses a write to the live board', () => {
    // The relocation moved the seeded board; it must not have moved the wall.
    const live = path.join(REPO_ROOT, 'Conf1', 'MsgBase', '.temp-run-dir-probe');
    expect(() => fs.writeFileSync(live, 'Test body text\n')).toThrow(
      /live-data-guard.*refused: Conf1\/MsgBase\/\.temp-run-dir-probe/s,
    );
    expect(fs.existsSync(live)).toBe(false);
    expect(isProtectedLivePath(live)).toBe(true);

    const board = process.env.BBS_ROOT as string;
    // Layer 1: the environment still points at a real, seeded board that is
    // not the checkout.
    expect(board).toBeTruthy();
    expect(isProtectedLivePath(path.join(board, 'Conf1'))).toBe(false);
    expect(fs.existsSync(path.join(board, 'Screens'))).toBe(true);
    // The symlink case, which the new location could have broken: `Doors` in
    // the seeded board points at the checkout's real 719 MB `Doors`, and a
    // write that rides it has to be resolved back to the live tree and
    // refused however deep in `${TMPDIR}` the board now sits.
    expect(() => fs.writeFileSync(path.join(board, 'Doors', '.probe'), 'x')).toThrow(
      /live-data-guard/,
    );
  });

  it('the board lives in this run directory, one per worker', () => {
    const board = process.env.BBS_ROOT as string;
    const runDir = process.env.AMIEXPRESS_TEST_RUN_DIR as string;
    expect(runDir).toBeTruthy();
    expect(path.dirname(board)).toBe(runDir);
    expect(path.basename(board)).toBe(`board-${process.env.JEST_WORKER_ID}`);
    // And `os.tmpdir()` for every other test in this worker is inside it, so
    // nothing they forget to remove outlives the run.
    expect(testTmpDir().startsWith(runDir + path.sep)).toBe(true);
  });
});

describe('the startup sweep', () => {
  let tmpRoot: string;
  /** A pid that certainly is not running: a child we already waited for. */
  let deadPid: number;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(testTmpDir(), 'sweep-'));
    deadPid = spawnSync(process.execPath, ['-e', ''], { encoding: 'utf8' }).pid as number;
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  function makeDir(name: string, ageMinutes: number): string {
    const dir = path.join(tmpRoot, name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'payload'), 'x');
    const when = new Date(Date.now() - ageMinutes * 60 * 1000);
    fs.utimesSync(dir, when, when);
    return dir;
  }

  it('removes the leftovers of a run whose process is gone', () => {
    const dir = makeDir(`amiexpress-testrun-${deadPid}`, 30);
    const legacy = makeDir(`amiexpress-testboard-${deadPid}`, 30);
    const legacyDb = makeDir('amiexpress-tests-AbCdEf', 3 * 60);
    expect(sweepStaleRunDirs(tmpRoot).removed.sort()).toEqual(
      [path.basename(dir), path.basename(legacy), path.basename(legacyDb)].sort(),
    );
    expect(fs.readdirSync(tmpRoot)).toEqual([]);
  });

  it('leaves a running session alone', () => {
    // Three agents share this checkout; a sweep that goes by age alone
    // deletes a colleague's board mid-run. Liveness of the owning pid is the
    // signal, and a young directory is never touched whatever its pid says.
    const mine = makeDir(`amiexpress-testrun-${process.pid}`, 240);
    const young = makeDir(`amiexpress-testrun-${deadPid}`, 1);
    const youngLegacy = makeDir('amiexpress-tests-ZzZzZz', 5);
    expect(sweepStaleRunDirs(tmpRoot).removed).toEqual([]);
    for (const dir of [mine, young, youngLegacy]) expect(fs.existsSync(dir)).toBe(true);
  });

  it('never touches a directory this repository did not create', () => {
    const foreign = makeDir('jest_dx', 24 * 60);
    const alsoForeign = makeDir('com.apple.something', 24 * 60);
    expect(sweepStaleRunDirs(tmpRoot).removed).toEqual([]);
    for (const dir of [foreign, alsoForeign]) expect(fs.existsSync(dir)).toBe(true);
    expect(isStaleRunArtifact('jest_dx', foreign)).toBe(false);
  });
});
