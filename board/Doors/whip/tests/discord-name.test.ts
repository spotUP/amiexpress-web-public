/**
 * My Profile: the Discord name normalizes, stores, and round-trips.
 */
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { normalizeDiscordName, DISCORD_NAME_MAX } from '../ui/my-profile.js';
import { DataManager } from '../core/data-manager.js';

export async function normalizesNames(): Promise<void> {
  assert.strictEqual(normalizeDiscordName('  spotUP  '), 'spotUP');
  assert.strictEqual(normalizeDiscordName(''), '');
  assert.strictEqual(normalizeDiscordName(null), '');
  assert.strictEqual(normalizeDiscordName('x'.repeat(100)).length, DISCORD_NAME_MAX);
}

export async function discordNameRoundTrips(): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whip-profile-'));
  try {
    const dm = new DataManager(dir);
    const created = await dm.createUser('u1', 'spot');
    assert.strictEqual(created.discordName, undefined);
    const loaded = await dm.getUser('u1');
    loaded.discordName = normalizeDiscordName('spotUP');
    await dm.updateUser(loaded);
    assert.strictEqual((await dm.getUser('u1')).discordName, 'spotUP');
    const cleared = await dm.getUser('u1');
    delete cleared.discordName;
    await dm.updateUser(cleared);
    assert.strictEqual((await dm.getUser('u1')).discordName, undefined);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
