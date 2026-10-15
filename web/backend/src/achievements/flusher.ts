/**
 * The flusher: drains the outbox to the achievements server.
 *
 * Every interval, up to 100 due rows in creation order, one POST /events,
 * and the verdict table (S5):
 *
 *   200            every sent row deleted; rejected refs first (terminal);
 *                  each notLinked address gets ONE link notice; each unlock
 *                  becomes a notice for its player
 *   403 not_linked every sent row deleted; the batch's addresses get the
 *                  link notice
 *   401/400/409    rows deleted, one [ERROR] naming the code - a
 *                  configuration fault; retrying is a loop
 *   429            nothing deleted; next attempt at Retry-After
 *   5xx/timeout/   nothing deleted; the ladder in outbox.repository
 *   no network
 *
 * Rows older than fourteen days are purged with one [WARN]. The timer is
 * unref'd so it never holds the process open; a run that is still going
 * when the next tick fires is skipped, never overlapped.
 *
 * What to DO with an unlock is a seam: `onUnlock` and `onNotLinked` default
 * to the pending-notices table; SP2-6 gives the live-session case.
 */
import type Database from 'better-sqlite3';
import { db } from '../database';
import { currentSettings } from './reporter';
import type { AchievementsSettings } from './config';
import { postEvents } from './client';
import type { FetchLike, PostResult } from './client';
import {
  addLinkNotice, addUnlockNotice, due, markFailed, OUTBOX_MAX_AGE_SECONDS, purgeOlderThan, remove,
} from './outbox.repository';
import type { OutboxRow } from './outbox.repository';
import type { EventIn, EventsResponse, UnlockOut } from './contract';
import { deliverNotice } from './notices';
import { registerDoorCatalogs } from './door-catalog';
import { notifyUnlock, defaultSiteDeps } from '../notify/sites';

export const FLUSH_INTERVAL_MS = 5_000;
export const FLUSH_BATCH = 100;

export interface FlusherDeps {
  rawDb: () => Database.Database | undefined;
  settings: () => AchievementsSettings;
  fetch: FetchLike;
  now: () => number;
  log: (line: string) => void;
  /** An unlock for the player behind `email`. Default: a pending notice. */
  onUnlock: (rawDb: Database.Database, email: string, unlock: UnlockOut, now: number) => void;
  /** The server refused this address as not linked. Default: one link notice. */
  onNotLinked: (rawDb: Database.Database, email: string, now: number) => void;
  /**
   * Publish the doors' own achievements, once per process. A seam so a
   * suite about the outbox is not also a suite about door manifests.
   */
  publishDoorCatalogs: (settings: AchievementsSettings, fetchImpl: FetchLike, log: (line: string) => void) => Promise<unknown>;
}

export interface PlayerRow { id: string; username: string; gdprConsentAt: number | string | null }

/** The users row for an address, matched case-insensitively. */
export function userForEmail(rawDb: Database.Database, email: string): PlayerRow | null {
  const row = rawDb.prepare('SELECT id, username, gdpr_consent_at FROM users WHERE lower(email) = lower(?) LIMIT 1').get(email) as
    | { id: string | number; username: string; gdpr_consent_at: number | string | null }
    | undefined;
  return row ? { id: String(row.id), username: row.username, gdprConsentAt: row.gdpr_consent_at } : null;
}

export function userIdForEmail(rawDb: Database.Database, email: string): string | null {
  return userForEmail(rawDb, email)?.id ?? null;
}

/**
 * The webhook (S8): achievement_unlocked with the board's username and the
 * achievement - never the email; the handle is the server's, not sent.
 */
export function fireUnlockWebhook(player: PlayerRow, unlock: UnlockOut, send: (trigger: string, data: Record<string, unknown>) => Promise<unknown> = defaultWebhookSend): void {
  send('achievement_unlocked', {
    username: player.username,
    userId: player.id,
    gdprConsented: !!player.gdprConsentAt,
    achievementId: unlock.id,
    name: unlock.name,
    tier: unlock.tier,
    points: unlock.points,
  }).catch((err: Error) => console.warn(`[WARN] achievements: unlock webhook failed: ${err.message}`));
}

function defaultWebhookSend(trigger: string, data: Record<string, unknown>): Promise<unknown> {
  const { webhookService } = require('../services/webhook.service');
  return webhookService.sendWebhook(trigger, data);
}

/**
 * The production deps: unlocks and link refusals go through deliverNotice,
 * which draws at once when the caller is at the prompt and keeps the
 * notice for the next menu otherwise. `io` is the socket.io server the
 * emitter registry resolves live sessions with.
 */
export function productionFlusherDeps(io: unknown): FlusherDeps {
  return {
    rawDb: () => (db as any).db as Database.Database | undefined,
    settings: currentSettings,
    fetch: (url, init) => fetch(url, init),
    now: () => Date.now(),
    log: (line) => console.log(line),
    onUnlock: (rawDb, email, unlock, now) => {
      const player = userForEmail(rawDb, email);
      if (!player) return;
      deliverNotice(io, player.id, 'unlock', unlock, { rawDb: () => rawDb, now: () => now });
      fireUnlockWebhook(player, unlock);
      notifyUnlock(player.id, unlock, { ...defaultSiteDeps, rawDb: () => rawDb, now: () => now });
    },
    onNotLinked: (rawDb, email, now) => {
      const userId = userIdForEmail(rawDb, email);
      if (userId) deliverNotice(io, userId, 'link', null, { rawDb: () => rawDb, now: () => now });
    },
    publishDoorCatalogs: (settings, fetchImpl, log) => registerDoorCatalogs(settings, undefined, fetchImpl, log),
  };
}

export const defaultFlusherDeps: FlusherDeps = {
  rawDb: () => (db as any).db as Database.Database | undefined,
  settings: currentSettings,
  fetch: (url, init) => fetch(url, init),
  now: () => Date.now(),
  log: (line) => console.log(line),
  onUnlock: (rawDb, email, unlock, now) => {
    const userId = userIdForEmail(rawDb, email);
    if (userId) addUnlockNotice(rawDb, userId, unlock, Math.floor(now / 1000));
  },
  onNotLinked: (rawDb, email, now) => {
    const userId = userIdForEmail(rawDb, email);
    if (userId) addLinkNotice(rawDb, userId, Math.floor(now / 1000));
  },
  publishDoorCatalogs: (settings, fetchImpl, log) => registerDoorCatalogs(settings, undefined, fetchImpl, log),
};

export interface FlushOutcome {
  sent: number;
  accepted: number;
  duplicates: number;
  rejected: number;
  unlocks: number;
  status: number;
  purged: number;
}

let lastPurgeAt = 0;
let doorCatalogsDone = false;

export function _resetDoorCatalogsDoneForTests(): void {
  doorCatalogsDone = false;
}

/** One pass. Returns what happened, for the log and the tests. */
export async function flushOnce(deps: FlusherDeps = defaultFlusherDeps): Promise<FlushOutcome> {
  const out: FlushOutcome = { sent: 0, accepted: 0, duplicates: 0, rejected: 0, unlocks: 0, status: 0, purged: 0 };
  const settings = deps.settings();
  const rawDb = deps.rawDb();
  if (!settings.enabled || !rawDb) return out;
  const nowMs = deps.now();
  const now = Math.floor(nowMs / 1000);

  // The doors' own achievements, once per process, the first time this board
  // is configured (door-catalog.ts). A door with none costs one scan.
  if (!doorCatalogsDone) {
    doorCatalogsDone = true;
    try {
      await deps.publishDoorCatalogs(settings, deps.fetch, deps.log);
    } catch (err) {
      doorCatalogsDone = false;
      deps.log(`[WARN] achievements: door catalogs not published: ${(err as Error).message}`);
    }
  }

  if (now - lastPurgeAt > 3600) {
    lastPurgeAt = now;
    out.purged = purgeOlderThan(rawDb, now - OUTBOX_MAX_AGE_SECONDS);
    if (out.purged > 0) deps.log(`[WARN] achievements: gave up on ${out.purged} events older than fourteen days`);
  }

  const rows: OutboxRow[] = batchForOneAddress(due(rawDb, now, FLUSH_BATCH));
  if (rows.length === 0) return out;
  const events: EventIn[] = rows.map((r) => JSON.parse(r.payload) as EventIn);
  const refs = rows.map((r) => r.ref);
  out.sent = rows.length;

  const res: PostResult = await postEvents(settings, events, deps.fetch);
  out.status = res.status;

  if (res.status === 200 && res.body && typeof (res.body as EventsResponse).accepted === 'number') {
    const body = res.body as EventsResponse;
    out.accepted = body.accepted;
    out.duplicates = body.duplicates;
    out.rejected = body.rejected.length;
    out.unlocks = body.unlocks.length;
    // Terminal rows first, so a crash between the two deletes never
    // resends what the server said it will refuse for ever.
    remove(rawDb, body.rejected.map((r) => r.ref));
    for (const email of body.notLinked) deps.onNotLinked(rawDb, email, nowMs);
    remove(rawDb, refs);
    // The batch is one address (batchForOneAddress), so every unlock in
    // the answer has exactly one player to go to.
    for (const u of body.unlocks) deps.onUnlock(rawDb, events[0].email, u, nowMs);
    return out;
  }
  if (res.status === 403) {
    remove(rawDb, refs);
    for (const email of new Set(events.map((e) => e.email))) deps.onNotLinked(rawDb, email, nowMs);
    deps.log(`[INFO] achievements: ${rows.length} events for unlinked callers dropped; the door will explain linking`);
    return out;
  }
  if (res.status === 429) {
    markFailed(rawDb, refs, 'rate limited', now, res.retryAfter ?? 60);
    return out;
  }
  if (res.status >= 400 && res.status < 500) {
    const code = (res.body as { error?: string } | null)?.error ?? String(res.status);
    remove(rawDb, refs);
    deps.log(`[ERROR] achievements: server refused ${rows.length} events with ${res.status} ${code}; dropped (check the board key and url)`);
    return out;
  }
  // 5xx, a non-JSON 200, a timeout, no network: keep, back off.
  markFailed(rawDb, refs, res.error ?? `HTTP ${res.status}`, now);
  deps.log(`[WARN] achievements: ${rows.length} events kept, ${res.error ?? `HTTP ${res.status}`}; retrying later`);
  return out;
}

/**
 * The batch the server sees is one address at a time, so an unlock in the
 * answer has exactly one player to go to. due() orders by creation, so
 * the first row's address picks the batch; the rest wait a tick.
 */
export function batchForOneAddress(rows: OutboxRow[]): OutboxRow[] {
  if (rows.length === 0) return rows;
  const first = rows[0].email.toLowerCase();
  return rows.filter((r) => r.email.toLowerCase() === first);
}

let running = false;

export function startFlusher(deps: FlusherDeps = defaultFlusherDeps, intervalMs: number = FLUSH_INTERVAL_MS): NodeJS.Timeout {
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    flushOnce(deps)
      .catch((err: Error) => deps.log(`[WARN] achievements: flush failed: ${err.message}`))
      .finally(() => { running = false; });
  }, intervalMs);
  timer.unref();
  return timer;
}
