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
exports.CELL_ASPECT = void 0;
exports.panelScale = panelScale;
exports.panelsLayout = panelsLayout;
exports.hudLines = hudLines;
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
/** Characters the HUD needs when it can spell things out. */
const HUD_WIDE = 16;
/** Characters the HUD needs when it cannot. */
const HUD_COMPACT = 12;
/** Space between the board and the HUD. */
const GAP = 2;
/** Rows the stacked HUD needs under the board, plus the frame around it. */
const STACKED_HUD_ROWS = 2;
const FRAME_ROWS = 2;
const FRAME_COLS = 2;
/**
 * The biggest tile this screen can hold.
 *
 * Never smaller than 1x, because the 2x1 panel is the floor the sprites are
 * drawn at; and capped, because a board that fills a 200-column terminal in
 * six enormous tiles is not more readable, it is just bigger.
 */
/**
 * How wide a character cell is relative to its height, per screen.
 *
 * This is the fact the first version of the scaling missed, and it is not a
 * detail: it decides what "square" MEANS. An xterm cell is about twice as tall
 * as it is wide, so a 2x1-character panel reads square there. A PETSCII cell
 * is SQUARE, so the same panel is a 2:1 rectangle - which is why the C64 board
 * looked wrong before any scaling existed.
 */
exports.CELL_ASPECT = {
    /** xterm, and every ANSI terminal on this board. */
    terminal: 0.5,
    /** PETSCII on a C64: 8x8 pixels, square. */
    petscii: 1,
};
/**
 * The widest a tile may LOOK, however much room there is.
 *
 * Bounding the scale is not the same as bounding the shape, and confusing the
 * two is how a C64 ended up with tiles six characters wide and one row tall:
 * a scale of 3 is harmless on a terminal whose cells are tall, and a smear on
 * a screen whose cells are square. The cap is on what reaches the eye.
 */
const MAX_TILE_ASPECT = 2;
const DEFAULT_CHROME = {
    frameRows: FRAME_ROWS,
    frameCols: FRAME_COLS,
    hudRows: STACKED_HUD_ROWS,
};
function panelScale(screenWidth, screenHeight, boardCols, boardRows, stacked, cellAspect = exports.CELL_ASPECT.terminal, chrome = DEFAULT_CHROME) {
    // Beside the board, the HUD's columns are not the board's to grow into.
    const usableCols = Math.max(1, stacked ? screenWidth - chrome.frameCols : screenWidth - chrome.frameCols - GAP - HUD_WIDE);
    const usableRows = Math.max(1, screenHeight - chrome.frameRows - (stacked ? chrome.hudRows : 0));
    const fitX = Math.max(1, Math.min(MAX_SCALE, Math.floor(usableCols / boardCols)));
    const fitY = Math.max(1, Math.min(MAX_SCALE, Math.floor(usableRows / boardRows)));
    // A TILE KEEPS ITS SHAPE unless the board owns the whole width.
    //
    // Growing width and height independently is how an 80x25 terminal ended up
    // with 4x1 tiles - eight characters wide and one row tall, which is not a
    // panel, it is a dash. Where the HUD sits beside the board there is height
    // to spare and width to spare in different amounts, so the scale is the
    // smaller of the two and the tile stays the shape it was drawn.
    if (!stacked) {
        const uniform = Math.min(fitX, fitY);
        return { x: uniform, y: uniform };
    }
    // Stacked, the board owns the width and filling it is the point - but only
    // as far as the tile still reads as a tile. A panel is 2 characters wide and
    // `y` rows tall, so on screen it is (2 * x * cellAspect) by y; the widest
    // stretch allowed is whatever keeps that under MAX_TILE_ASPECT.
    //
    // On a terminal that is generous: cells are half as wide as they are tall,
    // so x may reach twice y. On a C64 it is not, because the cells are square -
    // a 2x1 panel is already at the limit there, and stretching it further is
    // what produced the six-to-one smear a caller photographed.
    const widestForShape = Math.max(1, Math.floor((MAX_TILE_ASPECT * fitY) / (2 * cellAspect)));
    return { x: Math.min(fitX, widestForShape), y: fitY };
}
/** Beyond this a bigger tile stops helping and starts wasting the screen. */
const MAX_SCALE = 4;
/**
 * Place a board of `boardCols` x `boardRows` characters on a screen.
 *
 * At 80 columns and wider the pair is centred, biased left so the HUD beside it
 * does not push the board off-centre visually. At 40 the board goes hard left
 * with a single column of margin, because centring a 12-wide board on a 40-wide
 * screen wastes the space the HUD needs.
 */
function panelsLayout(screenWidth, screenHeight, boardCols, boardRows, cellAspect = exports.CELL_ASPECT.terminal) {
    const compact = (0, blessed_1.isCompactWidth)(screenWidth);
    const profile = (0, blessed_1.getCompactProfile)(screenWidth);
    // THE HUD GOES UNDER THE BOARD when there is not room for it beside one.
    //
    // Side by side, the HUD costs the board sixteen columns it could have grown
    // into - which on a phone is most of the screen ("the playfield should use
    // the full phone width"). Stacked, the board takes the width and the HUD
    // takes two rows under it, which is the single-column rule the compact
    // profile already asks for everywhere else on this board.
    // PORTRAIT STACKS, LANDSCAPE SITS BESIDE.
    //
    // Not width alone: an 80x25 terminal is narrow in characters but wide on the
    // glass, and stacking there would replace the classic board with a squat one
    // nobody asked for. A screen with more ROWS than columns is a phone held
    // upright, and that is exactly the case where the HUD beside the board costs
    // it most of the width it could be using.
    const portrait = screenHeight > screenWidth;
    // ASK WHICH LAYOUT GIVES THE BIGGER BOARD, do not decide by tier.
    //
    // Stacking every "compact" screen put a one-line HUD under a board twelve
    // columns wide with twenty-eight columns of black beside it: "why a minimal
    // hud there in tetris attack? there is plenty of room?" (2026-09-06). But
    // simply preferring the HUD beside the board takes a PHONE's playfield from
    // 36 columns down to 12, because there the HUD's sixteen columns are most
    // of the screen.
    //
    // So compare them. A HUD beside the board is the better shape - it has room
    // for labels rather than initials - and it wins ties; stacking only earns
    // its place by making the board materially bigger, which is exactly the
    // phone. Above the compact tier nothing changes: an 80-column screen has
    // always put the HUD beside and its layout is pinned byte for byte.
    const square = cellAspect >= exports.CELL_ASPECT.petscii;
    const chromeFor = (isStacked) => (square
        ? { frameRows: 0, frameCols: 0, hudRows: isStacked ? 1 : 0 }
        : DEFAULT_CHROME);
    const area = (isStacked) => {
        const s = panelScale(screenWidth, screenHeight, boardCols, boardRows, isStacked, cellAspect, chromeFor(isStacked));
        return boardCols * s.x * boardRows * s.y;
    };
    const tooNarrowForHud = screenWidth < boardCols + GAP + HUD_WIDE + 2;
    const stacked = portrait
        || tooNarrowForHud
        || ((0, blessed_1.isCompactWidth)(screenWidth) && area(true) > area(false));
    const hudWidth = stacked ? screenWidth - (compact ? 0 : FRAME_COLS) : HUD_WIDE;
    // A SQUARE-CELLED SCREEN SPENDS ITS CHROME ON THE TILE.
    //
    // The C64's twenty-five rows hold twelve panel rows at double height only
    // if the border and one of the HUD's two rows give way - 12*2 + 1 = 25
    // exactly. That is the whole difference between a 6x12 board of single
    // characters and a 12x24 one that can be read across the room, and the
    // sysop asked for the bigger tile: "can we make the pieces bigger in tetris
    // attack in petscii mode?" (2026-09-06). Elsewhere there are rows to spare
    // and the frame is worth its space.
    const chrome = chromeFor(stacked);
    const scale = panelScale(screenWidth, screenHeight, boardCols, boardRows, stacked, cellAspect, chrome);
    const width = boardCols * scale.x;
    const height = boardRows * scale.y;
    const totalWidth = stacked ? width : width + GAP + hudWidth;
    const left = Math.max(1, Math.floor((screenWidth - totalWidth) / 2));
    const hudRows = stacked ? chrome.hudRows : 0;
    const top = stacked
        ? Math.max(0, Math.floor((screenHeight - height - hudRows) / 2))
        : Math.max(1, Math.floor((screenHeight - height) / 2));
    return {
        compact,
        effects: (0, blessed_1.effectsAllowed)(screenWidth),
        tier: (0, blessed_1.getBreakpointName)(screenWidth),
        board: { top, left, width, height },
        hud: stacked
            ? {
                top: top + height,
                left,
                width: Math.max(0, Math.min(hudWidth, screenWidth - left)),
                height: hudRows,
            }
            : {
                top,
                left: left + width + GAP,
                width: Math.max(0, Math.min(hudWidth, screenWidth - (left + width + GAP))),
                height,
            },
        // getCompactProfile says whether this tier draws frames at all.
        border: profile.borders,
        scale,
        stacked,
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
    if (layout.stacked) {
        // ONE LINE ACROSS, not a column of seven.
        //
        // A HUD UNDER the board is as wide as the screen and one or two rows
        // tall, so a vertical list was the wrong shape for it -
        // and once the C64 board took the height it needed, only the first line
        // had anywhere to be: "size is good but... no hud?" showed a lone `P0`
        // where the score, level, time and chain should all have been
        // (2026-09-06).
        //
        // Ordered by what a player reads mid-game: the chain and the stop clock
        // first when they are live, because they decide the next swap, then the
        // running numbers.
        const parts = [
            values.chain > 1 ? `x${values.chain}` : '',
            values.stopped ? 'STOP' : '',
            values.movesLeft != null ? `M${values.movesLeft}` : '',
            values.canUndo ? 'X=UNDO' : '',
            `P${values.score}`,
            `L${values.speed}`,
            values.timeText,
        ].filter(Boolean);
        // Drop whole fields from the RIGHT until the line fits, rather than
        // slicing a number in half - `P123` cut to `P12` is a lie, a missing
        // field is only missing.
        while (parts.length > 1 && parts.join(' ').length > width)
            parts.pop();
        return [clip(parts.join(' '))];
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