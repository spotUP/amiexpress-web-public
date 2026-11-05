/**
 * Kanban M moves the task without opening anything else.
 *
 * History: M opened a move-destination picker whose Enter leaked into the
 * board's own Enter case and opened the EDIT dialog on top (2026-09-09); the
 * board now ignores its own keys while a modal is open. Since 2026-09-27 M
 * is the board's one Move key and enters the keyboard carry (move mode)
 * directly, and Enter outside that mode is Edit - so the drop's Enter must
 * still never reach the editor.
 *
 * Driven: a real board with one task, M, an arrow, Enter through
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

    // M picks the card up; right carries it to IN PROGRESS; Enter drops.
    press(screen, 'm', 'm');
    await settle();
    press(screen, 'right', 'right');
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
