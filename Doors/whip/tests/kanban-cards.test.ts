/**
 * Kanban cards on the board: the title only, one empty row between cards.
 *
 * Sysop, 2026-09-27: the cards ran together, and the `[S] 10 pts` meta row
 * spent a row per card that a quarter of 80 columns cannot spare. The pure
 * pieces are pinned in kanban-format.test.ts; this drives the real board
 * once and reads what the column list actually draws.
 */

import assert from 'assert';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { showKanbanBoard } from '../ui/kanban-board';

const settle = () => new Promise((r) => setTimeout(r, 30));

function task(n: number): any {
  return {
    id: `t${n}`, projectId: 'p1', title: `Task ${n}`, category: 'code',
    status: 'todo', priority: 'scener', points: 10, description: '', assignedTo: 'u1',
  };
}

const dataManager: any = {
  getTasksForProject: async () => [task(1), task(2)],
  loadParties: async () => [],
  loadUsers: async () => ({ u1: { userId: 'u1', handle: 'spot' } }),
  updateTask: async () => {},
  getUser: async () => null,
};

function todoList(screen: any): any {
  let found: any;
  const walk = (el: any): void => {
    if (el._columnIndex === 0) found = el;
    (el.children || []).forEach(walk);
  };
  walk(screen);
  return found;
}

export async function cardsShowTheTitleOnlyWithAnEmptyRowBetween(): Promise<void> {
  const screen = new Screen({ title: 'whip', width: 80, height: 25, focusKeys: false } as any);
  try {
    const board = showKanbanBoard(screen, { id: 'p1', name: 'Demo' } as any, { userId: 'u1' } as any, dataManager, {} as any);
    await settle();
    await settle();

    const rows = String(todoList(screen).content)
      .split('\n')
      .map((r) => r.replace(/\x1b\[[0-9;]*m/g, '').replace(/^(>>|> |  )/, '').trim());
    const first = rows.findIndex((r) => r === 'Task 1');
    const second = rows.findIndex((r) => r === 'Task 2');
    assert.ok(first >= 0 && second > first, `both cards drawn: ${JSON.stringify(rows)}`);
    assert.deepStrictEqual(rows.slice(first + 1, second), [''], 'exactly one empty row between the two cards');
    assert.ok(!rows.some((r) => /pts|\[S\]|spot/.test(r)), `no meta row on the board: ${JSON.stringify(rows)}`);

    screen.program.emit('keypress', '\x1b', { name: 'escape', full: 'escape' });
    await board;
  } finally {
    screen.destroy();
  }
}
