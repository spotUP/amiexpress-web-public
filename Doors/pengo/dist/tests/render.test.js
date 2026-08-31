"use strict";
/**
 * The sprite renderer.
 *
 * buildBoard is pure in (data, sheet, tick), so everything the player sees
 * is assertable: where the penguin is drawn, that a stunned Sno-Bee looks
 * stunned, that death animates and then holds. The four glyph-collision
 * bugs of 2026-08-31 (galaga's '.', donkey-kong's 'H', zoo-keeper's '@',
 * joust's '{') were all "the buffer cannot say what this is" bugs; a Cell
 * carries its own colours, so none of them can come back.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.theBoardIsExactlyTheScreenItClaims = theBoardIsExactlyTheScreenItClaims;
exports.thePenguinIsDrawnWhereItStands = thePenguinIsDrawnWhereItStands;
exports.facingIsVisible = facingIsVisible;
exports.walkingAnimates = walkingAnimates;
exports.aStunnedSnoBeeLooksStunned = aStunnedSnoBeeLooksStunned;
exports.deathAnimatesAndThenHolds = deathAnimatesAndThenHolds;
exports.aFreshSlidePlaysTheSlideFlash = aFreshSlidePlaysTheSlideFlash;
exports.renderEmitsTagsNotGlyphPairs = renderEmitsTagsNotGlyphPairs;
const assert_1 = __importDefault(require("assert"));
const path_1 = require("path");
const cell_art_1 = require("@amiexpress/bbs-door-sdk/engines/graphics/cell-art");
const render_1 = require("../game/render");
const initial_data_1 = require("../game/initial-data");
const pengo_game_1 = require("../game/pengo-game");
const constants_1 = require("../game/constants");
const sheet = (0, cell_art_1.loadSpriteSheet)((0, path_1.join)(__dirname, '..', 'sprites'));
/** A board the test controls completely (same shape as the sfx suite's). */
function emptyBoard() {
    const data = (0, initial_data_1.createInitialGameData)();
    const game = new pengo_game_1.PengoGame(data, () => { }, sheet);
    game.initLevel();
    for (let y = 0; y < constants_1.GRID_HEIGHT; y++) {
        for (let x = 0; x < constants_1.GRID_WIDTH; x++) {
            const edge = x === 0 || x === constants_1.GRID_WIDTH - 1 || y === 0 || y === constants_1.GRID_HEIGHT - 1;
            data.grid[y][x] = edge ? 'wall' : 'empty';
        }
    }
    data.enemies = [];
    data.eggs = [];
    data.state = 'playing';
    data.pengo = {
        x: 4, y: 4, direction: 'right',
        isPushing: false, pushFrame: 0, isDead: false, deathFrame: 0,
    };
    return { game, data };
}
/** The characters drawn inside one grid cell, as a string. */
function cellChars(board, gridX, gridY) {
    let out = '';
    for (let r = 0; r < constants_1.CELL_H; r++) {
        for (let c = 0; c < constants_1.CELL_W; c++) {
            const cell = board[gridY * constants_1.CELL_H + r][gridX * constants_1.CELL_W + c];
            out += cell ? cell.char : ' ';
        }
    }
    return out;
}
async function theBoardIsExactlyTheScreenItClaims() {
    const { data } = emptyBoard();
    const board = (0, render_1.buildBoard)(data, sheet, 0);
    assert_1.default.strictEqual(board.length, constants_1.BOARD_ROWS);
    assert_1.default.strictEqual(board[0].length, constants_1.BOARD_COLS);
}
async function thePenguinIsDrawnWhereItStands() {
    const { data } = emptyBoard();
    const board = (0, render_1.buildBoard)(data, sheet, 0);
    assert_1.default.ok(cellChars(board, 4, 4).trim().length > 0, 'the penguin cell has ink');
    assert_1.default.ok(cellChars(board, 5, 5).trim().length === 0, 'an empty floor cell has none');
}
async function facingIsVisible() {
    const { data } = emptyBoard();
    data.pengo.direction = 'right';
    const right = cellChars((0, render_1.buildBoard)(data, sheet, 0), 4, 4);
    data.pengo.direction = 'left';
    const left = cellChars((0, render_1.buildBoard)(data, sheet, 0), 4, 4);
    assert_1.default.notStrictEqual(right, left, 'facing must be visible in the sprite');
}
async function walkingAnimates() {
    const { data } = emptyBoard();
    const t0 = cellChars((0, render_1.buildBoard)(data, sheet, 0), 4, 4);
    const t3 = cellChars((0, render_1.buildBoard)(data, sheet, 3), 4, 4);
    assert_1.default.notStrictEqual(t0, t3, 'the walk cycle must move between ticks');
}
async function aStunnedSnoBeeLooksStunned() {
    const { data } = emptyBoard();
    data.enemies = [{
            id: 1, x: 6, y: 6, direction: 'left', state: 'walking',
            stunTimer: 0, hatchTimer: 0, moveTimer: 0,
        }];
    const walking = (0, render_1.buildBoard)(data, sheet, 0);
    data.enemies[0].state = 'stunned';
    const stunned = (0, render_1.buildBoard)(data, sheet, 0);
    const cellOf = (b) => {
        const cell = b[6 * constants_1.CELL_H][6 * constants_1.CELL_W + 1];
        return cell ? cell.fg : -1;
    };
    assert_1.default.notStrictEqual(cellOf(walking), cellOf(stunned), 'a stunned Sno-Bee must not be drawn in the threat colour');
}
async function deathAnimatesAndThenHolds() {
    const { data } = emptyBoard();
    data.pengo.isDead = true;
    data.pengo.deathFrame = 0;
    const start = cellChars((0, render_1.buildBoard)(data, sheet, 0), 4, 4);
    data.pengo.deathFrame = 18;
    const late = cellChars((0, render_1.buildBoard)(data, sheet, 0), 4, 4);
    data.pengo.deathFrame = 40;
    const held = cellChars((0, render_1.buildBoard)(data, sheet, 0), 4, 4);
    assert_1.default.notStrictEqual(start, late, 'death is an animation, not a pose');
    assert_1.default.strictEqual(late, held, 'and it holds the last frame');
}
async function aFreshSlidePlaysTheSlideFlash() {
    const { data } = emptyBoard();
    data.grid[3][7] = 'ice';
    const calm = cellChars((0, render_1.buildBoard)(data, sheet, 100), 7, 3);
    data.lastSlide = { x: 7, y: 3, tick: 100 };
    const flash = cellChars((0, render_1.buildBoard)(data, sheet, 102), 7, 3);
    const after = cellChars((0, render_1.buildBoard)(data, sheet, 160), 7, 3);
    assert_1.default.notStrictEqual(calm, flash, 'a just-pushed block flashes');
    assert_1.default.strictEqual(after, calm, 'and calms back down');
}
async function renderEmitsTagsNotGlyphPairs() {
    const { game } = emptyBoard();
    let content = '';
    const g = new pengo_game_1.PengoGame(game.data, (c) => { content = c; }, sheet);
    g.render();
    const rows = content.split('\n');
    assert_1.default.strictEqual(rows.length, constants_1.BOARD_ROWS, 'render emits exactly the board');
    assert_1.default.ok(rows[0].includes('-fg}'), 'rows are tagged');
}
//# sourceMappingURL=render.test.js.map