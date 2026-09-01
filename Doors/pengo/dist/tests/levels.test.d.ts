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
/** Every parsed level is exactly the door's own world grid, wall ring included. */
export declare function everyLevelIsTheFullWorldGrid(): Promise<void>;
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
 * Egg-spawn counts match the source EXACTLY.
 *
 * They used to be allowed to fall one short: the source's 13x15 was mapped
 * straight onto a 13x15 grid whose outer ring was our wall, so any source
 * cell on that ring was overwritten - seven of the sixteen levels lost an
 * egg that way, and with it one Sno-Bee. The arcade's 13x15 is the
 * PLAYABLE interior and its wall sits outside that space; our grid is
 * 15x17 for the same reason, so nothing lands on the ring any more and
 * the tolerance is gone.
 */
export declare function eggCountsMatchTheSourceExactly(): Promise<void>;
/**
 * Ice + diamond block counts match the source EXACTLY - see the note above.
 *
 * The source's `blocks` array is every block cell INCLUDING the ones
 * `diamond` and `unhatched` override, so the terrain this door ends up
 * with is `blocks - eggs`: an egg cell is walkable floor plus a spawn
 * point in our model, not a block.
 */
export declare function blockCountsMatchTheSourceExactly(): Promise<void>;
/**
 * The wall ring sits OUTSIDE the arcade's addressable space, so every
 * source cell has an interior home. Asserted structurally, not by count:
 * the ring is at 0 and GRID-1, and the arcade's 13x15 occupies 1..13 by
 * 1..15 inside it.
 */
export declare function theArcadeSpaceFitsInsideTheWallRing(): Promise<void>;
/** Every level has room to stand: at least one interior cell is walkable floor. */
export declare function everyLevelHasAnOpenInteriorCell(): Promise<void>;
/** PengoGame actually loads the transcription for levels 1-16, not the random generator. */
export declare function pengoGameUsesTheOriginalLevelsForOneThroughSixteen(): Promise<void>;
/** Past level 16, PengoGame falls back to the procedural generator - never crashes, never repeats level 1. */
export declare function pengoGameFallsBackToTheProceduralGeneratorPastSixteen(): Promise<void>;
//# sourceMappingURL=levels.test.d.ts.map