/**
 * A locked account is visible in the admin, and the admin can unlock it.
 *
 * The report that started this: a caller failed his password, got locked
 * out, and the web admin showed no sign of it - no badge, no count, no
 * button. Lockout state lives in user.misc; GET /users never carried it
 * (fileStructsToUser dropped it) and PUT could only clear it by accident
 * (updateUserDataFile zeroed it on every write).
 *
 * Drives the real routes against a temporary board: lock the record the
 * way the password check does, read it back through GET, edit something
 * unrelated through PUT, then unlock through PUT. Raw user.misc bytes
 * confirm each step, because the bug was bytes no route touched.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import request from 'supertest';

process.env.SKIP_DB_INIT = '1';

const OFF_LOCKED = 0x94;
const OFF_ATTEMPTS = 0x95;
const MISC_REC = 248;

describe('lockout, end to end through the admin API', () => {
  let app: any;
  let db: any;
  let bbsRoot: string;
  let dbDir: string;
  let previousDataDir: string | undefined;
  let previousDbDir: string | undefined;
  let previousDbFile: string | undefined;

  beforeAll(async () => {
    previousDataDir = process.env.BBS_DATA_DIR;
    previousDbDir = process.env.DATABASE_DIR;
    previousDbFile = process.env.DATABASE_FILE;
    bbsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-lockout-'));
    dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-lockout-db-'));
    process.env.BBS_DATA_DIR = bbsRoot;
    process.env.DATABASE_DIR = dbDir;
    process.env.DATABASE_FILE = 'lockout.db';

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
    if (previousDbFile === undefined) delete process.env.DATABASE_FILE;
    else process.env.DATABASE_FILE = previousDbFile;
    fs.rmSync(bbsRoot, { recursive: true, force: true });
    fs.rmSync(dbDir, { recursive: true, force: true });
  });

  const slotOf = (id: string) => parseInt(id.replace(/^user-/, ''), 10);

  const miscByte = (slot: number, off: number) =>
    fs.readFileSync(path.join(bbsRoot, 'user.misc'))[(slot - 1) * MISC_REC + off];

  it('shows the lock, keeps it across unrelated edits, and unlocks on demand', async () => {
    const username = `locked_${Date.now()}`;
    const created = await request(app)
      .post('/api/config/users')
      .send({ username, password: 'some-password', securityLevel: 10 });
    expect([200, 201]).toContain(created.status);

    const listed = await request(app).get('/api/config/users');
    const onDisk = (listed.body.data ?? []).find(
      (u: { username?: string }) => u.username?.toLowerCase() === username.toLowerCase()
    );
    expect(onDisk).toBeDefined();
    const slot = slotOf(onDisk.id);
    expect(slot).toBeGreaterThan(0);

    // Lock it the way the password check does (express.e:1008-1016).
    /* eslint-disable @typescript-eslint/no-var-requires */
    const { userDatabaseManager } = require('../../src/services/UserDatabaseManager');
    /* eslint-enable @typescript-eslint/no-var-requires */
    expect(userDatabaseManager.recordPasswordFailure(slot, 1)).toBe(true);
    expect(miscByte(slot, OFF_LOCKED)).toBe(1);

    // GET carries the state the admin shows.
    const relisted = await request(app).get('/api/config/users');
    const shown = (relisted.body.data ?? []).find(
      (u: { username?: string }) => u.username?.toLowerCase() === username.toLowerCase()
    );
    expect(shown.accountLocked).toBe(1);

    // An unrelated edit must not disturb the lock (the old zeroing bug).
    const edited = await request(app)
      .put(`/api/config/users/${onDisk.id}`)
      .send({ location: 'uPTOWN' });
    expect([200, 201]).toContain(edited.status);
    expect(miscByte(slot, OFF_LOCKED)).toBe(1);

    // The unlock button: explicit zeroes, and only explicit zeroes.
    const unlocked = await request(app)
      .put(`/api/config/users/${onDisk.id}`)
      .send({ accountLocked: 0, invalidAttempts: 0 });
    expect([200, 201]).toContain(unlocked.status);
    expect(miscByte(slot, OFF_LOCKED)).toBe(0);
    expect(miscByte(slot, OFF_ATTEMPTS)).toBe(0);

    const after = await request(app).get('/api/config/users');
    const shownUnlocked = (after.body.data ?? []).find(
      (u: { username?: string }) => u.username?.toLowerCase() === username.toLowerCase()
    );
    expect(shownUnlocked.accountLocked).toBe(0);
  }, 30000);
});
