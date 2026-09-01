/**
 * Input Handler
 *
 * Manages keyboard input with DAS/ARR timing
 */
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { GameAction, InputState } from '../core/types';
import { type KeyConfig } from './config';
/**
 * Door session interface
 */
interface DoorSession {
    socket: any;
    user: any;
    bbsSession: any;
    bbs: any;
    params?: string[];
    args?: string[];
}
/**
 * Input handler with DAS/ARR support
 */
export declare class InputHandler {
    private screen;
    private session;
    private state;
    private config;
    private lastUpdate;
    private enabled;
    private leftPressed;
    private rightPressed;
    private downPressed;
    private dasTimer;
    private arrTimer;
    /**
     * Soft drop has its own clock.
     *
     * It used to share `arrTimer` with the sideways auto-repeat. Held
     * together - which is how the game is played from about level 300, where
     * soft drop is down more or less permanently - each reset the other's
     * timer and the piece managed ONE sideways cell per second against the
     * twelve the settings asked for. Measured, not guessed:
     * tests/input-repeat.test.ts.
     */
    private softDropTimer;
    /**
     * Most repeats one update() may deliver.
     *
     * A repeat is a rate in milliseconds, so a slow frame owes the player
     * several - but a frame that ran a whole second late must not empty the
     * backlog into one tick and throw the piece across the board. Four cells
     * is a wide slow frame; beyond that the debt is dropped rather than paid.
     */
    private readonly MAX_REPEATS_PER_UPDATE;
    private lastLeftPress;
    private lastRightPress;
    private lastDownPress;
    private readonly KEY_RELEASE_TIMEOUT;
    private actionHandlers;
    private lastActionTime;
    private readonly ACTION_DEBOUNCE;
    private keypressHandler;
    /**
     * True key-state mode: driven by real browser key-down/key-up events via
     * BBSApi.onKeyDown/onKeyUp (game mode). This is the designed-for input
     * model - blessed emits no key releases, so the old path had to SIMULATE
     * "held" with a 100 ms timeout that expired before the first auto-repeat
     * ever arrived (~400-500 ms), and every repeat keypress reset dasTimer.
     * Net effect: the configured DAS 133 ms / ARR 10 ms never ran and
     * movement was whatever the client repeat produced (~400/30). With real
     * press/release edges, DAS/ARR runs exactly as configured.
     */
    private keyStateMode;
    /** The player's own DAS/ARR, falling back to the TGM3-derived defaults. */
    private dasDelay;
    private arrRate;
    constructor(screen: Screen, session: DoorSession, config?: KeyConfig);
    /** Map browser KeyboardEvent.key names onto blessed-style config names. */
    private static browserKeyName;
    private setupKeyStateHandlers;
    /**
     * Apply the player's movement timing.
     *
     * The settings screen has always offered DAS and ARR, and this handler
     * ignored both - it read the module-level constants, so a player who
     * turned the repeat down saw no change at all (found 2026-08-26 while
     * chasing "the sideways scrolling accelerates and goes too quick").
     */
    setTiming(dasDelay?: number, arrRate?: number): void;
    /** Shared press-edge logic for both input paths. */
    private handleKeyEdge;
    /**
     * Setup keyboard event handlers
     */
    private setupEventHandlers;
    /**
     * Enable or disable input handling.
     * When disabled, the keypress handler is removed to prevent interference with widgets.
     */
    setEnabled(enabled: boolean): void;
    /**
     * Update input state (call every frame)
     */
    update(deltaTime: number): void;
    /**
     * Pay out one repeat per elapsed period, capped.
     *
     * Shared by the sideways repeat and the soft drop so the two cannot drift
     * apart again - they were one piece of code precisely because they behave
     * the same way; what they must NOT share is the accumulator.
     */
    private repeatWhileHeld;
    /**
     * Clear held keys (simulate key release)
     */
    private clearHeldKeys;
    /**
     * Trigger game action
     */
    private triggerAction;
    /**
     * Register action handler
     */
    on(action: GameAction, handler: () => void): void;
    /**
     * Remove action handler
     */
    off(action: GameAction): void;
    /**
     * Check if key is held
     */
    isKeyHeld(key: string): boolean;
    /**
     * Get current input state
     */
    getState(): InputState;
    /**
     * Reset input state
     */
    reset(): void;
    /**
     * Update key configuration
     */
    updateConfig(config: KeyConfig): void;
    /**
     * Get current key configuration
     */
    getConfig(): KeyConfig;
    /**
     * Destroy input handler
     */
    destroy(): void;
}
export {};
//# sourceMappingURL=handler.d.ts.map