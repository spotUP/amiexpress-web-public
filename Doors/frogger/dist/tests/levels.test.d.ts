/**
 * The level table and what it builds (FAQ 6.4), and which way things travel
 * (FAQ 7).
 *
 * Covers FAQ-6b, FAQ-6c, FAQ-6d, FAQ-6.4a, FAQ-6.4b, FAQ-6.4c, FAQ-6.4e,
 * FAQ-6.4f, FAQ-6.4g, FAQ-6.4h, FAQ-6.4j, FAQ-6.4k, FAQ-7c and FAQ-7d.
 */
/**
 * FAQ-6.4a: "All levels after Level 6 repeat in five level blocks. This
 * means that levels 6-10, 11-15, 16-20, etc. are all the same."
 */
export declare function levelsRepeatInFiveLevelBlocks(): Promise<void>;
/** The first five levels are their own rows of the table. */
export declare function theFirstFiveLevelsAreTheirOwnRows(): Promise<void>;
/** FAQ-6.4b: the car counts per road lane come from the table. */
export declare function eachRoadLaneCarriesTheTablesCarCount(): Promise<void>;
/**
 * FAQ-6b/6c: level 5 is busier on the road and barer on the water than
 * level 1 - "the cars become more numerous and faster. The turtles and logs
 * in the river become scarcer".
 */
export declare function laterLevelsAreBusierOnTheRoadAndBarerOnTheWater(): Promise<void>;
/** FAQ-6.4e: the water lane counts come from the table too. */
export declare function eachWaterLaneCarriesTheTablesCount(): Promise<void>;
/**
 * FAQ-6.4g: the logs differ by lane - "#S = NUMBER OF SHORT LOGS IN WATER
 * LANE #2", "#L = ... LONG LOGS IN WATER LANE #3", "#M = ... MEDIUM LOGS IN
 * WATER LANE #5".
 */
export declare function eachLaneCarriesItsOwnSizeOfLog(): Promise<void>;
/**
 * FAQ-6.4f: "#D = NUMBER OF SETS OF TURTLES ALONG WITH THE SET OF DIVING
 * TURTLES IN WATER LANES #1 AND #4" - one set per lane dives, not all of
 * them and not none.
 */
export declare function eachTurtleLaneHasExactlyOneDivingSet(): Promise<void>;
/** Level 1 has no diving at all until the table introduces it. */
export declare function theFirstLevelIsAllTurtlesAndLogs(): Promise<void>;
/**
 * FAQ-6.4j: "EVERY 5TH LOG IN LANE #5 A CROCODILE" on level 2, every 3rd on
 * level 3, every 2nd on level 4.
 */
export declare function everyNthLogInLaneFiveIsACrocodile(): Promise<void>;
/** FAQ-6.4h: on levels 5 and 10 water lane 5 is a crocodile, not logs. */
export declare function laneFiveIsACrocodileOnLevelsFiveAndTen(): Promise<void>;
/**
 * FAQ-6.4k: one snake from level 3, a second from level 7.
 *
 * Counted across BOTH places a snake can be, because FAQ 6.4 says "Snakes
 * appear randomly in either the median, log, or both places" - so the split
 * varies from level to level, but the total does not.
 */
export declare function snakesArriveAtLevelsThreeAndSeven(): Promise<void>;
/**
 * FAQ-7c: "the cars travel on the roadway from left to right".
 */
export declare function everyRoadLaneRunsLeftToRight(): Promise<void>;
/**
 * FAQ-7d: "Lanes #1, #3, and #5 go from right to left. Lanes #2 and #4 go
 * from left to right." Every water lane used to run the opposite way.
 */
export declare function theWaterLanesAlternateTheFaqsWay(): Promise<void>;
/** FAQ-6.4c: lane 4's speed follows the table's F/S. */
export declare function laneFourFollowsTheTablesFastOrSlow(): Promise<void>;
//# sourceMappingURL=levels.test.d.ts.map