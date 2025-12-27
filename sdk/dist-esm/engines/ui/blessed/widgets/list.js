/**
 * List widget - Scrollable list with selection
 */
import { Element } from '../core/element';
import { parseTags, textWidth } from '../core/colors';
export class List extends Element {
    constructor(options = {}) {
        // Build scrollbar config: merge user options with defaults
        let scrollbarConfig = undefined;
        if (options.scrollbar !== false) {
            const userScrollbar = typeof options.scrollbar === 'object' ? options.scrollbar : {};
            scrollbarConfig = {
                ch: userScrollbar.ch || '█',
                track: userScrollbar.track || { ch: '│' },
                style: userScrollbar.style || options.style,
                ...userScrollbar, // Spread user options to preserve any extra properties
            };
        }
        super({
            scrollable: true,
            focusable: true,
            clickable: true,
            keys: true,
            mouse: true,
            wrap: false, // List items should not wrap
            ...options,
            scrollbar: scrollbarConfig,
        });
        this.items = [];
        this.selected = 0;
        this.previousSelected = -1;
        this.interactive = true;
        this.wrapItemsEnabled = false;
        this.lineToItem = [];
        this.itemLineStart = [];
        this.itemLineCount = [];
        this.items = options.items || [];
        this.selected = options.selected || 0;
        this.interactive = options.interactive !== false;
        this.wrapItemsEnabled = options.wrapItems !== false;
        // Update content
        this._updateContent();
        this.on('attach', () => {
            if (this.wrapItemsEnabled) {
                this._updateContent();
            }
        });
        this.on('resize', () => {
            if (this.wrapItemsEnabled) {
                this._updateContent();
            }
        });
        // Key handlers
        if (options.keys !== false) {
            this.on('keypress', this._onKeypress.bind(this));
        }
        // Mouse click handler - select item by click position
        if (options.mouse !== false) {
            this.on('click', this._onClick.bind(this));
            // Mouse wheel handlers - move selection (view auto-scrolls to follow)
            this.on('wheelup', () => {
                this.up();
                this.screen?.render();
            });
            this.on('wheeldown', () => {
                this.down();
                this.screen?.render();
            });
        }
    }
    _onClick(event) {
        if (!this.interactive)
            return;
        // Calculate which item was clicked
        const pos = this._getCoords();
        if (!pos)
            return;
        const border = this.options.border ? 1 : 0;
        const padding = this.options.padding || 0;
        const padTop = typeof padding === 'number' ? padding : padding.top || 0;
        // Get click position relative to content area
        const relY = event.y - pos.yi - border - padTop;
        const scroll = this.getScroll();
        const lineIndex = relY + scroll;
        const itemIndex = this.wrapItemsEnabled
            ? this.lineToItem[lineIndex]
            : lineIndex;
        if (itemIndex !== undefined && itemIndex >= 0 && itemIndex < this.items.length) {
            this.select(itemIndex);
            this.emit('select', this.items[itemIndex], itemIndex);
            this.emit('action', this.items[itemIndex], itemIndex);
        }
    }
    _updateContent() {
        const lines = this._lines;
        // Fast path: if we already have lines and just need to update selection markers
        if (lines && lines.length === this.items.length &&
            this.previousSelected >= 0 && this.previousSelected < this.items.length &&
            !this.wrapItemsEnabled) {
            // Just update the two changed lines (old and new selection)
            const oldIdx = this.previousSelected;
            const newIdx = this.selected;
            if (oldIdx !== newIdx) {
                lines[oldIdx] = '  ' + this.items[oldIdx];
                lines[newIdx] = '> ' + this.items[newIdx];
            }
            return;
        }
        // Full rebuild needed
        const newLines = [];
        this.lineToItem = [];
        this.itemLineStart = [];
        this.itemLineCount = [];
        this.items.forEach((item, index) => {
            const marker = index === this.selected ? '> ' : '  ';
            const start = newLines.length;
            if (this.wrapItemsEnabled) {
                // Wrap long items to multiple lines
                const parsed = this.options.tags ? parseTags(item) : item;
                const wrapWidth = Math.max(1, this.getItemWrapWidth() - 2); // -2 for marker
                const wrapped = this.wrapAnsiText(parsed, wrapWidth);
                if (wrapped.length === 0) {
                    newLines.push(marker);
                    this.lineToItem.push(index);
                }
                else {
                    newLines.push(marker + wrapped[0]);
                    this.lineToItem.push(index);
                    for (let i = 1; i < wrapped.length; i++) {
                        newLines.push('  ' + wrapped[i]);
                        this.lineToItem.push(index);
                    }
                }
            }
            else {
                // Simple case: one line per item
                newLines.push(marker + item);
                this.lineToItem.push(index);
            }
            const count = newLines.length - start;
            this.itemLineStart[index] = start;
            this.itemLineCount[index] = count || 1;
        });
        // CRITICAL: Directly set _lines to ensure consistency with itemLineStart/itemLineCount
        // Don't use setContent() as parseContent() might re-wrap and change line count
        this._lines = newLines;
        this.content = newLines.join('\n');
        this._contentDirty = false;
    }
    _onKeypress(ch, key) {
        if (!this.interactive || !this.focused)
            return;
        const vi = this.options.vi;
        if (key.name === 'up' || (vi && key.name === 'k')) {
            this.up();
            this.screen?.render();
            return;
        }
        if (key.name === 'down' || (vi && key.name === 'j')) {
            this.down();
            this.screen?.render();
            return;
        }
        if (key.name === 'enter' || key.name === 'space') {
            this.emit('select', this.items[this.selected], this.selected);
            this.emit('action', this.items[this.selected], this.selected);
            return;
        }
        if (key.name === 'escape') {
            this.emit('cancel');
            return;
        }
    }
    setItems(items) {
        this.items = items;
        if (items.length === 0) {
            this.selected = 0;
        }
        else {
            this.selected = Math.min(this.selected, items.length - 1);
        }
        this._updateContent();
    }
    select(index) {
        this.previousSelected = this.selected;
        this.selected = Math.max(0, Math.min(index, this.items.length - 1));
        this._updateContent();
        // Scroll to keep selected item visible
        // Get visible height - try multiple approaches for robustness
        let visibleHeight = this.iheight;
        // Fallback to direct position calculation
        if (visibleHeight <= 0) {
            const pos = this._getCoords();
            if (pos) {
                const border = this.options.border ? 2 : 0;
                const padding = this.options.padding || 0;
                const padTop = typeof padding === 'number' ? padding : padding.top || 0;
                const padBottom = typeof padding === 'number' ? padding : padding.bottom || 0;
                visibleHeight = pos.yl - pos.yi - border - padTop - padBottom;
            }
        }
        // Final fallback
        if (visibleHeight <= 0) {
            visibleHeight = 10; // Reasonable default
        }
        // Get total content lines
        const totalLines = this._lines?.length || this.items.length;
        // Only scroll if content exceeds visible area
        if (totalLines > visibleHeight && this.items.length > 0) {
            const currentScroll = this.getScroll();
            // Get line position for selected item
            const lineStart = this.itemLineStart[this.selected] ?? this.selected;
            const lineCount = this.itemLineCount[this.selected] ?? 1;
            const lineEnd = lineStart + lineCount - 1;
            // Scroll up if selection is above visible area
            if (lineStart < currentScroll) {
                this.setScroll(lineStart);
            }
            // Scroll down if selection is below visible area
            else if (lineEnd >= currentScroll + visibleHeight) {
                this.setScroll(lineEnd - visibleHeight + 1);
            }
        }
        this.emit('select item', this.items[this.selected], this.selected);
    }
    up(amount = 1) {
        this.select(this.selected - amount);
    }
    down(amount = 1) {
        this.select(this.selected + amount);
    }
    getSelected() {
        return this.selected;
    }
    getSelectedItem() {
        return this.items[this.selected];
    }
    setWrapItems(enabled) {
        this.wrapItemsEnabled = enabled;
        this._updateContent();
    }
    clearItems() {
        this.items = [];
        this.selected = 0;
        this._updateContent();
    }
    addItem(item) {
        this.items.push(item);
        this._updateContent();
    }
    removeItem(index) {
        this.items.splice(index, 1);
        this.selected = Math.min(this.selected, this.items.length - 1);
        this._updateContent();
    }
    insertItem(index, item) {
        this.items.splice(index, 0, item);
        this._updateContent();
    }
    /**
     * Get item by index, string content, or element
     * EXACT from neo-blessed list.js lines 358-360
     */
    getItem(child) {
        const index = this.getItemIndex(child);
        return this.items[index];
    }
    /**
     * Set item content by index, string, or element
     * EXACT from neo-blessed list.js lines 362-368
     */
    setItem(child, content) {
        const index = this.getItemIndex(child);
        if (index === -1)
            return;
        this.items[index] = content;
        this._updateContent();
    }
    /**
     * Push item to end of list (returns new length)
     * EXACT from neo-blessed list.js lines 411-414
     */
    pushItem(content) {
        this.addItem(content);
        return this.items.length;
    }
    /**
     * Pop last item from list
     * EXACT from neo-blessed list.js lines 416-418
     */
    popItem() {
        const item = this.items[this.items.length - 1];
        this.removeItem(this.items.length - 1);
        return item;
    }
    /**
     * Add item to beginning of list (returns new length)
     * EXACT from neo-blessed list.js lines 420-423
     */
    unshiftItem(content) {
        this.insertItem(0, content);
        return this.items.length;
    }
    /**
     * Remove and return first item from list
     * EXACT from neo-blessed list.js lines 425-427
     */
    shiftItem() {
        const item = this.items[0];
        this.removeItem(0);
        return item;
    }
    /**
     * Splice items (remove and/or insert)
     * EXACT from neo-blessed list.js lines 429-442
     */
    spliceItem(child, n, ...items) {
        const index = this.getItemIndex(child);
        if (index === -1)
            return [];
        const removed = [];
        let removeCount = n;
        while (removeCount--) {
            const item = this.items[index];
            this.removeItem(index);
            removed.push(item);
        }
        let insertIndex = index;
        items.forEach((item) => {
            this.insertItem(insertIndex++, item);
        });
        return removed;
    }
    /**
     * Find item by search string or regex (with wrap-around)
     * EXACT from neo-blessed list.js lines 444-487
     */
    find(search, back = false) {
        return this.fuzzyFind(search, back);
    }
    /**
     * Fuzzy find item by search string or regex
     * EXACT from neo-blessed list.js lines 444-487
     */
    fuzzyFind(search, back = false) {
        const start = this.selected + (back ? -1 : 1);
        let searchStr = search;
        // Convert number to string
        if (typeof search === 'number') {
            searchStr = search + '';
        }
        // Convert /regex/ string to RegExp
        if (typeof searchStr === 'string' && searchStr[0] === '/' && searchStr[searchStr.length - 1] === '/') {
            try {
                search = new RegExp(searchStr.slice(1, -1));
            }
            catch (e) {
                // Invalid regex, keep as string
            }
        }
        // Create test function
        let test;
        if (typeof search === 'string') {
            test = (item) => item.indexOf(search) !== -1;
        }
        else if (search instanceof RegExp) {
            test = (item) => search.test(item);
        }
        else if (typeof search === 'function') {
            test = search;
        }
        else {
            return this.selected;
        }
        // Search forward or backward with wrap-around
        if (!back) {
            // Search from start to end
            for (let i = start; i < this.items.length; i++) {
                const item = this.items[i];
                // Strip tags if needed (simplified - full version would use helpers.cleanTags)
                const cleaned = item.replace(/{[^}]*}/g, '');
                if (test(cleaned))
                    return i;
            }
            // Wrap around to beginning
            for (let i = 0; i < start; i++) {
                const item = this.items[i];
                const cleaned = item.replace(/{[^}]*}/g, '');
                if (test(cleaned))
                    return i;
            }
        }
        else {
            // Search backward from start to 0
            for (let i = start; i >= 0; i--) {
                const item = this.items[i];
                const cleaned = item.replace(/{[^}]*}/g, '');
                if (test(cleaned))
                    return i;
            }
            // Wrap around to end
            for (let i = this.items.length - 1; i > start; i--) {
                const item = this.items[i];
                const cleaned = item.replace(/{[^}]*}/g, '');
                if (test(cleaned))
                    return i;
            }
        }
        return this.selected;
    }
    /**
     * Get item index from various inputs (number, string content, or element)
     * EXACT from neo-blessed list.js lines 489-504
     */
    getItemIndex(child) {
        if (typeof child === 'number') {
            return child;
        }
        else if (typeof child === 'string') {
            // First try exact match
            let index = this.items.indexOf(child);
            if (index !== -1)
                return index;
            // Then try match after stripping tags
            for (let i = 0; i < this.items.length; i++) {
                const cleaned = this.items[i].replace(/{[^}]*}/g, '');
                if (cleaned === child) {
                    return i;
                }
            }
            return -1;
        }
        else {
            // For element objects, would use this.items.indexOf(child)
            // But our implementation uses strings, so return -1
            return -1;
        }
    }
    /**
     * Move selection by offset
     * EXACT from neo-blessed list.js lines 540-542
     */
    move(offset) {
        this.select(this.selected + offset);
    }
    /**
     * Interactive picker - focus list, wait for selection
     * EXACT from neo-blessed list.js lines 552-585
     */
    pick(label, callback) {
        if (!callback) {
            callback = label;
            label = '';
        }
        if (!this.interactive) {
            return callback();
        }
        const self = this;
        const focused = this.screen.focused;
        if (focused && focused._done) {
            focused._done('stop');
        }
        // Save focus (requires screen.saveFocus - may not be implemented yet)
        if (this.screen && this.screen.saveFocus) {
            this.screen.saveFocus();
        }
        this.focus();
        this.show();
        this.select(0);
        if (label) {
            this.setLabel(label);
        }
        this.screen?.render();
        this.once('action', function (el, selected) {
            if (label) {
                self.removeLabel();
            }
            // Restore focus (requires screen.restoreFocus)
            if (self.screen && self.screen.restoreFocus) {
                self.screen.restoreFocus();
            }
            self.hide();
            self.screen?.render();
            if (el === null || el === undefined) {
                return callback();
            }
            const selectedItem = self.items[selected];
            const cleaned = selectedItem ? selectedItem.replace(/{[^}]*}/g, '') : '';
            return callback(undefined, cleaned);
        });
    }
    /**
     * Emit action and select events for current selection
     * EXACT from neo-blessed list.js lines 587-591
     */
    enterSelected(i) {
        if (i != null) {
            this.select(i);
        }
        this.emit('action', this.items[this.selected], this.selected);
        this.emit('select', this.items[this.selected], this.selected);
    }
    /**
     * Emit action and cancel events
     * EXACT from neo-blessed list.js lines 593-597
     */
    cancelSelected(i) {
        if (i != null) {
            this.select(i);
        }
        this.emit('action');
        this.emit('cancel');
    }
    getItemWrapWidth() {
        const innerWidth = this.iwidth;
        if (innerWidth > 0)
            return innerWidth;
        // Try to calculate from position if element is laid out
        const pos = this._getCoords();
        if (pos) {
            const border = this.options.border ? 2 : 0;
            const padding = this.options.padding || 0;
            const padLeft = typeof padding === 'number' ? padding : padding.left || 0;
            const padRight = typeof padding === 'number' ? padding : padding.right || 0;
            const scrollbar = this.hasScrollbar() ? 1 : 0;
            const width = pos.xl - pos.xi - border - padLeft - padRight - scrollbar;
            if (width > 0)
                return width;
        }
        if (typeof this.options.width === 'number') {
            const padding = this.options.padding || 0;
            const padLeft = typeof padding === 'number' ? padding : padding.left || 0;
            const padRight = typeof padding === 'number' ? padding : padding.right || 0;
            const border = this.options.border ? 2 : 0;
            const scrollbar = this.hasScrollbar() ? 1 : 0;
            return Math.max(1, this.options.width - border - padLeft - padRight - scrollbar);
        }
        // Return a reasonable default instead of 1 (which would break wrapping)
        return 80;
    }
    wrapAnsiText(text, width) {
        const lines = [];
        if (width <= 0)
            return lines;
        const textLines = text.split(/\r?\n/);
        for (const line of textLines) {
            if (textWidth(line) <= width) {
                lines.push(line);
                continue;
            }
            let currentLine = '';
            let currentWidth = 0;
            let inAnsi = false;
            let ansiBuffer = '';
            let activeAnsi = '';
            for (let i = 0; i < line.length; i += 1) {
                const ch = line[i];
                if (ch === '\x1b') {
                    inAnsi = true;
                    ansiBuffer = ch;
                    continue;
                }
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
                if (currentWidth >= width) {
                    lines.push(currentLine);
                    currentLine = activeAnsi + ch;
                    currentWidth = 1;
                }
                else {
                    currentLine += ch;
                    currentWidth += 1;
                }
            }
            if (currentLine) {
                lines.push(currentLine);
            }
        }
        return lines;
    }
}
