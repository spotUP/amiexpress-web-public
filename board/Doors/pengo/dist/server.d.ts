/**
 * Pengo - Server RPC Handlers
 */
import { GameState, HighScore } from './game/types';
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
/** Told by the door whenever the screen changes. */
export declare function setMusicState(state: GameState): void;
export declare const rpcHandlers: {
    /**
     * Which module the client should be playing.
     *
     * Answered from the pure trackForState the tests cover, so the music
     * cannot drift from the screen.
     */
    getMusicTrack: () => Promise<{
        track: string;
    }>;
    getHighscores: () => Promise<HighScore[]>;
    saveHighscore: (params: {
        name: string;
        score: number;
        level: number;
    }, session?: DoorSessionLike) => Promise<void>;
};
export {};
//# sourceMappingURL=server.d.ts.map