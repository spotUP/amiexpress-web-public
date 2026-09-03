"use strict";
/**
 * Where the board and the HUD go, at whatever width the caller has.
 *
 * Exported and I/O-free on purpose, the shape Doors/bug-tracker/layout.ts and
 * Doors/ami-stripper/layout.ts take: every width rule lives in one testable
 * function rather than scattered through a screen that needs a terminal to run.
 *
 * THE BOARD IS THE SAME SIZE ON EVERY SCREEN. Six panels at two characters is
 * twelve columns, and twelve rows plus the incoming one is thirteen - which
 * fits inside forty columns and twenty-five rows with room left over. So unlike
 * every other door adapted for the C64, nothing here has to be folded, stacked
 * or dropped. What changes is the CHROME around it: at forty columns the HUD
 * loses its labels and sits in whatever space is left.
 *
 * Read the tier, never compare widths by hand - the SDK owns the breakpoints
 * and a second ladder here would eventually disagree with it.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.panelsLayout = panelsLayout;
exports.hudLines = hudLines;
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
/** Characters the HUD needs when it can spell things out. */
const HUD_WIDE = 16;
/** Characters the HUD needs when it cannot. */
const HUD_COMPACT = 12;
/** Space between the board and the HUD. */
const GAP = 2;
/**
 * Place a board of `boardCols` x `boardRows` characters on a screen.
 *
 * At 80 columns and wider the pair is centred, biased left so the HUD beside it
 * does not push the board off-centre visually. At 40 the board goes hard left
 * with a single column of margin, because centring a 12-wide board on a 40-wide
 * screen wastes the space the HUD needs.
 */
function panelsLayout(screenWidth, screenHeight, boardCols, boardRows) {
    const compact = (0, blessed_1.isCompactWidth)(screenWidth);
    const profile = (0, blessed_1.getCompactProfile)(screenWidth);
    const hudWidth = compact ? HUD_COMPACT : HUD_WIDE;
    const totalWidth = boardCols + GAP + hudWidth;
    const left = compact
        ? 1
        : Math.max(0, Math.floor((screenWidth - totalWidth) / 2));
    const top = compact
        ? 0
        : Math.max(0, Math.floor((screenHeight - boardRows) / 2));
    return {
        compact,
        effects: (0, blessed_1.effectsAllowed)(screenWidth),
        tier: (0, blessed_1.getBreakpointName)(screenWidth),
        board: { top, left, width: boardCols, height: boardRows },
        hud: {
            top,
            left: left + boardCols + GAP,
            width: Math.max(0, Math.min(hudWidth, screenWidth - (left + boardCols + GAP))),
            height: boardRows,
        },
        // getCompactProfile says whether this tier draws frames at all.
        border: profile.borders,
    };
}
/**
 * The HUD's lines.
 *
 * At forty columns the labels go and the numbers stay, because the numbers are
 * what a player reads mid-game and the labels are what they can afford to lose.
 * Every line is clipped to the width it was given: a HUD line that overruns on
 * a C64 wraps and pushes the board off the screen.
 */
function hudLines(layout, values) {
    const width = layout.hud.width;
    // Clip the VISIBLE text and colour it afterwards. Clipping a tagged string
    // cuts through the tag itself, which paints nothing and leaves the tag open
    // for the rest of the screen.
    const clip = (text) => (text.length > width ? text.slice(0, width) : text);
    const tag = (colour, text) => `{${colour}-fg}${clip(text)}{/${colour}-fg}`;
    if (layout.compact) {
        return [
            clip(`P${values.score}`),
            clip(`L${values.speed}`),
            clip(values.timeText),
            values.chain > 1 ? clip(`x${values.chain}`) : '',
            values.stopped ? clip('STOP') : '',
            values.movesLeft != null ? clip(`M${values.movesLeft}`) : '',
            values.canUndo ? clip('X UNDO') : '',
        ];
    }
    return [
        tag('yellow', 'POINT'),
        clip(`  ${String(values.score).padStart(5, ' ')}`),
        '',
        tag('yellow', 'LEVEL'),
        clip(`  ${String(values.speed).padStart(5, ' ')}`),
        '',
        tag('yellow', 'TIME'),
        clip(`  ${values.timeText.padStart(5, ' ')}`),
        '',
        // The chain counter starts at 2; there is no chain 1.
        values.chain > 1 ? tag('lightmagenta', `x${values.chain} CHAIN`) : '',
        values.stopped ? tag('lightcyan', 'STOP') : '',
        values.movesLeft != null ? tag('white', `MOVES ${values.movesLeft}`) : '',
        values.canUndo ? tag('lightblue', 'X UNDO') : '',
    ];
}
//# sourceMappingURL=layout.js.map