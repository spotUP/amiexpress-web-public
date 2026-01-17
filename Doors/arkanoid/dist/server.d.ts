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
 * RPC Handler: Get highscores
 */
export declare function getHighscores(): {
    highscores: HighScore[];
};
/**
 * RPC Handler: Save a new highscore
 */
export declare function saveHighscore(params: {
    name: string;
    score: number;
    level: number;
}): {
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