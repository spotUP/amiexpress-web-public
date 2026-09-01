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
  type Theme,
  type ThemeTokens,
  type ThemeStyles,
} from '@amiexpress/bbs-door-sdk/engines/ui/theme';

export let T: ThemeTokens = themeById('classic').tokens;
export let S: ThemeStyles = themeStyles(themeById('classic'));

export function applyTheme(bbs: unknown): void {
  const getTheme = (bbs as { getTheme?: () => Theme } | undefined)?.getTheme;
  if (typeof getTheme !== 'function') return;
  try {
    const theme = getTheme.call(bbs);
    if (!theme?.tokens) return;
    T = theme.tokens;
    S = themeStyles(theme);
  } catch {
    // A theme that will not resolve is not worth failing a door over.
  }
}
