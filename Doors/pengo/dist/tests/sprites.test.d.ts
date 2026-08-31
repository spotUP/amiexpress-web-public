/**
 * Pengo is drawn with sprites, not letters.
 *
 * It used to draw one ASCII letter per cell - 'P' for the penguin, 'S' for a
 * Sno-Bee, '#' for ice - and pad the row by pushing a space between every
 * character. A letter reads as a letter, and the padding put a space through
 * the middle of anything wider than one column.
 */
/** Every sprite covers exactly one cell - no more, no less. */
export declare function everySpriteIsExactlyOneCellWide(): Promise<void>;
/** Nothing is drawn as a bare letter any more. */
export declare function nothingIsDrawnAsALetter(): Promise<void>;
/** No two things on the board look the same. */
export declare function everythingLooksDifferentFromEverythingElse(): Promise<void>;
/** Ice, wall and diamond are told apart by colour as well as shape. */
export declare function theMazePiecesAreDistinguishable(): Promise<void>;
/** A stunned Sno-Bee is visibly different from a live one. */
export declare function aStunnedEnemyLooksDifferent(): Promise<void>;
/**
 * Pengo takes the colour of whatever it stands on into account.
 *
 * It can only stand on floor today, but the rule is the one Frogger's frog
 * uses, so a level that later lets it stand on ice cannot make it vanish.
 */
export declare function pengoIsDrawnAgainstItsGround(): Promise<void>;
/** The complement table covers every colour the board can paint. */
export declare function everyBoardColourHasAComplement(): Promise<void>;
/**
 * The renderer no longer pads rows by hand.
 *
 * `line.split('').join(' ')` inserted a space between every character to
 * fake a wider board - which also inserted one into the middle of every
 * two-character sprite.
 */
export declare function theRendererDoesNotPadRowsByHand(): Promise<void>;
//# sourceMappingURL=sprites.test.d.ts.map