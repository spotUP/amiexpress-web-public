/**
 * WHIP's colours, from the caller's theme.
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
 * Resolve the caller's theme. Safe to call with anything - a bbs without
 * getTheme (an older host, or a test) leaves the classic default in place,
 * which is the board exactly as it has always looked.
 */
export function applyTheme(bbs: unknown): void {
  const getTheme = (bbs as { getTheme?: () => Theme } | undefined)?.getTheme;
  if (typeof getTheme !== 'function') return;
  try {
    const theme = getTheme.call(bbs);
    if (!theme?.tokens) return;
    CURRENT = theme;
    T = theme.tokens;
    S = themeStyles(theme);
  } catch {
    // A theme that will not resolve is not worth failing a door over.
  }
}
