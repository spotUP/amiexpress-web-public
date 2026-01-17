"use strict";
/**
 * Textbox widget - Single-line text input with horizontal scrolling
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Textarea = exports.Input = exports.Textbox = void 0;
const element_1 = require("../core/element");
class Textbox extends element_1.Element {
    constructor(options = {}) {
        super({
            focusable: true,
            clickable: true,
            keys: true,
            ...options,
            tags: true, // Enable tag parsing for cursor display (forced, cannot be overridden)
        });
        this.value = '';
        this.cursorPos = 0;
        this.viewOffset = 0; // Horizontal scroll offset for long text
        this.secret = false;
        this.censor = false;
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
        // Click to focus
        this.on('click', () => {
            this.focus();
        });
    }
    _onKeypress(ch, key) {
        if (!this.focused)
            return;
        // Character input - only insert printable characters (ASCII 32-126)
        // This includes space (32) through tilde (126)
        if (ch && ch.length === 1 && !key.ctrl && !key.meta) {
            const charCode = ch.charCodeAt(0);
            if (charCode >= 32 && charCode < 127) {
                this.insertChar(ch);
                return;
            }
        }
        // Special keys
        switch (key.name) {
            case 'backspace':
                this.deleteChar();
                break;
            case 'delete':
                this.deleteCharForward();
                break;
            case 'left':
                this.cursorLeft();
                break;
            case 'right':
                this.cursorRight();
                break;
            case 'home':
                this.cursorHome();
                break;
            case 'end':
                this.cursorEnd();
                break;
            case 'enter':
                this.submit();
                break;
            case 'escape':
                this.cancel();
                break;
        }
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
        if (this.focused) {
            // Show cursor as inverse video at cursor position
            const cursorPosInView = this.cursorPos - this.viewOffset;
            const beforeCursor = visibleText.slice(0, cursorPosInView);
            const atCursor = visibleText[cursorPosInView] || ' '; // Space if at end
            const afterCursor = visibleText.slice(cursorPosInView + 1);
            display = `${beforeCursor}{inverse}${atCursor}{/inverse}${afterCursor}`;
        }
        else {
            display = visibleText;
        }
        this.setContent(display);
        // Re-render screen to show the updated content
        if (this.screen) {
            this.screen.render();
        }
    }
    insertChar(ch) {
        this.value = this.value.slice(0, this.cursorPos) + ch + this.value.slice(this.cursorPos);
        this.cursorPos++;
        this._updateContent();
        this.emit('change', this.value);
    }
    deleteChar() {
        if (this.cursorPos > 0) {
            this.value = this.value.slice(0, this.cursorPos - 1) + this.value.slice(this.cursorPos);
            this.cursorPos--;
            this._updateContent();
            this.emit('change', this.value);
        }
    }
    deleteCharForward() {
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
        this.setValue('');
    }
    readInput() {
        // This would be implemented by the door to handle async input
        this.emit('readInput');
    }
}
exports.Textbox = Textbox;
// Alias
class Input extends Textbox {
}
exports.Input = Input;
/**
 * Textarea - Multi-line text input with vertical scrolling
 */
class Textarea extends element_1.Element {
    constructor(options = {}) {
        super({
            focusable: true,
            clickable: true,
            keys: true,
            scrollable: true,
            alwaysScroll: true,
            ...options,
            // Add scrollbar by default (unless explicitly disabled)
            scrollbar: options.scrollbar === undefined || options.scrollbar ? {
                ch: '█',
                track: {
                    ch: '│',
                },
                style: (options.scrollbar && typeof options.scrollbar === 'object' ? options.scrollbar.style : undefined) || options.style,
            } : undefined,
        });
        this.value = '';
        this.cursorPos = 0; // Position in flat string
        this.viewOffsetY = 0; // Vertical scroll offset (line number)
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
        this.on('click', () => {
            this.focus();
        });
    }
    _onKeypress(ch, key) {
        if (!this.focused)
            return;
        // Character input - printable characters
        if (ch && ch.length === 1 && !key.ctrl && !key.meta) {
            const charCode = ch.charCodeAt(0);
            if (charCode >= 32 && charCode < 127) {
                this.insertChar(ch);
                return;
            }
        }
        switch (key.name) {
            case 'backspace':
                this.deleteChar();
                break;
            case 'delete':
                this.deleteCharForward();
                break;
            case 'left':
                this.cursorLeft();
                break;
            case 'right':
                this.cursorRight();
                break;
            case 'up':
                this.cursorUp();
                break;
            case 'down':
                this.cursorDown();
                break;
            case 'home':
                this.cursorHome();
                break;
            case 'end':
                this.cursorEnd();
                break;
            case 'enter':
                // Multi-line: Enter inserts newline
                this.insertChar('\n');
                break;
            case 'escape':
                this.cancel();
                break;
            case 'tab':
                // Shift+Tab submits, Tab inserts spaces
                if (key.shift) {
                    this.submit();
                }
                else {
                    this.insertChar('  '); // Insert 2 spaces
                }
                break;
        }
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
    _updateContent() {
        this._ensureCursorVisible();
        const lines = this._getLines();
        const visibleHeight = this._getVisibleHeight();
        const visibleLines = lines.slice(this.viewOffsetY, this.viewOffsetY + visibleHeight);
        const { line: cursorLine, col: cursorCol } = this._getCursorLineCol();
        let display = '';
        for (let i = 0; i < visibleLines.length; i++) {
            const lineIndex = this.viewOffsetY + i;
            let lineText = visibleLines[i];
            if (this.focused && lineIndex === cursorLine) {
                // Show cursor on this line
                const beforeCursor = lineText.slice(0, cursorCol);
                const atCursor = lineText[cursorCol] || ' ';
                const afterCursor = lineText.slice(cursorCol + 1);
                lineText = `${beforeCursor}{inverse}${atCursor}{/inverse}${afterCursor}`;
            }
            display += lineText;
            if (i < visibleLines.length - 1) {
                display += '\n';
            }
        }
        this.setContent(display);
        if (this.screen) {
            this.screen.render();
        }
    }
    insertChar(ch) {
        this.value = this.value.slice(0, this.cursorPos) + ch + this.value.slice(this.cursorPos);
        this.cursorPos += ch.length;
        this._updateContent();
        this.emit('change', this.value);
    }
    deleteChar() {
        if (this.cursorPos > 0) {
            this.value = this.value.slice(0, this.cursorPos - 1) + this.value.slice(this.cursorPos);
            this.cursorPos--;
            this._updateContent();
            this.emit('change', this.value);
        }
    }
    deleteCharForward() {
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
}
exports.Textarea = Textarea;
