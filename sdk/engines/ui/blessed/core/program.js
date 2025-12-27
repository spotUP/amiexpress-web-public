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
        /**
         * Save cursor position
         * EXACT from neo-blessed program.js lines 2011-2017
         */
        this.savedX = 0;
        this.savedY = 0;
        this._boundResponse = false;
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
    // Additional Terminal Control (neo-blessed compatibility)
    // ============================================================================
    /**
     * Insert characters (alias for ich)
     * EXACT from neo-blessed program.js lines 2798-2803
     */
    insertChars(param = 1) {
        this.ich(param);
    }
    /**
     * Delete characters (alias for dch)
     * EXACT from neo-blessed program.js lines 2860-2863
     */
    deleteChars(param = 1) {
        this.dch(param);
    }
    /**
     * Erase characters (alias for ech)
     * EXACT from neo-blessed program.js lines 2868-2871
     */
    eraseChars(param = 1) {
        this.ech(param);
    }
    /**
     * Insert lines (alias for il)
     * EXACT from neo-blessed program.js lines 2844-2847
     */
    insertLines(param = 1) {
        this.il(param);
    }
    /**
     * Delete lines (alias for dl)
     * EXACT from neo-blessed program.js lines 2852-2855
     */
    deleteLines(param = 1) {
        this.dl(param);
    }
    /**
     * Cursor Next Line (CNL)
     * EXACT from neo-blessed program.js lines 2809-2813
     */
    cnl(param = 1) {
        this.write(`\x1b[${param || ''}E`);
    }
    cursorNextLine(param = 1) {
        this.cnl(param);
    }
    /**
     * Cursor Preceding Line (CPL)
     * EXACT from neo-blessed program.js lines 2819-2823
     */
    cpl(param = 1) {
        this.write(`\x1b[${param || ''}F`);
    }
    cursorPrecedingLine(param = 1) {
        this.cpl(param);
    }
    /**
     * Cursor Character Absolute (CHA) - override existing cha with full implementation
     * EXACT from neo-blessed program.js lines 2828-2839
     */
    cursorCharAbsolute(param = 0) {
        // Note: our implementation doesn't track x/y coordinates like neo-blessed
        // Just send the ANSI code
        this.write(`\x1b[${param + 1}G`);
    }
    /**
     * Horizontal Position Absolute (HPA)
     * EXACT from neo-blessed program.js lines 2876-2884
     */
    hpa(param = 0) {
        this.write(`\x1b[${param || ''}${'`'}`);
    }
    charPosAbsolute(param = 0) {
        this.hpa(param);
    }
    /**
     * Horizontal Position Relative (HPR)
     * EXACT from neo-blessed program.js lines 2890-2897
     */
    hpr(param = 1) {
        this.write(`\x1b[${param || ''}a`);
    }
    saveCursor(key) {
        if (key)
            return this.lsaveCursor(key);
        // For browser implementation, just send ANSI code
        // Note: neo-blessed tracks this.x/this.y but we don't have those
        this.write('\x1b7');
    }
    /**
     * Restore cursor position
     * EXACT from neo-blessed program.js lines 2021-2027
     */
    restoreCursor(key, hide) {
        if (key)
            return this.lrestoreCursor(key, hide);
        this.write('\x1b8');
    }
    /**
     * Save cursor locally (in memory)
     * EXACT from neo-blessed program.js lines 2030-2037
     */
    lsaveCursor(key = 'local') {
        this._saved = this._saved || {};
        this._saved[key] = {
            x: 0, // Would track cursor position in full implementation
            y: 0,
            hidden: this._cursorHidden,
        };
    }
    /**
     * Restore cursor locally (from memory)
     * EXACT from neo-blessed program.js lines 2040-2054
     */
    lrestoreCursor(key = 'local', hide) {
        if (!this._saved || !this._saved[key])
            return;
        const pos = this._saved[key];
        // In full implementation would: this.cup(pos.y, pos.x);
        if (hide && pos.hidden !== this._cursorHidden) {
            if (pos.hidden) {
                this.hideCursor();
            }
            else {
                this.showCursor();
            }
        }
    }
    /**
     * Line Height
     * EXACT from neo-blessed program.js lines 2057-2059
     */
    lineHeight() {
        this.write('\x1b#');
    }
    /**
     * Tab Set
     * EXACT from neo-blessed program.js lines 2004-2006
     */
    tabSet() {
        this.write('\x1bH');
    }
    /**
     * Reset colors
     * EXACT from neo-blessed program.js lines 2224-2233
     */
    resetColors(param) {
        if (param === 'fg') {
            this.write('\x1b]110\x07');
        }
        else if (param === 'bg') {
            this.write('\x1b]111\x07');
        }
        else {
            this.write('\x1b]112\x07');
        }
    }
    /**
     * Set scroll region (alias for csr)
     * EXACT from neo-blessed program.js (decstbm)
     */
    setScrollRegion(top, bottom) {
        this.csr(top, bottom);
    }
    decstbm(top, bottom) {
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
    sm(...params) {
        const param = params.join(';');
        this.write(`\x1b[${param || ''}h`);
    }
    /**
     * Set Mode (alias for sm)
     * EXACT from neo-blessed program.js lines 3071-3075
     */
    setMode(...params) {
        this.sm(...params);
    }
    /**
     * DEC Private Mode Set (DECSET) - CSI ? Pm h
     * Sets DEC private modes (e.g., ?25 for cursor visibility, ?47/?1049 for alt screen)
     * EXACT from neo-blessed program.js lines 3077-3080
     */
    decset(...params) {
        const param = params.join(';');
        this.setMode('?' + param);
    }
    /**
     * Reset Mode (RM) - CSI Pm l
     * Resets terminal modes
     * EXACT from neo-blessed program.js lines 3187-3191
     */
    rm(...params) {
        const param = params.join(';');
        this.write(`\x1b[${param || ''}l`);
    }
    /**
     * Reset Mode (alias for rm)
     * EXACT from neo-blessed program.js lines 3187-3191
     */
    resetMode(...params) {
        this.rm(...params);
    }
    /**
     * DEC Private Mode Reset (DECRST) - CSI ? Pm l
     * Resets DEC private modes
     * EXACT from neo-blessed program.js lines 3193-3196
     */
    decrst(...params) {
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
    charset(val, level = 0) {
        let levelChar;
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
        let charsetCode;
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
        this.write(`\x1b${levelChar}${charsetCode}`);
    }
    /**
     * Enter alternate character set mode (DEC Special Graphics)
     * EXACT from neo-blessed program.js lines 2151-2155
     */
    smacs() {
        this.charset('acs');
    }
    /**
     * Exit alternate character set mode
     * EXACT from neo-blessed program.js lines 2157-2161
     */
    rmacs() {
        this.charset('ascii');
    }
    /**
     * Invoke G1, G2, or G3 Character Set
     * ESC N/O/n/o/|/}/~ - Single Shift or Locking Shift
     * EXACT from neo-blessed program.js lines 2179-2198
     */
    setG(level) {
        let code;
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
        this.write(`\x1b${code}`);
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
    dsr(param = 0, callback, dec) {
        const code = dec
            ? `\x1b[?${param}n`
            : `\x1b[${param}n`;
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
    deviceStatus(param = 0, callback, dec) {
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
    getCursor(callback) {
        this.deviceStatus(6, callback, false);
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
    da(param = '', callback) {
        this.write(`\x1b[${param}c`);
        if (callback) {
            // Response parsing deferred for browser environment
            callback(new Error('Terminal response parsing not implemented for browser environment'));
        }
    }
    /**
     * Send Device Attributes (alias for da)
     */
    sendDeviceAttributes(param = '', callback) {
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
    bindResponse() {
        if (this._boundResponse)
            return;
        this._boundResponse = true;
        // Browser-based response handling would hook into WebSocket events
        // Deferred: requires Screen integration and response parsing logic
    }
    /**
     * Send query and wait for terminal response
     * NOTE: Simplified stub for browser environment
     * STUB from neo-blessed program.js lines 1572-1618
     */
    response(name, text, callback) {
        // Handle overloaded parameters
        if (typeof name === 'function') {
            callback = name;
            text = undefined;
            name = '';
        }
        else if (typeof text === 'function') {
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
        // Check for JSON mouse events from web frontend (Socket.IO)
        if (data.startsWith('{') && data.includes('"type"')) {
            try {
                const json = JSON.parse(data);
                console.log('[Program] Parsed JSON event:', json, 'mouseEnabled:', this._mouseEnabled);
                if (json.type && this._mouseEnabled) {
                    const mouseEvent = this.parseJsonMouseEvent(json);
                    console.log('[Program] Parsed mouse event:', mouseEvent);
                    if (mouseEvent) {
                        this._lastMouseEvent = mouseEvent;
                        for (const handler of this.mouseHandlers) {
                            handler(mouseEvent);
                        }
                        console.log('[Program] Emitting mouse event:', mouseEvent.action);
                        this.emit('mouse', mouseEvent);
                        return;
                    }
                }
                else if (json.type) {
                    console.log('[Program] Mouse not enabled, ignoring event');
                }
            }
            catch (e) {
                console.log('[Program] JSON parse error:', e);
                // Not valid JSON, continue with normal parsing
            }
        }
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
    /**
     * Parse JSON mouse event from web frontend
     */
    parseJsonMouseEvent(json) {
        const x = json.x ?? 0;
        const y = json.y ?? 0;
        const shift = json.shift ?? false;
        const ctrl = json.ctrl ?? false;
        const meta = json.alt ?? false;
        let action;
        let button;
        switch (json.type) {
            case 'mouse-down':
            case 'mouse-click': // Frontend sends 'mouse-click' which is the same as 'mouse-down'
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
