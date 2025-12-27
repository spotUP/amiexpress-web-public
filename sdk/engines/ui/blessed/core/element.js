/**
 * Base Element class - foundation for all widgets
 */
import { EventEmitter } from './events';
import { parseTags, stripAnsi, textWidth } from './colors';
export class Element extends EventEmitter {
    /**
     * Draggable property with setter that enables/disables dragging
     * EXACT from neo-blessed element.js: __defineSetter__('draggable', ...)
     */
    get draggable() {
        return !!this._draggable;
    }
    set draggable(value) {
        if (value) {
            this.enableDrag();
        }
        else {
            this.disableDrag();
        }
    }
    constructor(options = {}) {
        super();
        this.parent = null;
        this.screen = null; // Will be set by Screen
        this.children = [];
        // Position cache
        this.position = { xi: 0, xl: 0, yi: 0, yl: 0 };
        // Content
        this.content = '';
        this._lines = [];
        this._contentDirty = false;
        // State
        this.visible = true;
        this.hidden = false;
        this.focused = false;
        this.destroyed = false;
        // Scrolling
        this.childBase = 0;
        this.childOffset = 0;
        // Mouse/Keyboard
        this.clickable = false;
        this.keyable = false;
        this.input = false;
        this._hovered = false;
        // NOTE: We intentionally do NOT default width/height here.
        // This allows the positioning logic to properly detect when the user
        // specified left+right (to calculate width) or top+bottom (to calculate height).
        this.options = {
            hidden: false,
            focusable: false,
            clickable: false,
            keyable: false,
            scrollable: false,
            tags: false,
            padding: 0,
            ...options,
        };
        // Initialize position from options (CRITICAL: position setters update this.position, not this.options)
        // _getCoords() reads from this.position, so we need to copy initial values here
        if (this.options.left !== undefined)
            this.position.left = this.options.left;
        if (this.options.right !== undefined)
            this.position.right = this.options.right;
        if (this.options.top !== undefined)
            this.position.top = this.options.top;
        if (this.options.bottom !== undefined)
            this.position.bottom = this.options.bottom;
        if (this.options.width !== undefined)
            this.position.width = this.options.width;
        if (this.options.height !== undefined)
            this.position.height = this.options.height;
        // Parse content
        if (this.options.content) {
            this.setContent(this.options.content);
        }
        // Set visibility
        if (this.options.hidden) {
            this.hide();
        }
        // Set clickable from options
        if (this.options.clickable) {
            this.clickable = true;
        }
        // Set mouse support (also enables clickable)
        if (this.options.mouse) {
            this.clickable = true;
        }
        // Attach to parent
        if (this.options.parent) {
            this.options.parent.append(this);
        }
        // Set screen
        if (this.options.screen) {
            this.screen = this.options.screen;
        }
        // Set draggable from options AFTER screen is set (EXACT from neo-blessed element.js lines 215-217)
        // CRITICAL: Must be after parent/screen attachment so enableDrag() can access this.screen
        if (this.options.draggable) {
            this.draggable = true;
        }
    }
    // ============================================================================
    // Position Calculation
    // ============================================================================
    calcPos(value, max, parentSize) {
        if (value === undefined || value === null) {
            return 0;
        }
        if (typeof value === 'number') {
            return value < 0 ? max + value : value;
        }
        const str = value.toString();
        // Percentage
        if (str.endsWith('%')) {
            const percent = parseInt(str, 10) / 100;
            return Math.floor(parentSize * percent);
        }
        // Center
        if (str === 'center') {
            return Math.floor((parentSize - max) / 2);
        }
        return parseInt(str, 10) || 0;
    }
    getPadding() {
        const p = this.options.padding;
        if (typeof p === 'number') {
            return { left: p, right: p, top: p, bottom: p };
        }
        if (typeof p === 'object' && p !== null) {
            return {
                left: p.left || 0,
                right: p.right || 0,
                top: p.top || 0,
                bottom: p.bottom || 0,
            };
        }
        return { left: 0, right: 0, top: 0, bottom: 0 };
    }
    hasBorder() {
        const border = this.options.border;
        if (!border || border === 'none')
            return false;
        return true;
    }
    _getCoords(get, noscroll) {
        if (this.destroyed)
            return undefined;
        const parent = this.parent;
        const parentPos = parent?._getCoords(get, noscroll) || {
            xi: 0,
            xl: this.screen?.width || 80,
            yi: 0,
            yl: this.screen?.height || 24,
        };
        const padding = this.getPadding();
        const border = this.hasBorder() ? 1 : 0;
        // Calculate parent's inner content area (inside border and padding)
        // Children are positioned within this inner area
        const parentBorder = parent?.hasBorder?.() ? 1 : 0;
        const parentPadding = parent?.getPadding?.() || { left: 0, right: 0, top: 0, bottom: 0 };
        const parentContentXi = parentPos.xi + parentBorder + parentPadding.left;
        const parentContentXl = parentPos.xl - parentBorder - parentPadding.right;
        const parentContentYi = parentPos.yi + parentBorder + parentPadding.top;
        const parentContentYl = parentPos.yl - parentBorder - parentPadding.bottom;
        const parentWidth = parentContentXl - parentContentXi;
        const parentHeight = parentContentYl - parentContentYi;
        // Calculate horizontal position (xi, xl)
        // Priority: left+right > left+width > right+width > width > defaults
        let xi;
        let xl;
        const hasLeft = this.position.left !== undefined && this.position.left !== null;
        const hasRight = this.position.right !== undefined && this.position.right !== null;
        const hasWidth = this.position.width !== undefined && this.position.width !== null;
        if (hasLeft && hasRight && !hasWidth) {
            // Both left and right specified (no width) - calculate width from them
            xi = this.calcPos(this.position.left, 0, parentWidth);
            xl = parentWidth - this.calcPos(this.position.right, 0, parentWidth);
        }
        else if (hasLeft && hasWidth) {
            // Left and width specified
            const elemWidth = this.calcPos(this.position.width, 0, parentWidth);
            // Handle 'center' positioning with width
            if (this.position.left === 'center') {
                xi = Math.floor((parentWidth - elemWidth) / 2);
            }
            else {
                xi = this.calcPos(this.position.left, 0, parentWidth);
            }
            xl = xi + elemWidth;
        }
        else if (hasRight && hasWidth) {
            // Right and width specified
            xl = parentWidth - this.calcPos(this.position.right, 0, parentWidth);
            xi = xl - this.calcPos(this.position.width, 0, parentWidth);
        }
        else if (hasLeft) {
            // Only left specified - extend to right edge
            xi = this.calcPos(this.position.left, 0, parentWidth);
            xl = parentWidth;
        }
        else if (hasRight) {
            // Only right specified - extend from left edge
            xi = 0;
            xl = parentWidth - this.calcPos(this.position.right, 0, parentWidth);
        }
        else if (hasWidth) {
            // Only width specified - start from left edge
            xi = 0;
            xl = this.calcPos(this.position.width, 0, parentWidth);
        }
        else {
            // No horizontal position specified - fill parent
            xi = 0;
            xl = parentWidth;
        }
        // Calculate vertical position (yi, yl)
        // Priority: top+bottom > top+height > bottom+height > height > defaults
        let yi;
        let yl;
        const hasTop = this.position.top !== undefined && this.position.top !== null;
        const hasBottom = this.position.bottom !== undefined && this.position.bottom !== null;
        const hasHeight = this.position.height !== undefined && this.position.height !== null;
        if (hasTop && hasBottom && !hasHeight) {
            // Both top and bottom specified (no height) - calculate height from them
            yi = this.calcPos(this.position.top, 0, parentHeight);
            yl = parentHeight - this.calcPos(this.position.bottom, 0, parentHeight);
        }
        else if (hasTop && hasHeight) {
            // Top and height specified
            const elemHeight = this.calcPos(this.position.height, 0, parentHeight);
            // Handle 'center' positioning with height
            if (this.position.top === 'center') {
                yi = Math.floor((parentHeight - elemHeight) / 2);
            }
            else {
                yi = this.calcPos(this.position.top, 0, parentHeight);
            }
            yl = yi + elemHeight;
        }
        else if (hasBottom && hasHeight) {
            // Bottom and height specified
            yl = parentHeight - this.calcPos(this.position.bottom, 0, parentHeight);
            yi = yl - this.calcPos(this.position.height, 0, parentHeight);
        }
        else if (hasTop) {
            // Only top specified - extend to bottom edge
            yi = this.calcPos(this.position.top, 0, parentHeight);
            yl = parentHeight;
        }
        else if (hasBottom) {
            // Only bottom specified - extend from top edge
            yi = 0;
            yl = parentHeight - this.calcPos(this.position.bottom, 0, parentHeight);
        }
        else if (hasHeight) {
            // Only height specified - start from top edge
            yi = 0;
            yl = this.calcPos(this.position.height, 0, parentHeight);
        }
        else {
            // No vertical position specified - fill parent
            yi = 0;
            yl = parentHeight;
        }
        // Add parent content area offset (children positioned inside parent's border/padding)
        xi += parentContentXi;
        xl += parentContentXi;
        yi += parentContentYi;
        yl += parentContentYi;
        // Store calculated coordinates (PRESERVE existing user-specified position properties!)
        this.position.xi = xi;
        this.position.xl = xl;
        this.position.yi = yi;
        this.position.yl = yl;
        return this.position;
    }
    // ============================================================================
    // Position Property Getters
    // ============================================================================
    /**
     * Get calculated width (in columns)
     */
    get width() {
        const pos = this._getCoords();
        return pos ? pos.xl - pos.xi : 0;
    }
    /**
     * Get calculated height (in rows)
     */
    get height() {
        const pos = this._getCoords();
        return pos ? pos.yl - pos.yi : 0;
    }
    /**
     * Get left position (relative to parent)
     */
    get left() {
        const pos = this._getCoords();
        if (!pos || !this.parent)
            return 0;
        const parentPos = this.parent._getCoords();
        return parentPos ? pos.xi - parentPos.xi : pos.xi;
    }
    /**
     * Get right position (relative to parent)
     */
    get right() {
        const pos = this._getCoords();
        if (!pos || !this.parent)
            return 0;
        const parentPos = this.parent._getCoords();
        return parentPos ? parentPos.xl - pos.xl : 0;
    }
    /**
     * Get top position (relative to parent)
     */
    get top() {
        const pos = this._getCoords();
        if (!pos || !this.parent)
            return 0;
        const parentPos = this.parent._getCoords();
        return parentPos ? pos.yi - parentPos.yi : pos.yi;
    }
    /**
     * Get bottom position (relative to parent)
     */
    get bottom() {
        const pos = this._getCoords();
        if (!pos || !this.parent)
            return 0;
        const parentPos = this.parent._getCoords();
        return parentPos ? parentPos.yl - pos.yl : 0;
    }
    /**
     * Get absolute left position (screen coordinates)
     */
    get aleft() {
        const pos = this._getCoords();
        return pos ? pos.xi : 0;
    }
    /**
     * Get absolute right position (screen coordinates)
     */
    get aright() {
        const pos = this._getCoords();
        return pos && this.screen ? this.screen.width - pos.xl : 0;
    }
    /**
     * Get absolute top position (screen coordinates)
     */
    get atop() {
        const pos = this._getCoords();
        return pos ? pos.yi : 0;
    }
    /**
     * Get absolute bottom position (screen coordinates)
     */
    get abottom() {
        const pos = this._getCoords();
        return pos && this.screen ? this.screen.height - pos.yl : 0;
    }
    /**
     * Get absolute width (same as width)
     */
    get awidth() {
        return this.width;
    }
    /**
     * Get absolute height (same as height)
     */
    get aheight() {
        return this.height;
    }
    /**
     * Get relative left (0-1 range)
     */
    get rleft() {
        if (!this.parent)
            return 0;
        const parentPos = this.parent._getCoords();
        const pos = this._getCoords();
        if (!parentPos || !pos)
            return 0;
        const parentWidth = parentPos.xl - parentPos.xi;
        return parentWidth > 0 ? (pos.xi - parentPos.xi) / parentWidth : 0;
    }
    /**
     * Get relative top (0-1 range)
     */
    get rtop() {
        if (!this.parent)
            return 0;
        const parentPos = this.parent._getCoords();
        const pos = this._getCoords();
        if (!parentPos || !pos)
            return 0;
        const parentHeight = parentPos.yl - parentPos.yi;
        return parentHeight > 0 ? (pos.yi - parentPos.yi) / parentHeight : 0;
    }
    /**
     * Get relative width (0-1 range)
     */
    get rwidth() {
        if (!this.parent)
            return 1;
        const parentPos = this.parent._getCoords();
        const pos = this._getCoords();
        if (!parentPos || !pos)
            return 0;
        const parentWidth = parentPos.xl - parentPos.xi;
        return parentWidth > 0 ? (pos.xl - pos.xi) / parentWidth : 0;
    }
    /**
     * Get relative height (0-1 range)
     */
    get rheight() {
        if (!this.parent)
            return 1;
        const parentPos = this.parent._getCoords();
        const pos = this._getCoords();
        if (!parentPos || !pos)
            return 0;
        const parentHeight = parentPos.yl - parentPos.yi;
        return parentHeight > 0 ? (pos.yl - pos.yi) / parentHeight : 0;
    }
    /**
     * Get inner left (excluding border and padding)
     */
    get ileft() {
        const border = this.hasBorder() ? 1 : 0;
        const padding = this.getPadding();
        return this.aleft + border + padding.left;
    }
    /**
     * Get inner top (excluding border and padding)
     */
    get itop() {
        const border = this.hasBorder() ? 1 : 0;
        const padding = this.getPadding();
        return this.atop + border + padding.top;
    }
    /**
     * Get inner width (excluding border, padding, and scrollbar)
     */
    get iwidth() {
        const border = this.hasBorder() ? 2 : 0;
        const padding = this.getPadding();
        const scrollbar = this.hasScrollbar() ? 1 : 0;
        return Math.max(0, this.width - border - padding.left - padding.right - scrollbar);
    }
    /**
     * Get inner height (excluding border and padding)
     */
    get iheight() {
        const border = this.hasBorder() ? 2 : 0;
        const padding = this.getPadding();
        return Math.max(0, this.height - border - padding.top - padding.bottom);
    }
    // ============================================================================
    // Position Setters (EXACT 1:1 PORT from neo-blessed element.js lines 1312-1398)
    // ============================================================================
    /**
     * Set absolute left position
     * EXACT from neo-blessed element.js lines 1312-1331
     */
    set aleft(val) {
        let expr;
        if (typeof val === 'string') {
            if (val === 'center') {
                val = (this.screen.width / 2) | 0;
                val -= (this.width / 2) | 0;
            }
            else {
                expr = val.split(/(?=\+|-)/);
                val = expr[0];
                val = +val.slice(0, -1) / 100;
                val = (this.screen.width * val) | 0;
                val += +(expr[1] || 0);
            }
        }
        if (!this.parent)
            return;
        val = val - this.parent.aleft;
        if (this.position.left === val)
            return;
        this.emit('move');
        this.clearPos();
        this.position.left = val;
    }
    /**
     * Set absolute right position
     * EXACT from neo-blessed element.js lines 1333-1339
     */
    set aright(val) {
        if (!this.parent)
            return;
        val -= this.parent.aright;
        if (this.position.right === val)
            return;
        this.emit('move');
        this.clearPos();
        this.position.right = val;
    }
    /**
     * Set absolute top position
     * EXACT from neo-blessed element.js lines 1341-1360
     */
    set atop(val) {
        let expr;
        if (typeof val === 'string') {
            if (val === 'center') {
                val = (this.screen.height / 2) | 0;
                val -= (this.height / 2) | 0;
            }
            else {
                expr = val.split(/(?=\+|-)/);
                val = expr[0];
                val = +val.slice(0, -1) / 100;
                val = (this.screen.height * val) | 0;
                val += +(expr[1] || 0);
            }
        }
        if (!this.parent)
            return;
        val = val - this.parent.atop;
        if (this.position.top === val)
            return;
        this.emit('move');
        this.clearPos();
        this.position.top = val;
    }
    /**
     * Set absolute bottom position
     * EXACT from neo-blessed element.js lines 1362-1368
     */
    set abottom(val) {
        if (!this.parent)
            return;
        val -= this.parent.abottom;
        if (this.position.bottom === val)
            return;
        this.emit('move');
        this.clearPos();
        this.position.bottom = val;
    }
    /**
     * Set relative left position (relative to parent)
     * EXACT from neo-blessed element.js lines 1370-1376
     */
    set rleft(val) {
        if (this.position.left === val)
            return;
        if (/^\d+$/.test(val))
            val = +val;
        this.emit('move');
        // NOTE: clearPos() removed - screen.render() handles clearing/redrawing
        this.position.left = val;
    }
    /**
     * Set relative right position (relative to parent)
     * EXACT from neo-blessed element.js lines 1378-1383
     */
    set rright(val) {
        if (this.position.right === val)
            return;
        this.emit('move');
        // NOTE: clearPos() removed - screen.render() handles clearing/redrawing
        this.position.right = val;
    }
    /**
     * Set relative top position (relative to parent)
     * EXACT from neo-blessed element.js lines 1385-1391
     */
    set rtop(val) {
        if (this.position.top === val)
            return;
        if (/^\d+$/.test(val))
            val = +val;
        this.emit('move');
        // NOTE: clearPos() removed - screen.render() handles clearing/redrawing
        this.position.top = val;
    }
    /**
     * Set relative bottom position (relative to parent)
     * EXACT from neo-blessed element.js lines 1393-1398
     */
    set rbottom(val) {
        if (this.position.bottom === val)
            return;
        this.emit('move');
        // NOTE: clearPos() removed - screen.render() handles clearing/redrawing
        this.position.bottom = val;
    }
    /**
     * Clear the element's rendered position on screen
     * EXACT from neo-blessed element.js lines 901-909
     */
    clearPos(get, override) {
        if (this.detached)
            return;
        const lpos = this._getCoords(get);
        if (!lpos)
            return;
        this.screen.clearRegion(lpos.xi, lpos.xl, lpos.yi, lpos.yl, override);
    }
    // ============================================================================
    // Content Management
    // ============================================================================
    setContent(content) {
        if (this.destroyed)
            return;
        // Process {center} tags before storing content
        content = this.processCenterTags(content);
        this.content = content;
        this._contentDirty = true; // Mark for re-parsing on next render
        // Try to parse now if we have valid dimensions
        const width = this.iwidth;
        if (width > 0) {
            this._lines = this.parseContent(content);
            this._contentDirty = false;
        }
        else {
            // Fallback: split by lines, will re-parse during render
            // Keep _contentDirty = true so getVisibleLines re-parses when dimensions are known
            let parsed = content;
            if (this.options.tags) {
                parsed = parseTags(content);
            }
            this._lines = parsed.split(/\r?\n/);
            // Note: _contentDirty stays true so content gets re-parsed with wrapping during render
        }
        this.emit('set content');
    }
    /**
     * Process {center} tags and convert to centered text
     * CUSTOM EXTENSION: Blessed doesn't natively support {center} tags
     */
    processCenterTags(content) {
        const centerRegex = /\{center\}([\s\S]*?)\{\/center\}/g;
        return content.replace(centerRegex, (match, innerContent) => {
            const lines = innerContent.split('\n');
            const width = this.iwidth || this.width || 80;
            const centeredLines = lines.map((line) => {
                // Strip tags to calculate actual text length
                const stripped = line.replace(/\{[^}]+\}/g, '');
                const textLength = stripped.length;
                const padding = Math.max(0, Math.floor((width - textLength) / 2));
                return ' '.repeat(padding) + line;
            });
            return centeredLines.join('\n');
        });
    }
    getContent() {
        return this.content;
    }
    setText(text) {
        this.setContent(text);
    }
    getText() {
        return stripAnsi(this.content);
    }
    insertLine(i, line) {
        if (this.destroyed)
            return;
        // Parse tags if enabled (convert {red-fg} to ANSI codes)
        let parsedLine = line;
        if (this.options.tags) {
            parsedLine = parseTags(line);
        }
        this._lines.splice(i, 0, parsedLine);
        this.content = this._lines.join('\n');
        this.emit('insert line', i, line);
    }
    deleteLine(i) {
        if (this.destroyed)
            return;
        this._lines.splice(i, 1);
        this.content = this._lines.join('\n');
        this.emit('delete line', i);
    }
    getLine(i) {
        return this._lines[i] || '';
    }
    getLines() {
        return this._lines.slice();
    }
    setLine(i, line) {
        if (this.destroyed)
            return;
        // Parse tags if enabled (convert {red-fg} to ANSI codes)
        // This ensures {red-fg}text{/} becomes proper ANSI sequences
        let parsedLine = line;
        if (this.options.tags) {
            parsedLine = parseTags(line);
        }
        this._lines[i] = parsedLine;
        this.content = this._lines.join('\n');
        this.emit('set line', i, line);
    }
    clearLine(i) {
        this.setLine(i, '');
    }
    unshiftLine(line) {
        this.insertLine(0, line);
    }
    pushLine(line) {
        this.insertLine(this._lines.length, line);
    }
    insertTop(line) {
        this.unshiftLine(line);
    }
    insertBottom(line) {
        this.pushLine(line);
    }
    // ============================================================================
    // Advanced Content Parsing
    // ============================================================================
    /**
     * Wrap text to fit within width, preserving ANSI codes
     */
    _wrapContent(text, width) {
        const lines = [];
        const textLines = text.split(/\r?\n/);
        for (const line of textLines) {
            if (this._textWidth(line) <= width) {
                lines.push(line);
                continue;
            }
            // Word wrap with ANSI preservation
            let currentLine = '';
            let currentWidth = 0;
            let inAnsi = false;
            let ansiBuffer = '';
            let activeAnsi = ''; // Track active ANSI codes
            for (let i = 0; i < line.length; i++) {
                const ch = line[i];
                // Start of ANSI escape
                if (ch === '\x1b') {
                    inAnsi = true;
                    ansiBuffer = ch;
                    continue;
                }
                // Inside ANSI escape
                if (inAnsi) {
                    ansiBuffer += ch;
                    if (ch === 'm') {
                        inAnsi = false;
                        currentLine += ansiBuffer;
                        activeAnsi += ansiBuffer;
                        ansiBuffer = '';
                    }
                    continue;
                }
                // Regular character
                if (currentWidth >= width) {
                    lines.push(currentLine);
                    currentLine = activeAnsi + ch; // Start new line with active formatting
                    currentWidth = 1;
                }
                else {
                    currentLine += ch;
                    currentWidth++;
                }
            }
            if (currentLine) {
                lines.push(currentLine);
            }
        }
        return lines;
    }
    /**
     * Get text width without ANSI codes
     */
    _textWidth(text) {
        return stripAnsi(text).length;
    }
    /**
     * Align text within width
     */
    _alignLine(line, width, align = 'left') {
        const textLen = this._textWidth(line);
        if (textLen >= width) {
            return line;
        }
        const padding = width - textLen;
        if (align === 'center') {
            const leftPad = Math.floor(padding / 2);
            return ' '.repeat(leftPad) + line;
        }
        else if (align === 'right') {
            return ' '.repeat(padding) + line;
        }
        return line; // left align (default)
    }
    /**
     * Parse content with word wrapping and alignment
     */
    parseContent(content) {
        const text = content !== undefined ? content : this.content;
        // Parse tags if enabled
        let parsed = text;
        if (this.options.tags) {
            parsed = parseTags(text);
        }
        // Get available width
        const width = this.iwidth;
        if (width <= 0) {
            return [];
        }
        // Word wrap if enabled
        let lines;
        if (this.options.wrap !== false) {
            lines = this._wrapContent(parsed, width);
        }
        else {
            lines = parsed.split(/\r?\n/);
        }
        // Apply alignment if specified
        const align = this.options.align;
        if (align && align !== 'left') {
            lines = lines.map(line => this._alignLine(line, width, align));
        }
        return lines;
    }
    /**
     * Get parsed lines (with wrapping and alignment)
     */
    getContentLines() {
        return this.parseContent();
    }
    /**
     * Measure content height (number of lines after wrapping)
     */
    getContentHeight(content) {
        return this.parseContent(content).length;
    }
    /**
     * Measure content width (widest line after ANSI strip)
     */
    getContentWidth(content) {
        const lines = this.parseContent(content);
        let maxWidth = 0;
        for (const line of lines) {
            const width = this._textWidth(line);
            if (width > maxWidth) {
                maxWidth = width;
            }
        }
        return maxWidth;
    }
    // ============================================================================
    // Styling Methods
    // ============================================================================
    /**
     * Convert style object to attribute code
     * This is the main method widgets use to convert style → packed attributes
     */
    sattr(style) {
        if (!style)
            return 0x000;
        let flags = 0;
        let fgCode = 0x1ff; // Default: no color (-1)
        let bgCode = 0x1ff; // Default: no color (-1)
        // Parse flags
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
        // Parse colors
        if (style.fg !== undefined && style.fg !== null) {
            fgCode = this._colorToNumber(style.fg);
        }
        if (style.bg !== undefined && style.bg !== null) {
            bgCode = this._colorToNumber(style.bg);
        }
        // Pack into 27-bit attribute
        // Format: (flags << 18) | (fg << 9) | bg - must match screen.ts unpackAttr()
        return (flags << 18) | (fgCode << 9) | bgCode;
    }
    /**
     * Convert color name/value to number (0-255)
     */
    _colorToNumber(color) {
        if (typeof color === 'number') {
            return Math.max(0, Math.min(255, color));
        }
        if (typeof color === 'string') {
            // Named colors (basic 8 colors)
            const colorMap = {
                // Special: transparent means preserve existing background
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
                // Bright variants
                'light-black': 8,
                'light-red': 9,
                'light-green': 10,
                'light-yellow': 11,
                'light-blue': 12,
                'light-magenta': 13,
                'light-cyan': 14,
                'light-white': 15,
                gray: 8,
                grey: 8,
            };
            const lower = color.toLowerCase();
            if (lower in colorMap) {
                return colorMap[lower];
            }
            // Hex color #RRGGBB (convert to closest 256-color)
            if (color.startsWith('#')) {
                return this._hexToColor256(color);
            }
            // Default to white
            return 7;
        }
        return 0x1ff; // No color
    }
    /**
     * Convert hex color to 256-color palette (simplified)
     */
    _hexToColor256(hex) {
        // Remove #
        hex = hex.replace('#', '');
        // Parse RGB
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);
        // Convert to 6x6x6 color cube (colors 16-231)
        const rIndex = Math.round((r / 255) * 5);
        const gIndex = Math.round((g / 255) * 5);
        const bIndex = Math.round((b / 255) * 5);
        return 16 + (rIndex * 36) + (gIndex * 6) + bIndex;
    }
    /**
     * Get style object from element options
     */
    getStyle() {
        return this.options.style || {};
    }
    /**
     * Set style property
     */
    setStyle(style) {
        this.options.style = { ...this.options.style, ...style };
        this.emit('style change');
    }
    /**
     * Get attribute code for current style
     */
    getAttr() {
        return this.sattr(this.getStyle());
    }
    // ============================================================================
    // Element Tree Management
    // ============================================================================
    append(element) {
        if (this.destroyed)
            return;
        element.detach();
        element.parent = this;
        element.screen = this.screen;
        this.children.push(element);
        // Propagate screen to all descendants
        element._propagateScreen(this.screen);
        this.emit('append', element);
        element.emit('attach');
    }
    prepend(element) {
        if (this.destroyed)
            return;
        element.detach();
        element.parent = this;
        element.screen = this.screen;
        this.children.unshift(element);
        element._propagateScreen(this.screen);
        this.emit('prepend', element);
        element.emit('attach');
    }
    remove(element) {
        if (this.destroyed)
            return;
        const index = this.children.indexOf(element);
        if (index !== -1) {
            this.children.splice(index, 1);
            element.parent = null;
            element.emit('detach');
            this.emit('remove', element);
        }
    }
    insert(element, i) {
        if (this.destroyed)
            return;
        element.detach();
        element.parent = this;
        element.screen = this.screen;
        this.children.splice(i, 0, element);
        element._propagateScreen(this.screen);
        this.emit('insert', element, i);
        element.emit('attach');
    }
    insertBefore(element, other) {
        const index = this.children.indexOf(other);
        if (index !== -1) {
            this.insert(element, index);
        }
    }
    insertAfter(element, other) {
        const index = this.children.indexOf(other);
        if (index !== -1) {
            this.insert(element, index + 1);
        }
    }
    detach() {
        if (this.parent) {
            this.parent.remove(this);
        }
    }
    _propagateScreen(screen) {
        this.screen = screen;
        // Emit overlay event for visible elements with opacity when first attached to screen
        if (this.visible && !this.hidden && this.options.style?.opacity !== undefined) {
            // Defer to next tick to ensure coordinates are calculated
            setTimeout(() => this._emitOverlayEvent(true), 0);
        }
        for (const child of this.children) {
            child._propagateScreen(screen);
        }
    }
    // ============================================================================
    // Focus Management
    // ============================================================================
    focus() {
        if (this.destroyed || !this.screen)
            return;
        if (this.options.focusable !== false) {
            // setFocused handles blur of previous, setting focused=true, and emitting focus
            this.screen.setFocused(this);
        }
    }
    blur() {
        if (this.destroyed)
            return;
        if (this.focused && this.screen) {
            // setFocused(null) handles the blur
            if (this.screen.getFocused() === this) {
                this.screen.setFocused(null);
            }
        }
    }
    /**
     * Get unique overlay ID for this element (lazily generated)
     */
    _getOverlayId() {
        if (!this._overlayId) {
            this._overlayId = `element-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        }
        return this._overlayId;
    }
    /**
     * Emit overlay event for web clients to render CSS opacity
     */
    _emitOverlayEvent(show) {
        const opacity = this.options.style?.opacity;
        if (opacity === undefined || !this.screen)
            return;
        // Get element position
        const coords = this._getCoords();
        const pos = coords ? {
            x: coords.xi,
            y: coords.yi,
            width: coords.xl - coords.xi,
            height: coords.yl - coords.yi,
        } : null;
        if (!pos)
            return;
        // Emit OSC overlay event
        const data = JSON.stringify({
            id: this._getOverlayId(),
            show,
            opacity,
            x: pos.x,
            y: pos.y,
            width: pos.width,
            height: pos.height,
        });
        const osc = `\x1b]9999;overlay;${data}\x07`;
        this.screen.program?.write(osc);
    }
    show() {
        if (this.destroyed)
            return;
        if (this.hidden) {
            this.hidden = false;
            this.visible = true;
            this.emit('show');
            // Emit overlay event for elements with opacity
            this._emitOverlayEvent(true);
        }
    }
    hide() {
        if (this.destroyed)
            return;
        if (!this.hidden) {
            this.hidden = true;
            this.visible = false;
            this.blur();
            this.emit('hide');
            // Emit overlay event for elements with opacity
            this._emitOverlayEvent(false);
        }
    }
    toggle() {
        if (this.hidden) {
            this.show();
        }
        else {
            this.hide();
        }
    }
    // ============================================================================
    // Z-Order
    // ============================================================================
    setFront() {
        if (this.destroyed || !this.parent)
            return;
        const index = this.parent.children.indexOf(this);
        if (index !== -1) {
            this.parent.children.splice(index, 1);
            this.parent.children.push(this);
            this.emit('set front');
        }
    }
    setBack() {
        if (this.destroyed || !this.parent)
            return;
        const index = this.parent.children.indexOf(this);
        if (index !== -1) {
            this.parent.children.splice(index, 1);
            this.parent.children.unshift(this);
            this.emit('set back');
        }
    }
    // ============================================================================
    // Scrolling
    // ============================================================================
    scroll(offset) {
        if (this.destroyed)
            return;
        this.setScroll(this.childBase + offset);
        this.screen?.render();
    }
    scrollTo(index) {
        this.setScroll(index);
        this.screen?.render();
    }
    getScroll() {
        return this.childBase;
    }
    setScroll(index) {
        if (this.destroyed)
            return;
        const maxScroll = this.getScrollHeight();
        this.childBase = Math.max(0, Math.min(index, maxScroll));
        this.emit('scroll');
    }
    getScrollHeight() {
        return Math.max(0, this._getScrollHeight());
    }
    _getScrollHeight() {
        const pos = this._getCoords();
        if (!pos)
            return 0;
        const padding = this.getPadding();
        const border = this.hasBorder() ? 1 : 0;
        const height = pos.yl - pos.yi - border * 2 - padding.top - padding.bottom;
        return Math.max(0, this._lines.length - height);
    }
    getScrollPerc() {
        const max = this.getScrollHeight();
        if (max === 0)
            return 100;
        return Math.floor((this.childBase / max) * 100);
    }
    setScrollPerc(perc) {
        const max = this.getScrollHeight();
        this.setScroll(Math.floor((perc / 100) * max));
        this.screen?.render();
    }
    resetScroll() {
        this.setScroll(0);
        this.screen?.render();
    }
    /**
     * Register event listener on screen and track it for cleanup
     * EXACT from neo-blessed element.js lines 267-271
     */
    onScreenEvent(type, handler) {
        this._slisteners = this._slisteners || [];
        this._slisteners.push({ type, handler });
        this.screen.on(type, handler);
    }
    /**
     * Register one-time event listener on screen and track it
     * EXACT from neo-blessed element.js lines 273-282
     */
    onceScreenEvent(type, handler) {
        this._slisteners = this._slisteners || [];
        const entry = { type, handler };
        this._slisteners.push(entry);
        this.screen.once(type, (...args) => {
            const i = this._slisteners.indexOf(entry);
            if (i !== -1)
                this._slisteners.splice(i, 1);
            return handler.apply(this, args);
        });
    }
    /**
     * Remove event listener from screen
     * EXACT from neo-blessed element.js lines 284-297
     */
    removeScreenEvent(type, handler) {
        this._slisteners = this._slisteners || [];
        for (let i = 0; i < this._slisteners.length; i++) {
            const listener = this._slisteners[i];
            if (listener.type === type && listener.handler === handler) {
                this._slisteners.splice(i, 1);
                if (this._slisteners.length === 0) {
                    delete this._slisteners;
                }
                break;
            }
        }
        this.screen.removeListener(type, handler);
    }
    /**
     * Enable mouse events for this element
     */
    enableMouse() {
        this.clickable = true;
        this.options.clickable = true;
        if (this.screen && this.screen.program) {
            this.screen.program.enableMouse();
        }
    }
    /**
     * Disable mouse events
     */
    disableMouse() {
        this.clickable = false;
        this.options.clickable = false;
    }
    /**
     * Enable keyboard events for this element
     */
    enableKeys() {
        this.keyable = true;
        this.options.keyable = true;
    }
    /**
     * Disable keyboard events
     */
    disableKeys() {
        this.keyable = false;
        this.options.keyable = false;
    }
    /**
     * Enable input mode (for text input widgets)
     */
    enableInput() {
        this.input = true;
        this.options.input = true;
        this.enableKeys();
    }
    /**
     * Disable input mode
     */
    disableInput() {
        this.input = false;
        this.options.input = false;
    }
    /**
     * Enable dragging for this element
     * EXACT from neo-blessed element.js lines 789-851
     */
    enableDrag(verify) {
        const self = this;
        if (this._draggable)
            return true;
        if (typeof verify !== 'function') {
            verify = function () { return true; };
        }
        this.enableMouse();
        this.on('mousedown', this._dragMD = function (data) {
            if (self.screen._dragging)
                return;
            if (!verify(data))
                return;
            self.screen._dragging = self;
            self._drag = {
                x: data.x - self.aleft,
                y: data.y - self.atop
            };
            self.setFront();
        });
        this.onScreenEvent('mouse', this._dragM = function (data) {
            if (self.screen._dragging !== self)
                return;
            if (data.action !== 'mousedown' && data.action !== 'mousemove') {
                delete self.screen._dragging;
                delete self._drag;
                return;
            }
            if (!self.parent)
                return;
            const ox = self._drag.x;
            const oy = self._drag.y;
            const px = self.parent.aleft;
            const py = self.parent.atop;
            let x = data.x - px - ox;
            let y = data.y - py - oy;
            // Handle right/bottom positioning edge cases
            if (self.position.right != null) {
                if (self.position.left != null) {
                    self.width = '100%-' + (self.parent.width - self.width);
                }
                self.position.right = null;
            }
            if (self.position.bottom != null) {
                if (self.position.top != null) {
                    self.height = '100%-' + (self.parent.height - self.height);
                }
                self.position.bottom = null;
            }
            // Use position setters to update position
            self.rleft = x;
            self.rtop = y;
            self.screen.render();
        });
        return this._draggable = true;
    }
    /**
     * Disable dragging
     * EXACT from neo-blessed element.js lines 853-861
     */
    disableDrag() {
        if (!this._draggable)
            return false;
        delete this.screen._dragging;
        delete this._drag;
        this.removeListener('mousedown', this._dragMD);
        this.removeScreenEvent('mouse', this._dragM);
        return this._draggable = false;
    }
    /**
     * Enable resizing for this element
     * Resize by dragging the bottom-right corner (last 2 chars of bottom row)
     */
    enableResize(callback) {
        this.enableMouse();
        let resizeState = null;
        // Mouse down - start resize if in corner
        this.on('mousedown', (data) => {
            const pos = this._getCoords();
            if (!pos)
                return;
            // Check if click is in resize corner (bottom-right 2x2 area)
            const isResizeCorner = data.x >= pos.xl - 3 &&
                data.x < pos.xl &&
                data.y >= pos.yl - 2 &&
                data.y < pos.yl;
            if (isResizeCorner) {
                resizeState = {
                    startX: data.x,
                    startY: data.y,
                    startWidth: this.width || (pos.xl - pos.xi),
                    startHeight: this.height || (pos.yl - pos.yi),
                };
                this.emit('resize start', data);
            }
        });
        // Global mouse move handler for resize
        if (this.screen) {
            this.screen.on('mouse', (data) => {
                if (!resizeState || data.action !== 'mousemove')
                    return;
                const deltaX = data.x - resizeState.startX;
                const deltaY = data.y - resizeState.startY;
                const newWidth = Math.max(5, resizeState.startWidth + deltaX);
                const newHeight = Math.max(3, resizeState.startHeight + deltaY);
                this.options.width = newWidth;
                this.options.height = newHeight;
                const resizeData = { width: newWidth, height: newHeight };
                if (callback)
                    callback(resizeData);
                this.emit('resize', resizeData);
                if (this.screen)
                    this.screen.render();
            });
        }
        // Mouse up - end resize
        this.on('mouseup', (data) => {
            if (!resizeState)
                return;
            resizeState = null;
            this.emit('resize end', data);
        });
    }
    /**
     * Disable resizing
     */
    disableResize() {
        // Note: We can't easily remove just the resize handlers
        // without affecting other mouse handlers
    }
    /**
     * Check if mouse position is over this element
     */
    hasMouseOver(x, y) {
        const pos = this._getCoords();
        if (!pos)
            return false;
        return x >= pos.xi && x < pos.xl && y >= pos.yi && y < pos.yl;
    }
    /**
     * Set element as clickable
     */
    setClickable(clickable) {
        this.clickable = clickable;
        this.options.clickable = clickable;
        if (clickable) {
            this.enableMouse();
        }
    }
    /**
     * Set element as keyable
     */
    setKeyable(keyable) {
        this.keyable = keyable;
        this.options.keyable = keyable;
    }
    /**
     * Key handler - register a key binding
     */
    key(keys, listener) {
        if (!Array.isArray(keys)) {
            keys = [keys];
        }
        for (const key of keys) {
            this.on(`keypress ${key}`, listener);
        }
    }
    /**
     * Remove key handler
     */
    unkey(keys, listener) {
        if (!Array.isArray(keys)) {
            keys = [keys];
        }
        for (const key of keys) {
            this.removeListener(`keypress ${key}`, listener);
        }
    }
    /**
     * Handle keypress event
     */
    onKeypress(ch, key) {
        if (!this.keyable)
            return;
        // Emit specific key event
        this.emit(`keypress ${key.full}`, ch, key);
        // Emit general keypress event
        this.emit('keypress', ch, key);
        // Handle default key actions
        if (key.name === 'tab') {
            if (this.screen) {
                if (key.shift) {
                    this.screen.focusPrevious();
                }
                else {
                    this.screen.focusNext();
                }
            }
        }
    }
    /**
     * Handle mouse event
     */
    onMouse(event) {
        if (!this.clickable)
            return;
        // Check if mouse is over this element
        if (!this.hasMouseOver(event.x, event.y))
            return;
        // Emit specific mouse events
        this.emit('mouse', event);
        if (event.action === 'mousedown') {
            this.emit('mousedown', event);
            if (event.button === 'left') {
                this.emit('click', event);
            }
        }
        else if (event.action === 'mouseup') {
            this.emit('mouseup', event);
        }
        else if (event.action === 'mousemove') {
            this.emit('mousemove', event);
            if (!this._hovered) {
                this._hovered = true;
                this.emit('mouseenter', event);
            }
        }
        else if (event.action === 'wheelup') {
            this.emit('wheelup', event);
            // Default scroll behavior - widgets can override by handling wheelup event
            if (!this.listenerCount('wheelup')) {
                this.scroll(-1);
            }
        }
        else if (event.action === 'wheeldown') {
            this.emit('wheeldown', event);
            // Default scroll behavior - widgets can override by handling wheeldown event
            if (!this.listenerCount('wheeldown')) {
                this.scroll(1);
            }
        }
    }
    /**
     * Handle mouse leave
     */
    onMouseLeave() {
        if (this._hovered) {
            this._hovered = false;
            this.emit('mouseleave');
        }
    }
    // ============================================================================
    // Rendering (implemented by subclasses)
    // ============================================================================
    render() {
        // Override in subclasses
        this.emit('render');
    }
    // ============================================================================
    // Border Rendering
    // ============================================================================
    /**
     * Get border characters based on border type
     */
    getBorderChars() {
        if (!this.options.border)
            return null;
        // Handle border as string or object
        const type = typeof this.options.border === 'string'
            ? this.options.border
            : (this.options.border.type || 'line');
        // Border character sets
        const borders = {
            line: {
                topLeft: '┌',
                topRight: '┐',
                bottomLeft: '└',
                bottomRight: '┘',
                horizontal: '─',
                vertical: '│',
            },
            heavy: {
                topLeft: '┏',
                topRight: '┓',
                bottomLeft: '┗',
                bottomRight: '┛',
                horizontal: '━',
                vertical: '┃',
            },
            double: {
                topLeft: '╔',
                topRight: '╗',
                bottomLeft: '╚',
                bottomRight: '╝',
                horizontal: '═',
                vertical: '║',
            },
            round: {
                topLeft: '╭',
                topRight: '╮',
                bottomLeft: '╰',
                bottomRight: '╯',
                horizontal: '─',
                vertical: '│',
            },
            bg: {
                topLeft: ' ',
                topRight: ' ',
                bottomLeft: ' ',
                bottomRight: ' ',
                horizontal: ' ',
                vertical: ' ',
            },
            ascii: {
                topLeft: '.',
                topRight: '.',
                bottomLeft: '`',
                bottomRight: '\'',
                horizontal: '-',
                vertical: '|',
            },
        };
        return borders[type] || borders.line;
    }
    /**
     * Render border around element
     */
    renderBorder() {
        if (!this.hasBorder() || !this.screen)
            return;
        const pos = this._getCoords();
        if (!pos)
            return;
        const chars = this.getBorderChars();
        if (!chars)
            return;
        // Determine border style - check multiple locations for border color
        // Priority: options.style.border > options.border.style > options.style
        // CRITICAL FIX: Start with empty style for borders, don't inherit element's bg
        // Borders should only have fg (color of border lines), not bg (color behind lines)
        // The original code inherited element's bg which caused colored backgrounds on borders
        let borderStyle = {};
        // Apply element's foreground color (for text in border labels)
        if (this.options.style?.fg) {
            borderStyle.fg = this.options.style.fg;
        }
        // Check if border has its own style (from options.border.style)
        if (typeof this.options.border === 'object' && this.options.border.style) {
            borderStyle = { ...borderStyle, ...this.options.border.style };
        }
        // Check if there's a specific border color in options.style.border
        if (this.options.style?.border) {
            borderStyle = { ...borderStyle, ...this.options.style.border };
        }
        // If focused, use focus border style (white border)
        if (this.focused) {
            const focusStyle = this.options.style?.focus;
            if (focusStyle?.border) {
                borderStyle = { ...borderStyle, ...focusStyle.border };
            }
            else {
                // Default: white foreground for border when focused
                borderStyle = { ...borderStyle, fg: 'white' };
            }
        }
        const attr = this.sattr(borderStyle);
        // Top border
        this.screen.fillRegion(attr, chars.horizontal, pos.xi + 1, pos.xl - 1, pos.yi, pos.yi + 1);
        this.screen.fillRegion(attr, chars.topLeft, pos.xi, pos.xi + 1, pos.yi, pos.yi + 1);
        this.screen.fillRegion(attr, chars.topRight, pos.xl - 1, pos.xl, pos.yi, pos.yi + 1);
        // Bottom border
        this.screen.fillRegion(attr, chars.horizontal, pos.xi + 1, pos.xl - 1, pos.yl - 1, pos.yl);
        this.screen.fillRegion(attr, chars.bottomLeft, pos.xi, pos.xi + 1, pos.yl - 1, pos.yl);
        this.screen.fillRegion(attr, chars.bottomRight, pos.xl - 1, pos.xl, pos.yl - 1, pos.yl);
        // Left border
        for (let y = pos.yi + 1; y < pos.yl - 1; y++) {
            this.screen.fillRegion(attr, chars.vertical, pos.xi, pos.xi + 1, y, y + 1);
        }
        // Right border
        for (let y = pos.yi + 1; y < pos.yl - 1; y++) {
            this.screen.fillRegion(attr, chars.vertical, pos.xl - 1, pos.xl, y, y + 1);
        }
    }
    /**
     * Render border with title/label
     */
    renderBorderWithLabel() {
        this.renderBorder();
        const border = typeof this.options.border === 'object' ? this.options.border : null;
        if (!this.options.label && !border?.label)
            return;
        const label = this.options.label || border?.label || '';
        if (!label)
            return;
        const pos = this._getCoords();
        if (!pos)
            return;
        const labelStyle = border?.labelStyle || this.options.style;
        const attr = this.sattr(labelStyle);
        // Calculate label position
        const labelText = ` ${label} `;
        const labelWidth = textWidth(labelText);
        let labelX = pos.xi + 2; // Default left
        if (border?.labelPosition === 'center') {
            labelX = pos.xi + Math.floor((pos.xl - pos.xi - labelWidth) / 2);
        }
        else if (border?.labelPosition === 'right') {
            labelX = pos.xl - labelWidth - 2;
        }
        // Render label on top border
        if (this.screen) {
            for (let i = 0; i < labelText.length; i++) {
                this.screen.fillRegion(attr, labelText[i], labelX + i, labelX + i + 1, pos.yi, pos.yi + 1);
            }
        }
    }
    // ============================================================================
    // Scrollbar Rendering
    // ============================================================================
    /**
     * Check if element has scrollbar
     */
    hasScrollbar() {
        return !!(this.options.scrollbar && this.options.scrollable);
    }
    /**
     * Render scrollbar
     */
    renderScrollbar() {
        if (!this.hasScrollbar() || !this.screen)
            return;
        const pos = this._getCoords();
        if (!pos)
            return;
        const scrollbarOptions = this.options.scrollbar;
        // Get scrollbar style - use scrollbar.style, fall back to element style
        const scrollbarStyle = scrollbarOptions?.style || { fg: 'white', bg: 'black' };
        const attr = this.sattr(scrollbarStyle);
        const border = this.hasBorder() ? 1 : 0;
        // Scrollbar is at the rightmost column of the element
        // Note: For elements without border, this is pos.xl - 1
        // For elements with border, this is inside the border at pos.xl - border - 1
        const scrollbarX = pos.xl - border - 1;
        // Ensure scrollbar X is within bounds
        if (scrollbarX < pos.xi || scrollbarX >= pos.xl)
            return;
        const contentHeight = this._lines.length;
        const viewHeight = this.iheight;
        // If content fits in view, still render track but no thumb scroll needed
        if (contentHeight <= 0 || viewHeight <= 0)
            return;
        const trackChar = typeof scrollbarOptions?.track === 'string'
            ? scrollbarOptions.track
            : scrollbarOptions?.track?.ch || '│';
        const thumbChar = typeof scrollbarOptions?.thumb === 'string'
            ? scrollbarOptions.thumb
            : scrollbarOptions?.thumb?.ch || scrollbarOptions?.ch || '█';
        // Always render scrollbar track
        for (let y = pos.yi + border; y < pos.yl - border; y++) {
            this.screen.fillRegion(attr, trackChar, scrollbarX, scrollbarX + 1, y, y + 1);
        }
        // Only render thumb if content overflows
        if (contentHeight > viewHeight) {
            const scrollbarHeight = Math.max(1, Math.floor((viewHeight / contentHeight) * viewHeight));
            const maxScroll = contentHeight - viewHeight;
            const scrollRatio = maxScroll > 0 ? this.childBase / maxScroll : 0;
            const scrollbarY = Math.floor(scrollRatio * (viewHeight - scrollbarHeight));
            // Render scrollbar thumb
            for (let i = 0; i < scrollbarHeight; i++) {
                const y = pos.yi + border + scrollbarY + i;
                if (y >= pos.yi + border && y < pos.yl - border) {
                    this.screen.fillRegion(attr, thumbChar, scrollbarX, scrollbarX + 1, y, y + 1);
                }
            }
        }
    }
    // ============================================================================
    // Shadow Rendering
    // ============================================================================
    /**
     * Check if element has shadow
     */
    hasShadow() {
        return !!(this.options.shadow);
    }
    /**
     * Render shadow effect
     */
    renderShadow() {
        if (!this.hasShadow() || !this.screen)
            return;
        const pos = this._getCoords();
        if (!pos)
            return;
        const shadowAttr = this.sattr({ bg: 'black', fg: 'black' });
        // Right shadow (1 char wide)
        for (let y = pos.yi + 1; y <= pos.yl; y++) {
            if (pos.xl < this.screen.width) {
                this.screen.fillRegion(shadowAttr, ' ', pos.xl, pos.xl + 1, y, y + 1);
            }
        }
        // Bottom shadow (1 char tall)
        for (let x = pos.xi + 1; x <= pos.xl; x++) {
            if (pos.yl < this.screen.height) {
                this.screen.fillRegion(shadowAttr, ' ', x, x + 1, pos.yl, pos.yl + 1);
            }
        }
    }
    // ============================================================================
    // Clipping and Dirty Regions
    // ============================================================================
    /**
     * Check if point is within element bounds
     */
    isInBounds(x, y) {
        const pos = this._getCoords();
        if (!pos)
            return false;
        return x >= pos.xi && x < pos.xl && y >= pos.yi && y < pos.yl;
    }
    /**
     * Clip coordinates to element bounds
     */
    clipRegion(x1, x2, y1, y2) {
        const pos = this._getCoords();
        if (!pos)
            return null;
        const border = this.hasBorder() ? 1 : 0;
        const padding = this.getPadding();
        const clipX1 = pos.xi + border + padding.left;
        const clipX2 = pos.xl - border - padding.right;
        const clipY1 = pos.yi + border + padding.top;
        const clipY2 = pos.yl - border - padding.bottom;
        // Clip to bounds
        const clippedX1 = Math.max(x1, clipX1);
        const clippedX2 = Math.min(x2, clipX2);
        const clippedY1 = Math.max(y1, clipY1);
        const clippedY2 = Math.min(y2, clipY2);
        // Check if region is valid
        if (clippedX1 >= clippedX2 || clippedY1 >= clippedY2) {
            return null;
        }
        return {
            x1: clippedX1,
            x2: clippedX2,
            y1: clippedY1,
            y2: clippedY2,
        };
    }
    /**
     * Mark element as needing re-render
     */
    markDirty() {
        if (this.screen) {
            this.screen.render();
        }
    }
    /**
     * Clear element content area (fill with background)
     */
    clearContent() {
        if (!this.screen)
            return;
        const pos = this._getCoords();
        if (!pos)
            return;
        const attr = this.sattr(this.options.style);
        const border = this.hasBorder() ? 1 : 0;
        const padding = this.getPadding();
        const x1 = pos.xi + border + padding.left;
        const x2 = pos.xl - border - padding.right;
        const y1 = pos.yi + border + padding.top;
        const y2 = pos.yl - border - padding.bottom;
        this.screen.clearRegion(x1, x2, y1, y2);
    }
    // ============================================================================
    // Rendering Helpers
    // ============================================================================
    /**
     * Get visible content lines (with scrolling applied)
     */
    getVisibleLines() {
        // Re-parse content if marked dirty and we now have valid dimensions
        if (this._contentDirty && this.iwidth > 0) {
            this._lines = this.parseContent(this.content);
            this._contentDirty = false;
        }
        const start = this.childBase;
        const end = start + this.iheight;
        return this._lines.slice(start, end);
    }
    /**
     * Render content text (called by subclasses)
     */
    renderContent() {
        if (!this.screen)
            return;
        const pos = this._getCoords();
        if (!pos)
            return;
        const lines = this.getVisibleLines();
        const attr = this.sattr(this.options.style);
        let y = this.itop;
        for (const line of lines) {
            if (y >= this.itop + this.iheight)
                break;
            let x = this.ileft;
            let currentAttr = attr;
            let inAnsi = false;
            let ansiBuffer = '';
            for (let i = 0; i < line.length && x < this.ileft + this.iwidth; i++) {
                const ch = line[i];
                // Handle ANSI escape sequences
                if (ch === '\x1b') {
                    inAnsi = true;
                    ansiBuffer = ch;
                    continue;
                }
                if (inAnsi) {
                    ansiBuffer += ch;
                    if (ch === 'm') {
                        inAnsi = false;
                        // Parse ANSI and update attr (simplified)
                        currentAttr = attr; // TODO: Parse ANSI sequence
                        ansiBuffer = '';
                    }
                    continue;
                }
                // Render character
                this.screen.fillRegion(currentAttr, ch, x, x + 1, y, y + 1);
                x++;
            }
            y++;
        }
    }
    /**
     * Render element and all children (full render)
     */
    renderElement() {
        if (!this.visible || this.hidden)
            return;
        // Clear region
        this.clearContent();
        // Render shadow first (behind element)
        if (this.hasShadow()) {
            this.renderShadow();
        }
        // Render border
        if (this.hasBorder()) {
            this.renderBorderWithLabel();
        }
        // Render content (implemented by subclasses)
        this.renderContent();
        // Render scrollbar
        if (this.hasScrollbar()) {
            this.renderScrollbar();
        }
        // Render children
        for (const child of this.children) {
            if (child.visible && !child.hidden) {
                child.renderElement();
            }
        }
        // Cache position
        this.lpos = { ...this._getCoords() };
    }
    // ============================================================================
    // Node Tree Methods
    // ============================================================================
    /**
     * Get child element by name or index
     */
    get(name, recursive = false) {
        if (typeof name === 'number') {
            return this.children[name] || null;
        }
        // Search direct children
        for (const child of this.children) {
            if (child.options.name === name) {
                return child;
            }
        }
        // Search recursively if requested
        if (recursive) {
            for (const child of this.children) {
                const found = child.get(name, true);
                if (found)
                    return found;
            }
        }
        return null;
    }
    /**
     * Get all descendant elements
     */
    getDescendants() {
        const descendants = [];
        this._collectDescendantsHelper(descendants);
        return descendants;
    }
    /**
     * Collect all descendants recursively (helper)
     */
    _collectDescendantsHelper(out) {
        for (const child of this.children) {
            out.push(child);
            child._collectDescendantsHelper(out);
        }
    }
    /**
     * Check if this element has a specific ancestor
     */
    hasAncestor(element) {
        let current = this.parent;
        while (current) {
            if (current === element)
                return true;
            current = current.parent;
        }
        return false;
    }
    /**
     * Get element's index in parent's children array
     */
    getIndex() {
        if (!this.parent)
            return -1;
        return this.parent.children.indexOf(this);
    }
    /**
     * Set element's z-index (position in children array)
     */
    setIndex(index) {
        if (!this.parent)
            return;
        const currentIndex = this.getIndex();
        if (currentIndex === -1)
            return;
        // Remove from current position
        this.parent.children.splice(currentIndex, 1);
        // Insert at new position
        const newIndex = Math.max(0, Math.min(index, this.parent.children.length));
        this.parent.children.splice(newIndex, 0, this);
        this.emit('set index', index);
    }
    /**
     * Get all ancestors up to root
     */
    getAncestors() {
        const ancestors = [];
        let current = this.parent;
        while (current) {
            ancestors.push(current);
            current = current.parent;
        }
        return ancestors;
    }
    /**
     * Iterate over descendants with callback
     * EXACT from neo-blessed node.js lines 185-191
     */
    forDescendants(iter, includeSelf) {
        if (includeSelf)
            iter(this);
        const emit = (el) => {
            iter(el);
            el.children.forEach(emit);
        };
        this.children.forEach(emit);
    }
    /**
     * Iterate over ancestors with callback
     * EXACT from neo-blessed node.js lines 193-199
     */
    forAncestors(iter, includeSelf) {
        let el = this;
        if (includeSelf)
            iter(this);
        while ((el = el.parent)) {
            iter(el);
        }
    }
    /**
     * Collect descendants into array (alias for getDescendants for neo-blessed compat)
     * EXACT from neo-blessed node.js lines 201-207
     */
    collectDescendants(includeSelf) {
        const out = [];
        this.forDescendants((el) => {
            out.push(el);
        }, includeSelf);
        return out;
    }
    /**
     * Collect ancestors into array (alias for getAncestors for neo-blessed compat)
     * EXACT from neo-blessed node.js lines 209-215
     */
    collectAncestors(includeSelf) {
        const out = [];
        this.forAncestors((el) => {
            out.push(el);
        }, includeSelf);
        return out;
    }
    /**
     * Emit event to all descendants
     * EXACT from neo-blessed node.js lines 217-229
     */
    emitDescendants(...args) {
        let iter;
        // Check if last argument is a function
        if (typeof args[args.length - 1] === 'function') {
            iter = args.pop();
        }
        this.forDescendants((el) => {
            if (iter)
                iter(el);
            // TypeScript needs explicit spread for emit
            if (args.length > 0) {
                el.emit(...args);
            }
        }, true);
    }
    /**
     * Emit event to all ancestors
     * EXACT from neo-blessed node.js lines 231-243
     */
    emitAncestors(...args) {
        let iter;
        // Check if last argument is a function
        if (typeof args[args.length - 1] === 'function') {
            iter = args.pop();
        }
        this.forAncestors((el) => {
            if (iter)
                iter(el);
            // TypeScript needs explicit spread for emit
            if (args.length > 0) {
                el.emit(...args);
            }
        }, true);
    }
    /**
     * Check if element has a specific descendant
     * EXACT from neo-blessed node.js lines 245-257
     */
    hasDescendant(target) {
        const find = (el) => {
            for (let i = 0; i < el.children.length; i++) {
                if (el.children[i] === target) {
                    return true;
                }
                if (find(el.children[i])) {
                    return true;
                }
            }
            return false;
        };
        return find(this);
    }
    // ============================================================================
    // Label Management
    // ============================================================================
    /**
     * Set element label
     */
    setLabel(text) {
        this.options.label = text;
        if (this.screen) {
            this.screen.render();
        }
    }
    /**
     * Get element label
     */
    getLabel() {
        return this.options.label;
    }
    /**
     * Remove element label
     */
    removeLabel() {
        delete this.options.label;
        if (this.screen) {
            this.screen.render();
        }
    }
    // ============================================================================
    // Hover Effects
    // ============================================================================
    /**
     * Apply hover style to element
     */
    applyHoverStyle() {
        if (!this.options.style?.hover)
            return;
        // Store original style
        this._originalStyle = { ...this.options.style };
        // Apply hover style
        this.options.style = {
            ...this.options.style,
            ...this.options.style.hover,
        };
        if (this.screen) {
            this.screen.render();
        }
    }
    /**
     * Remove hover style from element
     */
    removeHoverStyle() {
        if (!this._originalStyle)
            return;
        // Restore original style
        this.options.style = this._originalStyle;
        delete this._originalStyle;
        if (this.screen) {
            this.screen.render();
        }
    }
    /**
     * Set hover style
     */
    setHover(style) {
        if (!this.options.style) {
            this.options.style = {};
        }
        this.options.style.hover = style;
    }
    // ============================================================================
    // Text Measurement and Utilities
    // ============================================================================
    /**
     * Get visual width of text (excluding ANSI codes)
     */
    strWidth(text) {
        return textWidth(text);
    }
    /**
     * Shrink box to fit content
     */
    shrinkBox() {
        const lines = this.getContentLines();
        let maxWidth = 0;
        for (const line of lines) {
            const width = this.strWidth(line);
            if (width > maxWidth)
                maxWidth = width;
        }
        const border = this.hasBorder() ? 2 : 0;
        const padding = this.getPadding();
        this.options.width = maxWidth + border + padding.left + padding.right;
        this.options.height = lines.length + border + padding.top + padding.bottom;
        if (this.screen) {
            this.screen.render();
        }
    }
    /**
     * Get content without ANSI codes
     */
    getPlainContent() {
        return stripAnsi(this.content);
    }
    /**
     * Measure text dimensions
     */
    measureText(text) {
        const lines = text.split(/\r?\n/);
        let maxWidth = 0;
        for (const line of lines) {
            const width = this.strWidth(line);
            if (width > maxWidth)
                maxWidth = width;
        }
        return {
            width: maxWidth,
            height: lines.length,
        };
    }
    // ============================================================================
    // Unicode and Character Width Support
    // ============================================================================
    /**
     * Get width of a single character (handles double-width characters)
     */
    charWidth(ch) {
        const code = ch.charCodeAt(0);
        // ASCII and most Latin characters are single-width
        if (code < 0x1100)
            return 1;
        // Check for double-width ranges (CJK, etc.)
        if ((code >= 0x1100 && code <= 0x115f) || // Hangul Jamo
            (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) || // CJK
            (code >= 0xac00 && code <= 0xd7a3) || // Hangul Syllables
            (code >= 0xf900 && code <= 0xfaff) || // CJK Compatibility
            (code >= 0xfe10 && code <= 0xfe19) || // Vertical forms
            (code >= 0xfe30 && code <= 0xfe6f) || // CJK Compatibility Forms
            (code >= 0xff00 && code <= 0xff60) || // Fullwidth Forms
            (code >= 0xffe0 && code <= 0xffe6) || // Fullwidth Forms
            (code >= 0x20000 && code <= 0x2fffd) || // CJK Unified Ideographs Extension B-D
            (code >= 0x30000 && code <= 0x3fffd) // CJK Unified Ideographs Extension E-F
        ) {
            return 2;
        }
        // Zero-width characters
        if ((code >= 0x0300 && code <= 0x036f) || // Combining marks
            (code >= 0x1ab0 && code <= 0x1aff) || // Combining marks
            (code >= 0x1dc0 && code <= 0x1dff) || // Combining marks
            (code >= 0x20d0 && code <= 0x20ff) || // Combining marks
            (code >= 0xfe20 && code <= 0xfe2f) // Combining half marks
        ) {
            return 0;
        }
        return 1;
    }
    /**
     * Get total width of string considering multi-width characters
     */
    textWidth(text) {
        // Strip ANSI codes first
        const plain = stripAnsi(text);
        let width = 0;
        for (const ch of plain) {
            width += this.charWidth(ch);
        }
        return width;
    }
    /**
     * Truncate text to fit width (considering multi-width chars)
     */
    truncateText(text, maxWidth, ellipsis = '...') {
        const plain = stripAnsi(text);
        let width = 0;
        let result = '';
        for (const ch of plain) {
            const chWidth = this.charWidth(ch);
            if (width + chWidth > maxWidth - ellipsis.length) {
                return result + ellipsis;
            }
            width += chWidth;
            result += ch;
        }
        return result;
    }
    // ============================================================================
    // Advanced Content Operations
    // ============================================================================
    /**
     * Insert text at cursor position
     */
    insertText(text, position) {
        if (position === undefined) {
            this.content += text;
        }
        else {
            this.content = this.content.slice(0, position) + text + this.content.slice(position);
        }
        this.parseContent();
        if (this.screen) {
            this.screen.render();
        }
    }
    /**
     * Delete text in range
     */
    deleteText(start, end) {
        this.content = this.content.slice(0, start) + this.content.slice(end);
        this.parseContent();
        if (this.screen) {
            this.screen.render();
        }
    }
    /**
     * Get cursor position from pixel coordinates
     */
    screenToContentPos(x, y) {
        const lines = this._lines;
        const relY = y - this.itop;
        const relX = x - this.ileft;
        if (relY < 0 || relY >= lines.length) {
            return { line: -1, col: -1 };
        }
        const line = lines[relY];
        const plain = stripAnsi(line);
        let col = 0;
        let width = 0;
        for (let i = 0; i < plain.length; i++) {
            if (width >= relX)
                break;
            width += this.charWidth(plain[i]);
            col++;
        }
        return { line: relY, col };
    }
    // ============================================================================
    // Destruction
    // ============================================================================
    destroy() {
        if (this.destroyed)
            return;
        // Emit overlay hide event if element had opacity
        if (this.options.style?.opacity !== undefined) {
            this._emitOverlayEvent(false);
        }
        this.destroyed = true;
        // Emit 'destroy' event BEFORE removing listeners so handlers can respond
        this.emit('destroy');
        // Destroy all children
        for (const child of this.children.slice()) {
            child.destroy();
        }
        // Detach from parent
        this.detach();
        // Clear all event listeners (after emitting destroy)
        this.removeAllListeners();
    }
    free() {
        this.destroy();
    }
}
