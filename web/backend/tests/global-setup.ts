/**
 * Runs once in the jest MAIN process, before any worker is forked.
 *
 * Two jobs, both about not filling the developer's disk - see the header of
 * `temp-run-dir.ts` for the 12 GB that made them necessary:
 *
 *  1. Open this run's own directory and publish it in the environment. The
 *     workers are forked from this process, so they inherit it; the seeded
 *     boards and every `os.tmpdir()` scratch directory land inside it, and
 *     `global-teardown.ts` takes the whole thing away in one call.
 *  2. Sweep the leftovers of runs whose process is gone. A hook cannot fire
 *     when jest is SIGKILLed, so this is the part that keeps a killed run from
 *     being permanent.
 */
import * as fs from 'fs';
import * as os from 'os';

import {
  HOST_TMPDIR_ENV,
  RUN_DIR_ENV,
  ensureRunTmpDir,
  runDirFor,
  sweepStaleRunDirs,
} from './temp-run-dir';

export default async function globalSetup(): Promise<void> {
  // Recorded before anything repoints TMPDIR, so `hostTmpDir()` keeps naming
  // the developer's own temp directory for the rest of the run.
  process.env[HOST_TMPDIR_ENV] ??= os.tmpdir();

  const removed = sweepStaleRunDirs().removed;
  if (removed.length > 0 && process.env.AMIEXPRESS_TEST_SWEEP_QUIET !== '1') {
    // One line, not one per directory: a run that inherits 300 corpses should
    // not push the failure summary off the screen.
    process.stdout.write(
      `[test-run-dir] swept ${removed.length} stale test director${removed.length === 1 ? 'y' : 'ies'}\n`,
    );
  }

  const runDir = runDirFor(process.pid);
  fs.mkdirSync(runDir, { recursive: true });
  process.env[RUN_DIR_ENV] = runDir;
  // The workers inherit the variable above and each patches its own
  // `os.tmpdir()`; this only opens the directory they will share.
  ensureRunTmpDir();
}
