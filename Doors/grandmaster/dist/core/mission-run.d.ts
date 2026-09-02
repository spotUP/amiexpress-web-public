/**
 * MISSION mode - judging one mission while it is played.
 *
 * The reference counts a mission's progress inside its own frame handler and
 * ends the stage the moment the norm is met (mission.c). This door does the
 * same through two inputs and nothing else: a LockEvent per locked piece, and
 * the run clock. Keeping the judge here - rather than in the engine or the
 * screen - is what lets every objective be tested without a terminal.
 */
import type { Mission } from './mission-types';
/**
 * Is the NEXT preview hidden - by the item's timer, or because a mission
 * switched it off for the whole run? Both renderers ask this rather than
 * testing one of the two and forgetting the other.
 */
export declare function nextIsHidden(state: {
    hideNextFrames: number;
    missionModifiers?: {
        hideNext?: boolean;
    };
}): boolean;
/** What the engine reports when a piece finishes locking. */
export interface LockEvent {
    /** Lines this lock cleared (0-4). */
    lineCount: number;
    /** True when the clear was a confirmed T-Spin. */
    tSpin: boolean;
    /** True when the board was left completely empty. */
    allClear: boolean;
    /** The combo counter AFTER this lock. */
    combo: number;
    /** Total pieces locked so far. */
    piecesPlaced: number;
    /** The run's level after this lock. */
    level: number;
}
export type MissionOutcome = 'playing' | 'cleared' | 'failed';
export interface MissionProgress {
    outcome: MissionOutcome;
    /** How far along, in the objective's own units. */
    current: number;
    /** What is needed. 0 for 'survive', which is judged by the clock. */
    target: number;
    /** Set when the run failed: why. */
    failure?: 'topped out' | 'out of time';
}
export declare class MissionRun {
    private readonly mission;
    private current;
    private outcome;
    private failure?;
    /** For 'cycle': which clear sizes have been seen. */
    private cycleSeen;
    constructor(mission: Mission);
    getMission(): Mission;
    getProgress(): MissionProgress;
    /** 'survive' has no count to reach; everything else has its norm. */
    private target;
    /** The engine locked a piece. Returns the outcome after judging it. */
    onLock(event: LockEvent): MissionOutcome;
    /**
     * The clock moved. A timed mission that is not 'survive' fails when the
     * clock runs out; 'survive' is cleared by exactly the same moment.
     */
    onTime(elapsedSeconds: number): MissionOutcome;
    /** The stack topped out. Every mission fails on that, including 'survive'. */
    onTopOut(): MissionOutcome;
    /** One line for the HUD: what to do, and how far along. */
    describe(): string;
}
//# sourceMappingURL=mission-run.d.ts.map