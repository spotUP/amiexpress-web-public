import {
  createBox,
  createTextbox,
  createButton,
  createList
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
    const modal = createBox({
      fixed: true,
      parent: screen,
      top: 'center',
      left: 'center',
      width: 70,
      height: 22,
      border: { type: 'line' },
      style: {
        border: { fg: 'yellow' },
        bg: 'black'
      },
      label: isNew ? ' New Task ' : ' Edit Task '
    });

    // Title field
    const titleLabel = createBox({
      fixed: true,
      parent: modal,
      top: 1,
      left: 2,
      width: '100%-4',
      height: 1,
      content: 'Title:',
      style: { fg: 'white', bg: 'black' }
    });

    const titleInput = createTextbox({
      parent: modal,
      top: 2,
      left: 2,
      width: '100%-4',
      height: 1,
      keys: true,
      mouse: true,
      inputOnFocus: true,
      value: task.title,
      style: {
        fg: 'white',
        bg: 'blue',
        focus: { bg: 'lightblue', fg: 'black' }
      }
    });

    // Category label
    const categoryLabel = createBox({
      fixed: true,
      parent: modal,
      top: 4,
      left: 2,
      width: '100%-4',
      height: 1,
      content: 'Category:',
      style: { fg: 'white', bg: 'black' }
    });

    // Category list
    const categoryList = createList({
      parent: modal,
      top: 5,
      left: 2,
      width: 30,
      height: 7,
      border: { type: 'line' },
      style: {
        border: { fg: 'cyan' },
        selected: { bg: 'cyan', fg: 'black' },
        item: { fg: 'white' },
        bg: 'black'
      },
      keys: true,
      vi: true,
      mouse: true,
      items: CATEGORIES,
      selected: CATEGORIES.indexOf(task.category)
    });

    // Priority label
    const priorityLabel = createBox({
      fixed: true,
      parent: modal,
      top: 4,
      left: 35,
      width: 30,
      height: 1,
      content: 'Priority:',
      style: { fg: 'white', bg: 'black' }
    });

    // Priority list
    const priorityList = createList({
      parent: modal,
      top: 5,
      left: 35,
      width: 30,
      height: 7,
      border: { type: 'line' },
      style: {
        border: { fg: 'cyan' },
        selected: { bg: 'cyan', fg: 'black' },
        item: { fg: 'white' },
        bg: 'black'
      },
      keys: true,
      vi: true,
      mouse: true,
      items: PRIORITIES,
      selected: PRIORITIES.indexOf(task.priority)
    });

    // Points label
    const pointsLabel = createBox({
      fixed: true,
      parent: modal,
      top: 13,
      left: 2,
      width: 20,
      height: 1,
      content: 'Points:',
      style: { fg: 'white', bg: 'black' }
    });

    const pointsInput = createTextbox({
      parent: modal,
      top: 14,
      left: 2,
      width: 20,
      height: 1,
      keys: true,
      mouse: true,
      inputOnFocus: true,
      value: task.points.toString(),
      style: {
        fg: 'white',
        bg: 'blue',
        focus: { bg: 'lightblue', fg: 'black' }
      }
    });

    // Description label
    const descLabel = createBox({
      fixed: true,
      parent: modal,
      top: 16,
      left: 2,
      width: '100%-4',
      height: 1,
      content: 'Description (optional):',
      style: { fg: 'white', bg: 'black' }
    });

    // Description input
    const descInput = createTextbox({
      parent: modal,
      top: 17,
      left: 2,
      width: '100%-4',
      height: 3,  // Multi-line input
      keys: true,
      mouse: true,
      inputOnFocus: true,
      value: task.description || '',
      style: {
        fg: 'white',
        bg: 'blue',
        focus: { bg: 'lightblue', fg: 'black' }
      }
    });

    // Save button
    const saveBtn = createButton({
      parent: modal,
      bottom: 1,
      left: 15,
      width: 12,
      height: 3,
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

    // Cancel button
    const cancelBtn = createButton({
      parent: modal,
      bottom: 1,
      left: 40,
      width: 12,
      height: 3,
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

    // Save handler
    const save = async () => {
      task.title = titleInput.getValue();
      task.category = CATEGORIES[categoryList.selected!] as TaskCategory;
      task.priority = PRIORITIES[priorityList.selected!] as TaskPriority;
      task.points = parseInt(pointsInput.getValue()) || 10;
      task.description = descInput.getValue();  // Save description

      if (!task.title.trim()) {
        const msg = blessed.message({
          parent: screen,
          top: 'center',
          left: 'center',
          width: 'shrink',
          height: 'shrink',
          padding: 2,
          border: { type: 'line' },
          style: {
            border: { fg: 'red' },
            bg: 'black'
          },
          label: ' Error '
        });

        msg.display('Task title cannot be empty!\n\nPress any key to continue.', () => {
          screen.remove(msg);
          screen.render();
        });

        return;
      }

      if (isNew) {
        await dataManager.addTask(task);

        // Emit event for new task
        if (bbsApi?.emitCustomEvent && project) {
          bbsApi.emitCustomEvent(
            'task_created',
            `Created new ${task.category} task "${task.title}" (${task.points} pts) in "${project.name}"`,
            {
              projectId: project.id,
              projectName: project.name,
              taskId: task.id,
              taskCategory: task.category,
              taskPriority: task.priority,
              points: task.points
            }
          );
        }
      } else {
        task.updatedAt = new Date().toISOString();
        await dataManager.updateTask(task);

        // Emit event for updated task
        if (bbsApi?.emitCustomEvent && project) {
          bbsApi.emitCustomEvent(
            'task_updated',
            `Updated task "${task.title}" in "${project.name}"`,
            {
              projectId: project.id,
              projectName: project.name,
              taskId: task.id,
              taskCategory: task.category
            }
          );
        }
      }

      cleanup();
      resolve();
    };

    saveBtn.on('press', () => {
      save();
    });
    cancelBtn.on('press', () => {
      cleanup();
      resolve();
    });

    // Key handler for ESC and Enter
    const keyHandler = (ch: any, key: any) => {
      if (key.name === 'escape') {
        cleanup();
        resolve();
      } else if (key.name === 'enter' && key.ctrl) {
        save();
      }
    };

    screen.on('keypress', keyHandler);

    // Focus title input initially
    titleInput.focus();
    screen.render();
  });
}
