/**
 * Program - Terminal control and I/O layer
 *
 * Browser-adapted version of blessed Program class.
 * Handles all terminal control sequences, input parsing, and output buffering.
 */
import { EventEmitter } from './events';
import { cursor, attrs, fg, bg } from './colors';
/**
 * Program class - Low-level terminal control
 *
 * Provides methods for cursor control, colors, attributes, and input handling.
 * This is the foundation that Screen builds upon.
 */
export class Program extends EventEmitter {
    constructor(options = {}) {
        super();
        // Dimensions
        this.cols = 80;
        this.rows = 24;
        // Output buffer
        this._buf = '';
        this._flush = null;
        // State
        this._exiting = false;
        // Cursor state
        this._cursorHidden = true;
        this._cursorShape = null;
        this.x = 0;
        this.y = 0;
        // Attribute state
        this._attr = {
            bold: false,
            underline: false,
            blink: false,
            inverse: false,
            invisible: false,
            fg: -1,
            bg: -1,
        };
        // Input state
        this._paused = false;
        this._readInput = false;
        // Key and mouse handlers
        this.keyHandlers = new Map();
        this.mouseHandlers = [];
        // Mouse state
        this._mouseEnabled = false;
        this._lastMouseEvent = null;
        this.options = options;
        this.terminal = options.terminal || 'ansi';
        this.zero = options.zero || false;
        this._buffer = options.buffer !== false;
        // Set output callback
        this.output = options.output || ((data) => {
            if (typeof process !== 'undefined' && process.stdout) {
                process.stdout.write(data);
            }
            else {
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
    write(data) {
        if (this._exiting)
            return;
        if (this._buffer) {
            this._buf += data;
            if (!this._flush) {
                this._flush = setTimeout(() => {
                    this.flush();
                }, 0);
            }
        }
        else {
            this.output(data);
        }
    }
    /**
     * Flush buffered output
     */
    flush() {
        if (!this._buf)
            return;
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
    echo(text) {
        this.write(text);
    }
    // ============================================================================
    // Cursor Control
    // ============================================================================
    /**
     * Show cursor
     */
    showCursor() {
        if (!this._cursorHidden)
            return;
        this._cursorHidden = false;
        this.write(cursor.show);
    }
    /**
     * Hide cursor
     */
    hideCursor() {
        if (this._cursorHidden)
            return;
        this._cursorHidden = true;
        this.write(cursor.hide);
    }
    /**
     * Set cursor position (0-indexed)
     */
    cup(row, col) {
        this.y = row;
        this.x = col;
        this.write(cursor.pos(col, row));
    }
    /**
     * Move cursor to position (alias for cup)
     */
    pos(row, col) {
        this.cup(row, col);
    }
    /**
     * Move cursor to column
     */
    cha(col) {
        this.x = col;
        this.write(`\x1b[${col + 1}G`);
    }
    /**
     * Move cursor up
     */
    cuu(n = 1) {
        this.y = Math.max(0, this.y - n);
        if (n === 1) {
            this.write(cursor.up());
        }
        else {
            this.write(`\x1b[${n}A`);
        }
    }
    /**
     * Move cursor down
     */
    cud(n = 1) {
        this.y = Math.min(this.rows - 1, this.y + n);
        if (n === 1) {
            this.write(cursor.down());
        }
        else {
            this.write(`\x1b[${n}B`);
        }
    }
    /**
     * Move cursor forward
     */
    cuf(n = 1) {
        this.x = Math.min(this.cols - 1, this.x + n);
        this.write(`\x1b[${n}C`);
    }
    /**
     * Move cursor backward
     */
    cub(n = 1) {
        this.x = Math.max(0, this.x - n);
        this.write(`\x1b[${n}D`);
    }
    /**
     * Save cursor position
     */
    sc() {
        this.write('\x1b[s');
    }
    /**
     * Restore cursor position
     */
    rc() {
        this.write('\x1b[u');
    }
    /**
     * Set cursor shape
     */
    cursorShape(shape, blink = false) {
        this._cursorShape = shape;
        let code;
        if (shape === 'block') {
            code = blink ? 1 : 2;
        }
        else if (shape === 'underline') {
            code = blink ? 3 : 4;
        }
        else { // line
            code = blink ? 5 : 6;
        }
        this.write(`\x1b[${code} q`);
    }
    /**
     * Reset cursor shape
     */
    cursorReset() {
        this._cursorShape = null;
        this.write('\x1b[0 q');
    }
    // ============================================================================
    // Screen Control
    // ============================================================================
    /**
     * Clear screen
     */
    clear() {
        this.write('\x1b[2J');
        this.cup(0, 0);
    }
    /**
     * Clear from cursor to end of screen
     */
    ed(param) {
        if (param === 'above') {
            this.write('\x1b[1J');
        }
        else if (param === 'all') {
            this.write('\x1b[2J');
        }
        else {
            this.write('\x1b[J');
        }
    }
    /**
     * Clear from cursor to end of line
     */
    el(param) {
        if (param === 'left') {
            this.write('\x1b[1K');
        }
        else if (param === 'all') {
            this.write('\x1b[2K');
        }
        else {
            this.write('\x1b[K');
        }
    }
    /**
     * Erase characters
     */
    ech(n = 1) {
        this.write(`\x1b[${n}X`);
    }
    /**
     * Insert lines
     */
    il(n = 1) {
        this.write(`\x1b[${n}L`);
    }
    /**
     * Delete lines
     */
    dl(n = 1) {
        this.write(`\x1b[${n}M`);
    }
    /**
     * Insert characters
     */
    ich(n = 1) {
        this.write(`\x1b[${n}@`);
    }
    /**
     * Delete characters
     */
    dch(n = 1) {
        this.write(`\x1b[${n}P`);
    }
    /**
     * Set scroll region
     */
    csr(top, bottom) {
        this.write(`\x1b[${top + 1};${bottom + 1}r`);
    }
    /**
     * Reset scroll region
     */
    resetCursor() {
        this.write('\x1b[r');
    }
    /**
     * Scroll up
     */
    su(n = 1) {
        this.write(`\x1b[${n}S`);
    }
    /**
     * Scroll down
     */
    sd(n = 1) {
        this.write(`\x1b[${n}T`);
    }
    // ============================================================================
    // Attribute Methods
    // ============================================================================
    /**
     * Set SGR (Select Graphic Rendition) attributes
     */
    sgr(params) {
        if (!Array.isArray(params)) {
            params = [params];
        }
        this.write(`\x1b[${params.join(';')}m`);
    }
    /**
     * Set foreground color
     */
    fg(color) {
        this._attr.fg = color;
        this.write(fg(color));
    }
    /**
     * Set background color
     */
    bg(color) {
        this._attr.bg = color;
        this.write(bg(color));
    }
    /**
     * Set bold
     */
    bold() {
        this._attr.bold = true;
        this.write(attrs.bold);
    }
    /**
     * Set underline
     */
    ul(enable = true) {
        this._attr.underline = enable;
        this.write(enable ? attrs.underline : '\x1b[24m');
    }
    /**
     * Set blink
     */
    blink(enable = true) {
        this._attr.blink = enable;
        this.write(enable ? attrs.blink : '\x1b[25m');
    }
    /**
     * Set inverse
     */
    inverse(enable = true) {
        this._attr.inverse = enable;
        this.write(enable ? attrs.inverse : '\x1b[27m');
    }
    /**
     * Set invisible
     */
    invisible(enable = true) {
        this._attr.invisible = enable;
        this.write(enable ? attrs.invisible : '\x1b[28m');
    }
    /**
     * Reset all attributes
     */
    reset() {
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
    normal() {
        this.write('\x1b[22m');
    }
    // ============================================================================
    // Alternate Screen
    // ============================================================================
    /**
     * Use alternate screen buffer
     */
    alternateBuffer() {
        this.write('\x1b[?1049h');
    }
    /**
     * Use normal screen buffer
     */
    normalBuffer() {
        this.write('\x1b[?1049l');
    }
    /**
     * Switch to alternate buffer (alias)
     */
    smcup() {
        this.alternateBuffer();
    }
    /**
     * Switch to normal buffer (alias)
     */
    rmcup() {
        this.normalBuffer();
    }
    // ============================================================================
    // Mouse Support
    // ============================================================================
    /**
     * Enable mouse reporting
     */
    enableMouse() {
        if (this._mouseEnabled)
            return;
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
    disableMouse() {
        if (!this._mouseEnabled)
            return;
        this._mouseEnabled = false;
        this.write('\x1b[?1006l');
        this.write('\x1b[?1002l');
        this.write('\x1b[?1000l');
    }
    /**
     * Bind mouse event handler
     */
    onMouse(handler) {
        this.mouseHandlers.push(handler);
    }
    /**
     * Unbind mouse event handler
     */
    offMouse(handler) {
        const index = this.mouseHandlers.indexOf(handler);
        if (index !== -1) {
            this.mouseHandlers.splice(index, 1);
        }
    }
    /**
     * Parse mouse event from input
     */
    parseMouseEvent(buf) {
        // Try SGR mouse format first: \x1b[<b;x;yM or \x1b[<b;x;ym
        const sgrMatch = buf.match(/\x1b\[<(\d+);(\d+);(\d+)([Mm])/);
        if (sgrMatch) {
            return this.parseSGRMouse(sgrMatch);
        }
        // Try X10 mouse format: \x1b[Mcbxcy (3 encoded bytes)
        const x10Match = buf.match(/\x1b\[M(.)(.)(.)/);
        if (x10Match) {
            return this.parseX10Mouse(x10Match);
        }
        return null;
    }
    parseSGRMouse(match) {
        const button = parseInt(match[1], 10);
        const x = parseInt(match[2], 10) - 1;
        const y = parseInt(match[3], 10) - 1;
        const release = match[4] === 'm';
        // Parse button and modifiers
        const shift = !!(button & 4);
        const meta = !!(button & 8);
        const ctrl = !!(button & 16);
        const b = button & 3;
        let action;
        let buttonName;
        if (button & 64) {
            // Mouse wheel
            action = b === 0 ? 'wheelup' : 'wheeldown';
            buttonName = undefined;
        }
        else if (release) {
            action = 'mouseup';
            buttonName = b === 0 ? 'left' : b === 1 ? 'middle' : b === 2 ? 'right' : undefined;
        }
        else if (button & 32) {
            // Mouse motion
            action = 'mousemove';
            buttonName = b === 0 ? 'left' : b === 1 ? 'middle' : b === 2 ? 'right' : undefined;
        }
        else {
            action = 'mousedown';
            buttonName = b === 0 ? 'left' : b === 1 ? 'middle' : b === 2 ? 'right' : undefined;
        }
        return { x, y, action, button: buttonName, shift, meta, ctrl };
    }
    parseX10Mouse(match) {
        const cb = match[1].charCodeAt(0) - 32;
        const x = match[2].charCodeAt(0) - 32 - 1;
        const y = match[3].charCodeAt(0) - 32 - 1;
        const shift = !!(cb & 4);
        const meta = !!(cb & 8);
        const ctrl = !!(cb & 16);
        const b = cb & 3;
        let action;
        let buttonName;
        if (cb & 64) {
            // Mouse wheel
            action = b === 0 ? 'wheelup' : 'wheeldown';
            buttonName = undefined;
        }
        else if (cb & 32) {
            // Mouse motion (or button release in some terminals)
            action = 'mousemove';
            buttonName = b === 0 ? 'left' : b === 1 ? 'middle' : b === 2 ? 'right' : undefined;
        }
        else if (b === 3) {
            // Button release in X10 mode
            action = 'mouseup';
            buttonName = undefined;
        }
        else {
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
    key(keys, handler) {
        const keyList = Array.isArray(keys) ? keys : [keys];
        for (const k of keyList) {
            if (!this.keyHandlers.has(k)) {
                this.keyHandlers.set(k, []);
            }
            this.keyHandlers.get(k).push(handler);
        }
    }
    /**
     * Bind key handler (one-time)
     */
    onceKey(keys, handler) {
        const wrapper = (ch, key) => {
            this.unkey(keys, wrapper);
            handler(ch, key);
        };
        this.key(keys, wrapper);
    }
    /**
     * Unbind key handler
     */
    unkey(keys, handler) {
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
    parseKey(buf) {
        if (!buf)
            return null;
        const key = {
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
        if (buf === '\x1b') {
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
                if (key.name === 'm')
                    key.name = 'enter';
                if (key.name === 'i')
                    key.name = 'tab';
                if (key.name === 'h')
                    key.name = 'backspace';
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
        if (buf[0] === '\x1b') {
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
                if (final === 'P')
                    key.name = 'f1';
                else if (final === 'Q')
                    key.name = 'f2';
                else if (final === 'R')
                    key.name = 'f3';
                else if (final === 'S')
                    key.name = 'f4';
                // Arrow keys via SS3
                else if (final === 'A')
                    key.name = 'up';
                else if (final === 'B')
                    key.name = 'down';
                else if (final === 'C')
                    key.name = 'right';
                else if (final === 'D')
                    key.name = 'left';
                else if (final === 'H')
                    key.name = 'home';
                else if (final === 'F')
                    key.name = 'end';
                if (key.name) {
                    key.full = key.name;
                    return key;
                }
            }
            // CSI sequences
            if (buf[1] === '[') {
                const match = buf.match(/^\x1b\[([0-9;]+)?([A-Za-z~])/);
                if (match) {
                    const params = match[1] ? match[1].split(';').map(Number) : [];
                    const final = match[2];
                    // Arrow keys
                    if (final === 'A')
                        key.name = 'up';
                    else if (final === 'B')
                        key.name = 'down';
                    else if (final === 'C')
                        key.name = 'right';
                    else if (final === 'D')
                        key.name = 'left';
                    else if (final === 'H')
                        key.name = 'home';
                    else if (final === 'F')
                        key.name = 'end';
                    // Function keys and special keys
                    else if (final === '~') {
                        const code = params[0] || 0;
                        if (code === 1)
                            key.name = 'home';
                        else if (code === 2)
                            key.name = 'insert';
                        else if (code === 3)
                            key.name = 'delete';
                        else if (code === 4)
                            key.name = 'end';
                        else if (code === 5)
                            key.name = 'pageup';
                        else if (code === 6)
                            key.name = 'pagedown';
                        else if (code >= 11 && code <= 15)
                            key.name = `f${code - 10}`;
                        else if (code >= 17 && code <= 21)
                            key.name = `f${code - 11}`;
                        else if (code >= 23 && code <= 24)
                            key.name = `f${code - 12}`;
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
                    if (key.ctrl)
                        key.full += 'C-';
                    if (key.meta)
                        key.full += 'M-';
                    if (key.shift && key.name.length > 1)
                        key.full += 'S-';
                    key.full += key.name;
                    return key;
                }
            }
        }
        // Fallback: Set full key name with modifiers
        key.full = '';
        if (key.ctrl)
            key.full += 'C-';
        if (key.meta)
            key.full += 'M-';
        if (key.shift && key.name.length > 1)
            key.full += 'S-';
        key.full += key.name;
        return key;
    }
    /**
     * Handle input data
     */
    _handleData(data) {
        if (this._paused)
            return;
        // Check for mouse events (SGR: \x1b[< or X10: \x1b[M)
        if (this._mouseEnabled && (data.includes('\x1b[<') || data.includes('\x1b[M'))) {
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
    setTitle(title) {
        this.write(`\x1b]0;${title}\x07`);
    }
    // ============================================================================
    // Resize
    // ============================================================================
    /**
     * Resize terminal
     */
    resize(cols, rows) {
        if (cols !== undefined)
            this.cols = cols;
        if (rows !== undefined)
            this.rows = rows;
        this.emit('resize');
    }
    // ============================================================================
    // Control
    // ============================================================================
    /**
     * Pause input
     */
    pause() {
        this._paused = true;
    }
    /**
     * Resume input
     */
    resume() {
        this._paused = false;
    }
    /**
     * Ring bell
     */
    bell() {
        this.write('\x07');
    }
    // ============================================================================
    // Cleanup
    // ============================================================================
    /**
     * Destroy program and clean up
     */
    destroy() {
        if (this._exiting)
            return;
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
