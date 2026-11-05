/**
 * Galaga - Server RPC Handlers
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
export declare const rpcHandlers: {
    getHighscores: () => Promise<HighScore[]>;
    saveHighscore: (params: {
        name: string;
        score: number;
        stage: number;
    }, session?: DoorSessionLike) => Promise<void>;
};
export {};
//# sourceMappingURL=server.d.ts.map