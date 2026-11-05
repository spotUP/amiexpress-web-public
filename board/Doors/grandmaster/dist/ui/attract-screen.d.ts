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
 * Which attract sequence to run at a given width.
 *
 * I/O-free, no blessed, no screen. 'full' is the 80-column boot with the
 * 5-line full-block ASCII art and rainbow cycle. 'compact' is a single
 * bold title row, sized for a 40x25 PETSCII canvas. This helper is the
 * one place the width rule lives, so the test pins it without a terminal.
 */
export declare function attractModeFor(width: number): 'full' | 'compact';
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
     * The 40-column boot. Replaces the 5-line full-block ASCII logo and its
     * 6-colour rainbow cycle with a single bold title row. The PETSCII
     * canvas has no per-cell background, so the full-block art would print
     * as the same 'rvs space' in every cell - the visual distinction comes
     * from foreground colour, which the door sets, but the per-line
     * rainbow cycle is wasted at 40 columns. The single-row title plus
     * a press-key prompt is what the SKILL ("One door, three screens")
     * says fits a C64 canvas.
     */
    private showCompactBootSequence;
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