/**
 * ARKANOID - Hybrid Door Server Component
 *
 * This runs in Node.js and handles:
 * - Highscore persistence to disk
 * - RPC calls from client for save/load operations
 */
interface HighScore {
    name: string;
    score: number;
    level: number;
    date: string;
}
/**
 * Get the highscores file path
 *
 * Exported so a regression test can assert it resolves inside the door's
 * own directory rather than under the backend's cwd.
 */
export declare function getHighscorePath(): string;
/**
 * RPC Handler: Get highscores
 */
export declare function getHighscores(): {
    highscores: HighScore[];
};
/**
 * Slice of the hybrid-door session object the RPC bridge passes as the
 * handler's second argument (door.handler.ts builds it with `bbs` set to
 * the BBSApi). Only emitCustomEvent is used here; everything else is
 * irrelevant to this door.
 */
interface DoorSessionLike {
    user?: {
        username?: string;
    };
    bbs?: {
        emitCustomEvent?: (eventType: string, message: string, data?: Record<string, any>) => void;
    };
}
/**
 * RPC Handler: Save a new highscore
 *
 * Persists to highscores.json, then broadcasts a 'score_submitted' door
 * event - LiveChat shows it, and bbs-event-emitter forwards it to any
 * sysop-configured DOOR_SCORE webhook (Discord/Slack). Same pattern as
 * GrandMaster's score broadcast. The event is strictly best-effort:
 * persistence must succeed even when no session is attached (native runs)
 * or the emitter throws.
 */
export declare function saveHighscore(params: {
    name: string;
    score: number;
    level: number;
}, session?: DoorSessionLike): {
    success: boolean;
};
/**
 * Server component exports for hybrid door
 */
export declare const rpcHandlers: {
    getHighscores: typeof getHighscores;
    saveHighscore: typeof saveHighscore;
};
export default rpcHandlers;
//# sourceMappingURL=server.d.ts.map