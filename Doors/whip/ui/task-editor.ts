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

const CATEGORIES: TaskCategory[] = ['code', 'music', 'gfx', 'design', 'effects', 'engine', '3d'];
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
        border: { fg: 'yellow' },
        bg: 'black'
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
        fg: 'white',
        bg: 'black',
        border: { fg: 'cyan' },
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
        border: { fg: 'cyan' },
        selected: { bg: 'cyan', fg: 'black' },
        item: { fg: 'white', bg: 'black' },
        bg: 'black'
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
        border: { fg: 'cyan' },
        selected: { bg: 'cyan', fg: 'black' },
        item: { fg: 'white', bg: 'black' },
        bg: 'black'
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
        fg: 'white',
        bg: 'black',
        border: { fg: 'cyan' },
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
        fg: 'white',
        bg: 'black',
        border: { fg: 'cyan' },
      }
    });

    // Buttons
    const saveBtn = createButton({
      parent: modal,
      top: 19,
      left: 15,
      width: 12,
      height: 1,
      content: ' Save ',
      align: 'center',
      keys: true,
      mouse: true,
      style: {
        fg: 'white',
        bg: 'green',
        focus: { bg: 'lightgreen', fg: 'black' },
        hover: { bg: 'lightgreen', fg: 'black' }
      }
    });

    const cancelBtn = createButton({
      parent: modal,
      top: 19,
      left: 38,
      width: 12,
      height: 1,
      content: ' Cancel ',
      align: 'center',
      keys: true,
      mouse: true,
      style: {
        fg: 'white',
        bg: 'red',
        focus: { bg: 'lightred', fg: 'black' },
        hover: { bg: 'lightred', fg: 'black' }
      }
    });

    const cleanup = () => {
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
          style: { border: { fg: 'red' }, bg: 'black' },
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

    const keyHandler = (ch: any, key: any) => {
      if (key.name === 'escape') { cleanup(); resolve(); }
      else if (key.name === 'enter' && key.ctrl) { save(); }
    };

    screen.on('keypress', keyHandler);
    titleInput.focus();
    screen.render();
  });
}
