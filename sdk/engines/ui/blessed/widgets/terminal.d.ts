/**
 * Terminal - Simple terminal emulator widget
 * Note: This is a simplified browser-compatible version
 */
import { Box } from './box';
import type { ElementOptions } from '../core/types';
export interface TerminalOptions extends ElementOptions {
    shell?: string;
    args?: string[];
    env?: Record<string, string>;
    scrollback?: number;
    cursor?: string;
    cursorBlink?: boolean;
}
export declare class Terminal extends Box {
    private lines;
    private scrollback;
    private cursor;
    private cursorBlink;
    private cursorVisible;
    private cursorTimer;
    private currentLine;
    private cursorPosition;
    private history;
    private historyIndex;
    private prompt;
    constructor(options?: TerminalOptions);
    /**
     * Start cursor blinking
     */
    private startCursorBlink;
    /**
     * Stop cursor blinking
     */
    private stopCursorBlink;
    /**
     * Handle key press
     */
    private handleKey;
    /**
     * Execute the current line
     */
    private executeLine;
    /**
     * Write text to terminal
     */
    write(text: string): void;
    /**
     * Write a line to terminal
     */
    writeLine(text: string): void;
    /**
     * Update terminal display
     */
    private updateDisplay;
    /**
     * Clear terminal
     */
    clear(): void;
    /**
     * Reset terminal
     */
    reset(): void;
    /**
     * Set prompt
     */
    setPrompt(prompt: string): void;
    /**
     * Get prompt
     */
    getPrompt(): string;
    /**
     * Get history
     */
    getHistory(): string[];
    /**
     * Destroy and cleanup
     */
    destroy(): void;
}
