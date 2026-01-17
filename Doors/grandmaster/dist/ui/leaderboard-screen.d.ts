/**
 * Leaderboard Screen
 *
 * Displays high scores and rankings for all game modes
 */
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { HighScoreManager } from '../core/high-scores';
import type { SoundEngine } from '../audio/sounds';
/**
 * Leaderboard screen
 */
export declare class LeaderboardScreen {
    private screen;
    private highScores;
    private sounds;
    private currentMode;
    private playerName;
    constructor(screen: Screen, highScores: HighScoreManager, sounds: SoundEngine, playerName: string);
    /**
     * Show leaderboard and wait for exit
     */
    show(): Promise<void>;
    /**
     * Cycle to previous mode
     */
    private previousMode;
    /**
     * Cycle to next mode
     */
    private nextMode;
    /**
     * Render leaderboard
     */
    private render;
    /**
     * Render mode tabs
     */
    private renderModeTabs;
    /**
     * Get display name for mode
     */
    private getModeName;
    /**
     * Render scores table
     */
    private renderScoresTable;
    /**
     * Render personal best
     */
    private renderPersonalBest;
    /**
     * Format rank
     */
    private formatRank;
    /**
     * Format player name
     */
    private formatPlayer;
    /**
     * Format grade
     */
    private formatGrade;
    /**
     * Format level
     */
    private formatLevel;
    /**
     * Format score
     */
    private formatScore;
    /**
     * Format time
     */
    private formatTime;
    /**
     * Format date
     */
    private formatDate;
}
//# sourceMappingURL=leaderboard-screen.d.ts.map