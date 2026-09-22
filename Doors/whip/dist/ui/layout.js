"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.whipPanes = whipPanes;
exports.sideFits = sideFits;
/**
 * WHERE WHIP'S PANES GO, as one decision per screen rather than fifteen.
 *
 * Every WHIP screen is built the same way: a framed header, a content pane
 * with the door's work in it, and a framed footer the chrome fills. Most of
 * them then put TWO boxes side by side inside the content - a list at
 * `width: '50%'` and a detail or stats panel at `width: '45%'` - and that is
 * the thing a C64 cannot have. Twenty columns do not hold a bordered list of
 * `[D] My Profile (Discord name)`, and a 45% panel beside it holds eighteen.
 *
 * The sysop, 2026-09-22: "some of our typescript doors dont have a 40 column
 * mode, whip for example". A door with no 40-column mode is not merely ugly
 * there - the gate REFUSES it to a PETSCII caller, because a TypeScript
 * door's output never crosses the frame adapter and nothing would fold it.
 *
 * SO THE GEOMETRY IS A FUNCTION, not a set of literals spread through the
 * screens. It takes the LIVE width and height - never a constant, which is
 * the defect this replaces - and answers where the two panes are. At forty
 * columns they stack: the list takes the full width and the panel sits under
 * it, short enough that the footer keeps its row.
 *
 * The 80-column answers are exactly what the screens had before, so an
 * eighty-column board sees no change; that is what the tests pin.
 */
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
/**
 * The two panes of a WHIP screen.
 *
 * `rows` is the height of the CONTENT pane, not the screen: the caller has
 * already taken the menu bar, the header and the footer off it, and the sum
 * lives in one place per screen for the same reason this does.
 */
function whipPanes(width, rows, mainRows = 13) {
    if (!(0, bbs_door_sdk_1.isCompactWidth)(width)) {
        // Eighty columns, unchanged: the list on the left, the panel on the
        // right, both a row down from the top of the content pane.
        return {
            main: { top: 1, left: 1, width: '50%', height: mainRows },
            side: { top: 1, right: 1, width: '45%', height: mainRows - 1 },
            stacked: false,
            sideContentRows: mainRows - 3,
        };
    }
    /*
     * Forty columns. The list keeps its border - a C64 draws one cleanly and
     * the label is where the screen says what it is - and takes the whole
     * width; the panel goes underneath with whatever rows are left, and gives
     * up its border when there are not enough for one. Two rows of content is
     * the floor: a panel that cannot say two things is not worth the rows.
     */
    /*
     * THE LIST WINS THE ROWS. A first cut reserved four rows for the panel
     * whatever the screen had, so a short content pane gave the menu four rows
     * - one of them interior - and the panel three. The menu is what the
     * caller came for; the panel is what is LEFT, and on a screen with nothing
     * left there is no panel at all.
     */
    const profile = (0, bbs_door_sdk_1.getCompactProfile)(width);
    const room = rows >= mainRows + 4;
    const mainHeight = room ? mainRows : Math.max(3, Math.min(mainRows, rows));
    const sideTop = mainHeight + 1;
    const sideHeight = room ? Math.max(0, rows - sideTop) : 0;
    return {
        main: { top: 0, left: 0, width: '100%', height: mainHeight },
        side: { top: sideTop, left: 0, width: '100%', height: sideHeight },
        stacked: true,
        sideContentRows: Math.max(0, sideHeight - (profile.borders ? 2 : 0)),
    };
}
/**
 * Does the side panel fit at all?
 *
 * A screen with nothing left for it draws only the list rather than a
 * one-row box with a label and no content - and the caller loses nothing he
 * could have read.
 */
function sideFits(panes) {
    return panes.side.height >= 3 && panes.sideContentRows >= 1;
}
