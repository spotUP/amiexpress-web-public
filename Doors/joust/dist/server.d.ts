/**
 * Joust - Server RPC Handlers
 */
import { HighScore } from './game/types';
export declare const rpcHandlers: {
    getHighscores: () => Promise<HighScore[]>;
    saveHighscore: (params: {
        name: string;
        score: number;
        wave: number;
    }) => Promise<void>;
};
