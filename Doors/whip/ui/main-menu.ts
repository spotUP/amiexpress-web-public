import { createBox, createList } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { UserStats } from '../types/user';
import type { MenuSelection } from '../types/session';
import type { DataManager } from '../core/data-manager';
import { getLevelStars, getLevelColor, formatPoints } from '../core/gamification';

export async function showMainMenu(
  screen: Screen,
  user: UserStats,
  dataManager: DataManager
): Promise<MenuSelection> {
  return new Promise(async (resolve) => {
    // Enable mouse
    screen.program.enableMouse();

    // Clear screen
    screen.clearRegion(0, screen.width, 0, screen.height);
    screen.alloc();
    // Note: Removed 200ms artificial delay - blessed doesn't need it

    // Get stats for footer
    const projects = await dataManager.loadProjects();
    const tasks = await dataManager.loadTasks();
    const parties = await dataManager.loadParties();
    const upcomingParty = parties.find(p => new Date(p.date) > new Date());

    const daysUntilParty = upcomingParty
      ? Math.ceil((new Date(upcomingParty.date).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
      : null;

    // Header
    const header = createBox({
      parent: screen,
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      fixed: true,
      content: `{center}{bold}{cyan-fg}W H I P   v 1 . 0{/cyan-fg}{/bold}\n` +
               `{center}Demo Scene Project Management{/center}`,
      style: { fg: 'white', bg: 'black' }
    });

    // User info bar
    const levelColor = getLevelColor(user.level);
    const levelStars = getLevelStars(user.level);
    const userInfo = createBox({
      parent: screen,
      top: 3,
      left: 0,
      width: '100%',
      height: 1,
      fixed: true,
      content: `{center}Handle: {bold}${user.handle}{/bold}  |  Level: {${levelColor}-fg}${user.level.toUpperCase()}{/${levelColor}-fg} (${levelStars})  |  Points: {bold}${formatPoints(user.points)}{/bold}  |  Rank: {bold}#${user.rank}{/bold}{/center}`,
      style: { fg: 'white', bg: 'black' }
    });

    // Menu box
    const menuBox = createBox({
      parent: screen,
      top: 5,
      left: 'center',
      width: 45,
      height: 13,  // 9 items + 2 padding + 2 border
      fixed: true,
      border: { type: 'line' },
      label: ' MAIN MENU ',
      style: {
        border: { fg: 'cyan' },
        bg: 'black'
      }
    });

    // Menu items - Quick Task first for easy access
    const menuItems = [
      { key: 'T', label: 'Quick Task (New)', value: 'quick-task' as MenuSelection },
      { key: 'N', label: 'New Project', value: 'new-project' as MenuSelection },
      { key: 'V', label: 'View All Projects', value: 'view-projects' as MenuSelection },
      { key: 'K', label: 'Kanban Board', value: 'kanban' as MenuSelection },
      { key: 'M', label: 'My Tasks', value: 'my-tasks' as MenuSelection },
      { key: 'P', label: 'Party Timeline', value: 'parties' as MenuSelection },
      { key: 'L', label: 'Leaderboard', value: 'leaderboard' as MenuSelection },
      { key: 'A', label: 'Achievements', value: 'achievements' as MenuSelection },
      { key: 'Q', label: 'Quit', value: 'quit' as MenuSelection }
    ];

    const list = createList({
      parent: menuBox,
      top: 1,
      left: 1,
      width: '100%-2',
      height: menuItems.length,
      items: menuItems.map(item => `[{bold}${item.key}{/bold}] ${item.label}`),
      keys: true,
      vi: true,
      mouse: true,
      style: {
        selected: { bg: 'cyan', fg: 'black' },
        item: { fg: 'white' }
      }
    });

    // Footer with stats and helpful messaging for first-time users
    let footerContent = '';

    // Show getting started hint if no projects exist (store reference for cleanup)
    let gettingStarted: any = null;
    if (projects.length === 0) {
      gettingStarted = createBox({
        parent: screen,
        bottom: 2,  // Position above footer (not hardcoded top)
        left: 'center',
        width: 60,
        height: 3,
        fixed: true,
        border: { type: 'line' },
        content: `{center}{bold}{cyan-fg}Getting Started:{/cyan-fg}{/bold}\n` +
                 `Press {bold}[T]{/bold} to create your first task, or\n` +
                 `Press {bold}[N]{/bold} to create a project!{/center}`,
        style: {
          border: { fg: 'yellow' },
          fg: 'white',
          bg: 'black'
        }
      });
    }

    if (upcomingParty && daysUntilParty !== null) {
      footerContent = `{center}UPCOMING: {bold}{yellow-fg}${upcomingParty.name}{/yellow-fg}{/bold} in {bold}${daysUntilParty}{/bold} days | `;
    } else {
      footerContent = `{center}`;
    }
    footerContent += `Active Projects: {bold}${projects.length}{/bold} | Tasks: {bold}${tasks.length}{/bold}{/center}`;

    const footer = createBox({
      parent: screen,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 1,
      fixed: true,
      content: footerContent,
      style: { fg: 'gray', bg: 'black' }
    });

    // Focus the list
    list.focus();

    // Keyboard handler for direct shortcuts
    const keyHandler = (ch: any, key: any) => {
      const keyName = key.name.toUpperCase();

      // Check for direct menu shortcuts
      const menuItem = menuItems.find(item => item.key === keyName);
      if (menuItem) {
        cleanup();
        resolve(menuItem.value);
        return;
      }
    };

    // Mouse click and Enter handler
    const selectHandler = (item: any, index: number) => {
      cleanup();
      resolve(menuItems[index].value);
    };

    list.on('select', selectHandler);
    screen.on('keypress', keyHandler);

    const cleanup = () => {
      screen.off('keypress', keyHandler);
      list.removeAllListeners('select');
      screen.remove(header);
      screen.remove(userInfo);
      screen.remove(menuBox);
      if (gettingStarted) screen.remove(gettingStarted);  // Clean up getting started box
      screen.remove(footer);
    };

    screen.render();
  });
}
