/**
 * Webhook Repository Tests
 */

import { WebhookRepository } from '../../src/database/webhook-repository';

async function waitForTestDb(): Promise<any> {
  let attempts = 0;
  while (!(global as any).testDb && attempts < 30) {
    await new Promise(r => setTimeout(r, 500));
    attempts++;
  }
  const db = (global as any).testDb;
  if (!db) throw new Error('Test database not initialized');
  return db;
}

describe('WebhookRepository', () => {
  let repo: WebhookRepository;
  let rawDb: any;

  beforeAll(async () => {
    const db = await waitForTestDb();
    rawDb = (db as any).db;
    repo = new WebhookRepository(rawDb);
  }, 30000);

  beforeEach(() => {
    rawDb.exec(`DELETE FROM webhooks`);
  });

  describe('createWebhook', () => {
    it('returns a numeric id', async () => {
      const id = await repo.createWebhook({
        name: 'Test Hook',
        url: 'https://discord.com/api/webhooks/test',
        type: 'discord',
        triggers: ['user.login'],
      });
      expect(typeof id).toBe('number');
      expect(id).toBeGreaterThan(0);
    });
  });

  describe('getWebhooks', () => {
    it('lists created webhooks', async () => {
      await repo.createWebhook({ name: 'Hook1', url: 'https://a.com', type: 'discord', triggers: [] });
      await repo.createWebhook({ name: 'Hook2', url: 'https://b.com', type: 'slack', triggers: ['user.login'] });

      const hooks = await repo.getWebhooks();
      expect(hooks.length).toBe(2);
    });
  });

  describe('getWebhook', () => {
    it('retrieves by id', async () => {
      const id = await repo.createWebhook({ name: 'Solo', url: 'https://solo.com', type: 'discord', triggers: ['door.score'] });
      const hook = await repo.getWebhook(id);
      expect(hook).not.toBeNull();
      expect(hook!.name).toBe('Solo');
    });

    it('returns null for unknown id', async () => {
      expect(await repo.getWebhook(999999)).toBeNull();
    });
  });

  describe('getWebhooksByTrigger', () => {
    it('filters by trigger', async () => {
      await repo.createWebhook({ name: 'LoginHook', url: 'https://a.com', type: 'discord', triggers: ['user.login'] });
      await repo.createWebhook({ name: 'ScoreHook', url: 'https://b.com', type: 'slack', triggers: ['door.score'] });

      const loginHooks = await repo.getWebhooksByTrigger('user.login');
      expect(loginHooks.every(h => h.name === 'LoginHook')).toBe(true);
      expect(loginHooks.length).toBe(1);
    });
  });

  describe('updateWebhook', () => {
    it('updates name field', async () => {
      const id = await repo.createWebhook({ name: 'OldName', url: 'https://x.com', type: 'discord', triggers: [] });
      await repo.updateWebhook(id, { name: 'NewName' });
      const hook = await repo.getWebhook(id);
      expect(hook!.name).toBe('NewName');
    });
  });

  describe('deleteWebhook', () => {
    it('removes the row', async () => {
      const id = await repo.createWebhook({ name: 'ToDelete', url: 'https://del.com', type: 'discord', triggers: [] });
      await repo.deleteWebhook(id);
      expect(await repo.getWebhook(id)).toBeNull();
    });
  });
});
