/**
 * WHIP tasks can choose their project - and leave Backlog.
 *
 * The task dialog pinned every task to the project whose board opened
 * it: a quick-task could never choose a project, and nothing in the
 * door ever re-homed a task, so Backlog tasks were stuck (2026-09-10).
 * The dialog now carries a Project picker for new and edit; an edit
 * that changes it emits task_moved with both ends.
 *
 * Driven: a real Screen, the real dialogs, real keys through
 * program.emit. The DataManager is a stub (door storage I/O has no
 * business in a key-routing test); the bbsApi is a recorded stub.
 */

import assert from 'assert';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createTask, editTask } from '../ui/task-editor';

const BACKLOG = { id: 'backlog', name: 'Backlog', type: 'code', status: 'active' };
const DEMO = { id: 'demo', name: 'Demo', type: 'demo', status: 'active' };
const USER = { userId: 'u1', handle: 'tester' };

function open(): any {
  return new Screen({ title: 'whip', width: 80, height: 25, focusKeys: false } as any);
}

function press(screen: any, ch: string, name: string, extra: any = {}): void {
  screen.program.emit('keypress', ch, { name, full: name, ...extra });
}

const settle = () => new Promise((r) => setTimeout(r, 30));

function stub(calls: { added: any[]; updated: any[]; events: any[] }) {
  return {
    loadUsers: async () => ({}),
    loadProjects: async () => [BACKLOG, DEMO],
    addTask: async (t: any) => { calls.added.push({ ...t }); },
    updateTask: async (t: any) => { calls.updated.push({ ...t }); },
  };
}

const bbsApi = (calls: { added: any[]; updated: any[]; events: any[] }) => ({
  emitCustomEvent: (kind: string, text: string, payload: any) => {
    calls.events.push({ kind, text, payload });
  },
});

/** Modal label text, for the never-silently-elsewhere guarantee. */
function modalLabel(screen: any, word: string): string | undefined {
  let found: string | undefined;
  const walk = (el: any): void => {
    if (String(el.options?.label ?? '').includes(word)) found = String(el.options.label);
    (el.children || []).forEach(walk);
  };
  walk(screen);
  return found;
}

export async function editReHomesTheTaskToThePickedProject(): Promise<void> {
  const screen = open();
  try {
    const calls = { added: [], updated: [], events: [] } as { added: any[]; updated: any[]; events: any[] };
    const task = { id: 't1', projectId: 'backlog', title: 'Stuck task', category: 'code', status: 'todo', priority: 'scener', points: 10, description: '' };
    const done = editTask(screen, task as any, USER as any, stub(calls) as any, {} as any, BACKLOG as any, bbsApi(calls));
    await settle();

    // Tab ring: title -> category -> priority -> project.
    press(screen, '\t', 'tab'); await settle();
    press(screen, '\t', 'tab'); await settle();
    press(screen, '\t', 'tab'); await settle();

    // Down moves Backlog -> Demo in the Project picker...
    press(screen, 'down', 'down'); await settle();
    await settle();
    assert.ok((modalLabel(screen, 'Edit Task') ?? '').includes('Demo'), 'the label follows the picker');

    // ...and Ctrl+Enter saves it there.
    press(screen, '\r', 'enter', { ctrl: true }); await settle();
    await done;

    assert.strictEqual(calls.updated.length, 1, 'one update stored');
    assert.strictEqual(calls.updated[0].projectId, 'demo', 'the task moved to Demo');
    const moved = calls.events.find((e) => e.kind === 'task_moved');
    assert.ok(moved, 'a task_moved event fired');
    assert.strictEqual(moved.payload.fromProjectId, 'backlog');
    assert.strictEqual(moved.payload.toProjectId, 'demo');
  } finally { screen.destroy(); }
}

export async function untouchedPickerKeepsTheProject(): Promise<void> {
  const screen = open();
  try {
    const calls = { added: [], updated: [], events: [] } as { added: any[]; updated: any[]; events: any[] };
    const task = { id: 't1', projectId: 'backlog', title: 'Stays put', category: 'code', status: 'todo', priority: 'scener', points: 10, description: '' };
    const done = editTask(screen, task as any, USER as any, stub(calls) as any, {} as any, BACKLOG as any, bbsApi(calls));
    await settle();

    // Save immediately: the picker was never touched.
    press(screen, '\r', 'enter', { ctrl: true }); await settle();
    await done;

    assert.strictEqual(calls.updated.length, 1, 'one update stored');
    assert.strictEqual(calls.updated[0].projectId, 'backlog', 'the project is untouched');
    assert.ok(!calls.events.some((e) => e.kind === 'task_moved'), 'no move event for a stay');
  } finally { screen.destroy(); }
}

export async function newTaskLandsInThePickedProject(): Promise<void> {
  const screen = open();
  try {
    const calls = { added: [], updated: [], events: [] } as { added: any[]; updated: any[]; events: any[] };
    const done = createTask(screen, BACKLOG as any, USER as any, stub(calls) as any, bbsApi(calls));
    await settle();

    // Title is required: set it through the widget like a caller would
    // through typing (setValue is the textbox's own API).
    const titleBox = (function find(el: any): any {
      if (typeof el.setValue === 'function' && String(el.options?.label ?? '').includes('Title')) return el;
      for (const child of el.children || []) {
        const found = find(child);
        if (found) return found;
      }
      return undefined;
    })(screen);
    assert.ok(titleBox, 'the title input exists');
    titleBox.setValue('A brand new task');

    // Tab ring to the Project picker, down to Demo, save.
    press(screen, '\t', 'tab'); await settle();
    press(screen, '\t', 'tab'); await settle();
    press(screen, '\t', 'tab'); await settle();
    press(screen, 'down', 'down'); await settle();
    await settle();
    press(screen, '\r', 'enter', { ctrl: true }); await settle();
    await done;

    assert.strictEqual(calls.added.length, 1, 'one task stored');
    assert.strictEqual(calls.added[0].projectId, 'demo', 'the new task lands in Demo, not Backlog');
    assert.strictEqual(calls.added[0].title, 'A brand new task');
  } finally { screen.destroy(); }
}
