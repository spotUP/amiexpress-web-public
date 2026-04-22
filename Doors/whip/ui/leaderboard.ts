import { createBox } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { UserStats } from '../types/user';
import type { DataManager } from '../core/data-manager';
import { getLevelStars, getLevelColor, formatPoints } from '../core/gamification';

export async function showLeaderboard(
  screen: Screen,
  currentUser: UserStats,
  dataManager: DataManager
): Promise<void> {
  return new Promise(async (resolve) => {
    screen.program.enableMouse();
    screen.clearRegion(0, screen.width, 0, screen.height);
    screen.alloc();
    // Note: Removed 200ms artificial delay for better responsiveness

    const users = await dataManager.loadUsers();
    const sortedUsers = Object.values(users).sort((a, b) => b.points - a.points);

    // Header - NOT focusable
    const header = createBox({
      fixed: true,
      parent: screen,
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      border: { type: 'line' },
      content: `{center}{bold}{cyan-fg}TOP SCENERS{/cyan-fg}{/bold} - Demo Scene Leaderboard{/center}\n` +
               `{center}Total Sceners: {bold}${sortedUsers.length}{/bold} | Your Rank: {bold}#${currentUser.rank}{/bold}{/center}`,
      style: { fg: 'white', bg: 'black', border: { fg: 'cyan' } },
      tags: true,
      focusable: false,
      mouse: false,
      clickable: false,
    });

    // Table header - NOT focusable
    const tableHeaderWidth = screen.width - 4;
    const tableHeader = createBox({
      fixed: true,
      parent: screen,
      top: 3,
      left: 1,
      width: '98%',
      height: 2,
      content: ' {bold}RANK  HANDLE          LEVEL      POINTS  TASKS  PROJECTS  ACHIEVEMENTS{/bold}\n' +
               ' ' + '='.repeat(tableHeaderWidth - 2),  // Dynamic separator width
      style: { fg: 'cyan', bg: 'black' },
      tags: true,
      focusable: false,
      mouse: false,
      clickable: false,
    });

    // Leaderboard table - focusable (scrollable content)
    const table = createBox({
      fixed: true,
      parent: screen,
      top: 5,
      left: 1,
      width: '98%',
      height: '100%-8',
      border: { type: 'line' },
      label: ' Leaderboard ',
      scrollable: true,
      alwaysScroll: true,
      mouse: true,
      keys: true,
      vi: true,
      style: { bg: 'black', border: { fg: 'cyan' } },
      focusable: true,
    });

    let content = '';
    const achievements = await dataManager.loadAchievements();
    const totalAchievements = Object.keys(achievements).length;

    for (let i = 0; i < sortedUsers.length; i++) {
      const user = sortedUsers[i];
      const isCurrentUser = user.userId === currentUser.userId;
      const levelColor = getLevelColor(user.level);
      const levelStars = getLevelStars(user.level);

      // Format rank with padding
      const rank = `#${user.rank}`.padEnd(6);

      // Format handle with padding
      const handle = user.handle.substring(0, 14).padEnd(16);

      // Format level with stars
      const level = `${user.level.toUpperCase()} (${levelStars})`.padEnd(11);

      // Format points
      const points = formatPoints(user.points).padStart(7);

      // Format stats
      const tasks = user.tasksCompleted.toString().padStart(5);
      const projects = user.projectsCreated.toString().padStart(9);
      const achievs = `${user.achievements.length}/${totalAchievements}`.padStart(13);

      const line = `${isCurrentUser ? '{inverse}' : ''} ${rank} ${handle} {${levelColor}-fg}${level}{/${levelColor}-fg} ${points}  ${tasks}  ${projects}  ${achievs}${isCurrentUser ? '  <- YOU' : ''}${isCurrentUser ? '{/inverse}' : ''}\n`;
      content += line;
    }

    table.setContent(content);
    table.focus();

    // Footer - NOT focusable
    const instructions = createBox({
      fixed: true,
      parent: screen,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 3,
      border: { type: 'line' },
      content: ` {cyan-fg}[Up/Down]{/cyan-fg} Scroll   {red-fg}[Q/ESC]{/red-fg} Back\n` +
               ` {gray-fg}Scrollwheel supported{/gray-fg}`,
      style: { fg: 'gray', bg: 'black', border: { fg: 'gray' } },
      tags: true,
      focusable: false,
      mouse: false,
      clickable: false,
    });

    screen.render();

    const keyHandler = (ch: any, key: any) => {
      switch (key.name) {
        case 'q':
        case 'escape':
          cleanup();
          resolve();
          break;
      }
    };

    screen.on('keypress', keyHandler);

    const cleanup = () => {
      screen.off('keypress', keyHandler);
      screen.remove(header);
      screen.remove(tableHeader);
      screen.remove(table);
      screen.remove(instructions);
    };
  });
}
