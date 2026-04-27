/**
 * Versus Screen
 *
 * Multiplayer game screen with opponent board, garbage strip, hold box,
 * and full visual-effect parity with game-screen.ts.
 */
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { GameEngine } from '../core/game';
import type { InputHandler } from '../input/handler';
import type { SoundEngine } from '../audio/sounds';
import type { AppState } from '../core/types';
import type { GrandmasterNetworkManager } from '../network/network-manager';
import type { AttackManager } from '../network/attack-system';
/**
 * Versus Screen
 *
 * Extends game screen with multiplayer features (online or CPU battle).
 * Full visual-effect parity with GameScreen (particles, shake, board overlay,
 * lock flash, grade-up, combo, section COOL/REGRET, hold piece).
 */
export declare class VersusScreen {
    private screen;
    private engine;
    private inputHandler;
    private sounds;
    private state;
    private network;
    private attackManager;
    private minimapRenderer;
    private opponentTracker;
    private botPlayer;
    private versusAI;
    private boardBox;
    private nextBox;
    private holdBox;
    private opponentBoardBox;
    private opponentInfoBox;
    private minimapContainer;
    private garbageIndicator;
    private attackIndicator;
    private statsBox;
    private boardOverlay;
    private running;
    private unsubscribers;
    private shaker;
    private particles;
    private animations;
    private glowManager;
    private clearAnimation;
    private lastGrade;
    private lastLines;
    private lastLevel;
    private lastSection;
    private lastPieceExists;
    private lastScore;
    private lastCombo;
    private lastHold;
    private lastBoardHash;
    private gradeAnimProgress;
    private gradeAnimDirection;
    private lastComboMilestone;
    private twentyGFlashTimer;
    private rainbowTimer;
    private lastRainbowUpdate;
    constructor(screen: Screen, engine: GameEngine, inputHandler: InputHandler, sounds: SoundEngine, state: AppState, network: GrandmasterNetworkManager | null, attackManager: AttackManager, botOrAI?: number | any);
    /**
     * Setup UI layout — 80x24 terminal
     *
     * Col  0-21 : player board  (22w, 22h, top=1)
     * Col 22-33 : NEXT (12w,12h,top=1) + HOLD (12w,9h,top=13)
     * Col 34-36 : garbage strip (3w, 22h, top=1)
     * Col 37-58 : opponent board (22w, 22h, top=1)
     * Col 59-79 : VS info panel  (21w, 22h, top=1)
     * Row 23    : stats bar (no border)
     *   22 + 12 + 3 + 22 + 21 = 80 ✓
     */
    private setupUI;
    /**
     * Setup network event listeners
     */
    private setupNetworkListeners;
    /**
     * Run game loop
     */
    run(): Promise<void>;
    /**
     * Setup input handlers
     */
    private setupInput;
    /**
     * Show countdown (3, 2, 1, GO!)
     */
    private showCountdown;
    /**
     * Check for game events and trigger visual effects
     * Ported directly from game-screen.ts checkGameEvents().
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
     * Update grade display pulse animation
     */
    private updateGradeAnimation;
    /**
     * Toggle pause
     */
    private togglePause;
    /**
     * Render game state — all effects applied inline
     */
    private render;
    /**
     * Build board overlay grid from all active effects
     * Z-order (highest priority first):
     *   1. Text announcements (gradeUp, cool/regret, combo, tSpin)
     *   2. Floating text
     *   3. Particles
     *   4. Lock glow (lowest)
     */
    private buildBoardOverlay;
    /**
     * Overlay text centered on the board at a given visible row offset
     */
    private overlayTextOnBoard;
    /**
     * Render game board with ghost, glow, line-clear fade, and overlay effects
     */
    private renderBoard;
    /**
     * Render player's next piece queue
     */
    private renderNextQueue;
    /**
     * Render hold piece
     */
    private renderHold;
    /**
     * Render garbage strip — stacked red blocks showing pending count
     */
    private renderGarbage;
    /**
     * Render opponent board (full size)
     */
    private renderOpponentBoard;
    /**
     * Get colored block character for piece type
     */
    private getBlockChar;
    /**
     * Apply glow effect to block character
     */
    private applyGlow;
    /**
     * Cleanup
     */
    cleanup(): void;
}
//# sourceMappingURL=versus-screen.d.ts.map