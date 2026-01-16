/**
 * Screen class - Root container and rendering manager
 */
import { Element } from './element';
import { Program } from './program';
import { KeyBindings } from './keybindings';
import { ResponsiveLayoutManager } from './responsive-layout';
import type { ScreenOptions, KeyEvent } from './types';
export declare class Screen extends Element {
    options: ScreenOptions;
    private _width;
    private _height;
    focused: boolean;
    private _focused;
    program: Program;
    private output;
    private focusHistory;
    private focusStack;
    private savedFocus;
    private focusTrap;
    private buffer;
    private lastBuffer;
    private dirty;
    private _renderPending;
    private _renderTimer;
    private _dirtyMinX;
    private _dirtyMinY;
    private _dirtyMaxX;
    private _dirtyMaxY;
    private _mouseIndex;
    private _mouseIndexValid;
    private _hoveredElements;
    private title;
    private cursorHidden;
    private cursorX;
    private cursorY;
    private _cursorStyle;
    private _dragging;
    private keyHandlers;
    keyBindings: KeyBindings;
    private _contextMenuHandler;
    responsiveLayout: ResponsiveLayoutManager;
    private _responsive;
    private _locked;
    private _optimizedRendering;
    private _dirtyElements;
    private _fullRedrawNeeded;
    constructor(options?: ScreenOptions & {
        input?: any;
        output?: (data: string) => void;
        responsive?: boolean;
    });
    /**
     * Setup browser context menu prevention
     * This allows SDK doors to use right-click without the browser menu appearing
     */
    private setupBrowserContextMenu;
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
     * Determine and set the appropriate cursor style based on hovered elements
     */
    private updateCursorStyleForHover;
    /**
     * Get appropriate cursor style for an element based on its type and properties
     */
    private getCursorStyleForElement;
    private _rebuildMouseIndex;
    /**
     * Invalidate mouse index when elements move or change
     * Called by Element when positions change
     */
    invalidateMouseIndex(): void;
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
     * Get the rendered ANSI output from the program buffer
     */
    getOutput(): string;
    /**
     * Set screen dimensions based on user configuration
     * BBS Constraints (non-responsive mode):
     * - Width: 80 columns (classic BBS standard)
     * - Height: User-configurable (default 23 content + 2 prompts = 25 total max)
     *
     * @param linesPerScreen User's configured lines per screen (default 23)
     * @param width Optional width (only used in responsive mode)
     */
    setDimensions(linesPerScreen?: number, width?: number): void;
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
     * Force a full screen redraw on the next render by invalidating lastBuffer.
     * This ensures all cells are output to the terminal, which is useful after
     * destroying dialogs or overlays where remnants might otherwise persist.
     *
     * Call this before render() when transitioning between dialogs/overlays.
     */
    forceFullRedraw(): void;
    /**
     * Allocate (create) a new blank buffer
     */
    alloc(): [number, string][][];
    /**
     * Reallocate buffers (called on resize)
     */
    realloc(): void;
    /**
     * Lock the screen to prevent rendering during batch updates
     */
    lock(): void;
    /**
     * Unlock the screen and trigger a coordinated render
     */
    unlock(): void;
    /**
     * Enable optimized rendering for slow connections (modem/telnet)
     * This mode only redraws changed elements instead of clearing the full screen
     */
    enableOptimizedRendering(): void;
    /**
     * Disable optimized rendering (use full screen redraws)
     */
    disableOptimizedRendering(): void;
    /**
     * Check if optimized rendering is enabled
     */
    isOptimizedRenderingEnabled(): boolean;
    /**
     * Mark an element as needing redraw (for optimized rendering)
     */
    markDirtyElement(element: Element): void;
    /**
     * Request a full redraw on next render (for optimized rendering)
     */
    requestFullRedraw(): void;
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
     * EXACT 1:1 PORT from neo-blessed screen.js codeAttr() lines 1508-1572
     */
    private attrToAnsi;
    /**
     * Parse style object to attribute code
     */
    private styleToAttr;
    render(): void;
    private _doRender;
    private _renderElement;
    /**
     * Render shadow effect (EXACT 1:1 PORT FROM blessed element.js lines 2119-2145)
     * Uses colors.blend() with single argument to darken pixels
     */
    private _renderShadow;
    private _renderContent;
    /**
     * Parse ANSI SGR parameters and update attribute
     */
    private _parseAnsiToAttr;
    private _renderBorder;
    private _dockBorders;
    private _renderAsciiLabel;
    /**
     * Parse a label string with blessed tags and return styled characters
     * Handles tags like {cyan-fg}Text{/} and extracts attributes for each character
     */
    private _parseStyledLabel;
    /**
     * Convert a blessed tag name to a style object
     */
    private _tagToStyle;
    private _getAngle;
    private _markDirty;
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
    /**
     * Push current focus to stack and focus a new element
     */
    focusPush(element: Element): void;
    /**
     * Pop focus from stack and restore it
     */
    focusPop(): Element | null;
    saveFocus(): Element | null;
    restoreFocus(): Element | null;
    rewindFocus(): void;
    /**
     * Enable focus trapping within a container (for modals)
     * Tab/Shift+Tab will only cycle through elements within the container
     */
    trapFocus(container: Element): void;
    /**
     * Disable focus trapping and restore previous focus
     */
    releaseFocusTrap(): void;
    /**
     * Check if focus is currently trapped
     */
    isFocusTrapped(): boolean;
    /**
     * Get the current focus trap container (if any)
     */
    getFocusTrap(): Element | null;
    /**
     * Get all focusable elements in tree order, sorted by tabIndex
     * If focus is trapped, only returns elements within the trap container
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
    /**
     * Enable global key bindings (F12, Alt+M) to toggle mouse tracking.
     * Useful for allowing users to disable mouse capture for text selection.
     * @param callback Optional callback triggered on toggle, receives (enabled: boolean)
     */
    enableMouseToggle(callback?: (enabled: boolean) => void): void;
    key(keys: string | string[], handler: (ch: any, key: KeyEvent) => void): void;
    onceKey(keys: string | string[], handler: (ch: any, key: KeyEvent) => void): void;
    unkey(keys: string | string[], handler: (ch: any, key: KeyEvent) => void): void;
    _handleKey(ch: any, key: KeyEvent): void;
    setTitle(title: string): void;
    showCursor(): void;
    hideCursor(): void;
    /**
     * Set cursor style for web frontend (CSS cursor property)
     * Valid styles: 'default', 'pointer', 'text', 'move', 'grab', 'grabbing',
     *               'ew-resize', 'ns-resize', 'nesw-resize', 'nwse-resize',
     *               'col-resize', 'row-resize', 'crosshair', 'not-allowed'
     */
    setCursorStyle(style: string): void;
    /**
     * Get current cursor style
     */
    getCursorStyle(): string;
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
    /**
     * Resize the screen to new dimensions
     * Called when terminal size changes (e.g., browser window resize)
     */
    resize(cols: number, rows: number): void;
    private _colorToCode;
    private _stripAnsi;
    /**
     * Clear entire screen
     */
    clear(): void;
    /**
     * Spawn external program
     * NOTE: Browser environment stub - requires Node.js child_process
     * STUB from neo-blessed screen.js lines 1737-1798
     */
    spawn(file: string, args?: string[] | any, options?: any): any;
    /**
     * Execute external program and get success status
     * NOTE: Browser environment stub - requires Node.js child_process
     * STUB from neo-blessed screen.js lines 1800-1814
     */
    exec(file: string, args?: string[] | any, options?: any, callback?: (err: Error | null, success: boolean) => void): any;
    /**
     * Open text editor and return edited content
     * NOTE: Browser environment stub - requires Node.js fs and child_process
     * STUB from neo-blessed screen.js lines 1816-1864
     */
    readEditor(options?: string | any, callback?: (err: Error | null, data?: string) => void): void;
    /**
     * Display image using external image viewer
     * NOTE: Browser environment stub - requires Node.js child_process and external w3mimgdisplay
     * STUB from neo-blessed screen.js lines 1866-1904
     */
    displayImage(file: string, callback?: (err: Error | null, success?: boolean) => void): void;
    /**
     * Set visual effects (hover, blur, focus) on element
     * EXACT from neo-blessed screen.js lines 1906-1957
     */
    setEffects(el: Element | (() => Element), fel: Element | (() => Element) | null, over: string, out: string, effects: any, temp?: string): void;
    /**
     * Initialize hover text box
     * Creates tooltip-style box that appears on hover
     * EXACT from neo-blessed screen.js lines 615-672
     */
    _initHover(): void;
    private _hoverText;
    /**
     * Take screenshot of screen buffer as text
     * Returns ANSI/plain text representation of current screen
     * EXACT from neo-blessed screen.js lines 2108-2197
     */
    screenshot(xi?: number, xl?: number, yi?: number, yl?: number, term?: boolean): string;
    destroy(): void;
    /**
     * Handle input data (forward to program)
     */
    _handleData(data: string): void;
}
