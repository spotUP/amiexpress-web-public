import fs from 'fs';
import os from 'os';
import path from 'path';
import { Database } from '../src/database';

declare global {
  // eslint-disable-next-line no-var
  var testDb: Database | undefined;
}

let tempDbDir: string | null = null;

beforeAll(async () => {
  tempDbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'amiexpress-tests-'));
  process.env.DATABASE_DIR = tempDbDir;
  process.env.DATABASE_FILE = 'test.db';

  const testDb = new Database();
  await testDb.init();

  global.testDb = testDb;
}, 60000);

afterAll(async () => {
  const testDb = global.testDb;
  if (testDb) {
    await testDb.close();
  }

  if (tempDbDir) {
    fs.rmSync(tempDbDir, { recursive: true, force: true });
  }
}, 30000);
