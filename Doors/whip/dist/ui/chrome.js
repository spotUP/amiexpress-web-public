"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachWhipChrome = attachWhipChrome;
/**
 * WHIP's chrome, in one place.
 *
 * Every screen in this door builds the same two boxes - a framed header
 * three rows tall and a framed footer three rows tall - and each one filled
 * them with its own centred title and its own hand-typed `[Enter] Select`
 * line. That is seven copies of a look and seven places for it to drift; it
 * is also why WHIP had the theme's COLOURS and none of its chrome, which is
 * the complaint `attachDoorChrome` exists to answer.
 *
 * So this is the door's ONE call into it. A view hands over the boxes it
 * already made and gets back the animated slash rail, the theme's glitches
 * and the SDK's hint row - without a cell of its layout moving, because the
 * geometry stays where the view put it and only the CONTENT of those two
 * rows changes.
 *
 * A three-row box with a line border has exactly one interior row (probed:
 * `iheight` 1, `iwidth` 78 at 80 columns), so the rail lands on the row the
 * centred title used to occupy and the hint line on the row the hand-typed
 * keys used to occupy. Neither box grows.
 */
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const theme_1 = require("@amiexpress/bbs-door-sdk/engines/ui/theme");
const door_theme_1 = require("../door-theme");
/**
 * Attach the full chrome to one WHIP view.
 *
 * The returned handle MUST be stopped from that view's teardown - a rail
 * timer still writing after `screen.remove()` takes the session with it.
 */
function attachWhipChrome(options) {
    const { screen, header, footer, title, hints, compactHints, glitch } = options;
    // The live width, never 80: the rail is drawn to the screen the caller
    // actually has, and `attachDoorChrome` is the one thing that decides from
    // it whether anything moves at all.
    const width = (screen.width) || 80;
    const masthead = header
        ? (0, blessed_helpers_1.createBox)({
            parent: header,
            top: 0,
            left: 0,
            width: '100%',
            height: 1,
            // Explicitly none: Panel takes a line border when the caller names
            // no `border` key at all, and a one-row framed box has no interior.
            border: undefined,
            // The header's own colours rather than the SDK's bar style: this row
            // sits INSIDE a framed panel, and a bar-coloured strip in there
            // reads as a band painted across the box, not as its title.
            style: { fg: door_theme_1.T.ink, bg: door_theme_1.T.ground },
            content: '',
            focusable: false,
            mouse: false,
            clickable: false,
        })
        : undefined;
    return (0, theme_1.attachDoorChrome)(door_theme_1.CURRENT, {
        width,
        title,
        masthead: masthead,
        // One column short of the screen - writing a row's final cell leaves the
        // terminal in a pending-wrap state - and two more for the header's frame.
        mastheadWidth: Math.max(1, width - 3),
        footer: footer,
        hints,
        compactHints,
        // Every footer in this door indented its keys by one column; keeping the
        // pad means the hint row starts exactly where the old line started.
        footerPad: ' ',
        glitch,
        glitchOptions: { tickMs: 400 },
        styles: door_theme_1.S,
        render: () => screen.render(),
    });
}
