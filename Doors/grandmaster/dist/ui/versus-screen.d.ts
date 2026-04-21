/**
 * Versus Screen
 *
 * Multiplayer game screen with opponent minimaps and attack indicators
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
 * Extends game screen with multiplayer features (online or CPU battle)
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
    private minimapContainer;
    private garbageIndicator;
    private attackIndicator;
    private statsBox;
    private running;
    private unsubscribers;
    constructor(screen: Screen, engine: GameEngine, inputHandler: InputHandler, sounds: SoundEngine, state: AppState, network: GrandmasterNetworkManager | null, attackManager: AttackManager, botOrAI?: number | any);
    /**
     * Setup UI layout
     */
    private setupUI;
    /**
     * Setup network event listeners
     */
    private setupNetworkListeners;
    /**
     * Show attack flash animation
     */
    private showAttackFlash;
    /**
     * Run game loop
     */
    run(): Promise<void>;
    /**
     * Setup input handlers
     */
    private setupInput;
    /**
     * Show countdown
     */
    private showCountdown;
    /**
     * Render game state
     */
    private render;
    /**
     * Toggle pause
     */
    private togglePause;
    /**
     * Render the game board
     */
    private renderBoard;
    /**
     * Get colored block character for piece type
     */
    private getBlockChar;
    /**
     * Cleanup
     */
    cleanup(): void;
}
//# sourceMappingURL=versus-screen.d.ts.map