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
const COLUMN_LABELS: Record<TaskStatus, string> = {
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

    let currentColumn = 0;
    let tasks = await dataManager.getTasksForProject(project.id);

    // Drag and drop state
    let dragState: {
      active: boolean;
      task: Task | null;
      fromColumn: number;
      fromIndex: number;
      ghost: any;
    } = {
      active: false,
      task: null,
      fromColumn: -1,
      fromIndex: -1,
      ghost: null
    };

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

    // Header - NOT focusable
    const header = createBox({
      parent: screen,
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      fixed: true,
      border: { type: 'line' },
      content: `{center}{bold}{cyan-fg}PROJECT: ${project.name}{/cyan-fg}{/bold} - Kanban Board${partyInfo}{/center}\n` +
               `{center}Tasks: {bold}${tasks.length}{/bold} | Todo: {bold}${tasks.filter(t => t.status === 'todo').length}{/bold} | In Progress: {bold}${tasks.filter(t => t.status === 'in-progress').length}{/bold} | Done: {bold}${tasks.filter(t => t.status === 'done').length}{/bold}{/center}`,
      style: { fg: 'white', bg: 'black', border: { fg: 'cyan' } },
      tags: true,
      focusable: false,
      mouse: false,
      clickable: false,
    });

    // Column containers - calculate width based on screen width
    // Leave 1 char margin on right to ensure border is visible
    const totalWidth = screen.width - 1;
    const colWidth = Math.floor(totalWidth / 4);
    const columnBoxes: any[] = [];
    const columnLists: any[] = [];
    const leftMargin = 0;

    for (let i = 0; i < COLUMNS.length; i++) {
      const status = COLUMNS[i];
      const label = COLUMN_LABELS[status];

      const box = createBox({
        parent: screen,
        top: 3,
        left: leftMargin + (i * colWidth),
        width: colWidth,
        height: '100%-6',
        fixed: true,
        border: { type: 'line' },
        label: ` ${label} `,
        style: {
          border: { fg: i === currentColumn ? 'yellow' : 'cyan' },
          bg: 'black'
        },
        focusable: false,
        mouse: false,
        clickable: false,
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

      // Store column index for drag handling
      (list as any)._columnIndex = i;

      columnBoxes.push(box);
      columnLists.push(list);
    }

    // Footer - NOT focusable
    const footer = createBox({
      parent: screen,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 3,
      fixed: true,
      border: { type: 'line' },
      content: ` {cyan-fg}[Arrows]{/cyan-fg} Navigate   {cyan-fg}[Enter]{/cyan-fg} Edit   {cyan-fg}[N]{/cyan-fg} New   {cyan-fg}[M]{/cyan-fg} Move   {cyan-fg}[D]{/cyan-fg} Delete   {red-fg}[Q/ESC]{/red-fg} Back\n` +
               ` {yellow-fg}Drag & Drop:{/yellow-fg} Click and drag tasks between columns`,
      style: { fg: 'gray', bg: 'black', border: { fg: 'gray' } },
      tags: true,
      focusable: false,
      mouse: false,
      clickable: false,
    });

    // Debounce timer for navigation updates
    let updateTimeout: NodeJS.Timeout | null = null;
    let isUpdating = false;

    const updateListsImmediate = () => {
      for (let i = 0; i < COLUMNS.length; i++) {
        columnBoxes[i].style.border.fg = i === currentColumn ? 'yellow' : 'cyan';
      }
      columnLists[currentColumn].focus();
      screen.render();
    };

    const updateLists = async (immediate: boolean = false) => {
      if (isUpdating && !immediate) return;

      if (updateTimeout) {
        clearTimeout(updateTimeout);
        updateTimeout = null;
      }

      if (immediate) {
        isUpdating = true;
        tasks = await dataManager.getTasksForProject(project.id);

        for (let i = 0; i < COLUMNS.length; i++) {
          const status = COLUMNS[i];
          const columnTasks = tasks.filter(t => t.status === status);

          const maxTitleLen = Math.max(8, colWidth - 12);

          const items = columnTasks.map(task => {
            const priorityInitial = task.priority[0].toUpperCase();
            const priorityColor = getPriorityColor(task.priority);
            const title = task.title.length > maxTitleLen
              ? task.title.substring(0, maxTitleLen - 2) + '..'
              : task.title;
            return `${title} {${priorityColor}-fg}[${priorityInitial}]{/${priorityColor}-fg} ${task.points}`;
          });

          // Clear items first, then set new ones to ensure proper refresh
          columnLists[i].clearItems();
          columnLists[i].setItems(items.length > 0 ? items : []);
        }

        // Update header with new counts
        header.setContent(
          `{center}{bold}{cyan-fg}PROJECT: ${project.name}{/cyan-fg}{/bold} - Kanban Board${partyInfo}{/center}\n` +
          `{center}Tasks: {bold}${tasks.length}{/bold} | Todo: {bold}${tasks.filter(t => t.status === 'todo').length}{/bold} | In Progress: {bold}${tasks.filter(t => t.status === 'in-progress').length}{/bold} | Done: {bold}${tasks.filter(t => t.status === 'done').length}{/bold}{/center}`
        );

        for (let i = 0; i < COLUMNS.length; i++) {
          columnBoxes[i].style.border.fg = i === currentColumn ? 'yellow' : 'cyan';
        }

        columnLists[currentColumn].focus();
        screen.render();
        isUpdating = false;
      } else {
        updateTimeout = setTimeout(async () => {
          updateTimeout = null;
          await updateLists(true);
        }, 50);
        updateListsImmediate();
      }
    };

    await updateLists(true);

    // Get column index from screen X position
    const getColumnFromX = (x: number): number => {
      for (let i = 0; i < COLUMNS.length; i++) {
        const colLeft = leftMargin + (i * colWidth);
        const colRight = colLeft + colWidth;
        if (x >= colLeft && x < colRight) {
          return i;
        }
      }
      return -1;
    };

    // Start drag operation
    const startDrag = (colIndex: number, itemIndex: number, x: number, y: number) => {
      const columnTasks = tasks.filter(t => t.status === COLUMNS[colIndex]);
      if (itemIndex >= columnTasks.length) return;

      const task = columnTasks[itemIndex];

      dragState = {
        active: true,
        task: task,
        fromColumn: colIndex,
        fromIndex: itemIndex,
        ghost: createBox({
          focusable: false,
          mouse: false,
          clickable: false,
          parent: screen,
          top: y - 1,
          left: x - 8,
          width: 18,
          height: 3,
          border: { type: 'line' },
          content: task.title.length > 14 ? task.title.substring(0, 12) + '..' : task.title,
          style: {
            fg: 'white',
            bg: 'blue',
            border: { fg: 'yellow' }
          },
          tags: true,
        })
      };

      screen.render();
    };

    // Update drag ghost position
    const updateDrag = (x: number, y: number) => {
      if (!dragState.active || !dragState.ghost) return;

      dragState.ghost.top = y - 1;
      dragState.ghost.left = x - 8;

      // Highlight potential drop target
      const targetCol = getColumnFromX(x);
      for (let i = 0; i < COLUMNS.length; i++) {
        if (i === targetCol && targetCol !== dragState.fromColumn) {
          columnBoxes[i].style.border.fg = 'green';
        } else if (i === currentColumn) {
          columnBoxes[i].style.border.fg = 'yellow';
        } else {
          columnBoxes[i].style.border.fg = 'cyan';
        }
      }

      screen.render();
    };

    // End drag operation
    const endDrag = async (x: number, y: number) => {
      if (!dragState.active || !dragState.task) return;

      // Capture task info before resetting state
      const taskToMove = dragState.task;
      const fromCol = dragState.fromColumn;

      // Remove ghost
      if (dragState.ghost) {
        screen.remove(dragState.ghost);
        dragState.ghost = null;
      }

      const targetCol = getColumnFromX(x);

      // Reset drag state first to prevent re-entry
      dragState = {
        active: false,
        task: null,
        fromColumn: -1,
        fromIndex: -1,
        ghost: null
      };

      // If dropped on different column, move the task
      if (targetCol !== -1 && targetCol !== fromCol) {
        const newStatus = COLUMNS[targetCol];
        try {
          await moveTask(screen, taskToMove, newStatus, dataManager, achievementManager, user, project, bbsApi);
        } catch (err) {
          console.error('[Kanban] Move task failed:', err);
        }
        await updateLists(true);
      } else {
        // Dropped on same column or outside - just refresh to reset borders
        for (let i = 0; i < COLUMNS.length; i++) {
          columnBoxes[i].style.border.fg = i === currentColumn ? 'yellow' : 'cyan';
        }
        screen.render();
      }
    };

    // Set up drag handlers for each list
    for (let i = 0; i < columnLists.length; i++) {
      const list = columnLists[i];
      const colIndex = i;  // Capture for closure

      list.on('mouse', (data: any) => {
        if (data.action === 'mousedown') {
          // Skip if already dragging
          if (dragState.active) return;

          const columnTasks = tasks.filter(t => t.status === COLUMNS[colIndex]);
          if (columnTasks.length === 0) return;

          // Get the selected item index - blessed updates this on mousedown
          const selectedIndex = list.selected ?? 0;
          if (selectedIndex >= columnTasks.length) return;

          currentColumn = colIndex;

          // Capture coordinates and start drag immediately
          const mouseX = data.x;
          const mouseY = data.y;

          startDrag(colIndex, selectedIndex, mouseX, mouseY);
        }
      });
    }

    // Global mouse handler for drag operations
    const mouseHandler = (data: any) => {
      if (!dragState.active) return;

      if (data.action === 'mousemove') {
        updateDrag(data.x, data.y);
      } else if (data.action === 'mouseup' || data.action === 'mouserelease') {
        endDrag(data.x, data.y);
      }
    };

    // Also handle element mouse events that might capture the release
    const elementMouseHandler = (data: any) => {
      if (!dragState.active) return;
      if (data.action === 'mouseup' || data.action === 'mouserelease') {
        endDrag(data.x, data.y);
      }
    };

    screen.on('mouse', mouseHandler);
    // Listen on each column for mouseup in case screen doesn't get it
    columnLists.forEach(list => list.on('mouse', elementMouseHandler));

    const cleanup = () => {
      if (updateTimeout) clearTimeout(updateTimeout);
      screen.off('keypress', keyHandler);
      screen.off('mouse', mouseHandler);
      columnLists.forEach(list => list.off('mouse', elementMouseHandler));
      if (dragState.ghost) screen.remove(dragState.ghost);
      screen.remove(header);
      columnBoxes.forEach(box => screen.remove(box));
      screen.remove(footer);
    };

    const keyHandler = (ch: any, key: any) => {
      // Ignore keys during drag
      if (dragState.active) return;

      if (key.name === 'left' || key.name === 'right') {
        if (key.name === 'left') {
          currentColumn = Math.max(0, currentColumn - 1);
        } else {
          currentColumn = Math.min(COLUMNS.length - 1, currentColumn + 1);
        }
        updateLists(false);
        return;
      }

      (async () => {
        const columnTasks = tasks.filter(t => t.status === COLUMNS[currentColumn]);

        switch (key.name) {
        case 'enter':
          if (columnTasks.length > 0) {
            const selectedIndex = columnLists[currentColumn].selected || 0;
            const task = columnTasks[selectedIndex];
            await editTask(screen, task, user, dataManager, achievementManager, project, bbsApi);
            await updateLists(true);
          }
          break;

        case 'n':
          await createTask(screen, project, user, dataManager, bbsApi);
          await updateLists(true);
          break;

        case 'm':
          if (columnTasks.length > 0) {
            const selectedIndex = columnLists[currentColumn].selected || 0;
            const task = columnTasks[selectedIndex];
            const newStatus = await selectMoveDestination(screen);
            if (newStatus) {
              await moveTask(screen, task, newStatus, dataManager, achievementManager, user, project, bbsApi);
              await updateLists(true);
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

              await updateLists(true);
            }
          }
          break;

        case 'q':
        case 'escape':
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
      },
      focusable: false,
      mouse: false,
      clickable: false,
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

  if (newStatus === 'done' && oldStatus !== 'done') {
    task.completedAt = new Date().toISOString();

    const userData = await dataManager.getUser(user.userId);
    if (userData) {
      userData.points += task.points;
      userData.tasksCompleted += 1;
      userData.level = calculateLevel(userData.points);
      await dataManager.updateUser(userData);

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

      const newAchievements = await achievementManager.checkAchievements(userData);

      if (newAchievements.length > 0) {
        const achievements = await dataManager.loadAchievements();
        for (const achievementId of newAchievements) {
          const achievement = achievements[achievementId];
          if (achievement) {
            await showAchievementUnlock(screen, achievement);

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
