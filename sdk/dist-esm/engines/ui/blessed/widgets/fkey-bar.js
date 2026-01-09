/**
 * FKeyBar - Function key menu bar
 *
 * A horizontal bar with clickable menu items, typically at the top of the screen.
 * Features:
 * - Clickable items with hover states
 * - Automatic layout based on item widths
 * - Keyboard shortcut support (F1-F12, Ctrl+key)
 * - Customizable colors
 */
import { Box } from './box';
export class FKeyBar extends Box {
    constructor(options) {
        const fg = options.fg || 'yellow';
        const bg = options.bg || 'blue';
        super({
            ...options,
            top: options.top ?? 0,
            left: options.left ?? 0,
            width: options.width || '100%',
            height: options.barHeight || 1,
            style: {
                fg,
                bg,
                ...options.style,
            },
        });
        this._buttons = [];
        this._keyHandlers = new Map();
        this._items = options.items || [];
        this._spacing = options.spacing ?? 1;
        this._autoRegisterKeys = options.autoRegisterKeys ?? true;
        const hoverFg = options.hoverFg || 'white';
        const hoverBg = options.hoverBg || 'lightblue';
        this._createButtons(fg, bg, hoverFg, hoverBg);
    }
    _createButtons(fg, bg, hoverFg, hoverBg) {
        let leftPos = 1;
        for (const item of this._items) {
            const width = item.width || (item.label.length + 1);
            const btn = new Box({
                parent: this,
                top: 0,
                left: leftPos,
                width,
                height: 1,
                content: item.label,
                mouse: true,
                clickable: true,
                style: {
                    fg,
                    bg,
                    hover: {
                        fg: hoverFg,
                        bg: hoverBg,
                    },
                },
            });
            // Click handler
            btn.on('click', () => {
                if (item.handler) {
                    item.handler();
                }
                this.emit('select', item);
            });
            // Store item reference
            btn._fkeyItem = item;
            this._buttons.push(btn);
            leftPos += width + this._spacing;
            // Register keyboard shortcut if provided
            if (item.key && item.handler && this._autoRegisterKeys) {
                this._keyHandlers.set(item.key, item.handler);
            }
        }
        // Register all keyboard handlers on the screen when attached
        this.on('attach', () => {
            if (this.screen && this._autoRegisterKeys) {
                for (const [key, handler] of this._keyHandlers) {
                    this.screen.key([key], () => {
                        handler();
                    });
                }
            }
        });
    }
    /**
     * Set handler for a specific item
     */
    setHandler(idOrIndex, handler) {
        let item;
        if (typeof idOrIndex === 'number') {
            item = this._items[idOrIndex];
        }
        else {
            item = this._items.find(i => i.id === idOrIndex);
        }
        if (item) {
            item.handler = handler;
            if (item.key) {
                this._keyHandlers.set(item.key, handler);
            }
        }
    }
    /**
     * Update item label
     */
    setItemLabel(idOrIndex, label) {
        let index;
        if (typeof idOrIndex === 'number') {
            index = idOrIndex;
        }
        else {
            index = this._items.findIndex(i => i.id === idOrIndex);
        }
        if (index >= 0 && index < this._items.length) {
            this._items[index].label = label;
            this._buttons[index]?.setContent(label);
            this.screen?.render();
        }
    }
    /**
     * Show/hide specific item
     */
    setItemVisible(idOrIndex, visible) {
        let index;
        if (typeof idOrIndex === 'number') {
            index = idOrIndex;
        }
        else {
            index = this._items.findIndex(i => i.id === idOrIndex);
        }
        if (index >= 0 && index < this._buttons.length) {
            if (visible) {
                this._buttons[index].show();
            }
            else {
                this._buttons[index].hide();
            }
            this.screen?.render();
        }
    }
    /**
     * Get item by ID or index
     */
    getItem(idOrIndex) {
        if (typeof idOrIndex === 'number') {
            return this._items[idOrIndex];
        }
        return this._items.find(i => i.id === idOrIndex);
    }
    /**
     * Get all items
     */
    getItems() {
        return [...this._items];
    }
}
/**
 * Factory function
 */
export function fkeyBar(options) {
    return new FKeyBar(options);
}
