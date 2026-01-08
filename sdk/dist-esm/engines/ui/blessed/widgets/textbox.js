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
        this.isKeyboardSelecting = false; // True while actively selecting with Shift+Arrow
        this.lastKeyTime = 0; // Track when last key was pressed
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
                    // Only clear selection if we're not in rapid key repeat during selection
                    // (terminal may drop shift modifier during fast repeats)
                    if (this._shouldClearSelection()) {
                        this.clearSelection();
                    }
                    this.cursorLeft();
                }
                return true;
            case 'right':
                if (key.shift) {
                    this._extendSelection(1);
                }
                else {
                    // Only clear selection if we're not in rapid key repeat during selection
                    if (this._shouldClearSelection()) {
                        this.clearSelection();
                    }
                    this.cursorRight();
                }
                return true;
            case 'home':
                if (key.shift) {
                    this._selectTo(0);
                }
                else {
                    this._endKeyboardSelection();
                    this.clearSelection();
                    this.cursorHome();
                }
                return true;
            case 'end':
                if (key.shift) {
                    this._selectTo(this._getRenderedLength(this.value));
                }
                else {
                    this._endKeyboardSelection();
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
     * Check if we should clear selection on arrow key without shift.
     * During rapid key repeat, terminal may drop shift modifier, so we
     * protect selection if keys are coming fast.
     */
    _shouldClearSelection() {
        const now = Date.now();
        const timeSinceLastKey = now - this.lastKeyTime;
        this.lastKeyTime = now;
        // If we're keyboard selecting and keys are coming fast (<150ms apart),
        // don't clear - it's likely a dropped shift modifier during key repeat
        if (this.isKeyboardSelecting && timeSinceLastKey < 150) {
            return false;
        }
        // Otherwise, clear selection and end keyboard selecting mode
        this._endKeyboardSelection();
        return true;
    }
    /**
     * End keyboard selection mode
     */
    _endKeyboardSelection() {
        this.isKeyboardSelecting = false;
    }
    /**
     * Extend selection by delta positions (-1 = left, 1 = right)
     */
    _extendSelection(delta) {
        // Mark that we're actively selecting with keyboard
        this.isKeyboardSelecting = true;
        this.lastKeyTime = Date.now();
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
        // Mark that we're actively selecting with keyboard
        this.isKeyboardSelecting = true;
        this.lastKeyTime = Date.now();
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
    /**
     * Strip blessed tags from text to get plain text
     */
    _stripTags(text) {
        return text.replace(/\{[^}]*\}/g, '');
    }
    /**
     * Convert custom ~effect~ tags to blessed tags for display
     * These are preview approximations - actual effects render on send
     */
    _convertEffectTags(text) {
        // Rainbow: cycle through colors for each character
        text = text.replace(/~rainbow~(.*?)~\/rainbow~/g, (_, content) => {
            const colors = ['red', 'yellow', 'green', 'cyan', 'blue', 'magenta'];
            let result = '';
            let colorIdx = 0;
            for (const char of content) {
                if (char === ' ') {
                    result += char;
                }
                else {
                    result += `{${colors[colorIdx % colors.length]}-fg}${char}{/}`;
                    colorIdx++;
                }
            }
            return result;
        });
        // Pulse: show in cyan (pulsing effect can't be static)
        text = text.replace(/~pulse~(.*?)~\/pulse~/g, '{cyan-fg}$1{/}');
        // Sparkle: show in yellow with asterisks hint
        text = text.replace(/~sparkle~(.*?)~\/sparkle~/g, '{yellow-fg}$1{/}');
        // Shake: show in red (shaking can't be shown statically)
        text = text.replace(/~shake~(.*?)~\/shake~/g, '{red-fg}$1{/}');
        // Wave: show in blue
        text = text.replace(/~wave~(.*?)~\/wave~/g, '{blue-fg}$1{/}');
        // Gradient: extract colors and show first color
        text = text.replace(/~gradient\s+from=(\w+)\s+to=(\w+)~(.*?)~\/gradient~/g, (_, fromColor, _toColor, content) => `{${fromColor}-fg}${content}{/}`);
        return text;
    }
    /**
     * Strip custom effect tags, keeping only the content
     */
    _stripEffectTags(text) {
        // Remove ~effect~ and ~/effect~ markers but keep content
        return text
            .replace(/~rainbow~/g, '')
            .replace(/~\/rainbow~/g, '')
            .replace(/~pulse~/g, '')
            .replace(/~\/pulse~/g, '')
            .replace(/~sparkle~/g, '')
            .replace(/~\/sparkle~/g, '')
            .replace(/~shake~/g, '')
            .replace(/~\/shake~/g, '')
            .replace(/~wave~/g, '')
            .replace(/~\/wave~/g, '')
            .replace(/~gradient\s+from=\w+\s+to=\w+~/g, '')
            .replace(/~\/gradient~/g, '');
    }
    /**
     * Get the rendered length of text (excluding tag characters)
     */
    _getRenderedLength(text) {
        // Strip both blessed tags and effect tags to get visible length
        return this._stripTags(this._stripEffectTags(text)).length;
    }
    /**
     * Check if position is at start of an effect tag, return end position or -1
     */
    _skipEffectTag(text, pos) {
        if (text[pos] !== '~')
            return -1;
        // Check for opening tags: ~rainbow~, ~pulse~, etc.
        const openingTags = ['~rainbow~', '~pulse~', '~sparkle~', '~shake~', '~wave~'];
        for (const tag of openingTags) {
            if (text.slice(pos, pos + tag.length) === tag) {
                return pos + tag.length;
            }
        }
        // Check for closing tags: ~/rainbow~, ~/pulse~, etc.
        const closingTags = ['~/rainbow~', '~/pulse~', '~/sparkle~', '~/shake~', '~/wave~', '~/gradient~'];
        for (const tag of closingTags) {
            if (text.slice(pos, pos + tag.length) === tag) {
                return pos + tag.length;
            }
        }
        // Check for gradient opening: ~gradient from=X to=Y~
        const gradientMatch = text.slice(pos).match(/^~gradient\s+from=\w+\s+to=\w+~/);
        if (gradientMatch) {
            return pos + gradientMatch[0].length;
        }
        return -1;
    }
    /**
     * Convert a rendered position to raw position in tagged text
     */
    _renderedToRawPos(text, renderedPos) {
        let rawPos = 0;
        let rendered = 0;
        while (rawPos < text.length && rendered < renderedPos) {
            // Skip blessed tags {tag}
            if (text[rawPos] === '{') {
                const endBrace = text.indexOf('}', rawPos);
                if (endBrace !== -1) {
                    rawPos = endBrace + 1;
                    continue;
                }
            }
            // Skip effect tags ~tag~
            const effectEnd = this._skipEffectTag(text, rawPos);
            if (effectEnd !== -1) {
                rawPos = effectEnd;
                continue;
            }
            rawPos++;
            rendered++;
        }
        // Skip any tags at current position
        while (rawPos < text.length) {
            if (text[rawPos] === '{') {
                const endBrace = text.indexOf('}', rawPos);
                if (endBrace !== -1) {
                    rawPos = endBrace + 1;
                    continue;
                }
            }
            const effectEnd = this._skipEffectTag(text, rawPos);
            if (effectEnd !== -1) {
                rawPos = effectEnd;
                continue;
            }
            break;
        }
        return rawPos;
    }
    /**
     * Convert a raw position to rendered position
     */
    _rawToRenderedPos(text, rawPos) {
        let rendered = 0;
        let pos = 0;
        while (pos < rawPos && pos < text.length) {
            // Skip blessed tags
            if (text[pos] === '{') {
                const endBrace = text.indexOf('}', pos);
                if (endBrace !== -1 && endBrace < rawPos) {
                    pos = endBrace + 1;
                    continue;
                }
                else if (endBrace !== -1) {
                    break;
                }
            }
            // Skip effect tags
            const effectEnd = this._skipEffectTag(text, pos);
            if (effectEnd !== -1 && effectEnd <= rawPos) {
                pos = effectEnd;
                continue;
            }
            else if (effectEnd !== -1) {
                break;
            }
            pos++;
            rendered++;
        }
        return rendered;
    }
    /**
     * Get all unclosed blessed tags up to a position (for display)
     * Works on converted text (after _convertEffectTags)
     */
    _getOpenTagsAt(text, rawPos) {
        const tagStack = [];
        for (let i = 0; i < rawPos && i < text.length; i++) {
            if (text[i] === '{') {
                const endBrace = text.indexOf('}', i);
                if (endBrace !== -1) {
                    const tag = text.slice(i, endBrace + 1);
                    if (tag.startsWith('{/')) {
                        tagStack.pop();
                    }
                    else if (!tag.endsWith('/}')) {
                        tagStack.push(tag);
                    }
                    i = endBrace;
                }
            }
        }
        return tagStack;
    }
    _updateContent() {
        const useTags = this.options.tags;
        // For tag-aware rendering, we work in "rendered" positions (what user sees)
        // The raw value contains tags like {red-fg}text{/} or ~effect~, but cursor moves through visible chars
        // Rendered length is calculated from raw value (stripping all tag types)
        const renderedLength = useTags ? this._getRenderedLength(this.value) : this.value.length;
        // Convert custom ~effect~ tags to blessed tags for display preview
        const text = useTags ? this._convertEffectTags(this.value) : this.value;
        // Clamp cursor to rendered length
        if (useTags && this.cursorPos > renderedLength) {
            this.cursorPos = renderedLength;
        }
        // For secret/censor mode, use plain text handling
        if (this.secret || this.censor) {
            const masked = '*'.repeat(renderedLength);
            const visibleWidth = this._getVisibleWidth();
            this._ensureCursorVisible();
            const visibleText = masked.slice(this.viewOffset, this.viewOffset + visibleWidth);
            if (this.focused) {
                const cursorPosInView = this.cursorPos - this.viewOffset;
                const beforeCursor = visibleText.slice(0, cursorPosInView);
                const atCursor = visibleText[cursorPosInView] || ' ';
                const afterCursor = visibleText.slice(cursorPosInView + 1);
                this.setContent(`${beforeCursor}{inverse}${atCursor}{/inverse}${afterCursor}`);
            }
            else {
                this.setContent(visibleText);
            }
            if (this.screen)
                this.screen.render();
            return;
        }
        // For non-tagged text, use simple rendering
        if (!useTags || !text.includes('{')) {
            this._ensureCursorVisible();
            const visibleWidth = this._getVisibleWidth();
            const visibleText = text.slice(this.viewOffset, this.viewOffset + visibleWidth);
            let display;
            if (this.focused) {
                if (this.hasSelection()) {
                    const selStart = Math.min(this.selectionStart, this.selectionEnd);
                    const selEnd = Math.max(this.selectionStart, this.selectionEnd);
                    const visStart = Math.max(0, selStart - this.viewOffset);
                    const visEnd = Math.min(visibleText.length, selEnd - this.viewOffset);
                    if (visEnd > visStart && visStart < visibleText.length) {
                        const before = this._escapeForDisplay(visibleText.slice(0, visStart));
                        const selected = this._escapeForDisplay(visibleText.slice(visStart, visEnd));
                        const after = this._escapeForDisplay(visibleText.slice(visEnd));
                        display = `${before}{inverse}${selected}{/inverse}${after}`;
                    }
                    else {
                        const cursorPosInView = this.cursorPos - this.viewOffset;
                        const beforeCursor = this._escapeForDisplay(visibleText.slice(0, cursorPosInView));
                        const atCursor = this._escapeForDisplay(visibleText[cursorPosInView] || ' ');
                        const afterCursor = this._escapeForDisplay(visibleText.slice(cursorPosInView + 1));
                        display = `${beforeCursor}{inverse}${atCursor}{/inverse}${afterCursor}`;
                    }
                }
                else {
                    const cursorPosInView = this.cursorPos - this.viewOffset;
                    const beforeCursor = this._escapeForDisplay(visibleText.slice(0, cursorPosInView));
                    const atCursor = this._escapeForDisplay(visibleText[cursorPosInView] || ' ');
                    const afterCursor = this._escapeForDisplay(visibleText.slice(cursorPosInView + 1));
                    display = `${beforeCursor}{inverse}${atCursor}{/inverse}${afterCursor}`;
                }
            }
            else {
                display = this._escapeForDisplay(visibleText);
            }
            this.setContent(display);
            if (this.screen)
                this.screen.render();
            return;
        }
        // Tag-aware rendering - cursor positions are in rendered space
        // For simplicity, we don't slice tagged content (to avoid breaking tags)
        // Instead we show the full content and let blessed handle it
        let display;
        if (this.focused) {
            if (this.hasSelection()) {
                // Selection in rendered positions
                const selStart = Math.min(this.selectionStart, this.selectionEnd);
                const selEnd = Math.max(this.selectionStart, this.selectionEnd);
                // Convert to raw positions
                const rawSelStart = this._renderedToRawPos(text, selStart);
                const rawSelEnd = this._renderedToRawPos(text, selEnd);
                // Get open tags at selection start to re-apply them inside selection
                const openTags = this._getOpenTagsAt(text, rawSelStart);
                const before = text.slice(0, rawSelStart);
                const selected = text.slice(rawSelStart, rawSelEnd);
                const after = text.slice(rawSelEnd);
                // Close open tags, add inverse, re-open them inside, then close at end
                const closeTags = openTags.map(() => '{/}').join('');
                const reopenTags = openTags.join('');
                display = `${before}${closeTags}{inverse}${reopenTags}${selected}{/}${closeTags}{/inverse}${reopenTags}${after}`;
            }
            else {
                // Cursor position in rendered space
                const rawCursorPos = this._renderedToRawPos(text, this.cursorPos);
                // Get open tags at cursor
                const openTags = this._getOpenTagsAt(text, rawCursorPos);
                const closeTags = openTags.map(() => '{/}').join('');
                const reopenTags = openTags.join('');
                const before = text.slice(0, rawCursorPos);
                // Get character at cursor (need to find next non-tag char)
                let atCursor = ' ';
                let afterStart = rawCursorPos;
                if (rawCursorPos < text.length) {
                    // Skip any tags to find actual character
                    let pos = rawCursorPos;
                    while (pos < text.length && text[pos] === '{') {
                        const endBrace = text.indexOf('}', pos);
                        if (endBrace !== -1) {
                            pos = endBrace + 1;
                        }
                        else {
                            break;
                        }
                    }
                    if (pos < text.length) {
                        atCursor = text[pos];
                        afterStart = pos + 1;
                    }
                    else {
                        afterStart = text.length;
                    }
                }
                const after = text.slice(afterStart);
                display = `${before}${closeTags}{inverse}${reopenTags}${atCursor}{/}${closeTags}{/inverse}${reopenTags}${after}`;
            }
        }
        else {
            display = text;
        }
        this.setContent(display);
        if (this.screen)
            this.screen.render();
    }
    insertChar(ch) {
        // If there's a selection, replace it
        if (this.hasSelection()) {
            this.replaceSelection(ch);
            return;
        }
        // Convert rendered cursor position to raw position in value
        const rawPos = this._renderedToRawPos(this.value, this.cursorPos);
        this.value = this.value.slice(0, rawPos) + ch + this.value.slice(rawPos);
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
            // Convert rendered positions to raw positions
            const rawPosBefore = this._renderedToRawPos(this.value, this.cursorPos - 1);
            const rawPosAfter = this._renderedToRawPos(this.value, this.cursorPos);
            this.value = this.value.slice(0, rawPosBefore) + this.value.slice(rawPosAfter);
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
        const renderedLength = this._getRenderedLength(this.value);
        if (this.cursorPos < renderedLength) {
            // Convert rendered positions to raw positions
            const rawPos = this._renderedToRawPos(this.value, this.cursorPos);
            const rawPosNext = this._renderedToRawPos(this.value, this.cursorPos + 1);
            this.value = this.value.slice(0, rawPos) + this.value.slice(rawPosNext);
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
        // Convert rendered positions to raw positions for extracting text
        const rawStart = this._renderedToRawPos(this.value, start);
        const rawEnd = this._renderedToRawPos(this.value, end);
        return {
            start,
            end,
            text: this.value.slice(rawStart, rawEnd),
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
        // Convert rendered positions to raw positions
        const rawStart = this._renderedToRawPos(this.value, start);
        const rawEnd = this._renderedToRawPos(this.value, end);
        this.value = this.value.slice(0, rawStart) + text + this.value.slice(rawEnd);
        // Calculate new cursor position - depends on whether replacement contains tags
        this.cursorPos = start + this._getRenderedLength(text);
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
        this.isKeyboardSelecting = false;
    }
    /**
     * Select all text
     */
    selectAll() {
        const renderedLength = this._getRenderedLength(this.value);
        this.selectionStart = 0;
        this.selectionEnd = renderedLength;
        this.cursorPos = renderedLength;
        this.isKeyboardSelecting = false; // Ctrl+A is a complete action
        this._updateContent();
    }
    cursorLeft() {
        if (this.cursorPos > 0) {
            this.cursorPos--;
            this._updateContent();
        }
    }
    cursorRight() {
        const renderedLength = this._getRenderedLength(this.value);
        if (this.cursorPos < renderedLength) {
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
        this.cursorPos = this._getRenderedLength(this.value);
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
        this.cursorPos = this._getRenderedLength(value);
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
                    this._selectTo(this._getRenderedLength(this.value));
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
    /**
     * Get the rendered length of text (Textarea doesn't support tags, so just return length)
     */
    _getRenderedLength(_text) {
        return _text.length;
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
