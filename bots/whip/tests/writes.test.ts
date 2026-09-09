/**
 * Bot Phase 2 writes: custom-id codec, modal shapes, points parsing.
 */
import assert from 'assert';
import {
  buildDeleteConfirm,
  buildMoveSelect,
  buildNewProjectModal,
  buildNewTaskModal,
  buildTaskButtons,
  encodeAction,
  parseAction,
  parsePoints,
  projectChoices,
  taskChoices,
  userChoices,
} from '../src/writes';

export async function customIdsRoundTrip(): Promise<void> {
  for (const action of ['done', 'move', 'del', 'del-yes', 'del-no', 'mv', 'newtask', 'pdel-yes']) {
    const id = `task-${action}-1`;
    assert.deepStrictEqual(parseAction(encodeAction(action, id)), { action, taskId: id });
  }
}

export async function foreignIdsRejected(): Promise<void> {
  assert.strictEqual(parseAction('other:done:x'), null);
  assert.strictEqual(parseAction('w:'), null);
  assert.strictEqual(parseAction('w:no-separator'), null);
  assert.strictEqual(parseAction(''), null);
}

export async function buttonsCarryTaskIds(): Promise<void> {
  const row = buildTaskButtons('t1').toJSON() as any;
  const ids = row.components.map((c: any) => c.custom_id);
  assert.ok(ids.every((id: string) => id.endsWith(':t1')), 'every button names its task');
  const select = buildMoveSelect('t2').toJSON() as any;
  assert.strictEqual(select.components[0].custom_id, 'w:mv:t2');
  assert.deepStrictEqual(
    select.components[0].options.map((o: any) => o.value),
    ['todo', 'in-progress', 'testing', 'done']
  );
  const confirm = buildDeleteConfirm('t3').toJSON() as any;
  assert.deepStrictEqual(
    confirm.components.map((c: any) => c.custom_id),
    ['w:del-yes:t3', 'w:del-no:t3']
  );
}

export async function modalsCarryContext(): Promise<void> {
  const task = buildNewTaskModal('p9').toJSON() as any;
  assert.ok(task.custom_id.endsWith(':p9'), 'task modal remembers its project');
  assert.strictEqual(task.components.length, 5, 'title, category, points, assignee, description');
  const project = buildNewProjectModal().toJSON() as any;
  assert.strictEqual(project.components.length, 3, 'name, type, description');
}

export async function pointsParsing(): Promise<void> {
  assert.strictEqual(parsePoints(undefined), undefined);
  assert.strictEqual(parsePoints(''), undefined);
  assert.strictEqual(parsePoints('  '), undefined);
  assert.strictEqual(parsePoints('25'), 25);
  assert.strictEqual(parsePoints('25.9'), 25);
  assert.throws(() => parsePoints('lots'), /non-negative/);
  assert.throws(() => parsePoints('-3'), /non-negative/);
}

export async function projectChoicesFilter(): Promise<void> {
  const projects = [
    { id: 'p1', name: 'Desert Dream', status: 'active', taskCounts: { total: 2, done: 1 } },
    { id: 'p2', name: 'Backlog', status: 'planning', taskCounts: { total: 0, done: 0 } },
  ];
  assert.strictEqual(projectChoices(projects, '')[0].value, 'p1');
  assert.deepStrictEqual(projectChoices(projects, 'back').map((c) => c.value), ['p2']);
  assert.deepStrictEqual(projectChoices(projects, 'DESERT').map((c) => c.value), ['p1']);
  assert.deepStrictEqual(projectChoices(projects, 'zzz'), []);

  const tasks = [
    { id: 't1', title: 'Fix the scroller', status: 'todo', projectName: 'Desert Dream' },
    { id: 't2', title: 'Pixel logo', status: 'done', projectName: 'Desert Dream' },
  ];
  assert.deepStrictEqual(taskChoices(tasks, 'pixel').map((c) => c.value), ['t2']);
  assert.ok(taskChoices(tasks, '')[0].name.includes('Desert Dream'), 'project shown for context');

  const users = [
    { userId: 'u1', handle: 'spot' },
    { userId: 'u2', handle: 'ace' },
  ];
  assert.deepStrictEqual(userChoices(users, 'spo').map((c) => c.value), ['u1']);

  const many = Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, name: `Project ${i}`, status: 'active', taskCounts: { total: 0, done: 0 } }));
  assert.strictEqual(projectChoices(many, '').length, 25, 'Discord caps at 25');
}
