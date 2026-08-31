"use strict";
/**
 * A fresh pengo game, in the state the door starts it in.
 *
 * Lifted out of index.ts so the tests can build a real game without
 * importing the door - importing index.ts constructs a blessed Screen and
 * a Door, neither of which belongs in a unit test. One definition, two
 * callers.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInitialGameData = createInitialGameData;
const constants_1 = require("./constants");
function createInitialGameData() {
    return {
        state: "menu",
        score: 0,
        lives: constants_1.STARTING_LIVES,
        level: 1,
        timeRemaining: constants_1.INITIAL_TIME,
        pengo: {
            x: 7,
            y: 6,
            direction: "up",
            isPushing: false,
            pushFrame: 0,
            isDead: false,
            deathFrame: 0,
        },
        enemies: [],
        grid: [],
        eggs: [],
        diamondsAligned: false,
        enemyIdCounter: 0,
        highscores: [...constants_1.DEFAULT_HIGHSCORES],
        menuSelection: 0,
        playerName: "",
        lastUpdateTime: Date.now(),
        frameCount: 0,
    };
}
//# sourceMappingURL=initial-data.js.map