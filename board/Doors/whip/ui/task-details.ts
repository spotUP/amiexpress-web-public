/**
 * A task's details, read-only (sysop, 2026-09-28: "in the kanban view i need
 * to be able to view the details of a task").
 *
 * Kanban cards show the title only, and Enter opens the EDITOR - a form, with
 * the description in a one-row field. This is the other half: every field,
 * the title and the description in full, nothing editable. It is the SDK's
 * DocModal, which traps focus, scrolls, closes on Escape or Q and hands focus
 * back; the door only supplies the text.
 */
import { DocModal } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { Task, TaskStatus } from '../types/project';
import type { DataManager } from '../core/data-manager';
import { modalSize } from './layout';
import { T } from '../door-theme';

/** The status as the board's column heading names it. */
const STATUS_LABELS: Record<TaskStatus, string> = {
  'todo': 'TODO',
  'in-progress': 'IN PROGRESS',
  'testing': 'TESTING',
  'done': 'DONE',
};

/** An ISO time as `YYYY-MM-DD HH:MM` (UTC, as stored). */
function when(iso: string | undefined): string {
  return iso ? iso.slice(0, 16).replace('T', ' ') : '-';
}

/**
 * The details text. Pure, so what the view shows is tested, not eyeballed.
 * Names are looked up by the caller: a missing handle or project shows its
 * raw id rather than nothing, so an unknown assignee is still visible.
 */
export function formatTaskDetails(
  task: Task,
  names: { assignee?: string; project?: string } = {},
): string {
  const assignee = task.assignedTo ? (names.assignee ?? task.assignedTo) : 'Unassigned';
  const rows: Array<[string, string]> = [
    ['Title', task.title],
    ['Status', STATUS_LABELS[task.status] ?? task.status],
    ['Priority', task.priority],
    ['Points', String(task.points)],
    ['Category', task.category],
    ['Assignee', assignee],
    ['Project', names.project ?? task.projectId],
    ['Created', when(task.createdAt)],
    ['Updated', when(task.updatedAt)],
  ];
  if (task.completedAt) rows.push(['Completed', when(task.completedAt)]);
  const width = Math.max(...rows.map(([label]) => label.length)) + 2;
  const body = rows.map(([label, value]) => `${`${label}:`.padEnd(width)}${value}`);
  const description = task.description?.trim() ? task.description : '(none)';
  return [...body, '', 'Description:', description].join('\n');
}

/**
 * Show the details over the board. Resolves when the caller closes it, so the
 * board can hold its own keys for exactly that long.
 */
export async function showTaskDetails(
  screen: Screen,
  task: Task,
  dataManager: DataManager,
): Promise<void> {
  const names: { assignee?: string; project?: string } = {};
  try {
    const users = await dataManager.loadUsers();
    names.assignee = Object.values(users).find((u) => u.userId === task.assignedTo)?.handle;
  } catch { /* the id is shown instead */ }
  try {
    names.project = (await dataManager.loadProjects()).find((p) => p.id === task.projectId)?.name;
  } catch { /* the id is shown instead */ }

  const content = formatTaskDetails(task, names);
  // Border top and bottom, the footer, and a row of air - the same sum the
  // card lobby's text windows use - capped by the screen.
  const size = modalSize(64, content.split('\n').length + 5, screen.width, screen.height - 2);

  return new Promise((resolve) => {
    const modal: any = new DocModal({
      parent: screen as any,
      top: 'center',
      left: 'center',
      width: size.width,
      height: size.height,
      title: ' Task Details ',
      content,
      footerText: 'Escape or Q: Close   Up/Down: Scroll',
      mobileFooterText: 'Escape: Close',
      contentStyle: { fg: T.ink, bg: T.ground },
      footerStyle: { fg: T.dim, bg: T.ground },
      onClose: () => {
        screen.remove(modal);
        screen.render();
        resolve();
      },
    } as any);
    modal.display();
    screen.render();
  });
}
