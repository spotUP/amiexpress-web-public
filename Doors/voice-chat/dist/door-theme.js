"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CURRENT = exports.S = exports.T = void 0;
exports.applyTheme = applyTheme;
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
 * Takes whatever names a theme: the theme itself, or the bbs handle that
 * knows which one the caller chose. Safe to call with anything - a host
 * with no theme leaves the classic default in place, which is the board
 * exactly as it has always looked.
 *
 * Called at startup with the bbs, and again with a THEME by the in-door
 * theme menu (openThemeMenu), which previews a theme that is not saved
 * yet and so cannot be read back off the bbs.
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