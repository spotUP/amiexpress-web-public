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
import { Stack, type StackOptions } from './stack';
import type { HealthSettings } from './health';
/** Six rounds of five. */
export declare const ROUNDS = 6;
export declare const STAGES_PER_ROUND = 5;
export declare const STAGE_COUNT: number;
export interface Stage {
    /**
     * 1-based position in the campaign, counting the two Bowser fights: 1 to 32.
     *
     * Position in the WHOLE ladder, not within the boards, because it is what
     * the per-stage seed and the starting speed are derived from. Numbering the
     * boards alone gave SPECIAL the same number as 4-1, and with it the same
     * seed and the same speed.
     */
    number: number;
    round: number;
    /** Position within the round, 1 to 5. */
    index: number;
    /** How it is written on screen: "3-2". */
    label: string;
    /** Rows of panels the board starts with. */
    startingHeight: number;
    /**
     * The clear line. Every panel must end up at or below this row.
     *
     * Counted from the bottom, so a LOWER number is harder - which is what "the
     * clear line is further below the stack" means.
     */
    clearLine: number;
    /** A Bowser fight rather than a board: after 3-5 and after 6-5. */
    boss: boolean;
}
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
export declare function buildStages(): Stage[];
/** The speed a stage starts at: one step per stage through the campaign. */
export declare function stageSpeed(stage: Stage): number;
/**
 * Generate a stage's board.
 *
 * Rows come from the ordinary panel generator - the same one Endless uses,
 * with the same bad-row rejection - and are then handed to PuzzleSource, which
 * places an authored board of any height. The alternative, teaching
 * GeneratorSource to build boards of other heights, would have meant touching
 * the "arcane magic" removal that the replay fixtures pin.
 */
export declare function stageBoardString(stage: Stage, rows: number): string;
/**
 * The seed a stage's board is generated from.
 *
 * Derived from the stage number and nothing else, so stage 3-2 is the same
 * board for every caller on every night - a campaign whose stages reshuffled
 * per attempt would not be a campaign.
 */
export declare function stageSeed(stage: Stage): number;
/** Bowser's health, which combos and chains chip away at. */
export declare function bossHealth(stage: Stage): HealthSettings;
export declare function stageStackOptions(stage: Stage): StackOptions;
export type StageOutcome = 'playing' | 'cleared' | 'lost';
/**
 * One stage of the campaign.
 *
 * The win is a question about the board rather than about the score: is
 * everything at or below the clear line? Asked only of a SETTLED board,
 * because panels in mid-fall are on their way somewhere and a board that
 * momentarily looks clear is not.
 */
export declare class StageClearGame {
    readonly stack: Stack;
    readonly stage: Stage;
    private outcome;
    constructor(stage: Stage);
    /** The highest row holding a panel, or 0 for an empty board. */
    highestPanelRow(): number;
    hasCleared(): boolean;
    run(): StageOutcome;
    result(): StageOutcome;
}
//# sourceMappingURL=stage-clear.d.ts.map