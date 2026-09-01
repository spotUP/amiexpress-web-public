"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.S = exports.T = void 0;
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
function applyTheme(bbs) {
    const getTheme = bbs?.getTheme;
    if (typeof getTheme !== 'function')
        return;
    try {
        const theme = getTheme.call(bbs);
        if (!theme?.tokens)
            return;
        exports.T = theme.tokens;
        exports.S = (0, theme_1.themeStyles)(theme);
    }
    catch {
        // A theme that will not resolve is not worth failing a door over.
    }
}
