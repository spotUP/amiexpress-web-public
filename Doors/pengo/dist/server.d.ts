/**
 * Pengo - Server RPC Handlers
 */
import { GameState, HighScore } from './game/types';
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
    }) => Promise<void>;
};
//# sourceMappingURL=server.d.ts.map