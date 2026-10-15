/**
 * Picking a project in the list opens its board.
 *
 * Enter resolved the project but the menu's wrapper dropped it on the
 * floor, landing the caller back at the menu - the dead end reported
 * 2026-09-10 ("i expect something to happen"). The wrapper opens the
 * kanban for the pick now; pinned here is the dialog half (Enter
 * resolves the highlighted project, Q backs out with null).
 */

import assert from 'assert';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { showProjectList } from '../ui/project-list';

const PROJECTS = [
  { id: 'backlog', name: 'Backlog', type: 'code', status: 'active' },
  { id: 'demo', name: 'Demo', type: 'demo', status: 'active' },
];

function open(): any {
  return new Screen({ title: 'whip', width: 80, height: 25, focusKeys: false } as any);
}

function press(screen: any, ch: string, name: string, extra: any = {}): void {
  screen.program.emit('keypress', ch, { name, full: name, ...extra });
}

const settle = () => new Promise((r) => setTimeout(r, 30));

const user: any = { userId: 'u1' };
const dataManager: any = {
  loadProjects: async () => PROJECTS,
  loadTasks: async () => [],
  loadParties: async () => [],
  loadUsers: async () => ({}),
};

export async function enterResolvesTheHighlightedProject(): Promise<void> {
  const screen = open();
  try {
    const done = showProjectList(screen, user, dataManager, {} as any);
    await settle();

    press(screen, 'down', 'down');
    await settle();
    press(screen, '\r', 'enter');
    assert.deepStrictEqual(await done, PROJECTS[1]);
  } finally { screen.destroy(); }
}

export async function quitBacksOutWithNull(): Promise<void> {
  const screen = open();
  try {
    const done = showProjectList(screen, user, dataManager, {} as any);
    await settle();

    press(screen, 'q', 'q');
    assert.strictEqual(await done, null);
  } finally { screen.destroy(); }
}
