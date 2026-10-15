/**
 * High Score Persistence System
 *
 * Manages saving, loading, and querying high scores per game mode
 */
import type { GameMode, GameResult, TGMGrade } from './types';
/**
 * High score entry
 */
export interface HighScoreEntry {
    rank: number;
    playerName: string;
    mode: GameMode;
    score: number;
    level: number;
    lines: number;
    grade: TGMGrade;
    time: number | null;
    date: string;
    completed: boolean;
}
/**
 * High score manager
 */
export declare class HighScoreManager {
    private filePath;
    private data;
    private maxEntriesPerMode;
    constructor(filePath?: string);
    /**
     * Load high scores from disk
     */
    private load;
    /**
     * Save high scores to disk
     */
    private save;
    /**
     * Add a new score entry
     */
    addScore(playerName: string, result: GameResult): {
        isHighScore: boolean;
        rank: number | null;
    };
    /**
     * Get top scores for a specific mode
     */
    getTopScores(mode: GameMode, limit?: number): HighScoreEntry[];
    /**
     * Get personal best for a player in a mode
     */
    getPersonalBest(playerName: string, mode: GameMode): HighScoreEntry | null;
    /**
     * Get all-time top scores across all modes
     */
    getAllTimeTop(limit?: number): HighScoreEntry[];
    /**
     * Check if a score qualifies as a high score (without adding it)
     */
    isHighScore(mode: GameMode, score: number): boolean;
    /**
     * Get statistics for a player
     */
    getPlayerStats(playerName: string): {
        totalGames: number;
        highestScore: number;
        bestGrade: TGMGrade;
        averageScore: number;
        modesPlayed: GameMode[];
    };
    /**
     * Clear all high scores (for testing)
     */
    clear(): void;
    /**
     * Reset high scores for a specific mode
     */
    clearMode(mode: GameMode): void;
}
//# sourceMappingURL=high-scores.d.ts.map