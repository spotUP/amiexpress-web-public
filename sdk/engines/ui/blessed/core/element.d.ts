/**
 * Base Element class - foundation for all widgets
 */
import { EventEmitter } from './events';
import type { ElementOptions, Position } from './types';
export declare class Element extends EventEmitter {
    options: ElementOptions;
    parent: Element | null;
    screen: any;
    children: Element[];
    position: Position;
    lpos?: Position;
    content: string;
    private _lines;
    private _contentDirty;
    visible: boolean;
    hidden: boolean;
    focused: boolean;
    destroyed: boolean;
    private childBase;
    private childOffset;
    private clickable;
    private keyable;
    private input;
    private _hovered;
    private _draggable?;
    private _dragMD?;
    private _dragM?;
    private _drag?;
    /**
     * Draggable property with setter that enables/disables dragging
     * EXACT from neo-blessed element.js: __defineSetter__('draggable', ...)
     */
    get draggable(): boolean;
    set draggable(value: boolean);
    constructor(options?: ElementOptions);
    private calcPos;
    private getPadding;
    private hasBorder;
    _getCoords(get?: boolean, noscroll?: boolean): Position | undefined;
    /**
     * Get calculated width (in columns)
     */
    get width(): number;
    /**
     * Get calculated height (in rows)
     */
    get height(): number;
    /**
     * Get left position (relative to parent)
     */
    get left(): number;
    /**
     * Get right position (relative to parent)
     */
    get right(): number;
    /**
     * Get top position (relative to parent)
     */
    get top(): number;
    /**
     * Get bottom position (relative to parent)
     */
    get bottom(): number;
    /**
     * Get absolute left position (screen coordinates)
     */
    get aleft(): number;
    /**
     * Get absolute right position (screen coordinates)
     */
    get aright(): number;
    /**
     * Get absolute top position (screen coordinates)
     */
    get atop(): number;
    /**
     * Get absolute bottom position (screen coordinates)
     */
    get abottom(): number;
    /**
     * Get absolute width (same as width)
     */
    get awidth(): number;
    /**
     * Get absolute height (same as height)
     */
    get aheight(): number;
    /**
     * Get relative left (0-1 range)
     */
    get rleft(): number;
    /**
     * Get relative top (0-1 range)
     */
    get rtop(): number;
    /**
     * Get relative width (0-1 range)
     */
    get rwidth(): number;
    /**
     * Get relative height (0-1 range)
     */
    get rheight(): number;
    /**
     * Get inner left (excluding border and padding)
     */
    get ileft(): number;
    /**
     * Get inner top (excluding border and padding)
     */
    get itop(): number;
    /**
     * Get inner width (excluding border, padding, and scrollbar)
     */
    get iwidth(): number;
    /**
     * Get inner height (excluding border and padding)
     */
    get iheight(): number;
    /**
     * Set absolute left position
     * EXACT from neo-blessed element.js lines 1312-1331
     */
    set aleft(val: number | string);
    /**
     * Set absolute right position
     * EXACT from neo-blessed element.js lines 1333-1339
     */
    set aright(val: number);
    /**
     * Set absolute top position
     * EXACT from neo-blessed element.js lines 1341-1360
     */
    set atop(val: number | string);
    /**
     * Set absolute bottom position
     * EXACT from neo-blessed element.js lines 1362-1368
     */
    set abottom(val: number);
    /**
     * Set relative left position (relative to parent)
     * EXACT from neo-blessed element.js lines 1370-1376
     */
    set rleft(val: number | string);
    /**
     * Set relative right position (relative to parent)
     * EXACT from neo-blessed element.js lines 1378-1383
     */
    set rright(val: number);
    /**
     * Set relative top position (relative to parent)
     * EXACT from neo-blessed element.js lines 1385-1391
     */
    set rtop(val: number | string);
    /**
     * Set relative bottom position (relative to parent)
     * EXACT from neo-blessed element.js lines 1393-1398
     */
    set rbottom(val: number);
    /**
     * Clear the element's rendered position on screen
     * EXACT from neo-blessed element.js lines 901-909
     */
    clearPos(get?: boolean, override?: boolean): void;
    setContent(content: string): void;
    /**
     * Process {center} tags and convert to centered text
     * CUSTOM EXTENSION: Blessed doesn't natively support {center} tags
     */
    private processCenterTags;
    getContent(): string;
    setText(text: string): void;
    getText(): string;
    insertLine(i: number, line: string): void;
    deleteLine(i: number): void;
    getLine(i: number): string;
    getLines(): string[];
    setLine(i: number, line: string): void;
    clearLine(i: number): void;
    unshiftLine(line: string): void;
    pushLine(line: string): void;
    insertTop(line: string): void;
    insertBottom(line: string): void;
    /**
     * Wrap text to fit within width, preserving ANSI codes
     */
    private _wrapContent;
    /**
     * Get text width without ANSI codes
     */
    private _textWidth;
    /**
     * Align text within width
     */
    private _alignLine;
    /**
     * Parse content with word wrapping and alignment
     */
    parseContent(content?: string): string[];
    /**
     * Get parsed lines (with wrapping and alignment)
     */
    getContentLines(): string[];
    /**
     * Measure content height (number of lines after wrapping)
     */
    getContentHeight(content?: string): number;
    /**
     * Measure content width (widest line after ANSI strip)
     */
    getContentWidth(content?: string): number;
    /**
     * Convert style object to attribute code
     * This is the main method widgets use to convert style → packed attributes
     */
    sattr(style: any): number;
    /**
     * Convert color name/value to number (0-255)
     */
    private _colorToNumber;
    /**
     * Convert hex color to 256-color palette (simplified)
     */
    private _hexToColor256;
    /**
     * Get style object from element options
     */
    getStyle(): any;
    /**
     * Set style property
     */
    setStyle(style: any): void;
    /**
     * Get attribute code for current style
     */
    getAttr(): number;
    append(element: Element): void;
    prepend(element: Element): void;
    remove(element: Element): void;
    insert(element: Element, i: number): void;
    insertBefore(element: Element, other: Element): void;
    insertAfter(element: Element, other: Element): void;
    detach(): void;
    private _propagateScreen;
    focus(): void;
    blur(): void;
    private _overlayId?;
    /**
     * Get unique overlay ID for this element (lazily generated)
     */
    private _getOverlayId;
    /**
     * Emit overlay event for web clients to render CSS opacity
     */
    private _emitOverlayEvent;
    show(): void;
    hide(): void;
    toggle(): void;
    setFront(): void;
    setBack(): void;
    scroll(offset: number): void;
    scrollTo(index: number): void;
    getScroll(): number;
    setScroll(index: number): void;
    getScrollHeight(): number;
    private _getScrollHeight;
    getScrollPerc(): number;
    setScrollPerc(perc: number): void;
    resetScroll(): void;
    /**
     * Screen event listeners tracking
     * EXACT from neo-blessed element.js lines 267-297
     */
    private _slisteners?;
    /**
     * Register event listener on screen and track it for cleanup
     * EXACT from neo-blessed element.js lines 267-271
     */
    onScreenEvent(type: string, handler: (...args: any[]) => void): void;
    /**
     * Register one-time event listener on screen and track it
     * EXACT from neo-blessed element.js lines 273-282
     */
    onceScreenEvent(type: string, handler: (...args: any[]) => void): void;
    /**
     * Remove event listener from screen
     * EXACT from neo-blessed element.js lines 284-297
     */
    removeScreenEvent(type: string, handler: (...args: any[]) => void): void;
    /**
     * Enable mouse events for this element
     */
    enableMouse(): void;
    /**
     * Disable mouse events
     */
    disableMouse(): void;
    /**
     * Enable keyboard events for this element
     */
    enableKeys(): void;
    /**
     * Disable keyboard events
     */
    disableKeys(): void;
    /**
     * Enable input mode (for text input widgets)
     */
    enableInput(): void;
    /**
     * Disable input mode
     */
    disableInput(): void;
    /**
     * Enable dragging for this element
     * EXACT from neo-blessed element.js lines 789-851
     */
    enableDrag(verify?: (data: any) => boolean): boolean;
    /**
     * Disable dragging
     * EXACT from neo-blessed element.js lines 853-861
     */
    disableDrag(): boolean;
    /**
     * Enable resizing for this element
     * Resize by dragging the bottom-right corner (last 2 chars of bottom row)
     */
    enableResize(callback?: (data: {
        width: number;
        height: number;
    }) => void): void;
    /**
     * Disable resizing
     */
    disableResize(): void;
    /**
     * Check if mouse position is over this element
     */
    hasMouseOver(x: number, y: number): boolean;
    /**
     * Set element as clickable
     */
    setClickable(clickable: boolean): void;
    /**
     * Set element as keyable
     */
    setKeyable(keyable: boolean): void;
    /**
     * Key handler - register a key binding
     */
    key(keys: string | string[], listener: (ch: any, key: any) => void): void;
    /**
     * Remove key handler
     */
    unkey(keys: string | string[], listener: (ch: any, key: any) => void): void;
    /**
     * Handle keypress event
     */
    onKeypress(ch: string, key: any): void;
    /**
     * Handle mouse event
     */
    onMouse(event: any): void;
    /**
     * Handle mouse leave
     */
    onMouseLeave(): void;
    render(): void;
    /**
     * Get border characters based on border type
     */
    private getBorderChars;
    /**
     * Render border around element
     */
    renderBorder(): void;
    /**
     * Render border with title/label
     */
    renderBorderWithLabel(): void;
    /**
     * Check if element has scrollbar
     */
    hasScrollbar(): boolean;
    /**
     * Render scrollbar
     */
    renderScrollbar(): void;
    /**
     * Check if element has shadow
     */
    hasShadow(): boolean;
    /**
     * Render shadow effect
     */
    renderShadow(): void;
    /**
     * Check if point is within element bounds
     */
    isInBounds(x: number, y: number): boolean;
    /**
     * Clip coordinates to element bounds
     */
    clipRegion(x1: number, x2: number, y1: number, y2: number): {
        x1: number;
        x2: number;
        y1: number;
        y2: number;
    } | null;
    /**
     * Mark element as needing re-render
     */
    markDirty(): void;
    /**
     * Clear element content area (fill with background)
     */
    clearContent(): void;
    /**
     * Get visible content lines (with scrolling applied)
     */
    getVisibleLines(): string[];
    /**
     * Render content text (called by subclasses)
     */
    renderContent(): void;
    /**
     * Render element and all children (full render)
     */
    renderElement(): void;
    /**
     * Get child element by name or index
     */
    get(name: string | number, recursive?: boolean): Element | null;
    /**
     * Get all descendant elements
     */
    getDescendants(): Element[];
    /**
     * Collect all descendants recursively (helper)
     */
    private _collectDescendantsHelper;
    /**
     * Check if this element has a specific ancestor
     */
    hasAncestor(element: Element): boolean;
    /**
     * Get element's index in parent's children array
     */
    getIndex(): number;
    /**
     * Set element's z-index (position in children array)
     */
    setIndex(index: number): void;
    /**
     * Get all ancestors up to root
     */
    getAncestors(): Element[];
    /**
     * Iterate over descendants with callback
     * EXACT from neo-blessed node.js lines 185-191
     */
    forDescendants(iter: (el: Element) => void, includeSelf?: boolean): void;
    /**
     * Iterate over ancestors with callback
     * EXACT from neo-blessed node.js lines 193-199
     */
    forAncestors(iter: (el: Element) => void, includeSelf?: boolean): void;
    /**
     * Collect descendants into array (alias for getDescendants for neo-blessed compat)
     * EXACT from neo-blessed node.js lines 201-207
     */
    collectDescendants(includeSelf?: boolean): Element[];
    /**
     * Collect ancestors into array (alias for getAncestors for neo-blessed compat)
     * EXACT from neo-blessed node.js lines 209-215
     */
    collectAncestors(includeSelf?: boolean): Element[];
    /**
     * Emit event to all descendants
     * EXACT from neo-blessed node.js lines 217-229
     */
    emitDescendants(...args: any[]): void;
    /**
     * Emit event to all ancestors
     * EXACT from neo-blessed node.js lines 231-243
     */
    emitAncestors(...args: any[]): void;
    /**
     * Check if element has a specific descendant
     * EXACT from neo-blessed node.js lines 245-257
     */
    hasDescendant(target: Element): boolean;
    /**
     * Set element label
     */
    setLabel(text: string): void;
    /**
     * Get element label
     */
    getLabel(): string | undefined;
    /**
     * Remove element label
     */
    removeLabel(): void;
    /**
     * Apply hover style to element
     */
    private applyHoverStyle;
    /**
     * Remove hover style from element
     */
    private removeHoverStyle;
    /**
     * Set hover style
     */
    setHover(style: any): void;
    /**
     * Get visual width of text (excluding ANSI codes)
     */
    strWidth(text: string): number;
    /**
     * Shrink box to fit content
     */
    shrinkBox(): void;
    /**
     * Get content without ANSI codes
     */
    getPlainContent(): string;
    /**
     * Measure text dimensions
     */
    measureText(text: string): {
        width: number;
        height: number;
    };
    /**
     * Get width of a single character (handles double-width characters)
     */
    charWidth(ch: string): number;
    /**
     * Get total width of string considering multi-width characters
     */
    textWidth(text: string): number;
    /**
     * Truncate text to fit width (considering multi-width chars)
     */
    truncateText(text: string, maxWidth: number, ellipsis?: string): string;
    /**
     * Insert text at cursor position
     */
    insertText(text: string, position?: number): void;
    /**
     * Delete text in range
     */
    deleteText(start: number, end: number): void;
    /**
     * Get cursor position from pixel coordinates
     */
    screenToContentPos(x: number, y: number): {
        line: number;
        col: number;
    };
    destroy(): void;
    free(): void;
}
//# sourceMappingURL=element.d.ts.map