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
import type { ElementOptions } from '../core/types';
import type { Screen } from '../core/screen';
import { trapModalInput } from '../utils/modal-helpers';

export interface CategoryItem {
  id: string;
  label: string;
  [key: string]: any;  // Allow additional properties
}

export interface CategoryPickerOptions extends ElementOptions {
  /** Dialog title */
  title?: string;
  /** Category names */
  categories: string[];
  /** Function to get items for a category */
  getItems: (category: string) => CategoryItem[];
  /** Function to render item label (default: item.label) */
  renderItem?: (item: CategoryItem) => string;
  /** Callback when item is selected */
  onSelect?: (item: CategoryItem, category: string) => void;
  /** Callback when picker is cancelled */
  onCancel?: () => void;
  /** Width of category panel (default: 14) */
  categoryWidth?: number;
  /** Debounce delay for category auto-update (default: 80ms) */
  debounceMs?: number;
  /** Style for category list */
  categoryStyle?: { fg?: string; bg?: string; selected?: { fg?: string; bg?: string } };
  /** Style for items list */
  itemStyle?: { fg?: string; bg?: string; selected?: { fg?: string; bg?: string } };
  /** Border color */
  borderColor?: string;
}

export class CategoryPicker extends Box {
  private _categoryList: List;
  private _itemList: List;
  private _closeButton: Button;
  private _categories: string[];
  private _currentCategory: string;
  private _getItems: (category: string) => CategoryItem[];
  private _renderItem: (item: CategoryItem) => string;
  private _onSelect?: (item: CategoryItem, category: string) => void;
  private _onCancel?: () => void;
  private _debounceMs: number;
  private _categoryDebounce: ReturnType<typeof setTimeout> | null = null;
  private _globalClickHandler: ((data: any) => void) | null = null;
  private _categoryWidth: number;
  private _trapCleanup?: () => void;

  constructor(options: CategoryPickerOptions) {
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
      } as any,
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
      // Disable the default scrollbar -- a CategoryPicker holds a small
      // fixed set of category names (4 in livechat's emoji picker) so the
      // list never needs to scroll, and the default scrollbar column +
      // the List's `wrapWidth = width - 2` marker reservation together
      // chewed two cells off the visible width. With a 14-wide box that
      // dropped usable item width to 9 and " Emotions" + ">>" (11) wrapped
      // to a second line.
      scrollbar: false as any,
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
      } as any,
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
      } as any,
    });

    this._setupEventHandlers();
    this._loadCategory(this._currentCategory);
  }

  private _setupEventHandlers(): void {
    // Immediate category update on navigation (no debounce for responsive UX)
    const updateCategoryImmediate = () => {
      const selectedIndex = (this._categoryList as any).selected;
      const newCat = this._categories[selectedIndex];

      if (newCat && newCat !== this._currentCategory) {
        this._currentCategory = newCat;
        this._loadCategory(this._currentCategory);
      }
    };

    // Auto-update immediately on navigation (arrow keys)
    this._categoryList.key(['up', 'down', 'k', 'j'], () => {
      // Use setImmediate to update after the list selection changes
      setImmediate(updateCategoryImmediate);
    });

    // Also update on select item event
    this._categoryList.on('select item', updateCategoryImmediate);

    // Enter on category moves focus to items
    this._categoryList.on('select', () => {
      if (this._categoryDebounce) {
        clearTimeout(this._categoryDebounce);
        this._categoryDebounce = null;
      }
      const selectedIndex = (this._categoryList as any).selected;
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
      } else {
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

  private _selectCurrentItem(): void {
    const selected = (this._itemList as any).selected;
    const items = this._getItems(this._currentCategory);

    if (selected !== undefined && items[selected]) {
      if (this._onSelect) {
        this._onSelect(items[selected], this._currentCategory);
      }
      this.emit('select', items[selected], this._currentCategory);
      this.hide();
    }
  }

  private _loadCategory(category: string): void {
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

  private _handleCancel(): void {
    if (this._onCancel) {
      this._onCancel();
    }
    this.emit('cancel');
    this.hide();
  }

  /**
   * Show the picker
   */
  display(position?: { x: number; y: number }): void {
    // Trap modal input to prevent keys from leaking to background elements
    if (!this._trapCleanup) {
      this._trapCleanup = trapModalInput(this);
    }

    if (position && this.screen) {
      const screenWidth = this.screen.width as number;
      const overlayWidth = this.width as number || 50;
      const overlayHeight = this.height as number || 14;

      let top: any = position.y - overlayHeight - 1;
      let left: any = position.x - 2;

      if (top < 0) top = position.y + 1;
      if (left + overlayWidth > screenWidth) left = screenWidth - overlayWidth;

      this.position.top = Math.max(0, top);
      this.position.left = Math.max(0, left);
    } else {
      this.position.top = 'center';
      this.position.left = 'center';
    }

    this.show();
    this.setFront();
    this._categoryList.focus();
    this._categoryList.select(0);
    this._loadCategory(this._categories[0]);

    // Global click handler to close when clicking outside.
    // Listen on `mousedown` -- screen.handleMouseEvent emits the action
    // names ('mousedown'/'mouseup'/'mousemove') and a generic 'mouse'
    // event but never a synthetic 'click', so listening on 'click' here
    // bound to a dead event and the picker would never close on outside
    // clicks. mousedown fires on every left-press regardless of which
    // widget is hit, which is exactly the lifecycle event we want.
    if (this.screen && this._globalClickHandler) {
      this.screen.removeListener('mousedown', this._globalClickHandler);
    }

    if (this.screen) {
      this._globalClickHandler = (data: any) => {
        if (!this.isVisible()) return;
        // Only close on left-button presses; right-clicks are reserved
        // for context menus (e.g. inputBox right-click to re-open the
        // format picker) and shouldn't dismiss the dialog.
        if (data?.button && data.button !== 'left') return;
        if (!this.hasMouseOver(data.x, data.y)) {
          this._handleCancel();
        }
      };
      this.screen.on('mousedown', this._globalClickHandler);
    }

    this.screen?.render();
  }

  /**
   * Hide the picker
   */
  hide(): void {
    if (this._categoryDebounce) {
      clearTimeout(this._categoryDebounce);
      this._categoryDebounce = null;
    }

    super.hide();

    if (this.screen && this._globalClickHandler) {
      this.screen.removeListener('mousedown', this._globalClickHandler);
      this._globalClickHandler = null;
    }

    // Cleanup trap handlers
    if (this._trapCleanup) {
      this._trapCleanup();
      this._trapCleanup = undefined;
    }

    this.screen?.render();
  }

  /**
   * Check if picker is visible
   */
  isVisible(): boolean {
    return !this.hidden;
  }

  /**
   * Set categories dynamically
   */
  setCategories(categories: string[]): void {
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
  getCurrentCategory(): string {
    return this._currentCategory;
  }

  /**
   * Set select callback
   */
  onSelect(callback: (item: CategoryItem, category: string) => void): void {
    this._onSelect = callback;
  }

  /**
   * Set cancel callback
   */
  onCancel(callback: () => void): void {
    this._onCancel = callback;
  }

  /**
   * Destroy the picker
   */
  destroy(): void {
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
export function categoryPicker(options: CategoryPickerOptions): CategoryPicker {
  return new CategoryPicker(options);
}
