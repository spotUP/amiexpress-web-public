/**
 * Bot plugin Phase 1 - admin routes over a fixture registry.
 *
 * Mounted bare (no JWT middleware here; routes-setup owns auth). Status and
 * actions need docker, so routes tests cover list, unknown ids, and config;
 * state/actions ride on plugin-service tests with a stubbed runner.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import express from 'express';
import request from 'supertest';

process.env.PLUGIN_BOTS_DIR = path.join(__dirname, 'fixtures', 'bots');

import { createBotPluginRouter } from '../../src/api/bot-plugin-routes';

describe('bot plugin admin routes', () => {
  let app: express.Application;
  let dataDir: string;
  let savedDataDir: string | undefined;

  beforeAll(() => {
    savedDataDir = process.env.PLUGIN_DATA_DIR;
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-routes-'));
    process.env.PLUGIN_DATA_DIR = dataDir;
    app = express();
    app.use(express.json());
    app.use('/api/config/bots', createBotPluginRouter({} as any));
  });

  afterAll(() => {
    if (savedDataDir === undefined) delete process.env.PLUGIN_DATA_DIR;
    else process.env.PLUGIN_DATA_DIR = savedDataDir;
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('lists installed plugins without secrets', async () => {
    const res = await request(app).get('/api/config/bots');
    expect(res.status).toBe(200);
    expect(res.body.data.map((p: any) => p.id)).toEqual(['whip']);
    for (const field of res.body.data[0].configSchema) {
      expect(field).not.toHaveProperty('value');
    }
  });

  it('404s unknown plugin ids', async () => {
    expect((await request(app).get('/api/config/bots/nope/status')).status).toBe(404);
    expect((await request(app).get('/api/config/bots/nope/config')).status).toBe(404);
    expect((await request(app).post('/api/config/bots/nope/start')).status).toBe(404);
  });

  it('writes config and reads it back masked', async () => {
    const put = await request(app)
      .put('/api/config/bots/whip/config')
      .send({ values: { DISCORD_BOT_TOKEN: 'tok', DISCORD_GUILD_ID: 'guild' } });
    expect(put.status).toBe(200);
    expect(put.body.message).toMatch(/Restart/);
    const got = await request(app).get('/api/config/bots/whip/config');
    expect(got.body.data.find((f: any) => f.key === 'DISCORD_BOT_TOKEN')).toMatchObject({ set: true, value: '' });
    expect(got.body.data.find((f: any) => f.key === 'DISCORD_GUILD_ID')).toMatchObject({ set: true, value: 'guild' });
  });

  it('rejects config without a values object', async () => {
    expect((await request(app).put('/api/config/bots/whip/config').send({})).status).toBe(400);
  });
});
