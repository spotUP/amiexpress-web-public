/**
 * Frogger - Server RPC Handlers
 * High score persistence for the arcade game
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
    }, session?: DoorSessionLike) => Promise<void>;
};
export {};
//# sourceMappingURL=server.d.ts.map