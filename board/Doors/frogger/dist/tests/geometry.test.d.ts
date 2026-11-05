/**
 * Board geometry for the sprite pass.
 *
 * Frogger's board was 40 columns of 2 characters, every lane exactly one
 * terminal row tall. Animated cell-art sprites need the room Pengo's have:
 * 5 characters wide and 2 rows tall per cell. Thirteen lanes at two rows
 * each would be 26 rows and does not fit, so the two static banks - the
 * start bank and the home row - stay one row tall and the eleven lanes that
 * carry moving things get two:
 *
 *     start bank                    1
 *     5 road + median + 5 water     22
 *     home row                      1
 *                                   --
 *     board                         24   + 1 status line = 25
 *
 * These tests pin that arithmetic. They are about the BOARD, not about any
 * sprite: a sprite that renders wrong is Task 3's problem, but a lane that
 * overlaps its neighbour or a home the frog cannot reach is a geometry
 * fault, and it would otherwise only show up as a visual oddity nobody can
 * trace back to a number.
 */
/** The board fills the terminal's width exactly, with no partial cell. */
export declare function theBoardFillsTheScreenWidth(): Promise<void>;
/** A cell is Pengo's cell: 5 wide, 2 tall, so sprite work transfers. */
export declare function aCellIsPengoSized(): Promise<void>;
/** Every lane has a height, and only the two static banks are short. */
export declare function onlyTheStaticBanksAreOneRowTall(): Promise<void>;
/** Road and water lanes - the ones that animate - are all two rows. */
export declare function everyMovingLaneIsTwoRowsTall(): Promise<void>;
/** Lanes tile the board: integer rows, no gap, no overlap. */
export declare function lanesTileTheBoardWithoutOverlap(): Promise<void>;
/**
 * The board, the score line above it and the status line below it are the
 * whole screen.
 *
 * The permanent logo used to sit over the board for the whole session and
 * cost six rows; the arcade shows no logo while you play, and those rows
 * are what the two-row lanes are made of. If the logo ever comes back
 * during play this assertion is what will catch it.
 */
export declare function theScoreLineAndBoardFillTheScreen(): Promise<void>;
/** Five homes, on real columns, evenly spaced, inside the board. */
export declare function theFiveHomesSitOnReachableColumns(): Promise<void>;
/**
 * The frog can land dead centre in a home.
 *
 * FAQ 7: "You must hit exact center or your frog will die." The frog moves
 * in whole cells, so the centre of a home must BE a cell the frog can stand
 * on - otherwise the rule is unsatisfiable and the row becomes impossible.
 */
export declare function everyHomeCentreIsAColumnTheFrogCanReach(): Promise<void>;
/** Nothing is wider than the board it drives across. */
export declare function noObjectIsWiderThanTheBoard(): Promise<void>;
/** A truck is still bigger than a car, and a long log than a short one. */
export declare function relativeSizesSurviveTheRescale(): Promise<void>;
//# sourceMappingURL=geometry.test.d.ts.map