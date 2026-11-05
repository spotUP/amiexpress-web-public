/**
 * ESC out of the new-task dialog creates nothing and says nothing.
 *
 * The quick-task flow used to congratulate the caller on every exit
 * because createTask resolved void: app.ts could not tell Save from ESC
 * (sysop, 2026-09-10). It resolves the task, or null.
 */
import assert from 'assert';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createTask } from '../ui/task-editor';

const dataManager: any = { loadParties: async () => [], addTask: async () => { throw new Error('must not store on cancel'); } };
const project: any = { id: 'p1', name: 'Test', type: 'demo', status: 'planning' };
const user: any = { userId: 'u1' };
const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function escOutCreatesNothing(): Promise<void> {
  const screen: any = new Screen({ title: 'whip', width: 80, height: 25, focusKeys: false } as any);
  try {
    const done = createTask(screen, project, user, dataManager);
    await settle(50);
    screen.program.emit('keypress', '\x1b', { name: 'escape', full: 'escape' });
    assert.strictEqual(await done, null);
  } finally {
    screen.destroy();
  }
}
