/**
 * What kills the frog, what it can ride, and what turns up in a home.
 *
 * Covers FAQ-6.4d, FAQ-6.4i, FAQ-6.4l, FAQ-6.4m, FAQ-6.4n, FAQ-7f, FAQ-7h,
 * FAQ-7i, FAQ-7j, FAQ-7k, FAQ-7m, FAQ-7n, FAQ-7o and FAQ-7p.
 */
/**
 * FAQ-7n: "You must hit exact center or your frog will die."
 */
export declare function ahomeIsEnteredAtItsExactCentreOnly(): Promise<void>;
/**
 * FAQ-7o: "keep in mind that crocodiles like to randomly appear in your
 * home. Make sure that your home is clear before trying to settle your frog
 * down into it."
 */
export declare function aCrocodileInAHomeKillsTheFrogThatEntersIt(): Promise<void>;
/** FAQ-6.4i/6.4l: no crocodile visits a home on level 1. */
export declare function noCrocodileVisitsAHomeOnLevelOne(): Promise<void>;
/** ...and one does from level 2. */
export declare function aCrocodileVisitsAHomeFromLevelTwo(): Promise<void>;
/** FAQ-7m: "you can hold out until the fly appears in your home". */
export declare function aFlyAppearsInAHome(): Promise<void>;
/**
 * FAQ-7f: "The snake is deadly to your frog and you cannot hop over it."
 */
export declare function theMedianSnakeKillsTheFrog(): Promise<void>;
/** FAQ-7k: "Watch out for the snakes, they sometimes like to ride on the logs." */
export declare function aSnakeOnALogKillsTheFrogRidingIt(): Promise<void>;
/**
 * FAQ-7h/7i: "You can jump on the backs of the crocodiles and otters. Just
 * don't get near their mouths or they are apt to turn your frog into a
 * meal."
 */
export declare function aCrocodilesBackCarriesYouAndItsMouthDoesNot(): Promise<void>;
/** FAQ-6.4n: "The otter appears randomly on any of the water lanes." */
export declare function anOtterAppearsOnAWaterLane(): Promise<void>;
/**
 * FAQ-7j: "You may see a purple frog hopping around on the log in water
 * lane #2. Just cross over this frog to give it a piggyback ride to your
 * home and get an extra 200 points."
 */
export declare function crossingTheLadyFrogPicksHerUp(): Promise<void>;
/**
 * She has to actually turn up: FAQ 7, "You may see a purple frog hopping
 * around on the log in water lane #2."
 */
export declare function aLadyFrogAppearsOnALaneTwoLog(): Promise<void>;
/** A lady frog only ever rides a lane 2 log (FAQ 7). */
export declare function theLadyFrogOnlyRidesLaneTwo(): Promise<void>;
/**
 * FAQ-7p: "if you waste too much time, the things on the river will move
 * quicker so you will have to adjust your strategy accordingly."
 */
export declare function theRiverSpeedsUpWhenYouDawdle(): Promise<void>;
/**
 * FAQ-6.4d: "cars in Lane 4 will travel fast after a specific period of
 * time if they aren't traveling fast already".
 */
export declare function laneFourPicksUpSpeedAfterAWhile(): Promise<void>;
/** A lane already marked fast does not speed up again. */
export declare function aLaneAlreadyFastDoesNotSpeedUpTwice(): Promise<void>;
/** FAQ-7l: the frog cannot wrap around; riding off the edge kills it. */
export declare function ridingOffTheEdgeKillsTheFrog(): Promise<void>;
/** A diving turtle drowns the frog standing on it (FAQ-7g). */
export declare function aDivingTurtleDrownsTheFrog(): Promise<void>;
/** The turtle widths follow the FAQ's set-of-three diagram. */
export declare function aTurtleSetIsThreeCellsWide(): Promise<void>;
/**
 * A diving turtle set warns before it goes under.
 *
 * Reported live 2026-08-31: "we need to animate the crocodiles before they
 * dive so i have a chanse to get off". A set used to snap from solid to gone
 * with no tell at all, so standing on one was a coin flip.
 */
export declare function aDivingSetWarnsBeforeItGoesUnder(): Promise<void>;
/** A set that is only sinking is still solid ground. */
export declare function aSinkingSetIsStillFooting(): Promise<void>;
/** The warning lasts long enough to react to. */
export declare function theWarningIsLongEnoughToHopOff(): Promise<void>;
/**
 * Losing the last frog shows a GAME OVER screen.
 *
 * Reported live: "there is no game over screen in frogger?" - the state was
 * set and nothing ever drew it, so the board simply froze.
 */
export declare function losingTheLastFrogShowsGameOver(): Promise<void>;
/** ...and the prompt blinks. */
export declare function theGameOverPromptBlinks(): Promise<void>;
/**
 * Whether a frog gets home is decided by the cell it is DRAWN on.
 *
 * Reported live 2026-08-31 with a screenshot: "i placed my frog in the
 * second home now and got game over". Riding a log leaves the frog on a
 * fractional x, and a hop used to keep that fraction - so the frog could be
 * drawn on the home's cell and still be judged against a position half a
 * cell away. A hop now lands on a whole cell, which is the one it is drawn
 * on, so what the player sees is what is tested.
 */
export declare function gettingHomeIsDecidedByTheCellTheFrogIsDrawnOn(): Promise<void>;
/** Landing on a cell that is not a home still kills, as the FAQ requires. */
export declare function missingTheHomeByAWholeCellStillKills(): Promise<void>;
/**
 * A hop lands on a whole cell.
 *
 * Checked on open water, where nothing picks the frog up again: riding an
 * object deliberately puts it back on the object's own fractional position,
 * a whole number of cells along it.
 */
export declare function aHopLandsOnAWholeCell(): Promise<void>;
/**
 * A frog standing on the visible end of a log is standing on the log.
 *
 * Reported live: "i jumped to the edge of a log and died... the visible
 * edges of some sprites are not having correct collision detection". The
 * footing test asked whether the frog's LEFT EDGE fell inside the log, but
 * the frog is a whole cell and logs sit at fractional positions drawn to
 * the character - so a frog visibly half-on the end of a log lost the test
 * by a fraction of a cell and drowned. What is drawn and what is ruled
 * have to agree, so the test is now the frog's centre.
 */
export declare function aFrogOnTheVisibleEndOfALogRidesIt(): Promise<void>;
/** Past the halfway point off the end, though, it really is in the water. */
export declare function aFrogMostlyOffTheEndOfALogDrowns(): Promise<void>;
//# sourceMappingURL=hazards.test.d.ts.map