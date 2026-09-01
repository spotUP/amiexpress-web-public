"use strict";
/**
 * Integer-row geometry for both studio screens, replacing percent strings.
 *
 * Studio 2c root cause (recorded here, full arithmetic in the task-2
 * report): the old layout gave every pane a percent top/height
 * (canvasBox '90%', the right column '45%'+'30%'+'15%', etc). Each percent
 * string is resolved independently through `Math.floor(percent * parentHeight)`
 * (element.ts's calcPos) - there is no single partition step that derives
 * a sibling's edge FROM the pane above it. Two panes that are supposed to
 * share a boundary (the browser's sprites/animations split against the
 * doors/preview columns, at 45%+45% vs 90%) instead each round
 * independently, and `Math.floor(a) + Math.floor(b)` is not always equal
 * to `Math.floor(a + b)` - so at some terminal heights (measured: 23, 24)
 * the shared boundary lands on two DIFFERENT rows, one column's border a
 * row above the other's, and at others (25, 30, 40) it happens to
 * coincide. A bug that appears and disappears depending on the viewer's
 * terminal height is exactly this class of defect.
 *
 * Every rect below is a literal integer, derived by hand from one shared
 * partition of the 25-row screen (row 0 = menu bar, rows 1-19 = content,
 * rows 20-23 = reserved headroom for future floating/minimized panels,
 * row 24 = status bar) so two panes that must share an edge are written
 * with that edge in common - there is no rounding step left to disagree.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LAYOUT = exports.STATUS_ROW = void 0;
/** The last row of the screen - the status bar's row, and nothing else's. */
exports.STATUS_ROW = 24;
function rect(top, left, width, height) {
    return Object.freeze({ top, left, width, height });
}
exports.LAYOUT = Object.freeze({
    /**
     * Edit screen: the hosted ANSIEditor owns everything between the menu
     * bar and the status row.
     *
     * It was a 44x19 Canvas pane beside a Preview/Frames column until
     * 2026-09-01, when a screenshot showed why that could not work. The
     * widget was built to own an 80x25 screen and sizes its chrome
     * absolutely: its colour/tool sidebar needs about twenty rows and its
     * F-key strip about seventy columns. Given nineteen rows and
     * thirty-eight columns it did not shrink - blessed does not clip
     * children to a parent - so the F-key strip was cut off mid-way and the
     * Fill/Pick/Select tools painted OUTSIDE the panel, onto the bare
     * screen below every border.
     *
     * Making the widget clip and reflow is the real fix and belongs in the
     * SDK; giving it the room it was designed for is what this door can do,
     * and it is what the user asked for anyway ("everything should live in
     * the ansi editor"). The frames strip folds into the status row, and the
     * animation preview stays in the browser one keystroke away.
     */
    edit: {
        canvas: rect(1, 0, 80, 23),
        status: rect(exports.STATUS_ROW, 0, 80, 1),
    },
    /**
     * Browser screen. Doors (left) and Preview (right) each run the full
     * 19 content rows; Sprites/Animations split that column top-to-bottom
     * the same way the edit screen's right column does.
     */
    browser: {
        doors: rect(1, 0, 20, 19),
        sprites: rect(1, 20, 20, 9),
        animations: rect(10, 20, 20, 10),
        preview: rect(1, 40, 40, 19),
        status: rect(exports.STATUS_ROW, 0, 80, 1),
    },
});
