import { createBox } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { UserStats, Achievement } from '../types/user';
import type { DataManager } from '../core/data-manager';
import { attachWhipMenu, type WhipMenuBar } from './menu';
import { bindBoxScroll } from './scroll-keys';
import type { MenuSelection } from '../types/session';
import { T } from '../door-theme';
import { attachWhipChrome, type FooterHint } from './chrome';

/** The keys this screen answers to, and the same keys shortened for 40 columns. */
const HINTS: readonly FooterHint[] = [
  { key: 'Up/Down', does: 'Scroll' },
  { key: 'Q/ESC', does: 'Back' },
];
const COMPACT_HINTS: readonly FooterHint[] = [
  { key: 'Up/Dn', does: 'Scroll' },
  { key: 'Q', does: 'Back' },
];

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
  dataManager: DataManager,
  onNavigate?: (sel: MenuSelection) => void
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

    // Menu bar row (ui/menu.ts): header and content slide down one
    // row when it is up, and stay put below 60 columns.
    const barH = screen.width >= 60 ? 1 : 0;

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

    // Stats moved to header - remove this separate stats box

    // Content area - focusable (scrollable)
    const content = createBox({
      fixed: true,
      parent: screen,
      top: barH + 3,
      left: 1,
      width: '98%',
      height: `100%-${barH + 6}`,
      border: { type: 'line' },
      label: ' Achievements ',
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

    // Arrow/wheel scrolling: no widget binds it, so the door drives the
    // pane like the timeline drives its selection (ui/scroll-keys.ts).
    const unbindScroll = bindBoxScroll(screen, content);

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
      title: 'YOUR ACHIEVEMENTS',
      hints: HINTS,
      compactHints: COMPACT_HINTS,
      // The scrolling pane is the only thing here with rows to spare.
      glitch: content,
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
    menu = attachWhipMenu(screen, pickFromBar, () => content.focus());

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
      screen.remove(content);
      screen.remove(instructions);
    };
  });
}
