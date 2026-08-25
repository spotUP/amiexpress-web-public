/**
 * DropdownMenu widget - Keyboard/mouse dropdown with focus trapping
 */

import { Element } from '../core/element';
import type { Screen } from '../core/screen';

export interface DropdownMenuItem {
  label: string;
  value?: string;
  disabled?: boolean;
  separator?: boolean;
  action?: () => void;
}

export interface DropdownMenuOptions {
  items: DropdownMenuItem[];
  parent?: any;
  screen?: Screen;
  width?: number;
  maxHeight?: number;
  label?: string;
  style?: any;
}

export class DropdownMenu extends Element {
  // Static registry to track open menus - ensures only one is open at a time
  private static openMenus: Set<DropdownMenu> = new Set();

  // Flag to block clicks immediately after menu close (prevents drawing on canvas)
  private static justClosed: boolean = false;

  private items: DropdownMenuItem[];
  private selectedIndex: number = 0;
  private outsideClickHandler?: (event: any) => void;
  private anchor?: Element;
  private anchorLeft: number = 0;
  private anchorTop: number = 0;

  /**
   * Close all currently open dropdown menus
   */
  static closeAll(): void {
    for (const menu of DropdownMenu.openMenus) {
      menu.close();
    }
  }

  /**
   * Check if any dropdown menu is currently open
   */
  static isAnyOpen(): boolean {
    return DropdownMenu.openMenus.size > 0;
  }

  /**
   * Check if a menu was just closed (blocks canvas clicks for one tick)
   */
  static wasJustClosed(): boolean {
    return DropdownMenu.justClosed;
  }

  /**
   * Check if click should be blocked (menu open OR just closed)
   */
  static shouldBlockClick(): boolean {
    return DropdownMenu.openMenus.size > 0 || DropdownMenu.justClosed;
  }

  constructor(options: DropdownMenuOptions) {
    const width = options.width || 20;
    const height = Math.min((options.items?.length || 1) + 2, options.maxHeight || 12);

    super({
      parent: options.parent || options.screen,
      top: 0,
      left: 0,
      width,
      height,
      border: { type: 'line', fg: 'cyan' },
      label: options.label,
      style: options.style || {
        fg: 'white',
        bg: 'black',
        focus: { fg: 'white', bg: 'black' },
      },
      tags: true,
      keys: true,
      mouse: true,
      clickable: true,
      focusable: true,
      hidden: true,
      shadow: true,
      zIndex: 9999,  // Render on top of everything (panels are typically 1-10)
    } as any);

    this.items = options.items || [];
    this.updateContent();

    this.on('keypress', (_ch: any, key: any) => {
      if (key.name === 'up') {
        this.move(-1);
      } else if (key.name === 'down') {
        this.move(1);
      } else if (key.name === 'enter' || key.name === 'space') {
        this.selectItem();
      } else if (key.name === 'escape') {
        this.close();
      } else if (key.name === 'tab') {
        this.emit(key.shift ? 'tab-prev' : 'tab-next');
        this.close();
      }
      return true;
    });

    this.on('click', (event: any) => {
      const pos = this._getCoords();
      if (!pos) return;

      const border = 1;
      const relY = event.y - pos.yi - border;
      if (relY >= 0 && relY < this.items.length) {
        this.selectedIndex = relY;
        this.selectItem();
      }
    });

    this.on('mousemove', (event: any) => {
      const pos = this._getCoords();
      if (!pos) return;

      const border = 1;
      const relY = event.y - pos.yi - border;
      if (relY >= 0 && relY < this.items.length) {
        this.selectedIndex = relY;
        this.updateContent();
        this.screen?.render();
      }
    });
  }

  openAt(left: number, top: number): void {
    console.log('[DropdownMenu] openAt called:', { left, top });
    if (!this.screen) {
      console.log('[DropdownMenu] ERROR: No screen in openAt!');
      return;
    }

    // Close any other open menus first (ensures only one menu open at a time)
    for (const menu of DropdownMenu.openMenus) {
      if (menu !== this) {
        menu.close();
      }
    }

    const cols = this.screen.cols;
    const rows = this.screen.rows;
    console.log('[DropdownMenu] Screen size:', { cols, rows });

    const width = typeof this.width === 'number' ? this.width : 20;
    const height = typeof this.height === 'number' ? this.height : 10;

    const clampedLeft = Math.max(0, Math.min(left, cols - width));
    const clampedTop = Math.max(0, Math.min(top, rows - height));
    console.log('[DropdownMenu] Clamped position:', { clampedLeft, clampedTop, width, height });

    this.left = clampedLeft;
    this.top = clampedTop;
    console.log('[DropdownMenu] Calling show()');
    this.show();
    console.log('[DropdownMenu] Calling focus()');
    this.focus();
    console.log('[DropdownMenu] hidden:', this.hidden, 'visible:', this.visible);

    // Track this menu as open
    DropdownMenu.openMenus.add(this);

    this.screen.trapFocus(this);
    this.attachOutsideClick();

    // A newly shown menu must be painted in full. Opened from the KEYBOARD
    // the menu stayed invisible until the next key moved the selection -
    // the differential renderer had nothing marked dirty where the menu had
    // just appeared, so it drew nothing (reported 2026-08-25: "if I tab to
    // the menus they don't show, but if I press arrow down they draw").
    // Opening with the mouse hid the bug because the mouse event itself
    // dirtied the screen.
    (this.screen as any).forceFullRedraw?.();
    this.screen.render();
  }

  openFor(anchor: Element, align: 'left' | 'right' = 'left'): void {
    console.log('[DropdownMenu] openFor called');
    if (!this.screen) {
      console.log('[DropdownMenu] ERROR: No screen!');
      return;
    }
    const coords = anchor._getCoords();
    console.log('[DropdownMenu] anchor coords:', coords);
    if (!coords) {
      console.log('[DropdownMenu] ERROR: No coords from anchor!');
      return;
    }

    const left = align === 'right'
      ? coords.xl - (typeof this.width === 'number' ? this.width : 20)
      : coords.xi;
    const top = coords.yl;
    console.log('[DropdownMenu] Calculated position:', { left, top });
    this.openAt(left, top);
  }

  close(fromOutsideClick: boolean = false): void {
    if (!this.screen) return;

    // Remove from open menus registry
    DropdownMenu.openMenus.delete(this);

    // If closed by outside click, set flag to block canvas clicks for one tick
    if (fromOutsideClick) {
      DropdownMenu.justClosed = true;
      setImmediate(() => {
        DropdownMenu.justClosed = false;
      });
    }

    this.hide();
    this.detachOutsideClick();
    // Only ours - a dialog opened by the chosen item may have trapped focus.
    this.screen.releaseFocusTrap(this);

    // Hand focus back to the button that opened this menu. Releasing the trap
    // alone left focus sitting on a now-hidden dropdown, so Escape closed the
    // menu and then swallowed every subsequent key - reported live as "when I
    // tab to the menus I can't exit them" (2026-08-25). An outside click is
    // the exception: the click has already put focus where the user pointed.
    // ...but ONLY if this menu still holds focus. Choosing an item runs its
    // action BEFORE the menu closes, and that action often opens something
    // that takes focus itself - a help modal, a dialog. Restoring blindly
    // stole focus back to the menu bar, so Escape then went to the menu
    // instead of closing what had just opened (reported live 2026-08-25).
    const stillOurs = this.screen.getFocused?.() === this || this.screen.getFocused?.() == null;
    if (!fromOutsideClick && stillOurs && this.anchor && !this.anchor.destroyed) {
      this.anchor.focus();
    }

    this.screen.render();
  }

  setItems(items: DropdownMenuItem[]): void {
    this.items = items;
    this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, this.items.length - 1));
    this.updateContent();
  }

  /**
   * Register an anchor element for hover-to-open behavior
   * When any menu is open, hovering over this anchor opens this menu
   * @param anchor The element that triggers this menu
   * @param leftOffset Additional left offset (optional, default 0)
   * @param topOffset Additional top offset (optional, default 0 to open directly below anchor)
   */
  registerAnchor(anchor: Element, leftOffset: number = 0, topOffset: number = 0): void {
    this.anchor = anchor;

    // Helper to get dynamic position from anchor's current coordinates
    const getPosition = (): { left: number; top: number } => {
      const coords = anchor._getCoords();
      if (coords) {
        return {
          left: coords.xi + leftOffset,
          top: coords.yl + topOffset,  // Open directly below the anchor
        };
      }
      // Fallback if no coords available
      return { left: leftOffset, top: topOffset };
    };

    // Click always opens
    anchor.on('click', () => {
      const pos = getPosition();
      this.openAt(pos.left, pos.top);
    });

    // Hover opens only when another menu is already open
    anchor.on('mouseenter', () => {
      if (DropdownMenu.isAnyOpen() && this.hidden) {
        const pos = getPosition();
        this.openAt(pos.left, pos.top);
      }
    });
  }

  /**
   * Check if this menu is currently open
   */
  isOpen(): boolean {
    return !this.hidden && DropdownMenu.openMenus.has(this);
  }

  private move(delta: number): void {
    if (!this.items.length) return;
    let next = this.selectedIndex;
    for (let i = 0; i < this.items.length; i++) {
      next = (next + delta + this.items.length) % this.items.length;
      if (!this.items[next].disabled && !this.items[next].separator) {
        this.selectedIndex = next;
        this.updateContent();
        this.screen?.render();
        return;
      }
    }
  }

  private selectItem(): void {
    const item = this.items[this.selectedIndex];
    if (!item || item.disabled || item.separator) return;

    item.action?.();
    this.emit('select', item);
    this.close();
  }

  private updateContent(): void {
    const lines: string[] = [];
    let maxWidth = 10;

    this.items.forEach((item, index) => {
      if (item.separator) {
        lines.push('─'.repeat(18));
        maxWidth = Math.max(maxWidth, 18);
        return;
      }
      const selected = index === this.selectedIndex;
      const prefix = selected ? '> ' : '  ';
      const label = item.disabled ? `{gray-fg}${item.label}{/gray-fg}` : item.label;
      const line = `${prefix}${label}`;
      lines.push(line);
      maxWidth = Math.max(maxWidth, line.replace(/\{[^}]+\}/g, '').length);
    });

    this.setContent(lines.join('\n'));
    if (typeof this.width === 'number' && this.width < maxWidth + 2) {
      this.width = Math.min(maxWidth + 2, this.screen?.cols || maxWidth + 2);
    }
  }

  private attachOutsideClick(): void {
    if (!this.screen || this.outsideClickHandler) return;

    this.outsideClickHandler = (event: any) => {
      if (this.hidden) return;
      const pos = this._getCoords();
      if (!pos) return;
      const outside = event.x < pos.xi || event.x > pos.xl || event.y < pos.yi || event.y > pos.yl;
      if (outside) {
        this.close(true);  // Pass true to indicate outside click
      }
    };

    // Listen on both mousedown and click for reliable outside click detection
    this.screen.on('mousedown', this.outsideClickHandler);
    this.screen.on('click', this.outsideClickHandler);
  }

  private detachOutsideClick(): void {
    if (!this.screen || !this.outsideClickHandler) return;
    this.screen.off('mousedown', this.outsideClickHandler);
    this.screen.off('click', this.outsideClickHandler);
    this.outsideClickHandler = undefined;
  }
}

export function dropdownMenu(options: DropdownMenuOptions): DropdownMenu {
  return new DropdownMenu(options);
}
