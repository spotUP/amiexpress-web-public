"use strict";
/**
 * Scoring (FAQ 6.3) and the lives the cabinet was set to give.
 *
 * Covers FAQ-6.3a, FAQ-6.3b, FAQ-6.3c, FAQ-6.3d, FAQ-6.3e, FAQ-6.3f,
 * FAQ-6.3g, FAQ-6.3h and FAQ-6.3i.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.aForwardHopPaysTen = aForwardHopPaysTen;
exports.hoppingBackwardsPaysNothing = hoppingBackwardsPaysNothing;
exports.aRowPaysOnlyOnce = aRowPaysOnlyOnce;
exports.hopPointsAreCappedPerHome = hopPointsAreCappedPerHome;
exports.reachingHomePaysFiftyPlusTheTimeBonus = reachingHomePaysFiftyPlusTheTimeBonus;
exports.fillingEveryHomePaysAThousand = fillingEveryHomePaysAThousand;
exports.takingTheFlyPaysTwoHundred = takingTheFlyPaysTwoHundred;
exports.carryingTheLadyFrogHomePaysTwoHundred = carryingTheLadyFrogHomePaysTwoHundred;
exports.aFreeFrogArrivesAtTwentyThousand = aFreeFrogArrivesAtTwentyThousand;
exports.theCabinetOffersTheFourLifeSettings = theCabinetOffersTheFourLifeSettings;
exports.everyLevelGivesSixtySeconds = everyLevelGivesSixtySeconds;
exports.theHomeCentreIsWhereTheFrogHasToLand = theHomeCentreIsWhereTheFrogHasToLand;
const assert_1 = __importDefault(require("assert"));
const fixture_1 = require("./fixture");
const constants_1 = require("../game/constants");
/** FAQ-6.3a: "10 points for each forward hop." */
async function aForwardHopPaysTen() {
    const { game, data } = (0, fixture_1.startedLevel)(1);
    const before = data.score;
    game.handleDirection('up');
    assert_1.default.strictEqual(data.score - before, constants_1.SCORES.hop);
}
/** Hopping backwards pays nothing. */
async function hoppingBackwardsPaysNothing() {
    const { game, data } = (0, fixture_1.startedLevel)(1);
    game.handleDirection('up');
    const afterUp = data.score;
    game.handleDirection('down');
    assert_1.default.strictEqual(data.score, afterUp);
}
/**
 * FAQ-6.3b: "Forward Hop: 10 points (max points per home is 100)". A row
 * pays once, so bouncing up and down the same row cannot farm points - it
 * used to pay 10 every time the frog moved up.
 */
async function aRowPaysOnlyOnce() {
    const { game, data } = (0, fixture_1.startedLevel)(1);
    game.handleDirection('up');
    const afterFirst = data.score;
    game.handleDirection('down');
    game.handleDirection('up');
    assert_1.default.strictEqual(data.score, afterFirst, 'the same row should not pay twice');
}
/** ...and one trip cannot earn more than 100 from hopping. */
async function hopPointsAreCappedPerHome() {
    const { game, data } = (0, fixture_1.startedLevel)(1);
    for (let i = 0; i < constants_1.GRID_HEIGHT + 4; i++)
        game.handleDirection('up');
    assert_1.default.ok(data.hopPointsThisHome <= constants_1.SCORES.maxHopPerHome, `hop points for one home should cap at ${constants_1.SCORES.maxHopPerHome}, got ${data.hopPointsThisHome}`);
}
/** FAQ-6.3c and 6.3g: a home pays 50, plus 10 per second left. */
async function reachingHomePaysFiftyPlusTheTimeBonus() {
    const { game, data } = (0, fixture_1.startedLevel)(1);
    data.timeRemaining = 30;
    const before = data.score;
    game.settleFrogInHome(0);
    assert_1.default.strictEqual(data.score - before, constants_1.SCORES.home + 30 * constants_1.SCORES.timeBonus);
}
/** FAQ-6.3d: filling all five homes pays 1,000. */
async function fillingEveryHomePaysAThousand() {
    const { game, data } = (0, fixture_1.startedLevel)(1);
    data.timeRemaining = 0;
    let total = 0;
    for (let i = 0; i < 5; i++) {
        // Each trip starts the clock again, so zero it every time to leave the
        // time bonus out of the comparison.
        data.timeRemaining = 0;
        const before = data.score;
        game.settleFrogInHome(i);
        total += data.score - before;
    }
    assert_1.default.strictEqual(total, 5 * constants_1.SCORES.home + constants_1.SCORES.levelComplete);
}
/** FAQ-6.3f: "Eating a Fly: 200 points". */
async function takingTheFlyPaysTwoHundred() {
    const { game, data } = (0, fixture_1.startedLevel)(1);
    data.timeRemaining = 0;
    data.homes[2].hasFly = true;
    const before = data.score;
    game.settleFrogInHome(2);
    assert_1.default.strictEqual(data.score - before, constants_1.SCORES.home + constants_1.SCORES.fly);
}
/** FAQ-6.3e: "Bringing a Frog to Your Home: 200 points". */
async function carryingTheLadyFrogHomePaysTwoHundred() {
    const { game, data } = (0, fixture_1.startedLevel)(1);
    data.timeRemaining = 0;
    data.carryingLadyFrog = true;
    const before = data.score;
    game.settleFrogInHome(1);
    assert_1.default.strictEqual(data.score - before, constants_1.SCORES.home + constants_1.SCORES.ladyFrog);
    assert_1.default.ok(!data.carryingLadyFrog, 'she gets off at the home');
}
/** FAQ-6.3i: "you get one free frog at 20,000 points". */
async function aFreeFrogArrivesAtTwentyThousand() {
    const { game, data } = (0, fixture_1.startedLevel)(1);
    const lives = data.lives;
    data.score = constants_1.EXTRA_LIFE_SCORE - 1;
    game.update();
    assert_1.default.strictEqual(data.lives, lives, 'nothing below the threshold');
    data.score = constants_1.EXTRA_LIFE_SCORE;
    game.update();
    assert_1.default.strictEqual(data.lives, lives + 1, 'the free frog at 20,000');
    data.score = constants_1.EXTRA_LIFE_SCORE * 3;
    game.update();
    assert_1.default.strictEqual(data.lives, lives + 1, 'and only the one');
}
/** FAQ-6.3h: "You start the game with 3, 5, 7, or 256 lives". */
async function theCabinetOffersTheFourLifeSettings() {
    assert_1.default.deepStrictEqual(constants_1.LIVES_OPTIONS, [3, 5, 7, 256]);
}
/** FAQ-7a: sixty seconds on the clock, whatever the level. */
async function everyLevelGivesSixtySeconds() {
    for (const level of [1, 5, 9, 14]) {
        const { data } = (0, fixture_1.startedLevel)(level);
        assert_1.default.strictEqual(data.timeRemaining, constants_1.INITIAL_TIME, `level ${level}`);
    }
}
/** A home is entered at its exact centre (FAQ-7n), which fixes the offset. */
async function theHomeCentreIsWhereTheFrogHasToLand() {
    const { data } = (0, fixture_1.startedLevel)(1);
    assert_1.default.strictEqual(data.homes.length, constants_1.HOME_POSITIONS.length);
    assert_1.default.strictEqual(data.homes[0].x, constants_1.HOME_POSITIONS[0]);
    assert_1.default.ok(constants_1.HOME_CENTRE_OFFSET >= 0);
}
//# sourceMappingURL=scoring.test.js.map