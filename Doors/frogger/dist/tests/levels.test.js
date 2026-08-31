"use strict";
/**
 * The level table and what it builds (FAQ 6.4), and which way things travel
 * (FAQ 7).
 *
 * Covers FAQ-6b, FAQ-6c, FAQ-6d, FAQ-6.4a, FAQ-6.4b, FAQ-6.4c, FAQ-6.4e,
 * FAQ-6.4f, FAQ-6.4g, FAQ-6.4h, FAQ-6.4j, FAQ-6.4k, FAQ-7c and FAQ-7d.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.levelsRepeatInFiveLevelBlocks = levelsRepeatInFiveLevelBlocks;
exports.theFirstFiveLevelsAreTheirOwnRows = theFirstFiveLevelsAreTheirOwnRows;
exports.eachRoadLaneCarriesTheTablesCarCount = eachRoadLaneCarriesTheTablesCarCount;
exports.laterLevelsAreBusierOnTheRoadAndBarerOnTheWater = laterLevelsAreBusierOnTheRoadAndBarerOnTheWater;
exports.eachWaterLaneCarriesTheTablesCount = eachWaterLaneCarriesTheTablesCount;
exports.eachLaneCarriesItsOwnSizeOfLog = eachLaneCarriesItsOwnSizeOfLog;
exports.eachTurtleLaneHasExactlyOneDivingSet = eachTurtleLaneHasExactlyOneDivingSet;
exports.theFirstLevelIsAllTurtlesAndLogs = theFirstLevelIsAllTurtlesAndLogs;
exports.everyNthLogInLaneFiveIsACrocodile = everyNthLogInLaneFiveIsACrocodile;
exports.laneFiveIsACrocodileOnLevelsFiveAndTen = laneFiveIsACrocodileOnLevelsFiveAndTen;
exports.snakesArriveAtLevelsThreeAndSeven = snakesArriveAtLevelsThreeAndSeven;
exports.theRoadLanesAlternateLikeTheArcade = theRoadLanesAlternateLikeTheArcade;
exports.theWaterLanesAlternateTheFaqsWay = theWaterLanesAlternateTheFaqsWay;
exports.laneFourFollowsTheTablesFastOrSlow = laneFourFollowsTheTablesFastOrSlow;
const assert_1 = __importDefault(require("assert"));
const fixture_1 = require("./fixture");
const constants_1 = require("../game/constants");
/**
 * FAQ-6.4a: "All levels after Level 6 repeat in five level blocks. This
 * means that levels 6-10, 11-15, 16-20, etc. are all the same."
 */
async function levelsRepeatInFiveLevelBlocks() {
    for (let i = 0; i < constants_1.BLOCK_LENGTH; i++) {
        const first = (0, constants_1.getLevelConfig)(constants_1.BLOCK_START + i);
        const second = (0, constants_1.getLevelConfig)(constants_1.BLOCK_START + i + constants_1.BLOCK_LENGTH);
        const third = (0, constants_1.getLevelConfig)(constants_1.BLOCK_START + i + constants_1.BLOCK_LENGTH * 2);
        assert_1.default.deepStrictEqual(second, first, `level ${constants_1.BLOCK_START + i + constants_1.BLOCK_LENGTH}`);
        assert_1.default.deepStrictEqual(third, first, `level ${constants_1.BLOCK_START + i + constants_1.BLOCK_LENGTH * 2}`);
    }
}
/** The first five levels are their own rows of the table. */
async function theFirstFiveLevelsAreTheirOwnRows() {
    for (let level = 1; level <= 5; level++) {
        assert_1.default.strictEqual((0, constants_1.getLevelConfig)(level).level, level);
    }
}
/** FAQ-6.4b: the car counts per road lane come from the table. */
async function eachRoadLaneCarriesTheTablesCarCount() {
    for (const level of [1, 2, 5, 8]) {
        const { data } = (0, fixture_1.startedLevel)(level);
        const config = (0, constants_1.getLevelConfig)(level);
        for (let n = 1; n <= 5; n++) {
            assert_1.default.strictEqual((0, fixture_1.laneOf)(data, 'road', n).objects.length, config.cars[n - 1], `level ${level}, road lane ${n}`);
        }
    }
}
/**
 * FAQ-6b/6c: level 5 is busier on the road and barer on the water than
 * level 1 - "the cars become more numerous and faster. The turtles and logs
 * in the river become scarcer".
 */
async function laterLevelsAreBusierOnTheRoadAndBarerOnTheWater() {
    const one = (0, fixture_1.startedLevel)(1).data;
    const five = (0, fixture_1.startedLevel)(5).data;
    const cars = (d) => d.lanes.filter(l => l.type === 'road').reduce((n, l) => n + l.objects.length, 0);
    const footing = (d) => d.lanes.filter(l => l.type === 'water').reduce((n, l) => n + l.objects.length, 0);
    assert_1.default.ok(cars(five) > cars(one), 'level 5 should have more cars');
    assert_1.default.ok(footing(five) < footing(one), 'level 5 should have less to stand on');
}
/** FAQ-6.4e: the water lane counts come from the table too. */
async function eachWaterLaneCarriesTheTablesCount() {
    for (const level of [1, 3, 7]) {
        const { data } = (0, fixture_1.startedLevel)(level);
        const config = (0, constants_1.getLevelConfig)(level);
        assert_1.default.strictEqual((0, fixture_1.laneOf)(data, 'water', 1).objects.length, config.turtleSets[0], `L${level} water 1`);
        assert_1.default.strictEqual((0, fixture_1.laneOf)(data, 'water', 2).objects.length, config.shortLogs, `L${level} water 2`);
        assert_1.default.strictEqual((0, fixture_1.laneOf)(data, 'water', 3).objects.length, config.longLogs, `L${level} water 3`);
        assert_1.default.strictEqual((0, fixture_1.laneOf)(data, 'water', 4).objects.length, config.turtleSets[1], `L${level} water 4`);
        assert_1.default.strictEqual((0, fixture_1.laneOf)(data, 'water', 5).objects.length, config.mediumLogs, `L${level} water 5`);
    }
}
/**
 * FAQ-6.4g: the logs differ by lane - "#S = NUMBER OF SHORT LOGS IN WATER
 * LANE #2", "#L = ... LONG LOGS IN WATER LANE #3", "#M = ... MEDIUM LOGS IN
 * WATER LANE #5".
 */
async function eachLaneCarriesItsOwnSizeOfLog() {
    const { data } = (0, fixture_1.startedLevel)(1);
    const width = (n) => (0, fixture_1.laneOf)(data, 'water', n).objects[0].width;
    assert_1.default.strictEqual(width(2), constants_1.OBJECT_WIDTHS.shortLog, 'lane 2 is short logs');
    assert_1.default.strictEqual(width(3), constants_1.OBJECT_WIDTHS.longLog, 'lane 3 is long logs');
    assert_1.default.strictEqual(width(5), constants_1.OBJECT_WIDTHS.mediumLog, 'lane 5 is medium logs');
    // Asserted against the constants above, which would pass even if all three
    // were the same number - so assert the ordering the FAQ's own names imply
    // as well: short, then medium, then long.
    assert_1.default.ok(width(2) < width(5) && width(5) < width(3), `short (${width(2)}) < medium (${width(5)}) < long (${width(3)})`);
}
/**
 * FAQ-6.4f: "#D = NUMBER OF SETS OF TURTLES ALONG WITH THE SET OF DIVING
 * TURTLES IN WATER LANES #1 AND #4" - one set per lane dives, not all of
 * them and not none.
 */
async function eachTurtleLaneHasExactlyOneDivingSet() {
    const { data } = (0, fixture_1.startedLevel)(2);
    for (const n of [1, 4]) {
        const turtles = (0, fixture_1.laneOf)(data, 'water', n).objects;
        assert_1.default.ok(turtles.every(t => t.type === 'turtle'), `lane ${n} should be turtles`);
        const diving = turtles.filter(t => t.canDive).length;
        assert_1.default.strictEqual(diving, 1, `lane ${n} should have exactly one diving set`);
    }
}
/** Level 1 has no diving at all until the table introduces it. */
async function theFirstLevelIsAllTurtlesAndLogs() {
    const { data } = (0, fixture_1.startedLevel)(1);
    const crocs = data.lanes
        .filter(l => l.type === 'water')
        .flatMap(l => l.objects)
        .filter(o => o.type === 'crocodile');
    assert_1.default.strictEqual(crocs.length, 0, 'no crocodile before level 2');
    assert_1.default.strictEqual(data.snakes.length, 0, 'no snake before level 3');
}
/**
 * FAQ-6.4j: "EVERY 5TH LOG IN LANE #5 A CROCODILE" on level 2, every 3rd on
 * level 3, every 2nd on level 4.
 */
async function everyNthLogInLaneFiveIsACrocodile() {
    for (const level of [3, 4]) {
        const { data } = (0, fixture_1.startedLevel)(level);
        const config = (0, constants_1.getLevelConfig)(level);
        const objects = (0, fixture_1.laneOf)(data, 'water', 5).objects;
        const expected = objects.filter((_, i) => (i + 1) % (config.crocEveryNth ?? 0) === 0).length;
        const crocs = objects.filter(o => o.type === 'crocodile').length;
        assert_1.default.strictEqual(crocs, expected, `level ${level}: every ${config.crocEveryNth}th of ${objects.length} should be a crocodile`);
    }
}
/** FAQ-6.4h: on levels 5 and 10 water lane 5 is a crocodile, not logs. */
async function laneFiveIsACrocodileOnLevelsFiveAndTen() {
    for (const level of [5, 10]) {
        const { data } = (0, fixture_1.startedLevel)(level);
        const objects = (0, fixture_1.laneOf)(data, 'water', 5).objects;
        assert_1.default.ok(objects.length > 0, `level ${level} lane 5 should not be empty`);
        assert_1.default.ok(objects.every(o => o.type === 'crocodile'), `level ${level} lane 5 should be crocodiles, found ${objects.map(o => o.type).join(',')}`);
    }
}
/**
 * FAQ-6.4k: one snake from level 3, a second from level 7.
 *
 * Counted across BOTH places a snake can be, because FAQ 6.4 says "Snakes
 * appear randomly in either the median, log, or both places" - so the split
 * varies from level to level, but the total does not.
 */
async function snakesArriveAtLevelsThreeAndSeven() {
    assert_1.default.strictEqual(totalSnakes(2), 0, 'no snake before level 3');
    assert_1.default.strictEqual(totalSnakes(3), 1, 'one snake from level 3');
    assert_1.default.strictEqual(totalSnakes(7), 2, 'a second from level 7');
}
/** Every snake on one built level, in the median and riding the logs. */
function totalSnakes(level) {
    const { data } = (0, fixture_1.startedLevel)(level);
    const onLogs = data.lanes
        .filter(l => l.type === 'water')
        .flatMap(l => l.objects)
        .filter(o => o.snakeAt !== null && o.snakeAt !== undefined).length;
    return data.snakes.length + onLogs;
}
/**
 * A recorded DEPARTURE from the FAQ.
 *
 * FAQ 7 says "the cars travel on the roadway from left to right", and every
 * road lane was built that way. The arcade does not do that: its road lanes
 * ALTERNATE, which is the entire reason the same FAQ can go on to advise
 * "try to find 'lanes' in between the vehicles" and warn about being
 * trapped. Traffic that all runs one way makes gaps line up into a single
 * moving column instead of the shifting grid the game is built around.
 *
 * Reported 2026-08-31: "all car lanes drive in the same direction thats not
 * how it should be, the original frogger has different directions."
 *
 * The rule is the FAQ's OWN water rule applied to the road, which is what
 * the arcade does: odd lanes right to left, even lanes left to right. Lane 1
 * is the bottom row nearest the start bank, and it runs right to left, as
 * the arcade's first row of cars does.
 */
async function theRoadLanesAlternateLikeTheArcade() {
    const { data } = (0, fixture_1.startedLevel)(1);
    for (const n of [1, 3, 5]) {
        assert_1.default.strictEqual((0, fixture_1.laneOf)(data, 'road', n).direction, -1, `road lane ${n} should run right to left`);
    }
    for (const n of [2, 4]) {
        assert_1.default.strictEqual((0, fixture_1.laneOf)(data, 'road', n).direction, 1, `road lane ${n} should run left to right`);
    }
    // The point of the change: neighbouring lanes must oppose each other, so
    // gaps shift rather than travelling together as one column.
    const roads = data.lanes
        .filter(l => l.type === 'road')
        .sort((a, b) => a.lane - b.lane);
    for (let i = 1; i < roads.length; i++) {
        assert_1.default.notStrictEqual(roads[i].direction, roads[i - 1].direction, `road lanes ${roads[i - 1].lane} and ${roads[i].lane} run the same way`);
    }
}
/**
 * FAQ-7d: "Lanes #1, #3, and #5 go from right to left. Lanes #2 and #4 go
 * from left to right." Every water lane used to run the opposite way.
 */
async function theWaterLanesAlternateTheFaqsWay() {
    const { data } = (0, fixture_1.startedLevel)(1);
    for (const n of [1, 3, 5]) {
        assert_1.default.strictEqual((0, fixture_1.laneOf)(data, 'water', n).direction, -1, `water lane ${n} runs right to left`);
    }
    for (const n of [2, 4]) {
        assert_1.default.strictEqual((0, fixture_1.laneOf)(data, 'water', n).direction, 1, `water lane ${n} runs left to right`);
    }
}
/** FAQ-6.4c: lane 4's speed follows the table's F/S. */
async function laneFourFollowsTheTablesFastOrSlow() {
    const fast = (0, fixture_1.startedLevel)(1); // 1F
    const slow = (0, fixture_1.startedLevel)(3); // 2S
    const speedOf = (s) => Math.abs((0, fixture_1.laneOf)(s.data, 'road', 4).speed);
    assert_1.default.ok(speedOf(fast) > speedOf(slow), `level 1's lane 4 is marked fast and level 3's slow, got ${speedOf(fast)} and ${speedOf(slow)}`);
}
//# sourceMappingURL=levels.test.js.map