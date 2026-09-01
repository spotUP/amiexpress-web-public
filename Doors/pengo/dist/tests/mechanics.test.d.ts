/**
 * The Stage 3 mechanics rulings from the arcade-mechanics gap audit
 * (thoughts/shared/research/2026-09-01_pengo-arcade-mechanics-gap.md):
 * the diamond re-scoring bug, the score cap, chain-kill crushes, the
 * boxed-in-block destroy, touch-killing a stunned Sno-Bee, and the
 * concurrent-enemy population cap. The Gaussian AI targeting has its own
 * suite (ai.test.ts) since the interesting part of it is a pure function.
 */
/** The bug reported by the audit: the score re-added on every later push. */
export declare function theDiamondBonusIsAwardedExactlyOnce(): Promise<void>;
/** Once aligned, the diamonds themselves stop being pushable. */
export declare function alignedDiamondsAreLockedInPlace(): Promise<void>;
export declare function theScoreNeverExceedsTheArcadesFiveDigitDisplay(): Promise<void>;
/** A single continuous push catches every enemy in its path, not just the first. */
export declare function aPushChainKillsEveryEnemyInItsPath(): Promise<void>;
/** Pushing a block into a wall with no room to slide destroys it, rather than doing nothing. */
export declare function pushingABlockWithNoRoomDestroysIt(): Promise<void>;
/** A block that CAN slide at least one cell is unaffected - only the boxed-in case destroys. */
export declare function aBlockThatCanMoveIsNotDestroyed(): Promise<void>;
export declare function walkingIntoAStunnedSnoBeeKillsIt(): Promise<void>;
/** A live (not stunned) Sno-Bee on the same cell still kills Pengo, unchanged. */
export declare function walkingIntoAWalkingSnoBeeStillKillsPengo(): Promise<void>;
export declare function readyEggsHoldWhileTheEnemyPopulationIsAtCap(): Promise<void>;
export declare function aHeldEggHatchesOnceRoomOpensUp(): Promise<void>;
export declare function anEnemyBlockedByIceSometimesBreaksIt(): Promise<void>;
export declare function anEnemyBlockedByIceSometimesDoesNotBreakIt(): Promise<void>;
//# sourceMappingURL=mechanics.test.d.ts.map