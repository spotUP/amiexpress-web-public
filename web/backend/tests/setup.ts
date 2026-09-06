// Must be first: tsyringe (used by ChatHandler and anything that statically
// imports chat.handler.ts, e.g. door.handler.ts since the DD final-review
// wave, 2026-08-16) requires this polyfill to be loaded before its own
// module evaluates its `@injectable()` decorators. Loading it here (a
// setupFilesAfterEnv file, which Jest requires before any individual test
// file) covers every test file globally instead of requiring each one that
// transitively imports door.handler.ts/chat.handler.ts to carry its own
// `import "reflect-metadata"` — several already did per-file (defensively,
// for tests that import chat.handler.ts directly); this makes it work for
// every OTHER test file too, without hunting down each transitive import.
import 'reflect-metadata';
import fs from 'fs';
import path from 'path';
import { Database } from '../src/database';
import { testTmpDir } from './temp-run-dir';

declare global {
  // eslint-disable-next-line no-var
  var testDb: Database | undefined;
}

let tempDbDir: string | null = null;

beforeAll(async () => {
  if (process.env.SKIP_DB_INIT === '1') {
    return;
  }

  // Inside THIS RUN's directory, not straight in `${TMPDIR}`. The `afterAll`
  // below removes it on a clean exit, but a suite that calls `process.exit(1)`
  // - several here do - never reaches it, and 620 of these initialised SQLite
  // boards were left on the disk on 2026-09-06. Under the run directory they
  // are removed wholesale by `global-teardown.ts`, or by the startup sweep
  // after a kill. See `temp-run-dir.ts`.
  tempDbDir = fs.mkdtempSync(path.join(testTmpDir(), 'amiexpress-tests-'));
  process.env.DATABASE_DIR = tempDbDir;
  process.env.DATABASE_FILE = 'test.db';

  const testDb = new Database();
  await testDb.init();

  global.testDb = testDb;
}, 60000);

afterAll(async () => {
  if (process.env.SKIP_DB_INIT === '1') return;

  const testDb = global.testDb;
  if (testDb) {
    await testDb.close();
  }

  if (tempDbDir) {
    fs.rmSync(tempDbDir, { recursive: true, force: true });
  }
}, 30000);
