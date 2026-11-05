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
import { columnList, listRows, litRows } from './board-cells';

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

function press(screen: any, ch: string, name: string): void {
  screen.program.emit('keypress', ch, { name, full: name });
}

// Past the SDK list's 50ms navigation debounce.
const step = () => new Promise((r) => setTimeout(r, 70));

function boardOf(titles: string[]): any {
  return {
    getTasksForProject: async () => titles.map((title, i) => ({ ...task(i), title })),
    loadParties: async () => [],
    loadUsers: async () => ({}),
    updateTask: async () => {},
    getUser: async () => null,
  };
}

/**
 * Sysop, 2026-09-28: a wrapped title was highlighted on its first row only.
 * Two causes, both gone: the list styled only an item's first row, and the
 * door baked a highlight into whichever card was selected at the last
 * repaint - which stayed lit after the cursor moved on.
 */
export async function aSelectedWrappedCardIsLitOnEveryRowAndNoOtherCardIs(): Promise<void> {
  const screen = new Screen({ title: 'whip', width: 80, height: 25, focusKeys: false } as any);
  try {
    const board = showKanbanBoard(screen, { id: 'p1', name: 'Demo' } as any, { userId: 'u1' } as any,
      boardOf(['Short one', 'A much longer title that wraps over several rows', 'Third']), {} as any);
    await settle();
    await settle();
    press(screen, 'down', 'down');
    await step();

    const list = columnList(screen, 0);
    const rows = listRows(screen, list);
    const start = rows.findIndex((r) => r.text === 'A much longer');
    const spacer = rows.findIndex((r, i) => i > start && r.text === '');
    assert.ok(start >= 0 && spacer > start + 1, `the long card spans several rows: ${JSON.stringify(rows.map((r) => r.text))}`);
    const cardRows = rows.slice(start, spacer).map((r) => r.y);

    const lit = litRows(screen, list).map((r) => r.y);
    assert.deepStrictEqual(lit, cardRows, 'every row of the selected card is lit, and nothing else');

    screen.program.emit('keypress', '\x1b', { name: 'escape', full: 'escape' });
    await board;
  } finally {
    screen.destroy();
  }
}

/**
 * Sysop, 2026-09-28: the cursor stopped on the empty row between cards.
 * Guard: walking the whole column down and back up, the marker is always on
 * a card's first row, never on a spacer. (Not reproduced in this harness
 * before the fix - see the report - so this pins the property, it is not
 * a red-first test.)
 */
export async function theCursorNeverRestsOnASpacerRow(): Promise<void> {
  const titles = Array.from({ length: 10 }, (_, i) => (i % 3 === 1 ? `Card number ${i} with a long wrapping title` : `Card ${i}`));
  const screen = new Screen({ title: 'whip', width: 80, height: 25, focusKeys: false } as any);
  try {
    const board = showKanbanBoard(screen, { id: 'p1', name: 'Demo' } as any, { userId: 'u1' } as any, boardOf(titles), {} as any);
    await settle();
    await settle();
    const list = columnList(screen, 0);
    const keys = [...Array(10).fill('down'), ...Array(10).fill('up')];
    for (const key of keys) {
      press(screen, key, key);
      await step();
      const marked = listRows(screen, list).filter((r) => r.marker.includes('>'));
      assert.strictEqual(marked.length, 1, `one marker after ${key}`);
      assert.ok(marked[0].text.length > 0, `the marker is on a card, not a spacer, after ${key} (selected ${list.selected})`);
      assert.ok(titles[list.selected].startsWith(marked[0].text.split(' ').slice(0, 2).join(' ')), `and on the selected card: ${marked[0].text}`);
    }
    screen.program.emit('keypress', '\x1b', { name: 'escape', full: 'escape' });
    await board;
  } finally {
    screen.destroy();
  }
}
