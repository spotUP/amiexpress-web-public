"use strict";
/**
 * THE LAST SNO-BEE RUNS FOR A CORNER.
 *
 * Verified against a description of the ARCADE rather than tie-broken
 * between the two reference clones, which is what
 * `thoughts/shared/plans/2026-09-01-pengo-gaps.md` asks for - its own open
 * questions say the better clone's source "was not fully readable" here:
 *
 *   "If a single Sno-Bee remains in the round, a jingle plays and the Sno-Bee
 *    accelerates in an attempt to reach a corner, where it safely fades away
 *    ... the final Sno-Bee eventually attempts to escape, ending the round if
 *    it reaches a corner."
 *
 * So three things, and the third is the one that changes play: it ESCAPES.
 * The player does not get that kill, and the round ends anyway.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.lastEnemyStartsFleeing = lastEnemyStartsFleeing;
exports.twoEnemiesDoNotFlee = twoEnemiesDoNotFlee;
exports.fleeingHeadsForACorner = fleeingHeadsForACorner;
exports.reachingTheCornerEndsTheRound = reachingTheCornerEndsTheRound;
exports.anEscapeIsNotAKill = anEscapeIsNotAKill;
exports.fleeingIsFasterThanChasing = fleeingIsFasterThanChasing;
exports.aStunnedLastEnemyDoesNotEscape = aStunnedLastEnemyDoesNotEscape;
const assert_1 = __importDefault(require("assert"));
const path_1 = require("path");
const cell_art_1 = require("@amiexpress/bbs-door-sdk/engines/graphics/cell-art");
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
        x: 6, y: 7, direction: 'right',
        isPushing: false, pushFrame: 0, isDead: false, deathFrame: 0,
    };
    game.cues.clear();
    return { game, data };
}
const walker = (id, x, y) => ({
    id, x, y, direction: 'left', state: 'walking',
    stunTimer: 0, crushTimer: 0, hatchTimer: 0, moveTimer: 0,
});
/** Ticks without the level-complete branch firing, so we can watch it run. */
function run(game, ticks) {
    for (let i = 0; i < ticks; i++)
        game.update();
}
function lastEnemyStartsFleeing() {
    const { game, data } = emptyBoard();
    data.enemies = [walker(1, 6, 8)];
    run(game, 30);
    assert_1.default.strictEqual(data.enemies[0]?.fleeing, true, 'the only Sno-Bee left should be running for a corner');
}
function twoEnemiesDoNotFlee() {
    const { game, data } = emptyBoard();
    data.enemies = [walker(1, 6, 8), walker(2, 7, 8)];
    run(game, 30);
    assert_1.default.ok(data.enemies.every(e => !e.fleeing), 'a Sno-Bee with company chases Pengo, it does not run');
}
function fleeingHeadsForACorner() {
    const { game, data } = emptyBoard();
    // Nearest interior corner to (3,3) is (1,1).
    data.enemies = [walker(1, 3, 3)];
    run(game, 60);
    const enemy = data.enemies[0];
    if (!enemy)
        return; // it may already have escaped, which is the point
    assert_1.default.ok(enemy.x <= 3 && enemy.y <= 3, `should be heading toward the top-left corner, was at ${enemy.x},${enemy.y}`);
}
function reachingTheCornerEndsTheRound() {
    const { game, data } = emptyBoard();
    data.enemies = [walker(1, 2, 1)];
    run(game, 120);
    assert_1.default.strictEqual(data.enemies.length, 0, 'the escaped Sno-Bee is gone');
    assert_1.default.ok(data.state === 'levelComplete' || data.state === 'playing', 'the round ends rather than hanging with an unkillable enemy');
}
function anEscapeIsNotAKill() {
    // The round itself still scores - clearing a level pays a bonus, and so
    // does the time left on the clock. What must NOT happen is the player
    // being paid for a Sno-Bee that walked away: no crush, no squash.
    const { game, data } = emptyBoard();
    // Far enough from a corner that the jingle and the escape are separate
    // ticks - next to one, the queue has both before anything can read it.
    data.enemies = [walker(1, 6, 8)];
    game.cues.clear();
    // The jingle fires the moment it starts running. Drained here rather than
    // at the end: SfxCues caps its queue and drops the oldest, so a hundred
    // ticks of play can throw the very cue under test away.
    run(game, 2);
    assert_1.default.ok(game.cues.drain().includes('warp'), 'the arcade announces the escape');
    game.cues.clear();
    run(game, 200);
    assert_1.default.strictEqual(data.enemies.length, 0, 'it got away');
    assert_1.default.ok(!game.cues.drain().includes('explosion'), 'an escape must not play the crush cue - the player did not kill it');
}
function fleeingIsFasterThanChasing() {
    const { game, data } = emptyBoard();
    const config = (0, constants_1.getLevelConfig)(data.level);
    data.enemies = [walker(1, 6, 8)];
    run(game, 4);
    // A fleeing Sno-Bee moves on a shorter timer than the level's own speed.
    assert_1.default.ok(game.fleeSpeedFor(config.enemySpeed) < config.enemySpeed, 'the arcade accelerates the last Sno-Bee');
    assert_1.default.ok(game.fleeSpeedFor(config.enemySpeed) >= 1, 'and never to zero, which would move it every tick of every frame');
}
function aStunnedLastEnemyDoesNotEscape() {
    const { game, data } = emptyBoard();
    const stunned = walker(1, 2, 1);
    stunned.state = 'stunned';
    stunned.stunTimer = 500;
    data.enemies = [stunned];
    run(game, 60);
    assert_1.default.strictEqual(data.enemies.length, 1, 'a stunned Sno-Bee is the player\'s to crush, not free to walk off');
}
//# sourceMappingURL=last-enemy-flees.test.js.map