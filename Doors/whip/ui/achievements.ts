import { createBox } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { UserStats, Achievement } from '../types/user';
import type { DataManager } from '../core/data-manager';

/**
 * Smart text truncation with ellipsis
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text.padEnd(maxLength);
  }
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Pad achievement name with spaces
 */
function padName(name: string, maxLength: number): string {
  if (name.length >= maxLength) {
    return name.substring(0, maxLength);
  }
  return name + ' '.repeat(maxLength - name.length);
}

export async function showAchievements(
  screen: Screen,
  currentUser: UserStats,
  dataManager: DataManager
): Promise<void> {
  return new Promise(async (resolve) => {
    screen.program.enableMouse();
    screen.clearRegion(0, screen.width, 0, screen.height);
    screen.alloc();
    // Note: Removed 200ms artificial delay for better responsiveness

    const achievements = await dataManager.loadAchievements();
    const allAchievements = Object.values(achievements);

    const unlocked = allAchievements.filter(a => currentUser.achievements.includes(a.id));
    const locked = allAchievements.filter(a => !currentUser.achievements.includes(a.id));

    // Header - NOT focusable
    const header = createBox({
      fixed: true,
      parent: screen,
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      border: { type: 'line' },
      content: `{center}{bold}{cyan-fg}YOUR ACHIEVEMENTS{/cyan-fg}{/bold} - Track your progress{/center}\n` +
               `{center}Unlocked: {bold}{green-fg}${unlocked.length}{/green-fg}{/bold} / ${allAchievements.length}  |  Points from Achievements: {bold}${unlocked.reduce((sum, a) => sum + a.points, 0)}{/bold}{/center}`,
      style: { fg: 'white', bg: 'black', border: { fg: 'cyan' } },
      tags: true,
      focusable: false,
    });

    // Stats moved to header - remove this separate stats box

    // Content area - focusable (scrollable)
    const content = createBox({
      fixed: true,
      parent: screen,
      top: 3,
      left: 1,
      width: '98%',
      height: '100%-6',
      border: { type: 'line' },
      label: ' Achievements ',
      scrollable: true,
      alwaysScroll: true,
      mouse: true,
      keys: true,
      vi: true,
      style: { bg: 'black', border: { fg: 'cyan' } },
      focusable: true,
    });

    let contentText = '';

    // Unlocked section
    contentText += ' {bold}{green-fg}UNLOCKED ({/green-fg}{/bold}{bold}' + unlocked.length + '{/bold}{bold}{green-fg}):{/green-fg}{/bold}\n\n';

    if (unlocked.length === 0) {
      contentText += ' {gray-fg}No achievements unlocked yet. Start completing tasks!{/gray-fg}\n\n';
    } else {
      for (const achievement of unlocked) {
        const name = padName(achievement.name, 25);
        const desc = truncateText(achievement.description, 35);
        contentText += ` {green-fg}${achievement.icon}{/green-fg} {bold}${name}{/bold}${desc}  {yellow-fg}+${achievement.points} pts{/yellow-fg}\n`;
      }
      contentText += '\n';
    }

    // Locked section
    contentText += ' {bold}{red-fg}LOCKED ({/red-fg}{/bold}{bold}' + locked.length + '{/bold}{bold}{red-fg}):{/red-fg}{/bold}\n\n';

    if (locked.length === 0) {
      contentText += ' {green-fg}All achievements unlocked! You are a legend!{/green-fg}\n';
    } else {
      for (const achievement of locked) {
        const name = padName(achievement.name, 25);
        const desc = truncateText(achievement.description, 35);
        contentText += ` {gray-fg}${achievement.icon}{/gray-fg} {gray-fg}${name}${desc}  +${achievement.points} pts{/gray-fg}\n`;
      }
    }

    content.setContent(contentText);
    content.focus();

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
      screen.remove(content);
      screen.remove(instructions);
    };
  });
}
