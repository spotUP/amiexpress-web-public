/**
 * Listbar - Horizontal menu bar widget
 *
 * Responsive features:
 * - Vertical layout on mobile (stacked items)
 * - Swipe navigation on mobile
 * - Touch-friendly item heights
 */

import { Box } from './box';
import { Button } from './button';
import type { Colors, ElementOptions, KeyEvent } from '../core/types';
import type { ResponsiveState } from '../core/responsive-mixin';
import type { BreakpointName } from '../core/responsive-constants';
import { MIN_TOUCH_HEIGHT } from '../core/responsive-constants';

export interface ListbarOptions extends ElementOptions {
  style?: ElementOptions['style'] & {
    item?: Colors;
    selected?: Colors;
  };
  items?: Record<string, ListbarItem>;
  commands?: Record<string, ListbarItem | { callback?: () => void }>;
  autoCommandKeys?: boolean;
  itemPadding?: number;
  itemGap?: number;
  /** Enable vertical layout on mobile (default: true) */
  mobileVertical?: boolean;
  /** Mobile item height (default: MIN_TOUCH_HEIGHT) */
  mobileItemHeight?: number;
}

export interface ListbarItem {
  text?: string;
  keys?: string[];
  callback?: () => void;
}

export class Listbar extends Box {
  /** blessed-style widget kind; see Element.type. */
  get type(): string { return 'listbar'; }

  private items: Map<string, { button: Button; item: ListbarItem }> = new Map();
  private selectedIndex: number = 0;
  private itemKeys: string[] = [];
  private inactiveStyle: Colors;
  private activeStyle: Colors;

  private itemPadding: number;
  private itemGap: number;

  // Responsive tracking
  private _isMobileMode: boolean = false;
  private _mobileVertical: boolean;
  private _mobileItemHeight: number;
  private _desktopHeight: number | string | undefined;
  private _cachedItems: Record<string, ListbarItem> = {};

  constructor(options: ListbarOptions = {}) {
    const style = options.style || {};
    const itemStyle = style.item || {};
    const selectedStyle = style.selected || {};
    const baseFg = itemStyle.fg ?? style.fg ?? 'gray';
    const baseBg = itemStyle.bg ?? style.bg ?? 'blue';

    const inactiveStyle: Colors = {
      fg: baseFg,
      bg: baseBg,
      ...itemStyle,
    };

    const activeStyle: Colors = {
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

    this.inactiveStyle = inactiveStyle;
    this.activeStyle = activeStyle;
    this.itemPadding = Math.max(0, options.itemPadding ?? 1);
    this.itemGap = Math.max(0, options.itemGap ?? 2);

    // Responsive options
    this._mobileVertical = options.mobileVertical !== false;
    this._mobileItemHeight = options.mobileItemHeight ?? MIN_TOUCH_HEIGHT;
    this._desktopHeight = options.height || 1;

    this.enableMouse();
    this.enableKeys();

    // Add items - support both 'items' and 'commands' (blessed-contrib compatibility)
    if (options.items) {
      this.setItems(options.items);
    } else if (options.commands) {
      // Convert commands format to items format
      const items: Record<string, ListbarItem> = {};
      for (const [key, cmd] of Object.entries(options.commands)) {
        items[key] = {
          text: key,
          callback: cmd.callback,
        };
      }
      this.setItems(items);
    }

    // Setup navigation keys
    this.on('keypress', this._onKeypress.bind(this));
  }

  private _onKeypress(ch: any, key: KeyEvent): boolean {
    if (!this.focused) return false;

    if (key.name === 'left' || key.name === 'h') {
      this.selectPrevious();
      this.screen?.render();
      return true;
    }

    if (key.name === 'right' || key.name === 'l') {
      this.selectNext();
      this.screen?.render();
      return true;
    }

    if (key.name === 'enter' || key.name === 'space') {
      this.selectCurrent();
      this.screen?.render();
      return true;
    }

    return false;
  }

  /**
   * Set listbar items
   */
  setItems(items: Record<string, ListbarItem>): void {
    // Clear existing items
    this.clearItems();

    let offset = 0;
    this.itemKeys = Object.keys(items);

    for (const [key, item] of Object.entries(items)) {
      const text = item.text || key;
      const pad = this.itemPadding;
      const buttonText = pad > 0 ? `${' '.repeat(pad)}${text}${' '.repeat(pad)}` : text;

      const button = new Button({
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
  private clearItems(): void {
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
  selectItem(index: number): void {
    if (index < 0 || index >= this.itemKeys.length) return;

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
  selectPrevious(): void {
    const newIndex = (this.selectedIndex - 1 + this.itemKeys.length) % this.itemKeys.length;
    this.selectItem(newIndex);
  }

  /**
   * Select next item
   */
  selectNext(): void {
    const newIndex = (this.selectedIndex + 1) % this.itemKeys.length;
    this.selectItem(newIndex);
  }

  /**
   * Select current item (trigger action)
   */
  selectCurrent(): void {
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
  addItem(key: string, item: ListbarItem): void {
    const currentItems: Record<string, ListbarItem> = {};
    for (const [k, { item: i }] of this.items) {
      currentItems[k] = i;
    }
    currentItems[key] = item;
    this.setItems(currentItems);
  }

  /**
   * Remove an item
   */
  removeItem(key: string): void {
    const item = this.items.get(key);
    if (item) {
      item.button.destroy();
      this.items.delete(key);

      // Rebuild listbar
      const currentItems: Record<string, ListbarItem> = {};
      for (const [k, { item: i }] of this.items) {
        currentItems[k] = i;
      }
      this.setItems(currentItems);
    }
  }

  /**
   * Get item by key
   */
  getItem(key: string): ListbarItem | undefined {
    return this.items.get(key)?.item;
  }

  /**
   * Get all item keys
   */
  getItemKeys(): string[] {
    return [...this.itemKeys];
  }

  private applySelectionStyles(): void {
    this.itemKeys.forEach((key, index) => {
      const entry = this.items.get(key);
      if (!entry) return;
      const style = index === this.selectedIndex ? this.activeStyle : this.inactiveStyle;
      entry.button.setStyle(style);
    });
  }

  // ============================================================================
  // Responsive Lifecycle Hooks
  // ============================================================================

  /**
   * Handle breakpoint change - switch between horizontal/vertical layouts
   */
  protected _handleBreakpointChange(
    breakpoint: BreakpointName,
    previousBreakpoint: BreakpointName,
    state: ResponsiveState
  ): void {
    super._handleBreakpointChange(breakpoint, previousBreakpoint, state);
    if (state.isMobile) {
      this._setMobileLayout();
    } else {
      this._setDesktopLayout();
    }
    this.emit('breakpoint-change', breakpoint, previousBreakpoint);
  }

  /**
   * Called when entering mobile mode - vertical layout
   */
  protected _enterMobileMode(): void {
    this._isMobileMode = true;
    this._setMobileLayout();
    this.emit('enter-mobile');
  }

  /**
   * Called when exiting mobile mode - horizontal layout
   */
  protected _exitMobileMode(): void {
    this._isMobileMode = false;
    this._setDesktopLayout();
    this.emit('exit-mobile');
  }

  /**
   * Set mobile-friendly vertical layout
   */
  private _setMobileLayout(): void {
    if (!this._mobileVertical) return;
    this._isMobileMode = true;

    // Reconfigure buttons for vertical layout
    let offset = 0;
    for (const key of this.itemKeys) {
      const entry = this.items.get(key);
      if (!entry) continue;

      entry.button.top = offset;
      entry.button.left = 0;
      entry.button.width = '100%';
      entry.button.height = this._mobileItemHeight;

      offset += this._mobileItemHeight;
    }

    // Adjust container height
    this.height = offset;

    if (this.screen) this.screen.render();
  }

  /**
   * Restore desktop horizontal layout
   */
  private _setDesktopLayout(): void {
    this._isMobileMode = false;

    // Reconfigure buttons for horizontal layout
    let offset = 0;
    for (const key of this.itemKeys) {
      const entry = this.items.get(key);
      if (!entry) continue;

      const text = entry.item.text || key;
      const pad = this.itemPadding;
      const buttonWidth = text.length + (pad * 2);

      entry.button.top = 0;
      entry.button.left = offset;
      entry.button.width = buttonWidth;
      entry.button.height = 1;

      offset += buttonWidth + this.itemGap;
    }

    // Restore container height
    this.height = this._desktopHeight || 1;

    if (this.screen) this.screen.render();
  }
}
