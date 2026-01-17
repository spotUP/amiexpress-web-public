"use strict";
/**
 * Input Handler
 *
 * Manages keyboard input with DAS/ARR timing
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.InputHandler = void 0;
const config_1 = require("./config");
/**
 * Input handler with DAS/ARR support
 */
class InputHandler {
    constructor(screen, session, config = config_1.DEFAULT_KEYS) {
        this.screen = screen;
        this.session = session;
        this.lastUpdate = 0;
        this.enabled = true;
        // Directional state (for DAS/ARR)
        this.leftPressed = false;
        this.rightPressed = false;
        this.downPressed = false;
        this.dasTimer = 0;
        this.arrTimer = 0;
        // Key release simulation (blessed doesn't emit keyrelease)
        this.lastLeftPress = 0;
        this.lastRightPress = 0;
        this.lastDownPress = 0;
        this.KEY_RELEASE_TIMEOUT = 100; // Increased from 50ms to 100ms to better simulate key release
        // Action callbacks
        this.actionHandlers = new Map();
        // Debounce for non-directional keys (rotation, hold, hard drop)
        this.lastActionTime = new Map();
        this.ACTION_DEBOUNCE = 100; // ms
        this.config = config;
        this.state = {
            heldKeys: new Set(),
            dasTimer: 0,
            arrTimer: 0,
            lastAction: null,
        };
        this.setupEventHandlers();
    }
    /**
     * Setup keyboard event handlers
     */
    setupEventHandlers() {
        console.log('[InputHandler] Setting up keypress handler on screen');
        this.screen.on('keypress', (ch, key) => {
            if (!this.enabled)
                return;
            console.log('[InputHandler] keypress event:', { ch, key });
            if (!key)
                return;
            const keyName = key.full || key.name;
            console.log('[InputHandler] keyName:', keyName);
            if (!keyName)
                return;
            // Add to held keys
            this.state.heldKeys.add(keyName);
            // Handle directional keys (for DAS/ARR)
            const now = Date.now();
            if (this.config.left.includes(keyName)) {
                this.rightPressed = false; // Cancel opposite direction
                this.leftPressed = true;
                this.lastLeftPress = now;
                this.dasTimer = 0;
                this.arrTimer = 0;
                this.triggerAction('left');
            }
            else if (this.config.right.includes(keyName)) {
                this.leftPressed = false; // Cancel opposite direction
                this.rightPressed = true;
                this.lastRightPress = now;
                this.dasTimer = 0;
                this.arrTimer = 0;
                this.triggerAction('right');
            }
            else if (this.config.softDrop.includes(keyName)) {
                this.downPressed = true;
                this.lastDownPress = now;
                this.triggerAction('soft_drop');
            }
            else {
                // Non-directional actions (trigger once on press with debounce)
                const action = (0, config_1.keyToAction)(keyName, this.config);
                if (action && action !== 'left' && action !== 'right' && action !== 'soft_drop') {
                    const now = Date.now();
                    const lastTime = this.lastActionTime.get(action) || 0;
                    if (now - lastTime >= this.ACTION_DEBOUNCE) {
                        this.lastActionTime.set(action, now);
                        this.triggerAction(action);
                    }
                }
            }
        });
        // Note: blessed doesn't emit keyrelease, so we need to track this differently
        // For now, we'll assume keys are released after a short time
    }
    /**
     * Enable or disable input handling (keeps screen input active).
     */
    setEnabled(enabled) {
        this.enabled = enabled;
    }
    /**
     * Update input state (call every frame)
     */
    update(deltaTime) {
        const now = Date.now();
        if (this.lastUpdate === 0) {
            this.lastUpdate = now;
            return;
        }
        const dt = now - this.lastUpdate;
        this.lastUpdate = now;
        // Simulate key release after timeout (blessed doesn't emit keyrelease)
        if (this.leftPressed && now - this.lastLeftPress > this.KEY_RELEASE_TIMEOUT) {
            this.leftPressed = false;
            this.dasTimer = 0;
            this.arrTimer = 0;
        }
        if (this.rightPressed && now - this.lastRightPress > this.KEY_RELEASE_TIMEOUT) {
            this.rightPressed = false;
            this.dasTimer = 0;
            this.arrTimer = 0;
        }
        if (this.downPressed && now - this.lastDownPress > this.KEY_RELEASE_TIMEOUT) {
            this.downPressed = false;
        }
        // Update DAS/ARR for held directional keys
        if (this.leftPressed || this.rightPressed) {
            this.dasTimer += dt;
            if (this.dasTimer >= config_1.TIMING.DAS_DELAY) {
                // DAS has expired, start ARR
                this.arrTimer += dt;
                if (this.arrTimer >= config_1.TIMING.ARR_RATE) {
                    this.arrTimer = 0;
                    // Trigger repeat
                    if (this.leftPressed) {
                        this.triggerAction('left');
                    }
                    else if (this.rightPressed) {
                        this.triggerAction('right');
                    }
                }
            }
        }
        // Soft drop repeat
        if (this.downPressed) {
            this.arrTimer += dt;
            if (this.arrTimer >= config_1.TIMING.SOFT_DROP_RATE) {
                this.arrTimer = 0;
                this.triggerAction('soft_drop');
            }
        }
        // Note: Keys remain held for DAS/ARR to work properly
        // They are only cleared when a different directional key is pressed
        // This compensates for blessed not providing keyrelease events
    }
    /**
     * Clear held keys (simulate key release)
     */
    clearHeldKeys() {
        this.state.heldKeys.clear();
        this.leftPressed = false;
        this.rightPressed = false;
        this.downPressed = false;
    }
    /**
     * Trigger game action
     */
    triggerAction(action) {
        this.state.lastAction = action;
        const handler = this.actionHandlers.get(action);
        if (handler) {
            handler();
        }
    }
    /**
     * Register action handler
     */
    on(action, handler) {
        this.actionHandlers.set(action, handler);
    }
    /**
     * Remove action handler
     */
    off(action) {
        this.actionHandlers.delete(action);
    }
    /**
     * Check if key is held
     */
    isKeyHeld(key) {
        return this.state.heldKeys.has(key);
    }
    /**
     * Get current input state
     */
    getState() {
        return { ...this.state };
    }
    /**
     * Reset input state
     */
    reset() {
        this.state.heldKeys.clear();
        this.state.dasTimer = 0;
        this.state.arrTimer = 0;
        this.state.lastAction = null;
        this.dasTimer = 0;
        this.arrTimer = 0;
        this.leftPressed = false;
        this.rightPressed = false;
        this.downPressed = false;
        this.lastLeftPress = 0;
        this.lastRightPress = 0;
        this.lastDownPress = 0;
    }
    /**
     * Update key configuration
     */
    updateConfig(config) {
        this.config = config;
    }
    /**
     * Get current key configuration
     */
    getConfig() {
        return this.config;
    }
    /**
     * Destroy input handler
     */
    destroy() {
        this.screen.removeAllListeners('keypress');
        this.actionHandlers.clear();
        this.reset();
    }
}
exports.InputHandler = InputHandler;
//# sourceMappingURL=handler.js.map