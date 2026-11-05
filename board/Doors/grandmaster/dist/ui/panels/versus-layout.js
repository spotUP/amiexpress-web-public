"use strict";
/**
 * Two boards side by side, with the HUD between them.
 *
 * This is the layout the SNES uses and the one its VS. CPU MODE sprite sheet is
 * drawn for: your board on the left, a narrow column of POINT / LEVEL / TIME in
 * the middle, the opponent on the right.
 *
 * IT FITS FORTY COLUMNS, which is the surprising part and the reason this door
 * can offer versus play on a C64 at all. Two 12-character boards and a
 * 10-character centre is 34, inside 40 with room to spare. No other door on
 * this board could show two live playfields at that width; a panel game can
 * only because a panel is two characters.
 *
 * An opponent WITHOUT a board - Challenge Mode's health model - takes the same
 * slot and draws a danger bar in it instead, so the two modes share one layout.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CENTRE_WIDE = void 0;
exports.versusScale = versusScale;
exports.versusLayout = versusLayout;
exports.versusCentreLines = versusCentreLines;
exports.dangerBarRows = dangerBarRows;
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
/** Characters the centre column needs when it can spell things out. */
exports.CENTRE_WIDE = 14;
/** And when it cannot. */
const CENTRE_COMPACT = 8;
/**
 * How big a tile the two boards and the centre column can afford.
 *
 * The versus view never scaled at all: at forty columns it drew two 6-column
 * boards and an 8-column strip of initials, using half the screen and leaving
 * the rest black - "this is also weirdly minumal why????? rework all views
 * give them proper huds again" (2026-09-06). Same arithmetic as the solo
 * board: fit what the room allows, and keep the tile square on the glass -
 * a PETSCII cell is square, so x may not exceed y there.
 */
function versusScale(screenWidth, screenHeight, boardCols, boardRows, cellAspect, centreWidth) {
    const usableCols = Math.max(1, screenWidth - centreWidth);
    const fitX = Math.max(1, Math.min(MAX_SCALE, Math.floor(usableCols / (boardCols * 2))));
    const fitY = Math.max(1, Math.min(MAX_SCALE, Math.floor(screenHeight / boardRows)));
    // UNIFORM, like the solo board with its HUD beside it: two boards share the
    // width and neither may grow into the other's, so the scale is the smaller
    // of the two fits and the tile keeps the shape it was drawn. Scaling the
    // axes apart is what turned an 80-column board into 4x1 dashes the first
    // time this was written.
    const uniform = Math.min(fitX, fitY);
    const widestForShape = Math.max(1, Math.floor((MAX_TILE_ASPECT * uniform) / (2 * cellAspect)));
    return { x: Math.min(uniform, widestForShape), y: uniform };
}
/** Beyond this a bigger tile stops helping. */
const MAX_SCALE = 4;
/** The widest a tile may LOOK, however much room there is. */
const MAX_TILE_ASPECT = 2;
function versusLayout(screenWidth, screenHeight, boardCols, boardRows) {
    const compact = (0, blessed_1.isCompactWidth)(screenWidth);
    // The centre column spells things out wherever the two boards leave room
    // for it to. Only a screen that cannot fit both boards AND fourteen columns
    // falls back to initials.
    const centreWidth = boardCols * 2 + exports.CENTRE_WIDE <= screenWidth
        ? exports.CENTRE_WIDE
        : CENTRE_COMPACT;
    const total = boardCols * 2 + centreWidth;
    const cramped = total > screenWidth;
    const left = Math.max(0, Math.floor((screenWidth - total) / 2));
    const top = Math.max(0, Math.floor((screenHeight - boardRows) / 2));
    return {
        compact,
        effects: (0, blessed_1.effectsAllowed)(screenWidth),
        cramped,
        /** True when the centre column has room for labels rather than initials. */
        spelledOut: centreWidth >= exports.CENTRE_WIDE,
        player: { top, left, width: boardCols, height: boardRows },
        centre: { top, left: left + boardCols, width: centreWidth, height: boardRows },
        opponent: {
            top, left: left + boardCols + centreWidth, width: boardCols, height: boardRows,
        },
    };
}
/**
 * The centre column.
 *
 * At forty columns the labels go and the numbers stay - the same trade the solo
 * HUD makes, and for the same reason: mid-match you read the numbers.
 */
function versusCentreLines(layout, values) {
    const width = layout.centre.width;
    // Clip the VISIBLE text and colour it afterwards. Clipping a tagged string
    // cuts through the tag itself - a 14-column slice of "{yellow-fg}POINT..."
    // is "{yellow-fg}POI", which paints nothing and leaves the tag open for the
    // rest of the screen.
    const clip = (text) => (text.length > width ? text.slice(0, width) : text);
    const tag = (colour, text) => `{${colour}-fg}${clip(text)}{/${colour}-fg}`;
    if (!layout.spelledOut) {
        return [
            clip(`P${values.score}`),
            clip(`L${values.speed}`),
            clip(values.timeText),
            values.chain > 1 ? clip(`x${values.chain}`) : '',
            values.stopped ? clip('STOP') : '',
            values.incoming > 0 ? clip(`!${values.incoming}`) : '',
        ];
    }
    return [
        tag('yellow', 'POINT'),
        clip(` ${String(values.score).padStart(5, ' ')}`),
        '',
        tag('yellow', 'LEVEL'),
        clip(` ${String(values.speed).padStart(5, ' ')}`),
        '',
        tag('yellow', 'TIME'),
        clip(` ${values.timeText.padStart(5, ' ')}`),
        '',
        values.chain > 1 ? tag('lightmagenta', `x${values.chain} CHAIN`) : '',
        values.stopped ? tag('lightcyan', 'STOP') : '',
        values.incoming > 0 ? tag('lightred', `INCOMING ${values.incoming}`) : '',
    ];
}
/**
 * A boardless opponent's danger bar, drawn bottom-up in its board slot.
 *
 * Challenge Mode's opponent has no panels to show - it is one number - so this
 * is genuinely all there is to draw, exactly as panel-attack draws it.
 */
function dangerBarRows(layout, topOutPercentage) {
    const { width, height } = layout.opponent;
    const filled = Math.max(0, Math.min(height, Math.round(topOutPercentage * height)));
    const rows = [];
    for (let row = 0; row < height; row++) {
        // Row 0 is the top of the box, so the bar grows upward from the bottom.
        const isFilled = row >= height - filled;
        rows.push(isFilled
            ? `{red-fg}${'█'.repeat(width)}{/red-fg}`
            : ' '.repeat(width));
    }
    return rows;
}
//# sourceMappingURL=versus-layout.js.map