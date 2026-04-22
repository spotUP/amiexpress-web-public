import {
  createBox,
  createList
} from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { Task } from '../types/project';
import type { UserStats } from '../types/user';
import type { DataManager } from '../core/data-manager';
import type { AchievementManager } from '../core/achievements';
import { getPriorityColor } from '../core/gamification';
import { editTask } from './task-editor';

export async function showMyTasks(
  screen: Screen,
  user: UserStats,
  dataManager: DataManager,
  achievementManager: AchievementManager,
  bbsApi?: any
): Promise<void> {
  return new Promise(async (resolve) => {
    screen.program.enableMouse();
    screen.clearRegion(0, screen.width, 0, screen.height);
    screen.alloc();

    let allTasks = await dataManager.loadTasks();
    let projects = await dataManager.loadProjects();

    // Filter tasks assigned to current user
    let myTasks = allTasks.filter(t => t.assignedTo === user.userId);

    // Sort by status (todo first, then in-progress, testing, done last)
    const statusOrder = { 'todo': 0, 'in-progress': 1, 'testing': 2, 'done': 3 };
    myTasks.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

    const getProjectName = (projectId: string): string => {
      const project = projects.find(p => p.id === projectId);
      return project?.name || 'Unknown';
    };

    // Header
    const header = createBox({
      parent: screen,
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      fixed: true,
      border: { type: 'line' },
      content: `{center}{bold}{cyan-fg}MY TASKS{/cyan-fg}{/bold} - ${user.handle}{/center}\n` +
               `{center}Total: {bold}${myTasks.length}{/bold} | Active: {bold}${myTasks.filter(t => t.status !== 'done').length}{/bold} | Completed: {bold}${myTasks.filter(t => t.status === 'done').length}{/bold}{/center}`,
      style: { fg: 'white', bg: 'black', border: { fg: 'cyan' } },
      tags: true,
      focusable: false,
      mouse: false,
      clickable: false,
    });

    // Task list
    const listBox = createBox({
      parent: screen,
      top: 3,
      left: 0,
      width: '100%',
      height: '100%-6',
      fixed: true,
      border: { type: 'line' },
      label: ' Tasks ',
      style: {
        border: { fg: 'cyan' },
        bg: 'black'
      },
      focusable: false,
      mouse: false,
      clickable: false,
    });

    const formatTaskItem = (task: Task): string => {
      const priorityInitial = task.priority[0].toUpperCase();
      const priorityColor = getPriorityColor(task.priority);
      const statusColors: Record<string, string> = {
        'todo': 'white',
        'in-progress': 'yellow',
        'testing': 'magenta',
        'done': 'green'
      };
      const statusColor = statusColors[task.status] || 'white';
      const projectName = getProjectName(task.projectId);
      const maxTitleLen = 30;
      const title = task.title.length > maxTitleLen
        ? task.title.substring(0, maxTitleLen - 2) + '..'
        : task.title.padEnd(maxTitleLen);
      const maxProjectLen = 15;
      const projDisplay = projectName.length > maxProjectLen
        ? projectName.substring(0, maxProjectLen - 2) + '..'
        : projectName.padEnd(maxProjectLen);

      return `{${statusColor}-fg}${task.status.padEnd(11)}{/${statusColor}-fg} ${title} {gray-fg}${projDisplay}{/gray-fg} {${priorityColor}-fg}[${priorityInitial}]{/${priorityColor}-fg} ${task.points}pts`;
    };

    const list = createList({
      parent: listBox,
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      keys: true,
      vi: true,
      mouse: true,
      items: myTasks.length > 0 ? myTasks.map(formatTaskItem) : [],
      style: {
        selected: { bg: 'cyan', fg: 'black' },
        item: { fg: 'white' },
        bg: 'black'
      }
    });

    // Footer
    const footer = createBox({
      parent: screen,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 3,
      fixed: true,
      border: { type: 'line' },
      content: ` {cyan-fg}[Enter]{/cyan-fg} Edit Task   {cyan-fg}[Up/Down]{/cyan-fg} Navigate   {red-fg}[Q/ESC]{/red-fg} Back\n` +
               ` {gray-fg}Showing tasks assigned to you across all projects{/gray-fg}`,
      style: { fg: 'gray', bg: 'black', border: { fg: 'gray' } },
      tags: true,
      focusable: false,
      mouse: false,
      clickable: false,
    });

    list.focus();
    screen.render();

    const refreshList = async () => {
      allTasks = await dataManager.loadTasks();
      projects = await dataManager.loadProjects();
      myTasks = allTasks.filter(t => t.assignedTo === user.userId);
      myTasks.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

      list.clearItems();
      list.setItems(myTasks.length > 0 ? myTasks.map(formatTaskItem) : []);

      header.setContent(
        `{center}{bold}{cyan-fg}MY TASKS{/cyan-fg}{/bold} - ${user.handle}{/center}\n` +
        `{center}Total: {bold}${myTasks.length}{/bold} | Active: {bold}${myTasks.filter(t => t.status !== 'done').length}{/bold} | Completed: {bold}${myTasks.filter(t => t.status === 'done').length}{/bold}{/center}`
      );

      screen.render();
    };

    const cleanup = () => {
      screen.off('keypress', keyHandler);
      screen.remove(header);
      screen.remove(listBox);
      screen.remove(footer);
    };

    const keyHandler = (ch: any, key: any) => {
      if (key.name === 'q' || key.name === 'escape') {
        cleanup();
        resolve();
        return;
      }

      if (key.name === 'enter') {
        (async () => {
          if (myTasks.length > 0) {
            const selectedIndex = list.selected || 0;
            const task = myTasks[selectedIndex];
            const project = projects.find(p => p.id === task.projectId);
            await editTask(screen, task, user, dataManager, achievementManager, project, bbsApi);
            await refreshList();
          }
        })();
      }
    };

    screen.on('keypress', keyHandler);
  });
}
