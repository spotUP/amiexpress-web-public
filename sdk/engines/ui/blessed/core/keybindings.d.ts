/**
 * KeyBindings - Global keyboard shortcut management
 *
 * Features:
 * - Register global shortcuts (Ctrl+S, Ctrl+Q, etc.)
 * - Context-aware shortcuts (different actions based on focused element)
 * - Conflict detection and resolution
 * - Customizable shortcuts
 */
import type { KeyEvent } from './types';
export interface ShortcutAction {
    keys: string[];
    description: string;
    action: () => void;
    context?: string;
    global?: boolean;
}
export declare class KeyBindings {
    private shortcuts;
    private contextShortcuts;
    /**
     * Register a global keyboard shortcut
     */
    register(action: ShortcutAction): void;
    /**
     * Unregister a keyboard shortcut
     */
    unregister(action: ShortcutAction): void;
    /**
     * Handle a key event and execute matching shortcuts
     * Returns true if a shortcut was executed
     */
    handle(key: KeyEvent, context?: string): boolean;
    /**
     * Get all registered shortcuts
     */
    getAllShortcuts(): ShortcutAction[];
    /**
     * Get shortcuts for a specific context
     */
    getContextShortcuts(context: string): ShortcutAction[];
    /**
     * Clear all shortcuts
     */
    clear(): void;
    /**
     * Convert KeyEvent to string representation (e.g., 'C-s', 'M-q')
     */
    private _keyEventToString;
    /**
     * Get human-readable description of a key combination
     */
    static formatKeyCombo(keyCombo: string): string;
}
