/**
 * Input Engine - Keyboard Input Management
 *
 * Simple input handling system for mapping keys to actions.
 * This is a basic implementation for example doors.
 */
export class InputEngine {
    constructor() {
        this.actions = new Map();
    }
    /**
     * Bind an action to a key
     *
     * @param actionName - Name of the action
     * @param key - Key to bind (e.g., 'ArrowUp', ' ', 'i')
     * @param callback - Function to call when key is pressed
     *
     * @example
     * ```typescript
     * const input = new InputEngine();
     * input.bindAction('move-up', 'ArrowUp', () => console.log('Move up!'));
     * ```
     */
    bindAction(actionName, key, callback) {
        if (!this.actions.has(key)) {
            this.actions.set(key, []);
        }
        this.actions.get(key).push({ key: actionName, callback });
    }
    /**
     * Process a key event
     *
     * @param keyEvent - The key event to process
     */
    processInput(keyEvent) {
        const actions = this.actions.get(keyEvent.key);
        if (actions) {
            actions.forEach(action => action.callback());
        }
    }
    /**
     * Unbind an action from a key
     *
     * @param actionName - Name of the action to unbind
     */
    unbindAction(actionName) {
        for (const [key, actions] of this.actions.entries()) {
            const filtered = actions.filter(a => a.key !== actionName);
            if (filtered.length > 0) {
                this.actions.set(key, filtered);
            }
            else {
                this.actions.delete(key);
            }
        }
    }
    /**
     * Clear all bindings
     */
    clear() {
        this.actions.clear();
    }
    /**
     * Reset all bindings (alias for clear)
     */
    reset() {
        this.clear();
    }
    /**
     * Clean up resources (alias for reset)
     */
    dispose() {
        this.reset();
    }
}
