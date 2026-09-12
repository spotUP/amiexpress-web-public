/**
 * WEB_BOT_DATA doors - other doors' stored data, read-only, allowlisted.
 *
 * RULES.md Rule 9: no per-door branches. One generic JSON reader, one
 * allowlist of door ids and keys, one byte cap. A door not on the list
 * is refused the same way regardless of which door it is. Never launches
 * a door; never writes.
 */
import * as fs from 'fs';
import * as path from 'path';
import { BOT_clampLimit, BOT_cut } from './caps';
import type { BOTResult } from './types';

const BOT_MAX_DOOR_BYTES = 4096;

/** door id -> readable data keys. Keys are file paths relative to the
 *  door's data home, never absolute, never with "..". */
const BOT_DOOR_ALLOWLIST: Record<string, string[]> = {
  arkanoid: ['highscores.json'],
  grandmaster: ['highscores.json', 'high-scores.json'],
  ncurses_pong: ['high-scores.json'],
  phreak_wars: ['high-scores.json'],
  telnet_frontend: ['high-scores.json'],
  livechat: ['high-scores.json'],
  whip: ['projects.json', 'tasks.json'],
};

function safeJoin(root: string, key: string): string | null {
  if (!key || key.includes('..') || path.isAbsolute(key)) return null;
  const full = path.join(root, key);
  return full.startsWith(root) ? full : null;
}

function summarizeJson(raw: string, limit: number): string {
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    return raw.replace(/\s+/g, ' ').trim().slice(0, 400);
  }
  const rows: any[] = Array.isArray(data) ? data : (data.scores ?? data.highscores ?? data.tasks ?? data.projects ?? []);
  if (!rows.length) return 'Empty.';
  return rows.slice(0, limit).map((r: any, i: number) => {
    if (typeof r === 'string' || typeof r === 'number') return `${i + 1}. ${r}`;
    const name = r.handle ?? r.name ?? r.title ?? r.player ?? `#${i + 1}`;
    const score = r.score ?? r.points ?? r.status ?? r.state ?? '';
    return `${i + 1}. ${name}${score !== '' ? ` - ${score}` : ''}`;
  }).join('\n');
}

export async function BOT_doorData(
  bbsRoot: string | undefined,
  doorId: unknown,
  key: unknown,
  limit?: unknown,
): Promise<BOTResult> {
  const id = String(doorId ?? '').trim().toLowerCase().slice(0, 40);
  const k = String(key ?? '').trim().slice(0, 60);
  const allowed = BOT_DOOR_ALLOWLIST[id];
  if (!allowed || !allowed.includes(k)) {
    return { text: `Door data for "${id || '?'}" is not shared with chatbots.`, truncated: false };
  }
  if (!bbsRoot) return { text: 'Door data is unreachable right now.', truncated: false };
  // Data may live under Doors/<id>/data, Doors/<id>, or the data/doors/<id> sidecar.
  const candidates = [
    path.join(bbsRoot, 'Doors', id, 'data'),
    path.join(bbsRoot, 'Doors', id),
    path.join(bbsRoot, 'data', 'doors', id),
  ];
  for (const root of candidates) {
    const full = safeJoin(root, k);
    if (!full || !fs.existsSync(full)) continue;
    const stat = fs.statSync(full);
    if (!stat.isFile() || stat.size > 65536) continue;
    const raw = fs.readFileSync(full, 'utf8').slice(0, BOT_MAX_DOOR_BYTES);
    const { text, truncated } = BOT_cut(summarizeJson(raw, BOT_clampLimit(limit)));
    return { text, truncated, total: undefined };
  }
  return { text: `No ${k} stored for ${id}.`, truncated: false };
}

/** The allowlist itself, so tools and HTTP can advertise it honestly. */
export function BOT_doorDataKeys(): Record<string, string[]> {
  return BOT_DOOR_ALLOWLIST;
}
