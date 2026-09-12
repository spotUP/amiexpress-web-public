/**
 * WEB_BOT_DATA messages - public board mail only.
 *
 * Never private mail, never another conference's mail: the caller sees a
 * conference only when confAccess allows it (or when no access list is
 * enforced for this actor, e.g. a service token scoped to reads). Bodies
 * are cut hard; subjects name names.
 */
import { BOT_clampLimit, BOT_cut, BOT_more } from './caps';
import type { BOTActor, BOTDb, BOTResult } from './types';

function maySee(actor: BOTActor, confId: number): boolean {
  if (!actor.confAccess) return true;
  return actor.confAccess.includes(confId);
}

async function baseId(db: BOTDb, conf: number): Promise<number | null> {
  const bases = await db.getMessageBases(conf);
  return bases[0]?.id ?? null;
}

function msgLine(m: any): string {
  const head = `#${m.id ?? m.msgnumb ?? '?'} "${m.subject ?? '(no subject)'}" by ${m.author ?? m.from ?? '?'}`;
  const body = String(m.body ?? '').replace(/\s+/g, ' ').trim().slice(0, 160);
  return body ? `${head}\n  ${body}` : head;
}

export async function BOT_recentMessages(
  db: BOTDb | undefined,
  actor: BOTActor,
  conf: unknown,
  limit?: unknown,
): Promise<BOTResult> {
  const c = parseInt(String(conf ?? ''), 10);
  if (!Number.isFinite(c) || c < 1) return { text: 'Which conference number?', truncated: false };
  if (!maySee(actor, c)) return { text: `Conference ${c} is not readable.`, truncated: false };
  if (!db) return { text: 'The board cannot read messages right now.', truncated: false };
  const base = await baseId(db, c);
  if (base === null) return { text: `Conference ${c} has no message base.`, truncated: false };
  const n = BOT_clampLimit(limit);
  const rows = (await db.getMessages(c, base, { limit: n + 1 })).filter((m) => !m.isprivate && !m.isPrivate);
  if (!rows.length) return { text: `No public messages in conference ${c}.`, truncated: false };
  const shown = rows.slice(0, n);
  const { text, truncated } = BOT_cut(shown.map(msgLine).join('\n') + BOT_more(rows.length, shown.length));
  return { text, truncated: truncated || rows.length > shown.length, total: rows.length };
}

export async function BOT_searchMessages(
  db: BOTDb | undefined,
  actor: BOTActor,
  conf: unknown,
  query: unknown,
  limit?: unknown,
): Promise<BOTResult> {
  const c = parseInt(String(conf ?? ''), 10);
  const q = String(query ?? '').trim().slice(0, 80);
  if (!Number.isFinite(c) || c < 1) return { text: 'Which conference number?', truncated: false };
  if (!q) return { text: 'What should I search for?', truncated: false };
  if (!maySee(actor, c)) return { text: `Conference ${c} is not readable.`, truncated: false };
  if (!db) return { text: 'The board cannot read messages right now.', truncated: false };
  const base = await baseId(db, c);
  if (base === null) return { text: `Conference ${c} has no message base.`, truncated: false };
  const n = BOT_clampLimit(limit);
  const rows = (await db.getMessages(c, base, { limit: n + 1, search: q }))
    .filter((m) => !m.isprivate && !m.isPrivate);
  if (!rows.length) return { text: `Nothing about "${q}" in conference ${c}.`, truncated: false };
  const shown = rows.slice(0, n);
  const { text, truncated } = BOT_cut(shown.map(msgLine).join('\n') + BOT_more(rows.length, shown.length));
  return { text, truncated: truncated || rows.length > shown.length, total: rows.length };
}
