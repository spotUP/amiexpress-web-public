/**
 * List widget - Scrollable list with selection
 */
import { Element } from '../core/element';
import { parseTags, textWidth } from '../core/colors';
export class List extends Element {
    constructor(options = {}) {
        super({
            scrollable: true,
            focusable: true,
            clickable: true,
            keys: true,
            mouse: true,
            wrap: false, // List items should not wrap
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
        this.items = [];
        this.selected = 0;
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
            // Mouse wheel handlers - move selection up/down
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
        if (!this.wrapItemsEnabled) {
            const lines = this.items.map((item, i) => {
                const marker = i === this.selected ? '> ' : '  ';
                return marker + item;
            });
            this.setContent(lines.join('\n'));
            this.lineToItem = [];
            this.itemLineStart = [];
            this.itemLineCount = [];
            return;
        }
        const lines = [];
        this.lineToItem = [];
        this.itemLineStart = [];
        this.itemLineCount = [];
        const markerWidth = 2;
        const wrapWidth = Math.max(1, this.getItemWrapWidth() - markerWidth);
        this.items.forEach((item, index) => {
            const marker = index === this.selected ? '> ' : '  ';
            const parsed = this.options.tags ? parseTags(item) : item;
            const wrapped = this.wrapAnsiText(parsed, wrapWidth);
            const start = lines.length;
            if (wrapped.length === 0) {
                lines.push(marker);
                this.lineToItem.push(index);
            }
            else {
                lines.push(marker + wrapped[0]);
                this.lineToItem.push(index);
                for (let i = 1; i < wrapped.length; i += 1) {
                    lines.push('  ' + wrapped[i]);
                    this.lineToItem.push(index);
                }
            }
            const count = lines.length - start;
            this.itemLineStart[index] = start;
            this.itemLineCount[index] = count || 1;
        });
        this.setContent(lines.join('\n'));
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
        this.selected = Math.max(0, Math.min(index, this.items.length - 1));
        this._updateContent();
        // Scroll to keep selected item visible
        const pos = this._getCoords();
        if (pos) {
            const padding = this.options.padding || 0;
            const border = this.options.border ? 1 : 0;
            const padTop = typeof padding === 'number' ? padding : padding.top || 0;
            const height = pos.yl - pos.yi - border * 2 - padTop;
            const scroll = this.getScroll();
            if (this.wrapItemsEnabled) {
                const start = this.itemLineStart[this.selected] ?? this.selected;
                const count = this.itemLineCount[this.selected] ?? 1;
                const end = start + count - 1;
                if (start < scroll) {
                    this.setScroll(start);
                }
                else if (end >= scroll + height) {
                    this.setScroll(end - height + 1);
                }
            }
            else {
                if (this.selected < scroll) {
                    this.setScroll(this.selected);
                }
                else if (this.selected >= scroll + height) {
                    this.setScroll(this.selected - height + 1);
                }
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
    getItemWrapWidth() {
        const innerWidth = this.iwidth;
        if (innerWidth > 0)
            return innerWidth;
        if (typeof this.options.width === 'number') {
            const padding = this.options.padding || 0;
            const padLeft = typeof padding === 'number' ? padding : padding.left || 0;
            const padRight = typeof padding === 'number' ? padding : padding.right || 0;
            const border = this.options.border ? 2 : 0;
            return Math.max(1, this.options.width - border - padLeft - padRight);
        }
        return 1;
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
