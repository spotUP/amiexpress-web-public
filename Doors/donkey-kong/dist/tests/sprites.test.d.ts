/**
 * Donkey Kong's board, and the bug the old renderer caused.
 *
 * Colour was worked out AFTER drawing, by matching the glyph in the buffer.
 * Two different things are drawn with the same character - playerClimb is
 * 'H' and so is ladder - and the matcher tested the ladder first, so a
 * climbing Mario was painted in the ladder's colour and disappeared into it
 * for the whole climb. Which is most of the game.
 */
/**
 * The collision that caused the bug still exists in the glyph table, so the
 * fix has to be that colour no longer comes from the glyph.
 */
export declare function marioAndTheLadderStillShareAGlyph(): Promise<void>;
/** A climbing Mario is NOT drawn in the ladder colour. */
export declare function aClimbingMarioIsNotTheColourOfTheLadder(): Promise<void>;
/** Every drawn thing has a colour of its own. */
export declare function everythingHasItsOwnColour(): Promise<void>;
/** A blue barrel is not the same as an ordinary one. */
export declare function theTwoBarrelsAreDistinguishable(): Promise<void>;
/** A broken ladder reads differently from a whole one. */
export declare function aBrokenLadderLooksBroken(): Promise<void>;
/** Cells are one column, and painting keeps them that way. */
export declare function paintingKeepsCellsOneColumn(): Promise<void>;
/** Blank space costs nothing on the wire. */
export declare function blankSpaceIsNotTagged(): Promise<void>;
/** No glyph may be a blessed tag delimiter. */
export declare function noGlyphIsABrace(): Promise<void>;
/** The renderer no longer recovers colour by comparing glyphs. */
export declare function theRendererPaintsCellsNotGlyphMatches(): Promise<void>;
