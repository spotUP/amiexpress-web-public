/**
 * VOICE CHAT's colours, from the caller's theme.
 *
 * This door spread literal colour names across its files - `fg: 'cyan'`,
 * `{gray-fg}` and so on - which is a door that looks identical whatever
 * theme the user chose. Each literal is now the TOKEN that was standing
 * behind it, so `classic` renders exactly as before (its tokens ARE those
 * names) and every other theme is followed rather than ignored.
 *
 * `T` and `S` are live bindings: `applyTheme` reassigns them once at
 * startup and every module that imported them sees the new values. That is
 * why this is one module rather than a handle threaded through constructors.
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

/** Raw tokens, for tags and style objects. */
export let T: ThemeTokens = themeById('classic').tokens;

/** Ready-made widget styles: panels, frames, bars, lists. */
export let S: ThemeStyles = themeStyles(themeById('classic'));

/** The theme itself, for the few places that need its border or rail. */
export let CURRENT: Theme = themeById('classic');

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
  CURRENT = theme;
  T = theme.tokens;
  S = themeStyles(theme);
}
