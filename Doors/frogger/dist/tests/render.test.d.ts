/**
 * How the board is drawn.
 *
 * Blocks of background colour rather than ASCII sprites, the way Grandmaster
 * and Super Qix draw theirs, with each logical cell CELL_WIDTH characters
 * wide so a cell comes out roughly square.
 */
/** Every board row is the full width, in cells and in characters. */
export declare function everyRowIsAFullWidthOfCells(): Promise<void>;
/** A cell is drawn wider than one character, so it is not a tall sliver. */
export declare function aCellIsWiderThanOneCharacter(): Promise<void>;
/** The board is colour, not text: no ASCII sprites are left in it. */
export declare function theBoardCarriesNoAsciiSprites(): Promise<void>;
/** Open water is water-coloured; the road is road-coloured. */
export declare function theGroundIsPaintedByLaneType(): Promise<void>;
/** A car is drawn in the car colour, across its whole width. */
export declare function aCarIsPaintedInTheCarColour(): Promise<void>;
/** Each kind of traffic has its own colour. */
export declare function eachKindOfTrafficIsToldApartByColour(): Promise<void>;
/** The frog is drawn on top of whatever it is standing on. */
export declare function theFrogIsDrawnOverItsFooting(): Promise<void>;
/**
 * A crocodile's mouth is a different colour from its back, because one is
 * footing and the other is fatal.
 */
export declare function aCrocodileShowsWhichEndIsItsMouth(): Promise<void>;
/** A turtle that has dived is drawn as water: there is nothing to stand on. */
export declare function aDivedTurtleLooksLikeWater(): Promise<void>;
/** A home shows what is in it. */
export declare function aHomeShowsWhatIsInIt(): Promise<void>;
/** The hedge between the homes is not an opening. */
export declare function theHedgeBetweenHomesIsSolid(): Promise<void>;
/** A snake riding a log is drawn over it. */
export declare function aSnakeOnALogIsVisible(): Promise<void>;
/** A dying frog blinks rather than sitting there. */
export declare function aDyingFrogBlinks(): Promise<void>;
//# sourceMappingURL=render.test.d.ts.map