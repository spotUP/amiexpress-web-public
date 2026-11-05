/**
 * Kanban I shows the selected task's details, read-only.
 *
 * Sysop, 2026-09-28: "in the kanban view i need to be able to view the
 * details of a task". Cards show the title only and Enter opens the editor;
 * I opens every field - title and description in full, status, priority,
 * points, category, assignee, project, dates - and Escape or Q closes it
 * back onto the board without leaving it or changing anything.
 */
import assert from 'assert';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { showKanbanBoard } from '../ui/kanban-board';
import { formatTaskDetails } from '../ui/task-details';

const settle = () => new Promise((r) => setTimeout(r, 40));

function press(screen: any, ch: string, name: string): void {
  screen.program.emit('keypress', ch, { name, full: name });
}

const stored: any = {
  id: 't1', projectId: 'p1', title: 'Paste support in Whip, for every text field the door has',
  category: 'code', status: 'in-progress', priority: 'elite', points: 25,
  description: 'Clipboard paste into the title and description fields.',
  assignedTo: 'u1', createdAt: '2026-09-26T10:58:40.497Z', updatedAt: '2026-09-27T23:03:20.281Z',
};

function dataManager(written: any[]): any {
  return {
    getTasksForProject: async () => [stored],
    loadParties: async () => [],
    loadUsers: async () => ({ u1: { userId: 'u1', handle: 'spot' } }),
    loadProjects: async () => [{ id: 'p1', name: 'AmiExpress-Web' }],
    updateTask: async (t: any) => { written.push(t); },
    getUser: async () => null,
  };
}

function detailsModal(screen: any): any {
  let found: any;
  const walk = (el: any): void => {
    if (String(el.options?.title ?? el.options?.label ?? '').includes('Task Details')) found = el;
    (el.children || []).forEach(walk);
  };
  walk(screen);
  return found;
}

function allText(el: any): string {
  const out: string[] = [];
  const walk = (e: any): void => {
    if (typeof e.content === 'string') out.push(e.content);
    (e.children || []).forEach(walk);
  };
  walk(el);
  return out.join('\n').replace(/\x1b\[[0-9;]*m/g, '').replace(/\{[^}]*\}/g, '');
}

export async function theDetailsNameEveryField(): Promise<void> {
  const text = formatTaskDetails({ ...stored, completedAt: '2026-09-28T08:00:00.000Z' },
    { assignee: 'spot', project: 'AmiExpress-Web' });
  for (const want of [
    'Paste support in Whip, for every text field the door has',
    'IN PROGRESS', 'elite', '25', 'code', 'spot', 'AmiExpress-Web',
    '2026-09-26 10:58', '2026-09-27 23:03', '2026-09-28 08:00',
    'Clipboard paste into the title and description fields.',
  ]) {
    assert.ok(text.includes(want), `the details show ${want}:\n${text}`);
  }
  assert.ok(formatTaskDetails({ ...stored, description: '', assignedTo: undefined }).includes('Unassigned'),
    'no assignee reads as Unassigned');
}

export async function iOpensTheDetailsAndEscapeOrQClosesThemOntoTheBoard(): Promise<void> {
  const written: any[] = [];
  const screen = new Screen({ title: 'whip', width: 80, height: 25, focusKeys: false } as any);
  try {
    let left = false;
    const board = showKanbanBoard(screen, { id: 'p1', name: 'AmiExpress-Web' } as any, { userId: 'u1' } as any,
      dataManager(written), {} as any).then(() => { left = true; });
    await settle();
    await settle();

    // IN PROGRESS is the second column.
    press(screen, 'right', 'right');
    await settle();
    for (const close of [['\x1b', 'escape'], ['q', 'q']]) {
      press(screen, 'i', 'i');
      await settle();
      await settle();
      const modal = detailsModal(screen);
      assert.ok(modal && !modal.hidden, 'I opened the details');
      const text = allText(modal);
      assert.ok(text.includes('Paste support in Whip'), 'with the title');
      assert.ok(text.includes('elite') && text.includes('25') && text.includes('spot'), `and the fields: ${text}`);
      assert.ok(!String(allText(screen)).includes('Edit Task'), 'no editor opened');

      press(screen, close[0], close[1]);
      await settle();
      await settle();
      const after = detailsModal(screen);
      assert.ok(!after || after.hidden, `${close[1]} closed the details`);
      assert.strictEqual(left, false, `${close[1]} did not also leave the board`);
    }
    assert.strictEqual(written.length, 0, 'viewing wrote nothing');

    press(screen, '\x1b', 'escape');
    await board;
  } finally {
    screen.destroy();
  }
}
