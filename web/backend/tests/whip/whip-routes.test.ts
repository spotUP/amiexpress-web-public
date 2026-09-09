/**
 * Phase 1 - /api/whip/* behind the service token.
 *
 * Reads run through WhipService against a fixture door tree
 * (WHIP_DOOR_DIST_DIR), link verification spends real LINKDISCORD codes
 * into the isolated testDb. Nothing touches board files or live data.
 */
import * as path from 'path';
import express from 'express';
import request from 'supertest';

process.env.WHIP_DOOR_DIST_DIR = path.join(__dirname, 'fixtures', 'doors', 'whip', 'dist');
process.env.WHIP_SERVICE_TOKEN = 'test-service-token';

import { createWhipRouter } from '../../src/api/whip-routes';
import { authenticateServiceToken } from '../../src/middleware/service-auth.middleware';
import { discordLinkService } from '../../src/services/discord-link.service';

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

describe('WHIP bot routes', () => {
  let app: express.Application;
  let db: any;
  const auth = { Authorization: 'Bearer test-service-token' };

  beforeAll(async () => {
    db = await waitForTestDb();
    app = express();
    app.use(express.json());
    app.use('/api/whip', authenticateServiceToken, createWhipRouter(db));
  }, 30000);

  beforeEach(async () => {
    await db.db.exec('DELETE FROM user_discord_links');
  });

  it('refuses requests without the service token', async () => {
    const res = await request(app).get('/api/whip/projects');
    expect(res.status).toBe(401);
  });

  it('lists projects with task counts', async () => {
    const res = await request(app).get('/api/whip/projects').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const p1 = res.body.data.find((p: any) => p.id === 'p1');
    expect(p1).toMatchObject({ name: 'Desert Dream', taskCounts: { total: 2, done: 1 } });
  });

  it('lists tasks per project and per user', async () => {
    const byProject = await request(app).get('/api/whip/tasks').query({ projectId: 'p1' }).set(auth);
    expect(byProject.body.data.map((t: any) => t.id).sort()).toEqual(['t1', 't2']);
    const byUser = await request(app).get('/api/whip/my-tasks').query({ userId: 'u1' }).set(auth);
    expect(byUser.body.data.handle).toBe('spot');
    expect(byUser.body.data.tasks.map((t: any) => t.id).sort()).toEqual(['t1', 't3']);
  });

  it('requires query parameters', async () => {
    expect((await request(app).get('/api/whip/tasks').set(auth)).status).toBe(400);
    expect((await request(app).get('/api/whip/my-tasks').set(auth)).status).toBe(400);
  });

  it('serves the leaderboard ranked by points', async () => {
    const res = await request(app).get('/api/whip/leaderboard').set(auth);
    expect(res.body.data.map((e: any) => e.handle)).toEqual(['spot', 'ace']);
    expect(res.body.data[0]).toMatchObject({ rank: 1, points: 120 });
  });

  it('splits achievements into unlocked and locked', async () => {
    const res = await request(app).get('/api/whip/achievements/u1').set(auth);
    expect(res.body.data.handle).toBe('spot');
    expect(res.body.data.unlocked.map((a: any) => a.id)).toEqual(['first-release']);
    expect(res.body.data.locked.map((a: any) => a.id)).toEqual(['getting-started']);
    expect(res.body.data.totalPoints).toBe(10);
    expect((await request(app).get('/api/whip/achievements/nobody').set(auth)).status).toBe(404);
  });

  it('lists parties', async () => {
    const res = await request(app).get('/api/whip/parties').set(auth);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ id: 'revision-2026' });
  });

  it('serves all tasks with project names for autocomplete', async () => {
    const res = await request(app).get('/api/whip/tasks/all').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.data.find((t: any) => t.id === 't1')).toMatchObject({
      title: 'Fix the scroller',
      projectName: 'Desert Dream',
    });
  });

  it('serves one task and 404s ghosts', async () => {    const res = await request(app).get('/api/whip/tasks/t1').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Fix the scroller');
    expect((await request(app).get('/api/whip/tasks/ghost').set(auth)).status).toBe(404);
  });

  it('verifies a link code once, then reports the link', async () => {
    const { code } = discordLinkService.issueCode('u9', 'tester');
    const first = await request(app).post('/api/whip/link').set(auth).send({ code, discordId: 'd9' });
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({ userId: 'u9', username: 'tester' });

    const spent = await request(app).post('/api/whip/link').set(auth).send({ code, discordId: 'd8' });
    expect(spent.status).toBe(404);

    const status = await request(app).get('/api/whip/link-status').query({ discordId: 'd9' }).set(auth);
    expect(status.body.data).toMatchObject({ userId: 'u9' });
    expect((await request(app).get('/api/whip/link-status').query({ discordId: 'ghost' }).set(auth)).status).toBe(404);
  });

  it('rejects bad link payloads', async () => {
    expect((await request(app).post('/api/whip/link').set(auth).send({})).status).toBe(400);
    expect((await request(app).post('/api/whip/link').set(auth).send({ code: 'NOPE1234', discordId: 'd1' })).status).toBe(404);
  });
});
