/**
 * Screen class - Root container and rendering manager
 */
import { Element } from './element';
import { Program } from './program';
import type { ScreenOptions, KeyEvent } from './types';
export declare class Screen extends Element {
    private _width;
    private _height;
    focused: boolean;
    private _focused;
    program: Program;
    private output;
    private focusHistory;
    private savedFocus;
    private buffer;
    private lastBuffer;
    private dirty;
    private title;
    private cursorHidden;
    private cursorX;
    private cursorY;
    private keyHandlers;
    constructor(options?: ScreenOptions & {
        output?: (data: string) => void;
    });
    /**
     * Setup key event routing from Program to Screen
     */
    private setupKeyRouting;
    /**
     * Setup mouse event routing from Program to Elements
     */
    private setupMouseRouting;
    /**
     * Handle mouse event and route to appropriate elements
     */
    private handleMouseEvent;
    /**
     * Get all elements at screen coordinates
     */
    private getElementsAt;
    /**
     * Walk the element tree
     */
    private walk;
    /**
     * Enable mouse support on screen
     */
    enableMouse(): void;
    /**
     * Disable mouse support on screen
     */
    disableMouse(): void;
    private write;
    /**
     * Set screen dimensions based on user configuration
     * BBS Constraints:
     * - Width: Always 80 columns (classic BBS standard)
     * - Height: User-configurable (default 23 content + 2 prompts = 25 total max)
     *
     * @param linesPerScreen User's configured lines per screen (default 23)
     */
    setDimensions(linesPerScreen?: number): void;
    /**
     * Get current screen dimensions
     */
    getDimensions(): {
        width: number;
        height: number;
    };
    /**
     * Flush buffered output
     */
    flush(): void;
    private clearBuffers;
    /**
     * Allocate (create) a new blank buffer
     */
    alloc(): [number, string][][];
    /**
     * Reallocate buffers (called on resize)
     */
    realloc(): void;
    /**
     * Create a blank line
     */
    blankLine(ch?: string, attr?: number): [number, string][];
    clearRegion(xi: number, xl: number, yi: number, yl: number): void;
    fillRegion(attr: number, ch: string, xi: number, xl: number, yi: number, yl: number): void;
    /**
     * Pack attributes into 27-bit integer
     * Format: (flags << 18) | (fg << 9) | bg
     * Flags: bold(1), underline(2), blink(4), inverse(8), invisible(16)
     */
    private packAttr;
    /**
     * Unpack attributes from 27-bit integer
     */
    private unpackAttr;
    /**
     * Convert attribute to ANSI string
     */
    private attrToAnsi;
    /**
     * Parse style object to attribute code
     */
    private styleToAttr;
    render(): void;
    private _renderElement;
    private _renderContent;
    /**
     * Parse ANSI SGR parameters and update attribute
     */
    private _parseAnsiToAttr;
    private _renderBorder;
    private _dockBorders;
    private _renderAsciiLabel;
    private _getAngle;
    private _diff;
    draw(start: number, end: number): void;
    /**
     * Insert n blank buffer lines at position, pushing existing lines down
     */
    private _insertBufferLine;
    /**
     * Delete n buffer lines at position, pulling lines up
     */
    private _deleteBufferLine;
    /**
     * Insert n lines at bottom of region
     */
    insertBottomLines(top: number, bottom: number, n?: number): void;
    /**
     * Delete n lines from bottom of region
     */
    deleteBottomLines(top: number, bottom: number, n?: number): void;
    /**
     * Insert n lines at top of region
     */
    insertTopLines(top: number, bottom: number, n?: number): void;
    /**
     * Delete n lines from top of region
     */
    deleteTopLines(top: number, bottom: number, n?: number): void;
    /**
     * Scroll screen up by n lines
     */
    scrollUp(n?: number): void;
    /**
     * Scroll screen down by n lines
     */
    scrollDown(n?: number): void;
    /**
     * Insert n lines at y position within scroll region (buffer manipulation)
     * Neo-blessed compatible API - different from Element.insertLine which handles content
     */
    insertBufferLines(n: number, y: number, top: number, bottom: number): void;
    /**
     * Delete n lines at y position within scroll region (buffer manipulation)
     * Neo-blessed compatible API - different from Element.deleteLine which handles content
     */
    deleteBufferLines(n: number, y: number, top: number, bottom: number): void;
    /**
     * Insert line at top of scroll region (buffer manipulation)
     */
    insertBufferTop(top: number, bottom: number): void;
    /**
     * Insert line at bottom of scroll region (buffer manipulation)
     */
    insertBufferBottom(top: number, bottom: number): void;
    /**
     * Delete line at top of scroll region (buffer manipulation)
     */
    deleteBufferTop(top: number, bottom: number): void;
    /**
     * Delete line at bottom of scroll region (buffer manipulation)
     */
    deleteBufferBottom(top: number, bottom: number): void;
    /**
     * Set scroll region (uses terminal CSR)
     */
    setScrollRegion(top: number, bottom: number): void;
    /**
     * Reset scroll region
     */
    resetScrollRegion(): void;
    focusPush(element: Element): void;
    focusPop(): Element | null;
    saveFocus(): Element | null;
    restoreFocus(): Element | null;
    rewindFocus(): void;
    /**
     * Get all focusable elements in tree order
     */
    private _getFocusable;
    /**
     * Focus next focusable element
     */
    focusNext(): void;
    /**
     * Focus previous focusable element
     */
    focusPrevious(): void;
    /**
     * Alias for focusPrevious
     */
    focusPrev(): void;
    /**
     * Focus element at offset from current
     */
    focusOffset(offset: number): void;
    key(keys: string | string[], handler: (ch: any, key: KeyEvent) => void): void;
    onceKey(keys: string | string[], handler: (ch: any, key: KeyEvent) => void): void;
    unkey(keys: string | string[], handler: (ch: any, key: KeyEvent) => void): void;
    _handleKey(ch: any, key: KeyEvent): void;
    setTitle(title: string): void;
    showCursor(): void;
    hideCursor(): void;
    /**
     * Enter alternate buffer and initialize screen
     */
    enter(): void;
    /**
     * Leave alternate buffer and restore terminal
     */
    leave(): void;
    /**
     * Get currently focused element
     */
    getFocused(): Element | null;
    /**
     * Set focused element (called by Element.focus())
     */
    setFocused(element: Element | null): void;
    /**
     * Get width (overrides Element.width for Screen)
     */
    get width(): number;
    /**
     * Set width
     */
    set width(value: number);
    /**
     * Get height (overrides Element.height for Screen)
     */
    get height(): number;
    /**
     * Set height
     */
    set height(value: number);
    /**
     * Get terminal type
     */
    get terminal(): string;
    /**
     * Get number of columns
     */
    get cols(): number;
    /**
     * Set number of columns
     */
    set cols(value: number);
    /**
     * Get number of rows
     */
    get rows(): number;
    /**
     * Set number of rows
     */
    set rows(value: number);
    private _lockKeys;
    /**
     * Lock key handlers (prevent input processing)
     */
    lockKeys(): void;
    /**
     * Unlock key handlers
     */
    unlockKeys(): void;
    private _colorToCode;
    private _stripAnsi;
    /**
     * Clear entire screen
     */
    clear(): void;
    destroy(): void;
    /**
     * Handle input data (forward to program)
     */
    _handleData(data: string): void;
}
