/**
 * An admin rename renames the account the board logs in with.
 *
 * PUT /api/config/users/user-N wrote the new name to user.data first, then
 * looked the database row up by the NEW name - which no row had yet - so the
 * row kept the old name: the old name still logged in, the new one did not,
 * and the next save from the row wrote the old name back over the disk.
 * The row is found by the account's slot, which a rename does not change.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import request from 'supertest';

describe('PUT /api/config/users/:id with a new username', () => {
  let app: any;
  let db: any;
  let userFileManager: any;
  let bbsRoot: string;
  let dbDir: string;
  let previousDataDir: string | undefined;
  let previousDbDir: string | undefined;

  beforeAll(async () => {
    previousDataDir = process.env.BBS_DATA_DIR;
    previousDbDir = process.env.DATABASE_DIR;
    bbsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-rename-'));
    dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-rename-db-'));
    process.env.BBS_DATA_DIR = bbsRoot;
    process.env.DATABASE_DIR = dbDir;
    process.env.DATABASE_FILE = 'rename.db';

    jest.resetModules();
    /* eslint-disable @typescript-eslint/no-var-requires */
    const express = require('express');
    const { Database } = require('../../src/database');
    const { createConfigRouter } = require('../../src/api/config-routes');
    userFileManager = require('../../src/services/UserFileManager').userFileManager;
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

  it('renames the row: the new name logs in, the old one does not, and the disk keeps the new name', async () => {
    const oldName = `before_${Date.now() % 100000}`;
    const newName = `after_${Date.now() % 100000}`;

    const created = await request(app)
      .post('/api/config/users')
      .send({ username: oldName, password: 'the-password', securityLevel: 10 });
    expect([200, 201]).toContain(created.status);

    const listed = await request(app).get('/api/config/users');
    const onDisk = (listed.body.data ?? []).find(
      (u: { username?: string }) => u.username?.toLowerCase() === oldName.toLowerCase()
    );
    expect(onDisk).toBeDefined();
    const slot = Number(String(onDisk.id).replace('user-', ''));

    const updated = await request(app).put(`/api/config/users/${onDisk.id}`).send({ username: newName });
    expect([200, 201]).toContain(updated.status);

    expect(await db.authenticateUser(newName, 'the-password')).not.toBeNull();
    expect(await db.authenticateUser(oldName, 'the-password')).toBeNull();
    expect(await db.getUserByUsername(newName)).not.toBeNull();
    expect(await db.getUserByUsername(oldName)).toBeNull();

    // The next save from the row - any edit of anything else - keeps the new name.
    const again = await request(app).put(`/api/config/users/${onDisk.id}`).send({ location: 'Gothenburg' });
    expect([200, 201]).toContain(again.status);
    expect(userFileManager.readUserBySlot(slot)?.username).toBe(newName);
  }, 30000);
});
