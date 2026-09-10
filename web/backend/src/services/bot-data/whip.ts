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

/**
 * Terminal colors for list output (2026-09-10): the BBS renders ANSI,
 * Discord does not, so color is OPT-IN per caller - the operator-chat
 * tools pass ansi:true, the /api/bot/v1 JSON surface stays plain.
 * Plain `\x1b[0;3Xm` (never bold) per the BBS output rules, every span
 * self-reset so a cut line cannot leak color.
 */
const ANSI_RESET = '\x1b[0m';
function ansiState(state: string): string {
  const s = state.toLowerCase();
  if (/done|complete|released/.test(s)) return '\x1b[0;32m';
  if (/progress|doing|active|test|review/.test(s)) return '\x1b[0;36m';
  if (/block|hold|wait|stuck/.test(s)) return '\x1b[0;31m';
  return '\x1b[0;33m';
}

export interface WhipTextOpts {
  ansi?: boolean;
}

function taskLine(t: any, ansi = false): string {
  const state = t.status ?? t.state ?? t.column ?? '?';
  const tag = `[${state}]`;
  const who = t.assignee ?? t.owner ? ` - ${t.assignee ?? t.owner}` : '';
  const title = t.title ?? t.name ?? '(untitled)';
  if (!ansi) return `${title} ${tag}${who}`;
  return `${title} ${ansiState(state)}${tag}${ANSI_RESET}${who}`;
}

export async function BOT_whipProjects(whip: BOTWhip | undefined, opts?: WhipTextOpts): Promise<BOTResult> {
  if (!whip) return noWhip;
  const rows = await whip.listProjects();
  if (!rows.length) return { text: 'No projects on the board.', truncated: false };
  const line = (p: any) => {
    const name = `${p.name ?? p.title} (${p.id ?? p.projectId})`;
    return opts?.ansi ? `\x1b[0;36m${name}${ANSI_RESET}` : name;
  };
  const { text, truncated } = BOT_cut(rows.map(line).join('\n'));
  return { text, truncated, total: rows.length };
}

export async function BOT_whipTasks(
  whip: BOTWhip | undefined,
  projectId: unknown,
  limit?: unknown,
  opts?: WhipTextOpts,
): Promise<BOTResult> {
  if (!whip) return noWhip;
  const pid = String(projectId ?? '').trim().slice(0, 60);
  if (!pid) return { text: 'Which project?', truncated: false };
  const n = BOT_clampLimit(limit);
  const rows = await whip.listTasks(pid);
  if (!rows.length) return { text: `No tasks in project ${pid}.`, truncated: false };
  const shown = rows.slice(0, n);
  const { text, truncated } = BOT_cut(shown.map((t) => taskLine(t, opts?.ansi)).join('\n') + BOT_more(rows.length, shown.length));
  return { text, truncated: truncated || rows.length > shown.length, total: rows.length };
}

export async function BOT_whipMyTasks(
  whip: BOTWhip | undefined,
  userId: unknown,
  limit?: unknown,
  opts?: WhipTextOpts,
): Promise<BOTResult> {
  if (!whip) return noWhip;
  const uid = String(userId ?? '').trim().slice(0, 60);
  if (!uid) return { text: 'Whose tasks?', truncated: false };
  const n = BOT_clampLimit(limit);
  const mine: any = await whip.listUserTasks(uid);
  const rows: any[] = Array.isArray(mine) ? mine : (mine?.tasks ?? []);
  if (!rows.length) return { text: 'No open tasks for that user.', truncated: false };
  const shown = rows.slice(0, n);
  const { text, truncated } = BOT_cut(shown.map((t) => taskLine(t, opts?.ansi)).join('\n') + BOT_more(rows.length, shown.length));
  return { text, truncated: truncated || rows.length > shown.length, total: rows.length };
}

export async function BOT_whipLeaderboard(whip: BOTWhip | undefined, limit?: unknown, opts?: WhipTextOpts): Promise<BOTResult> {
  if (!whip) return noWhip;
  const n = BOT_clampLimit(limit);
  const rows = await whip.leaderboard();
  if (!rows.length) return { text: 'No scores yet.', truncated: false };
  const shown = rows.slice(0, n);
  const line = (e: any, i: number) => {
    const s = `${i + 1}. ${e.handle ?? e.username ?? e.userId} - ${e.points ?? e.score ?? 0} pts`;
    return opts?.ansi ? `\x1b[0;33m${i + 1}.\x1b[0m ${e.handle ?? e.username ?? e.userId} - ${e.points ?? e.score ?? 0} pts` : s;
  };
  const { text, truncated } = BOT_cut(
    shown.map(line).join('\n'),
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
