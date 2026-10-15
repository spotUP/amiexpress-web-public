/**
 * The active kanban column is the focused one - and the SDK whitens it.
 *
 * The door used to paint focus itself (yellow/cyan literals, then theme
 * tokens), which fought the SDK's own focus border until neither was
 * trustworthy (2026-09-10). Column boxes now carry only their base
 * color; the white active border comes from SDK resolveStateBorder, and
 * the drop-target green rides the hover state during drags.
 *
 * Driven: a real board. The boxes' own colors stay put while Left/Right
 * moves the focus the SDK reads - that split (door owns base, SDK owns
 * state) is the contract pinned here. The SDK side (white, no bold,
 * explicit-wins) is pinned in sdk/tests/unit/focus-border.test.ts.
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

function boxOf(screen: any, label: string): any {
  let found: any;
  const walk = (el: any): void => {
    if (String(el.options?.label ?? '').trim() === label) found = el;
    (el.children || []).forEach(walk);
  };
  walk(screen);
  return found;
}

export async function focusMarksTheActiveColumn(): Promise<void> {
  const screen = open();
  try {
    const board = showKanbanBoard(screen, PROJECT as any, USER as any, dataManager, {} as any);
    await settle();

    // Base colors never move: the door paints no focus anymore.
    for (const label of ['TODO', 'IN PROGRESS', 'TESTING', 'DONE']) {
      assert.strictEqual(boxOf(screen, label)?.style?.border?.fg, T.chrome, `${label} rests at the base color`);
    }
    // ...while the SDK reads focus off the live tree.
    assert.strictEqual(boxOf(screen, 'TODO').hasFocusedChild(), true, 'focus starts in TODO');
    assert.strictEqual(boxOf(screen, 'IN PROGRESS').hasFocusedChild(), false, 'rest unfocused');

    press(screen, 'right', 'right');
    await settle();

    assert.strictEqual(boxOf(screen, 'TODO').hasFocusedChild(), false, 'focus left TODO');
    assert.strictEqual(boxOf(screen, 'IN PROGRESS').hasFocusedChild(), true, 'focus follows Right');

    press(screen, 'q', 'q');
    await board;
  } finally { screen.destroy(); }
}
