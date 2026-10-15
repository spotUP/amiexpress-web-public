/**
 * Creating a user through the admin puts them on the board.
 *
 * A user exists in two places: the SQLite row the admin reads, and
 * user.data/keys/misc, which is what express.e opens and what GET /users lists
 * through userFileManager. Creating the row and stopping there produced a user
 * that answered 200, never appeared in the list, and did not exist to the
 * board. Underneath that sat a second one: UserDatabaseManager resolved its
 * root from BBS_ROOT alone, and Docker sets BBS_DATA_DIR, so the write landed
 * in a directory nothing reads.
 *
 * The suite was green through both, because tests/api/config-routes.test.ts
 * mocks BOTH user-file managers - a mocked write cannot be a wrong write.
 *
 * The env has to be set BEFORE the modules load: UserDatabaseManager resolves
 * user.data in its constructor and the module exports a singleton, so an
 * import hoisted above an assignment fixes the path first. Hence
 * jest.resetModules() and require() inside beforeAll rather than imports at
 * the top of the file - the same shape of trap the code itself had - and its
 * OWN Database, because the shared one from tests/setup.ts was built with the
 * manager that resolved the old path.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import request from 'supertest';

/** express.e's on-disk record size for one user in user.data. */
const USER_RECORD_BYTES = 232;

describe('POST /api/config/users', () => {
  let app: any;
  let bbsRoot: string;
  let userDataFile: string;
  let previousDataDir: string | undefined;
  let previousDbDir: string | undefined;
  let dbDir: string;

  let db: any;

  beforeAll(async () => {
    previousDataDir = process.env.BBS_DATA_DIR;
    previousDbDir = process.env.DATABASE_DIR;
    bbsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-user-api-'));
    process.env.BBS_DATA_DIR = bbsRoot;
    userDataFile = path.join(bbsRoot, 'user.data');

    dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-user-db-'));
    process.env.DATABASE_DIR = dbDir;
    process.env.DATABASE_FILE = 'user-create.db';

    jest.resetModules();
    /* eslint-disable @typescript-eslint/no-var-requires */
    const express = require('express');
    const { Database } = require('../../src/database');
    const { createConfigRouter } = require('../../src/api/config-routes');
    /* eslint-enable @typescript-eslint/no-var-requires */

    db = new Database();
    await db.init();

    app = express();
    app.use(express.json());
    app.use('/api/config', createConfigRouter(db));
  }, 30000);

  afterAll(async () => {
    if (db) await db.close();
    if (previousDataDir === undefined) delete process.env.BBS_DATA_DIR;
    else process.env.BBS_DATA_DIR = previousDataDir;
    if (previousDbDir === undefined) delete process.env.DATABASE_DIR;
    else process.env.DATABASE_DIR = previousDbDir;
    fs.rmSync(bbsRoot, { recursive: true, force: true });
    fs.rmSync(dbDir, { recursive: true, force: true });
  });

  it('writes the new user to the files the board reads', async () => {
    const before = fs.existsSync(userDataFile) ? fs.statSync(userDataFile).size : 0;

    const res = await request(app)
      .post('/api/config/users')
      .send({ username: `spot_${Date.now()}`, password: 'hunter2xyz', securityLevel: 10, location: 'Uprough' });

    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);

    // The bytes, in the directory BBS_DATA_DIR names - not a mock, and not
    // /app/user.data.
    expect(fs.existsSync(userDataFile)).toBe(true);
    expect(fs.statSync(userDataFile).size).toBe(before + USER_RECORD_BYTES);
  });

  it('never returns the password hash', async () => {
    const res = await request(app)
      .post('/api/config/users')
      .send({ username: `nohash_${Date.now()}`, password: 'hunter2xyz', securityLevel: 10 });

    expect([200, 201]).toContain(res.status);
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });
});
