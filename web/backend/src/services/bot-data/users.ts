/**
 * WEB_BOT_DATA users - public account facts only.
 *
 * Allowlist, never blocklist: username, level, location, calls, up/down
 * counts. Password hashes, tokens, email, phone, GDPR-erased rows and
 * anyone above the caller's own level stay inside. A caller asking about
 * a higher-level user gets "no such user" - the existence of the account
 * is itself the leak.
 */
import { BOT_clampLimit, BOT_cut, BOT_more } from './caps';
import type { BOTActor, BOTDb, BOTResult } from './types';

const erased = (u: any): boolean => Boolean(u?.deleted_at ?? u?.erased_at);

function publicLine(u: any): string {
  const bits = [
    `${u.username} (level ${u.secLevel})`,
    u.location ? `from ${u.location}` : null,
    `calls ${u.calls ?? 0}`,
    `up ${u.uploads ?? 0} / down ${u.downloads ?? 0}`,
  ].filter(Boolean);
  return bits.join(', ');
}

export async function BOT_userLookup(
  db: BOTDb | undefined,
  actor: BOTActor,
  handle: string,
): Promise<BOTResult> {
  const h = String(handle ?? '').trim().slice(0, 30);
  if (!h) return { text: 'Whose account?', truncated: false };
  if (!db) return { text: 'The board cannot read accounts right now.', truncated: false };
  const u = await db.getUserByUsername(h);
  if (!u || erased(u) || (u.secLevel ?? 0) > (actor.secLevel ?? 0)) {
    return { text: `No user called ${h}.`, truncated: false };
  }
  return { text: publicLine(u), truncated: false };
}

export async function BOT_userSearch(
  db: BOTDb | undefined,
  actor: BOTActor,
  fragment: string,
  limit?: unknown,
): Promise<BOTResult> {
  const q = String(fragment ?? '').trim().slice(0, 30).toLowerCase();
  if (!q) return { text: 'What handle fragment?', truncated: false };
  if (!db) return { text: 'The board cannot read accounts right now.', truncated: false };
  const n = BOT_clampLimit(limit);
  const rows = await db.getUsers({ limit: 1000 });
  const mine = actor.secLevel ?? 0;
  const hits = rows.filter(
    (u) => !erased(u) && (u.secLevel ?? 0) <= mine
      && String(u.username ?? '').toLowerCase().includes(q),
  );
  if (!hits.length) return { text: `No handles match "${q}".`, truncated: false };
  const shown = hits.slice(0, n);
  const { text, truncated } = BOT_cut(shown.map(publicLine).join('\n') + BOT_more(hits.length, shown.length));
  return { text, truncated: truncated || hits.length > shown.length, total: hits.length };
}

export async function BOT_topCallers(
  db: BOTDb | undefined,
  _actor: BOTActor,
  limit?: unknown,
): Promise<BOTResult> {
  if (!db) return { text: 'The board cannot read accounts right now.', truncated: false };
  const n = BOT_clampLimit(limit);
  const rows = await db.getUsers({ limit: 1000 });
  const ranked = rows
    .filter((u) => !erased(u))
    .sort((a, b) => (b.calls ?? 0) - (a.calls ?? 0))
    .slice(0, n);
  if (!ranked.length) return { text: 'No callers yet.', truncated: false };
  const { text, truncated } = BOT_cut(ranked.map((u, i) => `${i + 1}. ${u.username} - ${u.calls ?? 0} calls`).join('\n'));
  return { text, truncated, total: ranked.length };
}
