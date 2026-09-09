import {
  createButton,
} from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { Task, Project, TaskCategory, TaskPriority } from '../types/project';
import type { UserStats } from '../types/user';
import type { DataManager } from '../core/data-manager';
import type { AchievementManager } from '../core/achievements';
import { v4 as uuidv4 } from 'uuid';
import { T } from '../door-theme';

const CATEGORIES: TaskCategory[] = ['code', 'music', 'gfx', 'design', 'effects', 'engine', '3d', 'bug'];
const PRIORITIES: TaskPriority[] = ['lamer', 'scener', 'elite', 'legend'];

export async function createTask(
  screen: Screen,
  project: Project,
  user: UserStats,
  dataManager: DataManager,
  bbsApi?: any
): Promise<void> {
  const newTask: Task = {
    id: uuidv4(),
    projectId: project.id,
    title: '',
    category: 'code',
    status: 'todo',
    priority: 'scener',
    assignedTo: user.userId,
    points: 10,
    description: '',
    createdAt: new Date().toISOString()
  };

  await showTaskEditor(screen, newTask, user, dataManager, true, project, bbsApi);
}

export async function editTask(
  screen: Screen,
  task: Task,
  user: UserStats,
  dataManager: DataManager,
  achievementManager: AchievementManager,
  project?: Project,
  bbsApi?: any
): Promise<void> {
  await showTaskEditor(screen, task, user, dataManager, false, project, bbsApi);
}

async function showTaskEditor(
  screen: Screen,
  task: Task,
  user: UserStats,
  dataManager: DataManager,
  isNew: boolean,
  project?: Project,
  bbsApi?: any
): Promise<void> {
  return new Promise((resolve) => {
    screen.program.enableMouse();

    // Modal container
    const modal = blessed.box({
      parent: screen,
      top: 'center',
      left: 'center',
      width: 68,
      height: 22,
      border: { type: 'line' },
      style: {
        border: { fg: T.accentAlt },
        bg: T.ground
      },
      label: isNew ? ' New Task ' : ' Edit Task ',
      tags: true,
    });

    // Title input - bordered textbox with label on border (WORKING PATTERN)
    const titleInput = blessed.textbox({
      parent: modal,
      top: 1,
      left: 1,
      right: 1,
      height: 3,
      border: { type: 'line' },
      label: ' Title ',
      keys: true,
      mouse: true,
      inputOnFocus: true,
      value: task.title,
      style: {
        fg: T.ink,
        bg: T.ground,
        border: { fg: T.accent },
      }
    });

    // Category list
    const categoryList = blessed.list({
      parent: modal,
      top: 5,
      left: 1,
      width: '48%',
      height: 9,
      border: { type: 'line' },
      label: ' Category ',
      tags: true,
      keys: true,
      vi: true,
      mouse: true,
      focusable: true,
      items: CATEGORIES,
      selected: CATEGORIES.indexOf(task.category),
      style: {
        border: { fg: T.accent },
        selected: { bg: T.accent, fg: T.ground },
        item: { fg: T.ink, bg: T.ground },
        bg: T.ground
      },
    } as any);

    // Priority list
    const priorityList = blessed.list({
      parent: modal,
      top: 5,
      left: '50%',
      right: 1,
      height: 6,
      border: { type: 'line' },
      label: ' Priority ',
      tags: true,
      keys: true,
      vi: true,
      mouse: true,
      focusable: true,
      items: PRIORITIES,
      selected: PRIORITIES.indexOf(task.priority),
      style: {
        border: { fg: T.accent },
        selected: { bg: T.accent, fg: T.ground },
        item: { fg: T.ink, bg: T.ground },
        bg: T.ground
      },
    } as any);

    // Points input - bordered textbox
    const pointsInput = blessed.textbox({
      parent: modal,
      top: 12,
      left: '50%',
      right: 1,
      height: 3,
      border: { type: 'line' },
      label: ' Points ',
      keys: true,
      mouse: true,
      inputOnFocus: true,
      value: task.points.toString(),
      style: {
        fg: T.ink,
        bg: T.ground,
        border: { fg: T.accent },
      }
    });

    // Description input - bordered textbox
    const descInput = blessed.textbox({
      parent: modal,
      top: 15,
      left: 1,
      right: 1,
      height: 3,
      border: { type: 'line' },
      label: ' Description (optional) ',
      keys: true,
      mouse: true,
      inputOnFocus: true,
      value: task.description || '',
      style: {
        fg: T.ink,
        bg: T.ground,
        border: { fg: T.accent },
      }
    });

    // Buttons - bordered height-3 like the SDK ConfirmModal: borderless
    // 1-row buttons never painted (reported with a screenshot, 2026-09-09).
    const saveBtn = createButton({
      parent: modal,
      top: 18,
      left: 15,
      width: 14,
      height: 3,
      content: '[ Save ]',
      align: 'center',
      valign: 'middle',
      border: { type: 'line' },
      keys: true,
      mouse: true,
      style: {
        fg: T.ink,
        bg: T.ok,
        border: { fg: T.ok },
        focus: { bg: 'lightgreen', fg: T.ground },
        hover: { bg: 'lightgreen', fg: T.ground }
      }
    });

    const cancelBtn = createButton({
      parent: modal,
      top: 18,
      left: 38,
      width: 14,
      height: 3,
      content: '[ Cancel ]',
      align: 'center',
      valign: 'middle',
      border: { type: 'line' },
      keys: true,
      mouse: true,
      style: {
        fg: T.ink,
        bg: T.alert,
        border: { fg: T.alert },
        focus: { bg: 'lightred', fg: T.ground },
        hover: { bg: 'lightred', fg: T.ground }
      }
    });

    let closed = false;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      screen.off('keypress', keyHandler);
      screen.remove(modal);
      screen.render();
    };

    const save = async () => {
      task.title = titleInput.getValue();
      task.category = CATEGORIES[categoryList.selected!] as TaskCategory;
      task.priority = PRIORITIES[priorityList.selected!] as TaskPriority;
      task.points = parseInt(pointsInput.getValue()) || 10;
      task.description = descInput.getValue();

      if (!task.title.trim()) {
        const msg = blessed.message({
          parent: screen,
          top: 'center',
          left: 'center',
          width: 'shrink',
          height: 'shrink',
          padding: 2,
          border: { type: 'line' },
          style: { border: { fg: T.alert }, bg: T.ground },
          label: ' Error '
        });
        msg.display('Task title cannot be empty!', () => {
          screen.remove(msg);
          screen.render();
        });
        return;
      }

      if (isNew) {
        await dataManager.addTask(task);
        if (bbsApi?.emitCustomEvent && project) {
          bbsApi.emitCustomEvent('task_created', `Created ${task.category} task "${task.title}"`, {
            projectId: project.id, taskId: task.id, taskCategory: task.category
          });
        }
      } else {
        task.updatedAt = new Date().toISOString();
        await dataManager.updateTask(task);
      }

      cleanup();
      resolve();
    };

    saveBtn.on('press', () => { save(); });
    cancelBtn.on('press', () => { cleanup(); resolve(); });

    // Tab order for the dialog. WHIP runs with focusKeys:false (arrows must
    // never yank focus out of its lists), so the screen's default Tab
    // navigation is off and the dialog advances focus itself down this ring -
    // which is also why a focus TRAP is not used here: a trap suppresses
    // screen-level key handlers, and this dialog's keys live on the screen.
    const focusables: any[] = [titleInput, categoryList, priorityList, pointsInput, descInput, saveBtn, cancelBtn];
    const advanceFrom = (current: any) => {
      if (closed) return;
      const i = focusables.indexOf(current);
      focusables[(i + 1) % focusables.length].focus();
      screen.render();
    };
    const retreatFrom = (current: any) => {
      if (closed) return;
      const i = focusables.indexOf(current);
      focusables[(i - 1 + focusables.length) % focusables.length].focus();
      screen.render();
    };

    // Enter in a text field advances to the next field (the textbox consumes
    // Enter as submit); Enter on a focused button presses it. Ctrl+Enter
    // saves from anywhere.
    titleInput.on('submit', () => advanceFrom(titleInput));
    pointsInput.on('submit', () => advanceFrom(pointsInput));
    descInput.on('submit', () => advanceFrom(descInput));

    const keyHandler = (ch: any, key: any) => {
      if (closed) return;
      if (key.name === 'escape') { cleanup(); resolve(); }
      else if (key.name === 'enter' && key.ctrl) { save(); }
      else if (key.name === 'tab') {
        if (key.shift) retreatFrom(screen.getFocused());
        else advanceFrom(screen.getFocused());
      }
    };

    screen.on('keypress', keyHandler);
    titleInput.focus();
    screen.render();
  });
}
