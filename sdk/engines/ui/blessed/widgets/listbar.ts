/**
 * Listbar - Horizontal menu bar widget
 */

import { Box } from './box';
import { Button } from './button';
import type { ElementOptions } from '../core/types';

export interface ListbarOptions extends ElementOptions {
  items?: Record<string, ListbarItem>;
  commands?: Record<string, ListbarItem | { callback?: () => void }>;
  autoCommandKeys?: boolean;
}

export interface ListbarItem {
  text?: string;
  keys?: string[];
  callback?: () => void;
}

export class Listbar extends Box {
  private items: Map<string, { button: Button; item: ListbarItem }> = new Map();
  private selectedIndex: number = 0;
  private itemKeys: string[] = [];

  constructor(options: ListbarOptions = {}) {
    super({
      ...options,
      height: options.height || 1,
      clickable: true,
      focusable: true,
      style: {
        fg: 'white',
        bg: 'blue',
        ...(options.style || {}),
      },
    });

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
  setItems(items: Record<string, ListbarItem>): void {
    // Clear existing items
    this.clearItems();

    let offset = 0;
    this.itemKeys = Object.keys(items);

    for (const [key, item] of Object.entries(items)) {
      const text = item.text || key;
      const buttonText = ` ${text} `;

      const button = new Button({
        parent: this,
        top: 0,
        left: offset,
        width: buttonText.length + 2,
        height: 1,
        content: buttonText,
        padding: 0,
        align: 'center',
        border: undefined, // No border for tab buttons
        style: {
          fg: this.options.style?.fg || 'white',
          bg: this.options.style?.bg || 'blue',
          focus: {
            fg: 'black',
            bg: 'white',
          },
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
      offset += buttonText.length + 3;
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
}
