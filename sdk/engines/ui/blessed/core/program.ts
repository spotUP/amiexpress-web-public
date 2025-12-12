/**
 * Program - Terminal control and I/O layer
 *
 * Browser-adapted version of blessed Program class.
 * Handles all terminal control sequences, input parsing, and output buffering.
 */

import { EventEmitter } from './events';
import { cursor, attrs, fg, bg } from './colors';
import type { KeyEvent, MouseEvent } from './types';

export interface ProgramOptions {
  input?: any;
  output?: (data: string) => void;
  buffer?: boolean;
  zero?: boolean;
  terminal?: string;
  dump?: boolean;
  resizeTimeout?: number;
  title?: string;
}

/**
 * Program class - Low-level terminal control
 *
 * Provides methods for cursor control, colors, attributes, and input handling.
 * This is the foundation that Screen builds upon.
 */
export class Program extends EventEmitter {
  // Options
  options: ProgramOptions;
  terminal: string;
  zero: boolean;

  // Dimensions
  cols: number = 80;
  rows: number = 24;

  // Output callback
  private output: (data: string) => void;

  // Output buffer
  private _buf: string = '';
  private _flush: any = null;

  // State
  private _exiting: boolean = false;
  private _buffer: boolean;

  // Cursor state
  private _cursorHidden: boolean = true;
  private _cursorShape: 'block' | 'underline' | 'line' | null = null;
  private x: number = 0;
  private y: number = 0;

  // Attribute state
  private _attr: any = {
    bold: false,
    underline: false,
    blink: false,
    inverse: false,
    invisible: false,
    fg: -1,
    bg: -1,
  };

  // Input state
  private _paused: boolean = false;
  private _readInput: boolean = false;

  // Key and mouse handlers
  private keyHandlers: Map<string, ((ch: any, key: KeyEvent) => void)[]> = new Map();
  private mouseHandlers: ((event: MouseEvent) => void)[] = [];

  // Mouse state
  private _mouseEnabled: boolean = false;
  private _lastMouseEvent: MouseEvent | null = null;

  constructor(options: ProgramOptions = {}) {
    super();

    this.options = options;
    this.terminal = options.terminal || 'ansi';
    this.zero = options.zero || false;
    this._buffer = options.buffer !== false;

    // Set output callback
    this.output = options.output || ((data: string) => {
      if (typeof process !== 'undefined' && process.stdout) {
        process.stdout.write(data);
      } else {
        console.log(data);
      }
    });

    // Set dimensions
    this.cols = 80;
    this.rows = 24;

    // Set title
    if (options.title) {
      this.setTitle(options.title);
    }

    // Emit ready
    this.emit('ready');
  }

  // ============================================================================
  // Output Methods
  // ============================================================================

  /**
   * Write data to output
   */
  write(data: string): void {
    if (this._exiting) return;

    if (this._buffer) {
      this._buf += data;

      if (!this._flush) {
        this._flush = setTimeout(() => {
          this.flush();
        }, 0);
      }
    } else {
      this.output(data);
    }
  }

  /**
   * Flush buffered output
   */
  flush(): void {
    if (!this._buf) return;

    this.output(this._buf);
    this._buf = '';

    if (this._flush) {
      clearTimeout(this._flush);
      this._flush = null;
    }
  }

  /**
   * Echo text (alias for write)
   */
  echo(text: string): void {
    this.write(text);
  }

  // ============================================================================
  // Cursor Control
  // ============================================================================

  /**
   * Show cursor
   */
  showCursor(): void {
    if (!this._cursorHidden) return;
    this._cursorHidden = false;
    this.write(cursor.show);
  }

  /**
   * Hide cursor
   */
  hideCursor(): void {
    if (this._cursorHidden) return;
    this._cursorHidden = true;
    this.write(cursor.hide);
  }

  /**
   * Set cursor position (0-indexed)
   */
  cup(row: number, col: number): void {
    this.y = row;
    this.x = col;
    this.write(cursor.pos(col, row));
  }

  /**
   * Move cursor to position (alias for cup)
   */
  pos(row: number, col: number): void {
    this.cup(row, col);
  }

  /**
   * Move cursor to column
   */
  cha(col: number): void {
    this.x = col;
    this.write(`\x1b[${col + 1}G`);
  }

  /**
   * Move cursor up
   */
  cuu(n: number = 1): void {
    this.y = Math.max(0, this.y - n);
    if (n === 1) {
      this.write(cursor.up());
    } else {
      this.write(`\x1b[${n}A`);
    }
  }

  /**
   * Move cursor down
   */
  cud(n: number = 1): void {
    this.y = Math.min(this.rows - 1, this.y + n);
    if (n === 1) {
      this.write(cursor.down());
    } else {
      this.write(`\x1b[${n}B`);
    }
  }

  /**
   * Move cursor forward
   */
  cuf(n: number = 1): void {
    this.x = Math.min(this.cols - 1, this.x + n);
    this.write(`\x1b[${n}C`);
  }

  /**
   * Move cursor backward
   */
  cub(n: number = 1): void {
    this.x = Math.max(0, this.x - n);
    this.write(`\x1b[${n}D`);
  }

  /**
   * Save cursor position
   */
  sc(): void {
    this.write('\x1b[s');
  }

  /**
   * Restore cursor position
   */
  rc(): void {
    this.write('\x1b[u');
  }

  /**
   * Set cursor shape
   */
  cursorShape(shape: 'block' | 'underline' | 'line', blink: boolean = false): void {
    this._cursorShape = shape;

    let code: number;
    if (shape === 'block') {
      code = blink ? 1 : 2;
    } else if (shape === 'underline') {
      code = blink ? 3 : 4;
    } else { // line
      code = blink ? 5 : 6;
    }

    this.write(`\x1b[${code} q`);
  }

  /**
   * Reset cursor shape
   */
  cursorReset(): void {
    this._cursorShape = null;
    this.write('\x1b[0 q');
  }

  // ============================================================================
  // Screen Control
  // ============================================================================

  /**
   * Clear screen
   */
  clear(): void {
    this.write('\x1b[2J');
    this.cup(0, 0);
  }

  /**
   * Clear from cursor to end of screen
   */
  ed(param?: string): void {
    if (param === 'above') {
      this.write('\x1b[1J');
    } else if (param === 'all') {
      this.write('\x1b[2J');
    } else {
      this.write('\x1b[J');
    }
  }

  /**
   * Clear from cursor to end of line
   */
  el(param?: string): void {
    if (param === 'left') {
      this.write('\x1b[1K');
    } else if (param === 'all') {
      this.write('\x1b[2K');
    } else {
      this.write('\x1b[K');
    }
  }

  /**
   * Erase characters
   */
  ech(n: number = 1): void {
    this.write(`\x1b[${n}X`);
  }

  /**
   * Insert lines
   */
  il(n: number = 1): void {
    this.write(`\x1b[${n}L`);
  }

  /**
   * Delete lines
   */
  dl(n: number = 1): void {
    this.write(`\x1b[${n}M`);
  }

  /**
   * Insert characters
   */
  ich(n: number = 1): void {
    this.write(`\x1b[${n}@`);
  }

  /**
   * Delete characters
   */
  dch(n: number = 1): void {
    this.write(`\x1b[${n}P`);
  }

  /**
   * Set scroll region
   */
  csr(top: number, bottom: number): void {
    this.write(`\x1b[${top + 1};${bottom + 1}r`);
  }

  /**
   * Reset scroll region
   */
  resetCursor(): void {
    this.write('\x1b[r');
  }

  /**
   * Scroll up
   */
  su(n: number = 1): void {
    this.write(`\x1b[${n}S`);
  }

  /**
   * Scroll down
   */
  sd(n: number = 1): void {
    this.write(`\x1b[${n}T`);
  }

  // ============================================================================
  // Attribute Methods
  // ============================================================================

  /**
   * Set SGR (Select Graphic Rendition) attributes
   */
  sgr(params: string | number | (string | number)[]): void {
    if (!Array.isArray(params)) {
      params = [params];
    }
    this.write(`\x1b[${params.join(';')}m`);
  }

  /**
   * Set foreground color
   */
  fg(color: string | number): void {
    this._attr.fg = color;
    this.write(fg(color));
  }

  /**
   * Set background color
   */
  bg(color: string | number): void {
    this._attr.bg = color;
    this.write(bg(color));
  }

  /**
   * Set bold
   */
  bold(): void {
    this._attr.bold = true;
    this.write(attrs.bold);
  }

  /**
   * Set underline
   */
  ul(enable: boolean = true): void {
    this._attr.underline = enable;
    this.write(enable ? attrs.underline : '\x1b[24m');
  }

  /**
   * Set blink
   */
  blink(enable: boolean = true): void {
    this._attr.blink = enable;
    this.write(enable ? attrs.blink : '\x1b[25m');
  }

  /**
   * Set inverse
   */
  inverse(enable: boolean = true): void {
    this._attr.inverse = enable;
    this.write(enable ? attrs.inverse : '\x1b[27m');
  }

  /**
   * Set invisible
   */
  invisible(enable: boolean = true): void {
    this._attr.invisible = enable;
    this.write(enable ? attrs.invisible : '\x1b[28m');
  }

  /**
   * Reset all attributes
   */
  reset(): void {
    this._attr = {
      bold: false,
      underline: false,
      blink: false,
      inverse: false,
      invisible: false,
      fg: -1,
      bg: -1,
    };
    this.write(attrs.reset);
  }

  /**
   * Normal (no bold, no dim)
   */
  normal(): void {
    this.write('\x1b[22m');
  }

  // ============================================================================
  // Alternate Screen
  // ============================================================================

  /**
   * Use alternate screen buffer
   */
  alternateBuffer(): void {
    this.write('\x1b[?1049h');
  }

  /**
   * Use normal screen buffer
   */
  normalBuffer(): void {
    this.write('\x1b[?1049l');
  }

  /**
   * Switch to alternate buffer (alias)
   */
  smcup(): void {
    this.alternateBuffer();
  }

  /**
   * Switch to normal buffer (alias)
   */
  rmcup(): void {
    this.normalBuffer();
  }

  // ============================================================================
  // Mouse Support
  // ============================================================================

  /**
   * Enable mouse reporting
   */
  enableMouse(): void {
    if (this._mouseEnabled) return;
    this._mouseEnabled = true;

    // Enable mouse button tracking
    this.write('\x1b[?1000h');

    // Enable mouse motion tracking
    this.write('\x1b[?1002h');

    // Enable SGR mouse mode (better encoding)
    this.write('\x1b[?1006h');
  }

  /**
   * Disable mouse reporting
   */
  disableMouse(): void {
    if (!this._mouseEnabled) return;
    this._mouseEnabled = false;

    this.write('\x1b[?1006l');
    this.write('\x1b[?1002l');
    this.write('\x1b[?1000l');
  }

  /**
   * Bind mouse event handler
   */
  onMouse(handler: (event: MouseEvent) => void): void {
    this.mouseHandlers.push(handler);
  }

  /**
   * Unbind mouse event handler
   */
  offMouse(handler: (event: MouseEvent) => void): void {
    const index = this.mouseHandlers.indexOf(handler);
    if (index !== -1) {
      this.mouseHandlers.splice(index, 1);
    }
  }

  /**
   * Parse mouse event from input
   */
  private parseMouseEvent(buf: string): MouseEvent | null {
    // SGR mouse format: \x1b[<b;x;yM or \x1b[<b;x;ym
    const match = buf.match(/\x1b\[<(\d+);(\d+);(\d+)([Mm])/);
    if (!match) return null;

    const button = parseInt(match[1], 10);
    const x = parseInt(match[2], 10) - 1;
    const y = parseInt(match[3], 10) - 1;
    const release = match[4] === 'm';

    // Parse button and modifiers
    const shift = !!(button & 4);
    const meta = !!(button & 8);
    const ctrl = !!(button & 16);

    const b = button & 3;
    let action: 'mousedown' | 'mouseup' | 'mousemove' | 'wheeldown' | 'wheelup';
    let buttonName: 'left' | 'middle' | 'right' | undefined;

    if (button & 64) {
      // Mouse wheel
      action = b === 0 ? 'wheelup' : 'wheeldown';
      buttonName = undefined;
    } else if (release) {
      action = 'mouseup';
      buttonName = b === 0 ? 'left' : b === 1 ? 'middle' : b === 2 ? 'right' : undefined;
    } else if (button & 32) {
      // Mouse motion
      action = 'mousemove';
      buttonName = b === 0 ? 'left' : b === 1 ? 'middle' : b === 2 ? 'right' : undefined;
    } else {
      action = 'mousedown';
      buttonName = b === 0 ? 'left' : b === 1 ? 'middle' : b === 2 ? 'right' : undefined;
    }

    return {
      x,
      y,
      action,
      button: buttonName,
      shift,
      meta,
      ctrl,
    };
  }

  // ============================================================================
  // Key Handling
  // ============================================================================

  /**
   * Bind key handler
   */
  key(keys: string | string[], handler: (ch: any, key: KeyEvent) => void): void {
    const keyList = Array.isArray(keys) ? keys : [keys];

    for (const k of keyList) {
      if (!this.keyHandlers.has(k)) {
        this.keyHandlers.set(k, []);
      }
      this.keyHandlers.get(k)!.push(handler);
    }
  }

  /**
   * Bind key handler (one-time)
   */
  onceKey(keys: string | string[], handler: (ch: any, key: KeyEvent) => void): void {
    const wrapper = (ch: any, key: KeyEvent) => {
      this.unkey(keys, wrapper);
      handler(ch, key);
    };
    this.key(keys, wrapper);
  }

  /**
   * Unbind key handler
   */
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

  /**
   * Parse key from input buffer
   */
  private parseKey(buf: string): KeyEvent | null {
    if (!buf) return null;

    const key: KeyEvent = {
      sequence: buf,
      name: '',
      ctrl: false,
      meta: false,
      shift: false,
      full: '',
    };

    // Single character
    if (buf.length === 1) {
      const ch = buf.charCodeAt(0);

      // Control characters
      if (ch >= 1 && ch <= 26) {
        key.name = String.fromCharCode(ch + 96);
        key.ctrl = true;
        if (key.name === 'm') key.name = 'enter';
        if (key.name === 'i') key.name = 'tab';
        if (key.name === 'h') key.name = 'backspace';
        key.full = 'C-' + key.name;
        return key;
      }

      // Regular character
      key.name = buf;
      if (buf >= 'A' && buf <= 'Z') {
        key.shift = true;
      }
      key.full = key.name;
      return key;
    }

    // Escape sequences
    if (buf[0] === '\x1b') {
      // Meta + character
      if (buf.length === 2) {
        key.meta = true;
        key.name = buf[1];
        key.full = 'M-' + key.name;
        return key;
      }

      // CSI sequences
      if (buf[1] === '[' || buf[1] === 'O') {
        const match = buf.match(/^\x1b\[([0-9;]+)?([A-Za-z~])/);
        if (match) {
          const params = match[1] ? match[1].split(';').map(Number) : [];
          const final = match[2];

          // Arrow keys
          if (final === 'A') key.name = 'up';
          else if (final === 'B') key.name = 'down';
          else if (final === 'C') key.name = 'right';
          else if (final === 'D') key.name = 'left';
          else if (final === 'H') key.name = 'home';
          else if (final === 'F') key.name = 'end';

          // Function keys and special keys
          else if (final === '~') {
            const code = params[0] || 0;
            if (code === 1) key.name = 'home';
            else if (code === 2) key.name = 'insert';
            else if (code === 3) key.name = 'delete';
            else if (code === 4) key.name = 'end';
            else if (code === 5) key.name = 'pageup';
            else if (code === 6) key.name = 'pagedown';
            else if (code >= 11 && code <= 15) key.name = `f${code - 10}`;
            else if (code >= 17 && code <= 21) key.name = `f${code - 11}`;
            else if (code >= 23 && code <= 24) key.name = `f${code - 12}`;
          }

          // Check for modifiers
          if (params.length > 1) {
            const mod = params[1];
            if (mod) {
              key.shift = !!(mod & 1);
              key.meta = !!(mod & 2);
              key.ctrl = !!(mod & 4);
            }
          }

          // Set full key name
          key.full = '';
          if (key.ctrl) key.full += 'C-';
          if (key.meta) key.full += 'M-';
          if (key.shift && key.name.length > 1) key.full += 'S-';
          key.full += key.name;

          return key;
        }
      }
    }

    // Special keys
    if (buf === '\r' || buf === '\n') {
      key.name = 'enter';
      key.full = 'enter';
      return key;
    }
    if (buf === '\t') {
      key.name = 'tab';
      key.full = 'tab';
      return key;
    }
    if (buf === '\x7f' || buf === '\x08') {
      key.name = 'backspace';
      key.full = 'backspace';
      return key;
    }
    if (buf === '\x1b') {
      key.name = 'escape';
      key.full = 'escape';
      return key;
    }

    // Set full key name with modifiers
    key.full = '';
    if (key.ctrl) key.full += 'C-';
    if (key.meta) key.full += 'M-';
    if (key.shift && key.name.length > 1) key.full += 'S-';
    key.full += key.name;

    return key;
  }

  /**
   * Handle input data
   */
  _handleData(data: string): void {
    if (this._paused) return;

    // Check for mouse events
    if (this._mouseEnabled && data.includes('\x1b[<')) {
      const mouseEvent = this.parseMouseEvent(data);
      if (mouseEvent) {
        this._lastMouseEvent = mouseEvent;

        for (const handler of this.mouseHandlers) {
          handler(mouseEvent);
        }

        this.emit('mouse', mouseEvent);
        return;
      }
    }

    // Parse key
    const key = this.parseKey(data);
    if (key) {
      // Emit to specific key handlers
      const handlers = this.keyHandlers.get(key.full || key.name);
      if (handlers) {
        for (const handler of handlers) {
          handler(data, key);
        }
      }

      // Emit generic keypress event
      this.emit('keypress', data, key);
    }

    // Emit raw data event
    this.emit('data', data);
  }

  // ============================================================================
  // Title
  // ============================================================================

  /**
   * Set terminal title
   */
  setTitle(title: string): void {
    this.write(`\x1b]0;${title}\x07`);
  }

  // ============================================================================
  // Resize
  // ============================================================================

  /**
   * Resize terminal
   */
  resize(cols?: number, rows?: number): void {
    if (cols !== undefined) this.cols = cols;
    if (rows !== undefined) this.rows = rows;

    this.emit('resize');
  }

  // ============================================================================
  // Control
  // ============================================================================

  /**
   * Pause input
   */
  pause(): void {
    this._paused = true;
  }

  /**
   * Resume input
   */
  resume(): void {
    this._paused = false;
  }

  /**
   * Ring bell
   */
  bell(): void {
    this.write('\x07');
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * Destroy program and clean up
   */
  destroy(): void {
    if (this._exiting) return;
    this._exiting = true;

    this.flush();

    if (this._mouseEnabled) {
      this.disableMouse();
    }

    this.showCursor();
    this.normalBuffer();
    this.reset();

    this.removeAllListeners();

    this.emit('destroy');
  }
}
