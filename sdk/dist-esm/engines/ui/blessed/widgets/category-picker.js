/**
 * CategoryPicker - Generic two-panel picker with categories
 *
 * A reusable picker dialog with:
 * - Left panel: Category list
 * - Right panel: Items in selected category
 * - Tab navigation between panels
 * - Debounced category auto-update on navigation
 * - ESC/click-outside to close
 * - Close [X] button
 *
 * Used for: emoji pickers, format pickers, color pickers, etc.
 */
import { Box } from './box';
import { List } from './list';
import { Button } from './button';
export class CategoryPicker extends Box {
    constructor(options) {
        const categoryWidth = options.categoryWidth || 14;
        const borderColor = options.borderColor || 'cyan';
        super({
            ...options,
            top: options.top || 'center',
            left: options.left || 'center',
            width: options.width || 50,
            height: options.height || 14,
            label: options.title ? ` ${options.title} ` : options.label,
            border: options.border || { type: 'line', fg: borderColor },
            shadow: true,
            hidden: true,
            mouse: true,
            keys: true,
            clickable: true,
            trapFocus: true,
            zIndex: options.zIndex || 1000,
            style: {
                fg: 'white',
                bg: 'black',
                border: { fg: borderColor },
                ...options.style,
            },
        });
        this._categoryDebounce = null;
        this._globalClickHandler = null;
        this._categories = options.categories;
        this._currentCategory = options.categories[0] || '';
        this._getItems = options.getItems;
        this._renderItem = options.renderItem || ((item) => ` ${item.label}`);
        this._onSelect = options.onSelect;
        this._onCancel = options.onCancel;
        this._debounceMs = options.debounceMs ?? 80;
        this._categoryWidth = categoryWidth;
        // Close button [X]
        this._closeButton = new Button({
            parent: this,
            top: -1,
            right: 1,
            width: 3,
            height: 1,
            content: '[X]',
            mouse: true,
            clickable: true,
            style: {
                fg: 'red',
                bg: 'black',
                hover: { fg: 'white', bg: 'red' },
            },
        });
        this._closeButton.on('press', () => {
            this._handleCancel();
        });
        // Category list (left panel)
        const catStyle = options.categoryStyle || {};
        this._categoryList = new List({
            parent: this,
            top: 0,
            left: 0,
            width: categoryWidth,
            height: '100%-2',
            label: ' Category ',
            border: { type: 'line', fg: catStyle.selected?.bg || 'green' },
            mouse: true,
            clickable: true,
            interactive: true,
            vi: true,
            keys: true,
            tags: true,
            style: {
                fg: catStyle.fg || 'white',
                bg: catStyle.bg || 'black',
                selected: {
                    fg: catStyle.selected?.fg || 'black',
                    bg: catStyle.selected?.bg || 'green',
                },
                item: {
                    hover: {
                        fg: catStyle.selected?.fg || 'black',
                        bg: catStyle.selected?.bg || 'green',
                    },
                },
            },
            items: this._categories.map(c => ` ${c}`),
        });
        // Items list (right panel)
        const itemStyle = options.itemStyle || {};
        this._itemList = new List({
            parent: this,
            top: 0,
            left: categoryWidth,
            right: 0,
            height: '100%',
            label: ' Items ',
            border: { type: 'line', fg: itemStyle.selected?.bg || borderColor },
            mouse: true,
            clickable: true,
            interactive: true,
            vi: true,
            keys: true,
            tags: true,
            scrollbar: { ch: ' ', style: { bg: 'gray' } },
            style: {
                fg: itemStyle.fg || 'white',
                bg: itemStyle.bg || 'black',
                selected: {
                    fg: itemStyle.selected?.fg || 'black',
                    bg: itemStyle.selected?.bg || borderColor,
                },
                item: {
                    hover: {
                        fg: itemStyle.selected?.fg || 'black',
                        bg: itemStyle.selected?.bg || borderColor,
                    },
                },
            },
        });
        this._setupEventHandlers();
        this._loadCategory(this._currentCategory);
    }
    _setupEventHandlers() {
        // Debounced category update on navigation
        const updateCategoryDebounced = () => {
            if (this._categoryDebounce) {
                clearTimeout(this._categoryDebounce);
            }
            this._categoryDebounce = setTimeout(() => {
                const selectedIndex = this._categoryList.selected;
                const newCat = this._categories[selectedIndex];
                if (newCat && newCat !== this._currentCategory) {
                    this._currentCategory = newCat;
                    this._loadCategory(this._currentCategory);
                }
            }, this._debounceMs);
        };
        // Auto-update on navigation
        this._categoryList.on('move', updateCategoryDebounced);
        this._categoryList.on('select item', updateCategoryDebounced);
        // Enter on category moves focus to items
        this._categoryList.on('select', () => {
            if (this._categoryDebounce) {
                clearTimeout(this._categoryDebounce);
                this._categoryDebounce = null;
            }
            const selectedIndex = this._categoryList.selected;
            this._currentCategory = this._categories[selectedIndex] || this._categories[0];
            this._loadCategory(this._currentCategory);
            this._itemList.focus();
        });
        // Item selection
        this._itemList.on('select', () => {
            this._selectCurrentItem();
        });
        // Tab navigation
        const handleTab = () => {
            if (this._categoryList.focused) {
                this._itemList.focus();
            }
            else {
                this._categoryList.focus();
            }
            this.screen?.render();
        };
        this._categoryList.key(['tab'], handleTab);
        this._itemList.key(['tab'], handleTab);
        // ESC to close
        const handleEsc = () => {
            this._handleCancel();
        };
        this._categoryList.key(['escape'], handleEsc);
        this._itemList.key(['escape'], handleEsc);
        this.key(['escape'], handleEsc);
    }
    _selectCurrentItem() {
        const selected = this._itemList.selected;
        const items = this._getItems(this._currentCategory);
        if (selected !== undefined && items[selected]) {
            if (this._onSelect) {
                this._onSelect(items[selected], this._currentCategory);
            }
            this.emit('select', items[selected], this._currentCategory);
            this.hide();
        }
    }
    _loadCategory(category) {
        const items = this._getItems(category);
        this._itemList.setItems(items.map(this._renderItem));
        this._itemList.select(0);
        this._itemList.setLabel(` ${category} `);
        if (this.screen) {
            setImmediate(() => {
                this.screen?.render();
            });
        }
    }
    _handleCancel() {
        if (this._onCancel) {
            this._onCancel();
        }
        this.emit('cancel');
        this.hide();
    }
    /**
     * Show the picker
     */
    display(position) {
        if (position && this.screen) {
            const screenWidth = this.screen.width;
            const overlayWidth = this.width || 50;
            const overlayHeight = this.height || 14;
            let top = position.y - overlayHeight - 1;
            let left = position.x - 2;
            if (top < 0)
                top = position.y + 1;
            if (left + overlayWidth > screenWidth)
                left = screenWidth - overlayWidth;
            this.position.top = Math.max(0, top);
            this.position.left = Math.max(0, left);
        }
        else {
            this.position.top = 'center';
            this.position.left = 'center';
        }
        this.show();
        this.setFront();
        this._categoryList.focus();
        this._categoryList.select(0);
        this._loadCategory(this._categories[0]);
        // Global click handler to close when clicking outside
        if (this.screen && this._globalClickHandler) {
            this.screen.removeListener('click', this._globalClickHandler);
        }
        if (this.screen) {
            this._globalClickHandler = (data) => {
                if (this.isVisible() && !this.hasMouseOver(data.x, data.y)) {
                    this._handleCancel();
                }
            };
            this.screen.on('click', this._globalClickHandler);
        }
        this.screen?.render();
    }
    /**
     * Hide the picker
     */
    hide() {
        if (this._categoryDebounce) {
            clearTimeout(this._categoryDebounce);
            this._categoryDebounce = null;
        }
        super.hide();
        if (this.screen && this._globalClickHandler) {
            this.screen.removeListener('click', this._globalClickHandler);
            this._globalClickHandler = null;
        }
        this.screen?.render();
    }
    /**
     * Check if picker is visible
     */
    isVisible() {
        return !this.hidden;
    }
    /**
     * Set categories dynamically
     */
    setCategories(categories) {
        this._categories = categories;
        this._categoryList.setItems(categories.map(c => ` ${c}`));
        if (categories.length > 0) {
            this._currentCategory = categories[0];
            this._loadCategory(this._currentCategory);
        }
    }
    /**
     * Get current category
     */
    getCurrentCategory() {
        return this._currentCategory;
    }
    /**
     * Set select callback
     */
    onSelect(callback) {
        this._onSelect = callback;
    }
    /**
     * Set cancel callback
     */
    onCancel(callback) {
        this._onCancel = callback;
    }
    /**
     * Destroy the picker
     */
    destroy() {
        if (this._categoryDebounce) {
            clearTimeout(this._categoryDebounce);
        }
        if (this.screen && this._globalClickHandler) {
            this.screen.removeListener('click', this._globalClickHandler);
        }
        super.destroy();
    }
}
/**
 * Factory function
 */
export function categoryPicker(options) {
    return new CategoryPicker(options);
}
