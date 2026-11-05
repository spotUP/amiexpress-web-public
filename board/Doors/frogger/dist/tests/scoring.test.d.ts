/**
 * Scoring (FAQ 6.3) and the lives the cabinet was set to give.
 *
 * Covers FAQ-6.3a, FAQ-6.3b, FAQ-6.3c, FAQ-6.3d, FAQ-6.3e, FAQ-6.3f,
 * FAQ-6.3g, FAQ-6.3h and FAQ-6.3i.
 */
/** FAQ-6.3a: "10 points for each forward hop." */
export declare function aForwardHopPaysTen(): Promise<void>;
/** Hopping backwards pays nothing. */
export declare function hoppingBackwardsPaysNothing(): Promise<void>;
/**
 * FAQ-6.3b: "Forward Hop: 10 points (max points per home is 100)". A row
 * pays once, so bouncing up and down the same row cannot farm points - it
 * used to pay 10 every time the frog moved up.
 */
export declare function aRowPaysOnlyOnce(): Promise<void>;
/** ...and one trip cannot earn more than 100 from hopping. */
export declare function hopPointsAreCappedPerHome(): Promise<void>;
/** FAQ-6.3c and 6.3g: a home pays 50, plus 10 per second left. */
export declare function reachingHomePaysFiftyPlusTheTimeBonus(): Promise<void>;
/** FAQ-6.3d: filling all five homes pays 1,000. */
export declare function fillingEveryHomePaysAThousand(): Promise<void>;
/** FAQ-6.3f: "Eating a Fly: 200 points". */
export declare function takingTheFlyPaysTwoHundred(): Promise<void>;
/** FAQ-6.3e: "Bringing a Frog to Your Home: 200 points". */
export declare function carryingTheLadyFrogHomePaysTwoHundred(): Promise<void>;
/** FAQ-6.3i: "you get one free frog at 20,000 points". */
export declare function aFreeFrogArrivesAtTwentyThousand(): Promise<void>;
/** FAQ-6.3h: "You start the game with 3, 5, 7, or 256 lives". */
export declare function theCabinetOffersTheFourLifeSettings(): Promise<void>;
/** FAQ-7a: sixty seconds on the clock, whatever the level. */
export declare function everyLevelGivesSixtySeconds(): Promise<void>;
/** A home is entered at its exact centre (FAQ-7n), which fixes the offset. */
export declare function theHomeCentreIsWhereTheFrogHasToLand(): Promise<void>;
//# sourceMappingURL=scoring.test.d.ts.map