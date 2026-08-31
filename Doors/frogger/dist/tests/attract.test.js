"use strict";
/**
 * Attract mode: the title, the point table, the score ranking, the
 * invitation, and the machine playing itself.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.theTitleSpellsFrogger = theTitleSpellsFrogger;
exports.theTitleIsShaded = theTitleIsShaded;
exports.thePointTableListsWhatTheGamePays = thePointTableListsWhatTheGamePays;
exports.theRankingListsTheTopFiveInOrder = theRankingListsTheTopFiveInOrder;
exports.theInvitationNamesTheLivesSetting = theInvitationNamesTheLivesSetting;
exports.theInvitationAsksForAKeyNotACoin = theInvitationAsksForAKeyNotACoin;
exports.theInvitationBlinks = theInvitationBlinks;
exports.theCreditNamesKonamiWithoutClaimingTheirCopyright = theCreditNamesKonamiWithoutClaimingTheirCopyright;
exports.thePhasesRotateAndWrap = thePhasesRotateAndWrap;
exports.everyPanelCarriesTheTitleExceptTheDemo = everyPanelCarriesTheTitleExceptTheDemo;
exports.everyPhaseHasADuration = everyPhaseHasADuration;
exports.theDemoPlaysTheGame = theDemoPlaysTheGame;
exports.theDemoWillNotHopIntoACar = theDemoWillNotHopIntoACar;
exports.theDemoHopsWhenTheRoadIsClear = theDemoHopsWhenTheRoadIsClear;
exports.theDemoWillNotHopIntoWater = theDemoWillNotHopIntoWater;
exports.theDemoStartsOnTheBank = theDemoStartsOnTheBank;
const assert_1 = __importDefault(require("assert"));
const fixture_1 = require("./fixture");
const attract_1 = require("../game/attract");
const constants_1 = require("../game/constants");
const WIDTH = 80;
/** Strip blessed's colour tags, leaving the words. */
function plain(lines) {
    return lines.join('\n').replace(/\{[^}]*\}/g, '');
}
/** The title spells FROGGER in a block font. */
async function theTitleSpellsFrogger() {
    const grid = (0, attract_1.titleGrid)();
    assert_1.default.strictEqual(grid.length, 5, 'the block font is five rows tall');
    assert_1.default.ok(grid.every(row => row.includes('#')), 'every row of the title should have something in it');
    // Seven letters, so seven runs of filled columns across the widest row.
    const columns = new Set();
    for (const row of grid) {
        for (let c = 0; c < row.length; c++)
            if (row[c] === '#')
                columns.add(c);
    }
    let runs = 0;
    let inRun = false;
    const maxCol = Math.max(...columns);
    for (let c = 0; c <= maxCol + 1; c++) {
        const filled = columns.has(c);
        if (filled && !inRun)
            runs++;
        inRun = filled;
    }
    assert_1.default.strictEqual(runs, 'FROGGER'.length, `expected seven letters, found ${runs}`);
}
/** The title carries the arcade's yellow shading beside the green. */
async function theTitleIsShaded() {
    const grid = (0, attract_1.titleGrid)();
    const shaded = grid.some(row => row.includes('+'));
    assert_1.default.ok(shaded, 'the letters should have a shaded edge');
    const painted = (0, attract_1.attractScreen)('points', (0, fixture_1.createData)(), WIDTH, 0).join('\n');
    assert_1.default.ok(painted.includes('{green-fg}'), 'the face of the letters is green');
    assert_1.default.ok(painted.includes('{yellow-fg}'), 'the shading is yellow');
}
/**
 * The point table quotes the four scoring rules, and quotes the numbers the
 * game actually pays rather than hard-coded ones.
 */
async function thePointTableListsWhatTheGamePays() {
    const text = plain((0, attract_1.pointTablePanel)(WIDTH));
    assert_1.default.ok(text.includes('POINT TABLE'), 'it is headed POINT TABLE');
    assert_1.default.ok(text.includes(`${constants_1.SCORES.hop} PTS FOR EACH STEP`), 'the hop');
    assert_1.default.ok(text.includes(`${constants_1.SCORES.home} PTS FOR EVERY FROG`), 'the home');
    assert_1.default.ok(text.includes(`${constants_1.SCORES.levelComplete} PTS BY SAVING FROGS`), 'the level');
    assert_1.default.ok(text.includes(`${constants_1.SCORES.timeBonus} PTS X REMAINING SECOND`), 'the time bonus');
}
/** The ranking lists five places, highest score first. */
async function theRankingListsTheTopFiveInOrder() {
    const data = (0, fixture_1.createData)();
    data.highscores = [
        { name: 'AAA', score: 1270, level: 1, date: '' },
        { name: 'BBB', score: 4630, level: 5, date: '' },
        { name: 'CCC', score: 1970, level: 2, date: '' },
        { name: 'DDD', score: 2050, level: 3, date: '' },
        { name: 'EEE', score: 1580, level: 2, date: '' },
    ];
    const text = plain((0, attract_1.rankingPanel)(data, WIDTH));
    assert_1.default.ok(text.includes('SCORE RANKING'), 'it is headed SCORE RANKING');
    for (const place of ['1 ST', '2 ND', '3 RD', '4 TH', '5 TH']) {
        assert_1.default.ok(text.includes(place), `place ${place} is listed`);
    }
    const order = ['04630', '02050', '01970', '01580', '01270'];
    let at = -1;
    for (const score of order) {
        const found = text.indexOf(score);
        assert_1.default.ok(found > at, `${score} should come after the score above it`);
        at = found;
    }
}
/** The invitation names the lives setting rather than a fixed number. */
async function theInvitationNamesTheLivesSetting() {
    for (const lives of constants_1.LIVES_OPTIONS) {
        const data = (0, fixture_1.createData)();
        data.startingLives = lives;
        const text = plain((0, attract_1.invitePanel)(data, WIDTH, true));
        assert_1.default.ok(text.includes(`${lives} FROGS PER PLAYER`), `with ${lives} lives set it should say so, got: ${text.trim()}`);
    }
}
/** ...and asks for a key, because a BBS door has no coin slot. */
async function theInvitationAsksForAKeyNotACoin() {
    const text = plain((0, attract_1.invitePanel)((0, fixture_1.createData)(), WIDTH, true));
    assert_1.default.ok(text.includes('PRESS ANY KEY'), 'it asks for a key');
    assert_1.default.ok(!text.includes('INSERT COIN'), 'and not for a coin');
}
/** The invitation blinks. */
async function theInvitationBlinks() {
    const data = (0, fixture_1.createData)();
    const on = plain((0, attract_1.attractScreen)('invite', data, WIDTH, 0));
    const off = plain((0, attract_1.attractScreen)('invite', data, WIDTH, attract_1.ATTRACT_BLINK_FRAMES));
    assert_1.default.ok(on.includes('PRESS ANY KEY'), 'showing on the first frame');
    assert_1.default.ok(!off.includes('PRESS ANY KEY'), 'and gone a blink later');
}
/** The credit goes to Konami without claiming their copyright for us. */
async function theCreditNamesKonamiWithoutClaimingTheirCopyright() {
    const text = plain([(0, attract_1.creditLine)(WIDTH)]);
    assert_1.default.ok(text.includes('KONAMI'), 'Konami are credited');
    assert_1.default.ok(text.includes('1981'), 'with the year');
    assert_1.default.ok(!text.includes('(C)'), 'but this port does not carry their copyright notice');
}
/** The phases rotate in order and wrap round. */
async function thePhasesRotateAndWrap() {
    let phase = attract_1.ATTRACT_ORDER[0];
    const seen = [phase];
    for (let i = 1; i < attract_1.ATTRACT_ORDER.length; i++) {
        phase = (0, attract_1.nextPhase)(phase);
        seen.push(phase);
    }
    assert_1.default.deepStrictEqual(seen, attract_1.ATTRACT_ORDER);
    assert_1.default.strictEqual((0, attract_1.nextPhase)(phase), attract_1.ATTRACT_ORDER[0], 'and it wraps');
}
/** Every panel carries the title and the credit; the demo carries neither. */
async function everyPanelCarriesTheTitleExceptTheDemo() {
    for (const phase of attract_1.ATTRACT_ORDER) {
        const lines = (0, attract_1.attractScreen)(phase, (0, fixture_1.createData)(), WIDTH, 0);
        if (phase === 'demo') {
            assert_1.default.strictEqual(lines.length, 0, 'the demo plays the game instead');
            continue;
        }
        const text = plain(lines);
        assert_1.default.ok(text.includes('KONAMI'), `${phase} carries the credit`);
        assert_1.default.ok(lines.length > 5, `${phase} carries the title`);
    }
}
/** Each phase holds for a sensible while. */
async function everyPhaseHasADuration() {
    for (const phase of attract_1.ATTRACT_ORDER) {
        assert_1.default.ok(attract_1.ATTRACT_FRAMES[phase] > 0, `${phase} needs a duration`);
    }
    assert_1.default.ok(attract_1.ATTRACT_FRAMES.demo > attract_1.ATTRACT_FRAMES.invite, 'the demo runs longer than a panel');
}
/**
 * The demo actually plays: from the bank, it works its way up the board.
 */
async function theDemoPlaysTheGame() {
    const { game, data } = (0, fixture_1.startedLevel)(1);
    const startY = data.frog.y;
    let best = startY;
    for (let i = 0; i < 600; i++) {
        game.demoStep();
        game.update();
        best = Math.min(best, data.frog.y);
        if (data.state !== 'playing')
            break;
    }
    assert_1.default.ok(best < startY, `the demo should get off the bank; it reached row ${best} from ${startY}`);
}
/**
 * The demo will not hop into a car.
 *
 * Asserted by putting one exactly where it wants to go, rather than by
 * playing on and hoping: level 1 has three cars in forty cells, so a demo
 * that ignores traffic entirely still usually survives a few seconds.
 */
async function theDemoWillNotHopIntoACar() {
    const { game, data } = (0, fixture_1.startedLevel)(1);
    // The road lane directly above the bank.
    const road = data.lanes.find(l => l.type === 'road' && l.y === data.frog.y - 1);
    assert_1.default.ok(road, 'there should be a road lane above the start');
    // One car, sitting on the cell the demo would hop into.
    road.objects = [{
            id: 99, type: 'car', x: data.frog.x, y: road.y,
            lane: road.lane, width: 2, speed: road.speed,
        }];
    const before = data.frog.y;
    game.demoStep();
    assert_1.default.strictEqual(data.frog.y, before, 'it should wait, not hop into the car');
}
/** With the lane clear, it hops. */
async function theDemoHopsWhenTheRoadIsClear() {
    const { game, data } = (0, fixture_1.startedLevel)(1);
    const road = data.lanes.find(l => l.type === 'road' && l.y === data.frog.y - 1);
    road.objects = [];
    const before = data.frog.y;
    game.demoStep();
    assert_1.default.strictEqual(data.frog.y, before - 1, 'a clear road should be taken');
}
/** It will not hop into open water either. */
async function theDemoWillNotHopIntoWater() {
    const { game, data } = (0, fixture_1.startedLevel)(1);
    const water = data.lanes.find(l => l.type === 'water' && l.lane === 1);
    assert_1.default.ok(water, 'there should be a first water lane');
    // Stand it on the median with nothing to jump to.
    const median = data.lanes.find(l => l.type === 'safe' && l.y === water.y + 1);
    assert_1.default.ok(median, 'the median sits below water lane 1');
    data.frog.y = median.y;
    data.frog.x = 20;
    water.objects = [];
    const before = data.frog.y;
    game.demoStep();
    assert_1.default.strictEqual(data.frog.y, before, 'no footing means no hop');
}
/** A demo game is a game like any other: it starts on the bank. */
async function theDemoStartsOnTheBank() {
    const { data } = (0, fixture_1.startedLevel)(1);
    assert_1.default.strictEqual(data.frog.y, constants_1.GRID_HEIGHT - 1);
}
//# sourceMappingURL=attract.test.js.map