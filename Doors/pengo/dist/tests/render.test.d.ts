/**
 * The sprite renderer.
 *
 * buildBoard is pure in (data, sheet, tick), so everything the player sees
 * is assertable: where the penguin is drawn, that a stunned Sno-Bee looks
 * stunned, that death animates and then holds. The four glyph-collision
 * bugs of 2026-08-31 (galaga's '.', donkey-kong's 'H', zoo-keeper's '@',
 * joust's '{') were all "the buffer cannot say what this is" bugs; a Cell
 * carries its own colours, so none of them can come back.
 */
export declare function theBoardIsExactlyTheScreenItClaims(): Promise<void>;
export declare function thePenguinIsDrawnWhereItStands(): Promise<void>;
export declare function facingIsVisible(): Promise<void>;
export declare function walkingAnimates(): Promise<void>;
export declare function aStunnedSnoBeeLooksStunned(): Promise<void>;
export declare function deathAnimatesAndThenHolds(): Promise<void>;
export declare function aFreshSlidePlaysTheSlideFlash(): Promise<void>;
export declare function renderEmitsTagsNotGlyphPairs(): Promise<void>;
/**
 * A crushed Sno-Bee is visible while it is being crushed.
 *
 * Reported live: "when i push a block against an enemy it doesn't animate
 * it's buggy". The crush set the enemy straight to 'dead', which the
 * renderer skips and the tick filters out, so the enemy vanished on the
 * same frame the block reached it - the one moment the whole game is about.
 */
export declare function aCrushedSnoBeeIsDrawnWhileItIsCrushed(): Promise<void>;
/** And it is gone once the squash has played out. */
export declare function aCrushedSnoBeeIsRemovedAfterItsAnimation(): Promise<void>;
//# sourceMappingURL=render.test.d.ts.map