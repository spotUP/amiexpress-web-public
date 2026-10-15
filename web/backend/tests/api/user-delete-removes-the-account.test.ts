/**
 * Deleting a user in the admin takes their login with them.
 *
 * A user exists in two stores. The admin lists users from disk, so deleting
 * one zeroed the user.data slot and left the SQLite row - and
 * db.authenticateUser reads the row. The account vanished from the board's
 * user list and went on logging in, which is the worst possible split of the
 * two: gone where a sysop looks, present where the door checks.
 *
 * The other direction leaves a user.data record nothing owns, which keeps the
 * account on the board's own lists and makes the next account land in the slot
 * after it.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import request from 'supertest';

describe('DELETE /api/config/users/:id', () => {
  let app: any;
  let db: any;
  let bbsRoot: string;
  let dbDir: string;
  let previousDataDir: string | undefined;
  let previousDbDir: string | undefined;

  beforeAll(async () => {
    previousDataDir = process.env.BBS_DATA_DIR;
    previousDbDir = process.env.DATABASE_DIR;
    bbsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-del-'));
    dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-del-db-'));
    process.env.BBS_DATA_DIR = bbsRoot;
    process.env.DATABASE_DIR = dbDir;
    process.env.DATABASE_FILE = 'user-delete.db';

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

  async function createUser(username: string) {
    const res = await request(app)
      .post('/api/config/users')
      .send({ username, password: 'a-password', securityLevel: 10 });
    expect([200, 201]).toContain(res.status);
    return res.body.data;
  }

  it('a user deleted by their disk id can no longer log in', async () => {
    const username = `del_${Date.now()}`;
    await createUser(username);
    expect(await db.authenticateUser(username, 'a-password')).not.toBeNull();

    const listed = await request(app).get('/api/config/users');
    const onDisk = (listed.body.data ?? []).find(
      (u: { username?: string }) => u.username?.toLowerCase() === username.toLowerCase()
    );
    expect(onDisk?.id).toMatch(/^user-\d+$/);

    const deleted = await request(app).delete(`/api/config/users/${onDisk.id}`);
    expect(deleted.status).toBe(200);

    // The whole point: the store that authenticates no longer knows them.
    expect(await db.authenticateUser(username, 'a-password')).toBeNull();
    expect(await db.getUserByUsername(username)).toBeNull();
  }, 30000);

  it('a user deleted by their database id leaves no record on disk', async () => {
    const username = `deldb_${Date.now()}`;
    const created = await createUser(username);

    const deleted = await request(app).delete(`/api/config/users/${created.id}`);
    expect(deleted.status).toBe(200);

    expect(await db.getUserByUsername(username)).toBeNull();

    const listed = await request(app).get('/api/config/users');
    const stillOnDisk = (listed.body.data ?? []).find(
      (u: { username?: string }) => u.username?.toLowerCase() === username.toLowerCase()
    );
    expect(stillOnDisk).toBeUndefined();
  }, 30000);
});
