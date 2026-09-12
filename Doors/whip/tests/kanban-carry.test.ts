/**
 * Kanban pick-up and drop: Enter grabs the task, arrows carry it across
 * columns unsaved, Enter drops (one persisted move), ESC puts it back.
 *
 * E keeps Enter's old job (edit). Driven like kanban-move.test.ts: a real
 * board, real keys, the stored record as the oracle.
 */

import assert from 'assert';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { showKanbanBoard } from '../ui/kanban-board';

function open(): any {
  return new Screen({ title: 'whip', width: 80, height: 25, focusKeys: false } as any);
}

function press(screen: any, ch: string, name: string, extra: any = {}): void {
  screen.program.emit('keypress', ch, { name, full: name, ...extra });
}

const settle = () => new Promise((r) => setTimeout(r, 30));

const project: any = { id: 'p1', name: 'Demo', type: 'demo', status: 'active' };
const user: any = { userId: 'u1' };

function storedTask() {
  return {
    id: 't1', projectId: 'p1', title: 'Carry me', category: 'code',
    status: 'todo' as const, priority: 'scener' as const, points: 10, description: '',
  };
}

function dataManager(stored: any): any {
  return {
    getTasksForProject: async () => [stored],
    loadParties: async () => [],
    loadUsers: async () => ({}),
    updateTask: async (task: any) => {
      Object.assign(stored, task);
    },
    getUser: async () => null,
  };
}

async function openBoard(stored: any): Promise<{ screen: any; done: Promise<void> }> {
  const screen = open();
  const done = showKanbanBoard(screen, project, user, dataManager(stored), {} as any);
  await settle();
  await settle();
  return { screen, done };
}

export async function enterGrabsArrowsCarryEnterDrops(): Promise<void> {
  const stored = storedTask();
  const { screen, done } = await openBoard(stored);
  try {
    press(screen, '\r', 'enter');
    await settle();
    press(screen, 'right', 'right');
    await settle();
    press(screen, 'right', 'right');
    await settle();
    assert.strictEqual(stored.status, 'testing', 'carried across, still unsaved in memory');

    press(screen, '\r', 'enter');
    await settle();
    await settle();
    assert.strictEqual(stored.status, 'testing', 'dropped where carried');

    press(screen, '\x1b', 'escape');
    await done;
  } finally {
    screen.destroy();
  }
}

export async function escapePutsItBack(): Promise<void> {
  const stored = storedTask();
  const { screen, done } = await openBoard(stored);
  try {
    press(screen, '\r', 'enter');
    await settle();
    press(screen, 'right', 'right');
    await settle();
    assert.strictEqual(stored.status, 'in-progress', 'carried one column');

    press(screen, '\x1b', 'escape');
    await settle();
    assert.strictEqual(stored.status, 'todo', 'cancel restores the original column');

    press(screen, '\x1b', 'escape');
    await done;
  } finally {
    screen.destroy();
  }
}
