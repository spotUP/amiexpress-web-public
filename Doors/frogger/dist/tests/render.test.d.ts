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
//# sourceMappingURL=render.test.d.ts.map