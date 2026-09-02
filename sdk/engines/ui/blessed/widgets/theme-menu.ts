/**
 * ThemeMenu - change the door's theme while the door is running.
 *
 * "all typescript doors with menus could have a theme menu that let's the
 * user change blessed theme inside the doors on the fly" (sysop,
 * 2026-09-02). Until now a theme was picked outside the doors, by the
 * THEME-PICKER door, whose last line is "Open a door to see it".
 *
 * The panel stays open and the highlight IS the preview: moving it re-tints
 * the whole screen behind the panel, so a theme is judged on the door the
 * player is actually in. ENTER keeps the highlighted theme and saves it;
 * ESC puts back whatever was running when the panel opened and saves
 * nothing.
 *
 * A door's part is one menu entry:
 *
 *     { label: 'Theme', action: () => openThemeMenu({
 *         screen: this.screen,
 *         bbs: this.session.bbs,
 *         onApply: (theme) => { applyTheme(theme); this.repaint(); },
 *       }) }
 *
 * `onApply` is for the door's own captured colours - a `door-theme.ts`
 * module's live bindings, a constant read at startup - and runs before the
 * tree is re-tinted. A door with none can leave it out.
 */

import { Box } from './box';
import { List } from './list';
import type { Screen } from '../core/screen';
import {
  THEMES,
  themeById,
  retintTree,
  type Theme,
} from '../../theme/index.js';

export interface ThemeMenuOptions {
  /** The screen to re-tint. */
  screen: Screen;
  /**
   * The caller's BBS handle, for `getTheme` and `setTheme`. A door without
   * one (a test, an older host) still gets a working panel; the choice just
   * is not remembered.
   */
  bbs?: unknown;
  /** Where to hang the panel. Defaults to the screen. */
  parent?: unknown;
  /** The door's own re-theming, run before each re-tint. */
  onApply?: (theme: Theme) => void;
  /** The themes to offer. Defaults to every theme the SDK ships. */
  themes?: readonly Theme[];
  /** Which theme is running now, when the bbs cannot say. */
  current?: Theme;
}

/** The panel's own resolution of "what is running now". */
function activeTheme(options: ThemeMenuOptions): Theme {
  if (options.current) return options.current;
  const getTheme = (options.bbs as { getTheme?: () => Theme } | undefined)?.getTheme;
  if (typeof getTheme === 'function') {
    try {
      const theme = getTheme.call(options.bbs);
      if (theme?.tokens) return theme;
    } catch {
      // A theme that will not resolve is not worth failing a menu over.
    }
  }
  return themeById('classic');
}

/**
 * Open the panel. Resolves with the theme that is running when it closes -
 * the chosen one on ENTER, the one it opened with on ESC.
 */
export function openThemeMenu(options: ThemeMenuOptions): Promise<Theme> {
  const themes = options.themes ?? THEMES;
  const opened = activeTheme(options);
  let showing = opened;

  return new Promise((resolve) => {
    const parent = (options.parent ?? options.screen) as never;

    const frame = new Box({
      parent,
      top: 'center',
      left: 'center',
      width: 54,
      height: Math.min(themes.length + 6, 20),
      border: { type: 'line' },
      label: ' Theme ',
      tags: true,
      style: {
        fg: showing.tokens.ink,
        bg: showing.tokens.ground,
        border: { fg: showing.tokens.chrome },
      },
    } as never);

    const list = new List({
      parent: frame,
      top: 0,
      left: 0,
      width: '100%-2',
      height: themes.length,
      keys: true,
      mouse: true,
      style: {
        fg: showing.tokens.ink,
        bg: showing.tokens.ground,
        selected: { fg: showing.tokens.selectionInk, bg: showing.tokens.selectionBg },
      },
      items: themes.map((theme) => ` ${theme.name.padEnd(18, ' ')}${theme.blurb}`),
    } as never);

    const help = new Box({
      parent: frame,
      bottom: 0,
      left: 1,
      width: '100%-4',
      height: 1,
      tags: true,
      content: 'UP/DOWN previews.  ENTER keeps it.  ESC puts it back.',
      style: { fg: showing.tokens.dim, bg: showing.tokens.ground },
    } as never);

    /** Show `next`: the door re-themes itself, then the tree is re-tinted. */
    const show = (next: Theme): void => {
      if (next.id === showing.id) return;
      try {
        options.onApply?.(next);
      } catch {
        // A door that throws while re-theming still gets its colours.
      }
      retintTree(options.screen, showing, next);
      showing = next;
      options.screen.render();
    };

    const startAt = Math.max(0, themes.findIndex((theme) => theme.id === opened.id));
    (list as unknown as { select(index: number): void }).select(startAt);

    // The List reads LEFT and RIGHT as page-up and page-down and UP/DOWN as
    // one row; every one of those lands here, because moving the highlight
    // is what previews a theme.
    list.on('select item', () => {
      const index = (list as unknown as { selected: number }).selected ?? 0;
      const next = themes[index];
      if (next) show(next);
    });

    const close = (keep: boolean): boolean => {
      if (!keep) show(opened);
      const chosen = showing;
      list.destroy();
      help.destroy();
      frame.destroy();
      options.screen.render();

      if (keep) {
        const setTheme = (options.bbs as { setTheme?: (id: string) => Promise<string> } | undefined)?.setTheme;
        if (typeof setTheme === 'function') {
          // Saving is a database write; a door must not wait on it to draw.
          Promise.resolve(setTheme.call(options.bbs, chosen.id)).catch(() => undefined);
        }
      }
      resolve(chosen);
      return true;
    };

    list.on('select', () => { close(true); });
    list.key(['escape', 'q'], () => close(false));

    (frame as unknown as { setFront(): void }).setFront();
    list.focus();
    options.screen.render();
  });
}
