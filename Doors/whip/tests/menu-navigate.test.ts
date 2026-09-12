/**
 * Menu picks on subpages navigate out through the app loop.
 *
 * Every screen resolves as before (kanban void on Q, project-list with
 * the pick or null), and a menu pick additionally stashes its
 * destination via onNavigate - the app loop jumps instead of showing
 * the menu. Pinned on the two shaped exits (void board, project/null
 * list); the other four screens share the exact helper path.
 */

import assert from 'assert';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { showKanbanBoard } from '../ui/kanban-board';
import { showProjectList } from '../ui/project-list';

const PROJECT = { id: 'p1', name: 'Demo', type: 'demo', status: 'active' };
const USER = { userId: 'u1', handle: 'tester' };

function open(): any {
  return new Screen({ title: 'whip', width: 80, height: 25, focusKeys: false } as any);
}

function press(screen: any, ch: string, name: string, extra: any = {}): void {
  screen.program.emit('keypress', ch, { name, full: name, ...extra });
}

const settle = () => new Promise((r) => setTimeout(r, 30));

const dataManager: any = {
  getTasksForProject: async () => [],
  loadProjects: async () => [PROJECT],
  loadTasks: async () => [],
  loadParties: async () => [],
  loadUsers: async () => ({}),
  updateTask: async () => {},
  getUser: async () => null,
};

function menuBarOf(screen: any): any {
  let found: any;
  const walk = (el: any): void => {
    if (Array.isArray(el.menuButtons) && el.menuButtons.length > 0) found = el;
    (el.children || []).forEach(walk);
  };
  walk(screen);
  return found;
}

function fireAction(screen: any, group: number, labelPart: string): void {
  const bar = menuBarOf(screen);
  assert.ok(bar, 'the menu bar is up');
  const item = bar.getMenu(group).items.find((i: any) => String(i.label).includes(labelPart));
  assert.ok(item, `menu has ${labelPart}`);
  item.action();
}

export async function kanbanMenuPickNavigatesOut(): Promise<void> {
  const screen = open();
  try {
    let nav: string | null = null;
    const board = showKanbanBoard(screen, PROJECT as any, USER as any, dataManager, {} as any, undefined, (s) => { nav = s; });
    await settle();

    // Stars > Leaderboard from inside the board.
    fireAction(screen, 4, 'Leaderboard');
    await board;
    assert.strictEqual(nav, 'leaderboard', 'the pick stashes its destination');
  } finally { screen.destroy(); }
}

export async function projectListMenuPickNavigatesOut(): Promise<void> {
  const screen = open();
  try {
    let nav: string | null = null;
    const done = showProjectList(screen, USER as any, dataManager, {} as any, undefined, (s) => { nav = s; });
    await settle();

    // Board > Kanban from inside the list: the pick flow cancels (null)
    // while navigation carries the destination.
    fireAction(screen, 2, 'Kanban');
    assert.strictEqual(await done, null, 'the list resolves null alongside');
    assert.strictEqual(nav, 'kanban', 'the pick stashes its destination');
  } finally { screen.destroy(); }
}

export async function subpagesShowTheBar(): Promise<void> {
  const screen = open();
  try {
    const board = showKanbanBoard(screen, PROJECT as any, USER as any, dataManager, {} as any);
    await settle();
    assert.ok(menuBarOf(screen), 'kanban carries the menu bar');
    press(screen, 'q', 'q');
    await board;
  } finally { screen.destroy(); }
}
