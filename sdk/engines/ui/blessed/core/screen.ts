/**
 * Screen class - Root container and rendering manager
 */

import { Element } from './element';
import { Program } from './program';
import { cursor, screen as screenAnsi, attrs } from './colors';
import type { ScreenOptions, KeyEvent, MouseEvent } from './types';

export class Screen extends Element {
  private _width: number;
  private _height: number;
  declare focused: boolean;
  private _focused: Element | null = null;

  // Program instance for terminal control
  program: Program;

  // Output callback (deprecated - use program instead)
  private output: (data: string) => void;

  // Focus history
  private focusHistory: Element[] = [];
  private savedFocus: Element | null = null;

  // Rendering state
  // Buffer format: [y][x] = [attr, char]
  // attr is 27-bit packed: (flags << 18) | (fg << 9) | bg
  private buffer: [number, string][][] = [];
  private lastBuffer: [number, string][][] = [];
  private dirty: boolean = true;

  // Title
  private title: string = '';

  // Cursor state
  private cursorHidden: boolean = true;
  private cursorX: number = 0;
  private cursorY: number = 0;

  // Key handlers
  private keyHandlers: Map<string, ((ch: any, key: KeyEvent) => void)[]> = new Map();

  constructor(options: ScreenOptions & { output?: (data: string) => void } = {}) {
    // BBS Terminal Constraints:
    // - Width: Always 80 columns (classic BBS standard)
    // - Height: User-configurable via linesPerScreen (default 23, +2 for prompts = 25 total)
    const bbsWidth = 80;
    const bbsHeight = Math.min(options.height || 24, 25); // Max 25 rows total

    super({
      ...options,
      left: 0,
      top: 0,
      width: bbsWidth,
      height: bbsHeight,
    });

    this._width = bbsWidth;
    this._height = bbsHeight;
    this.screen = this;

    // Set output callback (for backward compatibility)
    this.output = options.output || ((data: string) => {
      if (typeof process !== 'undefined' && process.stdout) {
        process.stdout.write(data);
      } else {
        console.log(data);
      }
    });

    // Create Program instance
    this.program = new Program({
      output: this.output,
      terminal: options.terminal || 'ansi',
      buffer: true,
      title: options.title,
    });

    // Set dimensions on program
    this.program.cols = this._width;
    this.program.rows = this._height;

    // Initialize buffers
    this.clearBuffers();

    // Set title
    if (options.title) {
      this.setTitle(options.title);
    }

    // Hide cursor by default
    if (this.cursorHidden) {
      this.write(cursor.hide);
    }

    // Setup event routing from program to screen/elements
    this.setupKeyRouting();
    this.setupMouseRouting();
  }

  // ============================================================================
  // Key Event Routing
  // ============================================================================

  /**
   * Setup key event routing from Program to Screen
   */
  private setupKeyRouting(): void {
    // Listen to Program's keypress events
    this.program.on('keypress', (ch: any, key: KeyEvent) => {
      this._handleKey(ch, key);
    });
  }

  // ============================================================================
  // Mouse Event Routing
  // ============================================================================

  /**
   * Setup mouse event routing from Program to Elements
   */
  private setupMouseRouting(): void {
    // Listen to Program's mouse events
    this.program.on('mouse', (event: MouseEvent) => {
      this.handleMouseEvent(event);
    });
  }

  /**
   * Handle mouse event and route to appropriate elements
   */
  private handleMouseEvent(event: MouseEvent): void {
    // Emit on screen first
    this.emit('mouse', event);

    // Find all elements under the mouse cursor
    const elements = this.getElementsAt(event.x, event.y);

    // Track which elements were hovered last time
    const lastHovered = new Set<Element>();
    this.walk((el) => {
      if ((el as any)._hovered) {
        lastHovered.add(el);
      }
    });

    // Current hovered elements
    const currentHovered = new Set(elements);

    // Emit mouseleave for elements no longer hovered
    for (const el of lastHovered) {
      if (!currentHovered.has(el)) {
        el.onMouseLeave();
      }
    }

    // Route event to elements (from top to bottom in z-order)
    for (const element of elements.reverse()) {
      element.onMouse(event);

      // Stop propagation if event was handled
      if (event.action === 'mousedown' && element.options.clickable) {
        break;
      }
    }
  }

  /**
   * Get all elements at screen coordinates
   */
  private getElementsAt(x: number, y: number): Element[] {
    const elements: Element[] = [];

    this.walk((el) => {
      if (el.hasMouseOver(x, y) && !el.hidden && el.visible) {
        elements.push(el);
      }
    });

    return elements;
  }

  /**
   * Walk the element tree
   */
  private walk(callback: (el: Element) => void): void {
    const visit = (el: Element) => {
      callback(el);
      for (const child of el.children) {
        visit(child);
      }
    };

    for (const child of this.children) {
      visit(child);
    }
  }

  /**
   * Enable mouse support on screen
   */
  enableMouse(): void {
    this.program.enableMouse();
  }

  /**
   * Disable mouse support on screen
   */
  disableMouse(): void {
    this.program.disableMouse();
  }

  // ============================================================================
  // Output
  // ============================================================================

  private write(data: string): void {
    this.program.write(data);
  }

  // ============================================================================
  // BBS Terminal Dimensions
  // ============================================================================

  /**
   * Set screen dimensions based on user configuration
   * BBS Constraints:
   * - Width: Always 80 columns (classic BBS standard)
   * - Height: User-configurable (default 23 content + 2 prompts = 25 total max)
   *
   * @param linesPerScreen User's configured lines per screen (default 23)
   */
  setDimensions(linesPerScreen?: number): void {
    const bbsWidth = 80; // Always 80 columns
    const contentLines = Math.min(linesPerScreen || 23, 23); // Max 23 content lines
    const bbsHeight = contentLines + 2; // +2 for prompts/status

    this._width = bbsWidth;
    this._height = bbsHeight;
    this.program.cols = bbsWidth;
    this.program.rows = bbsHeight;

    // Reinitialize buffers with new dimensions
    this.clearBuffers();
    this.dirty = true;
  }

  /**
   * Get current screen dimensions
   */
  getDimensions(): { width: number; height: number } {
    return {
      width: this._width,
      height: this._height
    };
  }

  /**
   * Flush buffered output
   */
  flush(): void {
    this.program.flush();
  }

  // ============================================================================
  // Buffer Management
  // ============================================================================

  private clearBuffers(): void {
    this.buffer = [];
    this.lastBuffer = [];

    for (let y = 0; y < this.height; y++) {
      this.buffer[y] = [];
      this.lastBuffer[y] = [];

      for (let x = 0; x < this.width; x++) {
        // Default: no attributes (0x000), space character
        this.buffer[y][x] = [0x000, ' '];
        this.lastBuffer[y][x] = [0x000, ' '];
      }
    }
  }

  /**
   * Allocate (create) a new blank buffer
   */
  alloc(): [number, string][][] {
    const buf: [number, string][][] = [];
    for (let y = 0; y < this.height; y++) {
      buf[y] = [];
      for (let x = 0; x < this.width; x++) {
        buf[y][x] = [0x000, ' '];
      }
    }
    return buf;
  }

  /**
   * Reallocate buffers (called on resize)
   */
  realloc(): void {
    const obuf = this.buffer;
    const oline = this.lastBuffer;

    this.buffer = this.alloc();
    this.lastBuffer = this.alloc();

    // Copy old content
    for (let y = 0; y < Math.min(this.height, obuf.length); y++) {
      for (let x = 0; x < Math.min(this.width, obuf[y].length); x++) {
        this.buffer[y][x] = obuf[y][x];
        this.lastBuffer[y][x] = oline[y][x];
      }
    }
  }

  /**
   * Create a blank line
   */
  blankLine(ch: string = ' ', attr: number = 0x000): [number, string][] {
    const line: [number, string][] = [];
    for (let x = 0; x < this.width; x++) {
      line[x] = [attr, ch];
    }
    return line;
  }

  clearRegion(xi: number, xl: number, yi: number, yl: number): void {
    for (let y = yi; y < yl; y++) {
      if (y < 0 || y >= this.height) continue;

      for (let x = xi; x < xl; x++) {
        if (x < 0 || x >= this.width) continue;

        this.buffer[y][x] = [0x000, ' '];
      }
    }
  }

  fillRegion(attr: number, ch: string, xi: number, xl: number, yi: number, yl: number): void {
    // Check if background is transparent (0x1ff = no color)
    const bgColor = attr & 0x1ff;
    const isTransparentBg = bgColor === 0x1ff;

    for (let y = yi; y < yl; y++) {
      if (y < 0 || y >= this.height) continue;

      for (let x = xi; x < xl; x++) {
        if (x < 0 || x >= this.width) continue;

        if (isTransparentBg) {
          // Preserve existing background, only update fg and character
          const existingAttr = this.buffer[y][x][0];
          const existingBg = existingAttr & 0x1ff;
          // Combine new fg/flags with existing bg
          const newAttr = (attr & ~0x1ff) | existingBg;
          this.buffer[y][x] = [newAttr, ch];
        } else {
          this.buffer[y][x] = [attr, ch];
        }
      }
    }
  }

  // ============================================================================
  // Attribute Packing/Unpacking
  // ============================================================================

  /**
   * Pack attributes into 27-bit integer
   * Format: (flags << 18) | (fg << 9) | bg
   * Flags: bold(1), underline(2), blink(4), inverse(8), invisible(16)
   */
  private packAttr(flags: number, fg: number, bg: number): number {
    return (flags << 18) | (fg << 9) | bg;
  }

  /**
   * Unpack attributes from 27-bit integer
   */
  private unpackAttr(attr: number): { flags: number; fg: number; bg: number } {
    return {
      flags: (attr >> 18) & 0x1ff,
      fg: (attr >> 9) & 0x1ff,
      bg: attr & 0x1ff,
    };
  }

  /**
   * Convert attribute to ANSI string
   */
  private attrToAnsi(attr: number): string {
    const { flags, fg, bg } = this.unpackAttr(attr);
    let ansi = '';

    // Reset first
    ansi += '\x1b[0m';

    // Flags
    if (flags & 1) ansi += '\x1b[1m'; // bold
    if (flags & 2) ansi += '\x1b[4m'; // underline
    if (flags & 4) ansi += '\x1b[5m'; // blink
    if (flags & 8) ansi += '\x1b[7m'; // inverse
    if (flags & 16) ansi += '\x1b[8m'; // invisible

    // Colors (simple 0-7 for now)
    if (fg >= 0 && fg <= 7) {
      ansi += `\x1b[3${fg}m`;
    }
    if (bg >= 0 && bg <= 7) {
      ansi += `\x1b[4${bg}m`;
    }

    return ansi;
  }

  /**
   * Parse style object to attribute code
   */
  private styleToAttr(style: any): number {
    let flags = 0;
    let fgCode = 0x1ff; // Default: no color
    let bgCode = 0x1ff; // Default: no color

    if (style.bold) flags |= 1;
    if (style.underline) flags |= 2;
    if (style.blink) flags |= 4;
    if (style.inverse) flags |= 8;
    if (style.invisible) flags |= 16;

    if (style.fg !== undefined) {
      fgCode = this._colorToCode(style.fg);
    }
    if (style.bg !== undefined) {
      bgCode = this._colorToCode(style.bg);
    }

    return this.packAttr(flags, fgCode, bgCode);
  }

  // ============================================================================
  // Rendering
  // ============================================================================

  render(): void {
    if (this.destroyed) return;

    // Clear buffer
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        this.buffer[y][x] = [0x000, ' '];
      }
    }

    // Render all children recursively
    this._renderElement(this);

    // Diff and draw
    this._diff();

    // Mark as clean
    this.dirty = false;

    this.emit('render');
  }

  private _renderElement(element: Element): void {
    if (!element.visible || element.hidden || element.destroyed) {
      return;
    }

    // Calculate position
    const pos = element._getCoords();
    if (!pos) return;

    // Render element content
    this._renderContent(element, pos);

    // Render border
    if (element.options.border) {
      this._renderBorder(element, pos);
    }

    // Render children
    for (const child of element.children) {
      this._renderElement(child);
    }
  }

  private _renderContent(element: Element, pos: any): void {
    const lines = element.getLines();
    const padding = element.options.padding || 0;
    const hasBorder = element.options.border && (element.options.border as any)?.type !== 'none';
    const border = hasBorder ? 1 : 0;

    const padLeft = typeof padding === 'number' ? padding : (padding as any).left || 0;
    const padTop = typeof padding === 'number' ? padding : (padding as any).top || 0;
    const padBottom = typeof padding === 'number' ? padding : (padding as any).bottom || 0;
    const padRight = typeof padding === 'number' ? padding : (padding as any).right || 0;

    const startY = pos.yi + border + padTop;
    const startX = pos.xi + border + padLeft;
    const maxY = pos.yl - border - padBottom;
    const maxX = pos.xl - border - padRight;

    // BBS Constraint: Enforce 80-column width limit
    const bbsMaxX = Math.min(maxX, 80);

    // Get base style attribute code
    const style = element.options.style || {};
    const baseAttr = this.styleToAttr(style);

    // Fill background (for elements without borders, this is essential for visibility)
    const fillChar = (element.options as any).ch || ' ';
    for (let y = startY; y < maxY; y++) {
      if (y < 0 || y >= this.height) continue;
      for (let x = startX; x < bbsMaxX; x++) {
        if (x < 0 || x >= this.width) continue;
        this.buffer[y][x] = [baseAttr, fillChar];
      }
    }

    // Render lines
    for (let i = 0; i < lines.length; i++) {
      const y = startY + i;
      if (y < 0 || y >= this.height || y >= maxY) continue;

      const line = lines[i];

      // Parse line with ANSI codes and render character by character
      let currentAttr = baseAttr;
      let x = startX;
      let idx = 0;

      while (idx < line.length && x < bbsMaxX) {
        // Check for ANSI escape sequence
        if (line[idx] === '\x1b' && line[idx + 1] === '[') {
          // Parse ANSI sequence
          let end = idx + 2;
          while (end < line.length && !/[mK]/.test(line[end])) {
            end++;
          }
          if (end < line.length && line[end] === 'm') {
            // Extract SGR parameters
            const params = line.slice(idx + 2, end);
            currentAttr = this._parseAnsiToAttr(params, currentAttr, baseAttr);
            idx = end + 1;
            continue;
          }
          // Skip unknown sequences
          idx = end + 1;
          continue;
        }

        // Regular character - write to buffer
        if (x >= 0 && x < this.width) {
          this.buffer[y][x] = [currentAttr, line[idx]];
        }
        x++;
        idx++;
      }
    }
  }

  /**
   * Parse ANSI SGR parameters and update attribute
   */
  private _parseAnsiToAttr(params: string, currentAttr: number, baseAttr: number): number {
    const codes = params.split(';').map(n => parseInt(n, 10) || 0);
    let { flags, fg, bg } = this.unpackAttr(currentAttr);

    for (const code of codes) {
      if (code === 0) {
        // Reset - return to base attribute
        return baseAttr;
      } else if (code === 1) {
        flags |= 1; // bold
      } else if (code === 4) {
        flags |= 2; // underline
      } else if (code === 5) {
        flags |= 4; // blink
      } else if (code === 7) {
        flags |= 8; // inverse
      } else if (code === 8) {
        flags |= 16; // invisible
      } else if (code >= 30 && code <= 37) {
        fg = code - 30; // foreground color 0-7
      } else if (code >= 40 && code <= 47) {
        bg = code - 40; // background color 0-7
      } else if (code === 39) {
        fg = 0x1ff; // default fg
      } else if (code === 49) {
        bg = 0x1ff; // default bg
      }
    }

    return this.packAttr(flags, fg, bg);
  }

  private _renderBorder(element: Element, pos: any): void {
    const border = element.options.border;
    if (!border) return;

    const borderType = typeof border === 'string' ? border : (border as any)?.type || 'line';

    if (borderType === 'none') return;

    // Border characters
    const chars =
      borderType === 'line'
        ? { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│' }
        : { tl: ' ', tr: ' ', bl: ' ', br: ' ', h: ' ', v: ' ' };

    // Get border style attribute
    const style = (element.options.style as any)?.border || element.options.style || {};
    const attr = this.styleToAttr(style);

    // Top border
    if (pos.yi >= 0 && pos.yi < this.height) {
      for (let x = pos.xi; x < pos.xl; x++) {
        if (x < 0 || x >= this.width) continue;

        let ch = chars.h;
        if (x === pos.xi) ch = chars.tl;
        else if (x === pos.xl - 1) ch = chars.tr;

        this.buffer[pos.yi][x] = [attr, ch];
      }
    }

    // Bottom border
    if (pos.yl - 1 >= 0 && pos.yl - 1 < this.height) {
      for (let x = pos.xi; x < pos.xl; x++) {
        if (x < 0 || x >= this.width) continue;

        let ch = chars.h;
        if (x === pos.xi) ch = chars.bl;
        else if (x === pos.xl - 1) ch = chars.br;

        this.buffer[pos.yl - 1][x] = [attr, ch];
      }
    }

    // Left and right borders
    for (let y = pos.yi + 1; y < pos.yl - 1; y++) {
      if (y < 0 || y >= this.height) continue;

      if (pos.xi >= 0 && pos.xi < this.width) {
        this.buffer[y][pos.xi] = [attr, chars.v];
      }

      if (pos.xl - 1 >= 0 && pos.xl - 1 < this.width) {
        this.buffer[y][pos.xl - 1] = [attr, chars.v];
      }
    }

    // Label
    if (element.options.label) {
      const label = ` ${element.options.label} `;
      let x = pos.xi + 2;

      for (let i = 0; i < label.length && x < pos.xl - 1; i++, x++) {
        this.buffer[pos.yi][x] = [attr, label[i]];
      }
    }
  }

  private _diff(): void {
    let output = '';
    let lastX = -1;
    let lastY = -1;
    let lastAttr = -1;

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const [attr, ch] = this.buffer[y][x];
        const [lastAttrCell, lastCh] = this.lastBuffer[y][x];

        if (attr !== lastAttrCell || ch !== lastCh) {
          // Position cursor if needed
          if (x !== lastX + 1 || y !== lastY) {
            output += cursor.pos(x, y);
          }

          // Change attributes if needed
          if (attr !== lastAttr) {
            output += this.attrToAnsi(attr);
            lastAttr = attr;
          }

          // Write character
          output += ch;
          this.lastBuffer[y][x] = [attr, ch];

          lastX = x;
          lastY = y;
        }
      }
    }

    if (output.length > 0) {
      this.write(output);
    }
  }

  draw(start: number, end: number): void {
    this.render();
  }

  // ============================================================================
  // Line Manipulation (Scrolling Support)
  // ============================================================================

  /**
   * Insert n blank buffer lines at position, pushing existing lines down
   */
  private _insertBufferLine(n: number, y: number, top: number, bottom: number): void {
    if (n <= 0) return;

    // Shift lines down
    for (let i = bottom - 1; i >= y + n; i--) {
      this.buffer[i] = this.buffer[i - n];
      this.lastBuffer[i] = this.lastBuffer[i - n];
    }

    // Fill new lines with blanks
    for (let i = y; i < y + n; i++) {
      this.buffer[i] = this.blankLine();
      this.lastBuffer[i] = this.blankLine();
    }
  }

  /**
   * Delete n buffer lines at position, pulling lines up
   */
  private _deleteBufferLine(n: number, y: number, top: number, bottom: number): void {
    if (n <= 0) return;

    // Shift lines up
    for (let i = y; i < bottom - n; i++) {
      this.buffer[i] = this.buffer[i + n];
      this.lastBuffer[i] = this.lastBuffer[i + n];
    }

    // Fill bottom lines with blanks
    for (let i = bottom - n; i < bottom; i++) {
      this.buffer[i] = this.blankLine();
      this.lastBuffer[i] = this.blankLine();
    }
  }

  /**
   * Insert n lines at bottom of region
   */
  insertBottomLines(top: number, bottom: number, n: number = 1): void {
    this._insertBufferLine(n, bottom - n, top, bottom);
  }

  /**
   * Delete n lines from bottom of region
   */
  deleteBottomLines(top: number, bottom: number, n: number = 1): void {
    this._deleteBufferLine(n, bottom - n, top, bottom);
  }

  /**
   * Insert n lines at top of region
   */
  insertTopLines(top: number, bottom: number, n: number = 1): void {
    this._insertBufferLine(n, top, top, bottom);
  }

  /**
   * Delete n lines from top of region
   */
  deleteTopLines(top: number, bottom: number, n: number = 1): void {
    this._deleteBufferLine(n, top, top, bottom);
  }

  /**
   * Scroll screen up by n lines
   */
  scrollUp(n: number = 1): void {
    this.deleteTopLines(0, this.height, n);
  }

  /**
   * Scroll screen down by n lines
   */
  scrollDown(n: number = 1): void {
    this.insertTopLines(0, this.height, n);
  }

  /**
   * Insert n lines at y position within scroll region (buffer manipulation)
   * Neo-blessed compatible API - different from Element.insertLine which handles content
   */
  insertBufferLines(n: number, y: number, top: number, bottom: number): void {
    this._insertBufferLine(n, y, top, bottom);
  }

  /**
   * Delete n lines at y position within scroll region (buffer manipulation)
   * Neo-blessed compatible API - different from Element.deleteLine which handles content
   */
  deleteBufferLines(n: number, y: number, top: number, bottom: number): void {
    this._deleteBufferLine(n, y, top, bottom);
  }

  /**
   * Insert line at top of scroll region (buffer manipulation)
   */
  insertBufferTop(top: number, bottom: number): void {
    this.insertBufferLines(1, top, top, bottom);
  }

  /**
   * Insert line at bottom of scroll region (buffer manipulation)
   */
  insertBufferBottom(top: number, bottom: number): void {
    this.deleteBufferLines(1, top, top, bottom);
  }

  /**
   * Delete line at top of scroll region (buffer manipulation)
   */
  deleteBufferTop(top: number, bottom: number): void {
    this.deleteBufferLines(1, top, top, bottom);
  }

  /**
   * Delete line at bottom of scroll region (buffer manipulation)
   */
  deleteBufferBottom(top: number, bottom: number): void {
    this.clearRegion(0, this.width, bottom, bottom + 1);
  }

  /**
   * Set scroll region (uses terminal CSR)
   */
  setScrollRegion(top: number, bottom: number): void {
    this.program.csr(top, bottom);
  }

  /**
   * Reset scroll region
   */
  resetScrollRegion(): void {
    this.program.resetCursor();
  }

  // ============================================================================
  // Focus Management
  // ============================================================================

  focusPush(element: Element): void {
    this.focusHistory.push(element);
    element.focus();
  }

  focusPop(): Element | null {
    const element = this.focusHistory.pop();
    if (element) {
      element.blur();
    }
    const prev = this.focusHistory[this.focusHistory.length - 1];
    if (prev) {
      prev.focus();
    }
    return element || null;
  }

  saveFocus(): Element | null {
    this.savedFocus = this._focused;
    return this.savedFocus;
  }

  restoreFocus(): Element | null {
    if (this.savedFocus) {
      this.savedFocus.focus();
    }
    return this.savedFocus;
  }

  rewindFocus(): void {
    while (this.focusHistory.length > 0) {
      this.focusPop();
    }
  }

  /**
   * Get all focusable elements in tree order
   */
  private _getFocusable(element: Element = this): Element[] {
    const focusable: Element[] = [];

    const traverse = (el: Element) => {
      if (el.options.focusable) {
        focusable.push(el);
      }
      for (const child of el.children) {
        traverse(child);
      }
    };

    traverse(element);
    return focusable;
  }

  /**
   * Focus next focusable element
   */
  focusNext(): void {
    const focusable = this._getFocusable();
    if (focusable.length === 0) return;

    const current = this._focused;
    if (!current) {
      focusable[0].focus();
      return;
    }

    const index = focusable.indexOf(current);
    if (index === -1) {
      focusable[0].focus();
      return;
    }

    const next = focusable[(index + 1) % focusable.length];
    next.focus();
  }

  /**
   * Focus previous focusable element
   */
  focusPrevious(): void {
    const focusable = this._getFocusable();
    if (focusable.length === 0) return;

    const current = this._focused;
    if (!current) {
      focusable[focusable.length - 1].focus();
      return;
    }

    const index = focusable.indexOf(current);
    if (index === -1) {
      focusable[focusable.length - 1].focus();
      return;
    }

    const prev = focusable[(index - 1 + focusable.length) % focusable.length];
    prev.focus();
  }

  /**
   * Alias for focusPrevious
   */
  focusPrev(): void {
    this.focusPrevious();
  }

  /**
   * Focus element at offset from current
   */
  focusOffset(offset: number): void {
    const focusable = this._getFocusable();
    if (focusable.length === 0) return;

    const current = this._focused;
    if (!current) {
      const index = offset >= 0 ? 0 : focusable.length - 1;
      focusable[index].focus();
      return;
    }

    const index = focusable.indexOf(current);
    if (index === -1) {
      focusable[0].focus();
      return;
    }

    const newIndex = (index + offset) % focusable.length;
    const target = focusable[newIndex < 0 ? newIndex + focusable.length : newIndex];
    target.focus();
  }

  // ============================================================================
  // Key Handling
  // ============================================================================

  key(keys: string | string[], handler: (ch: any, key: KeyEvent) => void): void {
    const keyList = Array.isArray(keys) ? keys : [keys];

    for (const k of keyList) {
      if (!this.keyHandlers.has(k)) {
        this.keyHandlers.set(k, []);
      }
      this.keyHandlers.get(k)!.push(handler);
    }
  }

  onceKey(keys: string | string[], handler: (ch: any, key: KeyEvent) => void): void {
    const wrapper = (ch: any, key: KeyEvent) => {
      this.unkey(keys, wrapper);
      handler(ch, key);
    };
    this.key(keys, wrapper);
  }

  unkey(keys: string | string[], handler: (ch: any, key: KeyEvent) => void): void {
    const keyList = Array.isArray(keys) ? keys : [keys];

    for (const k of keyList) {
      const handlers = this.keyHandlers.get(k);
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index !== -1) {
          handlers.splice(index, 1);
        }
      }
    }
  }

  // Called by external input handler
  _handleKey(ch: any, key: KeyEvent): void {
    // Respect key locking
    if (this._lockKeys) return;

    // Try registered screen key handlers first
    const handlers = this.keyHandlers.get(key.full || key.name);
    let handled = false;
    if (handlers && handlers.length > 0) {
      for (const handler of handlers) {
        handler(ch, key);
      }
      handled = true;
    }

    // Default Tab/Shift-Tab for focus navigation (only if no user handler)
    if (!handled && key.name === 'tab') {
      if (key.shift) {
        this.focusPrevious();
      } else {
        this.focusNext();
      }
      this.render();
      return;
    }

    // Emit to focused element
    if (this._focused) {
      // Emit generic keypress event
      this._focused.emit('keypress', ch, key);
      // Emit specific key event (for element.key() handlers)
      const keyName = key.full || key.name;
      if (keyName) {
        this._focused.emit(`keypress ${keyName}`, ch, key);
      }
    }

    this.emit('keypress', ch, key);
  }

  // ============================================================================
  // Title
  // ============================================================================

  setTitle(title: string): void {
    this.title = title;
    this.write(`\x1b]0;${title}\x07`);
  }

  // ============================================================================
  // Cursor
  // ============================================================================

  showCursor(): void {
    if (this.cursorHidden) {
      this.cursorHidden = false;
      this.write(cursor.show);
    }
  }

  hideCursor(): void {
    if (!this.cursorHidden) {
      this.cursorHidden = true;
      this.write(cursor.hide);
    }
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  /**
   * Enter alternate buffer and initialize screen
   */
  enter(): void {
    this.program.alternateBuffer();
    this.program.hideCursor();
    this.clear();
    this.render();
    this.emit('enter');
  }

  /**
   * Leave alternate buffer and restore terminal
   */
  leave(): void {
    this.program.showCursor();
    this.program.normalBuffer();
    this.emit('leave');
  }

  // ============================================================================
  // Property Getters/Setters
  // ============================================================================

  /**
   * Get currently focused element
   */
  getFocused(): Element | null {
    return this._focused;
  }

  /**
   * Set focused element (called by Element.focus())
   */
  setFocused(element: Element | null): void {
    if (this._focused && this._focused !== element) {
      this._focused.focused = false;
      this._focused.emit('blur');
    }
    this._focused = element;
    if (element) {
      element.focused = true;
      element.emit('focus');
    }
    // Re-render to update focus border styling
    this.render();
  }

  /**
   * Get width (overrides Element.width for Screen)
   */
  get width(): number {
    return this._width;
  }

  /**
   * Set width
   */
  set width(value: number) {
    this._width = value;
    this.program.cols = value;
  }

  /**
   * Get height (overrides Element.height for Screen)
   */
  get height(): number {
    return this._height;
  }

  /**
   * Set height
   */
  set height(value: number) {
    this._height = value;
    this.program.rows = value;
  }

  /**
   * Get terminal type
   */
  get terminal(): string {
    return this.program.terminal;
  }

  /**
   * Get number of columns
   */
  get cols(): number {
    return this._width;
  }

  /**
   * Set number of columns
   */
  set cols(value: number) {
    this._width = value;
    this.program.cols = value;
    this.realloc();
  }

  /**
   * Get number of rows
   */
  get rows(): number {
    return this._height;
  }

  /**
   * Set number of rows
   */
  set rows(value: number) {
    this._height = value;
    this.program.rows = value;
    this.realloc();
  }

  // ============================================================================
  // Key Locking
  // ============================================================================

  private _lockKeys: boolean = false;

  /**
   * Lock key handlers (prevent input processing)
   */
  lockKeys(): void {
    this._lockKeys = true;
  }

  /**
   * Unlock key handlers
   */
  unlockKeys(): void {
    this._lockKeys = false;
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  private _colorToCode(color: any): number {
    if (typeof color === 'number') return color;

    const colors: Record<string, number> = {
      // Special - transparent means keep existing background
      transparent: 0x1ff,
      none: 0x1ff,
      default: 0x1ff,
      // Standard colors
      black: 0,
      red: 1,
      green: 2,
      yellow: 3,
      blue: 4,
      magenta: 5,
      cyan: 6,
      white: 7,
      // Bright colors
      gray: 8,
      grey: 8,
      lightblack: 8,
      lightred: 9,
      lightgreen: 10,
      lightyellow: 11,
      lightblue: 12,
      lightmagenta: 13,
      lightcyan: 14,
      lightwhite: 15,
    };

    const lowerColor = String(color).toLowerCase();
    return colors[lowerColor] !== undefined ? colors[lowerColor] : 7;
  }

  private _stripAnsi(str: string): string {
    return str.replace(/\x1b\[[0-9;]*m/g, '');
  }

  /**
   * Clear entire screen
   */
  clear(): void {
    this.clearBuffers();
    this.program.clear();
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  destroy(): void {
    if (this.destroyed) return;

    this.write(cursor.show);
    this.write(screenAnsi.clear);
    this.write(cursor.pos(0, 0));
    this.write(attrs.reset);
    this.flush();

    // Destroy program
    this.program.destroy();

    super.destroy();
  }

  /**
   * Handle input data (forward to program)
   */
  _handleData(data: string): void {
    this.program._handleData(data);
  }
}
