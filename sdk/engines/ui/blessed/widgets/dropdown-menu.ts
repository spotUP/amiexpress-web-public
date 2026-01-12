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
  private items: DropdownMenuItem[];
  private selectedIndex: number = 0;
  private outsideClickHandler?: (event: any) => void;

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
    });

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
    if (!this.screen) return;
    const cols = this.screen.cols;
    const rows = this.screen.rows;

    const width = typeof this.width === 'number' ? this.width : 20;
    const height = typeof this.height === 'number' ? this.height : 10;

    const clampedLeft = Math.max(0, Math.min(left, cols - width));
    const clampedTop = Math.max(0, Math.min(top, rows - height));

    this.left = clampedLeft;
    this.top = clampedTop;
    this.show();
    this.focus();
    this.screen.trapFocus(this);
    this.attachOutsideClick();
    this.screen.render();
  }

  openFor(anchor: Element, align: 'left' | 'right' = 'left'): void {
    if (!this.screen) return;
    const coords = anchor._getCoords();
    if (!coords) return;

    const left = align === 'right'
      ? coords.xl - (typeof this.width === 'number' ? this.width : 20)
      : coords.xi;
    const top = coords.yl;
    this.openAt(left, top);
  }

  close(): void {
    if (!this.screen) return;
    this.hide();
    this.detachOutsideClick();
    this.screen.releaseFocusTrap();
    this.screen.render();
  }

  setItems(items: DropdownMenuItem[]): void {
    this.items = items;
    this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, this.items.length - 1));
    this.updateContent();
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
        this.close();
      }
    };

    this.screen.on('click', this.outsideClickHandler);
  }

  private detachOutsideClick(): void {
    if (!this.screen || !this.outsideClickHandler) return;
    this.screen.off('click', this.outsideClickHandler);
    this.outsideClickHandler = undefined;
  }
}

export function dropdownMenu(options: DropdownMenuOptions): DropdownMenu {
  return new DropdownMenu(options);
}
