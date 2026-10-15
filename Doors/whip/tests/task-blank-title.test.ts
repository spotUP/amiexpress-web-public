/**
 * A rejected save leaves the task exactly as it was.
 *
 * `save()` assigned title, category, priority, points, assignee and
 * projectId onto the Task - which is a reference into DataManager's
 * tasksCache - and only THEN checked the title, returning on an empty one
 * without putting any of it back. Clear the title, Ctrl+Enter, read the
 * error, press Escape: the board and the Discord API both showed a
 * blank-titled task, re-homed to whichever project the picker happened to
 * be resting on. Nothing had rejected anything; the dialog had already
 * written.
 *
 * Driven: a real Screen, the real dialog, real keys. The Task object handed
 * in IS the oracle - it stands in for the cached record.
 */

import assert from 'assert';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { editTask } from '../ui/task-editor';

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

function findByLabel(screen: any, label: string): any {
  let found: any;
  const walk = (el: any): void => {
    if (String(el.options?.label ?? '') === label) found = el;
    (el.children || []).forEach(walk);
  };
  walk(screen);
  return found;
}

export async function clearingTheTitleAndSavingLeavesTheTaskUntouched(): Promise<void> {
  const screen = open();
  const updated: any[] = [];
  const task: any = {
    id: 't1', projectId: 'demo', title: 'A real title', category: 'code',
    status: 'todo', priority: 'legend', points: 40, description: 'body',
    assignedTo: 'u1',
  };
  const before = { ...task };
  const dataManager: any = {
    loadUsers: async () => ({}),
    loadProjects: async () => [BACKLOG, DEMO],
    updateTask: async (t: any) => { updated.push({ ...t }); },
  };

  try {
    const dialog = editTask(screen, task, USER as any, dataManager, {} as any, DEMO as any, undefined);
    await settle();

    const title = findByLabel(screen, ' Title ');
    assert.ok(title, 'the Edit Task dialog is open');
    title.setValue('   ');

    // Move the Project picker OFF the task's own project, so a save that
    // writes before validating re-homes it - which is what used to happen.
    const projectList = findByLabel(screen, ' Project ');
    assert.ok(projectList, 'the Project picker is there');
    projectList.select(0);
    assert.strictEqual(projectList.selected, 0, 'resting on Backlog');

    press(screen, '\r', 'enter', { ctrl: true });
    await settle();
    await settle();

    assert.strictEqual(updated.length, 0, 'a blank title is never stored');
    assert.strictEqual(task.title, before.title, 'the title is not blanked');
    assert.strictEqual(task.projectId, before.projectId, 'the task is not re-homed');
    assert.strictEqual(task.priority, before.priority, 'the priority is not rewritten');
    assert.strictEqual(task.points, before.points, 'the points are not rewritten');

    // The error message takes the first Escape (blessed.message holds the
    // keys until it is dismissed); the dialog takes the second.
    press(screen, '\x1b', 'escape');
    await settle();
    press(screen, '\x1b', 'escape');
    await settle();
    const result = await dialog;
    assert.strictEqual(result, null, 'Escape after the error cancels');
    assert.strictEqual(task.title, before.title, 'and still nothing was written');
    assert.strictEqual(task.projectId, before.projectId, 'still in its own project');
  } finally {
    screen.destroy();
  }
}

/** The happy path still writes everything, so the guard is not a block. */
export async function aValidTitleStillSavesEveryField(): Promise<void> {
  const screen = open();
  const updated: any[] = [];
  const task: any = {
    id: 't2', projectId: 'demo', title: 'Old', category: 'code',
    status: 'todo', priority: 'scener', points: 10, description: '',
  };
  const dataManager: any = {
    loadUsers: async () => ({}),
    loadProjects: async () => [BACKLOG, DEMO],
    updateTask: async (t: any) => { updated.push({ ...t }); },
  };

  try {
    const dialog = editTask(screen, task, USER as any, dataManager, {} as any, DEMO as any, undefined);
    await settle();

    findByLabel(screen, ' Title ').setValue('New title');
    findByLabel(screen, ' Project ').select(0);

    press(screen, '\r', 'enter', { ctrl: true });
    await settle();
    await settle();

    await dialog;
    assert.strictEqual(updated.length, 1, 'one save');
    assert.strictEqual(updated[0].title, 'New title');
    assert.strictEqual(updated[0].projectId, 'backlog', 're-homed as picked');
  } finally {
    screen.destroy();
  }
}
