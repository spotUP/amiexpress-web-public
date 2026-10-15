/**
 * A fresh joust game, in the state the door starts it in.
 *
 * Lifted out of index.ts so the tests can build a real game without
 * importing the door - importing index.ts constructs a blessed Screen and
 * a Door, neither of which belongs in a unit test. One definition, two
 * callers.
 */
import { DEFAULT_HIGHSCORES, LAVA_PITS, STANDARD_PLATFORMS, STARTING_LIVES, } from './constants';
export function createInitialGameData() {
    return {
        state: "menu",
        score: 0,
        lives: STARTING_LIVES,
        wave: 1,
        player: {
            x: 10,
            y: 16,
            vx: 0,
            vy: 0,
            direction: "right",
            mount: "ostrich",
            isFlapping: false,
            flapFrame: 0,
            isWalking: false,
            walkFrame: 0,
            isAlive: true,
            respawnTimer: 0,
            invincibleTimer: 0,
        },
        enemies: [],
        eggs: [],
        pterodactyl: {
            x: -10,
            y: 10,
            vx: 0,
            vy: 0,
            isActive: false,
            targetPlayer: false,
            mouthOpen: false,
            mouthTimer: 0,
        },
        platforms: [...STANDARD_PLATFORMS],
        lavaPits: [...LAVA_PITS],
        enemyIdCounter: 0,
        eggIdCounter: 0,
        waveTimer: 0,
        survivalBonus: 0,
        highscores: [...DEFAULT_HIGHSCORES],
        menuSelection: 0,
        playerName: "",
        lastUpdateTime: Date.now(),
        frameCount: 0,
    };
}
