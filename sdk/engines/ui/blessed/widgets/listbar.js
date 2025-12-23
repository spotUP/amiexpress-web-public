"use strict";
/**
 * Listbar - Horizontal menu bar widget
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Listbar = void 0;
const box_1 = require("./box");
const button_1 = require("./button");
class Listbar extends box_1.Box {
    constructor(options = {}) {
        const style = options.style || {};
        const itemStyle = style.item || {};
        const selectedStyle = style.selected || {};
        const baseFg = itemStyle.fg ?? style.fg ?? 'gray';
        const baseBg = itemStyle.bg ?? style.bg ?? 'blue';
        const inactiveStyle = {
            fg: baseFg,
            bg: baseBg,
            ...itemStyle,
        };
        const activeStyle = {
            fg: selectedStyle.fg ?? 'white',
            bg: selectedStyle.bg ?? 'blue',
            ...selectedStyle,
        };
        super({
            ...options,
            height: options.height || 1,
            clickable: true,
            focusable: true,
            style: {
                fg: baseFg,
                bg: baseBg,
                ...style,
            },
        });
        this.items = new Map();
        this.selectedIndex = 0;
        this.itemKeys = [];
        this.inactiveStyle = inactiveStyle;
        this.activeStyle = activeStyle;
        this.itemPadding = Math.max(0, options.itemPadding ?? 1);
        this.itemGap = Math.max(0, options.itemGap ?? 2);
        this.enableMouse();
        this.enableKeys();
        // Add items - support both 'items' and 'commands' (blessed-contrib compatibility)
        if (options.items) {
            this.setItems(options.items);
        }
        else if (options.commands) {
            // Convert commands format to items format
            const items = {};
            for (const [key, cmd] of Object.entries(options.commands)) {
                items[key] = {
                    text: key,
                    callback: cmd.callback,
                };
            }
            this.setItems(items);
        }
        // Setup navigation keys
        this.key(['left', 'h'], () => {
            this.selectPrevious();
        });
        this.key(['right', 'l'], () => {
            this.selectNext();
        });
        this.key(['enter', 'space'], () => {
            this.selectCurrent();
        });
    }
    /**
     * Set listbar items
     */
    setItems(items) {
        // Clear existing items
        this.clearItems();
        let offset = 0;
        this.itemKeys = Object.keys(items);
        for (const [key, item] of Object.entries(items)) {
            const text = item.text || key;
            const pad = this.itemPadding;
            const buttonText = pad > 0 ? `${' '.repeat(pad)}${text}${' '.repeat(pad)}` : text;
            const button = new button_1.Button({
                parent: this,
                top: 0,
                left: offset,
                width: buttonText.length,
                height: 1,
                content: buttonText,
                padding: 0,
                align: 'center',
                border: undefined, // No border for tab buttons
                style: {
                    fg: this.inactiveStyle.fg,
                    bg: this.inactiveStyle.bg,
                    focus: this.activeStyle,
                    hover: this.activeStyle,
                },
            });
            button.on('press', () => {
                if (item.callback) {
                    item.callback();
                }
                this.emit('action', key, item);
            });
            // Register item keys
            if (item.keys) {
                for (const k of item.keys) {
                    this.key([k], () => {
                        if (item.callback) {
                            item.callback();
                        }
                        this.emit('action', key, item);
                    });
                }
            }
            this.items.set(key, { button, item });
            offset += buttonText.length + this.itemGap;
        }
        // Focus first item
        if (this.itemKeys.length > 0) {
            this.selectItem(0);
        }
    }
    /**
     * Clear all items
     */
    clearItems() {
        for (const [, { button }] of this.items) {
            button.destroy();
        }
        this.items.clear();
        this.itemKeys = [];
        this.selectedIndex = 0;
    }
    /**
     * Select item by index
     */
    selectItem(index) {
        if (index < 0 || index >= this.itemKeys.length)
            return;
        this.selectedIndex = index;
        const key = this.itemKeys[index];
        const item = this.items.get(key);
        if (item) {
            this.applySelectionStyles();
            item.button.focus();
            this.emit('select', key, item.item);
        }
    }
    /**
     * Select previous item
     */
    selectPrevious() {
        const newIndex = (this.selectedIndex - 1 + this.itemKeys.length) % this.itemKeys.length;
        this.selectItem(newIndex);
    }
    /**
     * Select next item
     */
    selectNext() {
        const newIndex = (this.selectedIndex + 1) % this.itemKeys.length;
        this.selectItem(newIndex);
    }
    /**
     * Select current item (trigger action)
     */
    selectCurrent() {
        const key = this.itemKeys[this.selectedIndex];
        const item = this.items.get(key);
        if (item && item.item.callback) {
            item.item.callback();
            this.emit('action', key, item.item);
        }
    }
    /**
     * Add a single item
     */
    addItem(key, item) {
        const currentItems = {};
        for (const [k, { item: i }] of this.items) {
            currentItems[k] = i;
        }
        currentItems[key] = item;
        this.setItems(currentItems);
    }
    /**
     * Remove an item
     */
    removeItem(key) {
        const item = this.items.get(key);
        if (item) {
            item.button.destroy();
            this.items.delete(key);
            // Rebuild listbar
            const currentItems = {};
            for (const [k, { item: i }] of this.items) {
                currentItems[k] = i;
            }
            this.setItems(currentItems);
        }
    }
    /**
     * Get item by key
     */
    getItem(key) {
        return this.items.get(key)?.item;
    }
    /**
     * Get all item keys
     */
    getItemKeys() {
        return [...this.itemKeys];
    }
    applySelectionStyles() {
        this.itemKeys.forEach((key, index) => {
            const entry = this.items.get(key);
            if (!entry)
                return;
            const style = index === this.selectedIndex ? this.activeStyle : this.inactiveStyle;
            entry.button.setStyle(style);
        });
    }
}
exports.Listbar = Listbar;
