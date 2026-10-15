/**
 * The PETSCII editor's chrome colours, from the caller's theme.
 *
 * Chrome only. The SCREEN's own colours are content - a cell drawn in red is
 * red because the artist chose red, and a theme has no business repainting
 * it. The board's sixteen are a C64's, not a palette anybody themes. What moves here is the editor around it: panels, labels,
 * status text, dialogs.
 *
 * A live binding, so applyTheme() at startup reaches every module.
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

/**
 * The theme itself, and the two views of it the door draws with.
 *
 * THEME is the source; T and S are derived from it and must never be set
 * from anywhere else, or a requester's chrome and the panels around it drift
 * apart. It is EXPORTED on purpose: the fork base left it private while
 * studio.ts imported it, so `attachDoorChrome(THEME, ...)` was handed
 * `undefined` and every picker threw the moment it drew.
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
  /*
   * AND TELL THE SDK, which is what the widgets read.
   *
   * A widget cannot ask the door what its theme is, so the SDK keeps one
   * answer for the door that is running and every widget built afterwards
   * follows it (`engines/ui/theme/live.ts`). Without this line the editor's
   * own menu bar drew in the SDK's default colours while everything the door
   * painted itself used the caller's - "the door theme does not use our theme
   * colors" (the sysop, 2026-09-23).
   */
  setActiveTheme(theme);
}
