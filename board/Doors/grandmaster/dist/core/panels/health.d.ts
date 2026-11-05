/**
 * The simulated opponent's health, ported from common/engine/Health.lua.
 *
 * Challenge Mode's opponent has NO BOARD. It is this: one number representing
 * how buried it is, rising steadily and falling as it "clears". Garbage you
 * send adds to it; when it stays over the line long enough, the opponent dies.
 *
 * That is not a shortcut on our part - it is what panel-attack does, and it is
 * why the opponent's side of the screen shows a rising danger bar rather than
 * panels. It also means the opponent cannot be read, baited or out-played, only
 * out-damaged.
 *
 * TWO THINGS MAKE IT GET HARDER. The rise speed climbs every fifteen seconds
 * exactly as a real stack's does, and STAMINA decays: its ability to clear
 * falls linearly to half over the first five hundred seconds. So an opponent
 * you cannot beat early may still be beatable late.
 *
 * The damage a piece of garbage does is deliberately sublinear above six rows -
 * a very tall block is worth less per row than a short one - which stops one
 * enormous chain from simply ending the match.
 */
import type { Garbage } from './garbage-queue';
export interface HealthSettings {
    /** Frames the opponent may spend buried before it loses. */
    framesToppedOutToLose: number;
    /** How fast it clears, in "lines" per minute. */
    lineClearGPM: number;
    /** How many lines count as buried. */
    lineHeightToKill: number;
    /** The speed its passive rise starts at. */
    riseSpeed: number;
}
export declare class Health {
    framesToppedOutToLose: number;
    readonly maxFramesToppedOutToLose: number;
    /** Lines cleared per SECOND. The setting is per minute. */
    readonly lineClearRate: number;
    currentLines: number;
    readonly height: number;
    /**
     * Two +4 combos in a row count as one line between them - so spamming the
     * smallest combo is worth less than it looks.
     */
    private lastWasFourCombo;
    clock: number;
    readonly initialRiseSpeed: number;
    currentRiseSpeed: number;
    constructor(settings: HealthSettings);
    /**
     * Advance one frame. Returns the frames of burial it has left.
     *
     * Note the damage is PERMANENT: once the counter has dropped it never
     * refills, even if the opponent digs itself back out. A real stack's health
     * refills; this one's does not, which is what makes a sustained attack tell.
     */
    run(): number;
    /**
     * How many lines a block of this height is worth.
     *
     * Linear to five, then sublinear: +0.8, +0.6, +0.4, +0.2 and nothing after,
     * so anything ten rows or taller is worth exactly seven. A single enormous
     * chain therefore cannot end the match on its own.
     */
    damageForHeight(height: number): number;
    /**
     * Take a piece of garbage.
     *
     * A 3-wide non-chain block is what a +4 combo sends, and two of those in a
     * row count as one: the second is free. Anything else resets the toggle.
     */
    receiveGarbage(garbage: Garbage): void;
    /**
     * How buried the opponent is, as a fraction. This is the danger bar, and it
     * is NOT capped at 1 - an opponent can be very buried indeed.
     */
    getTopOutPercentage(): number;
    getSettings(): HealthSettings;
}
//# sourceMappingURL=health.d.ts.map