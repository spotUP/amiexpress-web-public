/**
 * Changing a user's conference access in the admin actually changes it.
 *
 * The form has offered the field since 19dd8acf6, creating an account sets it
 * (from `new_user_conf_access`), and UserFileManager persists it as the
 * struct's `conferenceAccess` - so it was real everywhere except the one place
 * a sysop changes it. `PUT /users/:id` never copied `confAccess` onto the
 * record, so an edit did nothing and the form then showed the OLD value back,
 * because that is what the record still said. Silent, and indistinguishable
 * from "the board decided otherwise".
 *
 * tests/services/users-acs-write-contract caught it by comparing what the form
 * can send against what the route copies - but that comparison reads SOURCE
 * TEXT, so it proves the line exists and not that the value lands. This drives
 * the real routes against a temporary board and reads the value back, which is
 * the claim that matters.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import request from 'supertest';

process.env.SKIP_DB_INIT = '1';

describe('conference access, end to end through the admin API', () => {
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
    bbsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-confaccess-'));
    dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-confaccess-db-'));
    process.env.BBS_DATA_DIR = bbsRoot;
    process.env.DATABASE_DIR = dbDir;
    process.env.DATABASE_FILE = 'confaccess.db';

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

  const findUser = async (username: string) => {
    const listed = await request(app).get('/api/config/users');
    return (listed.body.data ?? []).find(
      (u: { username?: string }) => u.username?.toLowerCase() === username.toLowerCase(),
    );
  };

  it('saves a changed access area, and shows the new one back', async () => {
    const username = `confacc_${Date.now()}`;
    const created = await request(app)
      .post('/api/config/users')
      .send({ username, password: 'some-password', securityLevel: 10 });
    expect([200, 201]).toContain(created.status);

    const before = await findUser(username);
    expect(before).toBeDefined();
    // Whatever a fresh account is given - a board with no Access/ of its own
    // defaults it - is not the point. The point is that changing it sticks.
    const original = before.confAccess;

    const edited = await request(app)
      .put(`/api/config/users/${before.id}`)
      .send({ confAccess: 'Member' });
    expect(edited.status).toBe(200);

    // Read it back off the board, not out of the response.
    const after = await findUser(username);
    expect(after.confAccess).toBe('Member');
    expect(after.confAccess).not.toBe(original);
  });

  it('leaves it alone when the edit does not mention it', async () => {
    const username = `confkeep_${Date.now()}`;
    await request(app)
      .post('/api/config/users')
      .send({ username, password: 'some-password', securityLevel: 10 });

    const before = await findUser(username);
    await request(app).put(`/api/config/users/${before.id}`).send({ confAccess: 'Member' });
    await request(app).put(`/api/config/users/${before.id}`).send({ location: 'uPTOWN' });

    const after = await findUser(username);
    expect(after.confAccess).toBe('Member');
  });
});
