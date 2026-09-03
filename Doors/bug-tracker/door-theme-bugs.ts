/**
 * BUGS's colours, from the caller's theme.
 *
 * A live binding, so app.ts resolving the theme once at startup colours the
 * dialogs too. Same shape as DOORMAN's door-theme.ts, for the same reason:
 * a handle threaded through every constructor is worse than one module.
 */
import {
  themeStyles,
  themeById,
  resolveTheme,
  setActiveTheme,
  type Theme,
  type ThemeTokens,
  type ThemeStyles,
} from '@amiexpress/bbs-door-sdk/engines/ui/theme';

export let T: ThemeTokens = themeById('classic').tokens;
export let S: ThemeStyles = themeStyles(themeById('classic'));

/** The theme itself, for chrome that needs its rail or border. */
export let THEME: Theme = themeById('classic');

/**
 * Re-theme this door.
 *
 * Takes whatever names a theme: the theme itself, or the bbs handle that
 * knows which one the caller chose. Safe to call with anything - a host
 * with no theme leaves the classic default in place, which is the board
 * exactly as it has always looked.
 *
 * Called at startup with the bbs, and again with a THEME by the in-door
 * theme menu (openThemeMenu), which previews a theme that is not saved
 * yet and so cannot be read back off the bbs.
 */
export function applyTheme(source: unknown): void {
  const theme = resolveTheme(source);
  if (!theme) return;
  // Tell the SDK too: its widgets pick their own defaults from it
  // (a menu bar's background, engines/ui/theme/live.ts).
  setActiveTheme(theme);
  THEME = theme;
  T = theme.tokens;
  S = themeStyles(theme);
}
