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
  type Theme,
  type ThemeTokens,
  type ThemeStyles,
} from '@amiexpress/bbs-door-sdk/engines/ui/theme';

export let T: ThemeTokens = themeById('classic').tokens;
export let S: ThemeStyles = themeStyles(themeById('classic'));

/** Resolve the caller's theme. A host without getTheme keeps classic. */
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
