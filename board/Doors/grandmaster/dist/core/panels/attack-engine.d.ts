/**
 * The attack engine, ported from common/engine/AttackEngine.lua.
 *
 * A scripted opponent. It does not play - it replays a timetable of attacks,
 * looping forever, and that is what both Training and Challenge Mode use for
 * the pressure they put on you.
 *
 * The scripts are worth knowing about: many of the shipped ones were CAPTURED
 * FROM REAL HUMAN GAMES. `challenge-8-12.json` is tagged with the player's name
 * and 32.9 garbage-per-minute. So a late Challenge stage is not a designer's
 * guess at what hard feels like; it is what somebody actually did to someone.
 *
 * TWO TIMING SUBTLETIES, both upstream's:
 *
 *  - `delayBeforeStart` is shifted back by the whole countdown (188 frames)
 *    unless the file says it has already been adjusted. A script that says it
 *    starts at frame 150 therefore starts at -38, i.e. immediately.
 *  - EVERYTHING LOOPS, with a period of `delayBeforeRepeat` plus the latest
 *    start time. There is no "end" to a pattern; it simply comes round again.
 */
import type { GarbageQueue } from './garbage-queue';
/** A pattern as the shipped JSON files describe it. */
export interface AttackPatternSpec {
    width?: number;
    height?: number;
    startTime?: number;
    metal?: boolean;
    /**
     * A number: frames between links of a chain `height` links long.
     * An array: the exact frame of each link.
     * False or absent: this is combo garbage, not a chain.
     */
    chain?: number | number[] | false;
    chainEndDelta?: number;
    chainEndTime?: number;
}
export interface AttackSettings {
    name?: string;
    delayBeforeStart?: number;
    delayBeforeRepeat?: number;
    disableQueueLimit?: boolean;
    /** The file's own name for "treat shock as combo". Kept for compatibility. */
    mergeComboMetalQueue?: boolean;
    countdownAdjusted?: boolean;
    attackPatterns: AttackPatternSpec[];
    extraInfo?: Record<string, unknown>;
}
export declare class AttackEngine {
    readonly delayBeforeStart: number;
    readonly delayBeforeRepeat: number;
    readonly disableQueueLimit: boolean;
    readonly treatMetalAsCombo: boolean;
    readonly attackSettings: AttackSettings;
    private readonly attackPatterns;
    /** Frames since this engine started running. */
    stopWatch: number;
    readonly outgoingGarbage: GarbageQueue;
    /**
     * Upstream picks the attack graphic's origin with the GLOBAL math.random,
     * which is not the panel generator and is not reproducible. A seeded stream
     * is used here instead so a Challenge run is deterministic; the value is
     * cosmetic - it only decides where the attack animation starts from.
     */
    private readonly cosmeticRng;
    constructor(attackSettings: AttackSettings, garbageQueue: GarbageQueue);
    private addAttackPattern;
    private addEndChainPattern;
    /**
     * Expand the file's shorthand into individual scheduled attacks.
     *
     * A chain is written either as "N links, this many frames apart" or as an
     * explicit list of frames, and either way it becomes one 6-wide attack per
     * link plus an end marker.
     */
    private addAttackPatternsFromTable;
    /**
     * Advance one frame, sending whatever is due.
     *
     * A throttled engine holds off entirely while more than six pieces are
     * already in flight - the recipient is clearly not accepting them, and
     * piling on would just slow the game down.
     */
    run(): void;
}
//# sourceMappingURL=attack-engine.d.ts.map