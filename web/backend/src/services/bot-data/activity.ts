/**
 * WEB_BOT_DATA activity - who is here, recent callers, board totals.
 *
 * Presence comes from the same sources /health reports (MEM node state
 * via who-is-online, DB sessions), so the chatbot can never describe a
 * caller the board itself cannot see. Totals come from the same tables
 * the admin stats page reads.
 */
import { BOT_clampLimit, BOT_cut } from './caps';
import type { BOTActor, BOTDb, BOTResult } from './types';

export interface BOTPresence {
  listOnlineNodes(): Array<{ nodeNumber: number; username: string; location?: string }>;
}

export async function BOT_whoOnline(presence: BOTPresence | undefined): Promise<BOTResult> {
  if (!presence) return { text: 'Presence is unreachable right now.', truncated: false };
  const nodes = presence.listOnlineNodes();
  if (!nodes.length) return { text: 'Nobody else is online.', truncated: false };
  const { text, truncated } = BOT_cut(
    nodes.map((n) => `Node ${n.nodeNumber}: ${n.username}${n.location ? ` (${n.location})` : ''}`).join('\n'),
  );
  return { text, truncated, total: nodes.length };
}

export async function BOT_sessionCount(db: BOTDb | undefined): Promise<BOTResult> {
  if (!db) return { text: 'Session state is unreachable right now.', truncated: false };
  const rows = await db.getActiveSessions();
  return { text: `${rows.length} active session${rows.length === 1 ? '' : 's'}.`, truncated: false, total: rows.length };
}

export async function BOT_boardTotals(db: BOTDb | undefined, _actor: BOTActor): Promise<BOTResult> {
  if (!db) return { text: 'Board totals are unreachable right now.', truncated: false };
  const users = await db.query('SELECT COUNT(*) as n FROM users WHERE COALESCE(deleted_at, erased_at) IS NULL');
  const msgs = await db.query('SELECT COUNT(*) as n FROM messages');
  const files = await db.query('SELECT COUNT(*) as n, COALESCE(SUM(size),0) as bytes FROM file_entries');
  const calls = await db.query("SELECT COUNT(*) as n FROM caller_activity WHERE date(timestamp,'unixepoch') = date('now')");
  const u = users.rows[0]?.n ?? '?';
  const m = msgs.rows[0]?.n ?? '?';
  const f = files.rows[0]?.n ?? '?';
  const b = files.rows[0]?.bytes ?? 0;
  const today = calls.rows[0]?.n ?? '?';
  return {
    text: `${u} users, ${m} messages, ${f} files (${b} bytes), ${today} calls today.`,
    truncated: false,
  };
}

export async function BOT_recentCallers(db: BOTDb | undefined, limit?: unknown): Promise<BOTResult> {
  if (!db) return { text: 'Caller history is unreachable right now.', truncated: false };
  const n = BOT_clampLimit(limit);
  const r = await db.query(
    'SELECT username, action, timestamp FROM caller_activity ORDER BY timestamp DESC LIMIT ?',
    [n + 1],
  );
  if (!r.rows.length) return { text: 'No recent caller activity.', truncated: false };
  const shown = r.rows.slice(0, n);
  const { text, truncated } = BOT_cut(
    shown.map((row: any) => `${row.username ?? '?'}: ${row.action ?? 'call'}`).join('\n'),
  );
  return { text, truncated: truncated || r.rows.length > shown.length, total: r.rows.length };
}
