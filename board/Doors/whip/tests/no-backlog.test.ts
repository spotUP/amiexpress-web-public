/**
 * There is no Backlog.
 *
 * The door created a "Backlog" project on every start to catch quick tasks;
 * the sysop wanted it gone (2026-09-28: "i still see the backlog it should be
 * removed"). A quick task now opens on the project the session last used, or
 * the first active one. An existing Backlog is removed on start - but only
 * while it holds no tasks, so nobody's work disappears.
 */
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DataManager } from '../core/data-manager';
import { quickTaskProject, retireEmptyBacklog } from '../core/quick-task';

const project = (id: string, status = 'active'): any => ({ id, name: id, type: 'code', status, createdAt: '', updatedAt: '' });

export async function aQuickTaskOpensOnTheLastProjectOrTheFirstActive(): Promise<void> {
  const projects = [project('old', 'released'), project('demo'), project('kling')];
  assert.strictEqual(quickTaskProject(projects, 'kling')?.id, 'kling');
  assert.strictEqual(quickTaskProject(projects)?.id, 'demo');
  assert.strictEqual(quickTaskProject([]), null);
}

export async function anEmptyBacklogIsRemovedAndOneWithTasksIsKept(): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whip-backlog-'));
  try {
    const dm = new DataManager(dir);
    await dm.addProject(project('backlog'));
    await dm.addProject(project('demo'));
    assert.strictEqual(await retireEmptyBacklog(dm), true);
    assert.deepStrictEqual((await dm.loadProjects()).map((p) => p.id), ['demo']);

    await dm.addProject(project('backlog'));
    await dm.addTask({ id: 't1', projectId: 'backlog', title: 'keep me', status: 'todo' } as any);
    assert.strictEqual(await retireEmptyBacklog(dm), false);
    assert.ok((await dm.loadProjects()).some((p) => p.id === 'backlog'), 'a Backlog with tasks stays');
    assert.strictEqual((await dm.loadTasks()).length, 1, 'and so do its tasks');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
