/**
 * WEB_WHID identity: handle resolution and the door-set Discord name.
 *
 * Reads run through WhipService against temp-dir storage
 * (WHIP_STORAGE_BASE); BBS users live in the isolated testDb. Nothing
 * touches board files or live data.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import express from 'express';
import request from 'supertest';

const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'whip-identity-'));
process.env.WHIP_STORAGE_BASE = storageDir;
delete process.env.WHIP_DOOR_DIST_DIR;
process.env.WHIP_SERVICE_TOKEN = 'test-identity-token';

import { createWhipRouter } from '../../src/api/whip-routes';
import { authenticateServiceToken } from '../../src/middleware/service-auth.middleware';

async function waitForTestDb(): Promise<any> {
  let attempts = 0;
  while (!(global as any).testDb && attempts < 30) {
    await new Promise((r) => setTimeout(r, 500));
    attempts++;
  }
  const db = (global as any).testDb;
  if (!db) throw new Error('Test database not initialized');
  return db;
}

const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;

describe('WHIP identity', () => {
  let app: express.Application;
  let db: any;
  let bbsUserId: string;
  const auth = { Authorization: 'Bearer test-identity-token' };

  beforeAll(async () => {
    db = await waitForTestDb();
    bbsUserId = uid('wuser');
    db.db
      .prepare('INSERT INTO users (id, username, passwordhash, realname) VALUES (?, ?, ?, ?)')
      .run(bbsUserId, 'SpotUP', 'x', 'Spot');
    app = express();
    app.use(express.json());
    app.use('/api/whip', authenticateServiceToken, createWhipRouter(db));
  }, 30000);

  afterAll(() => {
    fs.rmSync(storageDir, { recursive: true, force: true });
  });

  it('resolves a BBS handle case-insensitively and ensures WHIP stats', async () => {
    const res = await request(app).get('/api/whip/resolve').query({ handle: 'spotup' }).set(auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ userId: bbsUserId, username: 'SpotUP' });
    const users = await request(app).get('/api/whip/users').set(auth);
    expect(users.body.data.map((u: any) => u.userId)).toContain(bbsUserId);
  });

  it('404s unknown handles, 400s a missing one', async () => {
    expect((await request(app).get('/api/whip/resolve').query({ handle: 'nobody-here' }).set(auth)).status).toBe(404);
    expect((await request(app).get('/api/whip/resolve').set(auth)).status).toBe(400);
  });

  it('sets, lists, and clears a Discord name', async () => {
    const set = await request(app).patch(`/api/whip/users/${bbsUserId}`).set(auth).send({ discordName: 'spotUP' });
    expect(set.status).toBe(200);
    expect(set.body.data).toMatchObject({ userId: bbsUserId, discordName: 'spotUP' });
    const listed = await request(app).get('/api/whip/users').set(auth);
    expect(listed.body.data.find((u: any) => u.userId === bbsUserId)).toMatchObject({ discordName: 'spotUP' });
    const cleared = await request(app).patch(`/api/whip/users/${bbsUserId}`).set(auth).send({ discordName: '' });
    expect(cleared.status).toBe(200);
    expect(cleared.body.data.discordName).toBeUndefined();
  });

  it('refuses over-long and non-string names, and unknown users', async () => {
    expect((await request(app).patch(`/api/whip/users/${bbsUserId}`).set(auth).send({ discordName: 'x'.repeat(33) })).status).toBe(400);
    expect((await request(app).patch(`/api/whip/users/${bbsUserId}`).set(auth).send({ discordName: 42 })).status).toBe(400);
    expect((await request(app).patch('/api/whip/users/no-such-user').set(auth).send({ discordName: 'x' })).status).toBe(404);
  });
});
