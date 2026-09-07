/**
 * SP2-10 - the webhook trigger and the tier filter.
 */
import { WebhookRepository } from '../../src/database/webhook-repository';
import { WebhookTrigger } from '../../src/services/webhook.service';
import { fireUnlockWebhook } from '../../src/achievements/flusher';
import type { UnlockOut } from '../../src/achievements/contract';

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

let raw: any;
let repo: WebhookRepository;
const unlock: UnlockOut = { id: 'msg.post.100', name: 'Century', tier: 'silver', points: 10, hidden: false, rarityPctTenths: 81, at: '2026-09-07T10:00:00Z' };

beforeAll(async () => {
  raw = (await waitForTestDb()).db;
  repo = new WebhookRepository(raw);
}, 30000);

beforeEach(() => raw.exec('DELETE FROM webhooks'));

describe('achievement_unlocked', () => {
  it('an unlock fires achievement_unlocked with the handle-free payload', async () => {
    const sent: { trigger: string; data: Record<string, unknown> }[] = [];
    fireUnlockWebhook({ id: 'u-alice', username: 'alice', gdprConsentAt: 1700000000 }, unlock, async (trigger, data) => { sent.push({ trigger, data }); });
    expect(WebhookTrigger.ACHIEVEMENT_UNLOCKED).toBe('achievement_unlocked');
    expect(sent).toEqual([{ trigger: 'achievement_unlocked', data: { username: 'alice', userId: 'u-alice', gdprConsented: true, achievementId: 'msg.post.100', name: 'Century', tier: 'silver', points: 10 } }]);
    expect(JSON.stringify(sent)).not.toContain('@');
    // A refusing sender is one WARN, never a throw.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    fireUnlockWebhook({ id: 'u', username: 'u', gdprConsentAt: null }, unlock, async () => { throw new Error('discord down'); });
    await new Promise((r) => setTimeout(r, 5));
    expect(warn.mock.calls[0][0]).toContain('discord down');
    warn.mockRestore();
  });

  it('a webhook filtered to gold does not fire for a bronze unlock, and an empty filter fires for every tier', async () => {
    const gold = await repo.createWebhook({ name: 'gold only', url: 'https://x', type: 'discord', triggers: ['achievement_unlocked'], tierFilter: ['gold', 'Platinum'] });
    const all = await repo.createWebhook({ name: 'all', url: 'https://y', type: 'discord', triggers: ['achievement_unlocked'] });
    const other = await repo.createWebhook({ name: 'uploads', url: 'https://z', type: 'slack', triggers: ['new_upload'], tierFilter: ['gold'] });

    const bronze = (await repo.getWebhooksByTrigger('achievement_unlocked', undefined, 'bronze')).map((w) => w.id);
    const platinum = (await repo.getWebhooksByTrigger('achievement_unlocked', undefined, 'platinum')).map((w) => w.id);
    const noTier = (await repo.getWebhooksByTrigger('achievement_unlocked')).map((w) => w.id);

    expect(bronze).toEqual([all]);
    expect(platinum.sort()).toEqual([gold, all].sort());
    expect(noTier.sort()).toEqual([gold, all].sort());
    expect(other).toBeGreaterThan(0);
    // The filter round-trips through update and read.
    await repo.updateWebhook(all, { tierFilter: ['bronze'] });
    expect((await repo.getWebhook(all))?.tierFilter).toEqual(['bronze']);
    expect((await repo.getWebhooksByTrigger('achievement_unlocked', undefined, 'silver')).map((w) => w.id)).toEqual([]);
  });

  it('an existing board gains the tier_filter column on startup without losing its webhooks', async () => {
    const cols = (raw.prepare('PRAGMA table_info(webhooks)').all() as { name: string }[]).map((c) => c.name);
    expect(cols).toContain('tier_filter');
    // A row written the old way - no tier_filter at all - reads as "every tier".
    raw.prepare(`INSERT INTO webhooks (name, url, type, enabled, triggers, door_filter) VALUES ('old', 'https://o', 'discord', 1, '["achievement_unlocked"]', '[]')`).run();
    const hooks = await repo.getWebhooksByTrigger('achievement_unlocked', undefined, 'gold');
    expect(hooks.map((w) => w.name)).toEqual(['old']);
    expect(hooks[0].tierFilter).toEqual([]);
  });
});
