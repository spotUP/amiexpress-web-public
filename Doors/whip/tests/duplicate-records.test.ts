/**
 * One record per id, whatever calls the store and whatever is on disk.
 *
 * The live board held project 'Demo System' twice and the tasks 'Paste
 * support in Whip' and 'Add support for private confereces' twice
 * (2026-09-28): identical copies, side by side - the SAME object pushed twice.
 * A closed task or project dialog still held focus, so the caller's next
 * Enter pressed its Save again and `add*` appended a record that was already
 * in the list. Every later save (a Kanban move among them) wrote the twins.
 *
 * Three layers, one test each where it lives:
 *   - the dialogs: a second Enter after closing saves nothing;
 *   - the store: adding a stored record, then moving it, keeps one copy;
 *   - the file: a store that already holds twins loads - and saves - as one,
 *     keeping the most recently changed copy, so the live board heals itself.
 */
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { DataManager } from '../core/data-manager';
import { createTask } from '../ui/task-editor';
import { createProject } from '../ui/project-editor';
import { createProject as createProjectFromList } from '../ui/project-list';

const settle = () => new Promise((r) => setTimeout(r, 30));

function press(screen: any, ch: string, name: string, extra: any = {}): void {
  screen.program.emit('keypress', ch, { name, full: name, ...extra });
}

function type(screen: any, text: string): void {
  for (const ch of text) press(screen, ch, ch.toLowerCase());
}

function open(): any {
  return new Screen({ title: 'whip', width: 80, height: 25, focusKeys: false } as any);
}

function findByContent(screen: any, text: string): any {
  let found: any;
  const walk = (el: any): void => {
    if (String(el.content ?? '').includes(text)) found = el;
    (el.children || []).forEach(walk);
  };
  walk(screen);
  return found;
}

/** Where the SDK Storage put a store's JSON file under a base dir. */
function storeFile(dir: string, name: string): string {
  const walk = (d: string): string | undefined => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) { const hit = walk(p); if (hit) return hit; }
      else if (entry.name === `${name}.json`) return p;
    }
    return undefined;
  };
  const found = walk(dir);
  assert.ok(found, `${name}.json was written under ${dir}`);
  return found!;
}

function task(id: string, extra: any = {}): any {
  return {
    id, projectId: 'p1', title: `Task ${id}`, category: 'code', status: 'todo',
    priority: 'scener', points: 10, description: '', createdAt: '2026-09-26T10:58:40.497Z',
    ...extra,
  };
}

export async function aSecondEnterAfterTheNewTaskDialogClosedAddsNothing(): Promise<void> {
  const screen = open();
  const added: any[] = [];
  const dm: any = {
    loadUsers: async () => ({}),
    loadProjects: async () => [{ id: 'p1', name: 'Demo' }],
    addTask: async (t: any) => { added.push(t); },
  };
  try {
    const dialog = createTask(screen, { id: 'p1', name: 'Demo' } as any, { userId: 'u1' } as any, dm);
    await settle();
    type(screen, 'Paste support');
    press(screen, '\r', 'enter');
    await dialog;
    assert.strictEqual(added.length, 1, 'the first Enter saved it');

    // The dialog is gone; its title input still holds focus.
    press(screen, '\r', 'enter');
    await settle();
    await settle();
    assert.strictEqual(added.length, 1, 'a second Enter after the dialog closed adds nothing');
  } finally {
    screen.destroy();
  }
}

export async function aSecondEnterAfterTheNewProjectDialogClosedAddsNothing(): Promise<void> {
  const screen = open();
  const added: any[] = [];
  const dm: any = {
    loadParties: async () => [],
    addProject: async (p: any) => { added.push(p); },
    updateUser: async () => {},
  };
  try {
    const dialog = createProject(screen, { userId: 'u1' } as any, dm);
    await settle();
    type(screen, 'Demo System');
    // Enter on the Save button, the way the caller reaches it with Tab.
    const save = findByContent(screen, '[ Save ]');
    assert.ok(save, 'the dialog has a Save button');
    save.focus();
    press(screen, '\r', 'enter');
    await dialog;
    assert.strictEqual(added.length, 1, 'Save saved it');

    // The dialog is gone; its Save button still holds focus.
    press(screen, '\r', 'enter');
    await settle();
    await settle();
    assert.strictEqual(added.length, 1, 'a second Enter after the dialog closed adds nothing');
  } finally {
    screen.destroy();
  }
}

/** The project list has its own New Project dialog, with the same hole. */
export async function aSecondEnterAfterTheProjectListDialogClosedAddsNothing(): Promise<void> {
  const screen = open();
  const added: any[] = [];
  const dm: any = {
    loadParties: async () => [],
    addProject: async (p: any) => { added.push(p); },
    updateUser: async () => {},
  };
  try {
    const dialog = createProjectFromList(screen, { userId: 'u1' } as any, dm, {} as any);
    await settle();
    type(screen, 'Demo System');
    const save = findByContent(screen, '[ Save ]') ?? findByContent(screen, 'Save');
    assert.ok(save, 'the dialog has a Save button');
    save.focus();
    press(screen, '\r', 'enter');
    await dialog;
    assert.strictEqual(added.length, 1, 'Save saved it');

    press(screen, '\r', 'enter');
    await settle();
    await settle();
    assert.strictEqual(added.length, 1, 'a second Enter after the dialog closed adds nothing');
  } finally {
    screen.destroy();
  }
}

export async function addingAStoredTaskAgainThenMovingItKeepsOneRecord(): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whip-dup-'));
  try {
    const dm = new DataManager(dir);
    const t = task('68be93e8');
    await dm.addTask(t);
    await dm.addTask(t); // the double Save
    t.status = 'in-progress';
    t.updatedAt = '2026-09-27T23:03:20.281Z';
    await dm.updateTask(t); // the Kanban move

    const cached = (await dm.loadTasks()).filter((x) => x.id === '68be93e8');
    assert.strictEqual(cached.length, 1, 'one record in the store');
    const onDisk = JSON.parse(fs.readFileSync(storeFile(dir, 'tasks'), 'utf8'));
    const rows = (Array.isArray(onDisk) ? onDisk : onDisk.data).filter((x: any) => x.id === '68be93e8');
    assert.strictEqual(rows.length, 1, 'one record in the file');
    assert.strictEqual(rows[0].status, 'in-progress', 'and it is the moved one');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export async function aStoreThatAlreadyHoldsTwinsLoadsAndSavesAsOne(): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whip-dup-'));
  try {
    // Let Storage lay the files out, then write the live board's shape in.
    const seed = new DataManager(dir);
    await seed.saveTasks([task('seed')]);
    await seed.saveProjects([{ id: 'seed', name: 'Seed' } as any]);
    const tasksPath = storeFile(dir, 'tasks');
    const projectsPath = storeFile(dir, 'projects');
    const wrap = (raw: string, rows: any[]) => {
      const was = JSON.parse(raw);
      return JSON.stringify(Array.isArray(was) ? rows : { ...was, data: rows }, null, 2);
    };
    const older = task('39263946', { title: 'Add support for private confereces' });
    const newer = { ...older, status: 'in-progress', updatedAt: '2026-09-27T23:03:20.281Z' };
    fs.writeFileSync(tasksPath, wrap(fs.readFileSync(tasksPath, 'utf8'), [task('a'), older, newer, task('b')]));
    const demo = { id: '8d85d07d', name: 'Demo System', createdAt: '2026-09-26T10:59:15.197Z', updatedAt: '2026-09-26T10:59:15.197Z' };
    fs.writeFileSync(projectsPath, wrap(fs.readFileSync(projectsPath, 'utf8'), [demo, { ...demo }]));

    const dm = new DataManager(dir);
    const tasks = await dm.loadTasks();
    assert.deepStrictEqual(tasks.map((t) => t.id), ['a', '39263946', 'b'], 'one copy, in its first place');
    assert.strictEqual(tasks[1].status, 'in-progress', 'the most recently updated copy is kept');
    assert.strictEqual((await dm.loadProjects()).length, 1, 'the twin project loads as one');

    // The next write heals the file.
    await dm.updateTask(tasks[0]);
    const healed = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
    const rows = Array.isArray(healed) ? healed : healed.data;
    assert.strictEqual(rows.filter((x: any) => x.id === '39263946').length, 1, 'the file holds one after a save');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
