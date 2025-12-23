/**
 * Program - Terminal control and I/O layer
 *
 * Browser-adapted version of blessed Program class.
 * Handles all terminal control sequences, input parsing, and output buffering.
 */
import { EventEmitter } from './events';
import type { KeyEvent, MouseEvent } from './types';
export interface ProgramOptions {
    input?: any;
    output?: (data: string) => void;
    buffer?: boolean;
    zero?: boolean;
    terminal?: string;
    dump?: boolean;
    resizeTimeout?: number;
    title?: string;
}
/**
 * Program class - Low-level terminal control
 *
 * Provides methods for cursor control, colors, attributes, and input handling.
 * This is the foundation that Screen builds upon.
 */
export declare class Program extends EventEmitter {
    options: ProgramOptions;
    terminal: string;
    zero: boolean;
    cols: number;
    rows: number;
    private output;
    private _buf;
    private _flush;
    private _exiting;
    private _buffer;
    private _cursorHidden;
    private _cursorShape;
    private x;
    private y;
    private _attr;
    private _paused;
    private _readInput;
    private keyHandlers;
    private mouseHandlers;
    private _mouseEnabled;
    private _lastMouseEvent;
    constructor(options?: ProgramOptions);
    /**
     * Write data to output
     */
    write(data: string): void;
    /**
     * Flush buffered output
     */
    flush(): void;
    /**
     * Echo text (alias for write)
     */
    echo(text: string): void;
    /**
     * Show cursor
     */
    showCursor(): void;
    /**
     * Hide cursor
     */
    hideCursor(): void;
    /**
     * Set cursor position (0-indexed)
     */
    cup(row: number, col: number): void;
    /**
     * Move cursor to position (alias for cup)
     */
    pos(row: number, col: number): void;
    /**
     * Move cursor to column
     */
    cha(col: number): void;
    /**
     * Move cursor up
     */
    cuu(n?: number): void;
    /**
     * Move cursor down
     */
    cud(n?: number): void;
    /**
     * Move cursor forward
     */
    cuf(n?: number): void;
    /**
     * Move cursor backward
     */
    cub(n?: number): void;
    /**
     * Save cursor position
     */
    sc(): void;
    /**
     * Restore cursor position
     */
    rc(): void;
    /**
     * Set cursor shape
     */
    cursorShape(shape: 'block' | 'underline' | 'line', blink?: boolean): void;
    /**
     * Reset cursor shape
     */
    cursorReset(): void;
    /**
     * Clear screen
     */
    clear(): void;
    /**
     * Clear from cursor to end of screen
     */
    ed(param?: string): void;
    /**
     * Clear from cursor to end of line
     */
    el(param?: string): void;
    /**
     * Erase characters
     */
    ech(n?: number): void;
    /**
     * Insert lines
     */
    il(n?: number): void;
    /**
     * Delete lines
     */
    dl(n?: number): void;
    /**
     * Insert characters
     */
    ich(n?: number): void;
    /**
     * Delete characters
     */
    dch(n?: number): void;
    /**
     * Set scroll region
     */
    csr(top: number, bottom: number): void;
    /**
     * Reset scroll region
     */
    resetCursor(): void;
    /**
     * Scroll up
     */
    su(n?: number): void;
    /**
     * Scroll down
     */
    sd(n?: number): void;
    /**
     * Set SGR (Select Graphic Rendition) attributes
     */
    sgr(params: string | number | (string | number)[]): void;
    /**
     * Set foreground color
     */
    fg(color: string | number): void;
    /**
     * Set background color
     */
    bg(color: string | number): void;
    /**
     * Set bold
     */
    bold(): void;
    /**
     * Set underline
     */
    ul(enable?: boolean): void;
    /**
     * Set blink
     */
    blink(enable?: boolean): void;
    /**
     * Set inverse
     */
    inverse(enable?: boolean): void;
    /**
     * Set invisible
     */
    invisible(enable?: boolean): void;
    /**
     * Reset all attributes
     */
    reset(): void;
    /**
     * Normal (no bold, no dim)
     */
    normal(): void;
    /**
     * Use alternate screen buffer
     */
    alternateBuffer(): void;
    /**
     * Use normal screen buffer
     */
    normalBuffer(): void;
    /**
     * Switch to alternate buffer (alias)
     */
    smcup(): void;
    /**
     * Switch to normal buffer (alias)
     */
    rmcup(): void;
    /**
     * Enable mouse reporting
     */
    enableMouse(): void;
    /**
     * Disable mouse reporting
     */
    disableMouse(): void;
    /**
     * Bind mouse event handler
     */
    onMouse(handler: (event: MouseEvent) => void): void;
    /**
     * Unbind mouse event handler
     */
    offMouse(handler: (event: MouseEvent) => void): void;
    /**
     * Parse mouse event from input
     */
    private parseMouseEvent;
    private parseSGRMouse;
    private parseX10Mouse;
    /**
     * Bind key handler
     */
    key(keys: string | string[], handler: (ch: any, key: KeyEvent) => void): void;
    /**
     * Bind key handler (one-time)
     */
    onceKey(keys: string | string[], handler: (ch: any, key: KeyEvent) => void): void;
    /**
     * Unbind key handler
     */
    unkey(keys: string | string[], handler: (ch: any, key: KeyEvent) => void): void;
    /**
     * Parse key from input buffer
     */
    private parseKey;
    /**
     * Handle input data
     */
    _handleData(data: string): void;
    /**
     * Set terminal title
     */
    setTitle(title: string): void;
    /**
     * Resize terminal
     */
    resize(cols?: number, rows?: number): void;
    /**
     * Pause input
     */
    pause(): void;
    /**
     * Resume input
     */
    resume(): void;
    /**
     * Ring bell
     */
    bell(): void;
    /**
     * Destroy program and clean up
     */
    destroy(): void;
}
