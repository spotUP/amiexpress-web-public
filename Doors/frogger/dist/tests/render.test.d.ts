/**
 * How the board is drawn.
 *
 * Coloured lanes with character sprites over them, in the style of Philippe
 * Majerus's Frogger ANSI: a log has rounded ends and a grain, a turtle is
 * `:O:`, a car has a nose pointing the way it is going. Each logical cell is
 * CELL_WIDTH characters wide, so a cell is roughly square and forty of them
 * fill the eighty-column screen.
 */
/** Every board row is the full width, character for character. */
export declare function everyRowIsAFullScreenWide(): Promise<void>;
/** A cell is wider than one character, so it is not a tall sliver. */
export declare function aCellIsWiderThanOneCharacter(): Promise<void>;
/**
 * The board is drawn with characters, not just colour. This is the whole
 * point of the ANSI style, and the reason it was reported: a board of solid
 * blocks reads as coloured bars rather than as a game.
 */
export declare function theBoardIsDrawnWithCharacters(): Promise<void>;
/** A log has rounded ends and a grain along it. */
export declare function aLogIsDrawnAsALog(): Promise<void>;
/** A turtle set is drawn as turtles. */
export declare function turtlesAreDrawnAsTurtles(): Promise<void>;
/** A turtle that has dived shows nothing: there is nothing to stand on. */
export declare function aDivedTurtleShowsOnlyWater(): Promise<void>;
/** A vehicle points the way it is travelling. */
export declare function aVehiclePointsWhereItIsGoing(): Promise<void>;
/** ...and the other way when it is going the other way. */
export declare function aVehicleGoingLeftPointsLeft(): Promise<void>;
/** Each kind of traffic is told apart by colour. */
export declare function eachKindOfTrafficHasItsOwnColour(): Promise<void>;
/** The frog is drawn on top of whatever it is standing on. */
export declare function theFrogIsDrawnOverItsFooting(): Promise<void>;
/** A crocodile shows its jaws at the end it swims towards. */
export declare function aCrocodileShowsItsJaws(): Promise<void>;
/** A home shows what is sitting in it. */
export declare function aHomeShowsWhatIsInIt(): Promise<void>;
/** The hedge between the homes is textured, not a flat block. */
export declare function theHedgeIsTextured(): Promise<void>;
/** The banks and the median are textured too. */
export declare function theBanksAreTextured(): Promise<void>;
/** A snake riding a log is drawn over it. */
export declare function aSnakeOnALogIsVisible(): Promise<void>;
/** A dying frog blinks. */
export declare function aDyingFrogBlinks(): Promise<void>;
/**
 * Nothing outside 7-bit ASCII is ever drawn.
 *
 * Reported live 2026-08-31: "we cant use unicode characters in frogger".
 * The board goes through blessed with fullUnicode off, so a Unicode glyph
 * arrives mangled or not at all - the sprites showed as nothing.
 */
export declare function theBoardIsPureAscii(): Promise<void>;
/**
 * The frog is never the same colour as the ground it stands on.
 *
 * Reported live: "i cant see the grog when i stand on green as the grog is
 * the same green."
 */
export declare function theFrogStandsOutFromEveryLane(): Promise<void>;
/**
 * The GAME OVER panel is text over the board, not a black band across it.
 *
 * Reported live 2026-08-31: "remove the black background from the texts
 * drawn when i finish a level etc".
 */
export declare function theGameOverPanelDoesNotBlackOutTheBoard(): Promise<void>;
/**
 * A frog riding a log stays put on it, frame after frame.
 *
 * Reported live 2026-08-31: "when i am on a log the frog and log anims are
 * offset the frog should move with the log". The frog advanced by its own
 * copy of the log's sum, so it held a FRACTIONAL offset from its footing -
 * and a fraction is enough for the two to round to different cells, so they
 * drew a cell apart and drifted in and out of step.
 */
export declare function theFrogStaysPutOnTheLogItRides(): Promise<void>;
/** Hopping off a log ends the ride. */
export declare function hoppingOffALogEndsTheRide(): Promise<void>;
/**
 * The frog is never the colour of what it is standing on.
 *
 * Reported live 2026-08-31: "add a bg color as well that always is the
 * complement color of the ground tile color the frog currently is on and
 * make the frog color the complement color of it's current bg color this
 * way it will always be super clear where the frog is."
 */
export declare function theFrogContrastsWithEveryGroundItCanStandOn(): Promise<void>;
/** Every colour the board uses has an opposite. */
export declare function everyBoardColourHasAnOpposite(): Promise<void>;
/** The frog on the bank comes out a different colour from the bank. */
export declare function theFrogOnTheBankIsNotTheBank(): Promise<void>;
//# sourceMappingURL=render.test.d.ts.map