/**
 * The active kanban column wears a white border; the rest do not.
 *
 * Columns used to hardcode yellow/cyan literals, which also ignored the
 * caller's theme - on anything but classic the "active" border washed
 * out (2026-09-10). Active is now T.ink (full-brightness text, white on
 * classic), inactive T.chrome. The green drag-target keeps its meaning.
 *
 * Driven: a real board, Left/Right through program.emit, border colors
 * read off the column boxes. Classic theme is the test default, so ink
 * is white and chrome is cyan here.
 */

import assert from 'assert';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { showKanbanBoard } from '../ui/kanban-board';
import { T } from '../door-theme';

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
  loadParties: async () => [],
  loadUsers: async () => ({}),
  updateTask: async () => {},
  getUser: async () => null,
};

function borderOf(screen: any, label: string): string | undefined {
  let found: string | undefined;
  const walk = (el: any): void => {
    if (String(el.options?.label ?? '').trim() === label) found = el.style?.border?.fg;
    (el.children || []).forEach(walk);
  };
  walk(screen);
  return found;
}

export async function activeColumnWearsWhite(): Promise<void> {
  const screen = open();
  try {
    const board = showKanbanBoard(screen, PROJECT as any, USER as any, dataManager, {} as any);
    await settle();

    // Against the live theme binding, not literals: other suites in this
    // process re-theme, and the point is active==ink, rest==chrome under
    // whichever theme is current (white/cyan on classic).
    assert.strictEqual(borderOf(screen, 'TODO'), T.ink, 'first column active');
    assert.strictEqual(borderOf(screen, 'IN PROGRESS'), T.chrome, 'rest dim');

    press(screen, 'right', 'right');
    await settle();

    assert.strictEqual(borderOf(screen, 'TODO'), T.chrome, 'old column dims');
    assert.strictEqual(borderOf(screen, 'IN PROGRESS'), T.ink, 'new column brightens');

    press(screen, 'q', 'q');
    await board;
  } finally { screen.destroy(); }
}
