/**
 * Menu System - Advanced Interactive Menus
 *
 * Provides professional menu systems with:
 * - Arrow key navigation
 * - Modal overlays
 * - Customizable styles
 * - Submenus
 * - Hotkeys
 * - Animations
 *
 * @example
 * ```typescript
 * import { MenuSystem } from '@amiexpress/sdk/components/menus';
 *
 * const menu = new MenuSystem({
 *   title: 'Main Menu',
 *   style: 'retro-neon',
 *   navigation: 'arrow-keys',
 *   modal: true
 * });
 *
 * menu.addItem('New Game', () => startNewGame());
 * menu.addItem('Load Game', () => showLoadMenu());
 * menu.addItem('Options', () => showOptionsModal());
 * menu.addItem('Quit', () => quitGame());
 *
 * await menu.show(door, user);
 * ```
 */

import { MenuItem, MenuConfig, Position, AnsiColor } from '../../core/types';
import Door from '../../core/door-api';

export class MenuSystem {
  /** Menu configuration */
  private config: MenuConfig;

  /** Menu items */
  private items: MenuItem[] = [];

  /** Currently selected index */
  private selectedIndex: number = 0;

  /** Is menu visible? */
  private visible: boolean = false;

  /** Rendered menu buffer */
  private buffer: string = '';

  constructor(config: MenuConfig) {
    this.config = {
      modal: config.modal ?? false,
      position: config.position,
      ...config,
    };
  }

  /**
   * Add menu item
   *
   * @param text - Display text
   * @param action - Action callback
   * @param options - Additional options
   *
   * @example
   * ```typescript
   * menu.addItem('Play Game', () => startGame(), {
   *   hotkey: 'P',
   *   enabled: true
   * });
   *
   * menu.addItem('Settings', () => showSettings(), {
   *   submenu: settingsMenu
   * });
   * ```
   */
  public addItem(
    text: string,
    action: () => void | Promise<void>,
    options: {
      key?: string;
      enabled?: boolean;
      visible?: boolean;
      submenu?: MenuItem[];
    } = {}
  ): void {
    this.items.push({
      text,
      key: options.key,
      action,
      enabled: options.enabled ?? true,
      visible: options.visible ?? true,
      submenu: options.submenu,
    });
  }

  /**
   * Remove menu item by text
   *
   * @param text - Item text to remove
   */
  public removeItem(text: string): void {
    const index = this.items.findIndex((item) => item.text === text);
    if (index !== -1) {
      this.items.splice(index, 1);
      if (this.selectedIndex >= this.items.length) {
        this.selectedIndex = Math.max(0, this.items.length - 1);
      }
    }
  }

  /**
   * Clear all menu items
   */
  public clear(): void {
    this.items = [];
    this.selectedIndex = 0;
  }

  /**
   * Render menu to ANSI string
   *
   * @returns ANSI-encoded menu
   * @private
   */
  private render(): string {
    const pos = this.config.position || { x: 20, y: 5 };
    const style = this.config.style;

    let output = '';

    // Modal background overlay
    if (this.config.modal) {
      output += this.renderModalBackground();
    }

    // Position cursor
    output += `\x1b[${pos.y};${pos.x}H`;

    // Draw menu box
    const maxWidth = Math.max(
      this.config.title.length,
      ...this.items.map((item) => item.text.length + 4)
    );
    const width = maxWidth + 4;
    const height = this.items.length + 4;

    output += this.renderBox(pos, width, height, style);

    // Draw title
    output += `\x1b[${pos.y + 1};${pos.x + 2}H`;
    output += this.renderTitle(this.config.title, style);

    // Draw separator
    output += `\x1b[${pos.y + 2};${pos.x + 1}H`;
    output += '─'.repeat(width - 2);

    // Draw items
    const visibleItems = this.items.filter((item) => item.visible);
    visibleItems.forEach((item, index) => {
      const y = pos.y + 3 + index;
      output += `\x1b[${y};${pos.x + 2}H`;

      const isSelected = index === this.selectedIndex;
      const isEnabled = item.enabled;

      output += this.renderItem(item, isSelected, isEnabled, style);
    });

    return output;
  }

  /**
   * Render modal background overlay
   * @private
   */
  private renderModalBackground(): string {
    let output = '\x1b[2J\x1b[H'; // Clear screen

    // Draw semi-transparent background (using dark blue)
    for (let y = 0; y < 24; y++) {
      output += `\x1b[${y + 1};1H`;
      output += '\x1b[44m' + ' '.repeat(80) + '\x1b[0m';
    }

    return output;
  }

  /**
   * Render menu box
   * @private
   */
  private renderBox(
    pos: Position,
    width: number,
    height: number,
    style: string
  ): string {
    const chars =
      style === 'retro-neon'
        ? { tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═', v: '║' }
        : { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│' };

    const color = style === 'retro-neon' ? '\x1b[36m' : '\x1b[37m'; // Cyan or white

    let output = color;

    // Top border
    output += `\x1b[${pos.y};${pos.x}H${chars.tl}${chars.h.repeat(width - 2)}${chars.tr}`;

    // Sides
    for (let y = 1; y < height - 1; y++) {
      output += `\x1b[${pos.y + y};${pos.x}H${chars.v}`;
      output += `\x1b[${pos.y + y};${pos.x + width - 1}H${chars.v}`;
    }

    // Bottom border
    output += `\x1b[${pos.y + height - 1};${pos.x}H${chars.bl}${chars.h.repeat(width - 2)}${chars.br}`;

    output += '\x1b[0m';

    return output;
  }

  /**
   * Render menu title
   * @private
   */
  private renderTitle(title: string, style: string): string {
    const color = style === 'retro-neon' ? '\x1b[35m' : '\x1b[37m'; // Magenta or white
    return `${color}${title}\x1b[0m`;
  }

  /**
   * Render menu item
   * @private
   */
  private renderItem(
    item: MenuItem,
    selected: boolean,
    enabled: boolean,
    style: string
  ): string {
    let output = '';

    // Selection indicator
    if (selected) {
      output += style === 'retro-neon' ? '\x1b[33m► ' : '> '; // Yellow arrow
    } else {
      output += '  ';
    }

    // Item text
    const color = enabled
      ? selected
        ? '\x1b[33m' // Yellow when selected
        : '\x1b[37m' // White
      : '\x1b[30m'; // Dark gray when disabled

    output += color + item.text;

    // Hotkey hint
    if (item.key) {
      output += ` \x1b[90m[${item.key}]\x1b[0m`;
    }

    // Submenu indicator
    if (item.submenu) {
      output += ' \x1b[36m►\x1b[0m';
    }

    output += '\x1b[0m';

    return output;
  }

  /**
   * Show menu and handle input
   *
   * @param door - Door instance
   * @param userId - User ID
   * @returns Promise that resolves when menu is closed
   *
   * @example
   * ```typescript
   * await menu.show(door, user.id);
   * ```
   */
  public async show(door: Door, userId: number): Promise<void> {
    this.visible = true;
    this.selectedIndex = 0;

    // Initial render
    this.buffer = this.render();
    door.sendAnsi(this.buffer, userId);

    // Input loop
    while (this.visible) {
      const key = await door.waitForInput(userId, 30000);
      if (!key) continue; // Timeout

      const handled = await this.handleInput(key.key, door, userId);

      if (handled) {
        // Re-render
        this.buffer = this.render();
        door.sendAnsi(this.buffer, userId);
      }
    }
  }

  /**
   * Handle keyboard input
   *
   * @param key - Key pressed
   * @param door - Door instance
   * @param userId - User ID
   * @returns True if menu should re-render
   * @private
   */
  private async handleInput(
    key: string,
    door: Door,
    userId: number
  ): Promise<boolean> {
    const visibleItems = this.items.filter((item) => item.visible);

    if (key === 'ArrowUp' || key === 'w' || key === 'W') {
      // Navigate up
      this.selectedIndex = Math.max(0, this.selectedIndex - 1);
      return true;
    } else if (key === 'ArrowDown' || key === 's' || key === 'S') {
      // Navigate down
      this.selectedIndex = Math.min(visibleItems.length - 1, this.selectedIndex + 1);
      return true;
    } else if (key === 'Enter' || key === '\r' || key === '\n') {
      // Select item
      const item = visibleItems[this.selectedIndex];
      if (item && item.enabled) {
        await item.action();
        this.visible = false; // Close menu after action
      }
      return false;
    } else if (key === 'Escape' || key === 'q' || key === 'Q') {
      // Close menu
      this.visible = false;
      return false;
    } else {
      // Check hotkeys
      const hotkeyItem = visibleItems.find(
        (item) => item.key && item.key.toLowerCase() === key.toLowerCase()
      );
      if (hotkeyItem && hotkeyItem.enabled) {
        await hotkeyItem.action();
        this.visible = false;
        return false;
      }
    }

    return false;
  }

  /**
   * Hide menu
   */
  public hide(): void {
    this.visible = false;
  }

  /**
   * Is menu visible?
   */
  public isVisible(): boolean {
    return this.visible;
  }
}

export default MenuSystem;
