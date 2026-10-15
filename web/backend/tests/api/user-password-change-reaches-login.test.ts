/**
 * Changing a password in the admin changes the password the board checks.
 *
 * A user exists in two stores. `db.authenticateUser` compares against the
 * SQLite row (database.ts:2830-2836); the admin lists users from disk
 * (userFileManager.readAllUsers), so editing one took the disk branch and
 * wrote only user.data/user.misc. The sysop was told "User updated
 * successfully", the disk record changed, and the account kept its old
 * password.
 *
 * Reported on the live board for Phantasm, and confirmed there by comparing
 * the two: a 60-character bcrypt hash in the database, a 32-character
 * fragment on disk, and the fragment was not even a prefix of the hash - two
 * different passwords. The fragment is truncated by design
 * (UserFileManager.ts:243 stores 32 characters), so the disk copy cannot
 * verify anything and never could; the database is the store that decides
 * whether a login succeeds.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import request from 'supertest';

describe('PUT /api/config/users/:id with a new password', () => {
  let app: any;
  let db: any;
  let bbsRoot: string;
  let dbDir: string;
  let previousDataDir: string | undefined;
  let previousDbDir: string | undefined;

  beforeAll(async () => {
    previousDataDir = process.env.BBS_DATA_DIR;
    previousDbDir = process.env.DATABASE_DIR;
    bbsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-pw-'));
    dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-pw-db-'));
    process.env.BBS_DATA_DIR = bbsRoot;
    process.env.DATABASE_DIR = dbDir;
    process.env.DATABASE_FILE = 'password-change.db';

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

  it('changes the password the board authenticates against', async () => {
    const username = `pwtest_${Date.now()}`;

    const created = await request(app)
      .post('/api/config/users')
      .send({ username, password: 'first-password', securityLevel: 10 });
    expect([200, 201]).toContain(created.status);

    // The account logs in with what it was created with.
    expect(await db.authenticateUser(username, 'first-password')).not.toBeNull();

    // Edit it the way the admin does: by its DISK id, which is what
    // GET /users hands the page for a user that lives in user.data.
    const listed = await request(app).get('/api/config/users');
    const onDisk = (listed.body.data ?? []).find(
      (u: { username?: string }) => u.username?.toLowerCase() === username.toLowerCase()
    );
    expect(onDisk).toBeDefined();

    const updated = await request(app)
      .put(`/api/config/users/${onDisk.id}`)
      .send({ password: 'second-password' });
    expect([200, 201]).toContain(updated.status);

    // The point of the whole exercise.
    expect(await db.authenticateUser(username, 'second-password')).not.toBeNull();
    expect(await db.authenticateUser(username, 'first-password')).toBeNull();
  }, 30000);
});
