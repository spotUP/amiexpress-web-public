/**
 * ncurses Compatibility Layer - WINDOW Type
 *
 * This module implements the ncurses WINDOW type and window-related functions.
 * Windows are rectangular regions of the screen that can be independently
 * managed and refreshed.
 *
 * Key concepts:
 * - stdscr: The default full-screen window
 * - subwin: A window sharing parent's buffer
 * - derwin: A derived window with relative positioning
 * - pad: A window larger than the physical screen (not yet implemented)
 */

import { attr_t, chtype, DEFAULT_ATTR, makeChtype, extractChar, attrToAnsi } from './attributes';
import { A_NORMAL, OK, ERR, COLS, LINES, A_CHARTEXT } from './constants';
import { ACS_ULCORNER, ACS_URCORNER, ACS_LLCORNER, ACS_LRCORNER, ACS_HLINE, ACS_VLINE } from './acs';
import { pair_fg, pair_bg, COLOR_PAIR, PAIR_NUMBER } from './colors';

// ============================================================================
// WINDOW Type
// ============================================================================

/**
 * ncurses WINDOW structure
 * Represents a rectangular region of the screen with its own buffer
 */
export class Window {
  /** Window height (rows) */
  readonly height: number;

  /** Window width (columns) */
  readonly width: number;

  /** Window Y position (row, 0-indexed) */
  readonly beginY: number;

  /** Window X position (column, 0-indexed) */
  readonly beginX: number;

  /** Current cursor Y position within window */
  cursorY: number = 0;

  /** Current cursor X position within window */
  cursorX: number = 0;

  /** Current attribute for output */
  currentAttr: attr_t = DEFAULT_ATTR;

  /** Character buffer: [y][x] = chtype (char + attr) */
  buffer: chtype[][];

  /** Dirty flags for each line (optimization) */
  dirty: boolean[];

  /** Is this window a subwindow? */
  readonly isSubwin: boolean;

  /** Parent window (for subwindows) */
  parent?: Window;

  /** Scroll region top */
  scrollTop: number = 0;

  /** Scroll region bottom */
  scrollBottom: number;

  /** Is scrolling enabled? */
  scrollOk: boolean = false;

  /** Is keypad mode enabled? */
  keypadEnabled: boolean = false;

  /** Is nodelay mode enabled? */
  nodelayMode: boolean = false;

  /** Input timeout in milliseconds (-1 = blocking) */
  inputTimeout: number = -1;

  /** Leave cursor after update? */
  leaveOk: boolean = false;

  /** Should window be cleared on next refresh? */
  clearOk: boolean = false;

  /** Immediate mode (no buffering)? */
  immediateOk: boolean = false;

  /** Background character and attribute */
  bkgd: chtype;

  /**
   * Create a new window
   *
   * @param height - Number of rows
   * @param width - Number of columns
   * @param beginY - Starting row (0-indexed)
   * @param beginX - Starting column (0-indexed)
   * @param isSubwin - Is this a subwindow?
   * @param parent - Parent window for subwindows
   */
  constructor(
    height: number,
    width: number,
    beginY: number = 0,
    beginX: number = 0,
    isSubwin: boolean = false,
    parent?: Window
  ) {
    this.height = height;
    this.width = width;
    this.beginY = beginY;
    this.beginX = beginX;
    this.isSubwin = isSubwin;
    this.parent = parent;
    this.scrollBottom = height - 1;
    this.bkgd = makeChtype(' ', DEFAULT_ATTR);

    // Initialize buffer
    this.buffer = [];
    this.dirty = [];
    for (let y = 0; y < height; y++) {
      this.buffer[y] = [];
      this.dirty[y] = true;
      for (let x = 0; x < width; x++) {
        this.buffer[y][x] = this.bkgd;
      }
    }
  }

  // ==========================================================================
  // Cursor Movement
  // ==========================================================================

  /**
   * Move cursor to position within window
   */
  move(y: number, x: number): number {
    if (y < 0 || y >= this.height || x < 0 || x >= this.width) {
      return ERR;
    }
    this.cursorY = y;
    this.cursorX = x;
    return OK;
  }

  /**
   * Get current cursor Y position
   */
  getcury(): number {
    return this.cursorY;
  }

  /**
   * Get current cursor X position
   */
  getcurx(): number {
    return this.cursorX;
  }

  /**
   * Get window height
   */
  getmaxy(): number {
    return this.height;
  }

  /**
   * Get window width
   */
  getmaxx(): number {
    return this.width;
  }

  /**
   * Get window begin Y
   */
  getbegy(): number {
    return this.beginY;
  }

  /**
   * Get window begin X
   */
  getbegx(): number {
    return this.beginX;
  }

  /**
   * Get parent Y (for subwindows)
   */
  getpary(): number {
    return this.parent ? this.beginY - this.parent.beginY : -1;
  }

  /**
   * Get parent X (for subwindows)
   */
  getparx(): number {
    return this.parent ? this.beginX - this.parent.beginX : -1;
  }

  // ==========================================================================
  // Character Output
  // ==========================================================================

  /**
   * Add character at current position with current attributes
   */
  addch(ch: chtype | string): number {
    if (this.cursorY < 0 || this.cursorY >= this.height) {
      return ERR;
    }
    if (this.cursorX < 0 || this.cursorX >= this.width) {
      return ERR;
    }

    const chCode = typeof ch === 'string' ? ch.charCodeAt(0) : ch & A_CHARTEXT;
    const chChar = String.fromCharCode(chCode);

    // Handle control characters (ncurses behavior)
    if (chChar === '\n') {
      this.cursorX = 0;
      this.cursorY++;
      if (this.cursorY >= this.height) {
        if (this.scrollOk) {
          this.scroll(1);
          this.cursorY = this.height - 1;
        } else {
          this.cursorY = this.height - 1;
          this.cursorX = this.width - 1;
        }
      }
      return OK;
    }
    if (chChar === '\r') {
      this.cursorX = 0;
      return OK;
    }
    if (chChar === '\b') {
      this.cursorX = Math.max(0, this.cursorX - 1);
      return OK;
    }
    if (chChar === '\t') {
      const nextTabStop = (Math.floor(this.cursorX / 8) + 1) * 8;
      while (this.cursorX < nextTabStop) {
        if (this.addch(' ') === ERR) {
          return ERR;
        }
      }
      return OK;
    }

    // Handle string input
    let chtype_val: chtype;
    if (typeof ch === 'string') {
      chtype_val = makeChtype(ch, this.currentAttr);
    } else {
      // If ch already has attributes, use them; otherwise apply current
      if ((ch & 0xffffff00) === 0) {
        chtype_val = makeChtype(ch, this.currentAttr);
      } else {
        chtype_val = ch;
      }
    }

    this.buffer[this.cursorY][this.cursorX] = chtype_val;
    this.dirty[this.cursorY] = true;

    // Advance cursor
    this.cursorX++;
    if (this.cursorX >= this.width) {
      this.cursorX = 0;
      this.cursorY++;
      if (this.cursorY >= this.height) {
        if (this.scrollOk) {
          this.scroll(1);
          this.cursorY = this.height - 1;
        } else {
          this.cursorY = this.height - 1;
          this.cursorX = this.width - 1;
        }
      }
    }

    return OK;
  }

  /**
   * Add string at current position
   */
  addstr(str: string): number {
    for (const ch of str) {
      if (this.addch(ch) === ERR) {
        return ERR;
      }
    }
    return OK;
  }

  /**
   * Add n characters from string
   */
  addnstr(str: string, n: number): number {
    const chars = str.slice(0, n);
    return this.addstr(chars);
  }

  /**
   * Move and add character
   */
  mvaddch(y: number, x: number, ch: chtype | string): number {
    if (this.move(y, x) === ERR) {
      return ERR;
    }
    return this.addch(ch);
  }

  /**
   * Move and add string
   */
  mvaddstr(y: number, x: number, str: string): number {
    if (this.move(y, x) === ERR) {
      return ERR;
    }
    return this.addstr(str);
  }

  /**
   * Move and add n characters
   */
  mvaddnstr(y: number, x: number, str: string, n: number): number {
    if (this.move(y, x) === ERR) {
      return ERR;
    }
    return this.addnstr(str, n);
  }

  /**
   * Printf-style output
   */
  printw(format: string, ...args: unknown[]): number {
    // Simple printf implementation
    let result = format;
    let argIndex = 0;

    result = result.replace(/%([diouxXeEfFgGaAcsSpn%])/g, (match, specifier) => {
      if (specifier === '%') return '%';
      if (argIndex >= args.length) return match;

      const arg = args[argIndex++];

      switch (specifier) {
        case 'd':
        case 'i':
          return String(Math.floor(Number(arg)));
        case 'o':
          return Math.floor(Number(arg)).toString(8);
        case 'u':
          return String(Math.abs(Math.floor(Number(arg))));
        case 'x':
          return Math.floor(Number(arg)).toString(16);
        case 'X':
          return Math.floor(Number(arg)).toString(16).toUpperCase();
        case 'e':
          return Number(arg).toExponential();
        case 'E':
          return Number(arg).toExponential().toUpperCase();
        case 'f':
        case 'F':
          return Number(arg).toFixed(6);
        case 'g':
        case 'G':
          return String(Number(arg));
        case 'c':
          return typeof arg === 'number' ? String.fromCharCode(arg) : String(arg)[0] || '';
        case 's':
          return String(arg);
        case 'p':
          return `0x${Number(arg).toString(16)}`;
        default:
          return String(arg);
      }
    });

    return this.addstr(result);
  }

  /**
   * Move and printf
   */
  mvprintw(y: number, x: number, format: string, ...args: unknown[]): number {
    if (this.move(y, x) === ERR) {
      return ERR;
    }
    return this.printw(format, ...args);
  }

  // ==========================================================================
  // Attributes
  // ==========================================================================

  /**
   * Turn on attributes
   */
  attron(attrs: attr_t): number {
    this.currentAttr |= attrs;
    return OK;
  }

  /**
   * Turn off attributes
   */
  attroff(attrs: attr_t): number {
    this.currentAttr &= ~attrs;
    return OK;
  }

  /**
   * Set attributes (replace)
   */
  attrset(attrs: attr_t): number {
    this.currentAttr = attrs;
    return OK;
  }

  /**
   * Get current attributes
   */
  attr_get(): attr_t {
    return this.currentAttr;
  }

  /**
   * Set background character and attribute
   */
  bkgdset(ch: chtype): void {
    this.bkgd = ch;
  }

  /**
   * Set background and apply to window
   */
  bkgd_set(ch: chtype): number {
    const oldBkgd = this.bkgd;
    this.bkgd = ch;

    // Apply to all cells with old background
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.buffer[y][x] === oldBkgd) {
          this.buffer[y][x] = ch;
        }
      }
      this.dirty[y] = true;
    }

    return OK;
  }

  /**
   * Get background
   */
  getbkgd(): chtype {
    return this.bkgd;
  }

  // ==========================================================================
  // Screen Clearing
  // ==========================================================================

  /**
   * Clear window (fill with background)
   */
  clear(): number {
    return this.erase();
  }

  /**
   * Erase window (fill with background, no refresh)
   */
  erase(): number {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        this.buffer[y][x] = this.bkgd;
      }
      this.dirty[y] = true;
    }
    this.cursorY = 0;
    this.cursorX = 0;
    return OK;
  }

  /**
   * Clear to end of line
   */
  clrtoeol(): number {
    for (let x = this.cursorX; x < this.width; x++) {
      this.buffer[this.cursorY][x] = this.bkgd;
    }
    this.dirty[this.cursorY] = true;
    return OK;
  }

  /**
   * Clear to bottom of window
   */
  clrtobot(): number {
    // Clear rest of current line
    this.clrtoeol();

    // Clear remaining lines
    for (let y = this.cursorY + 1; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        this.buffer[y][x] = this.bkgd;
      }
      this.dirty[y] = true;
    }

    return OK;
  }

  // ==========================================================================
  // Line Drawing
  // ==========================================================================

  /**
   * Draw a horizontal line
   */
  hline(ch: chtype | string, n: number): number {
    const lineChar = typeof ch === 'string' ? ch : extractChar(ch);
    const startX = this.cursorX;

    for (let i = 0; i < n && this.cursorX < this.width; i++) {
      this.addch(lineChar);
    }

    this.cursorX = startX; // Restore cursor
    return OK;
  }

  /**
   * Draw a vertical line
   */
  vline(ch: chtype | string, n: number): number {
    const lineChar = typeof ch === 'string' ? ch : extractChar(ch);
    const startY = this.cursorY;
    const startX = this.cursorX;

    for (let i = 0; i < n && this.cursorY < this.height; i++) {
      this.mvaddch(startY + i, startX, lineChar);
    }

    this.cursorY = startY; // Restore cursor
    this.cursorX = startX;
    return OK;
  }

  /**
   * Move and draw horizontal line
   */
  mvhline(y: number, x: number, ch: chtype | string, n: number): number {
    if (this.move(y, x) === ERR) return ERR;
    return this.hline(ch, n);
  }

  /**
   * Move and draw vertical line
   */
  mvvline(y: number, x: number, ch: chtype | string, n: number): number {
    if (this.move(y, x) === ERR) return ERR;
    return this.vline(ch, n);
  }

  // ==========================================================================
  // Box Drawing
  // ==========================================================================

  /**
   * Draw a box around the window
   *
   * @param verch - Vertical character (0 = default)
   * @param horch - Horizontal character (0 = default)
   */
  box(verch: chtype | string = 0, horch: chtype | string = 0): number {
    const v = verch === 0 ? ACS_VLINE : typeof verch === 'string' ? verch : extractChar(verch);
    const h = horch === 0 ? ACS_HLINE : typeof horch === 'string' ? horch : extractChar(horch);

    return this.wborder(v, v, h, h, ACS_ULCORNER, ACS_URCORNER, ACS_LLCORNER, ACS_LRCORNER);
  }

  /**
   * Draw a border with specific characters
   */
  wborder(
    ls: chtype | string, // Left side
    rs: chtype | string, // Right side
    ts: chtype | string, // Top side
    hs: chtype | string, // Bottom side (horizontal)
    tl: chtype | string, // Top-left corner
    tr: chtype | string, // Top-right corner
    bl: chtype | string, // Bottom-left corner
    br: chtype | string // Bottom-right corner
  ): number {
    const leftSide = typeof ls === 'string' ? ls : ls === 0 ? ACS_VLINE : extractChar(ls);
    const rightSide = typeof rs === 'string' ? rs : rs === 0 ? ACS_VLINE : extractChar(rs);
    const topSide = typeof ts === 'string' ? ts : ts === 0 ? ACS_HLINE : extractChar(ts);
    const bottomSide = typeof hs === 'string' ? hs : hs === 0 ? ACS_HLINE : extractChar(hs);
    const topLeft = typeof tl === 'string' ? tl : tl === 0 ? ACS_ULCORNER : extractChar(tl);
    const topRight = typeof tr === 'string' ? tr : tr === 0 ? ACS_URCORNER : extractChar(tr);
    const bottomLeft = typeof bl === 'string' ? bl : bl === 0 ? ACS_LLCORNER : extractChar(bl);
    const bottomRight = typeof br === 'string' ? br : br === 0 ? ACS_LRCORNER : extractChar(br);

    // Top border
    this.mvaddch(0, 0, topLeft);
    for (let x = 1; x < this.width - 1; x++) {
      this.mvaddch(0, x, topSide);
    }
    this.mvaddch(0, this.width - 1, topRight);

    // Sides
    for (let y = 1; y < this.height - 1; y++) {
      this.mvaddch(y, 0, leftSide);
      this.mvaddch(y, this.width - 1, rightSide);
    }

    // Bottom border
    this.mvaddch(this.height - 1, 0, bottomLeft);
    for (let x = 1; x < this.width - 1; x++) {
      this.mvaddch(this.height - 1, x, bottomSide);
    }
    this.mvaddch(this.height - 1, this.width - 1, bottomRight);

    return OK;
  }

  // ==========================================================================
  // Scrolling
  // ==========================================================================

  /**
   * Enable/disable scrolling
   */
  scrollok(bf: boolean): number {
    this.scrollOk = bf;
    return OK;
  }

  /**
   * Set scroll region
   */
  setscrreg(top: number, bottom: number): number {
    if (top < 0 || bottom >= this.height || top > bottom) {
      return ERR;
    }
    this.scrollTop = top;
    this.scrollBottom = bottom;
    return OK;
  }

  /**
   * Scroll window content up by n lines
   */
  scroll(n: number = 1): number {
    if (n === 0) return OK;

    if (n > 0) {
      // Scroll up
      for (let i = 0; i < n; i++) {
        // Move lines up
        for (let y = this.scrollTop; y < this.scrollBottom; y++) {
          this.buffer[y] = this.buffer[y + 1].slice();
          this.dirty[y] = true;
        }
        // Clear bottom line
        this.buffer[this.scrollBottom] = [];
        for (let x = 0; x < this.width; x++) {
          this.buffer[this.scrollBottom][x] = this.bkgd;
        }
        this.dirty[this.scrollBottom] = true;
      }
    } else {
      // Scroll down
      n = -n;
      for (let i = 0; i < n; i++) {
        // Move lines down
        for (let y = this.scrollBottom; y > this.scrollTop; y--) {
          this.buffer[y] = this.buffer[y - 1].slice();
          this.dirty[y] = true;
        }
        // Clear top line
        this.buffer[this.scrollTop] = [];
        for (let x = 0; x < this.width; x++) {
          this.buffer[this.scrollTop][x] = this.bkgd;
        }
        this.dirty[this.scrollTop] = true;
      }
    }

    return OK;
  }

  // ==========================================================================
  // Window Settings
  // ==========================================================================

  /**
   * Enable/disable keypad mode
   */
  keypad(bf: boolean): number {
    this.keypadEnabled = bf;
    return OK;
  }

  /**
   * Enable/disable nodelay mode
   */
  nodelay(bf: boolean): number {
    this.nodelayMode = bf;
    return OK;
  }

  /**
   * Set input timeout
   * @param delay - Timeout in milliseconds (-1 = blocking)
   */
  timeout(delay: number): void {
    this.inputTimeout = delay;
  }

  /**
   * Enable/disable leaveok mode
   */
  leaveok(bf: boolean): number {
    this.leaveOk = bf;
    return OK;
  }

  /**
   * Enable/disable clearok mode
   */
  clearok(bf: boolean): number {
    this.clearOk = bf;
    return OK;
  }

  /**
   * Enable/disable immediate mode
   */
  immedok(bf: boolean): number {
    this.immediateOk = bf;
    return OK;
  }

  // ==========================================================================
  // Touch Functions
  // ==========================================================================

  /**
   * Mark window as needing refresh
   */
  touchwin(): number {
    for (let y = 0; y < this.height; y++) {
      this.dirty[y] = true;
    }
    return OK;
  }

  /**
   * Mark window as not needing refresh
   */
  untouchwin(): number {
    for (let y = 0; y < this.height; y++) {
      this.dirty[y] = false;
    }
    return OK;
  }

  /**
   * Mark specific line as touched
   */
  touchline(start: number, count: number): number {
    for (let y = start; y < start + count && y < this.height; y++) {
      this.dirty[y] = true;
    }
    return OK;
  }

  /**
   * Check if line is touched
   */
  is_linetouched(line: number): boolean {
    return line >= 0 && line < this.height && this.dirty[line];
  }

  /**
   * Check if window is touched
   */
  is_wintouched(): boolean {
    return this.dirty.some((d) => d);
  }

  // ==========================================================================
  // Rendering
  // ==========================================================================

  /**
   * Generate ANSI output for window content
   * This creates the escape sequences needed to render the window
   */
  renderToAnsi(): string {
    let output = '';
    let currentAttr = DEFAULT_ATTR;

    for (let y = 0; y < this.height; y++) {
      // Position cursor at start of line (absolute position)
      output += `\x1b[${this.beginY + y + 1};${this.beginX + 1}H`;

      for (let x = 0; x < this.width; x++) {
        const cell = this.buffer[y][x];
        const cellAttr = (cell >> 8) & 0xffffff; // Extract attribute
        const cellChar = extractChar(cell);

        // Change attributes if needed
        if (cellAttr !== currentAttr) {
          output += attrToAnsi(cellAttr);
          currentAttr = cellAttr;
        }

        output += cellChar;
      }
    }

    // Reset attributes at end
    output += '\x1b[0m';

    return output;
  }

  /**
   * Render only dirty lines
   */
  renderDirtyToAnsi(): string {
    let output = '';
    let currentAttr = DEFAULT_ATTR;

    for (let y = 0; y < this.height; y++) {
      if (!this.dirty[y]) continue;

      // Position cursor at start of line
      output += `\x1b[${this.beginY + y + 1};${this.beginX + 1}H`;

      for (let x = 0; x < this.width; x++) {
        const cell = this.buffer[y][x];
        const cellAttr = (cell >> 8) & 0xffffff;
        const cellChar = extractChar(cell);

        if (cellAttr !== currentAttr) {
          output += attrToAnsi(cellAttr);
          currentAttr = cellAttr;
        }

        output += cellChar;
      }

      this.dirty[y] = false;
    }

    if (output.length > 0) {
      output += '\x1b[0m';
    }

    return output;
  }
}

// ============================================================================
// Window Factory Functions
// ============================================================================

/**
 * Create a new window
 */
export function newwin(height: number, width: number, beginY: number, beginX: number): Window {
  return new Window(height, width, beginY, beginX);
}

/**
 * Create a subwindow (shares parent buffer)
 */
export function subwin(
  parent: Window,
  height: number,
  width: number,
  beginY: number,
  beginX: number
): Window | null {
  // Validate bounds
  if (beginY < parent.beginY || beginX < parent.beginX) {
    return null;
  }
  if (beginY + height > parent.beginY + parent.height) {
    return null;
  }
  if (beginX + width > parent.beginX + parent.width) {
    return null;
  }

  return new Window(height, width, beginY, beginX, true, parent);
}

/**
 * Create a derived window (relative to parent)
 */
export function derwin(
  parent: Window,
  height: number,
  width: number,
  relY: number,
  relX: number
): Window | null {
  return subwin(parent, height, width, parent.beginY + relY, parent.beginX + relX);
}

/**
 * Delete a window
 */
export function delwin(win: Window): number {
  // In a real implementation, this would free resources
  // In TypeScript, the GC handles this
  return OK;
}

/**
 * Duplicate a window
 */
export function dupwin(win: Window): Window {
  const dup = new Window(win.height, win.width, win.beginY, win.beginX);
  dup.cursorY = win.cursorY;
  dup.cursorX = win.cursorX;
  dup.currentAttr = win.currentAttr;
  dup.scrollOk = win.scrollOk;
  dup.keypadEnabled = win.keypadEnabled;
  dup.bkgd = win.bkgd;

  // Copy buffer
  for (let y = 0; y < win.height; y++) {
    dup.buffer[y] = win.buffer[y].slice();
    dup.dirty[y] = true;
  }

  return dup;
}

/**
 * Move window to new position
 */
export function mvwin(win: Window, y: number, x: number): number {
  // Windows are immutable in position, so we modify the internal state
  // This is a simplification; real ncurses recreates the window
  (win as { beginY: number }).beginY = y;
  (win as { beginX: number }).beginX = x;
  return OK;
}

/**
 * Copy window contents to another window
 */
export function copywin(
  srcWin: Window,
  dstWin: Window,
  srcMinY: number,
  srcMinX: number,
  dstMinY: number,
  dstMinX: number,
  dstMaxY: number,
  dstMaxX: number,
  overlay: boolean
): number {
  for (let srcY = srcMinY, dstY = dstMinY; srcY < srcWin.height && dstY <= dstMaxY; srcY++, dstY++) {
    for (
      let srcX = srcMinX, dstX = dstMinX;
      srcX < srcWin.width && dstX <= dstMaxX;
      srcX++, dstX++
    ) {
      if (dstY >= 0 && dstY < dstWin.height && dstX >= 0 && dstX < dstWin.width) {
        const srcCell = srcWin.buffer[srcY][srcX];

        if (overlay) {
          // Only copy non-blank characters
          if (extractChar(srcCell) !== ' ') {
            dstWin.buffer[dstY][dstX] = srcCell;
            dstWin.dirty[dstY] = true;
          }
        } else {
          dstWin.buffer[dstY][dstX] = srcCell;
          dstWin.dirty[dstY] = true;
        }
      }
    }
  }

  return OK;
}

/**
 * Overlay source onto destination (non-blanks only)
 */
export function overlay(srcWin: Window, dstWin: Window): number {
  return copywin(
    srcWin,
    dstWin,
    0,
    0,
    0,
    0,
    Math.min(srcWin.height, dstWin.height) - 1,
    Math.min(srcWin.width, dstWin.width) - 1,
    true
  );
}

/**
 * Overwrite source onto destination (all characters)
 */
export function overwrite(srcWin: Window, dstWin: Window): number {
  return copywin(
    srcWin,
    dstWin,
    0,
    0,
    0,
    0,
    Math.min(srcWin.height, dstWin.height) - 1,
    Math.min(srcWin.width, dstWin.width) - 1,
    false
  );
}
