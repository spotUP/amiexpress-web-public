/**
 * MenuBar widget - Moebius-style top menu bar with dropdown menus
 * Based on ANSI Editor implementation
 */

import { Element } from '../core/element';
import { Box } from './box';
import { DropdownMenu, DropdownMenuItem } from './dropdown-menu';
import type { Screen } from '../core/screen';

export interface MenuBarItem {
  label: string;
  items: DropdownMenuItem[];
}

export interface MenuBarOptions {
  parent?: any;
  screen: Screen;
  items: MenuBarItem[];
  style?: {
    bg?: string;
    fg?: string;
    hover?: {
      bg?: string;
      fg?: string;
    };
  };
}

/**
 * MenuBar - Moebius-style menu bar with hover-to-open dropdowns
 *
 * Features:
 * - Fixed positioning (not dynamic spacing)
 * - Gray background with black text (matches ANSI Editor)
 * - Hover to open dropdowns
 * - Tab navigation between menus
 * - Click outside to close
 *
 * Example:
 * ```typescript
 * const menuBar = new MenuBar({
 *   screen,
 *   items: [
 *     { label: 'File', items: [
 *       { label: 'New', action: () => newFile() },
 *       { label: 'Open', action: () => openFile() },
 *     ]},
 *     { label: 'Edit', items: [...] },
 *   ]
 * });
 * ```
 */
export class MenuBar extends Element {
  private menuButtons: Box[] = [];
  private dropdowns: DropdownMenu[] = [];
  private items: MenuBarItem[];
  private menuBarContainer: Box;

  constructor(options: MenuBarOptions) {
    super({
      parent: options.parent || options.screen,
      top: 0,
      left: 0,
      width: '100%',
      height: 1,
      style: {
        bg: options.style?.bg || 'gray',
        fg: options.style?.fg || 'black',
      },
      tags: true,
      zIndex: 9998,  // Menu bar should be on top (but below dropdowns)
    } as any);

    this.items = options.items || [];

    // Container for menu bar (this element)
    this.menuBarContainer = this as any;

    // Create menu buttons and dropdowns
    this.createMenus(options.screen, options.style);
  }

  /**
   * Create menu buttons with fixed positions (Moebius-style)
   */
  private createMenus(screen: Screen, style?: MenuBarOptions['style']): void {
    // Calculate fixed positions based on label lengths
    let left = 0;
    const menuPositions = this.items.map((item) => {
      const pos = { label: ` ${item.label} `, left };
      left += pos.label.length + 1; // Add 1 for spacing
      return pos;
    });

    // Create buttons and dropdowns
    this.items.forEach((item, index) => {
      const pos = menuPositions[index];

      // Menu button
      const button = new Box({
        parent: this,
        top: 0,
        left: pos.left,
        width: pos.label.length,
        height: 1,
        content: pos.label,
        style: {
          bg: style?.bg || 'gray',
          fg: style?.fg || 'black',
          hover: {
            bg: style?.hover?.bg || 'blue',
            fg: style?.hover?.fg || 'white',
          },
          focus: {
            bg: style?.hover?.bg || 'blue',
            fg: style?.hover?.fg || 'white',
          },
        },
        tags: true,
        mouse: true,
        clickable: true,
        focusable: true,
        tabIndex: -1,  // Exclude from Tab cycling - menu activated by click/hover, not Tab
        keys: true,
      });

      this.menuButtons.push(button);

      // Dropdown menu
      console.log('[MenuBar] Creating dropdown for:', item.label);
      const dropdown = new DropdownMenu({
        parent: screen,
        width: this.calculateMenuWidth(item.items),
        items: item.items,
      });

      console.log('[MenuBar] Dropdown created, type:', typeof dropdown, 'hasOpenFor:', typeof dropdown.openFor);
      dropdown.registerAnchor(button);
      this.dropdowns.push(dropdown);
      console.log('[MenuBar] Dropdown registered, total dropdowns:', this.dropdowns.length);

      // Button click opens menu
      button.on('click', () => {
        console.log('[MenuBar] Button clicked:', item.label, 'index:', index);
        this.openMenu(index);
      });

      // Hover opens menu immediately (always, not just when another is open)
      button.on('mouseenter', () => {
        console.log('[MenuBar] Button hover:', item.label, 'index:', index);
        this.openMenu(index);
      });

      // Keyboard activation
      button.key(['enter', 'space', 'down'], () => {
        this.openMenu(index);
      });

      // Dropdown navigation
      dropdown.on('tab-next', () => {
        this.openMenu((index + 1) % this.dropdowns.length);
      });

      dropdown.on('tab-prev', () => {
        this.openMenu((index - 1 + this.dropdowns.length) % this.dropdowns.length);
      });
    });
  }

  /**
   * Calculate optimal width for dropdown menu
   */
  private calculateMenuWidth(items: DropdownMenuItem[]): number {
    let maxLength = 10;
    for (const item of items) {
      if (item.label && item.label.length > maxLength) {
        maxLength = item.label.length;
      }
    }
    return Math.min(maxLength + 4, 40);
  }

  /**
   * Open a specific menu by index
   */
  private openMenu(index: number): void {
    console.log('[MenuBar] openMenu called, index:', index, 'dropdowns:', this.dropdowns.length, 'buttons:', this.menuButtons.length);

    // Close all other menus
    this.dropdowns.forEach((menu, i) => {
      if (i !== index) {
        menu.close();
      }
    });

    // Open selected menu
    if (this.dropdowns[index]) {
      console.log('[MenuBar] Opening dropdown at index:', index);
      console.log('[MenuBar] Dropdown type:', typeof this.dropdowns[index]);
      console.log('[MenuBar] Dropdown openFor type:', typeof this.dropdowns[index].openFor);
      console.log('[MenuBar] Button type:', typeof this.menuButtons[index]);
      this.dropdowns[index].openFor(this.menuButtons[index]);
      console.log('[MenuBar] openFor call completed');
    } else {
      console.log('[MenuBar] ERROR: No dropdown at index:', index);
    }
  }

  /**
   * Close all menus
   */
  closeAll(): void {
    this.dropdowns.forEach((menu) => menu.close());
  }

  /**
   * Update menu items dynamically
   */
  setItems(items: MenuBarItem[]): void {
    // Destroy old menus
    this.menuButtons.forEach((btn) => btn.destroy());
    this.dropdowns.forEach((menu) => menu.destroy());
    this.menuButtons = [];
    this.dropdowns = [];

    // Recreate with new items
    this.items = items;
    const screen = this.screen;
    if (screen) {
      this.createMenus(screen, { bg: 'gray', fg: 'black' });
    }
  }

  /**
   * Update a specific menu's items
   */
  updateMenu(index: number, items: DropdownMenuItem[]): void {
    if (this.dropdowns[index]) {
      this.dropdowns[index].setItems(items);
    }
  }

  /**
   * Get dropdown menu by index
   */
  getMenu(index: number): DropdownMenu | undefined {
    return this.dropdowns[index];
  }

  /**
   * Destroy menu bar and all dropdowns
   */
  destroy(): void {
    this.dropdowns.forEach((menu) => menu.destroy());
    this.menuButtons.forEach((btn) => btn.destroy());
    super.destroy();
  }
}
