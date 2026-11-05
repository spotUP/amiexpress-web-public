/**
 * A card dragged with the mouse lands in the column it is dropped on.
 *
 * "drag n dropping tasks in kanban stopped working" (the sysop, 2026-09-28,
 * after the title-only cards and the SDK list fixes). Driven the way a caller
 * drives it: mouse events through the screen's program, down on a card in
 * TODO, across to IN PROGRESS, up.
 */
import assert from 'assert';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { showKanbanBoard } from '../ui/kanban-board';
import { columnList, listRows } from './board-cells';

const settle = () => new Promise((r) => setTimeout(r, 40));

export async function aCardDraggedToInProgressLandsThere(): Promise<void> {
  const tasks: any[] = [1, 2].map((n) => ({
    id: `t${n}`, projectId: 'p1', title: `Task ${n}`, category: 'code', status: 'todo',
    priority: 'scener', points: 10, description: '', assignedTo: 'u1',
  }));
  const updates: any[] = [];
  const dataManager: any = {
    getTasksForProject: async () => tasks,
    loadParties: async () => [],
    loadUsers: async () => ({ u1: { userId: 'u1', handle: 'spot' } }),
    updateTask: async (t: any) => { updates.push({ ...t }); const i = tasks.findIndex((x) => x.id === t.id); tasks[i] = { ...t }; },
    getUser: async () => null,
    getProject: async () => ({ id: 'p1', name: 'Demo' }),
  };
  const screen = new Screen({ title: 'whip', width: 80, height: 25, focusKeys: false } as any);
  try {
    const board = showKanbanBoard(screen, { id: 'p1', name: 'Demo' } as any, { userId: 'u1' } as any, dataManager, {} as any);
    await settle(); await settle();

    const todo = columnList(screen, 0);
    const doing = columnList(screen, 1);
    const card = listRows(screen, todo).find((r) => r.text === 'Task 2');
    assert.ok(card, 'Task 2 is on the board');
    const x0 = (todo.aleft ?? 0) + 4;
    const x1 = (doing.aleft ?? 0) + 4;
    const y1 = (doing.atop ?? 0) + 2;
    const mouse = (action: string, x: number, y: number) =>
      screen.program.emit('mouse', { action, x, y, button: 'left' });

    // No motion before the press: a terminal need not report one, and the
    // card to drag is the one under the press either way.
    mouse('mousedown', x0, card!.y);
    await settle();
    mouse('mousemove', x1, y1);
    await settle();
    mouse('mouseup', x1, y1);
    await settle(); await settle();

    const moved = updates.find((u) => u.id === 't2');
    assert.ok(moved, `the dragged card was saved (updates: ${JSON.stringify(updates.map((u) => [u.id, u.status]))})`);
    assert.strictEqual(moved.status, 'in-progress', 'and it is in IN PROGRESS');

    screen.program.emit('keypress', '\x1b', { name: 'escape', full: 'escape' });
    await board;
  } finally {
    screen.destroy();
  }
}
