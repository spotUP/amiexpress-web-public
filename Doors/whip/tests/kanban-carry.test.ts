/**
 * Kanban pick-up and drop: Enter grabs the task, arrows carry it across
 * columns unsaved, Enter drops (one persisted move), ESC lets it go.
 *
 * "Unsaved" is the whole point and is what this file now pins hardest.
 * The carry used to be represented by WRITING `task.status` - and
 * `DataManager.getTasksForProject` hands out references into its own
 * tasksCache - so the unsaved column was in the door's shared record from
 * the first arrow key. Only ESC put it back: N, E, M, D and a menu pick did
 * not, and any save after one of those (addTask -> saveTasks(tasksCache))
 * wrote the carried column to disk with no points, no completedAt, no
 * achievement check and no feed event.
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

async function openBoard(stored: any, dm?: any): Promise<{ screen: any; done: Promise<void> }> {
  const screen = open();
  const done = showKanbanBoard(screen, project, user, dm ?? dataManager(stored), {} as any);
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
    // Carried two columns on screen, and NOT ONE BYTE written to the
    // record the cache hands out. "Unsaved" means unsaved.
    assert.strictEqual(stored.status, 'todo', 'carrying never writes to the stored task');

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
    assert.strictEqual(stored.status, 'todo', 'carrying one column changes nothing stored');

    press(screen, '\x1b', 'escape');
    await settle();
    assert.strictEqual(stored.status, 'todo', 'cancel leaves it in its original column');

    press(screen, '\x1b', 'escape');
    await done;
  } finally {
    screen.destroy();
  }
}

/**
 * The leak the ESC path hid: every OTHER key.
 *
 * Carry a card into DONE, then press N and save a new task. `addTask`
 * pushes onto the cached array and saves the whole array, so whatever the
 * carry left in the cached record is what lands on disk. The carried task
 * must still be in TODO there - it was never dropped.
 */
export async function creatingATaskMidCarryNeverPersistsTheCarriedColumn(): Promise<void> {
  const stored = storedTask();
  // A cache with the same identity rule as DataManager's: reads hand out
  // the very objects a save writes.
  const cache: any[] = [stored];
  let persisted: any[] | null = null;
  const dm: any = {
    getTasksForProject: async () => cache.filter((t) => t.projectId === project.id),
    loadParties: async () => [],
    loadUsers: async () => ({}),
    loadProjects: async () => [project],
    getUser: async () => null,
    updateTask: async (task: any) => {
      const i = cache.findIndex((t) => t.id === task.id);
      if (i >= 0) cache[i] = task;
      persisted = cache.map((t) => ({ ...t }));
    },
    addTask: async (task: any) => {
      cache.push(task);
      persisted = cache.map((t) => ({ ...t }));
    },
  };

  const { screen, done } = await openBoard(stored, dm);
  try {
    press(screen, '\r', 'enter');
    await settle();
    for (let i = 0; i < 3; i++) {
      press(screen, 'right', 'right');
      await settle();
    }

    // N opens the New Task dialog on top of the held card.
    press(screen, 'n', 'n');
    await settle();
    await settle();

    const title = findByLabel(screen, ' Title ');
    assert.ok(title, 'the New Task dialog is open');
    title.setValue('A fresh one');

    press(screen, '\r', 'enter', { ctrl: true });
    await settle();
    await settle();

    assert.ok(persisted, 'the new task was saved');
    const carried = persisted!.find((t: any) => t.id === 't1');
    assert.ok(carried, 'the carried task is still in the store');
    assert.strictEqual(
      carried.status, 'todo',
      'the carried card was never dropped, so nothing may persist it in DONE',
    );
    assert.strictEqual(carried.completedAt, undefined, 'and it was never completed');
    assert.strictEqual(stored.status, 'todo', 'the cached record is untouched too');

    press(screen, '\x1b', 'escape');
    await settle();
    press(screen, '\x1b', 'escape');
    await done;
  } finally {
    screen.destroy();
  }
}

function findByLabel(screen: any, label: string): any {
  let found: any;
  const walk = (el: any): void => {
    if (String(el.options?.label ?? '') === label) found = el;
    (el.children || []).forEach(walk);
  };
  walk(screen);
  return found;
}
