/**
 * DOORMAN's colours, from the caller's theme.
 *
 * This door spread literal colour names across ten files - `fg: 'cyan'`,
 * `{gray-fg}` and so on - which is a door that looks identical whatever
 * theme the user chose. Each literal is now the TOKEN that was standing
 * behind it, so `classic` renders exactly as before (its tokens ARE those
 * names) and every other theme is followed rather than ignored.
 *
 * `T` and `S` are live bindings: `applyTheme` reassigns them once at
 * startup and every module that imported them sees the new values. That is
 * why this is one module rather than a handle threaded through ten
 * constructors.
 */
import { type Theme, type ThemeTokens, type ThemeStyles } from '@amiexpress/bbs-door-sdk/engines/ui/theme';
/** Raw tokens, for tags and style objects. */
export declare let T: ThemeTokens;
/** Ready-made widget styles: panels, frames, bars, lists. */
export declare let S: ThemeStyles;
/** The theme itself, for the few places that need its border or rail. */
export declare let CURRENT: Theme;
/**
 * Resolve the caller's theme. Safe to call with anything - a bbs without
 * getTheme (an older host, or a test) leaves the classic default in place,
 * which is the board exactly as it has always looked.
 */
export declare function applyTheme(bbs: unknown): void;
//# sourceMappingURL=door-theme.d.ts.map