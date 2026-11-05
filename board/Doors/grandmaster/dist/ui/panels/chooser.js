"use strict";
/**
 * The lists TETRIS ATTACK asks its questions with.
 *
 * Split out of app.ts because all four of them - mode, puzzle set, replay,
 * and anything added later - had the same defect for the same reason: a box
 * fifty-six columns wide, written while looking at an eighty-column terminal,
 * on a door that is marked for forty. On a C64 that box is wider than the
 * screen.
 *
 * So the width comes from the screen, and the labels come in two lengths. The
 * long one explains; the short one names. Neither is truncated at paint time,
 * because a truncated row of a menu is how a caller ends up choosing the wrong
 * mode.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.chooserLayout = chooserLayout;
exports.chooserLabels = chooserLabels;
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
/** Two rows of border plus a row of padding top and bottom. */
const CHROME_ROWS = 3;
/** A border column each side, plus one of padding. */
const CHROME_COLUMNS = 4;
function chooserLayout(screenWidth, screenHeight, rowCount) {
    const compact = (0, blessed_1.isCompactWidth)(screenWidth);
    const width = Math.min((0, blessed_1.calculateDialogWidth)(screenWidth), screenWidth);
    // Never taller than the screen: a list that runs off the bottom cannot be
    // scrolled to on a terminal that does not scroll.
    const height = Math.min(rowCount + CHROME_ROWS, Math.max(5, screenHeight - 2));
    return {
        width,
        innerWidth: Math.max(1, width - CHROME_COLUMNS),
        height,
        innerHeight: Math.max(1, height - CHROME_ROWS),
        compact,
    };
}
/** The labels to show, at the length this screen has room for. */
function chooserLabels(rows, layout) {
    return rows.map((row) => {
        const text = layout.compact ? row.compact : row.wide;
        return text.length > layout.innerWidth ? text.slice(0, layout.innerWidth) : text;
    });
}
//# sourceMappingURL=chooser.js.map