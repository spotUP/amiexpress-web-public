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
  assert.strictEqual(task.components.length, 4, 'title, category, points, description');
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
