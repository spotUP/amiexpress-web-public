/**
 * Runs once in the jest MAIN process after the last suite, including after a
 * failing run and after a worker has killed itself with `process.exit(1)` -
 * which several suites here do, and which leaves the main process alive to
 * report the crash and to run this.
 *
 * Removes this run's whole directory: every worker's seeded board, every
 * per-file SQLite board, and everything the suites put in `os.tmpdir()` while
 * `TMPDIR` pointed inside it.
 */
import * as fs from 'fs';

import { RUN_DIR_ENV } from './temp-run-dir';

export default async function globalTeardown(): Promise<void> {
  const runDir = process.env[RUN_DIR_ENV];
  if (!runDir) return;
  try {
    fs.rmSync(runDir, { recursive: true, force: true });
  } catch {
    // The startup sweep will get it next time; never fail a green run over
    // a directory that a straggling child process still holds open.
  }
}
