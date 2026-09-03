"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.THEME = exports.S = exports.T = void 0;
exports.applyTheme = applyTheme;
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
const theme_1 = require("@amiexpress/bbs-door-sdk/engines/ui/theme");
exports.T = (0, theme_1.themeById)('classic').tokens;
exports.S = (0, theme_1.themeStyles)((0, theme_1.themeById)('classic'));
/**
 * The theme itself, for the SDK chrome.
 *
 * The rail and the glitches are properties of the THEME, not of its colour
 * tokens - attachDoorChrome asks it for both - so the studio has to keep
 * hold of the whole thing and not only the palette it paints with.
 */
exports.THEME = (0, theme_1.themeById)('classic');
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
    exports.T = theme.tokens;
    exports.S = (0, theme_1.themeStyles)(theme);
    exports.THEME = theme;
}
