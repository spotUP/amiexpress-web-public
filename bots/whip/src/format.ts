/**
 * Pure Discord formatters for /whip output. No Discord or backend calls, so
 * the whole look of the bot is unit-tested here instead of eyeballed in a
 * channel: handles over raw ids, collapsed locked achievements, countdowns.
 */

import type {
  WhipAchievements,
  WhipLeaderboardEntry,
  WhipParty,
  WhipProject,
  WhipTask,
  WhipUserTasks,
} from './whip-api';

/** "2026-09-17" -> "today" | "tomorrow" | "in Nd" | "Nd ago" | "". */
export function relativeDay(dateStr: string, nowMs: number = Date.now()): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr ?? '');
  if (!match) return '';
  const dayMs = 86400000;
  const target = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const today = new Date(nowMs);
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const diff = Math.round((target - todayUtc) / dayMs);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff > 1) return `in ${diff}d`;
  return `${-diff}d ago`;
}

export function formatProjects(projects: WhipProject[]): string {
  if (projects.length === 0) return 'No projects yet.';
  return projects
    .map((p) => `**${p.name}** (${p.type}, ${p.status}) — ${p.taskCounts.done}/${p.taskCounts.total} done · \`${p.id}\``)
    .join('\n\n');
}

const STATUS_MARK: Record<string, string> = {
  todo: '○',
  'in-progress': '◐',
  testing: '◑',
  done: '●',
};

export function formatTaskLine(t: WhipTask): string {
  const mark = STATUS_MARK[t.status] ?? '○';
  const who = t.assignedTo ? ` — ${t.assignedTo}` : '';
  return `${mark} **${t.title}** [${t.status}] (${t.priority}, ${t.points} pts)${who}`;
}

export function formatTasks(tasks: WhipTask[]): string {
  if (tasks.length === 0) return 'No tasks assigned.';
  return tasks.map(formatTaskLine).join('\n');
}

export function formatLeaderboard(rows: WhipLeaderboardEntry[]): string {
  if (rows.length === 0) return 'Nobody on the board yet.';
  return rows
    .map((r) => `${medal(r.rank)} **${r.handle}** — ${r.points} pts (${r.level}, ${r.tasksCompleted} tasks)`)
    .join('\n');
}

function medal(rank: number): string {
  if (rank === 1) return '1.';
  if (rank === 2) return '2.';
  if (rank === 3) return '3.';
  return `${rank}.`;
}

const MAX_LOCKED_SHOWN = 8;

export interface AchievementFields {
  title: string;
  unlocked: { name: string; value: string };
  locked: { name: string; value: string };
}

export function formatAchievements(ach: WhipAchievements): AchievementFields {
  const title = `Achievements for ${ach.handle} (${ach.totalPoints} pts)`;
  const unlocked = {
    name: `Unlocked (${ach.unlocked.length})`,
    value:
      ach.unlocked.length === 0
        ? 'None yet.'
        : ach.unlocked.map((a) => `${a.name} (+${a.points})`).join('\n'),
  };
  let lockedValue: string;
  if (ach.locked.length === 0) {
    lockedValue = 'None — everything unlocked.';
  } else if (ach.locked.length <= MAX_LOCKED_SHOWN) {
    lockedValue = ach.locked.map((a) => a.name).join('\n');
  } else {
    const rest = ach.locked.length - MAX_LOCKED_SHOWN;
    lockedValue = [...ach.locked.slice(0, MAX_LOCKED_SHOWN).map((a) => a.name), `…and ${rest} more`].join('\n');
  }
  return { title, unlocked, locked: { name: `Locked (${ach.locked.length})`, value: lockedValue } };
}

export function formatParties(parties: WhipParty[], nowMs: number = Date.now()): string {
  if (parties.length === 0) return 'No parties listed.';
  return parties
    .map((p) => {
      const when = relativeDay(p.date, nowMs);
      const countdown = when ? ` (${when})` : '';
      const where = p.location ? ` @ ${p.location}` : '';
      return `**${p.name}** — ${p.date}${where}${countdown}`;
    })
    .join('\n');
}

export function formatUserTasks(result: WhipUserTasks): { title: string; body: string } {
  return { title: `Tasks for ${result.handle}`, body: formatTasks(result.tasks) };
}
