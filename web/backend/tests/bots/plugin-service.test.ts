/**
 * Bot plugin Phase 1 - registry, state, logs, config.
 *
 * Manifests come from a fixture bots/ tree (PLUGIN_BOTS_DIR), compose from
 * a stub runner, config from a temp data dir (PLUGIN_DATA_DIR). Docker is
 * never touched.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

process.env.PLUGIN_BOTS_DIR = path.join(__dirname, 'fixtures', 'bots');

import {
  getPlugin,
  listPlugins,
  pluginAction,
  pluginLogs,
  pluginState,
  readPluginConfig,
  writePluginConfig,
  type ComposeRunner,
  type PluginManifest,
} from '../../src/services/plugin.service';

const manifest: PluginManifest = {
  id: 'whip',
  name: 'WHIP Discord mirror',
  version: '0.2.0',
  description: 'x',
  composeService: 'whip-bot',
  healthPort: 3099,
  healthPath: '/health',
  nav: { path: 'bots/whip', label: 'WHIP Bot', icon: 'bot', minLevel: 255 },
  configSchema: [
    { key: 'DISCORD_BOT_TOKEN', label: 'Bot token', secret: true },
    { key: 'DISCORD_GUILD_ID', label: 'Guild ID' },
  ],
};

function stubRunner(responses: Record<string, { exitCode: number | null; stdout: string; stderr: string }>): ComposeRunner {
  return async (args) => {
    const key = args[0];
    return responses[key] ?? { exitCode: 1, stdout: '', stderr: 'no stub' };
  };
}

describe('plugin registry', () => {
  it('lists valid manifests and skips broken ones and bare dirs', () => {
    const ids = listPlugins().map((p) => p.id);
    expect(ids).toEqual(['whip']);
  });

  it('rejects unknown ids and malformed ids', () => {
    expect(getPlugin('nope')).toBeNull();
    expect(getPlugin('../../etc')).toBeNull();
    expect(getPlugin('')).toBeNull();
  });
});

describe('plugin state', () => {
  it('reports running when a container runs', async () => {
    const run = stubRunner({
      version: { exitCode: 0, stdout: '2.0\n', stderr: '' },
      ps: { exitCode: 0, stdout: '{"Service":"whip-bot","State":"running"}\n', stderr: '' },
    });
    // compose file check reads the real tree; the fixture root carries one.
    const saved = process.env.BBS_DATA_DIR;
    process.env.BBS_DATA_DIR = path.join(__dirname, 'fixtures', 'with-compose');
    try {
      expect(await pluginState(manifest, run)).toMatchObject({ state: 'running' });
    } finally {
      if (saved === undefined) delete process.env.BBS_DATA_DIR;
      else process.env.BBS_DATA_DIR = saved;
    }
  });

  it('reports stopped with no containers and unknown on ps failure', async () => {
    const empty = stubRunner({
      version: { exitCode: 0, stdout: '2.0\n', stderr: '' },
      ps: { exitCode: 0, stdout: '\n', stderr: '' },
    });
    const failing = stubRunner({
      version: { exitCode: 0, stdout: '2.0\n', stderr: '' },
      ps: { exitCode: 1, stdout: '', stderr: 'boom' },
    });
    const saved = process.env.BBS_DATA_DIR;
    process.env.BBS_DATA_DIR = path.join(__dirname, 'fixtures', 'with-compose');
    try {
      expect(await pluginState(manifest, empty)).toMatchObject({ state: 'stopped' });
      expect(await pluginState(manifest, failing)).toMatchObject({ state: 'unknown' });
    } finally {
      if (saved === undefined) delete process.env.BBS_DATA_DIR;
      else process.env.BBS_DATA_DIR = saved;
    }
  });

  it('reports unmanaged without compose', async () => {
    const run = stubRunner({ version: { exitCode: 1, stdout: '', stderr: 'no docker' }, ps: { exitCode: 0, stdout: '', stderr: '' } });
    expect(await pluginState(manifest, run)).toMatchObject({ state: 'unmanaged' });
    expect(await pluginAction(manifest, 'start', run)).toMatchObject({ ok: false });
  });
});

describe('plugin actions and logs', () => {
  it('passes start/stop/restart through and reports failure text', async () => {
    const seen: string[][] = [];
    const run: ComposeRunner = async (args) => {
      seen.push(args);
      return { exitCode: 0, stdout: 'ok', stderr: '' };
    };
    const saved = process.env.BBS_DATA_DIR;
    process.env.BBS_DATA_DIR = path.join(__dirname, 'fixtures', 'with-compose');
    try {
      expect(await pluginAction(manifest, 'restart', run)).toMatchObject({ ok: true });
    } finally {
      if (saved === undefined) delete process.env.BBS_DATA_DIR;
      else process.env.BBS_DATA_DIR = saved;
    }
    expect(seen[seen.length - 1]).toEqual(['restart', 'whip-bot']);

    const failing: ComposeRunner = async () => ({ exitCode: 1, stdout: '', stderr: 'no such service' });
    const res = await pluginAction(manifest, 'stop', failing);
    // composeAvailable runs first with the same stub: version key missing
    // means unmanaged, which is also a refusal, not a crash.
    expect(res.ok).toBe(false);
    expect(typeof res.message).toBe('string');
  });

  it('tails and searches logs', async () => {
    const run = stubRunner({
      logs: { exitCode: 0, stdout: 'ready\nfeed started\nfeed error\n', stderr: '' },
    });
    const all = await pluginLogs(manifest, 200, undefined, run);
    expect(all.totalShown).toBe(3);
    const hit = await pluginLogs(manifest, 200, 'feed', run);
    expect(hit.lines).toEqual(['feed started', 'feed error']);
  });
});

describe('plugin config', () => {
  it('round-trips values, masks secrets on read', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-config-'));
    const saved = process.env.PLUGIN_DATA_DIR;
    process.env.PLUGIN_DATA_DIR = dir;
    try {
      writePluginConfig(manifest, { DISCORD_BOT_TOKEN: 'tok', DISCORD_GUILD_ID: 'guild', EXTRA: 'dropped' });
      const file = path.join(dir, 'whip.env');
      expect(fs.readFileSync(file, 'utf8')).toContain('DISCORD_BOT_TOKEN=tok');
      expect(fs.readFileSync(file, 'utf8')).not.toContain('EXTRA');
      const mode = fs.statSync(file).mode & 0o777;
      expect(mode).toBe(0o600);
      const read = readPluginConfig(manifest);
      expect(read.find((f) => f.key === 'DISCORD_BOT_TOKEN')).toMatchObject({ set: true, value: '' });
      expect(read.find((f) => f.key === 'DISCORD_GUILD_ID')).toMatchObject({ set: true, value: 'guild' });
    } finally {
      if (saved === undefined) delete process.env.PLUGIN_DATA_DIR;
      else process.env.PLUGIN_DATA_DIR = saved;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
