/**
 * Key State Tracker - Eliminates Browser Key Repeat Delay
 *
 * Browser keyboards have a ~500ms delay before key repeat starts.
 * This tracker emulates instant key repeat for game controls by:
 * 1. Tracking keydown/keyup states
 * 2. Emitting continuous events while keys are held
 * 3. Providing instant response (no initial delay)
 *
 * IMPORTANT LIMITATION - BBS TERMINAL CONTEXT:
 * =============================================
 * KeyStateTracker ONLY works when the door runs in a STANDALONE browser context
 * (e.g., SDK Preview tool, or door running in its own browser tab).
 *
 * It does NOT work in the BBS terminal (xterm.js) because:
 * - xterm.js intercepts all keyboard events before they reach `window`
 * - Input in BBS terminal comes through `door.onInput()`, not window events
 *
 * For hybrid doors running in the BBS terminal, handle arrow keys directly
 * in the `door.onInput()` callback instead:
 *
 * ```typescript
 * door.onInput((user, key) => {
 *   const k = key.key?.toLowerCase() || '';
 *   if (this.state === 'playing') {
 *     if (k === 'arrowleft' || k === 'a') {
 *       this.movePaddle(-1);
 *       return;
 *     } else if (k === 'arrowright' || k === 'd') {
 *       this.movePaddle(1);
 *       return;
 *     }
 *   }
 *   // Handle other keys...
 * });
 * ```
 *
 * Usage in SDK Preview or standalone browser context:
 * ```typescript
 * const keyTracker = new KeyStateTracker();
 * door.onConnect((user) => {
 *   keyTracker.start((key) => {
 *     // Handle continuous key events (no delay!)
 *     if (key === 'ArrowLeft') movePaddleLeft();
 *     if (key === 'ArrowRight') movePaddleRight();
 *   });
 * });
 * ```
 */
export class KeyStateTracker {
    constructor() {
        /** Map of currently pressed keys */
        this.keyStates = new Map();
        /** Callback to invoke for key events */
        this.handler = null;
        /** Interval handle for emitting continuous events */
        this.intervalHandle = null;
        /** Repeat rate in milliseconds (default: 16ms = ~60fps) */
        this.repeatRate = 16;
        /** Whether tracker is active */
        this.active = false;
        /** Keys that this tracker handles (only these will preventDefault) */
        this.handledKeys = new Set([
            'arrowleft', 'arrowright', 'arrowup', 'arrowdown',
            'a', 'd', 'w', 's' // Common game movement keys
        ]);
        /**
         * Handle browser keydown event
         * @private
         */
        this.handleKeyDown = (event) => {
            const key = this.normalizeKey(event.key);
            // Only handle keys we're tracking (movement keys)
            // Let other keys (space, enter, etc.) pass through to terminal
            if (!this.handledKeys.has(key)) {
                return;
            }
            // Ignore repeat events from browser (we generate our own)
            if (event.repeat) {
                event.preventDefault();
                return;
            }
            // Update key state
            this.keyStates.set(key, {
                key,
                pressed: true,
                timestamp: Date.now(),
            });
            // Emit immediately (no delay!)
            if (this.handler) {
                this.handler(key);
            }
            event.preventDefault();
        };
        /**
         * Handle browser keyup event
         * @private
         */
        this.handleKeyUp = (event) => {
            const key = this.normalizeKey(event.key);
            // Only handle keys we're tracking
            if (!this.handledKeys.has(key)) {
                return;
            }
            // Remove key state
            this.keyStates.delete(key);
            event.preventDefault();
        };
    }
    /**
     * Start tracking key states
     *
     * @param handler - Callback to invoke for each key event (called continuously while key held)
     * @param repeatRate - How often to emit events in ms (default: 16ms = ~60fps)
     */
    start(handler, repeatRate = 16) {
        if (this.active) {
            console.warn('[KeyStateTracker] Already started');
            return;
        }
        this.handler = handler;
        this.repeatRate = repeatRate;
        this.active = true;
        // Listen for browser keyboard events
        if (typeof window !== 'undefined') {
            window.addEventListener('keydown', this.handleKeyDown);
            window.addEventListener('keyup', this.handleKeyUp);
        }
        // Start emission loop
        this.startEmissionLoop();
        console.log(`[KeyStateTracker] Started (repeat rate: ${repeatRate}ms)`);
    }
    /**
     * Stop tracking and clean up
     */
    stop() {
        if (!this.active)
            return;
        this.active = false;
        if (typeof window !== 'undefined') {
            window.removeEventListener('keydown', this.handleKeyDown);
            window.removeEventListener('keyup', this.handleKeyUp);
        }
        if (this.intervalHandle !== null) {
            clearInterval(this.intervalHandle);
            this.intervalHandle = null;
        }
        this.keyStates.clear();
        console.log('[KeyStateTracker] Stopped');
    }
    /**
     * Check if a key is currently pressed
     */
    isKeyPressed(key) {
        const state = this.keyStates.get(key);
        return state ? state.pressed : false;
    }
    /**
     * Get all currently pressed keys
     */
    getPressedKeys() {
        return Array.from(this.keyStates.values())
            .filter(state => state.pressed)
            .map(state => state.key);
    }
    /**
     * Normalize key names for consistency
     * @private
     */
    normalizeKey(key) {
        // Map various key names to consistent values
        const keyMap = {
            ' ': 'space',
            'Enter': 'enter',
            'Escape': 'escape',
            'Backspace': 'backspace',
            'Tab': 'tab',
            'Shift': 'shift',
            'Control': 'ctrl',
            'Alt': 'alt',
            'Meta': 'meta',
        };
        return keyMap[key] || key.toLowerCase();
    }
    /**
     * Start continuous emission loop
     * @private
     */
    startEmissionLoop() {
        this.intervalHandle = setInterval(() => {
            if (!this.active || !this.handler)
                return;
            // Emit for all currently pressed keys
            for (const state of this.keyStates.values()) {
                if (state.pressed) {
                    this.handler(state.key);
                }
            }
        }, this.repeatRate);
    }
}
