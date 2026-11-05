/**
 * Zoo Keeper - Server RPC Handlers
 * Handles persistence operations for hybrid door mode
 */
import { HighScore } from './game/types';
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
    }, session?: DoorSessionLike) => Promise<{
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