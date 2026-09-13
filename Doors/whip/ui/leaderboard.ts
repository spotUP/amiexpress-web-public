import { createBox } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { UserStats } from '../types/user';
import type { DataManager } from '../core/data-manager';
import { getLevelColor, formatPoints } from '../core/gamification';
import { attachWhipMenu, menuBarHeight, type WhipMenuBar } from './menu';
import { bindBoxScroll } from './scroll-keys';
import type { MenuSelection } from '../types/session';
import { T } from '../door-theme';
import { attachWhipChrome, type FooterHint } from './chrome';

/**
 * One leaderboard row, single visual line (2026-09-10).
 *
 * Rows used to run 77-85 visible cells in a 76-cell pane: every row
 * wrapped, the star meter tore columns apart, and the current user got
 * a full-width inverse block nobody needed (the <- YOU marker says it).
 * Columns are sized to a 76 budget with room to spare; the marker stays,
 * the block goes.
 */
export const LEADERBOARD_HEADER = 'RANK HANDLE        LEVEL  POINTS TASKS PROJ ACHV';

export function formatLeaderboardRow(
  rank: number,
  handle: string,
  level: string,
  levelColor: string,
  points: string,
  tasks: number,
  projects: number,
  achievs: string,
  isYou: boolean
): string {
  const levelText = level.toUpperCase().substring(0, 5);
  const levelCell =
    `{${levelColor}-fg}${levelText}{/${levelColor}-fg}` + ' '.repeat(Math.max(0, 6 - levelText.length));
  const cells =
    `#${rank}`.padEnd(4) +
    handle.substring(0, 12).padEnd(13) +
    levelCell +
    points.substring(0, 6).padStart(7) +
    String(tasks).substring(0, 4).padStart(5) +
    String(projects).substring(0, 4).padStart(5) +
    achievs.substring(0, 6).padStart(7);
  return cells + (isYou ? ` {${T.accent}-fg}<- YOU{/${T.accent}-fg}` : '');
}

/** Visible cells, tags excluded - the number the pane width must cover. */
export function visibleLength(row: string): number {
  return row.replace(/\{[^}]*\}/g, '').length;
}

/** The keys this screen answers to, and the same keys shortened for 40 columns. */
const HINTS: readonly FooterHint[] = [
  { key: 'Up/Down', does: 'Scroll' },
  { key: 'Q/ESC', does: 'Back' },
];
const COMPACT_HINTS: readonly FooterHint[] = [
  { key: 'Up/Dn', does: 'Scroll' },
  { key: 'Q', does: 'Back' },
];

export async function showLeaderboard(
  screen: Screen,
  currentUser: UserStats,
  dataManager: DataManager,
  onNavigate?: (sel: MenuSelection) => void
): Promise<void> {
  return new Promise(async (resolve) => {
    screen.program.enableMouse();
    screen.clearRegion(0, screen.width, 0, screen.height);
    screen.alloc();
    // Note: Removed 200ms artificial delay for better responsiveness

    const users = await dataManager.loadUsers();
    const sortedUsers = Object.values(users).sort((a, b) => b.points - a.points);

    // Menu bar row (ui/menu.ts): header and table slide down one row
    // when it is up, and stay put below 60 columns.
    const barH = menuBarHeight(screen.width);

    // Header - NOT focusable
    const header = createBox({
      fixed: true,
      parent: screen,
      top: barH,
      left: 0,
      width: '100%',
      height: 3,
      border: { type: 'line' },
      // Empty: a three-row framed box has ONE interior row, and the chrome's
      // masthead owns it now. The centred title moved to `title` below.
      content: '',
      style: { fg: T.ink, bg: T.ground, border: { fg: T.accent } },
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
      top: barH + 3,
      left: 1,
      width: '98%',
      height: 2,
      content: ` {bold}${LEADERBOARD_HEADER}{/bold}\n` +
               ' ' + '='.repeat(tableHeaderWidth - 2),  // Dynamic separator width
      style: { fg: T.accent, bg: T.ground },
      tags: true,
      focusable: false,
      mouse: false,
      clickable: false,
    });

    // Leaderboard table - focusable (scrollable content)
    const table = createBox({
      fixed: true,
      parent: screen,
      top: barH + 5,
      left: 1,
      width: '98%',
      height: `100%-${barH + 8}`,
      border: { type: 'line' },
      label: ' Leaderboard ',
      scrollable: true,
      alwaysScroll: true,
      scrollbar: {
        ch: '|',
        track: { ch: ':', style: { fg: T.dim, bg: T.ground } },
        style: { fg: T.accent, bg: T.ground },
      },
      mouse: true,
      keys: true,
      vi: true,
      style: { bg: T.ground, border: { fg: T.accent } },
      focusable: true,
    });

    let content = '';
    const achievements = await dataManager.loadAchievements();
    const totalAchievements = Object.keys(achievements).length;

    for (let i = 0; i < sortedUsers.length; i++) {
      const user = sortedUsers[i];
      const isCurrentUser = user.userId === currentUser.userId;
      const levelColor = getLevelColor(user.level);

      const line = formatLeaderboardRow(
        user.rank, user.handle, user.level, levelColor,
        formatPoints(user.points), user.tasksCompleted, user.projectsCreated,
        `${user.achievements.length}/${totalAchievements}`,
        isCurrentUser
      );
      content += `${line}\n`;
    }

    table.setContent(content);
    table.focus();

    // Arrow/wheel scrolling, same as achievements (ui/scroll-keys.ts).
    const unbindScroll = bindBoxScroll(screen, table);

    // Footer - NOT focusable
    const instructions = createBox({
      fixed: true,
      parent: screen,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 3,
      border: { type: 'line' },
      // Filled by the chrome, from the SDK's hint builder.
      content: '',
      style: { fg: T.dim, bg: T.ground, border: { fg: T.dim } },
      tags: true,
      focusable: false,
      mouse: false,
      clickable: false,
    });

    // The whole chrome from the door's ONE call.
    const chrome = attachWhipChrome({
      screen,
      header,
      footer: instructions,
      title: 'TOP SCENERS',
      hints: HINTS,
      compactHints: COMPACT_HINTS,
      // The scrolling table is the only thing here with rows to spare.
      glitch: table,
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

    // Menu picks leave this screen for wherever the app loop sends them.
    let menu: WhipMenuBar | null = null;
    const pickFromBar = (value: MenuSelection) => {
      onNavigate?.(value);
      cleanup();
      resolve();
    };
    menu = attachWhipMenu(screen, pickFromBar, () => table, { reserved: ['Q'] });

    const cleanup = () => {
      // First: a rail timer still writing after these widgets are gone would
      // paint into a screen that no longer holds them.
      chrome.stop();
      unbindScroll();
      if (menu) {
        menu.destroy();
        menu = null;
      }
      screen.off('keypress', keyHandler);
      screen.remove(header);
      screen.remove(tableHeader);
      screen.remove(table);
      screen.remove(instructions);
    };
  });
}
