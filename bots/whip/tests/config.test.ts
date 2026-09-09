/**
 * Bot config loads from env and fails loudly when required vars are absent.
 */
import assert from 'assert';
import { loadConfig } from '../src/config';

const full = {
  DISCORD_BOT_TOKEN: 'tok',
  DISCORD_GUILD_ID: 'guild',
  WHIP_API_URL: 'http://bbs:3001',
  WHIP_SERVICE_TOKEN: 'svc',
};

export async function loadsFullConfig(): Promise<void> {
  const cfg = loadConfig({ ...full });
  assert.strictEqual(cfg.botToken, 'tok');
  assert.strictEqual(cfg.guildId, 'guild');
  assert.strictEqual(cfg.apiUrl, 'http://bbs:3001');
  assert.strictEqual(cfg.serviceToken, 'svc');
}

export async function defaultsApiUrl(): Promise<void> {
  const { WHIP_API_URL: _drop, ...rest } = full;
  void _drop;
  assert.strictEqual(loadConfig({ ...rest }).apiUrl, 'http://localhost:3001');
}

export async function defaultsHealthPort(): Promise<void> {
  assert.strictEqual(loadConfig({ ...full }).healthPort, 3099);
  assert.strictEqual(loadConfig({ ...full, HEALTH_PORT: '1234' }).healthPort, 1234);
}

export async function missingVarThrows(): Promise<void> {
  for (const name of ['DISCORD_BOT_TOKEN', 'DISCORD_GUILD_ID', 'WHIP_SERVICE_TOKEN']) {
    const env = { ...full };
    delete (env as any)[name];
    assert.throws(() => loadConfig(env), new RegExp(name), `${name} must be required`);
  }
}
