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
    private _handlingData;
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
     * Insert characters (alias for ich)
     * EXACT from neo-blessed program.js lines 2798-2803
     */
    insertChars(param?: number): void;
    /**
     * Delete characters (alias for dch)
     * EXACT from neo-blessed program.js lines 2860-2863
     */
    deleteChars(param?: number): void;
    /**
     * Erase characters (alias for ech)
     * EXACT from neo-blessed program.js lines 2868-2871
     */
    eraseChars(param?: number): void;
    /**
     * Insert lines (alias for il)
     * EXACT from neo-blessed program.js lines 2844-2847
     */
    insertLines(param?: number): void;
    /**
     * Delete lines (alias for dl)
     * EXACT from neo-blessed program.js lines 2852-2855
     */
    deleteLines(param?: number): void;
    /**
     * Cursor Next Line (CNL)
     * EXACT from neo-blessed program.js lines 2809-2813
     */
    cnl(param?: number): void;
    cursorNextLine(param?: number): void;
    /**
     * Cursor Preceding Line (CPL)
     * EXACT from neo-blessed program.js lines 2819-2823
     */
    cpl(param?: number): void;
    cursorPrecedingLine(param?: number): void;
    /**
     * Cursor Character Absolute (CHA) - override existing cha with full implementation
     * EXACT from neo-blessed program.js lines 2828-2839
     */
    cursorCharAbsolute(param?: number): void;
    /**
     * Horizontal Position Absolute (HPA)
     * EXACT from neo-blessed program.js lines 2876-2884
     */
    hpa(param?: number): void;
    charPosAbsolute(param?: number): void;
    /**
     * Horizontal Position Relative (HPR)
     * EXACT from neo-blessed program.js lines 2890-2897
     */
    hpr(param?: number): void;
    /**
     * Save cursor position
     * EXACT from neo-blessed program.js lines 2011-2017
     */
    private savedX;
    private savedY;
    private _saved?;
    saveCursor(key?: string): void;
    /**
     * Restore cursor position
     * EXACT from neo-blessed program.js lines 2021-2027
     */
    restoreCursor(key?: string, hide?: boolean): void;
    /**
     * Save cursor locally (in memory)
     * EXACT from neo-blessed program.js lines 2030-2037
     */
    lsaveCursor(key?: string): void;
    /**
     * Restore cursor locally (from memory)
     * EXACT from neo-blessed program.js lines 2040-2054
     */
    lrestoreCursor(key?: string, hide?: boolean): void;
    /**
     * Line Height
     * EXACT from neo-blessed program.js lines 2057-2059
     */
    lineHeight(): void;
    /**
     * Tab Set
     * EXACT from neo-blessed program.js lines 2004-2006
     */
    tabSet(): void;
    /**
     * Reset colors
     * EXACT from neo-blessed program.js lines 2224-2233
     */
    resetColors(param?: string | number): void;
    /**
     * Set scroll region (alias for csr)
     * EXACT from neo-blessed program.js (decstbm)
     */
    setScrollRegion(top: number, bottom: number): void;
    decstbm(top: number, bottom: number): void;
    /**
     * Set Mode (SM) - CSI Pm h
     * Sets terminal modes (see VT100/ANSI documentation for mode numbers)
     * EXACT from neo-blessed program.js lines 3071-3075
     */
    sm(...params: (string | number)[]): void;
    /**
     * Set Mode (alias for sm)
     * EXACT from neo-blessed program.js lines 3071-3075
     */
    setMode(...params: (string | number)[]): void;
    /**
     * DEC Private Mode Set (DECSET) - CSI ? Pm h
     * Sets DEC private modes (e.g., ?25 for cursor visibility, ?47/?1049 for alt screen)
     * EXACT from neo-blessed program.js lines 3077-3080
     */
    decset(...params: (string | number)[]): void;
    /**
     * Reset Mode (RM) - CSI Pm l
     * Resets terminal modes
     * EXACT from neo-blessed program.js lines 3187-3191
     */
    rm(...params: (string | number)[]): void;
    /**
     * Reset Mode (alias for rm)
     * EXACT from neo-blessed program.js lines 3187-3191
     */
    resetMode(...params: (string | number)[]): void;
    /**
     * DEC Private Mode Reset (DECRST) - CSI ? Pm l
     * Resets DEC private modes
     * EXACT from neo-blessed program.js lines 3193-3196
     */
    decrst(...params: (string | number)[]): void;
    /**
     * Designate G0-G3 Character Set
     * ESC (,),*,+,-,. Designate G0-G2 Character Set
     * EXACT from neo-blessed program.js lines 2062-2149
     */
    charset(val: string | number, level?: number): void;
    /**
     * Enter alternate character set mode (DEC Special Graphics)
     * EXACT from neo-blessed program.js lines 2151-2155
     */
    smacs(): void;
    /**
     * Exit alternate character set mode
     * EXACT from neo-blessed program.js lines 2157-2161
     */
    rmacs(): void;
    /**
     * Invoke G1, G2, or G3 Character Set
     * ESC N/O/n/o/|/}/~ - Single Shift or Locking Shift
     * EXACT from neo-blessed program.js lines 2179-2198
     */
    setG(level: number): void;
    /**
     * Device Status Report (DSR) - CSI Ps n or CSI ? Ps n
     * Queries terminal status (cursor position, printer, keyboard, etc.)
     * EXACT from neo-blessed program.js lines 2755-2763
     *
     * NOTE: Response handling is simplified for browser environment.
     * Full terminal response parsing would require WebSocket message handling.
     */
    dsr(param?: string | number, callback?: (err?: Error, data?: any) => void, dec?: boolean): void;
    /**
     * Device Status Report (alias for dsr)
     */
    deviceStatus(param?: string | number, callback?: (err?: Error, data?: any) => void, dec?: boolean): void;
    /**
     * Get Cursor Position via Device Status Report
     * Sends CSI 6 n (Report Cursor Position)
     * EXACT from neo-blessed program.js lines 2765-2767
     *
     * NOTE: Response would be CSI r ; c R where r=row, c=column
     * Full parsing requires terminal response handler (deferred for browser)
     */
    getCursor(callback?: (err?: Error, data?: {
        x: number;
        y: number;
    }) => void): void;
    /**
     * Send Device Attributes (Primary DA) - CSI Ps c
     * Queries terminal identification and capabilities
     * EXACT from neo-blessed program.js lines 2934-2938
     *
     * Response format: CSI ? Pp ; Pv ; Pc c
     * - Pp = terminal type (0=VT100, 1=VT220, etc.)
     * - Pv = firmware version
     * - Pc = ROM cartridge number (usually 0)
     */
    da(param?: string | number, callback?: (err?: Error, data?: any) => void): void;
    /**
     * Send Device Attributes (alias for da)
     */
    sendDeviceAttributes(param?: string | number, callback?: (err?: Error, data?: any) => void): void;
    /**
     * Bind terminal response handler
     * NOTE: Simplified stub for browser environment
     *
     * In neo-blessed, this sets up stdin data parsing for terminal responses.
     * In browser, terminal responses come via WebSocket from BBS backend.
     * Full implementation would require integration with Screen/Socket event handling.
     * STUB from neo-blessed program.js lines 1005-1017
     */
    bindResponse(): void;
    /**
     * Send query and wait for terminal response
     * NOTE: Simplified stub for browser environment
     * STUB from neo-blessed program.js lines 1572-1618
     */
    response(name: string | ((err?: Error, data?: any) => void), text?: string | ((err?: Error, data?: any) => void), callback?: (err?: Error, data?: any) => void): void;
    private _boundResponse;
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
    private _inputBuffer;
    private _escTimer;
    /**
     * Handle input data
     */
    _handleData(data: string): void;
    /**
     * Helper to emit key events
     */
    private _emitKey;
    /**
     * Parse JSON mouse event from web frontend
     */
    private parseJsonMouseEvent;
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
