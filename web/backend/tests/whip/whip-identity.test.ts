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

  // Every write here names its acting BBS user (F15) AND proves it: a write
  // without a link row is refused, so these link first. The Discord name is
  // a read convenience now - what a caller may CHANGE is decided by the
  // link, not by the name.
  const IDENTITY_DISCORD = 'd-identity';
  it('sets, lists, and clears a Discord name', async () => {
    await db.linkDiscord(IDENTITY_DISCORD, bbsUserId);
    const set = await request(app).patch(`/api/whip/users/${bbsUserId}`).set(auth)
      .send({ discordName: 'spotUP', actorUserId: bbsUserId, discordId: IDENTITY_DISCORD });
    expect(set.status).toBe(200);
    expect(set.body.data).toMatchObject({ userId: bbsUserId, discordName: 'spotUP' });
    const listed = await request(app).get('/api/whip/users').set(auth);
    expect(listed.body.data.find((u: any) => u.userId === bbsUserId)).toMatchObject({ discordName: 'spotUP' });
    const cleared = await request(app).patch(`/api/whip/users/${bbsUserId}`).set(auth)
      .send({ discordName: '', actorUserId: bbsUserId, discordId: IDENTITY_DISCORD });
    expect(cleared.status).toBe(200);
    expect(cleared.body.data.discordName).toBeUndefined();
  });

  it('refuses over-long and non-string names, and unknown users', async () => {
    await db.linkDiscord(IDENTITY_DISCORD, bbsUserId);
    const proof = { actorUserId: bbsUserId, discordId: IDENTITY_DISCORD };
    expect((await request(app).patch(`/api/whip/users/${bbsUserId}`).set(auth).send({ discordName: 'x'.repeat(33), ...proof })).status).toBe(400);
    expect((await request(app).patch(`/api/whip/users/${bbsUserId}`).set(auth).send({ discordName: 42, ...proof })).status).toBe(400);
    // An id no link owns is refused as unproved before it is looked up.
    expect((await request(app).patch('/api/whip/users/no-such-user').set(auth).send({ discordName: 'x', actorUserId: 'no-such-user', discordId: IDENTITY_DISCORD })).status).toBe(403);
  });

  it('a Discord name cannot be set for a caller the writer has not linked', async () => {
    await db.linkDiscord(IDENTITY_DISCORD, bbsUserId);
    const res = await request(app)
      .patch(`/api/whip/users/${bbsUserId}`)
      .set(auth)
      .send({ discordName: 'borrowed', actorUserId: bbsUserId });
    expect(res.status).toBe(403);
  });

  /**
   * F15: PATCH /users/:id was the ONE write in whip-routes that did not go
   * through `resolveActor`. The caller named the target in the path and
   * nothing asked who was calling, so anything holding the service token
   * could rename anybody - and a `discordId` in the body, which every other
   * write checks against the link table, was not looked at here at all.
   */
  describe('the Discord name is a write, and names its actor', () => {
    it('refuses a rename that does not say who is asking', async () => {
      const res = await request(app).patch(`/api/whip/users/${bbsUserId}`).set(auth).send({ discordName: 'nobody' });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/actorUserId/);
    });

    it('refuses one user renaming another', async () => {
      const otherId = uid('wuser');
      db.db.prepare('INSERT INTO users (id, username, passwordhash, realname) VALUES (?, ?, ?, ?)')
        .run(otherId, `Other${otherId}`, 'x', 'Other');
      const res = await request(app).patch(`/api/whip/users/${bbsUserId}`).set(auth)
        .send({ discordName: 'stolen', actorUserId: otherId });
      expect(res.status).toBe(403);
      const listed = await request(app).get('/api/whip/users').set(auth);
      const victim = listed.body.data.find((u: any) => u.userId === bbsUserId);
      expect(victim?.discordName).not.toBe('stolen');
    });

    it('refuses a discordId that is not linked to the acting user', async () => {
      const res = await request(app).patch(`/api/whip/users/${bbsUserId}`).set(auth)
        .send({ discordName: 'spoofed', actorUserId: bbsUserId, discordId: 'not-linked-to-anyone' });
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/discordId/);
    });
  });
});
