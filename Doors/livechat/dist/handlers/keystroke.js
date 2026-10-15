"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KeystrokeHandler = void 0;
/** Keystroke handler for real-time char-by-char display */
class KeystrokeHandler {
    constructor(onKeystroke, onEnter) {
        this.buffer = '';
        this.onKeystroke = onKeystroke;
        this.onEnter = onEnter;
    }
    /** Handle incoming keystroke */
    handle(data) {
        if (data.length === 1 && data >= ' ' && data <= '~') {
            this.buffer += data;
            this.onKeystroke(data);
        }
        else if (data === '\x7f' || data === '\b') {
            if (this.buffer.length > 0) {
                this.buffer = this.buffer.slice(0, -1);
                this.onKeystroke('BACKSPACE');
            }
        }
        else if (data === '\r' || data === '\n') {
            if (this.buffer.trim()) {
                this.onEnter(this.buffer);
            }
            this.buffer = '';
        }
    }
    /** Get current buffer */
    getBuffer() {
        return this.buffer;
    }
    /** Clear buffer */
    clear() {
        this.buffer = '';
    }
}
exports.KeystrokeHandler = KeystrokeHandler;
