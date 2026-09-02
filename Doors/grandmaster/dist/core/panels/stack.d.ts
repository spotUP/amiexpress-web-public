/**
 * The Stack: one player's board, and the frame loop that advances it.
 * Ported from common/engine/Stack.lua (@ c80668e).
 *
 * SCOPE. This is the solo engine - board, rise, swap, matching, game over.
 * Garbage, rollback, replay input and the puzzle win conditions arrive with
 * later phases and are marked where they attach. The plan calls for splitting
 * this across three files because Stack.lua is ~1800 lines; at the subset
 * implemented here that would mean inventing a large structural interface to
 * pass the stack to its own helpers, which reads worse than it solves. The
 * seam to split on when garbage lands is rise/physics/board, and the size hook
 * blocks at 2000 lines long before that becomes a surprise.
 *
 * THE FRAME. run() is one frame and nothing else is. Order inside it is not
 * arbitrary - three orderings are load-bearing:
 *
 *  1. `wasToppedOut` is sampled at the START of runPhysics, before anything
 *     moves. Stop time and the death check both read that snapshot, not the
 *     live state, so a match made on the frame you top out still pays out at
 *     the generous danger rate.
 *
 *  2. A swap INPUT is queued and executes at the start of the NEXT frame,
 *     before matching. So a swap the player makes on frame N is matched on
 *     frame N+1 - which is why a queued swap also locks the rise.
 *
 *  3. checkMatches runs BEFORE updatePanels. Matching therefore sees the board
 *     as it was left by the previous frame, and the +1 on a match timer exists
 *     to pay for that.
 *
 * DISPLACEMENT. The stack does not rise a row at a time; it rises in 16ths of
 * a row, and a new row is only committed when displacement reaches 0. The rise
 * timer accumulates a FRACTIONAL number of frames per 16th from the speed
 * table, which is why that table must not be rounded.
 */
import { Panel, PanelGrid } from './panel';
import type { LevelData } from './level-data';
import { MatchableStack, Coordinate } from './check-matches';
import type { GeneratorSource } from './generator-source';
export declare const BOARD_WIDTH = 6;
export declare const BOARD_HEIGHT = 12;
/** The last frame of the countdown; physics begins on this frame. */
export declare const COUNTDOWN_END: number;
/** Which way the cursor is being pushed this frame. */
export type CursorDirection = 'up' | 'down' | 'left' | 'right' | null;
/** Behaviour switches that game modes vary. */
export interface StackBehaviours {
    /** Does the stack rise on its own? Puzzle mode says no. */
    passiveRaise: boolean;
    /** May the player push the stack up? */
    allowManualRaise: boolean;
}
export declare function defaultBehaviours(): StackBehaviours;
export interface StackOptions {
    levelData: LevelData;
    panelSource: GeneratorSource;
    behaviours?: Partial<StackBehaviours>;
    /** Stop time the board starts with, for puzzles that grant it. */
    startingStopTime?: number;
    /** Play the 188-frame opening countdown before physics begins. */
    doCountdown?: boolean;
    /**
     * Which engine's physics to run. Replay fixtures span 045-049 and the
     * versions differ; a replay loaded under the wrong one diverges.
     */
    engineVersion?: string;
    /** Cursor DAS, in ticks. Replays record the value they were played at. */
    cursorWaitTime?: number;
}
export declare class Stack implements MatchableStack {
    readonly width = 6;
    readonly height = 12;
    levelData: LevelData;
    behaviours: StackBehaviours;
    panelSource: GeneratorSource;
    /** panels[row][column]; row 0 is the dimmed incoming row, columns from 1. */
    panels: PanelGrid;
    private panelsCreatedCount;
    clock: number;
    /** Frames of actual play; stops while the game has not started. */
    stopWatch: number;
    stopWatchIsRunning: boolean;
    /** 16ths of a row until the next row is committed. */
    displacement: number;
    riseTimer: number;
    riseLock: boolean;
    hasRisen: boolean;
    speed: number;
    nextSpeedIncreaseClock: number;
    panelsToSpeedup: number;
    manualRaise: boolean;
    manualRaiseYet: boolean;
    preventManualRaise: boolean;
    stopTime: number;
    preStopTime: number;
    shakeTime: number;
    prevShakeTime: number;
    shakeTimeOnFrame: number;
    peakShakeTime: number;
    health: number;
    wasToppedOut: boolean;
    chainCounter: number;
    score: number;
    panelsCleared: number;
    metalPanelsQueued: number;
    swapCount: number;
    /** 0 means the game is still running, matching upstream's sentinel. */
    gameOverClock: number;
    nActivePanels: number;
    nPrevActivePanels: number;
    swappingPanelCount: number;
    curRow: number;
    curCol: number;
    topCurRow: number;
    cursorDirection: CursorDirection;
    swapThisFrame: boolean;
    /** Ticks the current direction has been held. */
    curTimer: number;
    curWaitTime: number;
    /** Set during the countdown's scripted cursor animation. */
    cursorLock: boolean;
    animatingCursorDuringCountdown: boolean;
    engineVersion: string;
    doCountdown: boolean;
    countdownTimer: number | null;
    /**
     * One input character per frame, as a replay stores them and as netplay sends
     * them. When this is empty the stack is in "manual" mode and the caller sets
     * cursorDirection / swapThisFrame / manualRaise itself.
     */
    confirmedInput: string[];
    inputState: string;
    queuedSwapRow: number;
    queuedSwapColumn: number;
    /** Optional observers, for sound and effects. */
    onMatched?: MatchableStack['onMatched'];
    onNewRow?: () => void;
    onPanelPop?: (panel: Panel) => void;
    onPanelLand?: (panel: Panel) => void;
    onGameOver?: () => void;
    constructor(options: StackOptions);
    createPanelAt(row: number, column: number): Panel;
    /**
     * Fill the opening board.
     *
     * One more row than the board is tall, because a new row spawns in row 0 and
     * we want the bottom of the starting board to end up in row 1. The cursor is
     * pushed back down after each row so it does not ride up with the stack.
     */
    startingState(): void;
    /** Is any panel occupying the top row? */
    isToppedOut(): boolean;
    /**
     * Two frames of hysteresis, deliberately: a board counts as active for one
     * frame after the last panel settles, which stops the rise from resuming for
     * a single frame between two links of a chain.
     */
    hasActivePanels(): boolean;
    hasFallingGarbage(): boolean;
    hasChainingPanels(): boolean;
    swapQueued(): boolean;
    gameEnded(): boolean;
    /** Is this stack being driven by a recorded/networked input buffer? */
    private get drivenByInput();
    /** Append one or more input characters to the buffer. */
    receiveConfirmedInput(input: string): void;
    /** Has the game finished, from the point of view of the input reader? */
    private inputExhausted;
    /** Take this frame's input off the buffer and decode it. */
    private setupInput;
    /**
     * Turn this frame's input character into intents.
     *
     * Two details are load-bearing. Directions are PRIORITISED, not combined -
     * up beats down beats left beats right - and a swap is refused outright if
     * one is already queued, so a swap is possible at most every OTHER frame.
     * Upstream flags that second one as a known wart (issue #624): it can make a
     * stealth attempt fail with no feedback.
     */
    private controls;
    /**
     * The opening countdown: 188 frames in which the cursor walks itself into
     * place and nothing else happens.
     *
     * The walk is not decoration - it decides where the cursor STARTS, and every
     * recorded input in a replay is relative to that position. Four steps down,
     * two left, from the top-right of the playfield.
     */
    private runCountdown;
    run(): void;
    private runPhysics;
    private updatePanels;
    private updateActivePanelCount;
    /**
     * Panels doing something. Note `landing` does NOT count as active - a landing
     * panel's twelve bounce frames must not hold the stack still.
     */
    private getActivePanelCount;
    private decrementInvincibilityTimers;
    private updateRiseLock;
    private updateSpeed;
    /**
     * The automatic rise.
     *
     * Returns true if the rise was allowed to proceed this frame, which is the
     * caller's cue to test for death - because being topped out during a rise is
     * what drains health, and nothing else does.
     */
    private advancePassiveRaise;
    /**
     * The player pushing the stack up.
     *
     * Manual raise DUMPS all accumulated stop time - pushing while a big chain's
     * reward is still running throws that reward away. The final 16th is
     * deliberately deferred to passive raise on the next frame, so a raise cannot
     * commit a row on the same frame it tops the stack out.
     */
    private handleManualRaise;
    /** Commit a new row at the bottom, pushing everything up one. */
    newRow(): void;
    /** Drop empty rows above the playfield so the grid does not grow forever. */
    private removeExtraRows;
    moveCursorInDirection(direction: Exclude<CursorDirection, null>): void;
    /**
     * Move the cursor, with the game's own auto-repeat.
     *
     * A direction moves on the frame it is first pressed (curTimer 0), then not
     * again until the timer reaches curWaitTime, after which it moves every
     * frame. Note the timer is incremented in BOTH controls() and here, so it
     * advances two per frame and the effective delay is HALF curWaitTime - about
     * 10 frames at the default of 20. That double increment is upstream's, and a
     * port that increments once makes every held direction travel at half speed.
     */
    applyCursorDirection(direction: CursorDirection): void;
    /**
     * Ask for a swap. It does not happen now - it is queued for the next frame.
     */
    tryQueueSwap(panel1: Panel, panel2: Panel): boolean;
    canSwap(panel1: Panel, panel2: Panel): boolean;
    /**
     * Perform the swap.
     *
     * `dontSwap` is set immediately afterwards for any panel that is now going to
     * fall, or any gap that now has a panel above it: those swaps cannot be taken
     * back, because the board is already committed to moving.
     */
    swap(row: number, col: number): void;
    addScore(amount: number): void;
    private handlePop;
    private handlePopped;
    private handleLand;
    /**
     * Health reaching zero ends the game, but only once the stack has stopped
     * shaking - garbage landing must not kill on the frame it arrives.
     */
    checkGameOver(): boolean;
    setGameOver(): void;
    /** The origin of the last attack graphic, for the renderer. */
    lastMatchOrigin: Coordinate | null;
}
//# sourceMappingURL=stack.d.ts.map