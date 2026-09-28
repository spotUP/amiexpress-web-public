/**
 * A repaint keeps the cursor on the selected card.
 *
 * `paintLists` read each column's `selected` to decide which card to draw
 * inverse, then called `clearItems()` - which zeroes `selected`
 * (sdk list.ts:539) - and `setItems()`, which only ever clamps downwards
 * and so left it at 0. After any repaint (a resize, a carry, a reload) two
 * cards looked selected: the inverse at the old row, the widget's own
 * `style.selected` at row 0. E, M and D read `selected`, so they acted on
 * the first card in the column rather than the one under the cursor.
 *
 * Driven: a real board with three cards in TODO, real Down keys, a real
 * resize to force the repaint, and the list's own `selected` plus the
 * rows drawn lit on the rendered screen as the oracle.
 */

import assert from 'assert';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { showKanbanBoard } from '../ui/kanban-board';
import { litRows } from './board-cells';

const PROJECT = { id: 'p1', name: 'Demo', type: 'demo', status: 'active' };
const USER = { userId: 'u1', handle: 'tester' };

function open(): any {
  return new Screen({ title: 'whip', width: 80, height: 25, focusKeys: false } as any);
}

function press(screen: any, ch: string, name: string, extra: any = {}): void {
  screen.program.emit('keypress', ch, { name, full: name, ...extra });
}

// Past the SDK list's 50ms navigation debounce (sdk list.ts:344): two
// Downs 30ms apart are ONE Down to the widget.
const settle = () => new Promise((r) => setTimeout(r, 70));

function task(n: number): any {
  return {
    id: `t${n}`, projectId: 'p1', title: `Task ${n}`, category: 'code',
    status: 'todo', priority: 'scener', points: 10, description: '',
  };
}

const dataManager: any = {
  getTasksForProject: async () => [task(1), task(2), task(3)],
  loadParties: async () => [],
  loadUsers: async () => ({}),
  updateTask: async () => {},
  getUser: async () => null,
};

/** The four column lists, in board order. */
function columnLists(screen: any): any[] {
  const found: any[] = [];
  const walk = (el: any): void => {
    if (typeof el._columnIndex === 'number') found[el._columnIndex] = el;
    (el.children || []).forEach(walk);
  };
  walk(screen);
  return found;
}

export async function aRepaintKeepsTheCursorOnTheSelectedCard(): Promise<void> {
  const screen = open();
  try {
    const board = showKanbanBoard(screen, PROJECT as any, USER as any, dataManager, {} as any);
    await settle();
    await settle();

    const todo = () => columnLists(screen)[0];
    assert.strictEqual(todo().items.length, 3, 'three cards in TODO');

    press(screen, 'down', 'down');
    await settle();
    press(screen, 'down', 'down');
    await settle();
    assert.strictEqual(todo().selected, 2, 'two Downs put the cursor on the third card');

    // A resize repaints every column. Nothing about the selection changed.
    screen.emit('resize');
    await settle();

    assert.strictEqual(
      todo().selected, 2,
      'the repaint must not send the cursor back to the first card',
    );
    assert.deepStrictEqual(
      litRows(screen, todo()).map((r) => r.text), ['Task 3'],
      'exactly one card is drawn selected, and it is the one under the cursor',
    );

    press(screen, 'q', 'q');
    await board;
  } finally { screen.destroy(); }
}
