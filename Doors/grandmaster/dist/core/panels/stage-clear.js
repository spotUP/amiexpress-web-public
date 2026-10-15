"use strict";
/**
 * STAGE CLEAR: the SNES campaign, thirty stages and two fights with Bowser.
 *
 * WHAT IS 1:1 HERE AND WHAT IS NOT, stated plainly because it matters.
 *
 * The RULE is the original's, quoted from the FAQ: "you clear blocks until all
 * the blocks are below the clear line. As you move on, the stack starts higher
 * and the clear line is further below the stack. Sometimes, you'll battle
 * Bowser, meaning you use combos and chains to lower his HP."
 *
 * The thirty BOARD LAYOUTS are not published anywhere - not in panel-attack,
 * not in panel-pop, not in any FAQ; they live in the ROM. So each stage's board
 * is GENERATED, from a fixed seed derived from the stage number, which means it
 * is the same board every time anybody plays stage 3-2 on this board even
 * though it is not the same board Nintendo shipped. Inventing a table and
 * calling it authentic would have been worse.
 *
 * Everything else is reused rather than rebuilt: the board is a PuzzleSource
 * fed generated rows, because that source already places an authored board of
 * any height; and a Bowser fight is a SimulatedStack in an ordinary match,
 * because "lower his HP with combos and chains" is exactly what the health
 * model in Challenge Mode already does.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.StageClearGame = exports.STAGE_COUNT = exports.STAGES_PER_ROUND = exports.ROUNDS = void 0;
exports.buildStages = buildStages;
exports.stageSpeed = stageSpeed;
exports.stageBoardString = stageBoardString;
exports.stageSeed = stageSeed;
exports.bossHealth = bossHealth;
exports.stageStackOptions = stageStackOptions;
const stack_1 = require("./stack");
const puzzle_source_1 = require("./puzzle-source");
const generator_source_1 = require("./generator-source");
const level_data_1 = require("./level-data");
/** Six rounds of five. */
exports.ROUNDS = 6;
exports.STAGES_PER_ROUND = 5;
exports.STAGE_COUNT = exports.ROUNDS * exports.STAGES_PER_ROUND;
/** The level the campaign is played at; its speed climbs per stage instead. */
const STAGE_LEVEL = 5;
/** Rows of panels the stack rises out of, so a long stage never runs dry. */
const RISE_BUFFER_ROWS = 100;
/**
 * The campaign.
 *
 * The stack starts one row higher each round and the clear line drops in the
 * back half, so the gap the player has to close grows from two rows to eight -
 * which is the curve the FAQ describes: "the stack starts higher and the clear
 * line is further below the stack". Within a round the board is the same shape
 * and the SPEED climbs instead, one step per stage.
 *
 * The line must always sit BELOW the starting stack, or the stage is won
 * before a key is pressed. That is not a hypothetical: the first draft had
 * round 1 starting at five rows with the line at five, and stage 1-1 reported
 * itself cleared on frame one.
 */
function buildStages() {
    const stages = [];
    for (let round = 1; round <= exports.ROUNDS; round++) {
        for (let index = 1; index <= exports.STAGES_PER_ROUND; index++) {
            stages.push({
                number: stages.length + 1,
                round,
                index,
                label: `${round}-${index}`,
                startingHeight: 4 + round,
                clearLine: round <= 3 ? 3 : 2,
                boss: false,
            });
        }
        // Bowser waits at the halfway point and at the end.
        if (round === 3 || round === exports.ROUNDS) {
            stages.push({
                number: stages.length + 1,
                round,
                index: exports.STAGES_PER_ROUND + 1,
                label: round === exports.ROUNDS ? 'FINAL' : 'SPECIAL',
                startingHeight: 4 + round,
                clearLine: 0,
                boss: true,
            });
        }
    }
    return stages;
}
/** The speed a stage starts at: one step per stage through the campaign. */
function stageSpeed(stage) {
    return Math.min(99, stage.number);
}
/**
 * Generate a stage's board.
 *
 * Rows come from the ordinary panel generator - the same one Endless uses,
 * with the same bad-row rejection - and are then handed to PuzzleSource, which
 * places an authored board of any height. The alternative, teaching
 * GeneratorSource to build boards of other heights, would have meant touching
 * the "arcane magic" removal that the replay fixtures pin.
 */
function stageBoardString(stage, rows) {
    const levelData = (0, level_data_1.getModern)(STAGE_LEVEL);
    const stackLike = { width: 6, levelData };
    // clone() is what builds the generators; the constructor deliberately does
    // not, exactly as upstream.
    const source = new generator_source_1.GeneratorSource(stageSeed(stage), false).clone(stackLike);
    source.panelBuffer = '';
    for (let i = 0; i < rows; i++)
        source.growPanelBuffer(stackLike);
    return source.panelBuffer;
}
/**
 * The seed a stage's board is generated from.
 *
 * Derived from the stage number and nothing else, so stage 3-2 is the same
 * board for every caller on every night - a campaign whose stages reshuffled
 * per attempt would not be a campaign.
 */
function stageSeed(stage) {
    return 1000 + stage.number * 7919;
}
/** Bowser's health, which combos and chains chip away at. */
function bossHealth(stage) {
    // The final fight is the harder one; the FAQ says a good chain nearly
    // finishes either.
    const final = stage.label === 'FINAL';
    return {
        framesToppedOutToLose: final ? 180 : 120,
        lineClearGPM: final ? 18 : 14,
        lineHeightToKill: final ? 8 : 6,
        riseSpeed: final ? 8 : 6,
    };
}
function stageStackOptions(stage) {
    const board = stageBoardString(stage, stage.startingHeight);
    const riseBuffer = stageBoardString(stage, RISE_BUFFER_ROWS);
    const levelData = { ...(0, level_data_1.getModern)(STAGE_LEVEL), startingSpeed: stageSpeed(stage) };
    return {
        levelData,
        panelSource: new puzzle_source_1.PuzzleSource(board, riseBuffer),
        doCountdown: true,
    };
}
/**
 * One stage of the campaign.
 *
 * The win is a question about the board rather than about the score: is
 * everything at or below the clear line? Asked only of a SETTLED board,
 * because panels in mid-fall are on their way somewhere and a board that
 * momentarily looks clear is not.
 */
class StageClearGame {
    constructor(stage) {
        this.outcome = 'playing';
        if (stage.boss) {
            throw new Error('a Bowser stage is played as a match, not as a board');
        }
        this.stage = stage;
        this.stack = new stack_1.Stack(stageStackOptions(stage));
        this.stack.startingState();
    }
    /** The highest row holding a panel, or 0 for an empty board. */
    highestPanelRow() {
        for (let row = this.stack.height; row >= 1; row--) {
            for (let col = 1; col <= this.stack.width; col++) {
                if (this.stack.panels[row][col].color !== 0)
                    return row;
            }
        }
        return 0;
    }
    hasCleared() {
        if (this.stack.hasActivePanels() || this.stack.swapQueued())
            return false;
        return this.highestPanelRow() <= this.stage.clearLine;
    }
    run() {
        if (this.outcome !== 'playing')
            return this.outcome;
        this.stack.run();
        if (this.stack.gameEnded())
            this.outcome = 'lost';
        else if (this.hasCleared())
            this.outcome = 'cleared';
        return this.outcome;
    }
    result() {
        return this.outcome;
    }
}
exports.StageClearGame = StageClearGame;
//# sourceMappingURL=stage-clear.js.map