/**
 * Kanban M moves the task without opening anything else.
 *
 * The move-destination picker is a list, and lists deliberately do NOT
 * consume Enter (they emit 'select' and propagate) - so the keypress kept
 * travelling into the kanban's own screen handler, whose Enter case opens
 * the EDIT dialog. Picking "in progress" moved the task AND opened its
 * editor on top (2026-09-09). The board now ignores its own keys while a
 * modal dialog is open.
 *
 * Driven: a real board with one task, M, arrows, Enter through
 * program.emit, then the task record and the absence of an edit dialog.
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
const storedTask: any = {
  id: 't1', projectId: 'p1', title: 'Move me', category: 'code',
  status: 'todo', priority: 'scener', points: 10, description: '',
};

function dataManager(): any {
  return {
    getTasksForProject: async () => [storedTask],
    loadParties: async () => [],
    loadUsers: async () => ({}),
    updateTask: async (task: any) => {
      Object.assign(storedTask, task);
    },
    getUser: async () => null,
  };
}

function hasEditDialog(screen: any): boolean {
  const found: boolean[] = [];
  const walk = (el: any): void => {
    if (String(el.options?.label ?? '').includes('Edit Task')) found.push(true);
    (el.children || []).forEach(walk);
  };
  walk(screen);
  return found.length > 0;
}

export async function moveDestinationDoesNotOpenTheEditor(): Promise<void> {
  storedTask.status = 'todo';
  const screen = open();
  try {
    let finished = false;
    const board = showKanbanBoard(screen, project, user, dataManager(), {} as any).then(() => {
      finished = true;
    });
    await settle();

    // M opens the move picker; down + Enter chooses in-progress.
    press(screen, 'm', 'm');
    await settle();
    press(screen, 'down', 'down');
    await settle();
    press(screen, '\r', 'enter');
    await settle();
    await settle();

    assert.strictEqual(storedTask.status, 'in-progress', 'the task moved');
    assert.strictEqual(hasEditDialog(screen), false, 'no edit dialog opened on top');

    // Leave the board.
    press(screen, '\x1b', 'escape');
    await board;
    assert.strictEqual(finished, true);
  } finally {
    screen.destroy();
  }
}
