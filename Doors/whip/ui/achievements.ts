import { createBox } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { UserStats, Achievement } from '../types/user';
import type { DataManager } from '../core/data-manager';
import { T } from '../door-theme';

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
      content: `{center}{bold}{${T.accent}-fg}YOUR ACHIEVEMENTS{/${T.accent}-fg}{/bold} - Track your progress{/center}\n` +
               `{center}Unlocked: {bold}{${T.ok}-fg}${unlocked.length}{/${T.ok}-fg}{/bold} / ${allAchievements.length}  |  Points from Achievements: {bold}${unlocked.reduce((sum, a) => sum + a.points, 0)}{/bold}{/center}`,
      style: { fg: T.ink, bg: T.ground, border: { fg: T.accent } },
      tags: true,
      focusable: false,
      mouse: false,
      clickable: false,
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
      style: { bg: T.ground, border: { fg: T.accent } },
      focusable: true,
    });

    let contentText = '';

    // Unlocked section
    contentText += ` {bold}{${T.ok}-fg}UNLOCKED ({/${T.ok}-fg}{/bold}{bold}` + unlocked.length + `{/bold}{bold}{${T.ok}-fg}):{/${T.ok}-fg}{/bold}\n\n`;

    if (unlocked.length === 0) {
      contentText += ` {${T.dim}-fg}No achievements unlocked yet. Start completing tasks!{/${T.dim}-fg}\n\n`;
    } else {
      for (const achievement of unlocked) {
        const name = padName(achievement.name, 25);
        const desc = truncateText(achievement.description, 35);
        contentText += ` {${T.ok}-fg}${achievement.icon}{/${T.ok}-fg} {bold}${name}{/bold}${desc}  {${T.accentAlt}-fg}+${achievement.points} pts{/${T.accentAlt}-fg}\n`;
      }
      contentText += '\n';
    }

    // Locked section
    contentText += ` {bold}{${T.alert}-fg}LOCKED ({/${T.alert}-fg}{/bold}{bold}` + locked.length + `{/bold}{bold}{${T.alert}-fg}):{/${T.alert}-fg}{/bold}\n\n`;

    if (locked.length === 0) {
      contentText += ` {${T.ok}-fg}All achievements unlocked! You are a legend!{/${T.ok}-fg}\n`;
    } else {
      for (const achievement of locked) {
        const name = padName(achievement.name, 25);
        const desc = truncateText(achievement.description, 35);
        contentText += ` {${T.dim}-fg}${achievement.icon}{/${T.dim}-fg} {${T.dim}-fg}${name}${desc}  +${achievement.points} pts{/${T.dim}-fg}\n`;
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
      content: ` {${T.accent}-fg}[Up/Down]{/${T.accent}-fg} Scroll   {${T.alert}-fg}[Q/ESC]{/${T.alert}-fg} Back\n` +
               ` {${T.dim}-fg}Scrollwheel supported{/${T.dim}-fg}`,
      style: { fg: T.dim, bg: T.ground, border: { fg: T.dim } },
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
      screen.remove(content);
      screen.remove(instructions);
    };
  });
}
