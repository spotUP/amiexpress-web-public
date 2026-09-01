"use strict";
/**
 * The sixteen transcribed arcade mazes.
 *
 * Verifies the transcription against the fetched source counts (see
 * `levels/original-levels.ts`'s provenance note for exactly which cells
 * differ and why), that every level is the right shape, that nobody's
 * start cell is walled in, and that PengoGame actually uses this data for
 * levels 1-16 and falls back to the procedural generator past it.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.thereAreSixteenOriginalLevels = thereAreSixteenOriginalLevels;
exports.everyLevelIsThirteenByFifteen = everyLevelIsThirteenByFifteen;
exports.theBorderIsAlwaysWall = theBorderIsAlwaysWall;
exports.everyLevelKeepsAllThreeDiamonds = everyLevelKeepsAllThreeDiamonds;
exports.eggCountsMatchTheSourceWithinTheBorderOverride = eggCountsMatchTheSourceWithinTheBorderOverride;
exports.blockCountsNeverExceedTheSource = blockCountsNeverExceedTheSource;
exports.everyLevelHasAnOpenInteriorCell = everyLevelHasAnOpenInteriorCell;
exports.pengoGameUsesTheOriginalLevelsForOneThroughSixteen = pengoGameUsesTheOriginalLevelsForOneThroughSixteen;
exports.pengoGameFallsBackToTheProceduralGeneratorPastSixteen = pengoGameFallsBackToTheProceduralGeneratorPastSixteen;
const assert_1 = __importDefault(require("assert"));
const levels_1 = require("../levels");
const initial_data_1 = require("../game/initial-data");
const pengo_game_1 = require("../game/pengo-game");
const constants_1 = require("../game/constants");
const cell_art_1 = require("@amiexpress/bbs-door-sdk/engines/graphics/cell-art");
const path_1 = require("path");
const sheet = (0, cell_art_1.loadSpriteSheet)((0, path_1.join)(__dirname, '..', 'sprites'));
/** Source counts fetched 2026-09-01 from cpp-pengo's Game/Data/Levels/N.json
 *  (blocks/diamond/unhatched array lengths - includes cells that land on
 *  our own wall border, which the loader then treats as wall regardless). */
const SOURCE_COUNTS = [
    { blocks: 84, diamonds: 3, eggs: 6 },
    { blocks: 84, diamonds: 3, eggs: 6 },
    { blocks: 84, diamonds: 3, eggs: 6 },
    { blocks: 82, diamonds: 3, eggs: 6 },
    { blocks: 84, diamonds: 3, eggs: 6 },
    { blocks: 74, diamonds: 3, eggs: 4 },
    { blocks: 84, diamonds: 3, eggs: 6 },
    { blocks: 84, diamonds: 3, eggs: 6 },
    { blocks: 84, diamonds: 3, eggs: 6 },
    { blocks: 82, diamonds: 3, eggs: 6 },
    { blocks: 84, diamonds: 3, eggs: 6 },
    { blocks: 74, diamonds: 3, eggs: 4 },
    { blocks: 84, diamonds: 3, eggs: 6 },
    { blocks: 82, diamonds: 3, eggs: 6 },
    { blocks: 84, diamonds: 3, eggs: 6 },
    { blocks: 74, diamonds: 3, eggs: 4 },
];
async function thereAreSixteenOriginalLevels() {
    assert_1.default.strictEqual((0, levels_1.originalLevelCount)(), 16);
    assert_1.default.strictEqual((0, levels_1.loadOriginalLevel)(17), null, 'no 17th original to load');
    assert_1.default.strictEqual((0, levels_1.loadOriginalLevel)(0), null);
}
/** Every transcribed level is exactly the door's own 13x15 world grid. */
async function everyLevelIsThirteenByFifteen() {
    for (let n = 1; n <= 16; n++) {
        const level = (0, levels_1.loadOriginalLevel)(n);
        assert_1.default.strictEqual(level.grid.length, constants_1.GRID_HEIGHT, `level ${n} row count`);
        for (const row of level.grid) {
            assert_1.default.strictEqual(row.length, constants_1.GRID_WIDTH, `level ${n} column count`);
        }
    }
}
/** The border ring is always wall, whatever the source transcription says there. */
async function theBorderIsAlwaysWall() {
    for (let n = 1; n <= 16; n++) {
        const { grid } = (0, levels_1.loadOriginalLevel)(n);
        for (let x = 0; x < constants_1.GRID_WIDTH; x++) {
            assert_1.default.strictEqual(grid[0][x], 'wall', `level ${n} top row`);
            assert_1.default.strictEqual(grid[constants_1.GRID_HEIGHT - 1][x], 'wall', `level ${n} bottom row`);
        }
        for (let y = 0; y < constants_1.GRID_HEIGHT; y++) {
            assert_1.default.strictEqual(grid[y][0], 'wall', `level ${n} left column`);
            assert_1.default.strictEqual(grid[y][constants_1.GRID_WIDTH - 1], 'wall', `level ${n} right column`);
        }
    }
}
/**
 * No level ever loses a diamond to the wall-border override - 0 of the
 * source's diamond cells land on our border in any of the 16 levels
 * (verified against the fetched JSON). This is the invariant the crush/
 * alignment scoring depends on: exactly 3 diamonds, always in play.
 */
async function everyLevelKeepsAllThreeDiamonds() {
    for (let n = 1; n <= 16; n++) {
        const { grid } = (0, levels_1.loadOriginalLevel)(n);
        let diamonds = 0;
        for (const row of grid)
            for (const cell of row)
                if (cell === 'diamond')
                    diamonds++;
        assert_1.default.strictEqual(diamonds, SOURCE_COUNTS[n - 1].diamonds, `level ${n} diamond count`);
    }
}
/**
 * Egg-spawn counts match the source to within the (at most one) egg that
 * lands on our wall border and is dropped - never more than one, and
 * never for a level whose source had none there.
 */
async function eggCountsMatchTheSourceWithinTheBorderOverride() {
    for (let n = 1; n <= 16; n++) {
        const level = (0, levels_1.loadOriginalLevel)(n);
        const expected = SOURCE_COUNTS[n - 1].eggs;
        const diff = expected - level.eggSpawns.length;
        assert_1.default.ok(diff >= 0 && diff <= 1, `level ${n}: source had ${expected} eggs, transcription kept ${level.eggSpawns.length}`);
    }
}
/** Ice + diamond block counts (post-border-override) never exceed the source's. */
async function blockCountsNeverExceedTheSource() {
    for (let n = 1; n <= 16; n++) {
        const { grid } = (0, levels_1.loadOriginalLevel)(n);
        let blocks = 0;
        for (const row of grid)
            for (const cell of row)
                if (cell === 'ice' || cell === 'diamond')
                    blocks++;
        assert_1.default.ok(blocks <= SOURCE_COUNTS[n - 1].blocks, `level ${n}: ${blocks} blocks exceeds source's ${SOURCE_COUNTS[n - 1].blocks}`);
        assert_1.default.ok(blocks > 0, `level ${n}: transcription lost every block`);
    }
}
/** Every level has room to stand: at least one interior cell is walkable floor. */
async function everyLevelHasAnOpenInteriorCell() {
    for (let n = 1; n <= 16; n++) {
        const { grid } = (0, levels_1.loadOriginalLevel)(n);
        let open = 0;
        for (let y = 1; y < constants_1.GRID_HEIGHT - 1; y++) {
            for (let x = 1; x < constants_1.GRID_WIDTH - 1; x++) {
                if (grid[y][x] === 'empty')
                    open++;
            }
        }
        assert_1.default.ok(open > 0, `level ${n}: no empty interior cell - Pengo could never spawn`);
    }
}
/** PengoGame actually loads the transcription for levels 1-16, not the random generator. */
async function pengoGameUsesTheOriginalLevelsForOneThroughSixteen() {
    const data = (0, initial_data_1.createInitialGameData)();
    const game = new pengo_game_1.PengoGame(data, () => { }, sheet);
    data.level = 3;
    game.initLevel();
    const expected = (0, levels_1.loadOriginalLevel)(3);
    assert_1.default.deepStrictEqual(data.grid, expected.grid, 'level 3 must be the authored maze, not a random one');
    let diamonds = 0;
    for (const row of data.grid)
        for (const cell of row)
            if (cell === 'diamond')
                diamonds++;
    assert_1.default.strictEqual(diamonds, 3);
}
/** Past level 16, PengoGame falls back to the procedural generator - never crashes, never repeats level 1. */
async function pengoGameFallsBackToTheProceduralGeneratorPastSixteen() {
    const data = (0, initial_data_1.createInitialGameData)();
    const game = new pengo_game_1.PengoGame(data, () => { }, sheet);
    data.level = 17;
    game.initLevel();
    assert_1.default.strictEqual(data.grid.length, constants_1.GRID_HEIGHT);
    assert_1.default.notDeepStrictEqual(data.grid, (0, levels_1.loadOriginalLevel)(1).grid, 'level 17 must not silently be level 1 again');
}
//# sourceMappingURL=levels.test.js.map