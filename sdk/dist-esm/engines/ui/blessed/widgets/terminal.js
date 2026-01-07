/**
 * Terminal - Simple terminal emulator widget
 * Note: This is a simplified browser-compatible version
 */
import { Box } from './box';
export class Terminal extends Box {
    constructor(options = {}) {
        super({
            ...options,
            scrollable: true,
            alwaysScroll: true,
            mouse: true,
            input: true,
            style: {
                fg: 'white',
                bg: 'black',
                ...(options.style || {}),
            },
        });
        this.lines = [];
        this.cursorVisible = true;
        this.cursorTimer = null;
        this.currentLine = '';
        this.cursorPosition = 0;
        this.history = [];
        this.historyIndex = 0;
        this.prompt = '$ ';
        this.scrollback = options.scrollback || 1000;
        // Amiga-safe cursor: underscore instead of Unicode block
        this.cursor = options.cursor || '_';
        this.cursorBlink = options.cursorBlink !== false;
        this.enableInput();
        this.enableKeys();
        // Start cursor blink
        if (this.cursorBlink) {
            this.startCursorBlink();
        }
        // Initial prompt
        this.write(this.prompt);
        // Handle keyboard input
        this.on('keypress', (ch, key) => {
            this.handleKey(ch, key);
        });
    }
    /**
     * Start cursor blinking
     */
    startCursorBlink() {
        if (this.cursorTimer)
            return;
        this.cursorTimer = setInterval(() => {
            this.cursorVisible = !this.cursorVisible;
            this.updateDisplay();
        }, 500);
    }
    /**
     * Stop cursor blinking
     */
    stopCursorBlink() {
        if (this.cursorTimer) {
            clearInterval(this.cursorTimer);
            this.cursorTimer = null;
        }
    }
    /**
     * Handle key press
     */
    handleKey(ch, key) {
        if (key.name === 'return' || key.name === 'enter') {
            // Execute command
            this.executeLine();
        }
        else if (key.name === 'backspace') {
            // Delete character
            if (this.cursorPosition > 0) {
                this.currentLine =
                    this.currentLine.slice(0, this.cursorPosition - 1) +
                        this.currentLine.slice(this.cursorPosition);
                this.cursorPosition--;
                this.updateDisplay();
            }
        }
        else if (key.name === 'delete') {
            // Delete character at cursor
            if (this.cursorPosition < this.currentLine.length) {
                this.currentLine =
                    this.currentLine.slice(0, this.cursorPosition) +
                        this.currentLine.slice(this.cursorPosition + 1);
                this.updateDisplay();
            }
        }
        else if (key.name === 'left') {
            // Move cursor left
            if (this.cursorPosition > 0) {
                this.cursorPosition--;
                this.updateDisplay();
            }
        }
        else if (key.name === 'right') {
            // Move cursor right
            if (this.cursorPosition < this.currentLine.length) {
                this.cursorPosition++;
                this.updateDisplay();
            }
        }
        else if (key.name === 'home') {
            // Move to beginning
            this.cursorPosition = 0;
            this.updateDisplay();
        }
        else if (key.name === 'end') {
            // Move to end
            this.cursorPosition = this.currentLine.length;
            this.updateDisplay();
        }
        else if (key.name === 'up') {
            // Previous history
            if (this.historyIndex > 0) {
                this.historyIndex--;
                this.currentLine = this.history[this.historyIndex] || '';
                this.cursorPosition = this.currentLine.length;
                this.updateDisplay();
            }
        }
        else if (key.name === 'down') {
            // Next history
            if (this.historyIndex < this.history.length) {
                this.historyIndex++;
                this.currentLine = this.history[this.historyIndex] || '';
                this.cursorPosition = this.currentLine.length;
                this.updateDisplay();
            }
        }
        else if (ch && !key.ctrl && !key.meta) {
            // Insert character
            this.currentLine =
                this.currentLine.slice(0, this.cursorPosition) +
                    ch +
                    this.currentLine.slice(this.cursorPosition);
            this.cursorPosition++;
            this.updateDisplay();
        }
    }
    /**
     * Execute the current line
     */
    executeLine() {
        const line = this.currentLine;
        // Add to history
        if (line.trim()) {
            this.history.push(line);
            this.historyIndex = this.history.length;
        }
        // Add line to output
        this.writeLine(this.prompt + line);
        // Emit command event
        this.emit('command', line);
        // Clear current line
        this.currentLine = '';
        this.cursorPosition = 0;
        // Write new prompt
        this.write(this.prompt);
    }
    /**
     * Write text to terminal
     */
    write(text) {
        const lastLine = this.lines[this.lines.length - 1] || '';
        this.lines[this.lines.length - 1] = lastLine + text;
        while (this.lines.length > this.scrollback) {
            this.lines.shift();
        }
        this.updateDisplay();
    }
    /**
     * Write a line to terminal
     */
    writeLine(text) {
        this.lines.push(text);
        while (this.lines.length > this.scrollback) {
            this.lines.shift();
        }
        this.updateDisplay();
    }
    /**
     * Update terminal display
     */
    updateDisplay() {
        // Build display content
        const displayLines = [...this.lines];
        // Add current line with cursor
        const currentLineWithCursor = this.currentLine.slice(0, this.cursorPosition) +
            (this.cursorVisible ? this.cursor : ' ') +
            this.currentLine.slice(this.cursorPosition);
        if (displayLines.length > 0) {
            displayLines[displayLines.length - 1] += currentLineWithCursor;
        }
        else {
            displayLines.push(currentLineWithCursor);
        }
        this.setContent(displayLines.join('\n'));
        // Scroll to bottom
        this.setScrollPerc(100);
        if (this.screen) {
            this.screen.render();
        }
    }
    /**
     * Clear terminal
     */
    clear() {
        this.lines = [];
        this.currentLine = '';
        this.cursorPosition = 0;
        this.write(this.prompt);
    }
    /**
     * Reset terminal
     */
    reset() {
        this.clear();
        this.history = [];
        this.historyIndex = 0;
    }
    /**
     * Set prompt
     */
    setPrompt(prompt) {
        this.prompt = prompt;
    }
    /**
     * Get prompt
     */
    getPrompt() {
        return this.prompt;
    }
    /**
     * Get history
     */
    getHistory() {
        return [...this.history];
    }
    /**
     * Destroy and cleanup
     */
    destroy() {
        this.stopCursorBlink();
        super.destroy();
    }
}
