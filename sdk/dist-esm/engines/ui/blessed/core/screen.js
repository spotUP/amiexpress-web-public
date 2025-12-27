/**
 * Screen class - Root container and rendering manager
 */
import { Element } from './element';
import { Program } from './program';
import { cursor, screen as screenAnsi, attrs, blend } from './colors';
import { KeyBindings } from './keybindings';
import { ResponsiveLayoutManager } from './responsive-layout';
export class Screen extends Element {
    constructor(options = {}) {
        // BBS Terminal Constraints:
        // - Width: Always 80 columns (classic BBS standard)
        // - Height: User-configurable via linesPerScreen (default 23, +2 for prompts = 25 total)
        const bbsWidth = 80;
        const bbsHeight = Math.min(options.height || 24, 25); // Max 25 rows total
        const style = { ...(options.style || {}) };
        if (style.bg === undefined) {
            style.bg = 'black';
        }
        super({
            ...options,
            style,
            left: 0,
            top: 0,
            width: bbsWidth,
            height: bbsHeight,
        });
        this._focused = null;
        // Focus history
        this.focusHistory = [];
        this.savedFocus = null;
        // Focus trapping (for modals)
        this.focusTrap = null;
        this.focusTrapSavedFocus = null;
        // Rendering state
        // Buffer format: [y][x] = [attr, char]
        // attr is 27-bit packed: (flags << 18) | (fg << 9) | bg
        this.buffer = [];
        this.lastBuffer = [];
        this.dirty = true;
        // Title
        this.title = '';
        // Cursor state
        this.cursorHidden = true;
        this.cursorX = 0;
        this.cursorY = 0;
        // Drag tracking (EXACT from neo-blessed screen.js)
        this._dragging = null;
        // Key handlers
        this.keyHandlers = new Map();
        // Global keyboard shortcuts
        this.keyBindings = new KeyBindings();
        // ============================================================================
        // Key Locking
        // ============================================================================
        this._lockKeys = false;
        this._hoverText = null;
        this._width = bbsWidth;
        this._height = bbsHeight;
        this.screen = this;
        // Set output callback (for backward compatibility)
        this.output = options.output || ((data) => {
            if (typeof process !== 'undefined' && process.stdout) {
                process.stdout.write(data);
            }
            else {
                console.log(data);
            }
        });
        // Create Program instance
        this.program = new Program({
            output: this.output,
            terminal: options.terminal || 'ansi',
            buffer: true,
            title: options.title,
        });
        // Set dimensions on program
        this.program.cols = this._width;
        this.program.rows = this._height;
        // Initialize buffers
        this.clearBuffers();
        // Set title
        if (options.title) {
            this.setTitle(options.title);
        }
        // Hide cursor by default
        if (this.cursorHidden) {
            this.write(cursor.hide);
        }
        // Initialize responsive layout manager
        const responsiveConfig = {
            enableAutoResize: options.responsive !== false,
            breakpoints: options.breakpoints,
        };
        this.responsiveLayout = new ResponsiveLayoutManager(this, responsiveConfig);
        // Setup event routing from program to screen/elements
        this.setupKeyRouting();
        this.setupMouseRouting();
    }
    // ============================================================================
    // Key Event Routing
    // ============================================================================
    /**
     * Setup key event routing from Program to Screen
     */
    setupKeyRouting() {
        // Listen to Program's keypress events
        this.program.on('keypress', (ch, key) => {
            this._handleKey(ch, key);
        });
    }
    // ============================================================================
    // Mouse Event Routing
    // ============================================================================
    /**
     * Setup mouse event routing from Program to Elements
     */
    setupMouseRouting() {
        // Listen to Program's mouse events
        this.program.on('mouse', (event) => {
            this.handleMouseEvent(event);
        });
    }
    /**
     * Handle mouse event and route to appropriate elements
     */
    handleMouseEvent(event) {
        console.log('[Screen] handleMouseEvent:', event.action, 'at', event.x, event.y);
        // Emit on screen first
        this.emit('mouse', event);
        // Find all elements under the mouse cursor
        const elements = this.getElementsAt(event.x, event.y);
        // Track which elements were hovered last time
        const lastHovered = new Set();
        this.walk((el) => {
            if (el._hovered) {
                lastHovered.add(el);
            }
        });
        // Current hovered elements
        const currentHovered = new Set(elements);
        // Emit mouseleave for elements no longer hovered
        for (const el of lastHovered) {
            if (!currentHovered.has(el)) {
                el.onMouseLeave();
            }
        }
        // Route event to elements (from top to bottom in z-order)
        for (const element of elements.reverse()) {
            element.onMouse(event);
            // Stop propagation if event was handled
            if (event.action === 'mousedown' && element.options.clickable) {
                break;
            }
        }
    }
    /**
     * Get all elements at screen coordinates
     */
    getElementsAt(x, y) {
        const elements = [];
        this.walk((el) => {
            if (el.hasMouseOver(x, y) && !el.hidden && el.visible) {
                elements.push(el);
            }
        });
        return elements;
    }
    /**
     * Walk the element tree
     */
    walk(callback) {
        const visit = (el) => {
            callback(el);
            for (const child of el.children) {
                visit(child);
            }
        };
        for (const child of this.children) {
            visit(child);
        }
    }
    /**
     * Enable mouse support on screen
     */
    enableMouse() {
        this.program.enableMouse();
    }
    /**
     * Disable mouse support on screen
     */
    disableMouse() {
        this.program.disableMouse();
    }
    // ============================================================================
    // Output
    // ============================================================================
    write(data) {
        this.program.write(data);
    }
    // ============================================================================
    // BBS Terminal Dimensions
    // ============================================================================
    /**
     * Set screen dimensions based on user configuration
     * BBS Constraints:
     * - Width: Always 80 columns (classic BBS standard)
     * - Height: User-configurable (default 23 content + 2 prompts = 25 total max)
     *
     * @param linesPerScreen User's configured lines per screen (default 23)
     */
    setDimensions(linesPerScreen) {
        const bbsWidth = 80; // Always 80 columns
        const contentLines = Math.min(linesPerScreen || 23, 23); // Max 23 content lines
        const bbsHeight = contentLines + 2; // +2 for prompts/status
        this._width = bbsWidth;
        this._height = bbsHeight;
        this.program.cols = bbsWidth;
        this.program.rows = bbsHeight;
        // Reinitialize buffers with new dimensions
        this.clearBuffers();
        this.dirty = true;
    }
    /**
     * Get current screen dimensions
     */
    getDimensions() {
        return {
            width: this._width,
            height: this._height
        };
    }
    /**
     * Flush buffered output
     */
    flush() {
        this.program.flush();
    }
    // ============================================================================
    // Buffer Management
    // ============================================================================
    clearBuffers() {
        this.buffer = [];
        this.lastBuffer = [];
        for (let y = 0; y < this.height; y++) {
            this.buffer[y] = [];
            this.lastBuffer[y] = [];
            for (let x = 0; x < this.width; x++) {
                // Default: no attributes (0x000), space character
                this.buffer[y][x] = [0x000, ' '];
                this.lastBuffer[y][x] = [0x000, ' '];
            }
        }
    }
    /**
     * Force a full screen redraw on the next render by invalidating lastBuffer.
     * This ensures all cells are output to the terminal, which is useful after
     * destroying dialogs or overlays where remnants might otherwise persist.
     *
     * Call this before render() when transitioning between dialogs/overlays.
     */
    forceFullRedraw() {
        // Set lastBuffer to an impossible state (attr=-1) so _diff will output all cells
        for (let y = 0; y < this.height; y++) {
            if (!this.lastBuffer[y])
                continue;
            for (let x = 0; x < this.width; x++) {
                this.lastBuffer[y][x] = [-1, '\x00'];
            }
        }
    }
    /**
     * Allocate (create) a new blank buffer
     */
    alloc() {
        const buf = [];
        for (let y = 0; y < this.height; y++) {
            buf[y] = [];
            for (let x = 0; x < this.width; x++) {
                buf[y][x] = [0x000, ' '];
            }
        }
        return buf;
    }
    /**
     * Reallocate buffers (called on resize)
     */
    realloc() {
        const obuf = this.buffer;
        const oline = this.lastBuffer;
        this.buffer = this.alloc();
        this.lastBuffer = this.alloc();
        // Copy old content
        for (let y = 0; y < Math.min(this.height, obuf.length); y++) {
            for (let x = 0; x < Math.min(this.width, obuf[y].length); x++) {
                this.buffer[y][x] = obuf[y][x];
                this.lastBuffer[y][x] = oline[y][x];
            }
        }
    }
    /**
     * Create a blank line
     */
    blankLine(ch = ' ', attr = 0x000) {
        const line = [];
        for (let x = 0; x < this.width; x++) {
            line[x] = [attr, ch];
        }
        return line;
    }
    clearRegion(xi, xl, yi, yl) {
        for (let y = yi; y < yl; y++) {
            if (y < 0 || y >= this.height)
                continue;
            for (let x = xi; x < xl; x++) {
                if (x < 0 || x >= this.width)
                    continue;
                this.buffer[y][x] = [0x000, ' '];
            }
        }
    }
    fillRegion(attr, ch, xi, xl, yi, yl) {
        // Check if background is transparent (0x1ff = no color)
        const bgColor = attr & 0x1ff;
        const isTransparentBg = bgColor === 0x1ff;
        for (let y = yi; y < yl; y++) {
            if (y < 0 || y >= this.height)
                continue;
            for (let x = xi; x < xl; x++) {
                if (x < 0 || x >= this.width)
                    continue;
                if (isTransparentBg) {
                    // For transparent background with space character, skip entirely
                    // This preserves both the existing character AND background (true transparency)
                    if (ch === ' ' || ch === '') {
                        // Don't modify buffer at all - leave existing content visible
                        continue;
                    }
                    // For transparent bg with actual content, preserve bg but update character
                    const existingAttr = this.buffer[y][x][0];
                    const existingBg = existingAttr & 0x1ff;
                    // Combine new fg/flags with existing bg
                    const newAttr = (attr & ~0x1ff) | existingBg;
                    this.buffer[y][x] = [newAttr, ch];
                }
                else {
                    this.buffer[y][x] = [attr, ch];
                }
            }
        }
    }
    // ============================================================================
    // Attribute Packing/Unpacking
    // ============================================================================
    /**
     * Pack attributes into 27-bit integer
     * Format: (flags << 18) | (fg << 9) | bg
     * Flags: bold(1), underline(2), blink(4), inverse(8), invisible(16)
     */
    packAttr(flags, fg, bg) {
        return (flags << 18) | (fg << 9) | bg;
    }
    /**
     * Unpack attributes from 27-bit integer
     */
    unpackAttr(attr) {
        return {
            flags: (attr >> 18) & 0x1ff,
            fg: (attr >> 9) & 0x1ff,
            bg: attr & 0x1ff,
        };
    }
    /**
     * Convert attribute to ANSI string
     * EXACT 1:1 PORT from neo-blessed screen.js codeAttr() lines 1508-1572
     */
    attrToAnsi(attr) {
        const flags = (attr >> 18) & 0x1ff;
        let fg = (attr >> 9) & 0x1ff;
        let bg = attr & 0x1ff;
        // CRITICAL: Start with reset (SGR 0) to clear ALL previous attributes.
        // This ensures no bold/underline/inverse/etc. bleeding between cells.
        let out = '0;';
        // Flags (bold, underline, etc.)
        if (flags & 1)
            out += '1;'; // bold
        if (flags & 2)
            out += '4;'; // underline
        if (flags & 4)
            out += '5;'; // blink
        if (flags & 8)
            out += '7;'; // inverse
        if (flags & 16)
            out += '8;'; // invisible
        // Background color - ALWAYS explicitly set
        // BBS terminals expect black background by default, but web terminals often default to white.
        // We must ALWAYS emit an explicit background color, never rely on terminal default.
        if (bg === 0x1ff) {
            // Default/transparent bg -> use black (40) for BBS compatibility
            out += '40;';
        }
        else if (bg < 16) {
            if (bg < 8) {
                out += (bg + 40) + ';'; // Standard bg: 40-47
            }
            else {
                out += ((bg - 8) + 100) + ';'; // Bright bg: 100-107
            }
        }
        else {
            // 256-color mode for bg
            out += '48;5;' + bg + ';';
        }
        // Foreground color - ALWAYS explicitly set
        // Use white (37) as default fg for visibility on black background
        if (fg === 0x1ff) {
            // Default fg -> use white (37) for BBS compatibility on black bg
            out += '37;';
        }
        else if (fg < 16) {
            if (fg < 8) {
                out += (fg + 30) + ';'; // Standard fg: 30-37
            }
            else {
                out += ((fg - 8) + 90) + ';'; // Bright fg: 90-97
            }
        }
        else {
            // 256-color mode for fg
            out += '38;5;' + fg + ';';
        }
        // Remove trailing semicolon
        if (out[out.length - 1] === ';')
            out = out.slice(0, -1);
        return '\x1b[' + out + 'm';
    }
    /**
     * Parse style object to attribute code
     */
    styleToAttr(style) {
        let flags = 0;
        let fgCode = 0x1ff; // Default: no color
        let bgCode = 0; // Default background: black for BBS consistency
        if (style.bold)
            flags |= 1;
        if (style.underline)
            flags |= 2;
        if (style.blink)
            flags |= 4;
        if (style.inverse)
            flags |= 8;
        if (style.invisible)
            flags |= 16;
        if (style.fg !== undefined) {
            fgCode = this._colorToCode(style.fg);
        }
        if (style.bg !== undefined) {
            bgCode = this._colorToCode(style.bg);
        }
        return this.packAttr(flags, fgCode, bgCode);
    }
    // ============================================================================
    // Rendering
    // ============================================================================
    render() {
        if (this.destroyed)
            return;
        // On first render, reset all terminal attributes to ensure clean state
        // This prevents leftover colors from previous screens affecting our output
        if (!this._hasRendered) {
            this._hasRendered = true;
            // Reset all attributes and clear screen
            this.write('\x1b[0m'); // Reset all attributes
            this.write('\x1b[2J'); // Clear screen
            this.write('\x1b[H'); // Move cursor to home
        }
        // Clear buffer with default attribute
        // CRITICAL FIX: Use bg=0 (black) instead of bg=0x1ff (transparent) for BBS consistency
        // Original neo-blessed uses 0x1ff which results in NO background ANSI code,
        // causing elements to use terminal's default background (not always black).
        // BBS doors expect black background by default.
        const dattr = ((0 << 18) | (0x1ff << 9)) | 0; // fg=0x1ff (default), bg=0 (black)
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                this.buffer[y][x] = [dattr, ' '];
            }
        }
        // Render all children recursively
        this._renderElement(this);
        // Dock borders if enabled
        if (this.options.dockBorders) {
            this._dockBorders();
        }
        // Diff and draw
        this._diff();
        // Mark as clean
        this.dirty = false;
        this.emit('render');
    }
    _renderElement(element) {
        if (!element.visible || element.hidden || element.destroyed) {
            return;
        }
        // Calculate position
        const pos = element._getCoords();
        if (!pos)
            return;
        // Render shadow FIRST (behind the element)
        if (element.options.shadow) {
            this._renderShadow(pos);
        }
        // Render element content
        this._renderContent(element, pos);
        // Render border
        if (element.options.border) {
            this._renderBorder(element, pos);
        }
        // Render scrollbar if element has one
        if (element.hasScrollbar?.() && element.renderScrollbar) {
            element.renderScrollbar();
        }
        // Render children
        for (const child of element.children) {
            this._renderElement(child);
        }
    }
    /**
     * Render shadow effect (EXACT 1:1 PORT FROM blessed element.js lines 2119-2145)
     * Uses colors.blend() with single argument to darken pixels
     */
    _renderShadow(pos) {
        const { xi, xl, yi, yl } = pos;
        // Right shadow (exactly from blessed)
        let y = Math.max(yi + 1, 0);
        for (; y < yl + 1; y++) {
            if (!this.buffer[y])
                break;
            let x = xl;
            for (; x < xl + 2; x++) {
                if (!this.buffer[y][x])
                    break;
                // blessed: lines[y][x][0] = colors.blend(lines[y][x][0])
                this.buffer[y][x][0] = blend(this.buffer[y][x][0]);
            }
        }
        // Bottom shadow (exactly from blessed)
        y = yl;
        for (; y < yl + 1; y++) {
            if (!this.buffer[y])
                break;
            for (let x = Math.max(xi + 1, 0); x < xl; x++) {
                if (!this.buffer[y][x])
                    break;
                // blessed: lines[y][x][0] = colors.blend(lines[y][x][0])
                this.buffer[y][x][0] = blend(this.buffer[y][x][0]);
            }
        }
    }
    _renderContent(element, pos) {
        // Use getVisibleLines() to respect scroll position (childBase)
        const lines = element.getVisibleLines ? element.getVisibleLines() : element.getLines();
        const padding = element.options.padding || 0;
        const hasBorder = element.options.border && element.options.border?.type !== 'none';
        const border = hasBorder ? 1 : 0;
        const padLeft = typeof padding === 'number' ? padding : padding.left || 0;
        const padTop = typeof padding === 'number' ? padding : padding.top || 0;
        const padBottom = typeof padding === 'number' ? padding : padding.bottom || 0;
        const padRight = typeof padding === 'number' ? padding : padding.right || 0;
        const startY = pos.yi + border + padTop;
        const startX = pos.xi + border + padLeft;
        const maxY = pos.yl - border - padBottom;
        const maxX = pos.xl - border - padRight;
        // BBS Constraint: Enforce 80-column width limit
        const bbsMaxX = Math.min(maxX, 80);
        // Get base style attribute code
        const style = element.options.style || {};
        const baseAttr = this.styleToAttr(style);
        // Check for neo-blessed style transparency (color blending at 50% opacity)
        const isBlendTransparent = !!style.transparent;
        // Fill background (for elements without borders, this is essential for visibility)
        // BUT skip if background is transparent (0x1ff) - preserve existing content
        const bgColor = baseAttr & 0x1ff;
        const isTransparentBg = bgColor === 0x1ff;
        const fillChar = element.options.ch || ' ';
        if (isBlendTransparent) {
            // Neo-blessed style: blend colors at 50% opacity
            // Keep underlying characters visible, only blend the color attributes
            // EXACT from neo-blessed element.js line 1945: colors.blend(attr, lines[y][x][0])
            for (let y = startY; y < maxY; y++) {
                if (y < 0 || y >= this.height)
                    continue;
                for (let x = startX; x < bbsMaxX; x++) {
                    if (x < 0 || x >= this.width)
                        continue;
                    const existingAttr = this.buffer[y][x][0];
                    const existingChar = this.buffer[y][x][1];
                    // Two arguments = transparency mode (blends at 50% alpha by default)
                    const blendedAttr = blend(baseAttr, existingAttr);
                    this.buffer[y][x] = [blendedAttr, existingChar];
                }
            }
        }
        else if (!isTransparentBg) {
            // Normal fill - overwrite buffer
            for (let y = startY; y < maxY; y++) {
                if (y < 0 || y >= this.height)
                    continue;
                for (let x = startX; x < bbsMaxX; x++) {
                    if (x < 0 || x >= this.width)
                        continue;
                    this.buffer[y][x] = [baseAttr, fillChar];
                }
            }
        }
        // If transparent bg (not blend), skip fill entirely - preserve existing buffer content
        // Render lines
        for (let i = 0; i < lines.length; i++) {
            const y = startY + i;
            if (y < 0 || y >= this.height || y >= maxY)
                continue;
            const line = lines[i];
            // Parse line with ANSI codes and render character by character
            let currentAttr = baseAttr;
            let x = startX;
            let idx = 0;
            while (idx < line.length && x < bbsMaxX) {
                // Check for ANSI escape sequence
                if (line[idx] === '\x1b' && line[idx + 1] === '[') {
                    // Parse ANSI sequence
                    let end = idx + 2;
                    while (end < line.length && !/[mK]/.test(line[end])) {
                        end++;
                    }
                    if (end < line.length && line[end] === 'm') {
                        // Extract SGR parameters
                        const params = line.slice(idx + 2, end);
                        currentAttr = this._parseAnsiToAttr(params, currentAttr, baseAttr);
                        idx = end + 1;
                        continue;
                    }
                    // Skip unknown sequences
                    idx = end + 1;
                    continue;
                }
                // Regular character - write to buffer
                if (x >= 0 && x < this.width) {
                    if (isBlendTransparent) {
                        // Blend text color with existing content
                        // EXACT from neo-blessed element.js line 2076: colors.blend(attr, lines[y][x][0])
                        const existingAttr = this.buffer[y][x][0];
                        // Two arguments = transparency mode (blends at 50% alpha by default)
                        const blendedAttr = blend(currentAttr, existingAttr);
                        this.buffer[y][x] = [blendedAttr, line[idx]];
                    }
                    else {
                        this.buffer[y][x] = [currentAttr, line[idx]];
                    }
                }
                x++;
                idx++;
            }
        }
    }
    /**
     * Parse ANSI SGR parameters and update attribute
     */
    _parseAnsiToAttr(params, currentAttr, baseAttr) {
        const rawCodes = params.length ? params.split(';') : ['0'];
        const codes = rawCodes.map((value) => {
            const parsed = parseInt(value, 10);
            return Number.isNaN(parsed) ? 0 : parsed;
        });
        let { flags, fg, bg } = this.unpackAttr(currentAttr);
        const base = this.unpackAttr(baseAttr);
        for (let i = 0; i < codes.length; i++) {
            const code = codes[i];
            if (code === 0) {
                flags = base.flags;
                fg = base.fg;
                bg = base.bg;
            }
            else if (code === 1) {
                flags |= 1; // bold
            }
            else if (code === 4) {
                flags |= 2; // underline
            }
            else if (code === 5) {
                flags |= 4; // blink
            }
            else if (code === 7) {
                flags |= 8; // inverse
            }
            else if (code === 8) {
                flags |= 16; // invisible
            }
            else if (code === 22) {
                flags &= ~1; // normal intensity
            }
            else if (code === 24) {
                flags &= ~2; // underline off
            }
            else if (code === 25) {
                flags &= ~4; // blink off
            }
            else if (code === 27) {
                flags &= ~8; // inverse off
            }
            else if (code === 28) {
                flags &= ~16; // visible
            }
            else if (code >= 30 && code <= 37) {
                fg = code - 30; // foreground color 0-7
            }
            else if (code >= 90 && code <= 97) {
                fg = code - 90 + 8; // bright foreground
            }
            else if (code === 39) {
                fg = base.fg;
            }
            else if (code >= 40 && code <= 47) {
                bg = code - 40; // background color 0-7
            }
            else if (code >= 100 && code <= 107) {
                bg = code - 100 + 8; // bright background
            }
            else if (code === 49) {
                bg = base.bg;
            }
            else if (code === 38 && codes[i + 1] === 5 && typeof codes[i + 2] === 'number') {
                fg = Math.max(0, Math.min(255, codes[i + 2]));
                i += 2;
            }
            else if (code === 48 && codes[i + 1] === 5 && typeof codes[i + 2] === 'number') {
                bg = Math.max(0, Math.min(255, codes[i + 2]));
                i += 2;
            }
        }
        return this.packAttr(flags, fg, bg);
    }
    _renderBorder(element, pos) {
        const border = element.options.border;
        if (!border)
            return;
        const borderType = typeof border === 'string' ? border : border?.type || 'line';
        if (borderType === 'none')
            return;
        const borderChars = {
            line: { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│' },
            heavy: { tl: '┏', tr: '┓', bl: '┗', br: '┛', h: '━', v: '┃' },
            double: { tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║' },
            round: { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' },
            ascii: { tl: '.', tr: '.', bl: '`', br: '\'', h: '-', v: '|' },
            bg: { tl: ' ', tr: ' ', bl: ' ', br: ' ', h: ' ', v: ' ' },
        };
        const chars = borderChars[borderType] ?? borderChars.line;
        // Get border style attribute
        // EXACT from neo-blessed element.js line 2137: battr = this.sattr(this.style.border)
        // If style.border is undefined, use empty object (NOT element.style) to get default colors
        const borderStyle = element.options.style?.border;
        const attr = this.styleToAttr(borderStyle || {});
        // Label uses border style if available, otherwise default
        const labelStyle = typeof border === 'object' && border.labelStyle
            ? border.labelStyle
            : borderStyle || {};
        const labelAttr = this.styleToAttr(labelStyle);
        // Top border
        if (pos.yi >= 0 && pos.yi < this.height) {
            for (let x = pos.xi; x < pos.xl; x++) {
                if (x < 0 || x >= this.width)
                    continue;
                let ch = chars.h;
                if (x === pos.xi)
                    ch = chars.tl;
                else if (x === pos.xl - 1)
                    ch = chars.tr;
                this.buffer[pos.yi][x] = [attr, ch];
            }
        }
        // Bottom border
        if (pos.yl - 1 >= 0 && pos.yl - 1 < this.height) {
            for (let x = pos.xi; x < pos.xl; x++) {
                if (x < 0 || x >= this.width)
                    continue;
                let ch = chars.h;
                if (x === pos.xi)
                    ch = chars.bl;
                else if (x === pos.xl - 1)
                    ch = chars.br;
                this.buffer[pos.yl - 1][x] = [attr, ch];
            }
        }
        // Left and right borders
        for (let y = pos.yi + 1; y < pos.yl - 1; y++) {
            if (y < 0 || y >= this.height)
                continue;
            if (pos.xi >= 0 && pos.xi < this.width) {
                this.buffer[y][pos.xi] = [attr, chars.v];
            }
            if (pos.xl - 1 >= 0 && pos.xl - 1 < this.width) {
                this.buffer[y][pos.xl - 1] = [attr, chars.v];
            }
        }
        // Label
        if (element.options.label) {
            const rawLabel = String(element.options.label).trim();
            if (borderType === 'ascii') {
                this._renderAsciiLabel(pos, rawLabel, labelAttr, attr);
            }
            else {
                const labelText = ` ${rawLabel} `;
                let x = pos.xi + 2;
                for (let i = 0; i < labelText.length && x < pos.xl - 1; i += 1, x += 1) {
                    if (x >= 0 && x < this.width) {
                        this.buffer[pos.yi][x] = [labelAttr, labelText[i]];
                    }
                }
            }
        }
    }
    _dockBorders() {
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const ch = this.buffer[y][x][1];
                if (!ANGLES[ch])
                    continue;
                this.buffer[y][x][1] = this._getAngle(this.buffer, x, y, ch);
            }
        }
    }
    _renderAsciiLabel(pos, label, labelAttr, borderAttr) {
        if (!label)
            return;
        const text = `[ ${label} ]`;
        const maxWidth = Math.max(0, pos.xl - pos.xi - 2);
        const truncated = text.length > maxWidth ? text.slice(0, maxWidth) : text;
        const minStart = pos.xi + 3;
        const maxStart = Math.max(pos.xi + 1, pos.xl - truncated.length - 1);
        const start = minStart <= maxStart ? minStart : maxStart;
        for (let i = 0; i < truncated.length && start + i < pos.xl - 1; i += 1) {
            const x = start + i;
            if (x >= 0 && x < this.width) {
                this.buffer[pos.yi][x] = [labelAttr, truncated[i]];
            }
        }
        for (let x = pos.xi + 1; x < start && x < this.width; x += 1) {
            if (x >= 0) {
                this.buffer[pos.yi][x] = [borderAttr, '-'];
            }
        }
        const end = start + truncated.length;
        for (let x = end; x < pos.xl - 1 && x < this.width; x += 1) {
            if (x >= 0) {
                this.buffer[pos.yi][x] = [borderAttr, '-'];
            }
        }
    }
    _getAngle(lines, x, y, fallback) {
        let angle = 0;
        const attr = lines[y][x][0];
        if (lines[y][x - 1] && L_ANGLES[lines[y][x - 1][1]]) {
            if (!this.options.ignoreDockContrast && lines[y][x - 1][0] !== attr) {
                return fallback;
            }
            angle |= 1 << 3;
        }
        if (lines[y - 1] && U_ANGLES[lines[y - 1][x][1]]) {
            if (!this.options.ignoreDockContrast && lines[y - 1][x][0] !== attr) {
                return fallback;
            }
            angle |= 1 << 2;
        }
        if (lines[y][x + 1] && R_ANGLES[lines[y][x + 1][1]]) {
            if (!this.options.ignoreDockContrast && lines[y][x + 1][0] !== attr) {
                return fallback;
            }
            angle |= 1 << 1;
        }
        if (lines[y + 1] && D_ANGLES[lines[y + 1][x][1]]) {
            if (!this.options.ignoreDockContrast && lines[y + 1][x][0] !== attr) {
                return fallback;
            }
            angle |= 1 << 0;
        }
        return ANGLE_TABLE[angle] || fallback;
    }
    _diff() {
        let output = '';
        let lastX = -1;
        let lastY = -1;
        let lastAttr = -1;
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const [attr, ch] = this.buffer[y][x];
                const [lastAttrCell, lastCh] = this.lastBuffer[y][x];
                if (attr !== lastAttrCell || ch !== lastCh) {
                    // Position cursor if needed
                    if (x !== lastX + 1 || y !== lastY) {
                        output += cursor.pos(x, y);
                    }
                    // Change attributes if needed
                    if (attr !== lastAttr) {
                        output += this.attrToAnsi(attr);
                        lastAttr = attr;
                    }
                    // Write character
                    output += ch;
                    this.lastBuffer[y][x] = [attr, ch];
                    lastX = x;
                    lastY = y;
                }
            }
        }
        if (output.length > 0) {
            this.write(output);
        }
    }
    draw(start, end) {
        this.render();
    }
    // ============================================================================
    // Line Manipulation (Scrolling Support)
    // ============================================================================
    /**
     * Insert n blank buffer lines at position, pushing existing lines down
     */
    _insertBufferLine(n, y, top, bottom) {
        if (n <= 0)
            return;
        // Shift lines down
        for (let i = bottom - 1; i >= y + n; i--) {
            this.buffer[i] = this.buffer[i - n];
            this.lastBuffer[i] = this.lastBuffer[i - n];
        }
        // Fill new lines with blanks
        for (let i = y; i < y + n; i++) {
            this.buffer[i] = this.blankLine();
            this.lastBuffer[i] = this.blankLine();
        }
    }
    /**
     * Delete n buffer lines at position, pulling lines up
     */
    _deleteBufferLine(n, y, top, bottom) {
        if (n <= 0)
            return;
        // Shift lines up
        for (let i = y; i < bottom - n; i++) {
            this.buffer[i] = this.buffer[i + n];
            this.lastBuffer[i] = this.lastBuffer[i + n];
        }
        // Fill bottom lines with blanks
        for (let i = bottom - n; i < bottom; i++) {
            this.buffer[i] = this.blankLine();
            this.lastBuffer[i] = this.blankLine();
        }
    }
    /**
     * Insert n lines at bottom of region
     */
    insertBottomLines(top, bottom, n = 1) {
        this._insertBufferLine(n, bottom - n, top, bottom);
    }
    /**
     * Delete n lines from bottom of region
     */
    deleteBottomLines(top, bottom, n = 1) {
        this._deleteBufferLine(n, bottom - n, top, bottom);
    }
    /**
     * Insert n lines at top of region
     */
    insertTopLines(top, bottom, n = 1) {
        this._insertBufferLine(n, top, top, bottom);
    }
    /**
     * Delete n lines from top of region
     */
    deleteTopLines(top, bottom, n = 1) {
        this._deleteBufferLine(n, top, top, bottom);
    }
    /**
     * Scroll screen up by n lines
     */
    scrollUp(n = 1) {
        this.deleteTopLines(0, this.height, n);
    }
    /**
     * Scroll screen down by n lines
     */
    scrollDown(n = 1) {
        this.insertTopLines(0, this.height, n);
    }
    /**
     * Insert n lines at y position within scroll region (buffer manipulation)
     * Neo-blessed compatible API - different from Element.insertLine which handles content
     */
    insertBufferLines(n, y, top, bottom) {
        this._insertBufferLine(n, y, top, bottom);
    }
    /**
     * Delete n lines at y position within scroll region (buffer manipulation)
     * Neo-blessed compatible API - different from Element.deleteLine which handles content
     */
    deleteBufferLines(n, y, top, bottom) {
        this._deleteBufferLine(n, y, top, bottom);
    }
    /**
     * Insert line at top of scroll region (buffer manipulation)
     */
    insertBufferTop(top, bottom) {
        this.insertBufferLines(1, top, top, bottom);
    }
    /**
     * Insert line at bottom of scroll region (buffer manipulation)
     */
    insertBufferBottom(top, bottom) {
        this.deleteBufferLines(1, top, top, bottom);
    }
    /**
     * Delete line at top of scroll region (buffer manipulation)
     */
    deleteBufferTop(top, bottom) {
        this.deleteBufferLines(1, top, top, bottom);
    }
    /**
     * Delete line at bottom of scroll region (buffer manipulation)
     */
    deleteBufferBottom(top, bottom) {
        this.clearRegion(0, this.width, bottom, bottom + 1);
    }
    /**
     * Set scroll region (uses terminal CSR)
     */
    setScrollRegion(top, bottom) {
        this.program.csr(top, bottom);
    }
    /**
     * Reset scroll region
     */
    resetScrollRegion() {
        this.program.resetCursor();
    }
    // ============================================================================
    // Focus Management
    // ============================================================================
    focusPush(element) {
        this.focusHistory.push(element);
        element.focus();
    }
    focusPop() {
        const element = this.focusHistory.pop();
        if (element) {
            element.blur();
        }
        const prev = this.focusHistory[this.focusHistory.length - 1];
        if (prev) {
            prev.focus();
        }
        return element || null;
    }
    saveFocus() {
        this.savedFocus = this._focused;
        return this.savedFocus;
    }
    restoreFocus() {
        if (this.savedFocus) {
            this.savedFocus.focus();
        }
        return this.savedFocus;
    }
    rewindFocus() {
        while (this.focusHistory.length > 0) {
            this.focusPop();
        }
    }
    /**
     * Enable focus trapping within a container (for modals)
     * Tab/Shift+Tab will only cycle through elements within the container
     */
    trapFocus(container) {
        if (this.focusTrap === container)
            return;
        // Save current focus before trapping
        this.focusTrapSavedFocus = this._focused;
        this.focusTrap = container;
        // Focus first element in trap
        const focusable = this._getFocusable(container);
        if (focusable.length > 0) {
            focusable[0].focus();
        }
    }
    /**
     * Disable focus trapping and restore previous focus
     */
    releaseFocusTrap() {
        if (!this.focusTrap)
            return;
        this.focusTrap = null;
        // Restore focus to element that had it before trapping
        if (this.focusTrapSavedFocus && !this.focusTrapSavedFocus.destroyed) {
            this.focusTrapSavedFocus.focus();
        }
        this.focusTrapSavedFocus = null;
    }
    /**
     * Check if focus is currently trapped
     */
    isFocusTrapped() {
        return this.focusTrap !== null;
    }
    /**
     * Get the current focus trap container (if any)
     */
    getFocusTrap() {
        return this.focusTrap;
    }
    /**
     * Get all focusable elements in tree order, sorted by tabIndex
     * If focus is trapped, only returns elements within the trap container
     */
    _getFocusable(element = this) {
        // If focus is trapped, only get focusable elements within the trap
        const root = this.focusTrap || element;
        const focusable = [];
        const traverse = (el) => {
            // Check if element is tabbable
            const tabbable = el.options.tabbable !== false && el.options.tabIndex !== -1;
            const isFocusable = el.options.focusable && tabbable;
            // Skip disabled, hidden, or destroyed elements
            if (isFocusable && !el.hidden && !el.destroyed && !el.disabled) {
                focusable.push(el);
            }
            for (const child of el.children) {
                traverse(child);
            }
        };
        traverse(root);
        // Sort by tabIndex (0 = default, 1+ = explicit order, -1 = not tabbable - already filtered)
        focusable.sort((a, b) => {
            const aIndex = a.options.tabIndex ?? 0;
            const bIndex = b.options.tabIndex ?? 0;
            // Elements with tabIndex > 0 come first, sorted by tabIndex
            if (aIndex > 0 && bIndex > 0)
                return aIndex - bIndex;
            if (aIndex > 0)
                return -1;
            if (bIndex > 0)
                return 1;
            // Both have tabIndex 0 (or undefined) - maintain tree order
            return 0;
        });
        return focusable;
    }
    /**
     * Focus next focusable element
     */
    focusNext() {
        const focusable = this._getFocusable();
        if (focusable.length === 0)
            return;
        const current = this._focused;
        if (!current) {
            focusable[0].focus();
            return;
        }
        const index = focusable.indexOf(current);
        if (index === -1) {
            focusable[0].focus();
            return;
        }
        const next = focusable[(index + 1) % focusable.length];
        next.focus();
    }
    /**
     * Focus previous focusable element
     */
    focusPrevious() {
        const focusable = this._getFocusable();
        if (focusable.length === 0)
            return;
        const current = this._focused;
        if (!current) {
            focusable[focusable.length - 1].focus();
            return;
        }
        const index = focusable.indexOf(current);
        if (index === -1) {
            focusable[focusable.length - 1].focus();
            return;
        }
        const prev = focusable[(index - 1 + focusable.length) % focusable.length];
        prev.focus();
    }
    /**
     * Alias for focusPrevious
     */
    focusPrev() {
        this.focusPrevious();
    }
    /**
     * Focus element at offset from current
     */
    focusOffset(offset) {
        const focusable = this._getFocusable();
        if (focusable.length === 0)
            return;
        const current = this._focused;
        if (!current) {
            const index = offset >= 0 ? 0 : focusable.length - 1;
            focusable[index].focus();
            return;
        }
        const index = focusable.indexOf(current);
        if (index === -1) {
            focusable[0].focus();
            return;
        }
        const newIndex = (index + offset) % focusable.length;
        const target = focusable[newIndex < 0 ? newIndex + focusable.length : newIndex];
        target.focus();
    }
    // ============================================================================
    // Key Handling
    // ============================================================================
    key(keys, handler) {
        const keyList = Array.isArray(keys) ? keys : [keys];
        for (const k of keyList) {
            if (!this.keyHandlers.has(k)) {
                this.keyHandlers.set(k, []);
            }
            this.keyHandlers.get(k).push(handler);
        }
    }
    onceKey(keys, handler) {
        const wrapper = (ch, key) => {
            this.unkey(keys, wrapper);
            handler(ch, key);
        };
        this.key(keys, wrapper);
    }
    unkey(keys, handler) {
        const keyList = Array.isArray(keys) ? keys : [keys];
        for (const k of keyList) {
            const handlers = this.keyHandlers.get(k);
            if (handlers) {
                const index = handlers.indexOf(handler);
                if (index !== -1) {
                    handlers.splice(index, 1);
                }
            }
        }
    }
    // Called by external input handler
    _handleKey(ch, key) {
        // Respect key locking
        if (this._lockKeys)
            return;
        // Try registered screen key handlers first
        const handlers = this.keyHandlers.get(key.full || key.name);
        let handled = false;
        if (handlers && handlers.length > 0) {
            for (const handler of handlers) {
                handler(ch, key);
            }
            handled = true;
        }
        // Default Tab/Shift-Tab for focus navigation (only if no user handler)
        if (!handled && key.name === 'tab') {
            if (key.shift) {
                this.focusPrevious();
            }
            else {
                this.focusNext();
            }
            this.render();
            return;
        }
        // Emit to focused element
        if (this._focused) {
            // Emit generic keypress event
            this._focused.emit('keypress', ch, key);
            // Emit specific key event (for element.key() handlers)
            const keyName = key.full || key.name;
            if (keyName) {
                this._focused.emit(`keypress ${keyName}`, ch, key);
            }
        }
        this.emit('keypress', ch, key);
    }
    // ============================================================================
    // Title
    // ============================================================================
    setTitle(title) {
        this.title = title;
        this.write(`\x1b]0;${title}\x07`);
    }
    // ============================================================================
    // Cursor
    // ============================================================================
    showCursor() {
        if (this.cursorHidden) {
            this.cursorHidden = false;
            this.write(cursor.show);
        }
    }
    hideCursor() {
        if (!this.cursorHidden) {
            this.cursorHidden = true;
            this.write(cursor.hide);
        }
    }
    // ============================================================================
    // Lifecycle
    // ============================================================================
    /**
     * Enter alternate buffer and initialize screen
     */
    enter() {
        this.program.alternateBuffer();
        this.program.hideCursor();
        this.clear();
        this.render();
        this.emit('enter');
    }
    /**
     * Leave alternate buffer and restore terminal
     */
    leave() {
        this.program.showCursor();
        this.program.normalBuffer();
        this.emit('leave');
    }
    // ============================================================================
    // Property Getters/Setters
    // ============================================================================
    /**
     * Get currently focused element
     */
    getFocused() {
        return this._focused;
    }
    /**
     * Set focused element (called by Element.focus())
     */
    setFocused(element) {
        // Helper to find the element with a visible border (may be parent)
        const findBorderElement = (el) => {
            if (!el)
                return null;
            // Check if element has a border with fg color
            if (el.options?.border && el.options?.style?.border?.fg) {
                return el;
            }
            // Also check el.style.border directly (some widgets set it there)
            if (el.options?.border && el.style?.border?.fg) {
                return el;
            }
            // Walk up to parent
            if (el.parent && el.parent !== this) {
                return findBorderElement(el.parent);
            }
            return null;
        };
        // Blur previous focused element
        if (this._focused && this._focused !== element) {
            this._focused.focused = false;
            this._focused.emit('blur');
            // Restore original border color on blur
            const prevBorderEl = findBorderElement(this._focused);
            if (prevBorderEl && prevBorderEl._originalBorderColor) {
                // Update both options.style.border and style.border for consistency
                if (prevBorderEl.options?.style?.border) {
                    prevBorderEl.options.style.border.fg = prevBorderEl._originalBorderColor;
                }
                if (prevBorderEl.style?.border) {
                    prevBorderEl.style.border.fg = prevBorderEl._originalBorderColor;
                }
            }
        }
        // Focus new element
        this._focused = element;
        if (element) {
            element.focused = true;
            element.emit('focus');
            // Automatically set white borders on focused elements
            const borderEl = findBorderElement(element);
            if (borderEl) {
                // Store original border color if not already stored
                if (!borderEl._originalBorderColor) {
                    borderEl._originalBorderColor = borderEl.options?.style?.border?.fg || borderEl.style?.border?.fg;
                }
                // Set white border for focused element
                if (borderEl.options?.style?.border) {
                    borderEl.options.style.border.fg = 'white';
                }
                if (borderEl.style?.border) {
                    borderEl.style.border.fg = 'white';
                }
            }
        }
        // Re-render to update focus border styling
        this.render();
    }
    /**
     * Get width (overrides Element.width for Screen)
     */
    get width() {
        return this._width;
    }
    /**
     * Set width
     */
    set width(value) {
        this._width = value;
        this.program.cols = value;
    }
    /**
     * Get height (overrides Element.height for Screen)
     */
    get height() {
        return this._height;
    }
    /**
     * Set height
     */
    set height(value) {
        this._height = value;
        this.program.rows = value;
    }
    /**
     * Get terminal type
     */
    get terminal() {
        return this.program.terminal;
    }
    /**
     * Get number of columns
     */
    get cols() {
        return this._width;
    }
    /**
     * Set number of columns
     */
    set cols(value) {
        this._width = value;
        this.program.cols = value;
        this.realloc();
    }
    /**
     * Get number of rows
     */
    get rows() {
        return this._height;
    }
    /**
     * Set number of rows
     */
    set rows(value) {
        this._height = value;
        this.program.rows = value;
        this.realloc();
    }
    /**
     * Lock key handlers (prevent input processing)
     */
    lockKeys() {
        this._lockKeys = true;
    }
    /**
     * Unlock key handlers
     */
    unlockKeys() {
        this._lockKeys = false;
    }
    // ============================================================================
    // Utilities
    // ============================================================================
    _colorToCode(color) {
        if (typeof color === 'number')
            return color;
        const colors = {
            // Special - transparent means keep existing background
            transparent: 0x1ff,
            none: 0x1ff,
            default: 0x1ff,
            // Standard colors
            black: 0,
            red: 1,
            green: 2,
            yellow: 3,
            blue: 4,
            magenta: 5,
            cyan: 6,
            white: 7,
            // Bright colors
            gray: 8,
            grey: 8,
            lightblack: 8,
            lightred: 9,
            lightgreen: 10,
            lightyellow: 11,
            lightblue: 12,
            lightmagenta: 13,
            lightcyan: 14,
            lightwhite: 15,
        };
        const lowerColor = String(color).toLowerCase();
        return colors[lowerColor] !== undefined ? colors[lowerColor] : 7;
    }
    _stripAnsi(str) {
        return str.replace(/\x1b\[[0-9;]*m/g, '');
    }
    /**
     * Clear entire screen
     */
    clear() {
        this.clearBuffers();
        this.program.clear();
    }
    // ============================================================================
    // Advanced Features (External Programs, Effects, Screenshot)
    // ============================================================================
    /**
     * Spawn external program
     * NOTE: Browser environment stub - requires Node.js child_process
     * STUB from neo-blessed screen.js lines 1737-1798
     */
    spawn(file, args, options) {
        throw new Error('spawn() not supported in browser environment - requires Node.js child_process');
    }
    /**
     * Execute external program and get success status
     * NOTE: Browser environment stub - requires Node.js child_process
     * STUB from neo-blessed screen.js lines 1800-1814
     */
    exec(file, args, options, callback) {
        throw new Error('exec() not supported in browser environment - requires Node.js child_process');
    }
    /**
     * Open text editor and return edited content
     * NOTE: Browser environment stub - requires Node.js fs and child_process
     * STUB from neo-blessed screen.js lines 1816-1864
     */
    readEditor(options, callback) {
        const err = new Error('readEditor() not supported in browser environment - requires Node.js fs/child_process');
        if (callback)
            callback(err);
        else
            throw err;
    }
    /**
     * Display image using external image viewer
     * NOTE: Browser environment stub - requires Node.js child_process and external w3mimgdisplay
     * STUB from neo-blessed screen.js lines 1866-1904
     */
    displayImage(file, callback) {
        const err = new Error('displayImage() not supported in browser environment - requires external w3mimgdisplay');
        if (callback)
            callback(err);
        else
            throw err;
    }
    /**
     * Set visual effects (hover, blur, focus) on element
     * EXACT from neo-blessed screen.js lines 1906-1957
     */
    setEffects(el, fel, over, out, effects, temp) {
        if (!effects)
            return;
        const tmp = {};
        if (temp && typeof el !== 'function') {
            el[temp] = tmp;
        }
        let getEl;
        if (typeof el !== 'function') {
            const _el = el;
            getEl = () => _el;
        }
        else {
            getEl = el;
        }
        let getFel = null;
        if (fel) {
            if (typeof fel !== 'function') {
                const _fel = fel;
                getFel = () => _fel;
            }
            else {
                getFel = fel;
            }
        }
        const $ = (name) => {
            return function () {
                const _el = getEl();
                const _fel = getFel ? getFel() : null;
                const elStyle = _el.style || {};
                const felStyle = _fel ? (_fel.style || {}) : {};
                if (tmp[name] !== undefined) {
                    elStyle[name] = tmp[name];
                    delete tmp[name];
                }
                if (effects[name] !== undefined) {
                    tmp[name] = elStyle[name];
                    elStyle[name] = effects[name];
                }
                if (_fel && effects[name + 'Focus'] !== undefined) {
                    tmp[name] = felStyle[name];
                    felStyle[name] = effects[name + 'Focus'];
                }
                this.screen.render();
            };
        };
        getEl().on(over, $(over));
        getEl().on(out, $(out));
    }
    /**
     * Initialize hover text box
     * Creates tooltip-style box that appears on hover
     * EXACT from neo-blessed screen.js lines 615-672
     */
    _initHover() {
        if (this._hoverText) {
            return;
        }
        // Would require Box widget - deferred for now
        // Full implementation requires blessed Box widget with specific options
        // Hover text should appear at cursor position with auto-hide timer
        this._hoverText = null;
    }
    /**
     * Take screenshot of screen buffer as text
     * Returns ANSI/plain text representation of current screen
     * EXACT from neo-blessed screen.js lines 2108-2197
     */
    screenshot(xi, xl, yi, yl, term) {
        if (xi == null)
            xi = 0;
        if (xl == null)
            xl = this.cols;
        if (yi == null)
            yi = 0;
        if (yl == null)
            yl = this.rows;
        if (xi < 0)
            xi = 0;
        if (yi < 0)
            yi = 0;
        let main = '';
        for (let y = yi; y < yl; y++) {
            let line = '';
            for (let x = xi; x < xl; x++) {
                const cell = this.buffer[y]?.[x];
                if (cell && cell.length >= 2) {
                    line += cell[1] || ' '; // cell[0] = attr, cell[1] = char
                }
                else {
                    line += ' ';
                }
            }
            main += line;
            if (y < yl - 1)
                main += '\n';
        }
        return main;
    }
    // ============================================================================
    // Cleanup
    // ============================================================================
    destroy() {
        if (this.destroyed)
            return;
        this.write(cursor.show);
        this.write(screenAnsi.clear);
        this.write(cursor.pos(0, 0));
        this.write(attrs.reset);
        this.flush();
        // Destroy program
        this.program.destroy();
        super.destroy();
    }
    /**
     * Handle input data (forward to program)
     */
    _handleData(data) {
        this.program._handleData(data);
    }
}
const ANGLES = {
    '┘': true,
    '┐': true,
    '┌': true,
    '└': true,
    '┼': true,
    '├': true,
    '┤': true,
    '┴': true,
    '┬': true,
    '│': true,
    '─': true,
};
const L_ANGLES = {
    '┌': true,
    '└': true,
    '┼': true,
    '├': true,
    '┴': true,
    '┬': true,
    '─': true,
};
const U_ANGLES = {
    '┐': true,
    '┌': true,
    '┼': true,
    '├': true,
    '┤': true,
    '┬': true,
    '│': true,
};
const R_ANGLES = {
    '┘': true,
    '┐': true,
    '┼': true,
    '┤': true,
    '┴': true,
    '┬': true,
    '─': true,
};
const D_ANGLES = {
    '┘': true,
    '└': true,
    '┼': true,
    '├': true,
    '┤': true,
    '┴': true,
    '│': true,
};
const ANGLE_TABLE = {
    0: '',
    1: '│',
    2: '─',
    3: '┌',
    4: '│',
    5: '│',
    6: '└',
    7: '├',
    8: '─',
    9: '┐',
    10: '─',
    11: '┬',
    12: '┘',
    13: '┤',
    14: '┴',
    15: '┼',
};
