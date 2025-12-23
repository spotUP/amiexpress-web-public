/**
 * List widget - Scrollable list with selection
 */

import { Element } from '../core/element';
import { parseTags, textWidth } from '../core/colors';
import type { ListOptions, KeyEvent } from '../core/types';

export class List extends Element {
  items: string[] = [];
  selected: number = 0;
  private previousSelected: number = -1;
  private interactive: boolean = true;
  private wrapItemsEnabled: boolean = false;
  private lineToItem: number[] = [];
  private itemLineStart: number[] = [];
  private itemLineCount: number[] = [];

  constructor(options: ListOptions = {}) {
    // Build scrollbar config: merge user options with defaults
    let scrollbarConfig: any = undefined;
    if ((options.scrollbar as any) !== false) {
      const userScrollbar = typeof options.scrollbar === 'object' ? options.scrollbar : {};
      scrollbarConfig = {
        ch: userScrollbar.ch || '█',
        track: userScrollbar.track || { ch: '│' },
        style: userScrollbar.style || options.style,
        ...userScrollbar,  // Spread user options to preserve any extra properties
      };
    }

    super({
      scrollable: true,
      focusable: true,
      clickable: true,
      keys: true,
      mouse: true,
      wrap: false, // List items should not wrap
      ...options,
      scrollbar: scrollbarConfig,
    });

    this.items = options.items || [];
    this.selected = options.selected || 0;
    this.interactive = options.interactive !== false;
    this.wrapItemsEnabled = options.wrapItems !== false;

    // Update content
    this._updateContent();

    this.on('attach', () => {
      if (this.wrapItemsEnabled) {
        this._updateContent();
      }
    });

    this.on('resize', () => {
      if (this.wrapItemsEnabled) {
        this._updateContent();
      }
    });

    // Key handlers
    if (options.keys !== false) {
      this.on('keypress', this._onKeypress.bind(this));
    }

    // Mouse click handler - select item by click position
    if (options.mouse !== false) {
      this.on('click', this._onClick.bind(this));

      // Mouse wheel handlers - move selection (view auto-scrolls to follow)
      this.on('wheelup', () => {
        this.up();
        this.screen?.render();
      });
      this.on('wheeldown', () => {
        this.down();
        this.screen?.render();
      });
    }
  }

  private _onClick(event: any): void {
    if (!this.interactive) return;

    // Calculate which item was clicked
    const pos = this._getCoords();
    if (!pos) return;

    const border = this.options.border ? 1 : 0;
    const padding = this.options.padding || 0;
    const padTop = typeof padding === 'number' ? padding : (padding as any).top || 0;

    // Get click position relative to content area
    const relY = event.y - pos.yi - border - padTop;
    const scroll = this.getScroll();
    const lineIndex = relY + scroll;
    const itemIndex = this.wrapItemsEnabled
      ? this.lineToItem[lineIndex]
      : lineIndex;

    if (itemIndex !== undefined && itemIndex >= 0 && itemIndex < this.items.length) {
      this.select(itemIndex);
      this.emit('select', this.items[itemIndex], itemIndex);
      this.emit('action', this.items[itemIndex], itemIndex);
    }
  }

  private _updateContent(): void {
    const lines = (this as any)._lines as string[] | undefined;

    // Fast path: if we already have lines and just need to update selection markers
    if (lines && lines.length === this.items.length &&
        this.previousSelected >= 0 && this.previousSelected < this.items.length &&
        !this.wrapItemsEnabled) {
      // Just update the two changed lines (old and new selection)
      const oldIdx = this.previousSelected;
      const newIdx = this.selected;

      if (oldIdx !== newIdx) {
        lines[oldIdx] = '  ' + this.items[oldIdx];
        lines[newIdx] = '> ' + this.items[newIdx];
      }
      return;
    }

    // Full rebuild needed
    const newLines: string[] = [];
    this.lineToItem = [];
    this.itemLineStart = [];
    this.itemLineCount = [];

    this.items.forEach((item, index) => {
      const marker = index === this.selected ? '> ' : '  ';
      const start = newLines.length;

      if (this.wrapItemsEnabled) {
        // Wrap long items to multiple lines
        const parsed = this.options.tags ? parseTags(item) : item;
        const wrapWidth = Math.max(1, this.getItemWrapWidth() - 2); // -2 for marker
        const wrapped = this.wrapAnsiText(parsed, wrapWidth);

        if (wrapped.length === 0) {
          newLines.push(marker);
          this.lineToItem.push(index);
        } else {
          newLines.push(marker + wrapped[0]);
          this.lineToItem.push(index);
          for (let i = 1; i < wrapped.length; i++) {
            newLines.push('  ' + wrapped[i]);
            this.lineToItem.push(index);
          }
        }
      } else {
        // Simple case: one line per item
        newLines.push(marker + item);
        this.lineToItem.push(index);
      }

      const count = newLines.length - start;
      this.itemLineStart[index] = start;
      this.itemLineCount[index] = count || 1;
    });

    // CRITICAL: Directly set _lines to ensure consistency with itemLineStart/itemLineCount
    // Don't use setContent() as parseContent() might re-wrap and change line count
    (this as any)._lines = newLines;
    this.content = newLines.join('\n');
    (this as any)._contentDirty = false;
  }

  private _onKeypress(ch: any, key: KeyEvent): void {
    if (!this.interactive || !this.focused) return;

    const vi = (this.options as any).vi;
    if (key.name === 'up' || (vi && key.name === 'k')) {
      this.up();
      this.screen?.render();
      return;
    }

    if (key.name === 'down' || (vi && key.name === 'j')) {
      this.down();
      this.screen?.render();
      return;
    }

    if (key.name === 'enter' || key.name === 'space') {
      this.emit('select', this.items[this.selected], this.selected);
      this.emit('action', this.items[this.selected], this.selected);
      return;
    }

    if (key.name === 'escape') {
      this.emit('cancel');
      return;
    }
  }

  setItems(items: string[]): void {
    this.items = items;
    if (items.length === 0) {
      this.selected = 0;
    } else {
      this.selected = Math.min(this.selected, items.length - 1);
    }
    this._updateContent();
  }

  select(index: number): void {
    this.previousSelected = this.selected;
    this.selected = Math.max(0, Math.min(index, this.items.length - 1));
    this._updateContent();

    // Scroll to keep selected item visible
    // Get visible height - try multiple approaches for robustness
    let visibleHeight = this.iheight;

    // Fallback to direct position calculation
    if (visibleHeight <= 0) {
      const pos = this._getCoords();
      if (pos) {
        const border = this.options.border ? 2 : 0;
        const padding = this.options.padding || 0;
        const padTop = typeof padding === 'number' ? padding : (padding as any).top || 0;
        const padBottom = typeof padding === 'number' ? padding : (padding as any).bottom || 0;
        visibleHeight = pos.yl - pos.yi - border - padTop - padBottom;
      }
    }

    // Final fallback
    if (visibleHeight <= 0) {
      visibleHeight = 10; // Reasonable default
    }

    // Get total content lines
    const totalLines = (this as any)._lines?.length || this.items.length;

    // Only scroll if content exceeds visible area
    if (totalLines > visibleHeight && this.items.length > 0) {
      const currentScroll = this.getScroll();

      // Get line position for selected item
      const lineStart = this.itemLineStart[this.selected] ?? this.selected;
      const lineCount = this.itemLineCount[this.selected] ?? 1;
      const lineEnd = lineStart + lineCount - 1;

      // Scroll up if selection is above visible area
      if (lineStart < currentScroll) {
        this.setScroll(lineStart);
      }
      // Scroll down if selection is below visible area
      else if (lineEnd >= currentScroll + visibleHeight) {
        this.setScroll(lineEnd - visibleHeight + 1);
      }
    }

    this.emit('select item', this.items[this.selected], this.selected);
  }

  up(amount: number = 1): void {
    this.select(this.selected - amount);
  }

  down(amount: number = 1): void {
    this.select(this.selected + amount);
  }

  getSelected(): number {
    return this.selected;
  }

  getSelectedItem(): string | undefined {
    return this.items[this.selected];
  }

  setWrapItems(enabled: boolean): void {
    this.wrapItemsEnabled = enabled;
    this._updateContent();
  }

  clearItems(): void {
    this.items = [];
    this.selected = 0;
    this._updateContent();
  }

  addItem(item: string): void {
    this.items.push(item);
    this._updateContent();
  }

  removeItem(index: number): void {
    this.items.splice(index, 1);
    this.selected = Math.min(this.selected, this.items.length - 1);
    this._updateContent();
  }

  insertItem(index: number, item: string): void {
    this.items.splice(index, 0, item);
    this._updateContent();
  }

  private getItemWrapWidth(): number {
    const innerWidth = this.iwidth;
    if (innerWidth > 0) return innerWidth;

    // Try to calculate from position if element is laid out
    const pos = this._getCoords();
    if (pos) {
      const border = this.options.border ? 2 : 0;
      const padding = this.options.padding || 0;
      const padLeft = typeof padding === 'number' ? padding : (padding as any).left || 0;
      const padRight = typeof padding === 'number' ? padding : (padding as any).right || 0;
      const scrollbar = this.hasScrollbar() ? 1 : 0;
      const width = pos.xl - pos.xi - border - padLeft - padRight - scrollbar;
      if (width > 0) return width;
    }

    if (typeof this.options.width === 'number') {
      const padding = this.options.padding || 0;
      const padLeft = typeof padding === 'number' ? padding : (padding as any).left || 0;
      const padRight = typeof padding === 'number' ? padding : (padding as any).right || 0;
      const border = this.options.border ? 2 : 0;
      const scrollbar = this.hasScrollbar() ? 1 : 0;
      return Math.max(1, this.options.width - border - padLeft - padRight - scrollbar);
    }

    // Return a reasonable default instead of 1 (which would break wrapping)
    return 80;
  }

  private wrapAnsiText(text: string, width: number): string[] {
    const lines: string[] = [];
    if (width <= 0) return lines;

    const textLines = text.split(/\r?\n/);

    for (const line of textLines) {
      if (textWidth(line) <= width) {
        lines.push(line);
        continue;
      }

      let currentLine = '';
      let currentWidth = 0;
      let inAnsi = false;
      let ansiBuffer = '';
      let activeAnsi = '';

      for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];

        if (ch === '\x1b') {
          inAnsi = true;
          ansiBuffer = ch;
          continue;
        }

        if (inAnsi) {
          ansiBuffer += ch;
          if (ch === 'm') {
            inAnsi = false;
            currentLine += ansiBuffer;
            activeAnsi += ansiBuffer;
            ansiBuffer = '';
          }
          continue;
        }

        if (currentWidth >= width) {
          lines.push(currentLine);
          currentLine = activeAnsi + ch;
          currentWidth = 1;
        } else {
          currentLine += ch;
          currentWidth += 1;
        }
      }

      if (currentLine) {
        lines.push(currentLine);
      }
    }

    return lines;
  }
}
