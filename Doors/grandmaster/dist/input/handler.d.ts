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
    private lastLeftPress;
    private lastRightPress;
    private lastDownPress;
    private readonly KEY_RELEASE_TIMEOUT;
    private actionHandlers;
    private lastActionTime;
    private readonly ACTION_DEBOUNCE;
    constructor(screen: Screen, session: DoorSession, config?: KeyConfig);
    /**
     * Setup keyboard event handlers
     */
    private setupEventHandlers;
    /**
     * Enable or disable input handling (keeps screen input active).
     */
    setEnabled(enabled: boolean): void;
    /**
     * Update input state (call every frame)
     */
    update(deltaTime: number): void;
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