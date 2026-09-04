"use strict";
/**
 * The panel board as cells: pure in (stack, sheet, tick).
 *
 * The same shape Pengo's and Frogger's renderers take, for the same reason:
 * what a thing looks like is decided by which sprite was blitted, so the class
 * of bug where a panel is coloured by whatever glyph happened to match cannot
 * happen here.
 *
 * TWO COORDINATE SYSTEMS MEET IN THIS FILE, and getting them confused is the
 * one real hazard. The engine numbers rows from the BOTTOM - row 1 is the
 * lowest row in play, row 0 is the dimmed row still below the floor. A cell
 * buffer numbers rows from the TOP, because that is the order they are painted
 * in. `bufferRowFor` is the only place that conversion is allowed to happen.
 *
 * The dimmed row is drawn, one row below the playfield, because it is a real
 * part of the game: it is what you are reading when you decide whether to raise.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PANEL_COLS = void 0;
exports.bufferRowFor = bufferRowFor;
exports.boardSize = boardSize;
exports.animationFor = animationFor;
exports.buildBoard = buildBoard;
exports.drawCursor = drawCursor;
const cell_art_1 = require("@amiexpress/bbs-door-sdk/engines/graphics/cell-art");
/** Characters per panel. Fixed by the sprite sheets. */
exports.PANEL_COLS = 2;
/**
 * Sprite name by engine colour index. Colour 0 is empty and 9 is garbage;
 * neither is drawn from this table.
 */
const SPRITE_BY_COLOR = {
    1: 'heart',
    2: 'circle',
    3: 'triangle',
    4: 'star',
    5: 'diamond',
    6: 'inverse',
    7: 'square',
    8: 'shock',
};
/** The two rows near the top that pulse to warn the player. */
const DANGER_ROWS = 2;
/** Buffer row for an engine row. Engine counts up from the floor; buffers down. */
function bufferRowFor(stack, row) {
    return stack.height - row;
}
/** Board size in characters, including the dimmed row when it is shown. */
function boardSize(stack, options = {}) {
    const showIncoming = options.showIncomingRow !== false;
    return {
        cols: stack.width * exports.PANEL_COLS,
        rows: stack.height + (showIncoming ? 1 : 0),
    };
}
/**
 * Which animation a panel should be drawn in.
 *
 * Mostly the panel's own state name, because the sheets are keyed by it. The
 * two that need deciding:
 *
 *  - `matched` covers both the flash and the face that follows it. The timer
 *    counts down through FLASH then FACE, so which half we are in is a
 *    comparison against FACE rather than a separate state.
 *  - a settled panel near the top draws itself as `danger`, which is a display
 *    concern the engine has no opinion about.
 */
function animationFor(panel, stack) {
    switch (panel.state) {
        case 'matched':
            return panel.timer > panel.frameTimes.FACE ? 'flash' : 'face';
        case 'popping':
            return 'popping';
        // A popped panel is gone; the cell it left is empty until something falls.
        case 'popped':
        case 'dead':
            return null;
        case 'dimmed':
            return 'dimmed';
        case 'swapping':
            return 'swapping';
        case 'falling':
            return 'falling';
        case 'hovering':
            return 'hovering';
        case 'landing':
            return 'landing';
        case 'normal':
        default:
            return panel.row > stack.height - DANGER_ROWS ? 'danger' : 'normal';
    }
}
/** The sprite for a panel, or null if there is nothing to draw. */
function spriteFor(panel, sheet, variant) {
    if (panel.color === 0)
        return null;
    // Garbage is not a per-cell sprite: a block is drawn as one piece, because
    // that is what it is - panels of one block share a garbageId and an extent.
    if (panel.isGarbage || panel.color === 9)
        return null;
    const base = SPRITE_BY_COLOR[panel.color];
    if (!base)
        return null;
    const name = variant === 'c64' ? `panel-${base}-c64` : `panel-${base}`;
    return sheet[name] ?? null;
}
/**
 * The board, drawn.
 *
 * `tick` is the game's own frame counter, never wall clock - frameAt is a pure
 * function of it, so the same frame always draws the same thing and a test can
 * assert on it.
 */
function buildBoard(stack, sheet, tick, options = {}) {
    const variant = options.variant ?? 'wide';
    const showIncoming = options.showIncomingRow !== false;
    const { cols, rows } = boardSize(stack, options);
    const board = (0, cell_art_1.createBuffer)(cols, rows);
    const lowestRow = showIncoming ? 0 : 1;
    for (let row = lowestRow; row <= stack.height; row++) {
        const rowPanels = stack.panels[row];
        if (!rowPanels)
            continue;
        for (let col = 1; col <= stack.width; col++) {
            const panel = rowPanels[col];
            if (!panel)
                continue;
            const sprite = spriteFor(panel, sheet, variant);
            if (!sprite)
                continue;
            // Row 0 always draws dimmed, whatever state it claims: it is below the
            // floor and not in play, and the engine leaves its state alone.
            const animation = row === 0 ? 'dimmed' : animationFor(panel, stack);
            if (!animation || !sprite.animations[animation])
                continue;
            (0, cell_art_1.blitSprite)(board, sprite, animation, tick, col - 1, bufferRowFor(stack, row));
        }
    }
    if (options.showCursor !== false)
        drawCursor(board, stack);
    return board;
}
/**
 * The cursor, drawn over the two panels it holds.
 *
 * Brackets on the outer edges rather than a filled box: the panels underneath
 * have to stay readable, since choosing a swap means reading what is under the
 * cursor. Each cell keeps its own colours; only the glyph changes.
 */
function drawCursor(board, stack) {
    const y = bufferRowFor(stack, stack.curRow);
    if (y < 0 || y >= board.length)
        return;
    const left = (stack.curCol - 1) * exports.PANEL_COLS;
    const right = left + exports.PANEL_COLS * 2 - 1;
    markCursorCell(board, y, left, '[');
    markCursorCell(board, y, right, ']');
}
function markCursorCell(board, y, x, char) {
    const row = board[y];
    if (!row || x < 0 || x >= row.length)
        return;
    const existing = row[x];
    row[x] = existing
        ? { char, fg: existing.fg, bg: existing.bg }
        // Over an empty cell there is nothing to preserve, so pick a readable pair.
        : { char, fg: 15, bg: 0 };
}
//# sourceMappingURL=board-view.js.map