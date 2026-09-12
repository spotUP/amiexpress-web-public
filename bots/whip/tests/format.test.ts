/**
 * /whip output formatting: handles over ids, collapsed locked lists,
 * countdowns, empty states.
 */
import assert from 'assert';
import {
  formatAchievements,
  formatBoardText,
  formatLeaderboard,
  formatParties,
  formatProjects,
  formatTasks,
  formatUserTasks,
  relativeDay,
} from '../src/format';

const DAY = 86400000;
const NOW = Date.UTC(2026, 8, 9, 12, 0, 0); // 2026-09-09 noon UTC

export async function relativeDays(): Promise<void> {
  assert.strictEqual(relativeDay('2026-09-09', NOW), 'today');
  assert.strictEqual(relativeDay('2026-09-10', NOW), 'tomorrow');
  assert.strictEqual(relativeDay('2026-09-17', NOW), 'in 8d');
  assert.strictEqual(relativeDay('2026-09-01', NOW), '8d ago');
  assert.strictEqual(relativeDay('garbage', NOW), '');
  assert.strictEqual(relativeDay('', NOW), '');
}

export async function projectsShowCountsAndInlineIds(): Promise<void> {
  const out = formatProjects([
    { id: 'backlog', name: 'Backlog', type: 'tools', status: 'active', description: '', taskCounts: { total: 0, done: 0 } },
  ]);
  assert.ok(out.includes('**Backlog**'), 'name bold');
  assert.ok(out.includes('0/0 done'), 'counts');
  assert.ok(out.includes('`backlog`'), 'id inline code, not a bare line');
  assert.strictEqual(formatProjects([]), 'No projects yet.');
}

export async function tasksMarkStatus(): Promise<void> {
  const out = formatTasks([
    { id: 't', projectId: 'p', title: 'X', category: 'code', status: 'in-progress', priority: 'scener', points: 10, description: '' },
  ]);
  assert.ok(out.includes('◐'), 'status glyph');
  assert.ok(out.includes('[in-progress]'), 'status text');
  assert.strictEqual(formatTasks([]), 'No tasks assigned.');
}

export async function userTasksTitleUsesHandle(): Promise<void> {
  const { title, body } = formatUserTasks({ userId: 'ac50e687', handle: 'spot', tasks: [] });
  assert.ok(title.includes('spot'), 'handle in title');
  assert.ok(!title.includes('ac50e687'), 'raw id nowhere');
  assert.strictEqual(body, 'No tasks assigned.');
}

export async function leaderboardRanksByHandle(): Promise<void> {
  const out = formatLeaderboard([
    { userId: 'u1', handle: 'spot', points: 120, level: 'scener', rank: 1, tasksCompleted: 3, achievements: [] },
  ]);
  assert.ok(out.includes('**spot**'), 'handle bold');
  assert.ok(!out.includes('u1'), 'raw id nowhere');
  assert.strictEqual(formatLeaderboard([]), 'Nobody on the board yet.');
}

export async function achievementsUseHandleAndCollapseLocked(): Promise<void> {
  const locked = Array.from({ length: 30 }, (_, i) => ({ id: `a${i}`, name: `Achievement ${i}`, points: 10 }));
  const out = formatAchievements({ userId: 'ac50e687', handle: 'spot', unlocked: [], locked, totalPoints: 0 });
  assert.ok(out.title.includes('spot'), 'handle in title');
  assert.ok(!out.title.includes('ac50e687'), 'raw id nowhere');
  assert.ok(out.locked.value.includes('…and 22 more'), 'long locked list collapses');
  assert.ok(out.locked.name.includes('30'), 'locked count kept');
  assert.strictEqual(out.unlocked.value, 'None yet.');
  const few = formatAchievements({
    userId: 'u', handle: 'spot',
    unlocked: [{ id: 'a', name: 'First Release', points: 10 }],
    locked: [{ id: 'b', name: 'Getting Started', points: 25 }],
    totalPoints: 10,
  });
  assert.ok(few.unlocked.value.includes('First Release (+10)'), 'unlocked shows points');
  assert.ok(!few.locked.value.includes('more'), 'short list not collapsed');
}

export async function partiesCountDown(): Promise<void> {
  const out = formatParties(
    [{ id: 'r', name: 'Revision 2026', date: '2026-09-17', location: 'Saarbruecken' }],
    NOW
  );
  assert.ok(out.includes('(in 8d)'), 'countdown suffix');
  assert.strictEqual(formatParties([], NOW), 'No parties listed.');
}

export async function boardTextPassesThrough(): Promise<void> {
  assert.strictEqual(formatBoardText({ text: 'AmiExpress BBS.', truncated: false }), 'AmiExpress BBS.');
}

export async function boardTextNotesTruncation(): Promise<void> {
  const out = formatBoardText({ text: 'row1\nrow2', truncated: true });
  assert.ok(out.endsWith('…more on the board'), 'says where the rest is');
}

export async function boardTextCapsAtDiscordLimit(): Promise<void> {
  const out = formatBoardText({ text: 'x'.repeat(5000), truncated: false });
  assert.ok(out.length <= 4096, 'fits an embed description');
  assert.ok(out.endsWith('…'), 'marks the cut');
}
