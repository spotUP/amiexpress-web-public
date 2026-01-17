/**
 * Core Game Engine
 *
 * Manages game state, piece movement, scoring, and game loop
 */
import type { GameState, GameMode, PlayerSettings, GameResult } from './types';
import type { AttackManager } from '../network/attack-system';
import { type Replay } from '../server/replay-manager';
import { type Medal } from './medals';
import type { SoundEngine } from '../audio/sounds';
import { AnimationManager } from '../effects/animations';
import { BlockGlowManager } from '../effects/block-glow';
export declare class GameEngine {
    private sounds;
    private state;
    private pieceManager;
    private settings;
    private sectionManager;
    private gradeManager;
    private medalManager;
    private creditRollManager;
    private invisiblePieceManager;
    private attackManager?;
    private finesseEvaluator;
    private recorder?;
    private onHardDropCallback?;
    private animations;
    private glowManager;
    private tetrisCount;
    private tSpinCount;
    private perfectClearCount;
    private lastUpdate;
    private frameAccumulator;
    private readonly TARGET_FPS;
    private readonly FRAME_TIME;
    private gravityAccumulator;
    private pauseTime;
    private devilNextRise;
    private readonly SHIRASE_RISE_MIN;
    private readonly SHIRASE_RISE_MAX;
    constructor(mode: GameMode, settings: PlayerSettings, sounds: SoundEngine, attackManager?: AttackManager);
    /**
     * Set animation manager (for visual effects)
     */
    setAnimationManager(animations: AnimationManager): void;
    /**
     * Set glow manager (for block glow effects)
     */
    setGlowManager(glowManager: BlockGlowManager): void;
    /**
     * Create initial game state
     */
    private createInitialState;
    /**
     * Start the game
     */
    start(): void;
    /**
     * Spawn new piece
     */
    private spawnPiece;
    /**
     * Update game state (called every frame)
     */
    update(deltaTime: number): void;
    /**
     * Update single frame
     */
    private updateFrame;
    /**
     * Apply gravity to current piece
     */
    private applyGravity;
    /**
     * Check if piece is on ground
     */
    private isPieceGrounded;
    /**
     * Move piece left/right
     */
    move(direction: -1 | 1): boolean;
    /**
     * Rotate piece
     */
    rotate(direction: 1 | -1): boolean;
    /**
     * Soft drop (faster gravity)
     */
    softDrop(): boolean;
    /**
     * Hard drop (instant lock)
     */
    hardDrop(): void;
    /**
     * Hold current piece
     */
    hold(): boolean;
    /**
     * Set pending IRS (Initial Rotation System) input
     * Only works during ARE (when no piece is active)
     */
    setIRS(direction: -1 | 0 | 1): boolean;
    /**
     * Set pending IHS (Initial Hold System) input
     * Only works during ARE (when no piece is active)
     */
    setIHS(): boolean;
    /**
     * Detect T-Spin using the 3-corner rule (HeborisCE isTSpin)
     * Returns 'full' for T-Spin, 'mini' for T-Spin Mini, or 'none'
     *
     * HeborisCE behavior:
     * - tspin_flag must be 1 (set by rotation, cleared by horizontal move)
     * - rotationCount must be > 0 (piece was rotated at least once)
     * - 3-corner check must pass
     */
    private detectTSpin;
    /**
     * Lock piece to board
     */
    private lockPiece;
    /**
     * Calculate score for line clear
     */
    private calculateLineScore;
    /**
     * Reset lock delay (when piece moves/rotates)
     * HeborisCE tracks move and rotation resets separately
     */
    private resetLockDelay;
    /**
     * Get current game state
     */
    getState(): GameState;
    /**
     * Get current medal state (HeborisCE medal system)
     */
    getMedals(): import("./medals").MedalState;
    /**
     * Get recently awarded medals for display
     */
    getRecentMedals(): Medal[];
    /**
     * Clear recent medals after displaying
     */
    clearRecentMedals(): void;
    /**
     * Reset the Shirase garbage counter
     */
    private resetDevilNextRise;
    /**
     * Apply a line of garbage for Shirase mode
     */
    private applyShiraseGarbage;
    /**
     * Get game result
     */
    getResult(): GameResult;
    /**
     * Get bone block probability for current grade
     */
    private getBoneBlockChance;
    /**
     * Check if M grade reached and trigger credit roll
     */
    private checkCreditRollTrigger;
    /**
     * Start credit roll mode
     */
    private startCreditRoll;
    /**
     * Complete credit roll and award rank based on qualification
     */
    private completeCreditRoll;
    /**
     * Place piece with lock timestamp for credit roll fade
     */
    private placePieceWithTimestamp;
    /**
     * Pause game
     */
    pause(): void;
    /**
     * Resume game
     */
    resume(): void;
    /**
     * Start replay recording
     */
    startRecording(userId: string, username: string, seed?: number): void;
    /**
     * Stop and finalize replay recording
     */
    finalizeRecording(): Replay | null;
    /**
     * Check if currently recording
     */
    isRecording(): boolean;
    /**
     * Set callback for hard drop event
     */
    onHardDrop(callback: () => void): void;
    /**
     * Get color name for piece type (for visual effects)
     */
    private getPieceColorName;
}
//# sourceMappingURL=game.d.ts.map