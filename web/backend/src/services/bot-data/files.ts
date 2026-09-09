/**
 * WEB_BOT_DATA files + conferences - listings and areas, reads only.
 *
 * File facts stay in file-facts.service.ts; conference truth stays in
 * the conference repository. This layer formats small answers for chat
 * and HTTP, filtered by the actor's conference access.
 */
import { BOT_clampLimit, BOT_cut, BOT_more } from './caps';
import type { BOTActor, BOTDb, BOTResult } from './types';

function maySee(actor: BOTActor, confId: number): boolean {
  if (!actor.confAccess) return true;
  return actor.confAccess.includes(confId);
}

export async function BOT_listConferences(
  db: BOTDb | undefined,
  actor: BOTActor,
): Promise<BOTResult> {
  if (!db) return { text: 'The board cannot read conferences right now.', truncated: false };
  const rows = await db.getConferences();
  const visible = rows.filter((c) => maySee(actor, Number(c.id)));
  if (!visible.length) return { text: 'No conferences are readable.', truncated: false };
  const { text, truncated } = BOT_cut(visible.map((c) => `${c.id}: ${c.name}`).join('\n'));
  return { text, truncated, total: visible.length };
}

const sizeOf = (bytes: number | null | undefined): string => {
  if (bytes === null || bytes === undefined) return 'size?';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
};

function fileLine(r: any): string {
  const desc = String(r.description ?? r.fileiddiz ?? '').replace(/\s+/g, ' ').trim().slice(0, 90);
  return `${r.filename ?? r.name} (${sizeOf(r.size ?? r.file_size)}): ${desc || 'no description'}`;
}

export async function BOT_searchFiles(
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
  if (!db) return { text: 'The board cannot read files right now.', truncated: false };
  const areas = await db.getFileAreas(c);
  if (!areas.length) return { text: `Conference ${c} has no file areas.`, truncated: false };
  const n = BOT_clampLimit(limit);
  const hits: any[] = [];
  for (const a of areas) {
    const rows = await db.getFileEntries(Number(a.id ?? a.areaid), { limit: n + 1, search: q });
    for (const r of rows) {
      if (hits.length > n) break;
      hits.push(r);
    }
    if (hits.length > n) break;
  }
  if (!hits.length) return { text: `No files match "${q}" in conference ${c}.`, truncated: false };
  const shown = hits.slice(0, n);
  const { text, truncated } = BOT_cut(shown.map(fileLine).join('\n') + BOT_more(hits.length, shown.length));
  return { text, truncated: truncated || hits.length > shown.length, total: hits.length };
}

export async function BOT_fileStats(
  db: BOTDb | undefined,
  actor: BOTActor,
  conf: unknown,
): Promise<BOTResult> {
  const c = parseInt(String(conf ?? ''), 10);
  if (!Number.isFinite(c) || c < 1) return { text: 'Which conference number?', truncated: false };
  if (!maySee(actor, c)) return { text: `Conference ${c} is not readable.`, truncated: false };
  if (!db) return { text: 'The board cannot read files right now.', truncated: false };
  const s: any = await db.getFileStatisticsByConference(c);
  if (!s) return { text: `No file statistics for conference ${c}.`, truncated: false };
  const files = s.totalFiles ?? s.fileCount ?? s.count ?? '?';
  const bytes = s.totalBytes ?? s.bytes ?? null;
  return { text: `Conference ${c}: ${files} files${bytes !== null ? `, ${sizeOf(Number(bytes))}` : ''}.`, truncated: false };
}
