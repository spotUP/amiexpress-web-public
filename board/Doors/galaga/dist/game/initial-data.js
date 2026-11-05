"use strict";
/**
 * A fresh galaga game, in the state the door starts it in.
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
        stage: 1,
        shotsHit: 0,
        shotsFired: 0,
        player: {
            x: constants_1.GAME_AREA_WIDTH / 2,
            y: constants_1.GAME_AREA_HEIGHT - 2,
            isDead: false,
            deathFrame: 0,
            hasDualFighter: false,
            isCaptured: false,
        },
        aliens: [],
        bullets: [],
        explosions: [],
        stars: [],
        formation: [],
        formationOffset: 0,
        formationDirection: 1,
        alienIdCounter: 0,
        bulletIdCounter: 0,
        explosionIdCounter: 0,
        spawnPhase: 0,
        aliensToSpawn: [],
        isChallengingStage: false,
        challengingKills: 0,
        challengingTotal: 40,
        capturedFighterAlienId: null,
        tractorBeamTimer: 0,
        highscores: [...constants_1.DEFAULT_HIGHSCORES],
        menuSelection: 0,
        playerName: "",
        lastUpdateTime: Date.now(),
        frameCount: 0,
        stageIntroTimer: 0,
    };
}
//# sourceMappingURL=initial-data.js.map