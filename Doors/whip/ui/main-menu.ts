import { createBox } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
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

    // Get stats for display
    const projects = await dataManager.loadProjects();
    const tasks = await dataManager.loadTasks();
    const parties = await dataManager.loadParties();
    const upcomingParty = parties.find(p => new Date(p.date) > new Date());

    const daysUntilParty = upcomingParty
      ? Math.ceil((new Date(upcomingParty.date).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
      : null;

    // ========================================================================
    // HEADER - Title and user stats (NOT focusable)
    // ========================================================================
    const levelColor = getLevelColor(user.level);
    const levelStars = getLevelStars(user.level);

    const header = createBox({
      parent: screen,
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      border: { type: 'line' },
      style: {
        fg: 'white',
        bg: 'black',
        border: { fg: 'cyan' },
      },
      content: `{center}{bold}{cyan-fg}W H I P   v 1 . 0{/cyan-fg}{/bold} - Demo Scene Project Management{/center}\n` +
               `{center}Handle: {bold}${user.handle}{/bold}  |  Level: {${levelColor}-fg}${user.level.toUpperCase()}{/${levelColor}-fg} (${levelStars})  |  Points: {bold}${formatPoints(user.points)}{/bold}  |  Rank: {bold}#${user.rank}{/bold}{/center}`,
      tags: true,
      focusable: false,
    });

    // ========================================================================
    // CONTENT - Main container (NOT focusable, list inside is)
    // ========================================================================
    const mainContainer = createBox({
      parent: screen,
      top: 3,
      left: 0,
      width: '100%',
      height: '100%-6',  // Leave room for header (3) and footer (3)
      style: {
        fg: 'white',
        bg: 'black',
      },
      focusable: false,
    });

    // Menu items
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

    // Menu box with border - explicit height (9 items + 2 border + 2 padding = 13)
    const menuBox = createBox({
      parent: mainContainer,
      top: 1,
      left: 1,
      width: '50%',
      height: 13,
      border: { type: 'line' },
      label: ' MAIN MENU ',
      style: {
        border: { fg: 'cyan' },
        bg: 'black'
      },
      focusable: false,
    });

    // Menu list (focusable) - use blessed.list directly to avoid SDK's forced scrollable
    const list = blessed.list({
      parent: menuBox,
      top: 1,
      left: 1,
      width: '100%-4',
      height: 9,  // 9 menu items - exact fit, no scrolling needed
      items: menuItems.map(item => `[{bold}${item.key}{/bold}] ${item.label}`),
      tags: true,
      keys: true,
      vi: true,
      mouse: true,
      focusable: true,
      style: {
        selected: { bg: 'cyan', fg: 'black' },
        item: { fg: 'white', bg: 'black' }
      },
      padding: { left: 1 },
    } as any);

    // Build stats content
    let statsContent = '';
    statsContent += `{cyan-fg}Projects:{/cyan-fg}  {bold}${projects.length}{/bold}\n`;
    statsContent += `{cyan-fg}Tasks:{/cyan-fg}     {bold}${tasks.length}{/bold}\n`;

    const completedTasks = tasks.filter(t => t.status === 'done').length;
    const activeTasks = tasks.filter(t => t.status !== 'done').length;
    statsContent += `{cyan-fg}Active:{/cyan-fg}    {bold}${activeTasks}{/bold}\n`;
    statsContent += `{cyan-fg}Completed:{/cyan-fg} {bold}${completedTasks}{/bold}\n`;
    statsContent += '\n';

    if (upcomingParty && daysUntilParty !== null) {
      statsContent += `{yellow-fg}UPCOMING PARTY:{/yellow-fg}\n`;
      statsContent += `{bold}${upcomingParty.name}{/bold}\n`;
      statsContent += `in {bold}${daysUntilParty}{/bold} days`;
    } else {
      statsContent += `{gray-fg}No upcoming parties{/gray-fg}`;
    }

    // Stats box on right side - same height as menu box (13)
    const statsBox = createBox({
      parent: mainContainer,
      top: 1,
      right: 1,
      width: '45%',
      height: 13,
      border: { type: 'line' },
      label: ' STATS ',
      content: statsContent,
      style: {
        border: { fg: 'yellow' },
        bg: 'black'
      },
      padding: { left: 1, top: 1 },
      focusable: false,
    });

    // Getting started hint if no projects
    let gettingStarted: any = null;
    if (projects.length === 0) {
      gettingStarted = createBox({
        parent: mainContainer,
        bottom: 1,
        left: 1,
        width: '98%',
        height: 5,
        border: { type: 'line' },
        label: ' Getting Started ',
        content: `{center}{bold}{cyan-fg}Welcome to WHIP!{/cyan-fg}{/bold}{/center}\n` +
                 `{center}Press {bold}[T]{/bold} to create your first quick task{/center}\n` +
                 `{center}Press {bold}[N]{/bold} to create a new project{/center}`,
        style: {
          border: { fg: 'green' },
          fg: 'white',
          bg: 'black'
        },
        tags: true,
        focusable: false,
      });
    }

    // ========================================================================
    // FOOTER - Keyboard hints (NOT focusable)
    // ========================================================================
    const footer = createBox({
      parent: screen,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 3,
      border: { type: 'line' },
      style: {
        fg: 'gray',
        bg: 'black',
        border: { fg: 'gray' },
      },
      content: ` {cyan-fg}[Enter]{/cyan-fg} Select   {cyan-fg}[Hotkey]{/cyan-fg} Quick Action   {red-fg}[Q]{/red-fg} Quit\n` +
               ` {gray-fg}Arrow Keys to navigate | Mouse click supported{/gray-fg}`,
      tags: true,
      focusable: false,
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
      screen.remove(mainContainer);
      if (gettingStarted) screen.remove(gettingStarted);
      screen.remove(footer);
    };

    screen.render();
  });
}
