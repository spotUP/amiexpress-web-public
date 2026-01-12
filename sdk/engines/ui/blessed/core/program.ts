/**
 * Program - Terminal control and I/O layer
 *
 * Browser-adapted version of blessed Program class.
 * Handles all terminal control sequences, input parsing, and output buffering.
 */

import { EventEmitter } from './events';
import { cursor, attrs, fg, bg } from './colors';
import type { KeyEvent, MouseEvent } from './types';

// Use String.fromCharCode(27) for ESC to survive Terser minification
const ESC = String.fromCharCode(27);

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
  private keyHandlers: Map<string, ((ch: any, key: KeyEvent) => boolean | void)[]> = new Map();
  private mouseHandlers: ((event: MouseEvent) => void)[] = [];

  // Mouse state
  private _mouseEnabled: boolean = false;
  private _lastMouseEvent: MouseEvent | null = null;

  // Guard against re-entry in data handler (prevents feedback loop from _emitKey)
  private _handlingData: boolean = false;

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
      }
    });

    // Set dimensions
    this.cols = 80;
    this.rows = 24;

    // Set title
    if (options.title) {
      this.setTitle(options.title);
    }

    // Listen for 'data' events (from web frontend via setupInputHandler)
    // This connects the input path for web-based doors
    // Guard prevents feedback loop since _emitKey also emits 'data'
    this.on('data', (data: string) => {
      if (this._handlingData) return;
      this._handlingData = true;
      try {
        this._handleData(data);
      } finally {
        this._handlingData = false;
      }
    });

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

    // Always write immediately for responsive visual feedback
    // Buffering causes delays during rapid updates like text selection
    this.output(data);
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
    this.write(ESC + `\[${col + 1}G`);
  }

  /**
   * Move cursor up
   */
  cuu(n: number = 1): void {
    this.y = Math.max(0, this.y - n);
    if (n === 1) {
      this.write(cursor.up());
    } else {
      this.write(ESC + `\[${n}A`);
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
      this.write(ESC + `\[${n}B`);
    }
  }

  /**
   * Move cursor forward
   */
  cuf(n: number = 1): void {
    this.x = Math.min(this.cols - 1, this.x + n);
    this.write(ESC + `\[${n}C`);
  }

  /**
   * Move cursor backward
   */
  cub(n: number = 1): void {
    this.x = Math.max(0, this.x - n);
    this.write(ESC + `\[${n}D`);
  }

  /**
   * Save cursor position
   */
  sc(): void {
    this.write(ESC + '[s');
  }

  /**
   * Restore cursor position
   */
  rc(): void {
    this.write(ESC + '[u');
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

    this.write(ESC + `\[${code} q`);
  }

  /**
   * Reset cursor shape
   */
  cursorReset(): void {
    this._cursorShape = null;
    this.write(ESC + '[0 q');
  }

  // ============================================================================
  // Screen Control
  // ============================================================================

  /**
   * Clear screen
   */
  clear(): void {
    this.write(ESC + '[2J');
    this.cup(0, 0);
  }

  /**
   * Clear from cursor to end of screen
   */
  ed(param?: string): void {
    if (param === 'above') {
      this.write(ESC + '[1J');
    } else if (param === 'all') {
      this.write(ESC + '[2J');
    } else {
      this.write(ESC + '[J');
    }
  }

  /**
   * Clear from cursor to end of line
   */
  el(param?: string): void {
    if (param === 'left') {
      this.write(ESC + '[1K');
    } else if (param === 'all') {
      this.write(ESC + '[2K');
    } else {
      this.write(ESC + '[K');
    }
  }

  /**
   * Erase characters
   */
  ech(n: number = 1): void {
    this.write(ESC + `\[${n}X`);
  }

  /**
   * Insert lines
   */
  il(n: number = 1): void {
    this.write(ESC + `\[${n}L`);
  }

  /**
   * Delete lines
   */
  dl(n: number = 1): void {
    this.write(ESC + `\[${n}M`);
  }

  /**
   * Insert characters
   */
  ich(n: number = 1): void {
    this.write(ESC + `\[${n}@`);
  }

  /**
   * Delete characters
   */
  dch(n: number = 1): void {
    this.write(ESC + `\[${n}P`);
  }

  /**
   * Set scroll region
   */
  csr(top: number, bottom: number): void {
    this.write(ESC + `\[${top + 1};${bottom + 1}r`);
  }

  /**
   * Reset scroll region
   */
  resetCursor(): void {
    this.write(ESC + '[r');
  }

  /**
   * Scroll up
   */
  su(n: number = 1): void {
    this.write(ESC + `\[${n}S`);
  }

  /**
   * Scroll down
   */
  sd(n: number = 1): void {
    this.write(ESC + `\[${n}T`);
  }

  // ============================================================================
  // Additional Terminal Control (neo-blessed compatibility)
  // ============================================================================

  /**
   * Insert characters (alias for ich)
   * EXACT from neo-blessed program.js lines 2798-2803
   */
  insertChars(param: number = 1): void {
    this.ich(param);
  }

  /**
   * Delete characters (alias for dch)
   * EXACT from neo-blessed program.js lines 2860-2863
   */
  deleteChars(param: number = 1): void {
    this.dch(param);
  }

  /**
   * Erase characters (alias for ech)
   * EXACT from neo-blessed program.js lines 2868-2871
   */
  eraseChars(param: number = 1): void {
    this.ech(param);
  }

  /**
   * Insert lines (alias for il)
   * EXACT from neo-blessed program.js lines 2844-2847
   */
  insertLines(param: number = 1): void {
    this.il(param);
  }

  /**
   * Delete lines (alias for dl)
   * EXACT from neo-blessed program.js lines 2852-2855
   */
  deleteLines(param: number = 1): void {
    this.dl(param);
  }

  /**
   * Cursor Next Line (CNL)
   * EXACT from neo-blessed program.js lines 2809-2813
   */
  cnl(param: number = 1): void {
    this.write(ESC + `\[${param || ''}E`);
  }

  cursorNextLine(param: number = 1): void {
    this.cnl(param);
  }

  /**
   * Cursor Preceding Line (CPL)
   * EXACT from neo-blessed program.js lines 2819-2823
   */
  cpl(param: number = 1): void {
    this.write(ESC + `\[${param || ''}F`);
  }

  cursorPrecedingLine(param: number = 1): void {
    this.cpl(param);
  }

  /**
   * Cursor Character Absolute (CHA) - override existing cha with full implementation
   * EXACT from neo-blessed program.js lines 2828-2839
   */
  cursorCharAbsolute(param: number = 0): void {
    // Note: our implementation doesn't track x/y coordinates like neo-blessed
    // Just send the ANSI code
    this.write(ESC + `\[${param + 1}G`);
  }

  /**
   * Horizontal Position Absolute (HPA)
   * EXACT from neo-blessed program.js lines 2876-2884
   */
  hpa(param: number = 0): void {
    this.write(ESC + `\[${param || ''}${'`'}`);
  }

  charPosAbsolute(param: number = 0): void {
    this.hpa(param);
  }

  /**
   * Horizontal Position Relative (HPR)
   * EXACT from neo-blessed program.js lines 2890-2897
   */
  hpr(param: number = 1): void {
    this.write(ESC + `\[${param || ''}a`);
  }

  /**
   * Save cursor position
   * EXACT from neo-blessed program.js lines 2011-2017
   */
  private savedX: number = 0;
  private savedY: number = 0;
  private _saved?: Record<string, { x: number; y: number; hidden?: boolean }>;

  saveCursor(key?: string): void {
    if (key) return this.lsaveCursor(key);
    // For browser implementation, just send ANSI code
    // Note: neo-blessed tracks this.x/this.y but we don't have those
    this.write(ESC + '7');
  }

  /**
   * Restore cursor position
   * EXACT from neo-blessed program.js lines 2021-2027
   */
  restoreCursor(key?: string, hide?: boolean): void {
    if (key) return this.lrestoreCursor(key, hide);
    this.write(ESC + '8');
  }

  /**
   * Save cursor locally (in memory)
   * EXACT from neo-blessed program.js lines 2030-2037
   */
  lsaveCursor(key: string = 'local'): void {
    this._saved = this._saved || {};
    this._saved[key] = {
      x: 0,  // Would track cursor position in full implementation
      y: 0,
      hidden: this._cursorHidden,
    };
  }

  /**
   * Restore cursor locally (from memory)
   * EXACT from neo-blessed program.js lines 2040-2054
   */
  lrestoreCursor(key: string = 'local', hide?: boolean): void {
    if (!this._saved || !this._saved[key]) return;
    const pos = this._saved[key];
    // In full implementation would: this.cup(pos.y, pos.x);
    if (hide && pos.hidden !== this._cursorHidden) {
      if (pos.hidden) {
        this.hideCursor();
      } else {
        this.showCursor();
      }
    }
  }

  /**
   * Line Height
   * EXACT from neo-blessed program.js lines 2057-2059
   */
  lineHeight(): void {
    this.write(ESC + '#');
  }

  /**
   * Tab Set
   * EXACT from neo-blessed program.js lines 2004-2006
   */
  tabSet(): void {
    this.write(ESC + 'H');
  }

  /**
   * Reset colors
   * EXACT from neo-blessed program.js lines 2224-2233
   */
  resetColors(param?: string | number): void {
    if (param === 'fg') {
      this.write(ESC + ']110' + String.fromCharCode(7));
    } else if (param === 'bg') {
      this.write(ESC + ']111' + String.fromCharCode(7));
    } else {
      this.write(ESC + ']112' + String.fromCharCode(7));
    }
  }

  /**
   * Set scroll region (alias for csr)
   * EXACT from neo-blessed program.js (decstbm)
   */
  setScrollRegion(top: number, bottom: number): void {
    this.csr(top, bottom);
  }

  decstbm(top: number, bottom: number): void {
    this.setScrollRegion(top, bottom);
  }

  // ============================================================================
  // Mode Control Methods
  // ============================================================================

  /**
   * Set Mode (SM) - CSI Pm h
   * Sets terminal modes (see VT100/ANSI documentation for mode numbers)
   * EXACT from neo-blessed program.js lines 3071-3075
   */
  sm(...params: (string | number)[]): void {
    const param = params.join(';');
    this.write(ESC + `\[${param || ''}h`);
  }

  /**
   * Set Mode (alias for sm)
   * EXACT from neo-blessed program.js lines 3071-3075
   */
  setMode(...params: (string | number)[]): void {
    this.sm(...params);
  }

  /**
   * DEC Private Mode Set (DECSET) - CSI ? Pm h
   * Sets DEC private modes (e.g., ?25 for cursor visibility, ?47/?1049 for alt screen)
   * EXACT from neo-blessed program.js lines 3077-3080
   */
  decset(...params: (string | number)[]): void {
    const param = params.join(';');
    this.setMode('?' + param);
  }

  /**
   * Reset Mode (RM) - CSI Pm l
   * Resets terminal modes
   * EXACT from neo-blessed program.js lines 3187-3191
   */
  rm(...params: (string | number)[]): void {
    const param = params.join(';');
    this.write(ESC + `\[${param || ''}l`);
  }

  /**
   * Reset Mode (alias for rm)
   * EXACT from neo-blessed program.js lines 3187-3191
   */
  resetMode(...params: (string | number)[]): void {
    this.rm(...params);
  }

  /**
   * DEC Private Mode Reset (DECRST) - CSI ? Pm l
   * Resets DEC private modes
   * EXACT from neo-blessed program.js lines 3193-3196
   */
  decrst(...params: (string | number)[]): void {
    const param = params.join(';');
    this.resetMode('?' + param);
  }

  // ============================================================================
  // Character Set Methods
  // ============================================================================

  /**
   * Designate G0-G3 Character Set
   * ESC (,),*,+,-,. Designate G0-G2 Character Set
   * EXACT from neo-blessed program.js lines 2062-2149
   */
  charset(val: string | number, level: number = 0): void {
    let levelChar: string;

    switch (level) {
      case 0:
        levelChar = '(';
        break;
      case 1:
        levelChar = ')';
        break;
      case 2:
        levelChar = '*';
        break;
      case 3:
        levelChar = '+';
        break;
      default:
        levelChar = '(';
    }

    const name = typeof val === 'string' ? val.toLowerCase() : val;
    let charsetCode: string;

    switch (name) {
      case 'acs':
      case 'scld': // DEC Special Character and Line Drawing Set
        charsetCode = '0';
        break;
      case 'uk': // UK
        charsetCode = 'A';
        break;
      case 'us': // United States (USASCII)
      case 'usascii':
      case 'ascii':
        charsetCode = 'B';
        break;
      case 'dutch': // Dutch
        charsetCode = '4';
        break;
      case 'finnish': // Finnish
        charsetCode = '5';
        break;
      case 'french': // French
        charsetCode = 'R';
        break;
      case 'frenchcanadian': // FrenchCanadian
        charsetCode = 'Q';
        break;
      case 'german': // German
        charsetCode = 'K';
        break;
      case 'italian': // Italian
        charsetCode = 'Y';
        break;
      case 'norwegiandanish': // NorwegianDanish
        charsetCode = '6';
        break;
      case 'spanish': // Spanish
        charsetCode = 'Z';
        break;
      case 'swedish': // Swedish
        charsetCode = '7';
        break;
      case 'swiss': // Swiss
        charsetCode = '=';
        break;
      case 'isolatin': // ISOLatin
        charsetCode = '/A';
        break;
      default: // Default to ASCII
        charsetCode = 'B';
        break;
    }

    this.write(ESC + `${levelChar}${charsetCode}`);
  }

  /**
   * Enter alternate character set mode (DEC Special Graphics)
   * EXACT from neo-blessed program.js lines 2151-2155
   */
  smacs(): void {
    this.charset('acs');
  }

  /**
   * Exit alternate character set mode
   * EXACT from neo-blessed program.js lines 2157-2161
   */
  rmacs(): void {
    this.charset('ascii');
  }

  /**
   * Invoke G1, G2, or G3 Character Set
   * ESC N/O/n/o/|/}/~ - Single Shift or Locking Shift
   * EXACT from neo-blessed program.js lines 2179-2198
   */
  setG(level: number): void {
    let code: string;

    switch (level) {
      case 1:
        code = '~'; // Invoke G1 as GR
        break;
      case 2:
        code = 'n'; // Invoke G2 as GL
        // code = '}'; // Invoke G2 as GR
        // code = 'N'; // SS2 - Single Shift G2 (next char only)
        break;
      case 3:
        code = 'o'; // Invoke G3 as GL
        // code = '|'; // Invoke G3 as GR
        // code = 'O'; // SS3 - Single Shift G3 (next char only)
        break;
      default:
        code = 'n';
    }

    this.write(ESC + `${code}`);
  }

  // ============================================================================
  // Terminal Query Methods
  // ============================================================================

  /**
   * Device Status Report (DSR) - CSI Ps n or CSI ? Ps n
   * Queries terminal status (cursor position, printer, keyboard, etc.)
   * EXACT from neo-blessed program.js lines 2755-2763
   *
   * NOTE: Response handling is simplified for browser environment.
   * Full terminal response parsing would require WebSocket message handling.
   */
  dsr(param: string | number = 0, callback?: (err?: Error, data?: any) => void, dec?: boolean): void {
    const code = dec
      ? ESC + `\[?${param}n`
      : ESC + `\[${param}n`;

    this.write(code);

    // Simplified callback support - full response parsing deferred
    if (callback) {
      // In browser environment, terminal responses come via different mechanism
      callback(new Error('Terminal response parsing not implemented for browser environment'));
    }
  }

  /**
   * Device Status Report (alias for dsr)
   */
  deviceStatus(param: string | number = 0, callback?: (err?: Error, data?: any) => void, dec?: boolean): void {
    this.dsr(param, callback, dec);
  }

  /**
   * Get Cursor Position via Device Status Report
   * Sends CSI 6 n (Report Cursor Position)
   * EXACT from neo-blessed program.js lines 2765-2767
   *
   * NOTE: Response would be CSI r ; c R where r=row, c=column
   * Full parsing requires terminal response handler (deferred for browser)
   */
  getCursor(callback?: (err?: Error, data?: { x: number; y: number }) => void): void {
    this.deviceStatus(6, callback as any, false);
  }

  /**
   * Send Device Attributes (Primary DA) - CSI Ps c
   * Queries terminal identification and capabilities
   * EXACT from neo-blessed program.js lines 2934-2938
   *
   * Response format: CSI ? Pp ; Pv ; Pc c
   * - Pp = terminal type (0=VT100, 1=VT220, etc.)
   * - Pv = firmware version
   * - Pc = ROM cartridge number (usually 0)
   */
  da(param: string | number = '', callback?: (err?: Error, data?: any) => void): void {
    this.write(ESC + `\[${param}c`);

    if (callback) {
      // Response parsing deferred for browser environment
      callback(new Error('Terminal response parsing not implemented for browser environment'));
    }
  }

  /**
   * Send Device Attributes (alias for da)
   */
  sendDeviceAttributes(param: string | number = '', callback?: (err?: Error, data?: any) => void): void {
    this.da(param, callback);
  }

  /**
   * Bind terminal response handler
   * NOTE: Simplified stub for browser environment
   *
   * In neo-blessed, this sets up stdin data parsing for terminal responses.
   * In browser, terminal responses come via WebSocket from BBS backend.
   * Full implementation would require integration with Screen/Socket event handling.
   * STUB from neo-blessed program.js lines 1005-1017
   */
  bindResponse(): void {
    if (this._boundResponse) return;
    this._boundResponse = true;

    // Browser-based response handling would hook into WebSocket events
    // Deferred: requires Screen integration and response parsing logic
  }

  /**
   * Send query and wait for terminal response
   * NOTE: Simplified stub for browser environment
   * STUB from neo-blessed program.js lines 1572-1618
   */
  response(
    name: string | ((err?: Error, data?: any) => void),
    text?: string | ((err?: Error, data?: any) => void),
    callback?: (err?: Error, data?: any) => void
  ): void {
    // Handle overloaded parameters
    if (typeof name === 'function') {
      callback = name;
      text = undefined;
      name = '';
    } else if (typeof text === 'function') {
      callback = text;
      text = name;
      name = '';
    }

    this.bindResponse();

    if (typeof text === 'string') {
      this.write(text);
    }

    if (callback) {
      // Response handling deferred for browser environment
      callback(new Error('Terminal response parsing not implemented for browser environment'));
    }
  }

  private _boundResponse: boolean = false;

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
    this.write(ESC + `\[${params.join(';')}m`);
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
    this.write(enable ? attrs.underline : ESC + '[24m');
  }

  /**
   * Set blink
   */
  blink(enable: boolean = true): void {
    this._attr.blink = enable;
    this.write(enable ? attrs.blink : ESC + '[25m');
  }

  /**
   * Set inverse
   */
  inverse(enable: boolean = true): void {
    this._attr.inverse = enable;
    this.write(enable ? attrs.inverse : ESC + '[27m');
  }

  /**
   * Set invisible
   */
  invisible(enable: boolean = true): void {
    this._attr.invisible = enable;
    this.write(enable ? attrs.invisible : ESC + '[28m');
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
    this.write(ESC + '[22m');
  }

  // ============================================================================
  // Alternate Screen
  // ============================================================================

  /**
   * Use alternate screen buffer
   */
  alternateBuffer(): void {
    this.write(ESC + '[?1049h');
  }

  /**
   * Use normal screen buffer
   */
  normalBuffer(): void {
    this.write(ESC + '[?1049l');
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
    this.write(ESC + '[?1000h');

    // Enable any-event mouse tracking (hover without button press)
    // 1002h = motion only with button held, 1003h = all motion
    this.write(ESC + '[?1003h');

    // Enable SGR mouse mode (better encoding)
    this.write(ESC + '[?1006h');
  }

  /**
   * Disable mouse reporting
   */
  disableMouse(): void {
    if (!this._mouseEnabled) return;
    this._mouseEnabled = false;

    this.write(ESC + '[?1006l');
    this.write(ESC + '[?1003l');
    this.write(ESC + '[?1000l');
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
    // Try SGR mouse format first: ESC[<b;x;yM or ESC[<b;x;ym
    const sgrRegex = new RegExp(ESC + '\\[<(\\d+);(\\d+);(\\d+)([Mm])');
    const sgrMatch = buf.match(sgrRegex);
    if (sgrMatch) {
      return this.parseSGRMouse(sgrMatch);
    }

    // Try X10 mouse format: ESC[Mcbxcy (3 encoded bytes)
    const x10Regex = new RegExp(ESC + '\\[M(.)(.)(.)');
    const x10Match = buf.match(x10Regex);
    if (x10Match) {
      return this.parseX10Mouse(x10Match);
    }

    return null;
  }

  private parseSGRMouse(match: RegExpMatchArray): MouseEvent {
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

    return { x, y, action, button: buttonName, shift, meta, ctrl };
  }

  private parseX10Mouse(match: RegExpMatchArray): MouseEvent {
    const cb = match[1].charCodeAt(0) - 32;
    const x = match[2].charCodeAt(0) - 32 - 1;
    const y = match[3].charCodeAt(0) - 32 - 1;

    const shift = !!(cb & 4);
    const meta = !!(cb & 8);
    const ctrl = !!(cb & 16);

    const b = cb & 3;
    let action: 'mousedown' | 'mouseup' | 'mousemove' | 'wheeldown' | 'wheelup';
    let buttonName: 'left' | 'middle' | 'right' | undefined;

    if (cb & 64) {
      // Mouse wheel
      action = b === 0 ? 'wheelup' : 'wheeldown';
      buttonName = undefined;
    } else if (cb & 32) {
      // Mouse motion (or button release in some terminals)
      action = 'mousemove';
      buttonName = b === 0 ? 'left' : b === 1 ? 'middle' : b === 2 ? 'right' : undefined;
    } else if (b === 3) {
      // Button release in X10 mode
      action = 'mouseup';
      buttonName = undefined;
    } else {
      action = 'mousedown';
      buttonName = b === 0 ? 'left' : b === 1 ? 'middle' : b === 2 ? 'right' : undefined;
    }

    return { x, y, action, button: buttonName, shift, meta, ctrl };
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

    // Handle special single-byte keys FIRST (before general single-character handling)
    // These are special keys that have length 1 but are NOT printable characters
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
    if (buf === ESC) {
      key.name = 'escape';
      key.full = 'escape';
      return key;
    }

    // Single character (printable characters and control codes 1-26)
    if (buf.length === 1) {
      const ch = buf.charCodeAt(0);

      // Control characters (Ctrl+A through Ctrl+Z = 1-26)
      if (ch >= 1 && ch <= 26) {
        key.name = String.fromCharCode(ch + 96);
        key.ctrl = true;
        if (key.name === 'm') key.name = 'enter';
        if (key.name === 'i') key.name = 'tab';
        if (key.name === 'h') key.name = 'backspace';
        key.full = 'C-' + key.name;
        return key;
      }

      // Space character
      if (ch === 32) {
        key.name = 'space';
        key.full = 'space';
        return key;
      }

      // Regular printable character (ASCII 33-126)
      if (ch >= 33 && ch <= 126) {
        key.name = buf;
        if (buf >= 'A' && buf <= 'Z') {
          key.shift = true;
        }
        key.full = key.name;
        return key;
      }

      // Other single-byte characters (extended ASCII, etc.)
      key.name = buf;
      key.full = key.name;
      return key;
    }

    // Escape sequences
    if (buf[0] === ESC) {
      // Meta + character
      if (buf.length === 2) {
        key.meta = true;
        key.name = buf[1];
        key.full = 'M-' + key.name;
        return key;
      }

      // SS3 sequences (F1-F4 on many terminals like xterm)
      if (buf[1] === 'O' && buf.length === 3) {
        const final = buf[2];
        if (final === 'P') key.name = 'f1';
        else if (final === 'Q') key.name = 'f2';
        else if (final === 'R') key.name = 'f3';
        else if (final === 'S') key.name = 'f4';
        // Arrow keys via SS3
        else if (final === 'A') key.name = 'up';
        else if (final === 'B') key.name = 'down';
        else if (final === 'C') key.name = 'right';
        else if (final === 'D') key.name = 'left';
        else if (final === 'H') key.name = 'home';
        else if (final === 'F') key.name = 'end';

        if (key.name) {
          key.full = key.name;
          return key;
        }
      }

      // CSI sequences
      if (buf[1] === '[') {
        const csiRegex = new RegExp('^' + ESC + '\\[([0-9;]+)?([A-Za-z~])');
        const match = buf.match(csiRegex);
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
          // xterm modifier encoding: 1=none, 2=shift, 3=alt, 4=shift+alt, 5=ctrl, etc.
          // Formula: modifier = 1 + (shift?1:0) + (alt?2:0) + (ctrl?4:0)
          // To decode: (mod - 1) & bitmask
          if (params.length > 1) {
            const mod = params[1];
            if (mod && mod > 1) {
              const decoded = mod - 1;
              key.shift = !!(decoded & 1);
              key.meta = !!(decoded & 2);
              key.ctrl = !!(decoded & 4);
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

    // Fallback: Set full key name with modifiers
    key.full = '';
    if (key.ctrl) key.full += 'C-';
    if (key.meta) key.full += 'M-';
    if (key.shift && key.name.length > 1) key.full += 'S-';
    key.full += key.name;

    return key;
  }

  private _inputBuffer: string = '';
  private _escTimer: any = null;

  /**
   * Handle input data
   */
  _handleData(data: string): void {
    if (this._paused) return;

    // Clear escape timer if more data arrives
    if (this._escTimer) {
      clearTimeout(this._escTimer);
      this._escTimer = null;
    }

    this._inputBuffer += data;

    while (this._inputBuffer.length > 0) {
      let processed = false;
      // ... (rest of method remains mostly same but handles break differently)

      // 1. Check for JSON mouse events from web frontend (Socket.IO)
      if (this._inputBuffer.startsWith('{')) {
        const endIdx = this._inputBuffer.indexOf('}');
        if (endIdx !== -1) {
          const chunk = this._inputBuffer.slice(0, endIdx + 1);
          try {
            const json = JSON.parse(chunk);
            console.log(`[Program._handleData] JSON parsed: type=${json.type} mouseEnabled=${this._mouseEnabled}`);
            
            if (json.type === 'key' || (json.name && !json.type)) {
              // Handle JSON key event
              const keyEvent: KeyEvent = {
                name: json.name || '',
                ctrl: json.ctrl || false,
                meta: json.meta || json.alt || false,
                shift: json.shift || false,
                sequence: json.sequence || json.raw || '',
                full: json.full || json.name || '',
              };
              this._emitKey(keyEvent.sequence, keyEvent);
              processed = true;
            } else if (json.type && this._mouseEnabled) {
              const mouseEvent = this.parseJsonMouseEvent(json);
              console.log(`[Program._handleData] mouseEvent=${JSON.stringify(mouseEvent)}`);
              if (mouseEvent) {
                this._lastMouseEvent = mouseEvent;
                for (const handler of this.mouseHandlers) {
                  handler(mouseEvent);
                }
                this.emit('mouse', mouseEvent);
                console.log(`[Program._handleData] Emitted mouse event`);
              }
              processed = true;
            } else if (json.type && !this._mouseEnabled) {
              console.log(`[Program._handleData] Mouse NOT enabled, ignoring JSON mouse event`);
              processed = true;
            }
            
            this._inputBuffer = this._inputBuffer.slice(endIdx + 1);
            if (processed) continue;
          } catch (e) {
            // Not valid JSON yet or ever, fall through to normal parsing if it's not JSON
          }
        } else if (this._inputBuffer.length > 1000) {
          // Safety: clear buffer if it looks like broken JSON
          this._inputBuffer = this._inputBuffer.slice(1);
          continue;
        } else {
          // Wait for more data
          break;
        }
      }

      // 2. Check for mouse events (SGR: ESC[< or X10: ESC[M)
      // SGR Mouse: ESC[<b;x;yM or ESC[<b;x;ym
      const sgrMouseRegex = new RegExp('^' + ESC + '\\[<(\\d+);(\\d+);(\\d+)([Mm])');
      const sgrMatch = this._inputBuffer.match(sgrMouseRegex);
      if (sgrMatch) {
        if (this._mouseEnabled) {
          const mouseEvent = this.parseSGRMouse(sgrMatch);
          this._lastMouseEvent = mouseEvent;
          for (const handler of this.mouseHandlers) {
            handler(mouseEvent);
          }
          this.emit('mouse', mouseEvent);
        }
        this._inputBuffer = this._inputBuffer.slice(sgrMatch[0].length);
        processed = true;
        continue;
      }

      // X10 Mouse: ESC[Mcbxcy (3 encoded bytes after ESC[M)
      if (this._inputBuffer.startsWith(ESC + '[M')) {
        if (this._inputBuffer.length >= 6) {
          const x10MouseRegex = new RegExp('^' + ESC + '\\[M(.)(.)(.)');
          const x10Match = this._inputBuffer.match(x10MouseRegex);
          if (x10Match && this._mouseEnabled) {
            const mouseEvent = this.parseX10Mouse(x10Match);
            this._lastMouseEvent = mouseEvent;
            for (const handler of this.mouseHandlers) {
              handler(mouseEvent);
            }
            this.emit('mouse', mouseEvent);
          }
          this._inputBuffer = this._inputBuffer.slice(6);
          processed = true;
          continue;
        } else {
          // Wait for more data
          break;
        }
      }

      // 3. Parse key/escape sequences
      // Long sequences first
      const keyRegex = new RegExp('^(' + ESC + '\\[([0-9;]+)?([A-Za-z~])|' + ESC + 'O[PQRSABCDHF]|' + ESC + '[a-zA-Z0-9])');
      const keyMatch = this._inputBuffer.match(keyRegex);
      if (keyMatch) {
        const key = this.parseKey(keyMatch[0]);
        if (key) {
          this._emitKey(keyMatch[0], key);
        }
        this._inputBuffer = this._inputBuffer.slice(keyMatch[0].length);
        processed = true;
        continue;
      }

      // Special single bytes
      const singleByte = this._inputBuffer[0];
      if (singleByte === '\r' || singleByte === '\n' || singleByte === '\t' ||
          singleByte === ESC || singleByte === '\x7f' || singleByte === '\x08' ||
          (singleByte.charCodeAt(0) >= 1 && singleByte.charCodeAt(0) <= 26) ||
          (singleByte.charCodeAt(0) >= 32 && singleByte.charCodeAt(0) <= 126)) {

        // Handle ESC as potential start of sequence (if not followed by anything, it's Esc)
        if (singleByte === ESC && this._inputBuffer.length === 1) {
          // Wait to see if more comes
          // But after a short timeout we should treat it as Esc
          this._escTimer = setTimeout(() => {
            this._escTimer = null;
            if (this._inputBuffer === ESC) {
              const key = this.parseKey(ESC);
              if (key) {
                this._emitKey(ESC, key);
              }
              this._inputBuffer = '';
            }
          }, 100);
          break;
        }

        const key = this.parseKey(singleByte);
        if (key) {
          this._emitKey(singleByte, key);
        }
        this._inputBuffer = this._inputBuffer.slice(1);
        processed = true;
        continue;
      }

      // Unknown byte, just discard to avoid infinite loop
      if (!processed) {
        this._inputBuffer = this._inputBuffer.slice(1);
      }
    }
  }

  /**
   * Helper to emit key events
   */
  private _emitKey(data: string, key: KeyEvent): void {
    const handlers = this.keyHandlers.get(key.full || key.name);
    if (handlers) {
      for (const handler of handlers) {
        handler(data, key);
      }
    }
    this.emit('keypress', data, key);
    this.emit('data', data);
  }

  /**
   * Parse JSON mouse event from web frontend
   */
  private parseJsonMouseEvent(json: any): MouseEvent | null {
    const x = json.x ?? 0;
    const y = json.y ?? 0;
    const shift = json.shift ?? false;
    const ctrl = json.ctrl ?? false;
    const meta = json.alt ?? false;

    let action: 'mousedown' | 'mouseup' | 'mousemove' | 'wheeldown' | 'wheelup';
    let button: 'left' | 'middle' | 'right' | undefined;

    switch (json.type) {
      case 'mouse-down':
      case 'mouse-click':  // Frontend sends 'mouse-click' which is the same as 'mouse-down'
        action = 'mousedown';
        button = json.button === 0 ? 'left' : json.button === 1 ? 'middle' : json.button === 2 ? 'right' : 'left';
        break;
      case 'mouse-up':
        action = 'mouseup';
        button = json.button === 0 ? 'left' : json.button === 1 ? 'middle' : json.button === 2 ? 'right' : 'left';
        break;
      case 'mouse-move':
      case 'mouse-drag':
      case 'mouse-hover':
        action = 'mousemove';
        button = json.button === 0 ? 'left' : json.button === 1 ? 'middle' : json.button === 2 ? 'right' : undefined;
        break;
      case 'mouse-wheel':
        action = json.deltaY < 0 ? 'wheelup' : 'wheeldown';
        button = undefined;
        break;
      default:
        return null;
    }

    return { x, y, action, button, shift, ctrl, meta };
  }

  // ============================================================================
  // Title
  // ============================================================================

  /**
   * Set terminal title
   */
  setTitle(title: string): void {
    this.write(ESC + `]0;${title}` + String.fromCharCode(7));
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
