"use strict";
/**
 * The Stage 3 mechanics rulings from the arcade-mechanics gap audit
 * (thoughts/shared/research/2026-09-01_pengo-arcade-mechanics-gap.md):
 * the diamond re-scoring bug, the score cap, chain-kill crushes, the
 * boxed-in-block destroy, touch-killing a stunned Sno-Bee, and the
 * concurrent-enemy population cap. The Gaussian AI targeting has its own
 * suite (ai.test.ts) since the interesting part of it is a pure function.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.theDiamondBonusIsAwardedExactlyOnce = theDiamondBonusIsAwardedExactlyOnce;
exports.alignedDiamondsAreLockedInPlace = alignedDiamondsAreLockedInPlace;
exports.theScoreNeverExceedsTheArcadesFiveDigitDisplay = theScoreNeverExceedsTheArcadesFiveDigitDisplay;
exports.aPushChainKillsEveryEnemyInItsPath = aPushChainKillsEveryEnemyInItsPath;
exports.pushingABlockWithNoRoomDestroysIt = pushingABlockWithNoRoomDestroysIt;
exports.aBlockThatCanMoveIsNotDestroyed = aBlockThatCanMoveIsNotDestroyed;
exports.walkingIntoAStunnedSnoBeeKillsIt = walkingIntoAStunnedSnoBeeKillsIt;
exports.walkingIntoAWalkingSnoBeeStillKillsPengo = walkingIntoAWalkingSnoBeeStillKillsPengo;
exports.readyEggsHoldWhileTheEnemyPopulationIsAtCap = readyEggsHoldWhileTheEnemyPopulationIsAtCap;
exports.aHeldEggHatchesOnceRoomOpensUp = aHeldEggHatchesOnceRoomOpensUp;
exports.anEnemyBlockedByIceSometimesBreaksIt = anEnemyBlockedByIceSometimesBreaksIt;
exports.anEnemyBlockedByIceSometimesDoesNotBreakIt = anEnemyBlockedByIceSometimesDoesNotBreakIt;
exports.aPushedBlockTravelsOverSeveralFrames = aPushedBlockTravelsOverSeveralFrames;
exports.aBlockInFlightIsNotLostFromTheBoard = aBlockInFlightIsNotLostFromTheBoard;
const assert_1 = __importDefault(require("assert"));
const path_1 = require("path");
const cell_art_1 = require("@amiexpress/bbs-door-sdk/engines/graphics/cell-art");
const initial_data_1 = require("../game/initial-data");
const render_1 = require("../game/render");
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
    game.cues.clear();
    return { game, data };
}
/**
 * Push, then let the block finish travelling.
 *
 * A push no longer resolves inside the keypress - the block is an entity in
 * flight and moves a cell per SLIDE_TICKS_PER_CELL, which is what makes the
 * slide visible instead of a one-frame teleport. Tests that assert where a
 * block ENDED UP have to let it get there.
 */
function settlePush(game, data, maxTicks = 200) {
    game.handlePush();
    let ticks = 0;
    // Only the slide, not a whole game tick: update() also moves enemies and
    // runs the clock, and these tests are about what a PUSH does. Driving the
    // full loop let unrelated scoring leak into the assertions.
    while (data.slidingBlocks.length > 0 && ticks++ < maxTicks) {
        game.advanceSlidingBlocks();
    }
    if (data.slidingBlocks.length > 0) {
        throw new Error(`a pushed block never came to rest within ${maxTicks} ticks`);
    }
}
function enemyAt(x, y, state = 'walking') {
    return {
        id: Math.floor(Math.random() * 1e9), x, y, direction: 'left', state,
        stunTimer: 0, crushTimer: 0, hatchTimer: 0, moveTimer: 0,
    };
}
// ---------------------------------------------------------------------------
// Diamond alignment: score once, then lock.
// ---------------------------------------------------------------------------
/** The bug reported by the audit: the score re-added on every later push. */
async function theDiamondBonusIsAwardedExactlyOnce() {
    const { game, data } = emptyBoard();
    data.grid[3][4] = 'diamond';
    data.grid[3][6] = 'diamond';
    data.grid[4][5] = 'ice';
    settlePush(game, data);
    const afterFirstAlignment = data.score;
    assert_1.default.ok(afterFirstAlignment >= constants_1.SCORES.diamondAlign2, 'the bonus must have fired at all');
    // A second, unrelated push - the diamonds are already aligned and
    // untouched; only the ice-block push score should move. isPushing must
    // be cleared by hand (as the real game loop's animation timer would),
    // or handlePush()'s own re-entrancy guard silently no-ops the second call.
    data.pengo.isPushing = false;
    data.grid[4][5] = 'ice';
    settlePush(game, data);
    assert_1.default.strictEqual(data.score, afterFirstAlignment + constants_1.SCORES.pushBlock, 'the diamond bonus must not re-fire on a push that has nothing to do with it');
}
/** Once aligned, the diamonds themselves stop being pushable. */
async function alignedDiamondsAreLockedInPlace() {
    const { game, data } = emptyBoard();
    data.grid[3][4] = 'diamond';
    data.grid[3][6] = 'diamond';
    data.grid[4][5] = 'ice';
    settlePush(game, data);
    assert_1.default.strictEqual(data.grid[3][4], 'diamond', 'sanity: still there before the locked push');
    game.cues.clear();
    data.pengo.isPushing = false;
    // Face the aligned diamond and try to push it.
    data.pengo.x = 3;
    data.pengo.y = 3;
    data.pengo.direction = 'right';
    settlePush(game, data);
    assert_1.default.strictEqual(data.grid[3][4], 'diamond', 'a locked diamond must not move');
    assert_1.default.deepStrictEqual(game.cues.drain(), ['boop'], 'a locked diamond gives no push feedback, just a thud');
}
// ---------------------------------------------------------------------------
// Score cap.
// ---------------------------------------------------------------------------
async function theScoreNeverExceedsTheArcadesFiveDigitDisplay() {
    const { game, data } = emptyBoard();
    data.score = constants_1.MAX_SCORE - 5;
    data.timeRemaining = 999; // a large time bonus, to blow well past the cap
    game.update(); // 0 enemies, 0 eggs -> level complete, awards clearLevel + time bonus
    assert_1.default.strictEqual(data.score, constants_1.MAX_SCORE);
}
// ---------------------------------------------------------------------------
// Chain-kill crushes.
// ---------------------------------------------------------------------------
/** A single continuous push catches every enemy in its path, not just the first. */
async function aPushChainKillsEveryEnemyInItsPath() {
    const { game, data } = emptyBoard();
    data.grid[4][5] = 'ice';
    data.enemies = [enemyAt(6, 4), enemyAt(7, 4)];
    const before = data.score;
    settlePush(game, data);
    assert_1.default.strictEqual(data.enemies[0].state, 'crushed', 'the first enemy in the path is caught');
    assert_1.default.strictEqual(data.enemies[1].state, 'crushed', 'the second, further down the SAME push, must be too');
    assert_1.default.strictEqual(data.score, before + constants_1.SCORES.pushBlock + (0, constants_1.crushComboScore)(2), 'one combo for the whole chain (400+1600 style table), not two separate flat crushes');
    assert_1.default.deepStrictEqual(game.cues.drain(), ['dash', 'explosion'], 'one crush cue for the whole chain');
}
// ---------------------------------------------------------------------------
// Destroying a boxed-in block.
// ---------------------------------------------------------------------------
/** Pushing a block into a wall with no room to slide destroys it, rather than doing nothing. */
async function pushingABlockWithNoRoomDestroysIt() {
    const { game, data } = emptyBoard();
    data.grid[4][1] = 'ice'; // one cell in from the left wall
    data.pengo.x = 2;
    data.pengo.y = 4;
    data.pengo.direction = 'left';
    settlePush(game, data);
    assert_1.default.strictEqual(data.grid[4][1], 'empty', 'a block with nowhere to go must be destroyed, not left in place');
    assert_1.default.deepStrictEqual(game.cues.drain(), ['dash', 'switch']);
}
/** A block that CAN slide at least one cell is unaffected - only the boxed-in case destroys. */
async function aBlockThatCanMoveIsNotDestroyed() {
    const { game, data } = emptyBoard();
    data.grid[4][5] = 'ice';
    settlePush(game, data);
    let found = false;
    for (const row of data.grid)
        for (const cell of row)
            if (cell === 'ice')
                found = true;
    assert_1.default.ok(found, 'the block must still exist somewhere on the board');
}
// ---------------------------------------------------------------------------
// Touch-killing a stunned Sno-Bee.
// ---------------------------------------------------------------------------
async function walkingIntoAStunnedSnoBeeKillsIt() {
    const { game, data } = emptyBoard();
    data.enemies = [enemyAt(4, 4, 'stunned')];
    data.enemies[0].stunTimer = 30;
    const before = data.score;
    game.update();
    assert_1.default.strictEqual(data.enemies[0].state, 'crushed', 'touching a stunned Sno-Bee kills it');
    assert_1.default.strictEqual(data.score, before + constants_1.SCORES.touchKillStunned);
    assert_1.default.notStrictEqual(constants_1.SCORES.touchKillStunned, constants_1.SCORES.crushEnemy, 'a touch-kill must stay smaller than a real crush');
    assert_1.default.strictEqual(data.pengo.isDead, false, 'a stunned Sno-Bee cannot kill Pengo back');
}
/** A live (not stunned) Sno-Bee on the same cell still kills Pengo, unchanged. */
async function walkingIntoAWalkingSnoBeeStillKillsPengo() {
    const { game, data } = emptyBoard();
    data.enemies = [enemyAt(4, 4, 'walking')];
    game.update();
    assert_1.default.strictEqual(data.pengo.isDead, true);
}
// ---------------------------------------------------------------------------
// Population cap.
// ---------------------------------------------------------------------------
async function readyEggsHoldWhileTheEnemyPopulationIsAtCap() {
    const { game, data } = emptyBoard();
    data.enemies = [enemyAt(2, 2), enemyAt(2, 3), enemyAt(2, 5), enemyAt(2, 6)];
    assert_1.default.strictEqual(data.enemies.length, constants_1.MAX_LIVING_ENEMIES, 'test setup must actually sit at the cap');
    data.eggs = [{ x: 8, y: 8, hatchTimer: 1 }];
    game.update();
    assert_1.default.strictEqual(data.eggs.length, 1, 'no room: the ready egg must hold rather than hatch');
    assert_1.default.strictEqual(data.enemies.filter(e => e.state !== 'dead').length, constants_1.MAX_LIVING_ENEMIES);
}
async function aHeldEggHatchesOnceRoomOpensUp() {
    const { game, data } = emptyBoard();
    data.enemies = [enemyAt(2, 2), enemyAt(2, 3), enemyAt(2, 5), enemyAt(2, 6)];
    data.eggs = [{ x: 8, y: 8, hatchTimer: 1 }];
    game.update();
    assert_1.default.strictEqual(data.eggs.length, 1, 'sanity: held on the first tick');
    data.enemies[0].state = 'dead'; // makes room
    game.update();
    assert_1.default.strictEqual(data.eggs.length, 0, 'the held egg hatches once a Sno-Bee has died');
}
// ---------------------------------------------------------------------------
// Enemies breaking blocks in their path (ref2's coinflip).
//
// Both mocked deterministic - `enemy.targetX/Y` are set directly so the
// Gaussian target-pick is skipped this tick (the enemy hasn't "arrived"),
// leaving the coinflip as the only Math.random() call in play.
// ---------------------------------------------------------------------------
/** Runs `fn` with Math.random replaced, restoring it even if `fn` throws. */
async function withMockedRandom(value, fn) {
    const original = Math.random;
    Math.random = () => value;
    try {
        await fn();
    }
    finally {
        Math.random = original;
    }
}
async function anEnemyBlockedByIceSometimesBreaksIt() {
    const { game, data } = emptyBoard();
    data.grid[4][5] = 'ice'; // directly above the enemy's path
    data.enemies = [enemyAt(5, 5)];
    data.enemies[0].targetX = 5;
    data.enemies[0].targetY = 2; // due north - straight into the ice
    data.enemies[0].moveTimer = 9; // due to move this tick (level 1 speed is 10)
    await withMockedRandom(0, () => {
        game.update();
    });
    assert_1.default.strictEqual(data.grid[4][5], 'empty', 'the coinflip landing under the break chance must break the block');
    assert_1.default.strictEqual(data.enemies[0].y, 5, 'breaking the block takes the tick - the enemy does not also move through it');
}
async function anEnemyBlockedByIceSometimesDoesNotBreakIt() {
    const { game, data } = emptyBoard();
    data.grid[4][5] = 'ice';
    data.enemies = [enemyAt(5, 5)];
    data.enemies[0].targetX = 5;
    data.enemies[0].targetY = 2;
    data.enemies[0].moveTimer = 9;
    await withMockedRandom(0.99, () => {
        game.update();
    });
    assert_1.default.strictEqual(data.grid[4][5], 'ice', 'the coinflip landing above the break chance must leave the block standing');
}
// ---------------------------------------------------------------------------
// A push is a journey, not a teleport.
// ---------------------------------------------------------------------------
/**
 * A pushed block travels over several frames, and is visible the whole way.
 *
 * Reported in play as blocks disappearing when pushed, and diagnosed
 * exactly: "they move too fast making it a 1 frame animation". The whole
 * slide used to run inside the keypress, so the block left one cell and
 * arrived at the far wall in the same frame the player pressed the key.
 */
async function aPushedBlockTravelsOverSeveralFrames() {
    const { game, data } = emptyBoard();
    data.grid[4][5] = 'ice'; // a clear corridor to the right
    game.handlePush();
    assert_1.default.ok(data.slidingBlocks.length === 1, 'the push puts a block in flight rather than resolving on the spot');
    const block = data.slidingBlocks[0];
    const startX = block.x;
    const advance = () => game.advanceSlidingBlocks();
    // Somewhere in the middle of the journey it is neither where it started
    // nor yet at rest - which is the frame the player needs to see.
    let sawItMoving = false;
    for (let i = 0; i < 40 && data.slidingBlocks.length > 0; i++) {
        advance();
        if (data.slidingBlocks.length > 0 && data.slidingBlocks[0].x !== startX) {
            sawItMoving = true;
        }
    }
    assert_1.default.ok(sawItMoving, 'the block was drawn somewhere between its ends');
    assert_1.default.strictEqual(data.slidingBlocks.length, 0, 'and it came to rest');
}
/** While it is in flight the block is nowhere in the grid - so it must be drawn. */
async function aBlockInFlightIsNotLostFromTheBoard() {
    const { game, data } = emptyBoard();
    data.grid[4][5] = 'ice';
    game.handlePush();
    const inFlight = data.slidingBlocks.length;
    const inGrid = data.grid.flat().filter((c) => c === 'ice').length;
    assert_1.default.strictEqual(inFlight, 1, 'the block is in the air');
    assert_1.default.strictEqual(inGrid, 0, 'and out of the grid while it travels');
    const board = (0, render_1.buildBoard)(data, sheet, 0);
    const cell = board[data.slidingBlocks[0].y * constants_1.CELL_H]?.[data.slidingBlocks[0].x * constants_1.CELL_W];
    assert_1.default.ok(cell && cell.char !== ' ', 'the renderer draws a block in flight, or it vanishes for the whole slide');
}
//# sourceMappingURL=mechanics.test.js.map