"use strict";
/**
 * A game in a known state, shared by the test files.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createData = createData;
exports.startedLevel = startedLevel;
exports.laneOf = laneOf;
const frogger_game_1 = require("../game/frogger-game");
const constants_1 = require("../game/constants");
function createData() {
    return {
        state: 'menu',
        score: 0,
        lives: constants_1.STARTING_LIVES,
        startingLives: constants_1.STARTING_LIVES,
        level: 1,
        timeRemaining: constants_1.INITIAL_TIME,
        frog: {
            x: Math.floor(constants_1.GRID_WIDTH / 2),
            y: constants_1.GRID_HEIGHT - 1,
            direction: 'up',
            isJumping: false,
            jumpProgress: 0,
            isDead: false,
            deathType: null,
            deathFrame: 0,
            onObject: null,
        },
        lanes: [],
        homes: [],
        homesCompleted: 0,
        vehicleIdCounter: 0,
        riverObjectIdCounter: 0,
        flyTimer: 0,
        alligatorTimer: 0,
        ladyFrogTimer: 0,
        otterTimer: 0,
        snakes: [],
        snakeIdCounter: 0,
        carryingLadyFrog: false,
        furthestRow: constants_1.GRID_HEIGHT - 1,
        hopPointsThisHome: 0,
        extraLifeAwarded: false,
        frogStartTime: Date.now(),
        highscores: [...constants_1.DEFAULT_HIGHSCORES],
        menuSelection: 0,
        playerName: '',
        lastUpdateTime: Date.now(),
        frameCount: 0,
    };
}
/** A started level with no display attached. */
function startedLevel(level = 1) {
    const data = createData();
    data.level = level;
    const game = new frogger_game_1.FroggerGame(data, () => { });
    game.initLevel();
    data.state = 'playing';
    return { game, data };
}
/** The lane carrying the FAQ's road or water lane `n`. */
function laneOf(data, type, n) {
    const lane = data.lanes.find(l => l.type === type && l.lane === n);
    if (!lane)
        throw new Error(`no ${type} lane ${n}`);
    return lane;
}
//# sourceMappingURL=fixture.js.map