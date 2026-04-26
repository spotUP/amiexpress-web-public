import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { GamepadActionMapper } from '@amiexpress/bbs-door-sdk';
import type { GameEngine } from '../core/game';
import type { InputHandler } from '../input/handler';
import type { SoundEngine } from '../audio/sounds';
import type { AppState, GameAction } from '../core/types';
/**
 * Main game screen
 */
export declare class GameScreen {
    private screen;
    private engine;
    private input;
    private sounds;
    private state;
    private gamepadMapper;
    private running;
    private stoppedEarly;
    private cleanedUp;
    private outerFrame;
    private escHandler;
    private boardBox;
    private nextBox;
    private holdBox;
    private statsBox;
    private gradeBox;
    private sectionBox;
    private footerBox;
    private boardOverlay;
    private lastRender;
    private readonly RENDER_FPS;
    private readonly RENDER_INTERVAL;
    private shaker;
    private particles;
    private transitions;
    private animations;
    private glowManager;
    private clearAnimation;
    private connectedBlocks;
    private lastGrade;
    private lastLines;
    private lastLevel;
    private lastSection;
    private lastPieceExists;
    private lastScore;
    private lastCombo;
    private lastNext;
    private lastHold;
    private lastBoardHash;
    private gradeAnimProgress;
    private gradeAnimDirection;
    private lastComboMilestone;
    private twentyGFlashTimer;
    private rainbowTimer;
    private lastRainbowUpdate;
    private readonly RAINBOW_INTERVAL;
    private readonly RAINBOW_COLORS;
    private shineTimer;
    private readonly SHINE_INTERVAL;
    private shineCells;
    private hardDropTrails;
    constructor(screen: Screen, engine: GameEngine, input: InputHandler | null, // Null for attract mode (AI-controlled)
    sounds: SoundEngine, state: AppState, gamepadMapper?: GamepadActionMapper<GameAction> | null);
    /**
     * Show READY -> GO countdown before game starts.
     * Renders the next queue so the player can plan ahead.
     */
    private showReadyGo;
    /**
     * Run the game loop
     */
    run(): Promise<void>;
    /**
     * Check for game events and trigger visual effects
     */
    private checkGameEvents;
    /**
     * Trigger medal award animation
     */
    private triggerMedalAnimation;
    /**
     * Get spawn sound for piece type
     */
    private getSpawnSfx;
    /**
     * Trigger lock flash effect
     */
    private triggerLockFlash;
    /**
     * Trigger combo animation for milestone achievements
     */
    private triggerComboAnimation;
    /**
     * Handle section completion
     */
    private handleSectionComplete;
    /**
     * Setup UI elements
     */
    private setupUI;
    /**
     * Setup input handlers
     */
    private setupInput;
    /**
     * Render game state
     */
    private render;
    private getBoardHash;
    private getPPS;
    private getDigHud;
    private getUltraTime;
    private renderStats;
    /**
     * Build board overlay grid from all active effects
     *
     * Z-order (highest priority first):
     * 1. Text announcements (gradeUp, cool/regret, combo, tSpin)
     * 2. Floating text (score popups)
     * 3. Particles (converted to board coords)
     * 4. Lock glow (piece lock flash)
     *
     * Board coordinates: x=0..9, y=4..23 (visible area)
     * Each overlay cell is a 2-char blessed-tagged string or null
     */
    private buildBoardOverlay;
    /**
     * Overlay text centered on the board at a given visible row offset
     * Text may contain blessed tags. Plain text chars are extracted for positioning.
     * visibleRow: 0-19 offset from top of visible board (board y=4+visibleRow)
     */
    private overlayTextOnBoard;
    /**
     * Update grade display animation
     */
    private updateGradeAnimation;
    /**
     * Update rainbow border colors for all panels
     */
    private updateRainbowBorders;
    /**
     * Update block shine effect (sweeping glare like arkanoid2)
     */
    private updateShineEffect;
    /**
     * Check if a cell should be rendered with shine effect
     */
    private hasShineEffect;
    /**
     * Get animated color for grade
     */
    private getAnimatedGradeColor;
    /**
     * Get animated size for grade
     */
    private getAnimatedGradeSize;
    /**
     * Get animated combo display with milestone colors
     */
    private getAnimatedComboDisplay;
    /**
     * Render section information
     */
    private renderSectionInfo;
    /**
     * Render board with pieces
     */
    private renderBoard;
    /**
     * Get ANSI block character for piece type
     */
    private getBlockChar;
    /**
     * Get faded block character for credit roll
     */
    private getFadedBlockChar;
    private addHardDropTrail;
    /**
     * Render next queue
     */
    private renderNext;
    /**
     * Render hold piece
     */
    private renderHold;
    /**
     * Get mini piece preview
     */
    private getMiniPiece;
    /**
     * Calculate credit roll opacity based on block age
     */
    private getCreditRollOpacity;
    /**
     * Get color for piece type
     */
    private getPieceGlowColor;
    private getHardDropTrailChar;
    private getBrightColor;
    /**
     * Get color name for piece type (for visual effects)
     */
    private getPieceColorName;
    /**
     * Apply glow effect to block character
     */
    private applyGlow;
    /**
     * Show pause menu with live stats
     */
    private showPauseMenu;
    /**
     * Show game over screen
     */
    private showGameOver;
    private waitForKey;
    private cleanup;
    /**
     * Stop the game loop early without showing game over (for attract mode exit)
     */
    stop(): void;
}
//# sourceMappingURL=game-screen.d.ts.map