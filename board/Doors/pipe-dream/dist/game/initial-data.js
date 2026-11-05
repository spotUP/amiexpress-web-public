/**
 * A fresh pipe-dream game, in the state the door starts it in.
 *
 * Lifted out of index.ts so the tests can build a real game without
 * importing the door - importing index.ts constructs a blessed Screen and
 * a Door, neither of which belongs in a unit test. One definition, two
 * callers.
 */
import { DEFAULT_HIGHSCORES, QUEUE_SIZE, } from './constants';
export function createInitialGameData() {
    return {
        state: "menu",
        score: 0,
        level: 1,
        pipesUsed: 0,
        grid: [],
        cursor: { x: 3, y: 2 },
        pipeQueue: [],
        queueSize: QUEUE_SIZE,
        flowState: null,
        flowStarted: false,
        flowTimer: 0,
        flowDelay: 50,
        startX: 0,
        startY: 2,
        startDirection: "right",
        endX: 6,
        endY: 2,
        hasEnd: false,
        reachedEnd: false,
        requiredPipes: 8,
        highscores: [...DEFAULT_HIGHSCORES],
        menuSelection: 0,
        playerName: "",
        lastUpdateTime: Date.now(),
        frameCount: 0,
    };
}
