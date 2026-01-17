/**
 * Puzzle Bobble (Bust-A-Move) - Server RPC Handlers
 */
import { HighScore } from './game/types';
export declare const rpcHandlers: {
    getHighscores: () => Promise<HighScore[]>;
    saveHighscore: (params: {
        name: string;
        score: number;
        level: number;
    }) => Promise<void>;
};
