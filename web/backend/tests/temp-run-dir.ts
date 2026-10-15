/**
 * Where a test run is allowed to put its scratch state, and who takes it away.
 *
 * WHY THIS EXISTS
 * ---------------
 * The suite writes a lot into the developer's `${TMPDIR}` and used to remove
 * almost none of it. Two mechanisms did the damage on 2026-09-06:
 *
 *  1. `live-data-guard.ts` seeded a ~39 MB board per WORKER PROCESS, keyed by
 *     pid (`amiexpress-testboard-<pid>`), and never removed it. Seven workers
 *     per run meant ~270 MB per `npx jest` invocation, kept for ever. 258 of
 *     them - 12 GB - were on this disk that evening.
 *  2. `setup.ts` created an initialised SQLite board per TEST FILE
 *     (`amiexpress-tests-XXXXXX`) and removed it in `afterAll`. That works
 *     when jest exits cleanly and not at all when it is killed or a suite
 *     calls `process.exit(1)` mid-run, which happens here regularly. 620 were
 *     left behind.
 *
 * Plus the ~218 test files that call `os.tmpdir()` themselves and leave
 * `bbs-*`, `board-*`, `cache-*`, `filecache-*` dirs behind - thousands of them.
 *
 * THE FIX IS THE KEY, NOT A REAPER
 * --------------------------------
 * Everything a run creates goes under ONE directory named after the jest main
 * process - `amiexpress-testrun-<pid>` - and `${TMPDIR}` is repointed inside
 * it for the workers, so a test that reaches for `os.tmpdir()` lands there too
 * without knowing about any of this. Then:
 *
 *   - `globalTeardown` removes that one directory. It runs on a failing run,
 *     and on the common `process.exit(1)` case as well, because that kills a
 *     WORKER while the main process lives on to report the crash.
 *   - a SIGKILL of the main process defeats any hook, so `sweepStaleRunDirs`
 *     runs at the start of every run and removes the run dirs whose owning pid
 *     is gone. That is the honest complement to the hook, not a substitute for
 *     it: it is keyed on process liveness, so it cannot touch a run that is
 *     still going, and the age floor keeps it off a directory whose pid was
 *     recycled seconds ago.
 *
 * Nothing here removes a directory this repository did not create.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs: typeof import('fs') = require('fs');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const os: typeof import('os') = require('os');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path: typeof import('path') = require('path');

/** Set by `globalSetup`; read by the workers it forks. */
export const RUN_DIR_ENV = 'AMIEXPRESS_TEST_RUN_DIR';
/**
 * The real `${TMPDIR}` as it was before this run repointed it. Kept so a test
 * that has to look at the developer's own temp directory - the leak
 * regression test does - can still find it.
 */
export const HOST_TMPDIR_ENV = 'AMIEXPRESS_TEST_HOST_TMPDIR';

const RUN_DIR_PREFIX = 'amiexpress-testrun-';
/** The two names the leaking mechanisms used before this file existed. */
const LEGACY_PID_PREFIX = 'amiexpress-testboard-';
const LEGACY_RANDOM_PREFIX = 'amiexpress-tests-';

/**
 * A dead pid is proof the run is over, but pids are recycled, so a directory
 * younger than this is left alone whatever its pid says.
 */
const PID_STALE_MS = 10 * 60 * 1000;
/**
 * `amiexpress-tests-XXXXXX` carries no pid - `mkdtemp` picked the suffix - so
 * age is the only signal available. Two hours is far longer than any suite.
 */
const AGE_STALE_MS = 2 * 60 * 60 * 1000;

/** The developer's own temp directory, whatever this run did to `os.tmpdir`. */
export function hostTmpDir(): string {
  return process.env[HOST_TMPDIR_ENV] || os.tmpdir();
}

/** `<host tmp>/amiexpress-testrun-<jest main pid>`. */
export function runDirFor(mainPid: number): string {
  return path.join(hostTmpDir(), `${RUN_DIR_PREFIX}${mainPid}`);
}

/**
 * This run's directory, or `null` when jest was started without the
 * `globalSetup` hook (another config, or a stray direct `require` of the
 * guard). Callers fall back to the old behaviour in that case rather than
 * failing: containment is a convenience, the live-data guard is not.
 */
export function currentRunDir(): string | null {
  return process.env[RUN_DIR_ENV] || null;
}

/**
 * The seeded board for THIS worker. Keyed by `JEST_WORKER_ID`, not pid: the
 * worker id is bounded by `maxWorkers`, so a run creates at most that many
 * boards however many times a worker is respawned, and the run directory
 * makes the name unique across concurrent runs. Falls back to the old
 * pid-keyed name outside a hooked run.
 */
export function testBoardDir(): string {
  const runDir = currentRunDir();
  const workerId = process.env.JEST_WORKER_ID;
  if (runDir) return path.join(runDir, `board-${workerId || process.pid}`);
  return path.join(hostTmpDir(), `${LEGACY_PID_PREFIX}${process.pid}`);
}

/** The directory `os.tmpdir()` hands out inside this run. */
export function testTmpDir(): string {
  const runDir = currentRunDir();
  return runDir ? path.join(runDir, 'tmp') : os.tmpdir();
}

/**
 * Make `os.tmpdir()` hand this process the run's own temp directory, so the
 * 218 test files that build their own scratch directories land inside it and
 * go away with it - without any of them being changed.
 *
 * IN PROCESS ONLY, deliberately. The first version of this set `TMPDIR` in the
 * environment, which is inherited, and that took the CHILD processes with it:
 * `tsx`, `esbuild` and `npx` keep their transpile caches under `${TMPDIR}`, a
 * fresh run directory means a cold cache every run, and
 * `gwall-asks-for-the-acronym-once` - which gives a spawned 68K door 20
 * seconds to answer - failed all five of its cases while re-transpiling the
 * backend. Patching the function instead leaves the environment alone: a child
 * still gets the developer's real temp directory and its warm caches.
 *
 * Idempotent, and a no-op outside a hooked run.
 */
export function useRunDirAsTmp(): void {
  const tmp = ensureRunTmpDir();
  if (!tmp) return;
  const patched = os as unknown as { tmpdir: RunScopedTmpdir };
  if (patched.tmpdir.runScoped) return;
  const runScopedTmpdir: RunScopedTmpdir = () => tmp;
  runScopedTmpdir.runScoped = true;
  patched.tmpdir = runScopedTmpdir;
}

interface RunScopedTmpdir {
  (): string;
  runScoped?: boolean;
}

/**
 * Create (once) the directory `os.tmpdir()` will hand out inside this run, and
 * return it; `null` outside a hooked run. `globalSetup` calls this WITHOUT the
 * patch above: the jest main process runs no tests, and its own `os.tmpdir()`
 * is none of this file's business.
 */
export function ensureRunTmpDir(): string | null {
  const runDir = currentRunDir();
  if (!runDir) return null;
  if (!process.env[HOST_TMPDIR_ENV]) process.env[HOST_TMPDIR_ENV] = os.tmpdir();
  const tmp = path.join(runDir, 'tmp');
  if (!fs.existsSync(tmp)) fs.mkdirSync(tmp, { recursive: true });
  return tmp;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means it exists and belongs to somebody else.
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function ageMs(target: string, now: number): number {
  try {
    return now - fs.statSync(target).mtimeMs;
  } catch {
    return -1; // vanished under us; nothing to do
  }
}

/** Decides, without touching anything, whether `name` is ours and finished. */
export function isStaleRunArtifact(name: string, target: string, now = Date.now()): boolean {
  const pidPrefix = name.startsWith(RUN_DIR_PREFIX)
    ? RUN_DIR_PREFIX
    : name.startsWith(LEGACY_PID_PREFIX)
      ? LEGACY_PID_PREFIX
      : null;
  if (pidPrefix) {
    const pid = Number(name.slice(pidPrefix.length));
    if (!Number.isInteger(pid) || pid <= 0) return ageMs(target, now) > AGE_STALE_MS;
    if (isProcessAlive(pid)) return false;
    return ageMs(target, now) > PID_STALE_MS;
  }
  if (name.startsWith(LEGACY_RANDOM_PREFIX)) return ageMs(target, now) > AGE_STALE_MS;
  return false;
}

export interface SweepResult {
  /** Names removed from the host temp directory, for the run's own log line. */
  removed: string[];
}

/**
 * Remove finished runs' leftovers from the host temp directory. Only the three
 * names this repository creates are considered, and only when their owner is
 * demonstrably gone.
 */
export function sweepStaleRunDirs(tmpRoot = hostTmpDir()): SweepResult {
  const result: SweepResult = { removed: [] };
  let names: string[];
  try {
    names = fs.readdirSync(tmpRoot);
  } catch {
    return result;
  }
  const now = Date.now();
  for (const name of names) {
    const target = path.join(tmpRoot, name);
    if (!isStaleRunArtifact(name, target, now)) continue;
    try {
      fs.rmSync(target, { recursive: true, force: true });
      result.removed.push(name);
    } catch {
      // A concurrent run may be removing the same corpse. Never fatal.
    }
  }
  return result;
}
