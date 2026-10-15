/**
 * Kanban Edit and Move are two keys: Enter edits, M moves.
 *
 * Sysop, 2026-09-27: Edit landed in MOVE mode and needed one more key to
 * reach the title. The legend said "Enter: Edit", but Enter picked the card
 * up into the keyboard carry, whose own legend then offered E to edit. Enter
 * now opens the editor straight away, and M is the one key into move mode.
 *
 * The editor Enter opens is also the task's detail view: cards show the
 * title only since the same day, so priority, points and assignee must be
 * readable there.
 *
 * Driven: a real board, real keys through program.emit, the dialog's own
 * widgets and the footer's drawn text read back.
 */

import assert from 'assert';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { showKanbanBoard } from '../ui/kanban-board';

function open(width = 80): any {
  // responsive:true or the SDK Screen ignores `width` and opens at 80.
  return new Screen({ title: 'whip', width, height: 25, focusKeys: false, responsive: width !== 80 } as any);
}

function press(screen: any, ch: string, name: string, extra: any = {}): void {
  screen.program.emit('keypress', ch, { name, full: name, ...extra });
}

const settle = () => new Promise((r) => setTimeout(r, 30));

const project: any = { id: 'p1', name: 'Demo', type: 'demo', status: 'active' };
const user: any = { userId: 'u1', handle: 'spot' };

function storedTask(): any {
  return {
    id: 't1', projectId: 'p1', title: 'Edit me', category: 'gfx',
    status: 'todo', priority: 'legend', points: 40, description: 'the body',
    assignedTo: 'u1',
  };
}

function dataManager(stored: any): any {
  return {
    getTasksForProject: async () => [stored],
    loadParties: async () => [],
    loadUsers: async () => ({ u1: { userId: 'u1', handle: 'spot' } }),
    loadProjects: async () => [project],
    updateTask: async (task: any) => { Object.assign(stored, task); },
    getUser: async () => null,
  };
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

function hasLabelContaining(screen: any, text: string): boolean {
  let found = false;
  const walk = (el: any): void => {
    if (String(el.options?.label ?? '').includes(text)) found = true;
    (el.children || []).forEach(walk);
  };
  walk(screen);
  return found;
}

/** Every element's drawn content, tags and colour codes stripped. */
function allText(screen: any): string {
  const out: string[] = [];
  const walk = (el: any): void => {
    if (typeof el.content === 'string') out.push(el.content);
    (el.children || []).forEach(walk);
  };
  walk(screen);
  return out.join('\n').replace(/\x1b\[[0-9;]*m/g, '').replace(/\{[^}]*\}/g, '');
}

export async function enterOpensTheEditorNotMoveMode(): Promise<void> {
  const stored = storedTask();
  const screen = open();
  try {
    const board = showKanbanBoard(screen, project, user, dataManager(stored), {} as any);
    await settle();
    await settle();

    press(screen, '\r', 'enter');
    await settle();
    await settle();

    assert.ok(hasLabelContaining(screen, 'Edit Task'), 'one Enter opened the editor');
    assert.ok(!/Enter:\s*Drop/.test(allText(screen)), 'and the board is not in move mode behind it');

    // The editor is the detail view: what the card no longer shows is here.
    const priority = findByLabel(screen, ' Priority ');
    const points = findByLabel(screen, ' Points ');
    const assignee = findByLabel(screen, ' Assignee ');
    assert.ok(priority && points && assignee, 'priority, points and assignee fields are shown');
    assert.strictEqual(String(priority.items[priority.selected]), 'legend', 'the priority is the task\'s');
    assert.strictEqual(points.getValue(), '40', 'the points are the task\'s');
    assert.ok(String(assignee.items[assignee.selected]).includes('spot'), 'the assignee is named');

    press(screen, '\x1b', 'escape');
    await settle();
    await settle();
    assert.strictEqual(stored.status, 'todo', 'nothing moved');
    press(screen, '\x1b', 'escape');
    await board;
  } finally {
    screen.destroy();
  }
}

export async function theLegendNamesEditAndMoveAtFortyColumns(): Promise<void> {
  const stored = storedTask();
  const screen = open(40);
  assert.strictEqual(screen.width, 40, 'the board really opens at 40 columns');
  try {
    const board = showKanbanBoard(screen, project, user, dataManager(stored), {} as any);
    await settle();
    await settle();

    const text = allText(screen);
    assert.ok(/Enter:\s*Edit/.test(text), `the 40-column legend says Enter is Edit: ${text.slice(-200)}`);
    assert.ok(/M:\s*Move/.test(text), 'and M is Move');
    // The read-only view is named at forty columns too (sysop, 2026-09-28).
    assert.ok(/I:\s*Info/.test(text), 'and I is Info');
    assert.ok(!/Arr:\s*Move/.test(text), 'arrows are not advertised as Move');

    press(screen, '\x1b', 'escape');
    await board;
  } finally {
    screen.destroy();
  }
}
