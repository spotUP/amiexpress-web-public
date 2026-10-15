/**
 * The sprite editor's chrome colours, from the caller's theme.
 *
 * Chrome only. The SPRITE's own palette is content - a sprite drawn in red
 * is red because the artist chose red, and a theme has no business
 * repainting it. What moves here is the editor around it: panels, labels,
 * status text, dialogs.
 *
 * A live binding, so applyTheme() at startup reaches every module.
 */
import {
  themeStyles,
  themeById,
  resolveTheme,
  type Theme,
  type ThemeTokens,
  type ThemeStyles,
} from '@amiexpress/bbs-door-sdk/engines/ui/theme';

/**
 * The theme itself, and the two views of it the door draws with.
 *
 * THEME is the source; T and S are derived from it and must never be set
 * from anywhere else, or the requester's chrome and the panels around it
 * drift apart. studio.ts has imported THEME since 3553f700d and it was
 * never exported here - so `attachDoorChrome(THEME, ...)` was handed
 * `undefined` and every picker threw "Cannot read properties of undefined
 * (reading 'rail')" the moment it drew. The door's own tsc says so
 * (TS2305) and its dist has been stale since; nothing ran either.
 */
export let THEME: Theme = themeById('classic');
export let T: ThemeTokens = THEME.tokens;
export let S: ThemeStyles = themeStyles(THEME);

/**
 * Re-theme this door.
 *
 * Takes whatever names a theme: the theme itself, or the bbs handle that
 * knows which one the caller chose. Called at startup with the bbs, and
 * again with a THEME by the editor's View > Theme menu, which previews a
 * theme that is not saved yet and so cannot be read back off the bbs.
 */
export function applyTheme(source: unknown): void {
  const theme = resolveTheme(source);
  if (!theme) return;
  THEME = theme;
  T = theme.tokens;
  S = themeStyles(theme);
}
