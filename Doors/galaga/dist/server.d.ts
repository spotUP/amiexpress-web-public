/**
 * Galaga - Server RPC Handlers
 * High score persistence for the arcade game
 */
import { HighScore } from './game/types';
export declare const rpcHandlers: {
    getHighscores: () => Promise<HighScore[]>;
    saveHighscore: (params: {
        name: string;
        score: number;
        stage: number;
    }) => Promise<void>;
};
//# sourceMappingURL=server.d.ts.map