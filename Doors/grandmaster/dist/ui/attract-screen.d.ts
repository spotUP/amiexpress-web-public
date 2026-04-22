/**
 * Attract Mode Screen
 *
 * Cinematic presentation mode with boot sequence, demo AI gameplay,
 * leaderboard displays, and cycling announcements
 */
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { SoundEngine } from '../audio/sounds';
import type { AppState } from '../core/types';
/**
 * Attract Mode Screen
 *
 * Auto-plays demo gameplay, shows leaderboards, tips, and credits
 */
export declare class AttractScreen {
    private screen;
    private sounds;
    private state;
    private botPlayer;
    private pieceManager;
    private mainBox;
    private demoBox;
    private infoBox;
    private attractState;
    private stateTimer;
    private running;
    private exitCallback;
    private exitHandler;
    private dataHandler;
    private rainbowTimer;
    private readonly RAINBOW_COLORS;
    private demoEngine;
    private gameScreen;
    private demoRunning;
    private lastRenderedAt;
    private updateInterval;
    private shaker;
    private particles;
    private transitions;
    private animations;
    private lastGrade;
    private lastLines;
    private lastLevel;
    private lastSection;
    private lastPieceExists;
    private lastBoardHash;
    private lastHold;
    private lastNext;
    private shineTimer;
    private readonly SHINE_INTERVAL;
    private shineCells;
    private hardDropTrails;
    private gradeAnimProgress;
    private gradeAnimDirection;
    constructor(screen: Screen, sounds: SoundEngine, state: AppState);
    /**
     * Setup UI layout
     */
    private setupUI;
    /**
     * Run attract mode
     */
    run(onExit: () => void): Promise<void>;
    /**
     * Show boot sequence animation
     */
    private showBootSequence;
    /**
     * Start demo gameplay
     */
    private startDemo;
    /**
     * Update attract mode state
     */
    private update;
    /**
     * DEPRECATED: GameScreen now handles all game events and effects!
     * This method is no longer used when GameScreen is active.
     */
    private checkDemoEvents_UNUSED;
    private getSpawnSfx;
    private triggerLockFlash;
    private updateShineEffect;
    private hasShineEffect;
    private getAnimatedGradeColor;
    private getAnimatedGradeSize;
    private updateGradeAnimation;
    /**
     * Render attract mode
     */
    private render;
    private getBoardHash;
    private getPieceGlowColor;
    private getHardDropTrailChar;
    private getBrightColor;
    /**
     * DEPRECATED: GameScreen now renders the demo playfield!
     * This method is no longer used.
     */
    private renderDemo_UNUSED;
    private getBlockChar;
    private getFadedBlockChar;
    private getPieceColor;
    private addHardDropTrail;
    /**
     * Render leaderboard
     */
    private renderLeaderboard;
    /**
     * Render tips screen
     */
    private renderTips;
    /**
     * Render credits screen
     */
    private renderCredits;
    /**
     * Get piece shape
     */
    private getPieceShape;
    /**
     * Format time in MM:SS:MS format
     */
    private formatTime;
    /**
     * Setup input handlers
     */
    private setupInput;
    /**
     * Exit attract mode
     */
    private exit;
    /**
     * Cleanup
     */
    cleanup(): void;
}
//# sourceMappingURL=attract-screen.d.ts.map