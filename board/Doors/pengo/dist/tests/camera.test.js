"use strict";
/**
 * The camera that scrolls the 15x17 world through the 11-row window the
 * terminal can show.
 *
 * `buildBoard` used to return the world buffer directly - grid coordinates
 * and board coordinates were the same thing, because the world always fit
 * the screen. Once the world (15 rows) outgrew the view (11 rows) that
 * stopped being true: a grid cell's row in the returned buffer depends on
 * where the camera is currently looking, and something below the window
 * has to say so in the HUD rather than vanish. This is what pins both.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.theCameraCentresOnPengoAndClampsToTheMaze = theCameraCentresOnPengoAndClampsToTheMaze;
exports.theCameraDoesNotScrollHorizontally = theCameraDoesNotScrollHorizontally;
exports.theWorldScrollsIntoAndOutOfView = theWorldScrollsIntoAndOutOfView;
exports.anEnemyBelowTheWindowIsReportedOffscreen = anEnemyBelowTheWindowIsReportedOffscreen;
exports.anEnemyInsideTheWindowIsNotReportedOffscreen = anEnemyInsideTheWindowIsNotReportedOffscreen;
exports.aDeadEnemyIsNeverReportedOffscreen = aDeadEnemyIsNeverReportedOffscreen;
const assert_1 = __importDefault(require("assert"));
const path_1 = require("path");
const cell_art_1 = require("@amiexpress/bbs-door-sdk/engines/graphics/cell-art");
const render_1 = require("../game/render");
const camera_1 = require("../game/camera");
const initial_data_1 = require("../game/initial-data");
const pengo_game_1 = require("../game/pengo-game");
const constants_1 = require("../game/constants");
const sheet = (0, cell_art_1.loadSpriteSheet)((0, path_1.join)(__dirname, '..', 'sprites'));
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
        x: 6, y: 4, direction: 'right',
        isPushing: false, pushFrame: 0, isDead: false, deathFrame: 0,
    };
    return { game, data };
}
/** Whether the cell at a grid position drew any ink in a (possibly
 *  cropped) board buffer, given the window that buffer was cropped to. */
function isDrawnInView(board, windowCellY, gridX, gridY) {
    const localY = gridY - windowCellY;
    if (localY < 0 || localY >= constants_1.VIEW_GRID_ROWS)
        return false;
    for (let r = 0; r < constants_1.CELL_H; r++) {
        for (let c = 0; c < constants_1.CELL_W; c++) {
            const cell = board[localY * constants_1.CELL_H + r]?.[gridX * constants_1.CELL_W + c];
            if (cell && cell.char !== ' ')
                return true;
        }
    }
    return false;
}
/** cameraWindowCells centres on Pengo, clamped so it never runs off the maze. */
async function theCameraCentresOnPengoAndClampsToTheMaze() {
    const top = (0, camera_1.cameraWindowCells)(0);
    assert_1.default.strictEqual(top.y, 0, 'clamped at the top of the maze');
    const bottom = (0, camera_1.cameraWindowCells)(constants_1.GRID_HEIGHT - 1);
    assert_1.default.strictEqual(bottom.y, constants_1.GRID_HEIGHT - constants_1.VIEW_GRID_ROWS, 'clamped at the bottom of the maze');
    assert_1.default.strictEqual(bottom.y + bottom.height, constants_1.GRID_HEIGHT, 'the last row of the maze is reachable');
    const middle = (0, camera_1.cameraWindowCells)(7);
    assert_1.default.ok(middle.y > 0 && middle.y < bottom.y, 'a middling focus scrolls, rather than clamping');
}
/** The camera never scrolls horizontally - the world is exactly as wide as the view. */
async function theCameraDoesNotScrollHorizontally() {
    const window = (0, camera_1.cameraWindowCells)(7);
    assert_1.default.strictEqual(window.x, 0);
    assert_1.default.strictEqual(window.width, constants_1.GRID_WIDTH);
}
/**
 * A diamond near the bottom of the maze is invisible while Pengo (and so
 * the camera) is near the top, and visible once the camera scrolls down
 * to it - proof buildBoard actually crops, not just resizes the buffer.
 */
async function theWorldScrollsIntoAndOutOfView() {
    const { data } = emptyBoard();
    const farRow = constants_1.GRID_HEIGHT - 2; // deep in the maze, off the top-anchored window
    data.grid[farRow][6] = 'diamond';
    data.pengo.y = 1; // camera clamps to the top; farRow is below the window
    const nearTop = (0, render_1.buildBoard)(data, sheet, 0);
    assert_1.default.strictEqual(isDrawnInView(nearTop, (0, camera_1.cameraWindowCells)(data.pengo.y).y, 6, farRow), false, 'a cell below the camera window must not be drawn');
    data.pengo.y = farRow; // camera follows Pengo down to it
    const scrolled = (0, render_1.buildBoard)(data, sheet, 0);
    assert_1.default.strictEqual(isDrawnInView(scrolled, (0, camera_1.cameraWindowCells)(data.pengo.y).y, 6, farRow), true, 'the same cell must be drawn once the camera has scrolled to cover it');
}
/** An enemy outside the camera window is reported, with which way it lies. */
async function anEnemyBelowTheWindowIsReportedOffscreen() {
    const { data } = emptyBoard();
    data.pengo.y = 1; // window clamped to the top: rows 0..(VIEW_GRID_ROWS-1)
    data.enemies = [{
            id: 1, x: 6, y: constants_1.GRID_HEIGHT - 2, direction: 'up', state: 'walking',
            stunTimer: 0, crushTimer: 0, hatchTimer: 0, moveTimer: 0,
        }];
    const markers = (0, camera_1.offscreenEnemyMarkers)(data);
    assert_1.default.strictEqual(markers.length, 1);
    assert_1.default.strictEqual(markers[0].direction, 's');
    assert_1.default.strictEqual(markers[0].item, data.enemies[0], 'hands back the real enemy, for the HUD to describe');
}
/** The same enemy stops being offscreen once the camera has scrolled to it. */
async function anEnemyInsideTheWindowIsNotReportedOffscreen() {
    const { data } = emptyBoard();
    const enemyY = constants_1.GRID_HEIGHT - 2;
    data.enemies = [{
            id: 1, x: 6, y: enemyY, direction: 'up', state: 'walking',
            stunTimer: 0, crushTimer: 0, hatchTimer: 0, moveTimer: 0,
        }];
    data.pengo.y = enemyY; // camera follows Pengo to the enemy's row
    assert_1.default.deepStrictEqual((0, camera_1.offscreenEnemyMarkers)(data), []);
}
/** A dead Sno-Bee is not something to warn about - it cannot reach anyone. */
async function aDeadEnemyIsNeverReportedOffscreen() {
    const { data } = emptyBoard();
    data.pengo.y = 1;
    data.enemies = [{
            id: 1, x: 6, y: constants_1.GRID_HEIGHT - 2, direction: 'up', state: 'dead',
            stunTimer: 0, crushTimer: 0, hatchTimer: 0, moveTimer: 0,
        }];
    assert_1.default.deepStrictEqual((0, camera_1.offscreenEnemyMarkers)(data), []);
}
//# sourceMappingURL=camera.test.js.map