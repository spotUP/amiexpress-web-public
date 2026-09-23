"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.S = exports.T = exports.THEME = void 0;
exports.applyTheme = applyTheme;
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
const theme_1 = require("@amiexpress/bbs-door-sdk/engines/ui/theme");
/**
 * The theme itself, and the two views of it the door draws with.
 *
 * THEME is the source; T and S are derived from it and must never be set
 * from anywhere else, or a requester's chrome and the panels around it drift
 * apart. It is EXPORTED on purpose: the fork base left it private while
 * studio.ts imported it, so `attachDoorChrome(THEME, ...)` was handed
 * `undefined` and every picker threw the moment it drew.
 */
exports.THEME = (0, theme_1.themeById)('classic');
exports.T = exports.THEME.tokens;
exports.S = (0, theme_1.themeStyles)(exports.THEME);
/**
 * Re-theme this door.
 *
 * Takes whatever names a theme: the theme itself, or the bbs handle that
 * knows which one the caller chose. Called at startup with the bbs, and
 * again with a THEME by the editor's View > Theme menu, which previews a
 * theme that is not saved yet and so cannot be read back off the bbs.
 */
function applyTheme(source) {
    const theme = (0, theme_1.resolveTheme)(source);
    if (!theme)
        return;
    exports.THEME = theme;
    exports.T = theme.tokens;
    exports.S = (0, theme_1.themeStyles)(theme);
}
