/**
 * Super Qix - Server RPC Handlers
 * Handles persistence operations for hybrid door mode
 */
import { HighScore } from './game/types';
/**
 * RPC Handlers for client-server communication
 */
export declare const rpcHandlers: {
    /**
     * Get current high scores list
     */
    getHighscores: () => Promise<HighScore[]>;
    /**
     * Save a new high score if it qualifies
     */
    saveHighscore: (params: {
        name: string;
        score: number;
        level: number;
        maxPercent: number;
    }) => Promise<{
        success: boolean;
        rank: number;
    }>;
    /**
     * Reset high scores to defaults (admin function)
     */
    resetHighscores: () => Promise<{
        success: boolean;
    }>;
};
export default rpcHandlers;
//# sourceMappingURL=server.d.ts.map