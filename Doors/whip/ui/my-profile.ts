import {
  createButton,
} from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { UserStats } from '../types/user';
import { T } from '../door-theme';

export const DISCORD_NAME_MAX = 32;

/** Pure: what the door stores for a typed Discord name. */
export function normalizeDiscordName(raw: unknown): string {
  return String(raw ?? '').trim().slice(0, DISCORD_NAME_MAX);
}

/**
 * My Profile - handle, level, points, and the Discord name the Discord bot
 * matches on. Save stores the trimmed name, Clear removes it, Cancel/ESC
 * changes nothing. Resolves the name to store, '' to clear, null to cancel.
 */
export async function showMyProfile(
  screen: Screen,
  user: UserStats,
): Promise<string | null> {
  return new Promise((resolve) => {
    let closed = false;

    const modal = blessed.box({
      parent: screen,
      top: 'center',
      left: 'center',
      width: 62,
      height: 15,
      border: { type: 'line' },
      style: {
        border: { fg: T.accent },
        bg: T.ground,
      },
      label: ' My Profile ',
      tags: true,
    });

    const info = blessed.box({
      parent: modal,
      top: 1,
      left: 2,
      right: 2,
      height: 3,
      tags: true,
      content: `{bold}${user.handle}{/bold} - level ${user.level}, ${user.points} pts, ${user.tasksCompleted} tasks done`,
      style: { fg: T.ink, bg: T.ground },
    });
    void info;

    const help = blessed.box({
      parent: modal,
      top: 4,
      left: 2,
      right: 2,
      height: 2,
      tags: true,
      content: 'Your Discord name, so the Discord bot knows your tasks are yours.',
      style: { fg: T.dim, bg: T.ground },
    });
    void help;

    const nameInput = blessed.textbox({
      parent: modal,
      top: 6,
      left: 2,
      right: 2,
      height: 3,
      border: { type: 'line' },
      label: ' Discord name ',
      keys: true,
      mouse: true,
      inputOnFocus: true,
      value: user.discordName ?? '',
      style: {
        fg: T.ink,
        bg: T.ground,
        border: { fg: T.accent },
      },
    });

    const save = () => {
      if (closed) return;
      const value = normalizeDiscordName((nameInput as any).getValue?.() ?? (nameInput as any).value);
      cleanup();
      resolve(value);
    };

    const saveBtn = createButton({
      parent: modal,
      top: 10,
      left: 4,
      width: 14,
      height: 3,
      content: '[ Save ]',
      align: 'center',
      valign: 'middle',
      border: { type: 'line' },
      keys: true,
      mouse: true,
      style: {
        fg: T.ink,
        bg: T.ok,
        border: { fg: T.ok },
        focus: { bg: 'lightgreen', fg: T.ground },
        hover: { bg: 'lightgreen', fg: T.ground },
      },
    });

    const clearBtn = createButton({
      parent: modal,
      top: 10,
      left: 24,
      width: 14,
      height: 3,
      content: '[ Clear ]',
      align: 'center',
      valign: 'middle',
      border: { type: 'line' },
      keys: true,
      mouse: true,
      style: {
        fg: T.ink,
        bg: T.alert,
        border: { fg: T.alert },
        focus: { bg: 'lightred', fg: T.ground },
        hover: { bg: 'lightred', fg: T.ground },
      },
    });

    const cancelBtn = createButton({
      parent: modal,
      top: 10,
      left: 44,
      width: 14,
      height: 3,
      content: '[ Cancel ]',
      align: 'center',
      valign: 'middle',
      border: { type: 'line' },
      keys: true,
      mouse: true,
      style: {
        fg: T.ink,
        bg: T.ground,
        border: { fg: T.dim },
        focus: { bg: T.dim, fg: T.ground },
        hover: { bg: T.dim, fg: T.ground },
      },
    });

    const cleanup = () => {
      if (closed) return;
      closed = true;
      screen.off('keypress', keyHandler);
      screen.remove(modal);
      screen.render();
    };

    saveBtn.on('press', () => { save(); });
    clearBtn.on('press', () => {
      if (closed) return;
      cleanup();
      resolve('');
    });
    cancelBtn.on('press', () => { cleanup(); resolve(null); });

    const focusables: any[] = [nameInput, saveBtn, clearBtn, cancelBtn];
    const advanceFrom = (current: any) => {
      if (closed) return;
      const i = focusables.indexOf(current);
      focusables[(i + 1) % focusables.length].focus();
      screen.render();
    };

    nameInput.on('submit', () => advanceFrom(nameInput));

    const keyHandler = (ch: any, key: any) => {
      if (closed) return;
      if (key.name === 'escape') { cleanup(); resolve(null); }
      else if (key.name === 'tab') advanceFrom(screen.getFocused());
    };

    screen.on('keypress', keyHandler);
    nameInput.focus();
    screen.render();
  });
}
