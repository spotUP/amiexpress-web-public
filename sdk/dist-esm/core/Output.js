/**
 * Output - ANSI Output Abstraction Layer
 *
 * Provides clean API for terminal output with ANSI escape codes
 */
export class Output {
    constructor(socket) {
        this.socket = socket;
    }
    // ===== Basic Output =====
    async write(text) {
        this.socket.emit('ansi-output', text);
    }
    async writeLine(text) {
        this.socket.emit('ansi-output', text + '\r\n');
    }
    // ===== Screen Control =====
    async clear() {
        this.socket.emit('ansi-output', '\x1b[2J\x1b[H');
    }
    async moveCursor(row, col) {
        this.socket.emit('ansi-output', `\x1b[${row};${col}H`);
    }
    async saveCursor() {
        this.socket.emit('ansi-output', '\x1b[s');
    }
    async restoreCursor() {
        this.socket.emit('ansi-output', '\x1b[u');
    }
    async hideCursor() {
        this.socket.emit('ansi-output', '\x1b[?25l');
    }
    async showCursor() {
        this.socket.emit('ansi-output', '\x1b[?25h');
    }
    async eraseToEndOfLine() {
        this.socket.emit('ansi-output', '\x1b[K');
    }
    async eraseToEndOfScreen() {
        this.socket.emit('ansi-output', '\x1b[J');
    }
    async scroll(lines) {
        const code = lines > 0 ? `\x1b[${lines}S` : `\x1b[${-lines}T`;
        this.socket.emit('ansi-output', code);
    }
    // ===== Color and Style =====
    async setForeground(color) {
        this.socket.emit('ansi-output', `\x1b[0;3${color}m`);
    }
    async setBackground(color) {
        this.socket.emit('ansi-output', `\x1b[4${color}m`);
    }
    async setStyle(style) {
        this.socket.emit('ansi-output', `\x1b[${style}m`);
    }
    async reset() {
        this.socket.emit('ansi-output', '\x1b[0m');
    }
    // ===== Convenience Methods =====
    async coloredText(text, fg, bg) {
        await this.setForeground(fg);
        if (bg !== undefined) {
            await this.setBackground(bg);
        }
        await this.write(text);
        await this.reset();
    }
    async centerText(text, width = 80) {
        const padding = Math.max(0, Math.floor((width - text.length) / 2));
        await this.write(' '.repeat(padding) + text);
    }
    async box(text, width = 80) {
        const top = '+' + '-'.repeat(width - 2) + '+';
        const padded = '| ' + text.padEnd(width - 4) + ' |';
        const bottom = '+' + '-'.repeat(width - 2) + '+';
        await this.writeLine(top);
        await this.writeLine(padded);
        await this.writeLine(bottom);
    }
    async progressBar(current, total, width = 50) {
        const percent = Math.min(100, Math.max(0, Math.floor((current / total) * 100)));
        const filled = Math.floor((percent / 100) * width);
        const empty = width - filled;
        const bar = '[' + '='.repeat(filled) + ' '.repeat(empty) + ']';
        await this.write(`${bar} ${percent}%`);
    }
}
