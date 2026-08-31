/**
 * Galaga's board, and the bug the old renderer caused.
 *
 * Colour was decided AFTER drawing, by matching the glyph in the buffer, and
 * three different things are drawn with '.': a background star, an ENEMY
 * BULLET, and the last frame of an explosion. Every '.' was painted gray, so
 * incoming enemy fire looked exactly like a background star - the one thing
 * on screen that can kill you, disguised as scenery.
 */
/**
 * The regression that matters: an enemy bullet must not look like a star.
 *
 * They still share the glyph - the fix is that colour no longer comes from
 * the glyph.
 */
export declare function anEnemyBulletDoesNotLookLikeAStar(): Promise<void>;
/** An explosion's last frame is also a dot, and also must not be a star. */
export declare function anExplosionIsNotAStarEither(): Promise<void>;
/** The player's shot and the enemy's are told apart at a glance. */
export declare function theTwoBulletsAreDistinguishable(): Promise<void>;
/** Each kind of alien has its own colour. */
export declare function eachAlienKindHasItsOwnColour(): Promise<void>;
/** A boss holding your captured fighter is marked out. */
export declare function aBossWithACapturedFighterIsMarked(): Promise<void>;
/** Bright stars read as bright. */
export declare function starsHaveDepth(): Promise<void>;
/** Cells stay one column when painted. */
export declare function paintingKeepsCellsOneColumn(): Promise<void>;
/** Empty sky is untagged. */
export declare function emptySkyIsNotTagged(): Promise<void>;
/** The renderer paints cells rather than matching glyphs. */
export declare function theRendererPaintsCellsNotGlyphMatches(): Promise<void>;
//# sourceMappingURL=sprites.test.d.ts.map