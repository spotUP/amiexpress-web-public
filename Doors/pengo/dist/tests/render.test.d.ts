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
//# sourceMappingURL=render.test.d.ts.map