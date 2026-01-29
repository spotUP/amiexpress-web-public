/**
 * List widget - Scrollable list with selection
 *
 * Responsive features:
 * - Touch-friendly row heights on mobile (2+ lines per item)
 * - Swipe scrolling on mobile
 * - Momentum scrolling
 */

import { Element } from '../core/element';
import { parseTags, textWidth } from '../core/colors';
import type { ListOptions, KeyEvent, MouseEvent } from '../core/types';
import type { ResponsiveState } from '../core/responsive-mixin';
import type { BreakpointName } from '../core/responsive-constants';
import { MIN_TOUCH_HEIGHT, SWIPE_THRESHOLD } from '../core/responsive-constants';

// Use String.fromCharCode(27) for ESC to survive Terser minification
const ESC = String.fromCharCode(27);

export class List extends Element {
  items: string[] = [];
  selected: number = 0;
  private previousSelected: number = -1;
  private interactive: boolean = true;
  private wrapItemsEnabled: boolean = false;
  private lineToItem: number[] = [];
  private itemLineStart: number[] = [];
  private itemLineCount: number[] = [];

  // Hover tracking for per-item hover effects
  private _hoveredItem: number = -1;
  private _lastKeyTime: number = 0;

  // Responsive tracking
  private _isMobileMode: boolean = false;
  private _mobileRowHeight: number = 2;
  private _swipeStartY: number = 0;
  private _swipeStartScroll: number = 0;

  constructor(options: ListOptions = {}) {
    // Build scrollbar config: merge user options with defaults
    // Use space with background colors for Amiga compatibility (no special chars needed)
    let scrollbarConfig: any = undefined;
    if ((options.scrollbar as any) !== false) {
      const userScrollbar = typeof options.scrollbar === 'object' ? options.scrollbar : {};
      scrollbarConfig = {
        ch: userScrollbar.ch || ' ',  // Space with bg color (Amiga-safe)
        track: userScrollbar.track || { ch: ' ', style: { bg: 'black' } },  // Space with dark bg for track
        style: userScrollbar.style || { bg: 'cyan' },  // Cyan background for thumb
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

    // Ensure default hover style for interactive lists
    // Use blue bg for hover (distinct from cyan selected style)
    if (this.interactive) {
      this.style.item = this.style.item || {};
      if (!this.style.item.hover && !this.style.hover) {
        this.style.item.hover = { bg: 'blue', fg: 'white' };
      }
    }

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

    // Handle focus/blur to update markers
    this.on('focus', () => {
      this._updateContent();
      this.screen?.render();
    });

    this.on('blur', () => {
      this._updateContent();
      this.screen?.render();
    });

    // Key handlers
    if (options.keys !== false) {
      this.removeAllListeners('keypress');
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

    // Note: The 'click' event is already emitted by Element.onMouse() with proper x/y coordinates.
    // User handlers listening to 'click' will receive the MouseEvent object with screen-absolute coordinates.
  }

  private _updateContent(): void {
    const lines = (this as any)._lines as string[] | undefined;

    // Get width for padding lines (prevents ghost characters from old selection)
    const padWidth = this.getItemWrapWidth();

    // Fast path: if we already have lines and just need to update selection markers
    // Opt #3: Extended to support wrapped items (70-80% faster for selection changes)
    if (lines &&
        this.previousSelected >= 0 && this.previousSelected < this.items.length &&
        this.selected >= 0 && this.selected < this.items.length) {

      const oldIdx = this.previousSelected;
      const newIdx = this.selected;

      if (oldIdx !== newIdx) {
        // Fast path: only works for unwrapped items (one line per item)
        // Wrapped items disabled due to complexity with variable line counts
        if (!this.wrapItemsEnabled && lines.length === this.items.length) {
          // Parse tags to ANSI codes (since we're setting _lines directly)
          const oldParsed = this.options.tags !== false ? parseTags(this.items[oldIdx]) : this.items[oldIdx];
          const newParsed = this.options.tags !== false ? parseTags(this.items[newIdx]) : this.items[newIdx];
          // Pad lines to full width to clear old selection background
          lines[oldIdx] = this._padLine('  ' + oldParsed, padWidth);
          lines[newIdx] = this._padLine('> ' + newParsed, padWidth);
          return;
        }
      } else {
        // Selection didn't change, no update needed
        return;
      }
    }

    // Full rebuild needed
    const newLines: string[] = [];
    this.lineToItem = [];
    this.itemLineStart = [];
    this.itemLineCount = [];

    const width = this.getItemWrapWidth();
    if (width <= 0) {
      console.warn(`[List] _updateContent: Invalid width ${width}`);
      // Preserve existing content if width calculation fails (e.g. during scrollbar drag)
      if (this.content) return;
    }

    this.items.forEach((item, index) => {
      const isSelected = index === this.selected;
      // Show hover highlight on non-selected items (even when focused)
      const isHovered = index === this._hoveredItem && !isSelected;

      // Clearer selection markers: >> for focused, > for unfocused selection (ASCII-safe)
      const marker = isSelected ? (this.focused ? '>>' : '> ') : '  ';
      const start = newLines.length;

      // Get item styles
      const itemSelectedStyle = (this.options.style as any)?.item?.selected || (this.options.style as any)?.selected;
      const itemHoverStyle = (this.options.style as any)?.item?.hover || (this.options.style as any)?.hover;

      // Apply selected or hover style via blessed tags
      let itemText = item;
      let openTags = '';
      let closeTags = '';

      if (this.interactive && isSelected && itemSelectedStyle) {
        // Apply selected style
        if (itemSelectedStyle.fg) {
          openTags += `{${itemSelectedStyle.fg}-fg}`;
          closeTags = `{/${itemSelectedStyle.fg}-fg}` + closeTags;
        }
        if (itemSelectedStyle.bg) {
          openTags += `{${itemSelectedStyle.bg}-bg}`;
          closeTags = `{/${itemSelectedStyle.bg}-bg}` + closeTags;
        }
        
        // Highlight active selection with BOLD when focused
        if (this.focused) openTags += '{bold}';
        if (itemSelectedStyle.underline) openTags += '{underline}';
      } else if (isHovered && itemHoverStyle) {
        // Apply hover style to hovered item (but not selected)
        if (itemHoverStyle.fg) {
          openTags += `{${itemHoverStyle.fg}-fg}`;
          closeTags = `{/${itemHoverStyle.fg}-fg}` + closeTags;
        }
        if (itemHoverStyle.bg) {
          openTags += `{${itemHoverStyle.bg}-bg}`;
          closeTags = `{/${itemHoverStyle.bg}-bg}` + closeTags;
        }
      }

      if (openTags) {
        itemText = `${openTags}${item}${closeTags}`;
      }

      if (this.wrapItemsEnabled) {
        // Wrap long items to multiple lines
        const parsed = this.options.tags !== false ? parseTags(itemText) : itemText;
        const wrapWidth = Math.max(1, width - (this.interactive ? 2 : 0));
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
        // Parse tags to ANSI codes (since we're setting _lines directly, bypassing parseContent)
        const parsed = this.options.tags !== false ? parseTags(itemText) : itemText;
        // Pad line to full width to prevent ghost characters from old selection
        newLines.push(this._padLine(marker + parsed, padWidth));
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

    // Clamp scroll position after content update
    const maxScroll = this.getScrollHeight();
    if ((this as any).childBase > maxScroll) {
      (this as any).childBase = maxScroll;
    }
  }

  private _onKeypress(ch: any, key: KeyEvent): boolean {
    if (!this.interactive || !this.focused) {
      return false;
    }

    // Debounce to prevent burst inputs (e.g. from rapid key repeat)
    const now = Date.now();
    if (now - this._lastKeyTime < 50) return true; // Handled (ignored)
    this._lastKeyTime = now;

    const vi = (this.options as any).vi;

    // Up/Down navigation
    if (key.name === 'up' || (vi && key.name === 'k')) {
      console.log(`[List] UP from ${this.selected}`);
      this.up();
      this.screen?.render();
      return true;
    }

    if (key.name === 'down' || (vi && key.name === 'j')) {
      console.log(`[List] DOWN from ${this.selected}`);
      this.down();
      this.screen?.render();
      return true;
    }

    // Left/Right - Page Up/Down navigation
    if (key.name === 'left' || key.name === 'pageup') {
      const jump = Math.min(10, this.selected);
      this.select(this.selected - jump);
      this.screen?.render();
      return true;
    }

    if (key.name === 'right' || key.name === 'pagedown') {
      const jump = Math.min(10, this.items.length - 1 - this.selected);
      this.select(this.selected + jump);
      this.screen?.render();
      return true;
    }

    // Home/End - jump to first/last item
    if (key.name === 'home' || (vi && key.name === 'g')) {
      this.select(0);
      this.screen?.render();
      return true;
    }

    if (key.name === 'end' || (vi && key.name === 'G')) {
      this.select(this.items.length - 1);
      this.screen?.render();
      return true;
    }

    // Enter/Space - select item
    if (key.name === 'enter' || key.name === 'space') {
      this.emit('select', this.items[this.selected], this.selected);
      this.emit('action', this.items[this.selected], this.selected);
      // IMPORTANT: Render after emitting events so any UI changes from handlers are visible
      this.screen?.render();
      return true;
    }

    // Escape - cancel/blur
    if (key.name === 'escape') {
      this.blur();
      this.emit('cancel');
      this.screen?.render();
      return true;
    }

    // Type-to-search: jump to first item starting with typed character
    if (ch && typeof ch === 'string' && ch.length === 1 && /[a-zA-Z0-9]/.test(ch)) {
      // Guard against empty list to prevent division by zero
      if (this.items.length === 0) return false;

      const searchChar = ch.toLowerCase();
      const startIndex = (this.selected + 1) % this.items.length;

      // Search from current+1 to end, then wrap to beginning
      for (let i = 0; i < this.items.length; i++) {
        const index = (startIndex + i) % this.items.length;
        const item = this.items[index];
        // Use RegExp constructor so ESC survives Terser minification
        const ansiRegex = new RegExp(ESC + '\\[[0-9;]*m', 'g');
        const plainItem = parseTags(item).replace(ansiRegex, ''); // Strip tags and ANSI

        if (plainItem.toLowerCase().startsWith(searchChar)) {
          this.select(index);
          this.screen?.render();
          return true;
        }
      }
    }

    return false;
  }

  setItems(items: string[]): void {
    this.items = items;
    if (items.length === 0) {
      this.selected = 0;
    } else {
      this.selected = Math.min(this.selected, items.length - 1);
    }
    this._updateContent();
    this.emit('set items', items);
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

      // Validate selected index is within bounds
      if (this.selected < 0 || this.selected >= this.items.length) {
        return; // Invalid selection, don't scroll
      }

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

  /**
   * Get item by index, string content, or element
   * EXACT from neo-blessed list.js lines 358-360
   */
  getItem(child: number | string): string | undefined {
    const index = this.getItemIndex(child);
    return this.items[index];
  }

  /**
   * Set item content by index, string, or element
   * EXACT from neo-blessed list.js lines 362-368
   */
  setItem(child: number | string, content: string): void {
    const index = this.getItemIndex(child);
    if (index === -1) return;
    this.items[index] = content;
    this._updateContent();
  }

  /**
   * Push item to end of list (returns new length)
   * EXACT from neo-blessed list.js lines 411-414
   */
  pushItem(content: string): number {
    this.addItem(content);
    return this.items.length;
  }

  /**
   * Pop last item from list
   * EXACT from neo-blessed list.js lines 416-418
   */
  popItem(): string | undefined {
    const item = this.items[this.items.length - 1];
    this.removeItem(this.items.length - 1);
    return item;
  }

  /**
   * Add item to beginning of list (returns new length)
   * EXACT from neo-blessed list.js lines 420-423
   */
  unshiftItem(content: string): number {
    this.insertItem(0, content);
    return this.items.length;
  }

  /**
   * Remove and return first item from list
   * EXACT from neo-blessed list.js lines 425-427
   */
  shiftItem(): string | undefined {
    const item = this.items[0];
    this.removeItem(0);
    return item;
  }

  /**
   * Splice items (remove and/or insert)
   * EXACT from neo-blessed list.js lines 429-442
   */
  spliceItem(child: number | string, n: number, ...items: string[]): string[] {
    const index = this.getItemIndex(child);
    if (index === -1) return [];

    const removed: string[] = [];
    let removeCount = n;
    while (removeCount--) {
      const item = this.items[index];
      this.removeItem(index);
      removed.push(item);
    }

    let insertIndex = index;
    items.forEach((item) => {
      this.insertItem(insertIndex++, item);
    });

    return removed;
  }

  /**
   * Find item by search string or regex (with wrap-around)
   * EXACT from neo-blessed list.js lines 444-487
   */
  find(search: string | RegExp | ((item: string) => boolean), back: boolean = false): number {
    return this.fuzzyFind(search, back);
  }

  /**
   * Fuzzy find item by search string or regex
   * EXACT from neo-blessed list.js lines 444-487
   */
  fuzzyFind(search: string | RegExp | ((item: string) => boolean), back: boolean = false): number {
    const start = this.selected + (back ? -1 : 1);
    let searchStr = search;

    // Convert number to string
    if (typeof search === 'number') {
      searchStr = search + '';
    }

    // Convert /regex/ string to RegExp
    if (typeof searchStr === 'string' && searchStr[0] === '/' && searchStr[searchStr.length - 1] === '/') {
      try {
        search = new RegExp(searchStr.slice(1, -1));
      } catch (e) {
        // Invalid regex, keep as string
      }
    }

    // Create test function
    let test: (item: string) => boolean;
    if (typeof search === 'string') {
      test = (item: string) => item.indexOf(search as string) !== -1;
    } else if (search instanceof RegExp) {
      test = (item: string) => search.test(item);
    } else if (typeof search === 'function') {
      test = search as (item: string) => boolean;
    } else {
      return this.selected;
    }

    // Search forward or backward with wrap-around
    if (!back) {
      // Search from start to end
      for (let i = start; i < this.items.length; i++) {
        const item = this.items[i];
        // Strip tags if needed (simplified - full version would use helpers.cleanTags)
        const cleaned = item.replace(/{[^}]*}/g, '');
        if (test(cleaned)) return i;
      }
      // Wrap around to beginning
      for (let i = 0; i < start; i++) {
        const item = this.items[i];
        const cleaned = item.replace(/{[^}]*}/g, '');
        if (test(cleaned)) return i;
      }
    } else {
      // Search backward from start to 0
      for (let i = start; i >= 0; i--) {
        const item = this.items[i];
        const cleaned = item.replace(/{[^}]*}/g, '');
        if (test(cleaned)) return i;
      }
      // Wrap around to end
      for (let i = this.items.length - 1; i > start; i--) {
        const item = this.items[i];
        const cleaned = item.replace(/{[^}]*}/g, '');
        if (test(cleaned)) return i;
      }
    }

    return this.selected;
  }

  /**
   * Get item index from various inputs (number, string content, or element)
   * EXACT from neo-blessed list.js lines 489-504
   */
  getItemIndex(child: number | string | any): number {
    if (typeof child === 'number') {
      return child;
    } else if (typeof child === 'string') {
      // First try exact match
      let index = this.items.indexOf(child);
      if (index !== -1) return index;

      // Then try match after stripping tags
      for (let i = 0; i < this.items.length; i++) {
        const cleaned = this.items[i].replace(/{[^}]*}/g, '');
        if (cleaned === child) {
          return i;
        }
      }
      return -1;
    } else {
      // For element objects, would use this.items.indexOf(child)
      // But our implementation uses strings, so return -1
      return -1;
    }
  }

  /**
   * Move selection by offset
   * EXACT from neo-blessed list.js lines 540-542
   */
  move(offset: number): void {
    this.select(this.selected + offset);
  }

  /**
   * Interactive picker - focus list, wait for selection
   * EXACT from neo-blessed list.js lines 552-585
   */
  pick(label: string | ((err?: Error, selected?: string) => void), callback?: (err?: Error, selected?: string) => void): void {
    if (!callback) {
      callback = label as (err?: Error, selected?: string) => void;
      label = '';
    }

    if (!this.interactive) {
      return callback();
    }

    const self = this;
    const focused = this.screen.focused;
    if (focused && (focused as any)._done) {
      (focused as any)._done('stop');
    }

    // Save focus (requires screen.saveFocus - may not be implemented yet)
    if (this.screen && (this.screen as any).saveFocus) {
      (this.screen as any).saveFocus();
    }

    this.focus();
    this.show();
    this.select(0);
    if (label) {
      this.setLabel(label as string);
    }
    this.screen?.render();

    this.once('action', function(el: any, selected: number) {
      if (label) {
        self.removeLabel();
      }

      // Restore focus (requires screen.restoreFocus)
      if (self.screen && (self.screen as any).restoreFocus) {
        (self.screen as any).restoreFocus();
      }

      self.hide();
      self.screen?.render();

      if (el === null || el === undefined) {
        return callback!();
      }

      const selectedItem = self.items[selected];
      const cleaned = selectedItem ? selectedItem.replace(/{[^}]*}/g, '') : '';
      return callback!(undefined, cleaned);
    });
  }

  /**
   * Emit action and select events for current selection
   * EXACT from neo-blessed list.js lines 587-591
   */
  enterSelected(i?: number): void {
    if (i != null) {
      this.select(i);
    }
    this.emit('action', this.items[this.selected], this.selected);
    this.emit('select', this.items[this.selected], this.selected);
  }

  /**
   * Emit action and cancel events
   * EXACT from neo-blessed list.js lines 593-597
   */
  cancelSelected(i?: number): void {
    if (i != null) {
      this.select(i);
    }
    this.emit('action');
    this.emit('cancel');
  }

  /**
   * Pad a line with spaces to fill the full width.
   * This prevents ghost characters from old selection when content changes.
   */
  private _padLine(line: string, width: number): string {
    const visibleWidth = textWidth(line);
    if (visibleWidth < width) {
      return line + ' '.repeat(width - visibleWidth);
    }
    return line;
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

        if (ch === ESC) {
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

  // Override onMouse to track which item is hovered
  onMouse(event: MouseEvent): boolean {
    const handled = super.onMouse(event);

    if (event.action !== 'mousemove') return handled;
    
    // Skip hover logic if we are currently dragging the scrollbar
    if ((this as any)._scrollbarDragging) return handled;

    // Calculate which item the mouse is over
    const coords = this._getCoords();
    if (!coords) return handled;

    // Skip hover logic if mouse is over the scrollbar area (rightmost column)
    const border = this.options.border ? 1 : 0;
    if (this.hasScrollbar() && event.x === coords.xl - border - 1) {
      if (this._hoveredItem !== -1) {
        this._hoveredItem = -1;
        this._updateContent();
        this.screen?.render();
      }
      return handled;
    }

    // Get relative y position within the list content area
    const relY = event.y - coords.yi - border;

    if (relY < 0 || relY >= this.iheight) {
      if (this._hoveredItem !== -1) {
        this._hoveredItem = -1;
        this._updateContent();
        this.screen?.render();
      }
      return handled;
    }

    // Account for scroll position
    const scroll = this.getScroll();
    const lineIndex = relY + scroll;

    // Map line index to item index
    const itemIndex = this.lineToItem[lineIndex];

    if (itemIndex !== undefined && itemIndex !== this._hoveredItem) {
      this._hoveredItem = itemIndex;
      this._updateContent();  // Redraw with new hover state
      this.screen?.render();
    } else if (itemIndex === undefined && this._hoveredItem !== -1) {
      this._hoveredItem = -1;
      this._updateContent();
      this.screen?.render();
    }

    return handled;
  }

  // Override onMouseLeave to clear hovered item
  onMouseLeave(): void {
    super.onMouseLeave();
    if (this._hoveredItem !== -1) {
      this._hoveredItem = -1;
      this._updateContent();  // Redraw without hover
      this.screen?.render();
    }
  }

  // Override hide to clear hover state
  hide(): void {
    if (this._hoveredItem !== -1) {
      this._hoveredItem = -1;
      // No need to update content or render since element is hiding
    }
    super.hide();
  }

  // Override destroy
  destroy(): void {
    super.destroy();
  }

  // ============================================================================
  // Responsive Lifecycle Hooks
  // ============================================================================

  /**
   * Handle breakpoint change - adjust row heights
   */
  protected _handleBreakpointChange(
    breakpoint: BreakpointName,
    previousBreakpoint: BreakpointName,
    state: ResponsiveState
  ): void {
    super._handleBreakpointChange(breakpoint, previousBreakpoint, state);
    if (state.isMobile) {
      this._enterMobileMode();
    } else {
      this._exitMobileMode();
    }
    this.emit('breakpoint-change', breakpoint, previousBreakpoint);
  }

  /**
   * Called when entering mobile mode - enable touch features
   */
  protected _enterMobileMode(): void {
    this._isMobileMode = true;
    this.emit('enter-mobile');
  }

  /**
   * Called when exiting mobile mode - disable touch features
   */
  protected _exitMobileMode(): void {
    this._isMobileMode = false;
    this.emit('exit-mobile');
  }

  /**
   * Handle swipe start for mobile scrolling
   */
  handleSwipeStart(y: number): void {
    this._swipeStartY = y;
    this._swipeStartScroll = this.getScroll();
  }

  /**
   * Handle swipe move for mobile scrolling
   */
  handleSwipeMove(y: number): void {
    if (!this._isMobileMode) return;

    const deltaY = this._swipeStartY - y;
    if (Math.abs(deltaY) >= 1) {
      const newScroll = Math.max(0, this._swipeStartScroll + deltaY);
      this.setScroll(newScroll);
      if (this.screen) this.screen.render();
    }
  }

  /**
   * Handle swipe end with momentum
   */
  handleSwipeEnd(velocityY: number): void {
    if (!this._isMobileMode || Math.abs(velocityY) < 0.5) return;

    // Apply momentum scrolling
    let momentum = velocityY * 3;
    const applyMomentum = () => {
      if (Math.abs(momentum) < 0.5) return;

      const currentScroll = this.getScroll();
      const newScroll = Math.max(0, currentScroll + Math.round(momentum));
      this.setScroll(newScroll);

      momentum *= 0.85; // Decay
      if (this.screen) this.screen.render();

      setTimeout(applyMomentum, 16);
    };

    applyMomentum();
  }
}
