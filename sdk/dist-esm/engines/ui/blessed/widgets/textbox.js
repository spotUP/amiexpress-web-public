/**
 * Textbox widget - Single-line text input with horizontal scrolling
 */
import { Element } from '../core/element';
export class Textbox extends Element {
    constructor(options = {}) {
        super({
            focusable: true,
            clickable: true,
            mouse: true, // Enable mouse events for drag selection
            keys: true,
            ...options,
            tags: true, // Enable tag parsing for cursor display (forced, cannot be overridden)
        });
        this.value = '';
        this.cursorPos = 0;
        this.viewOffset = 0; // Horizontal scroll offset for long text
        this.secret = false;
        this.censor = false;
        // Text selection state
        this.selectionStart = -1; // -1 = no selection
        this.selectionEnd = -1;
        this.isDragging = false;
        this.selectDebounceTimer = null;
        this.value = options.value || '';
        this.secret = options.secret || false;
        this.censor = options.censor || false;
        this.cursorPos = this.value.length;
        // Update display
        this._updateContent();
        // Key handlers
        if (options.keys !== false) {
            this.on('keypress', this._onKeypress.bind(this));
        }
        // Focus handlers
        this.on('focus', () => {
            this._updateContent(); // Show cursor when focused
            if (options.inputOnFocus !== false) {
                this.readInput();
            }
        });
        this.on('blur', () => {
            this._updateContent(); // Hide cursor when unfocused
        });
        // Click to focus and position cursor (but not if we just finished a drag selection)
        this.on('click', (event) => {
            this.focus();
            // Only reposition cursor if we don't have an active selection
            // (click fires after mouseup, so don't clear a just-made selection)
            if (!this.hasSelection() && event && typeof event.x === 'number') {
                const clickPos = this._getCharPosFromClick(event.x);
                this.cursorPos = clickPos;
                this._updateContent();
            }
        });
        // Mouse selection via drag
        this.on('mousedown', (event) => {
            if (event && typeof event.x === 'number') {
                this.isDragging = true;
                const clickPos = this._getCharPosFromClick(event.x);
                this.selectionStart = clickPos;
                this.selectionEnd = clickPos;
                this.cursorPos = clickPos;
                this._updateContent();
            }
        });
        this.on('mousemove', (event) => {
            if (this.isDragging && event && typeof event.x === 'number') {
                const dragPos = this._getCharPosFromClick(event.x);
                this.selectionEnd = dragPos;
                this.cursorPos = dragPos;
                this._updateContent();
            }
        });
        this.on('mouseup', () => {
            if (this.isDragging) {
                this.isDragging = false;
                // Normalize selection so start <= end
                if (this.selectionStart > this.selectionEnd) {
                    [this.selectionStart, this.selectionEnd] = [this.selectionEnd, this.selectionStart];
                }
                // Clear selection if it's empty (start == end)
                if (this.selectionStart === this.selectionEnd) {
                    this.clearSelection();
                }
                else {
                    // Emit select event when mouse selection is complete
                    this.emit('select', this.getSelection());
                }
                this._updateContent();
            }
        });
    }
    /**
     * Convert click x-coordinate to character position in value
     */
    _getCharPosFromClick(clickX) {
        // Calculate position relative to element's inner area
        const elementLeft = this.aleft + (this.ileft || 0);
        const relativeX = clickX - elementLeft;
        // Add viewOffset to get actual position in value
        const pos = this.viewOffset + relativeX;
        // Clamp to valid range
        return Math.max(0, Math.min(pos, this.value.length));
    }
    _onKeypress(ch, key) {
        if (!this.focused)
            return false;
        // Ignore Tab - it's handled by screen for focus navigation
        if (key.name === 'tab')
            return false;
        // Ctrl+A to select all
        if (key.ctrl && key.name === 'a') {
            this.selectAll();
            return true;
        }
        // Character input - insert printable characters (including Unicode)
        // Accept any character that isn't a control character (< 32) except for extended Unicode
        if (ch && ch.length >= 1 && !key.ctrl && !key.meta) {
            const charCode = ch.charCodeAt(0);
            // Allow: space (32) and above, including all Unicode characters (>= 128)
            // Block: control characters (0-31) and DEL (127)
            if (charCode >= 32 && charCode !== 127) {
                this.insertChar(ch);
                return true;
            }
        }
        // Special keys
        switch (key.name) {
            case 'backspace':
                this.deleteChar();
                return true;
            case 'delete':
                this.deleteCharForward();
                return true;
            case 'left':
                if (key.shift) {
                    this._extendSelection(-1);
                }
                else {
                    this.clearSelection();
                    this.cursorLeft();
                }
                return true;
            case 'right':
                if (key.shift) {
                    this._extendSelection(1);
                }
                else {
                    this.clearSelection();
                    this.cursorRight();
                }
                return true;
            case 'home':
                if (key.shift) {
                    this._selectTo(0);
                }
                else {
                    this.clearSelection();
                    this.cursorHome();
                }
                return true;
            case 'end':
                if (key.shift) {
                    this._selectTo(this.value.length);
                }
                else {
                    this.clearSelection();
                    this.cursorEnd();
                }
                return true;
            case 'escape':
                this.clearSelection();
                this.blur();
                this.cancel();
                return true;
        }
        return false;
    }
    /**
     * Emit select event after a debounce delay (for keyboard selection)
     */
    _emitSelectDebounced() {
        if (this.selectDebounceTimer) {
            clearTimeout(this.selectDebounceTimer);
        }
        this.selectDebounceTimer = setTimeout(() => {
            this.selectDebounceTimer = null;
            if (this.hasSelection()) {
                this.emit('select', this.getSelection());
            }
        }, 500); // 500ms delay
    }
    /**
     * Extend selection by delta positions (-1 = left, 1 = right)
     */
    _extendSelection(delta) {
        // Start selection at cursor if not already selecting
        if (this.selectionStart === -1) {
            this.selectionStart = this.cursorPos;
            this.selectionEnd = this.cursorPos;
        }
        // Move cursor and extend selection
        const newPos = Math.max(0, Math.min(this.cursorPos + delta, this.value.length));
        this.cursorPos = newPos;
        this.selectionEnd = newPos;
        this._updateContent();
        // Emit select event after debounce delay
        this._emitSelectDebounced();
    }
    /**
     * Select from current selection start to target position
     */
    _selectTo(pos) {
        if (this.selectionStart === -1) {
            this.selectionStart = this.cursorPos;
        }
        this.cursorPos = pos;
        this.selectionEnd = pos;
        this._updateContent();
        // Emit select event after debounce delay
        this._emitSelectDebounced();
    }
    /**
     * Get the visible width for text (accounting for borders/padding)
     */
    _getVisibleWidth() {
        // Use iwidth if available, otherwise calculate from options
        const width = this.iwidth;
        // Return at least 1 to avoid infinite loops, default to 80 if width not calculated yet
        return Math.max(1, width > 0 ? width : 80);
    }
    /**
     * Ensure cursor is visible by adjusting viewOffset
     */
    _ensureCursorVisible() {
        const visibleWidth = this._getVisibleWidth();
        // If cursor is before viewOffset, scroll left
        if (this.cursorPos < this.viewOffset) {
            this.viewOffset = this.cursorPos;
        }
        // If cursor is beyond visible area, scroll right
        if (this.cursorPos >= this.viewOffset + visibleWidth) {
            this.viewOffset = this.cursorPos - visibleWidth + 1;
        }
        // Ensure viewOffset is never negative
        this.viewOffset = Math.max(0, this.viewOffset);
    }
    /**
     * Escape blessed tag characters so they display literally
     */
    _escapeForDisplay(text) {
        // Replace { with {open} and } with {close} so blessed doesn't interpret them as tags
        return text.replace(/\{/g, '{open}').replace(/\}/g, '{close}');
    }
    _updateContent() {
        this._ensureCursorVisible();
        let text = this.value;
        if (this.secret || this.censor) {
            text = '*'.repeat(this.value.length);
        }
        // Get visible portion of text based on viewOffset
        const visibleWidth = this._getVisibleWidth();
        const visibleText = text.slice(this.viewOffset, this.viewOffset + visibleWidth);
        let display;
        const useTags = this.options.tags;
        if (this.focused) {
            // Check if there's a selection
            if (this.hasSelection()) {
                // Get normalized selection bounds
                const selStart = Math.min(this.selectionStart, this.selectionEnd);
                const selEnd = Math.max(this.selectionStart, this.selectionEnd);
                // Convert to visible range
                const visStart = Math.max(0, selStart - this.viewOffset);
                const visEnd = Math.min(visibleText.length, selEnd - this.viewOffset);
                if (visEnd > visStart && visStart < visibleText.length) {
                    // Render selection with inverse video
                    // Escape user content if tags are NOT enabled so {} chars don't break blessed
                    const before = useTags ? visibleText.slice(0, visStart) : this._escapeForDisplay(visibleText.slice(0, visStart));
                    const selected = useTags ? visibleText.slice(visStart, visEnd) : this._escapeForDisplay(visibleText.slice(visStart, visEnd));
                    const after = useTags ? visibleText.slice(visEnd) : this._escapeForDisplay(visibleText.slice(visEnd));
                    display = `${before}{inverse}${selected}{/inverse}${after}`;
                }
                else {
                    // Selection not visible, show cursor
                    const cursorPosInView = this.cursorPos - this.viewOffset;
                    const beforeCursor = useTags ? visibleText.slice(0, cursorPosInView) : this._escapeForDisplay(visibleText.slice(0, cursorPosInView));
                    const atCursor = useTags ? (visibleText[cursorPosInView] || ' ') : this._escapeForDisplay(visibleText[cursorPosInView] || ' ');
                    const afterCursor = useTags ? visibleText.slice(cursorPosInView + 1) : this._escapeForDisplay(visibleText.slice(cursorPosInView + 1));
                    display = `${beforeCursor}{inverse}${atCursor}{/inverse}${afterCursor}`;
                }
            }
            else {
                // No selection, show cursor as inverse video at cursor position
                const cursorPosInView = this.cursorPos - this.viewOffset;
                const beforeCursor = useTags ? visibleText.slice(0, cursorPosInView) : this._escapeForDisplay(visibleText.slice(0, cursorPosInView));
                const atCursor = useTags ? (visibleText[cursorPosInView] || ' ') : this._escapeForDisplay(visibleText[cursorPosInView] || ' '); // Space if at end
                const afterCursor = useTags ? visibleText.slice(cursorPosInView + 1) : this._escapeForDisplay(visibleText.slice(cursorPosInView + 1));
                display = `${beforeCursor}{inverse}${atCursor}{/inverse}${afterCursor}`;
            }
        }
        else {
            // Not focused - only escape if tags NOT enabled
            display = useTags ? visibleText : this._escapeForDisplay(visibleText);
        }
        this.setContent(display);
        // Re-render screen to show the updated content
        if (this.screen) {
            this.screen.render();
        }
    }
    insertChar(ch) {
        // If there's a selection, replace it
        if (this.hasSelection()) {
            this.replaceSelection(ch);
            return;
        }
        this.value = this.value.slice(0, this.cursorPos) + ch + this.value.slice(this.cursorPos);
        this.cursorPos++;
        this._updateContent();
        this.emit('change', this.value);
    }
    deleteChar() {
        // If there's a selection, delete it
        if (this.hasSelection()) {
            this.replaceSelection('');
            return;
        }
        if (this.cursorPos > 0) {
            this.value = this.value.slice(0, this.cursorPos - 1) + this.value.slice(this.cursorPos);
            this.cursorPos--;
            this._updateContent();
            this.emit('change', this.value);
        }
    }
    deleteCharForward() {
        // If there's a selection, delete it
        if (this.hasSelection()) {
            this.replaceSelection('');
            return;
        }
        if (this.cursorPos < this.value.length) {
            this.value = this.value.slice(0, this.cursorPos) + this.value.slice(this.cursorPos + 1);
            this._updateContent();
            this.emit('change', this.value);
        }
    }
    /**
     * Check if there is an active text selection
     */
    hasSelection() {
        return this.selectionStart !== -1 &&
            this.selectionEnd !== -1 &&
            this.selectionStart !== this.selectionEnd;
    }
    /**
     * Get the current selection info
     */
    getSelection() {
        if (!this.hasSelection()) {
            return null;
        }
        const start = Math.min(this.selectionStart, this.selectionEnd);
        const end = Math.max(this.selectionStart, this.selectionEnd);
        return {
            start,
            end,
            text: this.value.slice(start, end),
        };
    }
    /**
     * Replace the current selection with new text
     */
    replaceSelection(text) {
        if (!this.hasSelection()) {
            return;
        }
        const start = Math.min(this.selectionStart, this.selectionEnd);
        const end = Math.max(this.selectionStart, this.selectionEnd);
        this.value = this.value.slice(0, start) + text + this.value.slice(end);
        this.cursorPos = start + text.length;
        this.clearSelection();
        this._updateContent();
        this.emit('change', this.value);
    }
    /**
     * Clear the current selection
     */
    clearSelection() {
        this.selectionStart = -1;
        this.selectionEnd = -1;
        this.isDragging = false;
    }
    /**
     * Select all text
     */
    selectAll() {
        this.selectionStart = 0;
        this.selectionEnd = this.value.length;
        this.cursorPos = this.value.length;
        this._updateContent();
    }
    cursorLeft() {
        if (this.cursorPos > 0) {
            this.cursorPos--;
            this._updateContent();
        }
    }
    cursorRight() {
        if (this.cursorPos < this.value.length) {
            this.cursorPos++;
            this._updateContent();
        }
    }
    cursorHome() {
        this.cursorPos = 0;
        this.viewOffset = 0;
        this._updateContent();
    }
    cursorEnd() {
        this.cursorPos = this.value.length;
        this._updateContent();
    }
    submit() {
        this.emit('submit', this.value);
    }
    cancel() {
        this.emit('cancel');
    }
    setValue(value) {
        this.value = value;
        this.cursorPos = value.length;
        this.viewOffset = 0;
        this._updateContent();
        this.emit('change', this.value);
    }
    getValue() {
        return this.value;
    }
    clearValue() {
        // Explicitly reset all state to ensure visual clear
        this.value = '';
        this.cursorPos = 0;
        this.viewOffset = 0;
        this._updateContent();
        this.emit('change', this.value);
    }
    readInput() {
        // This would be implemented by the door to handle async input
        this.emit('readInput');
    }
}
// Alias
export class Input extends Textbox {
}
/**
 * Textarea - Multi-line text input with vertical scrolling
 */
export class Textarea extends Element {
    constructor(options = {}) {
        super({
            focusable: true,
            clickable: true,
            keys: true,
            scrollable: true,
            alwaysScroll: true,
            mouse: true,
            ...options,
            // Amiga-safe scrollbar: space with bg colors (no Unicode needed)
            scrollbar: options.scrollbar === undefined || options.scrollbar ? {
                ch: ' ',
                track: { ch: ' ', style: { bg: 'black' } },
                style: (options.scrollbar && typeof options.scrollbar === 'object' ? options.scrollbar.style : undefined) || { bg: 'cyan' },
            } : undefined,
        });
        this.value = '';
        this.cursorPos = 0; // Position in flat string
        this.viewOffsetY = 0; // Vertical scroll offset (line number)
        // Text selection state
        this.selectionStart = -1; // -1 = no selection
        this.selectionEnd = -1;
        this.isDragging = false;
        this.selectDebounceTimer = null;
        this.value = options.value || '';
        this.cursorPos = this.value.length;
        this._updateContent();
        if (options.keys !== false) {
            this.on('keypress', this._onKeypress.bind(this));
        }
        this.on('focus', () => {
            this._updateContent();
        });
        this.on('blur', () => {
            this._updateContent();
        });
        // Click to focus and position cursor
        this.on('click', (event) => {
            this.focus();
            // Only reposition cursor if we don't have an active selection
            // (click fires after mouseup, so don't clear a just-made selection)
            if (!this.hasSelection() && event && typeof event.x === 'number' && typeof event.y === 'number') {
                const clickPos = this._getCharPosFromClick(event.x, event.y);
                this.cursorPos = clickPos;
                this._updateContent();
            }
        });
        // Mouse selection via drag
        this.on('mousedown', (event) => {
            if (event && typeof event.x === 'number' && typeof event.y === 'number') {
                this.isDragging = true;
                const clickPos = this._getCharPosFromClick(event.x, event.y);
                this.selectionStart = clickPos;
                this.selectionEnd = clickPos;
                this.cursorPos = clickPos;
                this._updateContent();
            }
        });
        this.on('mousemove', (event) => {
            if (this.isDragging && event && typeof event.x === 'number' && typeof event.y === 'number') {
                const dragPos = this._getCharPosFromClick(event.x, event.y);
                this.selectionEnd = dragPos;
                this.cursorPos = dragPos;
                this._updateContent();
            }
        });
        this.on('mouseup', () => {
            if (this.isDragging) {
                this.isDragging = false;
                // Normalize selection so start <= end
                if (this.selectionStart > this.selectionEnd) {
                    [this.selectionStart, this.selectionEnd] = [this.selectionEnd, this.selectionStart];
                }
                // Clear selection if it's empty (start == end)
                if (this.selectionStart === this.selectionEnd) {
                    this.clearSelection();
                }
                else {
                    // Emit select event when mouse selection is complete
                    this.emit('select', this.getSelection());
                }
                this._updateContent();
            }
        });
        // Mouse wheel scrolling
        if (options.mouse !== false) {
            this.on('wheelup', () => {
                if (this.viewOffsetY > 0) {
                    this.viewOffsetY--;
                    this._updateContent();
                }
            });
            this.on('wheeldown', () => {
                const lines = this._getLines();
                const visibleHeight = this._getVisibleHeight();
                if (this.viewOffsetY < lines.length - visibleHeight) {
                    this.viewOffsetY++;
                    this._updateContent();
                }
            });
        }
    }
    _onKeypress(ch, key) {
        if (!this.focused)
            return false;
        // Ignore Tab (except Shift+Tab) - handled by screen for focus navigation
        if (key.name === 'tab' && !key.shift)
            return false;
        // Ctrl+A to select all
        if (key.ctrl && key.name === 'a') {
            this.selectAll();
            return true;
        }
        // Character input - printable characters (including Unicode)
        if (ch && ch.length >= 1 && !key.ctrl && !key.meta) {
            const charCode = ch.charCodeAt(0);
            // Allow: space (32) and above, including all Unicode characters (>= 128)
            // Block: control characters (0-31) and DEL (127)
            if (charCode >= 32 && charCode !== 127) {
                this.insertChar(ch);
                return true;
            }
        }
        switch (key.name) {
            case 'backspace':
                this.deleteChar();
                return true;
            case 'delete':
                this.deleteCharForward();
                return true;
            case 'left':
                if (key.shift) {
                    this._extendSelection(-1);
                }
                else {
                    this.clearSelection();
                    this.cursorLeft();
                }
                return true;
            case 'right':
                if (key.shift) {
                    this._extendSelection(1);
                }
                else {
                    this.clearSelection();
                    this.cursorRight();
                }
                return true;
            case 'up':
                if (key.shift) {
                    this._extendSelectionVertical(-1);
                }
                else {
                    this.clearSelection();
                    this.cursorUp();
                }
                return true;
            case 'down':
                if (key.shift) {
                    this._extendSelectionVertical(1);
                }
                else {
                    this.clearSelection();
                    this.cursorDown();
                }
                return true;
            case 'home':
                if (key.shift) {
                    this._selectTo(0);
                }
                else {
                    this.clearSelection();
                    this.cursorHome();
                }
                return true;
            case 'end':
                if (key.shift) {
                    this._selectTo(this.value.length);
                }
                else {
                    this.clearSelection();
                    this.cursorEnd();
                }
                return true;
            case 'enter':
                // Multi-line: Enter inserts newline
                this.insertChar('\n');
                return true;
            case 'escape':
                this.clearSelection();
                this.blur();
                this.cancel();
                return true;
            case 'tab':
                // Shift+Tab submits, Tab inserts spaces
                if (key.shift) {
                    this.submit();
                }
                else {
                    this.insertChar('  '); // Insert 2 spaces
                }
                return true;
        }
        return false;
    }
    /**
     * Emit select event after a debounce delay (for keyboard selection)
     */
    _emitSelectDebounced() {
        if (this.selectDebounceTimer) {
            clearTimeout(this.selectDebounceTimer);
        }
        this.selectDebounceTimer = setTimeout(() => {
            this.selectDebounceTimer = null;
            if (this.hasSelection()) {
                this.emit('select', this.getSelection());
            }
        }, 500); // 500ms delay
    }
    /**
     * Extend selection by delta positions (-1 = left, 1 = right)
     */
    _extendSelection(delta) {
        // Start selection at cursor if not already selecting
        if (this.selectionStart === -1) {
            this.selectionStart = this.cursorPos;
            this.selectionEnd = this.cursorPos;
        }
        // Move cursor and extend selection
        const newPos = Math.max(0, Math.min(this.cursorPos + delta, this.value.length));
        this.cursorPos = newPos;
        this.selectionEnd = newPos;
        this._updateContent();
        // Emit select event after debounce delay
        this._emitSelectDebounced();
    }
    /**
     * Extend selection vertically by moving cursor up/down
     */
    _extendSelectionVertical(lineDelta) {
        // Start selection at cursor if not already selecting
        if (this.selectionStart === -1) {
            this.selectionStart = this.cursorPos;
            this.selectionEnd = this.cursorPos;
        }
        // Move cursor vertically
        if (lineDelta < 0) {
            this.cursorUp();
        }
        else {
            this.cursorDown();
        }
        this.selectionEnd = this.cursorPos;
        this._updateContent();
        // Emit select event after debounce delay
        this._emitSelectDebounced();
    }
    /**
     * Select from current selection start to target position
     */
    _selectTo(pos) {
        if (this.selectionStart === -1) {
            this.selectionStart = this.cursorPos;
        }
        this.cursorPos = pos;
        this.selectionEnd = pos;
        this._updateContent();
        // Emit select event after debounce delay
        this._emitSelectDebounced();
    }
    /**
     * Convert click coordinates to character position in value
     */
    _getCharPosFromClick(clickX, clickY) {
        const elementLeft = this.aleft + (this.ileft || 0);
        const elementTop = this.atop + (this.itop || 0);
        const relativeX = clickX - elementLeft;
        const relativeY = clickY - elementTop + this.viewOffsetY;
        const lines = this._getLines();
        const lineIndex = Math.max(0, Math.min(relativeY, lines.length - 1));
        // Calculate position in value string
        let pos = 0;
        for (let i = 0; i < lineIndex; i++) {
            pos += lines[i].length + 1; // +1 for newline
        }
        pos += Math.max(0, Math.min(relativeX, lines[lineIndex]?.length || 0));
        return Math.max(0, Math.min(pos, this.value.length));
    }
    _getLines() {
        return this.value.split('\n');
    }
    _getCursorLineCol() {
        const textBeforeCursor = this.value.slice(0, this.cursorPos);
        const linesBeforeCursor = textBeforeCursor.split('\n');
        const line = linesBeforeCursor.length - 1;
        const col = linesBeforeCursor[linesBeforeCursor.length - 1].length;
        return { line, col };
    }
    _getVisibleHeight() {
        return Math.max(1, this.iheight > 0 ? this.iheight : 10);
    }
    _ensureCursorVisible() {
        const { line } = this._getCursorLineCol();
        const visibleHeight = this._getVisibleHeight();
        if (line < this.viewOffsetY) {
            this.viewOffsetY = line;
        }
        if (line >= this.viewOffsetY + visibleHeight) {
            this.viewOffsetY = line - visibleHeight + 1;
        }
        this.viewOffsetY = Math.max(0, this.viewOffsetY);
    }
    /**
     * Escape blessed tag characters so they display literally
     */
    _escapeForDisplay(text) {
        // Replace { with {open} and } with {close} so blessed doesn't interpret them as tags
        return text.replace(/\{/g, '{open}').replace(/\}/g, '{close}');
    }
    _updateContent() {
        this._ensureCursorVisible();
        const lines = this._getLines();
        const visibleHeight = this._getVisibleHeight();
        const visibleLines = lines.slice(this.viewOffsetY, this.viewOffsetY + visibleHeight);
        const { line: cursorLine, col: cursorCol } = this._getCursorLineCol();
        // Calculate selection range in terms of start/end positions
        const hasSelection = this.hasSelection();
        const selStart = hasSelection ? Math.min(this.selectionStart, this.selectionEnd) : -1;
        const selEnd = hasSelection ? Math.max(this.selectionStart, this.selectionEnd) : -1;
        let display = '';
        let charPos = 0; // Track position in full value string
        // Calculate starting position for visible area
        for (let i = 0; i < this.viewOffsetY && i < lines.length; i++) {
            charPos += lines[i].length + 1; // +1 for newline
        }
        const useTags = this.options.tags;
        for (let i = 0; i < visibleLines.length; i++) {
            const lineIndex = this.viewOffsetY + i;
            const lineText = visibleLines[i];
            let lineDisplay = '';
            for (let col = 0; col < lineText.length; col++) {
                const pos = charPos + col;
                const ch = lineText[col];
                const isSelected = hasSelection && pos >= selStart && pos < selEnd;
                const isCursor = this.focused && !hasSelection && lineIndex === cursorLine && col === cursorCol;
                // Only escape if tags NOT enabled
                const escapedCh = useTags ? ch : this._escapeForDisplay(ch);
                if (isSelected || isCursor) {
                    lineDisplay += `{inverse}${escapedCh}{/inverse}`;
                }
                else {
                    lineDisplay += escapedCh;
                }
            }
            // Show cursor at end of line if applicable
            if (this.focused && !hasSelection && lineIndex === cursorLine && cursorCol >= lineText.length) {
                lineDisplay += '{inverse} {/inverse}';
            }
            // If selection extends to end of line (before newline), show inverse on the space
            if (hasSelection && charPos + lineText.length >= selStart && charPos + lineText.length < selEnd) {
                // Selection continues to next line - no extra visual needed
            }
            display += lineDisplay;
            if (i < visibleLines.length - 1) {
                display += '\n';
            }
            charPos += lineText.length + 1; // +1 for newline
        }
        this.setContent(display);
        if (this.screen) {
            this.screen.render();
        }
    }
    insertChar(ch) {
        // If there's a selection, replace it
        if (this.hasSelection()) {
            this.replaceSelection(ch);
            return;
        }
        this.value = this.value.slice(0, this.cursorPos) + ch + this.value.slice(this.cursorPos);
        this.cursorPos += ch.length;
        this._updateContent();
        this.emit('change', this.value);
    }
    deleteChar() {
        // If there's a selection, delete it
        if (this.hasSelection()) {
            this.replaceSelection('');
            return;
        }
        if (this.cursorPos > 0) {
            this.value = this.value.slice(0, this.cursorPos - 1) + this.value.slice(this.cursorPos);
            this.cursorPos--;
            this._updateContent();
            this.emit('change', this.value);
        }
    }
    deleteCharForward() {
        // If there's a selection, delete it
        if (this.hasSelection()) {
            this.replaceSelection('');
            return;
        }
        if (this.cursorPos < this.value.length) {
            this.value = this.value.slice(0, this.cursorPos) + this.value.slice(this.cursorPos + 1);
            this._updateContent();
            this.emit('change', this.value);
        }
    }
    cursorLeft() {
        if (this.cursorPos > 0) {
            this.cursorPos--;
            this._updateContent();
        }
    }
    cursorRight() {
        if (this.cursorPos < this.value.length) {
            this.cursorPos++;
            this._updateContent();
        }
    }
    cursorUp() {
        const { line, col } = this._getCursorLineCol();
        if (line > 0) {
            const lines = this._getLines();
            const prevLineLength = lines[line - 1].length;
            const newCol = Math.min(col, prevLineLength);
            // Calculate new position: sum of all previous lines + newlines + newCol
            let newPos = 0;
            for (let i = 0; i < line - 1; i++) {
                newPos += lines[i].length + 1; // +1 for newline
            }
            newPos += newCol;
            this.cursorPos = newPos;
            this._updateContent();
        }
    }
    cursorDown() {
        const { line, col } = this._getCursorLineCol();
        const lines = this._getLines();
        if (line < lines.length - 1) {
            const nextLineLength = lines[line + 1].length;
            const newCol = Math.min(col, nextLineLength);
            // Calculate new position
            let newPos = 0;
            for (let i = 0; i <= line; i++) {
                newPos += lines[i].length + 1; // +1 for newline
            }
            newPos += newCol;
            this.cursorPos = newPos;
            this._updateContent();
        }
    }
    cursorHome() {
        const { line } = this._getCursorLineCol();
        const lines = this._getLines();
        let newPos = 0;
        for (let i = 0; i < line; i++) {
            newPos += lines[i].length + 1;
        }
        this.cursorPos = newPos;
        this._updateContent();
    }
    cursorEnd() {
        const { line } = this._getCursorLineCol();
        const lines = this._getLines();
        let newPos = 0;
        for (let i = 0; i <= line; i++) {
            newPos += lines[i].length;
            if (i < line)
                newPos++; // Add newline char
        }
        this.cursorPos = newPos;
        this._updateContent();
    }
    submit() {
        this.emit('submit', this.value);
    }
    cancel() {
        this.emit('cancel');
    }
    setValue(value) {
        this.value = value;
        this.cursorPos = value.length;
        this.viewOffsetY = 0;
        this._updateContent();
        this.emit('change', this.value);
    }
    getValue() {
        return this.value;
    }
    clearValue() {
        this.setValue('');
    }
    readInput() {
        this.emit('readInput');
    }
    /**
     * Check if there is an active text selection
     */
    hasSelection() {
        return this.selectionStart !== -1 &&
            this.selectionEnd !== -1 &&
            this.selectionStart !== this.selectionEnd;
    }
    /**
     * Get the current selection info
     */
    getSelection() {
        if (!this.hasSelection()) {
            return null;
        }
        const start = Math.min(this.selectionStart, this.selectionEnd);
        const end = Math.max(this.selectionStart, this.selectionEnd);
        return {
            start,
            end,
            text: this.value.slice(start, end)
        };
    }
    /**
     * Replace the current selection with new text
     */
    replaceSelection(text) {
        if (!this.hasSelection()) {
            return;
        }
        const start = Math.min(this.selectionStart, this.selectionEnd);
        const end = Math.max(this.selectionStart, this.selectionEnd);
        this.value = this.value.slice(0, start) + text + this.value.slice(end);
        this.cursorPos = start + text.length;
        this.clearSelection();
        this._updateContent();
        this.emit('change', this.value);
    }
    /**
     * Clear the current selection
     */
    clearSelection() {
        this.selectionStart = -1;
        this.selectionEnd = -1;
    }
    /**
     * Select all text
     */
    selectAll() {
        this.selectionStart = 0;
        this.selectionEnd = this.value.length;
        this.cursorPos = this.value.length;
        this._updateContent();
    }
}
