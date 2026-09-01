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
/**
 * A pushed block travels over several frames, and is visible the whole way.
 *
 * Reported in play as blocks disappearing when pushed, and diagnosed
 * exactly: "they move too fast making it a 1 frame animation". The whole
 * slide used to run inside the keypress, so the block left one cell and
 * arrived at the far wall in the same frame the player pressed the key.
 */
export declare function aPushedBlockTravelsOverSeveralFrames(): Promise<void>;
/** While it is in flight the block is nowhere in the grid - so it must be drawn. */
export declare function aBlockInFlightIsNotLostFromTheBoard(): Promise<void>;
/**
 * A block in flight is SOLID.
 *
 * Reported in play 2026-09-01: "when i push a block in pengo the penguin
 * flies with the block and dies on the enemy". pushBlock() takes the block
 * off the grid (`grid[y][x] = 'empty'`) and hands it to `slidingBlocks`,
 * and nothing consulted that list for walkability - so every cell the
 * block travelled through, including the one it was standing in, read as
 * empty floor. Pengo walks a cell per 90ms and a block travels one per
 * SLIDE_TICKS_PER_CELL (200ms), so holding the direction key walked him
 * straight through the block he had just pushed and into whatever was
 * behind it.
 */
export declare function pengoCannotWalkIntoABlockStillInFlight(): Promise<void>;
export declare function pengoCannotOvertakeTheBlockHePushed(): Promise<void>;
export declare function anEnemyCannotWalkIntoABlockInFlight(): Promise<void>;
//# sourceMappingURL=mechanics.test.d.ts.map