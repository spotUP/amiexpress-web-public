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
//# sourceMappingURL=hazards.test.d.ts.map