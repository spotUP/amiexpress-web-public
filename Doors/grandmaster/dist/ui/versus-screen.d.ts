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
    private voiceStates;
    private localMuted;
    private sessionSocket;
    private voiceSpeakingHandler;
    private boardBox;
    private nextBox;
    private holdBox;
    private opponentBoardBox;
    private opponentInfoBox;
    private minimapPanel;
    private minimapContainer;
    private garbageIndicator;
    private statsBox;
    private lastOpponentCount;
    /** Match outcome, readable after run() resolves. */
    victory: boolean;
    /** Lobby "Garbage Lines" setting; false disconnects the attack router. */
    private garbageEnabled;
    /** True once at least one networked opponent has been seen (win detection). */
    private sawNetworkOpponent;
    private lastRender;
    private static readonly RENDER_INTERVAL;
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
    constructor(screen: Screen, engine: GameEngine, inputHandler: InputHandler, sounds: SoundEngine, state: AppState, network: GrandmasterNetworkManager | null, attackManager: AttackManager, botOrAI?: number | any, // number = old botDifficulty, object = VersusAI controller
    sessionRef?: any);
    /** Lobby "Garbage Lines" toggle. Call before run(). */
    setGarbageEnabled(enabled: boolean): void;
    /**
     * The attack ROUTER - the missing layer this whole feature dead-ended on.
     *
     * Every engine (human and AI) has a complete AttackManager: line clears
     * produce attacks via onAttackSent, and queued garbage is applied to the
     * board on lock. But nothing ever CONNECTED them: the human's only
     * onAttackSent listener played a sound (and in CPU battle wasn't even
     * registered, since setupNetworkListeners was gated on `this.network`),
     * receiveAttack() had zero callers repo-wide, and the AI engines had no
     * attack managers at all. Result: "No incoming attack" was a permanent
     * state and the lobby's garbage setting described nothing.
     */
    private setupAttackRouting;
    /** Stable id used as `from` in outgoing network attacks. */
    private localAttackId;
    /**
     * Setup UI layout — 80x24 terminal
     *
     * Col  0-21 : player board  (22w, 22h, top=1)
     * Col 22-33 : NEXT (12w,12h,top=1) + HOLD (12w,10h,top=13)
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
     * Brief WIN/LOSE overlay before resolving back to the menu.
     */
    private showMatchResult;
    /**
     * Setup input handlers
     */
    private setupInput;
    /** Absolute cells of the local falling piece, for network updates. */
    private localPieceCells;
    /** Render immediately (input feedback / network receipt), floored at 8 ms. */
    private renderNow;
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
     * Render voice chat status section for opponentInfoBox
     */
    private renderVoiceSection;
    /**
     * Cleanup
     */
    cleanup(): void;
}
//# sourceMappingURL=versus-screen.d.ts.map