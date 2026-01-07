/**
 * KeyBindings - Global keyboard shortcut management
 *
 * Features:
 * - Register global shortcuts (Ctrl+S, Ctrl+Q, etc.)
 * - Context-aware shortcuts (different actions based on focused element)
 * - Conflict detection and resolution
 * - Customizable shortcuts
 */
export class KeyBindings {
    constructor() {
        this.shortcuts = new Map();
        this.contextShortcuts = new Map();
    }
    /**
     * Register a global keyboard shortcut
     */
    register(action) {
        for (const key of action.keys) {
            if (action.context) {
                // Context-specific shortcut
                if (!this.contextShortcuts.has(action.context)) {
                    this.contextShortcuts.set(action.context, new Map());
                }
                const contextMap = this.contextShortcuts.get(action.context);
                if (!contextMap.has(key)) {
                    contextMap.set(key, []);
                }
                contextMap.get(key).push(action);
            }
            else {
                // Global shortcut
                if (!this.shortcuts.has(key)) {
                    this.shortcuts.set(key, []);
                }
                this.shortcuts.get(key).push(action);
            }
        }
    }
    /**
     * Unregister a keyboard shortcut
     */
    unregister(action) {
        for (const key of action.keys) {
            if (action.context) {
                const contextMap = this.contextShortcuts.get(action.context);
                if (contextMap) {
                    const actions = contextMap.get(key);
                    if (actions) {
                        const index = actions.indexOf(action);
                        if (index > -1) {
                            actions.splice(index, 1);
                        }
                        if (actions.length === 0) {
                            contextMap.delete(key);
                        }
                    }
                }
            }
            else {
                const actions = this.shortcuts.get(key);
                if (actions) {
                    const index = actions.indexOf(action);
                    if (index > -1) {
                        actions.splice(index, 1);
                    }
                    if (actions.length === 0) {
                        this.shortcuts.delete(key);
                    }
                }
            }
        }
    }
    /**
     * Handle a key event and execute matching shortcuts
     * Returns true if a shortcut was executed
     */
    handle(key, context) {
        const keyName = this._keyEventToString(key);
        // Check context-specific shortcuts first
        if (context) {
            const contextMap = this.contextShortcuts.get(context);
            if (contextMap) {
                const actions = contextMap.get(keyName);
                if (actions && actions.length > 0) {
                    // Execute first matching action
                    actions[0].action();
                    return true;
                }
            }
        }
        // Check global shortcuts
        const actions = this.shortcuts.get(keyName);
        if (actions && actions.length > 0) {
            // Execute first matching action
            actions[0].action();
            return true;
        }
        return false;
    }
    /**
     * Get all registered shortcuts
     */
    getAllShortcuts() {
        const all = [];
        // Global shortcuts
        for (const actions of this.shortcuts.values()) {
            all.push(...actions);
        }
        // Context shortcuts
        for (const contextMap of this.contextShortcuts.values()) {
            for (const actions of contextMap.values()) {
                all.push(...actions);
            }
        }
        return all;
    }
    /**
     * Get shortcuts for a specific context
     */
    getContextShortcuts(context) {
        const contextMap = this.contextShortcuts.get(context);
        if (!contextMap)
            return [];
        const all = [];
        for (const actions of contextMap.values()) {
            all.push(...actions);
        }
        return all;
    }
    /**
     * Clear all shortcuts
     */
    clear() {
        this.shortcuts.clear();
        this.contextShortcuts.clear();
    }
    /**
     * Convert KeyEvent to string representation (e.g., 'C-s', 'M-q')
     */
    _keyEventToString(key) {
        let result = '';
        if (key.ctrl)
            result += 'C-';
        if (key.meta)
            result += 'M-';
        if (key.shift && key.name.length > 1)
            result += 'S-'; // Only add S- for special keys
        result += key.name;
        return result;
    }
    /**
     * Get human-readable description of a key combination
     */
    static formatKeyCombo(keyCombo) {
        const parts = keyCombo.split('-');
        const modifiers = [];
        let key = '';
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (part === 'C') {
                modifiers.push('Ctrl');
            }
            else if (part === 'M') {
                modifiers.push('Alt');
            }
            else if (part === 'S') {
                modifiers.push('Shift');
            }
            else {
                key = part;
            }
        }
        // Capitalize key name
        if (key.length === 1) {
            key = key.toUpperCase();
        }
        else {
            key = key.charAt(0).toUpperCase() + key.slice(1);
        }
        return modifiers.length > 0 ? `${modifiers.join('+')}+${key}` : key;
    }
}
