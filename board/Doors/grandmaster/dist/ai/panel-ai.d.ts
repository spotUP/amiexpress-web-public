/**
 * The CPU player, ported from a544jh/panel-pop's AI/ directory.
 *
 * WHY THIS SOURCE. panel-attack, which every mechanic in this engine comes
 * from, has NO board-playing AI at all - its computerPlayers folder contains
 * only a DummyCpu that holds swap+down forever and is never called. panel-pop's
 * is the only open-source Panel de Pon bot in existence, so it is what a CPU
 * opponent can be ported from rather than invented.
 *
 * BE HONEST ABOUT WHAT IT IS. It does not search, evaluate or plan. Its whole
 * strategy is: find a colour that appears somewhere on three consecutive rows
 * and drag those instances into one column; if the stack is getting high, shove
 * a panel sideways into a hole instead; otherwise press raise. Its chain-
 * planning code exists upstream but is never called and the author's own
 * comment says it "doesn't quite work yet", so it is not ported. It cannot see
 * garbage at all.
 *
 * That is roughly the right calibre. A player who beat the real thing described
 * the level 7 CPU as "actually an extremely inefficient opponent" that "fails
 * in the garbage chaining section" and cannot do solid x13 chains.
 *
 * IT PLAYS THROUGH THE SAME DOOR THE PLAYER DOES. It emits an input mask per
 * frame - cursor, swap, raise - and never touches the board directly. So it is
 * subject to every rule a human is: the four-frame swap, the every-other-frame
 * swap refusal, rise lock, and the cursor's own auto-repeat.
 *
 * THE ONE ADDITION. panel-pop has a single hardcoded speed; the original has
 * eight CPU levels. Its two tunable numbers are lifted into a level table, and
 * the DECISION LOGIC is untouched - every level plays the same way, faster or
 * slower.
 */
import type { Stack } from '../core/panels/stack';
export interface AiLevel {
    /** Game frames between actions. Lower is faster. */
    thinkInterval: number;
    /** Consecutive rows that must share a colour before it will act on it. */
    matchThreshold: number;
}
/**
 * The eight CPU levels.
 *
 * Level 5 is panel-pop's own hardcoded speed - one action every five frames -
 * so it is the calibrated middle and the others fan out from it. Only the
 * interval and the threshold change; the algorithm never does.
 */
export declare const AI_LEVELS: readonly AiLevel[];
export declare const MAX_AI_LEVEL: number;
/**
 * The controller.
 *
 * Three FIFO queues drained in strict priority order, one item per think tick:
 * raw inputs first, then a queued cursor destination, then a block to carry.
 * Only when all three are empty does it look at the board again - so a plan,
 * once made, is played out even if the board has moved under it. That is
 * upstream's behaviour and part of why the bot is beatable.
 */
export declare class PanelAi {
    private readonly stack;
    private readonly scanner;
    private readonly level;
    private inputQueue;
    private blockMoveQueue;
    constructor(stack: Stack, level?: number);
    /**
     * The input mask for this frame.
     *
     * Idle on every frame that is not a think tick, which is what makes a level
     * slow: the bot is not thinking harder, it is simply acting less often.
     */
    update(): number;
    /** Decide what to do next. Called only when nothing is queued. */
    private plan;
    /**
     * Drag every instance of the colour into the column the topmost one is in.
     *
     * Rows are visited outside-in - top, bottom, next-to-top, next-to-bottom -
     * which is upstream's ordering. A column lookup can return -1 when the panel
     * has moved or popped since the plan was made; those moves simply produce
     * harmless nonsense presses rather than an error, exactly as in the original.
     */
    private planVerticalMatch;
    /**
     * Turn "carry this panel to that column" into presses.
     *
     * Moving right means swapping repeatedly from the panel's own cell; moving
     * left means standing one cell to the left and doing the same. The bot only
     * ever moves panels horizontally - upstream throws if asked to move one up.
     */
    private expandBlockMove;
    /** Manhattan walk to a cell: horizontal first, then vertical. */
    private queueCursorMove;
    private static maskFor;
}
//# sourceMappingURL=panel-ai.d.ts.map