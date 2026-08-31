/**
 * Joust's board, and the two things that were wrong with it.
 *
 * The buzzards were drawn '{' and '}' - blessed's own tag delimiters - so
 * every enemy on screen emitted a bare brace into tagged content, where '{'
 * opens a colour tag and '}' closes one.
 *
 * And colour was decided AFTER drawing, by matching the character that had
 * been written into the buffer: the renderer asked "is this the enemy
 * character?" and then searched the enemy list BY POSITION to recover what
 * colour it should have been. Two things drawn with the same glyph could not
 * be told apart at all.
 */
/**
 * No glyph may be a brace.
 *
 * This is the regression that matters: '{' and '}' are markup here, not
 * characters, and the board is emitted as tagged content.
 */
export declare function noGlyphIsABlessedTagDelimiter(): Promise<void>;
/** Every sprite is one column, because the buffer is one char per cell. */
export declare function everySpriteIsOneColumn(): Promise<void>;
/**
 * A buzzard is drawn in ITS OWN colour, given at draw time.
 *
 * The colour used to be recovered afterwards by searching the enemy list for
 * whatever happened to be at that position.
 */
export declare function eachBuzzardCarriesItsOwnColour(): Promise<void>;
/** An enemy with no colour still gets drawn rather than vanishing. */
export declare function anUnknownBuzzardStillHasAColour(): Promise<void>;
/** The rider faces where it is going, and flapping overrides facing. */
export declare function theRiderFacesItsDirection(): Promise<void>;
/** A hatching egg is visibly different from a settled one. */
export declare function aHatchingEggLooksDifferent(): Promise<void>;
/** Lava churns, and sits on a hot background rather than bare sky. */
export declare function lavaChurnsAndIsHot(): Promise<void>;
/**
 * Empty sky is a plain space.
 *
 * A board is mostly empty, and wrapping every space in colour tags multiplies
 * the bytes going down the line by about eight for no visible difference.
 */
export declare function emptySkyCostsNothing(): Promise<void>;
/** The renderer paints cells rather than matching characters afterwards. */
export declare function theRendererDoesNotRecoverColourFromGlyphs(): Promise<void>;
