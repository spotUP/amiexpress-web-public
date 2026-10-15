/**
 * Webhook per-door routing + score attribution regression tests.
 *
 * Symptoms (reported live 2026-08-25, Discord):
 *  1. A board with one webhook per game ("Arkanoid", "GMaster") saw EVERY
 *     door_score posted to BOTH of them - webhooks were matched on trigger
 *     alone, with no notion of which door produced the event.
 *  2. The Discord embed never named the scorer. Doors supply their own
 *     `message` ("Score: 6,080 | Level: 3 | Rank: #2"), which replaced the
 *     `${username} posted a score` fallback wholesale, so the one genuinely
 *     essential field was the one missing.
 */

import { WebhookRepository } from '../src/database/webhook-repository';

/** Minimal better-sqlite3 stand-in returning fixed rows. */
function repoWith(rows: any[]): WebhookRepository {
  const fakeDb = {
    prepare: (_sql: string) => ({
      all: () => rows,
      get: () => rows[0],
      run: () => ({ lastInsertRowid: 1 }),
    }),
  };
  return new WebhookRepository(fakeDb as any);
}

const arkanoidHook = {
  id: 1, name: 'Arkanoid', url: 'https://discord.test/1', type: 'discord',
  enabled: 1, triggers: '["door_score"]', door_filter: '["ARKANOID"]',
  created: 0, updated: 0,
};
const gmasterHook = {
  id: 2, name: 'GMaster', url: 'https://discord.test/2', type: 'discord',
  enabled: 1, triggers: '["door_score"]', door_filter: '["GMASTER"]',
  created: 0, updated: 0,
};
const catchAllHook = {
  id: 3, name: 'Everything', url: 'https://discord.test/3', type: 'discord',
  enabled: 1, triggers: '["door_score"]', door_filter: '[]',
  created: 0, updated: 0,
};

describe('webhook door filtering', () => {
  it('routes a score only to the webhook scoped to that door', async () => {
    const repo = repoWith([arkanoidHook, gmasterHook]);

    const matched = await repo.getWebhooksByTrigger('door_score', 'ARKANOID');

    expect(matched.map(w => w.name)).toEqual(['Arkanoid']);
  });

  it('does not leak one door\'s score to another door\'s webhook', async () => {
    const repo = repoWith([arkanoidHook, gmasterHook]);

    const matched = await repo.getWebhooksByTrigger('door_score', 'GMASTER');

    expect(matched.map(w => w.name)).toEqual(['GMaster']);
  });

  it('matches door names case-insensitively', async () => {
    const repo = repoWith([arkanoidHook]);

    const matched = await repo.getWebhooksByTrigger('door_score', 'arkanoid');

    expect(matched.map(w => w.name)).toEqual(['Arkanoid']);
  });

  it('keeps firing an unfiltered webhook for every door', async () => {
    // Every webhook that existed before door_filter shipped has an empty
    // filter, so upgrading a board must not silence any of them.
    const repo = repoWith([catchAllHook]);

    expect((await repo.getWebhooksByTrigger('door_score', 'ARKANOID')).map(w => w.name)).toEqual(['Everything']);
    expect((await repo.getWebhooksByTrigger('door_score', 'GMASTER')).map(w => w.name)).toEqual(['Everything']);
  });

  it('still filters by trigger', async () => {
    const repo = repoWith([arkanoidHook]);

    expect(await repo.getWebhooksByTrigger('new_upload', 'ARKANOID')).toEqual([]);
  });

  it('falls back to every subscriber when the event carries no door', async () => {
    const repo = repoWith([arkanoidHook, gmasterHook]);

    const matched = await repo.getWebhooksByTrigger('door_score');

    expect(matched.map(w => w.name)).toEqual(['Arkanoid', 'GMaster']);
  });
});
