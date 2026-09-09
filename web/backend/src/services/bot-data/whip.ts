/**
 * WEB_BOT_DATA WHIP - the task board, read-only from inside the chat.
 *
 * Readers only: WhipService stays the single writer (the Discord bot and
 * the door keep writing through it). Reads never touch the JSON writers,
 * so the single-writer rule holds.
 */
import { BOT_clampLimit, BOT_cut, BOT_more } from './caps';
import type { BOTResult } from './types';

export interface BOTWhip {
  listProjects(): Promise<any[]>;
  listTasks(projectId: string): Promise<any[]>;
  listAllTasks(): Promise<any[]>;
  listUserTasks(userId: string): Promise<any>;
  leaderboard(): Promise<any[]>;
  achievementsFor(userId: string): Promise<any | null>;
  listParties(): Promise<any[]>;
  listUsers(): Promise<Array<{ userId: string; handle: string }>>;
}

const noWhip: BOTResult = { text: 'The task board is unreachable right now.', truncated: false };

function taskLine(t: any): string {
  const state = t.status ?? t.state ?? t.column ?? '?';
  return `${t.title ?? t.name ?? '(untitled)'} [${state}]${t.assignee ?? t.owner ? ` - ${t.assignee ?? t.owner}` : ''}`;
}

export async function BOT_whipProjects(whip: BOTWhip | undefined): Promise<BOTResult> {
  if (!whip) return noWhip;
  const rows = await whip.listProjects();
  if (!rows.length) return { text: 'No projects on the board.', truncated: false };
  const { text, truncated } = BOT_cut(rows.map((p: any) => `${p.name ?? p.title} (${p.id ?? p.projectId})`).join('\n'));
  return { text, truncated, total: rows.length };
}

export async function BOT_whipTasks(
  whip: BOTWhip | undefined,
  projectId: unknown,
  limit?: unknown,
): Promise<BOTResult> {
  if (!whip) return noWhip;
  const pid = String(projectId ?? '').trim().slice(0, 60);
  if (!pid) return { text: 'Which project?', truncated: false };
  const n = BOT_clampLimit(limit);
  const rows = await whip.listTasks(pid);
  if (!rows.length) return { text: `No tasks in project ${pid}.`, truncated: false };
  const shown = rows.slice(0, n);
  const { text, truncated } = BOT_cut(shown.map(taskLine).join('\n') + BOT_more(rows.length, shown.length));
  return { text, truncated: truncated || rows.length > shown.length, total: rows.length };
}

export async function BOT_whipMyTasks(
  whip: BOTWhip | undefined,
  userId: unknown,
  limit?: unknown,
): Promise<BOTResult> {
  if (!whip) return noWhip;
  const uid = String(userId ?? '').trim().slice(0, 60);
  if (!uid) return { text: 'Whose tasks?', truncated: false };
  const n = BOT_clampLimit(limit);
  const mine: any = await whip.listUserTasks(uid);
  const rows: any[] = Array.isArray(mine) ? mine : (mine?.tasks ?? []);
  if (!rows.length) return { text: 'No open tasks for that user.', truncated: false };
  const shown = rows.slice(0, n);
  const { text, truncated } = BOT_cut(shown.map(taskLine).join('\n') + BOT_more(rows.length, shown.length));
  return { text, truncated: truncated || rows.length > shown.length, total: rows.length };
}

export async function BOT_whipLeaderboard(whip: BOTWhip | undefined, limit?: unknown): Promise<BOTResult> {
  if (!whip) return noWhip;
  const n = BOT_clampLimit(limit);
  const rows = await whip.leaderboard();
  if (!rows.length) return { text: 'No scores yet.', truncated: false };
  const shown = rows.slice(0, n);
  const { text, truncated } = BOT_cut(
    shown.map((e: any, i: number) => `${i + 1}. ${e.handle ?? e.username ?? e.userId} - ${e.points ?? e.score ?? 0} pts`).join('\n'),
  );
  return { text, truncated: truncated || rows.length > shown.length, total: rows.length };
}

export async function BOT_whipAchievements(whip: BOTWhip | undefined, userId: unknown): Promise<BOTResult> {
  if (!whip) return noWhip;
  const uid = String(userId ?? '').trim().slice(0, 60);
  if (!uid) return { text: 'Whose achievements?', truncated: false };
  const a: any = await whip.achievementsFor(uid);
  const rows: any[] = Array.isArray(a) ? a : (a?.achievements ?? a?.unlocked ?? []);
  if (!rows.length) return { text: 'No achievements unlocked.', truncated: false };
  const { text, truncated } = BOT_cut(rows.slice(0, 10).map((x: any) => String(x.name ?? x.title ?? x)).join('\n'));
  return { text, truncated, total: rows.length };
}
