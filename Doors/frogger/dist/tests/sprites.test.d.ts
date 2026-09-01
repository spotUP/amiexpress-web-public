/**
 * The sprite sheet: valid to the engine, and editable in SPRITED.
 *
 * Two different bars, and the second is the strict one. A sprite only has
 * to parse to be DRAWN, but the studio's pixel mode refuses any frame whose
 * cells are not pure half-blocks - so a sprite authored with arbitrary
 * characters would render fine and then be uneditable, which is the sort of
 * thing nobody notices until they try to fix a sprite and cannot.
 *
 * The colours come from Doors/frogger/reference/frogger-sprites.png, the
 * arcade rip, sampled rather than eyeballed.
 */
/** Every file in sprites/ is a sprite the engine accepts. */
export declare function everySpriteFileParses(): Promise<void>;
/**
 * Every sprite is a whole number of grid cells wide and exactly one tall.
 *
 * A sprite half a cell wide would sit between columns and no amount of
 * careful drawing would make it land right.
 */
export declare function everySpriteIsAWholeNumberOfCells(): Promise<void>;
/**
 * A sprite is as tall as the lane it lives in.
 *
 * The moving lanes are two rows and the standing ground - the start bank,
 * the median, the home row - is one. A two-row sprite in a one-row lane
 * does not get clipped, it BLEEDS: the home row's frames were drawing their
 * bottom halves into the top water lane, which looked like debris floating
 * in the river. Caught by rendering a board and reading it, which is the
 * only way this kind of fault shows itself.
 */
export declare function sceneryIsOneRowTallAndEverythingElseIsTwo(): Promise<void>;
/**
 * Every frame opens in SPRITED's pixel mode.
 *
 * `decompilePixels` returning null is exactly the check the studio's editor
 * makes before it will let you paint pixels, so this is the same gate the
 * user meets, not an approximation of it.
 */
export declare function everyFrameIsEditableInTheStudio(): Promise<void>;
/** The sprites the game needs, with the animations it asks them for. */
export declare function theGameplaySpritesExist(): Promise<void>;
/**
 * A sprite is as wide as the object the rules move.
 *
 * The widths in OBJECT_WIDTHS are what collision and lane packing use; a
 * sprite drawn wider than its object would let the frog stand on painted
 * water, which is the worst class of bug this door can have.
 */
export declare function spriteWidthsMatchTheObjectsTheyDraw(): Promise<void>;
//# sourceMappingURL=sprites.test.d.ts.map