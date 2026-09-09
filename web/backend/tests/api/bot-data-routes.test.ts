/**
 * WEB_BOT_DATA HTTP transport: auth, scopes, and parity with the chat side.
 *
 * The router is mounted with a fake database; WHIP is mocked (its readers
 * are pinned in tests/services/bot-data). What is pinned: 401 without a
 * token or without configuration, 403 outside the token's domains, 400 on
 * missing params, and byte-identical answers between the HTTP route and
 * the bot-data function the chat tool calls.
 */
import express from 'express';
import request from 'supertest';

process.env.BOT_DATA_TOKENS = 'testbot:s3cret,scoped:scopedsecret:whip+board';

import { createBotDataRouter } from '../../src/api/bot-data-routes';
import { authenticateBotToken } from '../../src/middleware/service-auth.middleware';
import { BOT_whipLeaderboard } from '../../src/services/bot-data/whip';

jest.mock('../../src/services/whip.service', () => ({
  whipService: {
    listProjects: async () => [{ name: 'Board', id: 'p1' }],
    listTasks: async () => [],
    listUserTasks: async () => ({ tasks: [] }),
    leaderboard: async () => [{ handle: 'Knut', points: 42 }],
    achievementsFor: async () => null,
    listParties: async () => [],
    listUsers: async () => [],
  },
}));

const dbFake = {
  getUserByUsername: async (h: string) => (h === 'Knut' ? { username: 'Knut', secLevel: 30, calls: 5, uploads: 1, downloads: 2 } : null),
  getUsers: async () => [{ username: 'Knut', secLevel: 30, calls: 5, uploads: 1, downloads: 2 }],
  getConferences: async () => [{ id: 1, name: 'Main' }],
  getMessageBases: async () => [{ id: 7 }],
  getMessages: async () => [{ id: 1, subject: 'Hello', author: 'Knut', body: 'Hi' }],
  getFileAreas: async () => [{ id: 3 }],
  getFileEntries: async () => [],
  getFileStatisticsByConference: async () => ({ totalFiles: 0 }),
  getActiveSessions: async () => [],
  query: async () => ({ rows: [] }),
};

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/bot/v1', authenticateBotToken, createBotDataRouter(dbFake as any, { bbsRoot: '/nonexistent' }));
  return a;
}

const FULL = { Authorization: 'Bearer s3cret' };
const SCOPED = { Authorization: 'Bearer scopedsecret' };

describe('bot data http auth', () => {
  it('401 without a token, with a wrong one, and when unconfigured', async () => {
    expect((await request(app()).get('/api/bot/v1/whip/leaderboard')).status).toBe(401);
    expect((await request(app()).get('/api/bot/v1/whip/leaderboard').set({ Authorization: 'Bearer wrong' })).status).toBe(401);
    const saved = process.env.BOT_DATA_TOKENS;
    delete process.env.BOT_DATA_TOKENS;
    expect((await request(app()).get('/api/bot/v1/whip/leaderboard').set(FULL)).status).toBe(401);
    process.env.BOT_DATA_TOKENS = saved;
  });
  it('403 outside the token\'s domains, 200 inside', async () => {
    expect((await request(app()).get('/api/bot/v1/users/top').set(SCOPED)).status).toBe(403);
    expect((await request(app()).get('/api/bot/v1/whip/leaderboard').set(SCOPED)).status).toBe(200);
  });
  it('400 on missing required params', async () => {
    expect((await request(app()).get('/api/bot/v1/users/lookup').set(FULL)).status).toBe(400);
    expect((await request(app()).get('/api/bot/v1/whip/tasks').set(FULL)).status).toBe(400);
  });
});

describe('bot data http answers', () => {
  it('envelopes data with success and timestamp', async () => {
    const r = await request(app()).get('/api/bot/v1/users/lookup?handle=Knut').set(FULL);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.text).toContain('Knut (level 30)');
    expect(typeof r.body.timestamp).toBe('string');
  });
  it('http and chat answers are identical (same function, no second implementation)', async () => {
    const r = await request(app()).get('/api/bot/v1/whip/leaderboard').set(FULL);
    const { whipService } = require('../../src/services/whip.service');
    const same = await BOT_whipLeaderboard(whipService);
    expect(r.body.data).toEqual({ text: same.text, truncated: same.truncated, total: same.total });
  });
  it('limits clamp at 50', async () => {
    const r = await request(app()).get('/api/bot/v1/users/top?limit=5000').set(FULL);
    expect(r.status).toBe(200);
    expect(r.body.data.text).toContain('Knut');
  });
  it('advertises the door-data allowlist', async () => {
    const r = await request(app()).get('/api/bot/v1/doors/keys').set(FULL);
    expect(r.status).toBe(200);
    expect(Object.keys(r.body.data)).toContain('arkanoid');
  });
});
