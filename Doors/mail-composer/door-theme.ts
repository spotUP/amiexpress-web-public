/**
 * Mail Composer's colours, from the caller's theme.
 *
 * This door spread literal colour names through its widgets - `fg: 'cyan'`,
 * `bg: 'blue'`, `{yellow-fg}` - which is a door that looks identical
 * whatever theme the caller chose. Each literal is now the TOKEN that was
 * standing behind it, so `classic` renders exactly as before (its tokens ARE
 * those names) and every other theme is followed rather than ignored.
 *
 * `T` and `S` are live bindings: `applyTheme` reassigns them once at startup
 * and every use site sees the new values.
 *
 * Copied from DOORMAN's `door-theme.ts`, which is the reference migration -
 * not reinvented, so all the migrated doors keep one shape.
 */
import {
  themeStyles,
  themeById,
  resolveTheme,
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
 * Safe to call with anything - a host with no theme leaves the classic
 * default in place, which is the board exactly as it has always looked.
 */
export function applyTheme(source: unknown): void {
  const theme = resolveTheme(source);
  if (!theme) return;
  CURRENT = theme;
  T = theme.tokens;
  S = themeStyles(theme);
}
