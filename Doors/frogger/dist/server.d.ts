/**
 * Frogger - Server RPC Handlers
 * High score persistence for the arcade game
 */
import { HighScore } from './game/types';
/**
 * RPC handlers for hybrid door mode
 */
export declare const rpcHandlers: {
    /**
     * Get high scores list
     */
    getHighscores: () => Promise<HighScore[]>;
    /**
     * Save a new high score
     */
    saveHighscore: (params: {
        name: string;
        score: number;
        level: number;
    }) => Promise<void>;
};
//# sourceMappingURL=server.d.ts.map