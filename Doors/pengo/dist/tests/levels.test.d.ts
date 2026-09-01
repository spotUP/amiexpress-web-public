/**
 * The sixteen transcribed arcade mazes.
 *
 * Verifies the transcription against the fetched source counts (see
 * `levels/original-levels.ts`'s provenance note for exactly which cells
 * differ and why), that every level is the right shape, that nobody's
 * start cell is walled in, and that PengoGame actually uses this data for
 * levels 1-16 and falls back to the procedural generator past it.
 */
export declare function thereAreSixteenOriginalLevels(): Promise<void>;
/** Every transcribed level is exactly the door's own 13x15 world grid. */
export declare function everyLevelIsThirteenByFifteen(): Promise<void>;
/** The border ring is always wall, whatever the source transcription says there. */
export declare function theBorderIsAlwaysWall(): Promise<void>;
/**
 * No level ever loses a diamond to the wall-border override - 0 of the
 * source's diamond cells land on our border in any of the 16 levels
 * (verified against the fetched JSON). This is the invariant the crush/
 * alignment scoring depends on: exactly 3 diamonds, always in play.
 */
export declare function everyLevelKeepsAllThreeDiamonds(): Promise<void>;
/**
 * Egg-spawn counts match the source to within the (at most one) egg that
 * lands on our wall border and is dropped - never more than one, and
 * never for a level whose source had none there.
 */
export declare function eggCountsMatchTheSourceWithinTheBorderOverride(): Promise<void>;
/** Ice + diamond block counts (post-border-override) never exceed the source's. */
export declare function blockCountsNeverExceedTheSource(): Promise<void>;
/** Every level has room to stand: at least one interior cell is walkable floor. */
export declare function everyLevelHasAnOpenInteriorCell(): Promise<void>;
/** PengoGame actually loads the transcription for levels 1-16, not the random generator. */
export declare function pengoGameUsesTheOriginalLevelsForOneThroughSixteen(): Promise<void>;
/** Past level 16, PengoGame falls back to the procedural generator - never crashes, never repeats level 1. */
export declare function pengoGameFallsBackToTheProceduralGeneratorPastSixteen(): Promise<void>;
//# sourceMappingURL=levels.test.d.ts.map