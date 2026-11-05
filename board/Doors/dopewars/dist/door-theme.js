"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CURRENT = exports.S = exports.T = void 0;
exports.applyTheme = applyTheme;
/**
 * DOPEWARS colours, from the caller's theme.
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
const theme_1 = require("@amiexpress/bbs-door-sdk/engines/ui/theme");
/** Raw tokens, for tags and style objects. */
exports.T = (0, theme_1.themeById)('classic').tokens;
/** Ready-made widget styles: panels, frames, bars, lists. */
exports.S = (0, theme_1.themeStyles)((0, theme_1.themeById)('classic'));
/** The theme itself, for the few places that need its border or rail. */
exports.CURRENT = (0, theme_1.themeById)('classic');
/**
 * Re-theme this door.
 *
 * Safe to call with anything - a host with no theme leaves the classic
 * default in place, which is the board exactly as it has always looked.
 */
function applyTheme(source) {
    const theme = (0, theme_1.resolveTheme)(source);
    if (!theme)
        return;
    exports.CURRENT = theme;
    exports.T = theme.tokens;
    exports.S = (0, theme_1.themeStyles)(theme);
}
//# sourceMappingURL=door-theme.js.map