import {
  createBox,
  createList
} from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { Project, Task, TaskStatus } from '../types/project';
import type { UserStats, Achievement } from '../types/user';
import type { DataManager } from '../core/data-manager';
import type { AchievementManager } from '../core/achievements';
import { getPriorityColor, calculateLevel } from '../core/gamification';
import { editTask, createTask } from './task-editor';

const COLUMNS: TaskStatus[] = ['todo', 'in-progress', 'testing', 'done'];
const COLUMN_LABELS = {
  'todo': 'TODO',
  'in-progress': 'IN PROGRESS',
  'testing': 'TESTING',
  'done': 'DONE'
};

export async function showKanbanBoard(
  screen: Screen,
  project: Project,
  user: UserStats,
  dataManager: DataManager,
  achievementManager: AchievementManager,
  bbsApi?: any
): Promise<void> {
  return new Promise(async (resolve) => {
    screen.program.enableMouse();
    screen.clearRegion(0, screen.width, 0, screen.height);
    screen.alloc();
    // Note: Removed 200ms artificial delay for better responsiveness

    let currentColumn = 0;
    let tasks = await dataManager.getTasksForProject(project.id);

    // Get party info if linked
    let partyInfo = '';
    if (project.partyId) {
      const parties = await dataManager.loadParties();
      const party = parties.find(p => p.id === project.partyId);
      if (party) {
        const days = Math.ceil((new Date(party.date).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
        partyInfo = ` | Party: ${party.name} in ${days} days`;
      }
    }

    // Header
    const header = createBox({
      parent: screen,
      top: 0,
      left: 0,
      width: '100%',
      height: 2,
      fixed: true,
      content: `{center}{bold}{cyan-fg}PROJECT: ${project.name}{/cyan-fg}{/bold}${partyInfo}\n` +
               `{center}Kanban Board{/center}`,
      style: { fg: 'white', bg: 'black' }
    });

    // Column containers
    const colWidth = 20;  // Wider columns for better readability (4 × 20 = 80 chars)
    const columnBoxes: any[] = [];
    const columnLists: any[] = [];

    for (let i = 0; i < COLUMNS.length; i++) {
      const status = COLUMNS[i];
      const label = COLUMN_LABELS[status];

      const box = createBox({
        parent: screen,
        top: 3,
        left: i * colWidth,  // No spacing needed - columns are adjacent
        width: colWidth,
        height: screen.height - 6,
        fixed: true,
        border: { type: 'line' },
        label: ` ${label} `,
        style: {
          border: { fg: i === currentColumn ? 'yellow' : 'cyan' },
          bg: 'black'
        }
      });

      const list = createList({
        parent: box,
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        keys: true,
        vi: true,
        mouse: true,
        items: [],
        style: {
          selected: { bg: 'cyan', fg: 'black' },
          item: { fg: 'white' },
          bg: 'black'
        }
      });

      columnBoxes.push(box);
      columnLists.push(list);
    }

    // Footer
    const footer = createBox({
      parent: screen,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 1,
      fixed: true,
      content: `{center}[LEFT/RIGHT] Column  |  [UP/DOWN] Task  |  [Enter] Edit  |  [N] New  |  [M] Move  |  [D] Delete  |  [Q] Back{/center}`,
      style: { fg: 'gray', bg: 'black' }
    });

    // Debounce timer for navigation updates
    let updateTimeout: NodeJS.Timeout | null = null;
    let isUpdating = false;

    const updateListsImmediate = () => {
      // Update UI synchronously without data reload
      for (let i = 0; i < COLUMNS.length; i++) {
        columnBoxes[i].style.border.fg = i === currentColumn ? 'yellow' : 'cyan';
      }
      columnLists[currentColumn].focus();
      screen.render();
    };

    const updateLists = async (immediate: boolean = false) => {
      if (isUpdating && !immediate) return;  // Skip if update already in progress

      // Cancel pending update
      if (updateTimeout) {
        clearTimeout(updateTimeout);
        updateTimeout = null;
      }

      if (immediate) {
        // Immediate update (after data changes)
        isUpdating = true;
        tasks = await dataManager.getTasksForProject(project.id);

        for (let i = 0; i < COLUMNS.length; i++) {
          const status = COLUMNS[i];
          const columnTasks = tasks.filter(t => t.status === status);

          const items = columnTasks.map(task => {
            const priorityColor = getPriorityColor(task.priority);
            return `{${priorityColor}-fg}#${task.id.substring(0, 4)}{/${priorityColor}-fg} ${task.title.substring(0, 14)}\n  [${task.priority}] ${task.points}pts`;
          });

          columnLists[i].setItems(items.length > 0 ? items : ['{gray-fg}(empty){/gray-fg}']);
        }

        // Update column borders to show active column
        for (let i = 0; i < COLUMNS.length; i++) {
          columnBoxes[i].style.border.fg = i === currentColumn ? 'yellow' : 'cyan';
        }

        columnLists[currentColumn].focus();
        screen.render();
        isUpdating = false;
      } else {
        // Debounced update for navigation (50ms delay)
        updateTimeout = setTimeout(async () => {
          updateTimeout = null;
          await updateLists(true);
        }, 50);

        // Update UI immediately for responsiveness
        updateListsImmediate();
      }
    };

    await updateLists(true);  // Initial load

    const cleanup = () => {
      if (updateTimeout) clearTimeout(updateTimeout);  // Clean up debounce timer
      screen.off('keypress', keyHandler);
      screen.remove(header);
      columnBoxes.forEach(box => screen.remove(box));
      screen.remove(footer);
    };

    const keyHandler = (ch: any, key: any) => {
      // Handle synchronous navigation immediately
      if (key.name === 'left' || key.name === 'right') {
        if (key.name === 'left') {
          currentColumn = Math.max(0, currentColumn - 1);
        } else {
          currentColumn = Math.min(COLUMNS.length - 1, currentColumn + 1);
        }
        updateLists(false);  // Debounced update
        return;
      }

      // Handle async operations
      (async () => {
        const columnTasks = tasks.filter(t => t.status === COLUMNS[currentColumn]);

        switch (key.name) {
        case 'enter':
          if (columnTasks.length > 0) {
            const selectedIndex = columnLists[currentColumn].selected || 0;
            const task = columnTasks[selectedIndex];
            await editTask(screen, task, user, dataManager, achievementManager, project, bbsApi);
            await updateLists(true);  // Immediate update after data change
          }
          break;

        case 'n':
          await createTask(screen, project, user, dataManager, bbsApi);
          await updateLists(true);  // Immediate update after data change
          break;

        case 'm':
          if (columnTasks.length > 0) {
            const selectedIndex = columnLists[currentColumn].selected || 0;
            const task = columnTasks[selectedIndex];
            const newStatus = await selectMoveDestination(screen);
            if (newStatus) {
              await moveTask(screen, task, newStatus, dataManager, achievementManager, user, project, bbsApi);
              await updateLists(true);  // Immediate update after data change
            }
          }
          break;

        case 'd':
          if (columnTasks.length > 0) {
            const selectedIndex = columnLists[currentColumn].selected || 0;
            const task = columnTasks[selectedIndex];
            const confirmed = await confirmDelete(screen, task.title);
            if (confirmed) {
              await dataManager.deleteTask(task.id);

              // Emit event for deleted task
              if (bbsApi?.emitCustomEvent) {
                bbsApi.emitCustomEvent(
                  'task_deleted',
                  `Deleted task "${task.title}" from project "${project.name}"`,
                  {
                    projectId: project.id,
                    projectName: project.name,
                    taskId: task.id,
                    taskCategory: task.category
                  }
                );
              }

              await updateLists(true);  // Immediate update after data change
            }
          }
          break;

        case 'q':
        case 'escape':
          if (updateTimeout) clearTimeout(updateTimeout);  // Clean up timer
          cleanup();
          resolve();
          break;
        }
      })();
    };

    screen.on('keypress', keyHandler);
  });
}

async function selectMoveDestination(screen: Screen): Promise<TaskStatus | null> {
  return new Promise((resolve) => {
    const modal = createBox({
      parent: screen,
      top: 'center',
      left: 'center',
      width: 40,
      height: 10,
      fixed: true,
      border: { type: 'line' },
      label: ' Move Task To ',
      style: {
        border: { fg: 'yellow' },
        bg: 'black'
      }
    });

    const list = createList({
      parent: modal,
      top: 1,
      left: 1,
      width: '100%-2',
      height: '100%-2',
      keys: true,
      vi: true,
      mouse: true,
      items: COLUMNS.map(col => COLUMN_LABELS[col]),
      style: {
        selected: { bg: 'cyan', fg: 'black' },
        item: { fg: 'white' },
        bg: 'black'
      }
    });

    const cleanup = () => {
      screen.off('keypress', keyHandler);
      screen.remove(modal);
      screen.render();
    };

    list.on('select', (item: any, index: number) => {
      cleanup();
      resolve(COLUMNS[index]);
    });

    const keyHandler = (ch: any, key: any) => {
      if (key.name === 'escape' || key.name === 'q') {
        cleanup();
        resolve(null);
      }
    };

    screen.on('keypress', keyHandler);
    list.focus();
    screen.render();
  });
}

async function moveTask(
  screen: Screen,
  task: Task,
  newStatus: TaskStatus,
  dataManager: DataManager,
  achievementManager: AchievementManager,
  user: UserStats,
  project: Project,
  bbsApi?: any
): Promise<void> {
  const oldStatus = task.status;
  task.status = newStatus;
  task.updatedAt = new Date().toISOString();

  // Check if task moved to "done" - award points and check achievements
  if (newStatus === 'done' && oldStatus !== 'done') {
    task.completedAt = new Date().toISOString();

    // Award points to user
    const userData = await dataManager.getUser(user.userId);
    if (userData) {
      userData.points += task.points;
      userData.tasksCompleted += 1;
      userData.level = calculateLevel(userData.points);
      await dataManager.updateUser(userData);

      // Emit event for completed task
      if (bbsApi?.emitCustomEvent) {
        bbsApi.emitCustomEvent(
          'task_completed',
          `Completed task "${task.title}" (+${task.points} pts) in "${project.name}"`,
          {
            projectId: project.id,
            projectName: project.name,
            taskId: task.id,
            taskCategory: task.category,
            points: task.points,
            totalPoints: userData.points,
            level: userData.level
          }
        );
      }

      // Check achievements
      const newAchievements = await achievementManager.checkAchievements(userData);

      // Show achievement notifications if any were unlocked
      if (newAchievements.length > 0) {
        const achievements = await dataManager.loadAchievements();
        for (const achievementId of newAchievements) {
          const achievement = achievements[achievementId];
          if (achievement) {
            await showAchievementUnlock(screen, achievement);

            // Emit event for unlocked achievement
            if (bbsApi?.emitCustomEvent) {
              bbsApi.emitCustomEvent(
                'achievement_unlocked',
                `Unlocked achievement "${achievement.name}" (+${achievement.points} pts)`,
                {
                  achievementId: achievement.id,
                  achievementName: achievement.name,
                  points: achievement.points,
                  category: achievement.category,
                  totalPoints: userData.points
                }
              );
            }
          }
        }
      }
    }
  } else if (newStatus !== oldStatus) {
    // Emit event for task moved to different column
    if (bbsApi?.emitCustomEvent) {
      bbsApi.emitCustomEvent(
        'task_moved',
        `Moved task "${task.title}" from ${oldStatus} to ${newStatus}`,
        {
          projectId: project.id,
          projectName: project.name,
          taskId: task.id,
          fromStatus: oldStatus,
          toStatus: newStatus
        }
      );
    }
  }

  await dataManager.updateTask(task);
}

async function confirmDelete(screen: Screen, taskTitle: string): Promise<boolean> {
  return new Promise((resolve) => {
    const question = blessed.question({
      parent: screen,
      top: 'center',
      left: 'center',
      width: 60,
      height: 7,
      border: { type: 'line' },
      style: {
        border: { fg: 'red' },
        bg: 'black'
      },
      label: ' Confirm Delete '
    });

    question.ask(`Delete task "${taskTitle}"?\n\n(Y/N)`, (answer: boolean) => {
      screen.remove(question);
      screen.render();
      resolve(answer);
    });
  });
}

async function showAchievementUnlock(screen: Screen, achievement: Achievement): Promise<void> {
  return new Promise((resolve) => {
    const msg = blessed.message({
      parent: screen,
      top: 'center',
      left: 'center',
      width: 60,
      height: 10,
      border: { type: 'line' },
      style: {
        border: { fg: 'yellow' },
        bg: 'black'
      },
      label: ' Achievement Unlocked! '
    });

    const content = `{center}{bold}{green-fg}${achievement.icon} ${achievement.name}{/green-fg}{/bold}{/center}\n\n` +
                   `{center}${achievement.description}{/center}\n\n` +
                   `{center}{yellow-fg}+${achievement.points} points{/yellow-fg}{/center}\n\n` +
                   `{center}Press any key to continue{/center}`;

    msg.display(content, () => {
      screen.remove(msg);
      screen.render();
      resolve();
    });
  });
}
