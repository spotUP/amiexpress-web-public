/**
 * Bot Phase 2 - /api/whip write routes against the REAL door dist with
 * temp-dir storage (WHIP_STORAGE_BASE). The temp board starts empty, so
 * every id is unique per run and nothing touches live WHIP files.
 *
 * Parity rule: bot writes must be indistinguishable from door writes -
 * completion awards points, checks achievements, and announces the same
 * events (captured through bbs-event-emitter, not the network).
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import express from 'express';
import request from 'supertest';

const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'whip-writes-'));
process.env.WHIP_STORAGE_BASE = storageDir;
delete process.env.WHIP_DOOR_DIST_DIR;

import { createWhipRouter } from '../../src/api/whip-routes';
import { authenticateServiceToken } from '../../src/middleware/service-auth.middleware';
import { discordLinkService } from '../../src/services/discord-link.service';
import { bbsEventEmitter } from '../../src/services/bbs-event-emitter';

process.env.WHIP_SERVICE_TOKEN = 'test-write-token';

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

const uid = (prefix: string) => `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

describe('WHIP write routes', () => {
  let app: express.Application;
  let db: any;
  let actorId: string;
  const auth = { Authorization: 'Bearer test-write-token' };
  const events: any[] = [];

  beforeAll(async () => {
    db = await waitForTestDb();
    actorId = uid('wuser');
    db.db
      .prepare('INSERT INTO users (id, username, passwordhash, realname) VALUES (?, ?, ?, ?)')
      .run(actorId, uid('Writer'), 'x', 'Writer');
    app = express();
    app.use(express.json());
    app.use('/api/whip', authenticateServiceToken, createWhipRouter(db));
    bbsEventEmitter.on('bbs:event', (payload: any) => {
      if (payload?.type === 'custom_door_event') events.push(payload);
    });
  }, 30000);

  afterAll(() => {
    bbsEventEmitter.removeAllListeners('bbs:event');
    fs.rmSync(storageDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    events.length = 0;
  });

  const actor = (extra: any = {}) => ({ actorUserId: actorId, ...extra });

  it('creates a project and bumps projectsCreated', async () => {
    const res = await request(app)
      .post('/api/whip/projects')
      .set(auth)
      .send({ ...actor(), name: 'Write Test Demo', type: 'demo' });
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBeTruthy();
    expect(events.map((e) => e.data.eventType)).toContain('project_created');
  });

  it('rejects bad project input and unknown actors', async () => {
    expect((await request(app).post('/api/whip/projects').set(auth).send(actor({ name: '' }))).status).toBe(400);
    expect((await request(app).post('/api/whip/projects').set(auth).send(actor({ name: 'x', type: 'nope' }))).status).toBe(
      400
    );
    expect(
      (await request(app).post('/api/whip/projects').set(auth).send({ actorUserId: 'ghost', name: 'x', type: 'demo' }))
        .status
    ).toBe(404);
    expect(
      (await request(app).post('/api/whip/projects').set(auth).send({ name: 'x', type: 'demo' })).status
    ).toBe(400);
  });

  it('refuses a discordId linked to somebody else', async () => {
    await db.linkDiscord('d-write', actorId);
    const bad = await request(app)
      .post('/api/whip/projects')
      .set(auth)
      .send({ actorUserId: 'someone-else', discordId: 'd-write', name: 'x', type: 'demo' });
    expect(bad.status).toBe(403);
    await db.unlinkDiscordByDiscordId('d-write');
  });

  it('full task lifecycle: create, move, complete with points and events', async () => {
    const project = (
      await request(app).post('/api/whip/projects').set(auth).send({ ...actor(), name: 'Lifecycle', type: 'demo' })
    ).body.data;

    const created = await request(app)
      .post('/api/whip/tasks')
      .set(auth)
      .send({ ...actor(), projectId: project.id, title: 'Write the task', category: 'code', points: 25 });
    expect(created.status).toBe(200);
    const taskId = created.body.data.id;
    expect(events.map((e) => e.data.eventType)).toContain('task_created');

    const moved = await request(app)
      .post(`/api/whip/tasks/${taskId}/move`)
      .set(auth)
      .send({ ...actor(), status: 'in-progress' });
    expect(moved.status).toBe(200);
    expect(moved.body.data.task.status).toBe('in-progress');
    expect(events.map((e) => e.data.eventType)).toContain('task_moved');

    const done = await request(app)
      .post(`/api/whip/tasks/${taskId}/move`)
      .set(auth)
      .send({ ...actor(), status: 'done' });
    expect(done.status).toBe(200);
    expect(done.body.data.task.completedAt).toBeTruthy();
    // First completion unlocks first-release (+10); the project created
    // above makes project-starter (+10) reachable too - it never fired
    // before projectsCreated was incremented.
    expect(done.body.data.unlocked).toContain('first-release');
    expect(done.body.data.unlocked).toContain('project-starter');
    const types = events.map((e) => e.data.eventType);
    expect(types).toContain('task_completed');
    expect(types).toContain('achievement_unlocked');

    const completedEvent = events.find((e) => e.data.eventType === 'task_completed');
    expect(completedEvent.data.message).toContain('Write the task');
    expect(completedEvent.data.message).toContain('+25 pts');
    expect(completedEvent.username).toBeTruthy();
    // Door namespace identical to door-side emissions.
    expect(completedEvent.data.doorName).toBe('WHIP');

    const board = await request(app).get('/api/whip/leaderboard').set(auth);
    const me = board.body.data.find((e: any) => e.userId === actorId);
    expect(me.points).toBe(45); // 25 task + 10 first-release + 10 project-starter
    expect(me.tasksCompleted).toBe(1);
  });

  it('edits and deletes tasks and projects', async () => {
    const project = (
      await request(app).post('/api/whip/projects').set(auth).send({ ...actor(), name: 'Ephemeral', type: 'demo' })
    ).body.data;
    const task = (
      await request(app).post('/api/whip/tasks').set(auth).send({ ...actor(), projectId: project.id, title: 'Temp' })
    ).body.data;

    const edited = await request(app)
      .patch(`/api/whip/tasks/${task.id}`)
      .set(auth)
      .send({ ...actor(), title: 'Temp Renamed', priority: 'elite' });
    expect(edited.status).toBe(200);
    expect(edited.body.data.title).toBe('Temp Renamed');

    expect((await request(app).patch(`/api/whip/tasks/${task.id}`).set(auth).send({ ...actor(), priority: 'nope' })).status).toBe(
      400
    );
    expect((await request(app).delete(`/api/whip/tasks/ghost`).set(auth).send(actor())).status).toBe(404);

    expect((await request(app).delete(`/api/whip/tasks/${task.id}`).set(auth).send(actor())).status).toBe(200);
    expect(events.map((e) => e.data.eventType)).toContain('task_deleted');
    expect((await request(app).delete(`/api/whip/projects/${project.id}`).set(auth).send(actor())).status).toBe(200);
    expect(events.map((e) => e.data.eventType)).toContain('project_deleted');
  });

  it('linking provisions WHIP stats so reads never say Unknown user', async () => {
    const freshId = uid('fresh');
    db.db
      .prepare('INSERT INTO users (id, username, passwordhash, realname) VALUES (?, ?, ?, ?)')
      .run(freshId, uid('Fresh'), 'x', 'Fresh');
    const { code } = discordLinkService.issueCode(freshId, 'Fresh');
    const linked = await request(app).post('/api/whip/link').set(auth).send({ code, discordId: 'd-fresh' });
    expect(linked.status).toBe(200);
    const ach = await request(app).get(`/api/whip/achievements/${freshId}`).set(auth);
    expect(ach.status).toBe(200);
    expect(ach.body.data.handle).toBe('Fresh');
  });

  it('lists users for assign selects', async () => {    // ensureWhipUser creates stats on first write, so the actor exists.
    await request(app).post('/api/whip/projects').set(auth).send({ ...actor(), name: 'Roster', type: 'demo' });
    const res = await request(app).get('/api/whip/users').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.data.find((u: any) => u.userId === actorId)).toBeTruthy();
  });
});
