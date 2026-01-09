/**
 * BigText - Large ASCII text widget using figlet-style fonts
 *
 * Responsive features:
 * - Switches to simpler font on mobile
 */
import { Box } from './box';
export class BigText extends Box {
    constructor(options = {}) {
        super({
            ...options,
            width: options.width || 'shrink',
            height: options.height || 'shrink',
        });
        this.text = '';
        this._isMobileMode = false;
        this.text = options.text || '';
        this.font = options.font || 'standard';
        this.fch = options.fch || '#';
        this.updateContent();
    }
    /**
     * Generate big text from input string
     */
    generateBigText() {
        switch (this.font) {
            case 'banner':
                return this.generateBanner();
            case 'block':
                return this.generateBlock();
            case 'simple':
                return this.generateSimple();
            default:
                return this.generateStandard();
        }
    }
    /**
     * Generate standard 5-line ASCII art
     */
    generateStandard() {
        const patterns = {
            A: [
                '  ###  ',
                ' #   # ',
                '#     #',
                '#######',
                '#     #',
            ],
            B: [
                '######',
                '#     #',
                '######',
                '#     #',
                '######',
            ],
            C: [
                ' ##### ',
                '#     #',
                '#      ',
                '#     #',
                ' ##### ',
            ],
            // Add more letters as needed...
            ' ': [
                '   ',
                '   ',
                '   ',
                '   ',
                '   ',
            ],
        };
        const lines = ['', '', '', '', ''];
        const chars = this.text.toUpperCase().split('');
        for (const char of chars) {
            const pattern = patterns[char] || patterns[' '];
            for (let i = 0; i < 5; i++) {
                lines[i] += pattern[i] + ' ';
            }
        }
        return lines.join('\n');
    }
    /**
     * Generate banner style (3-line)
     */
    generateBanner() {
        const patterns = {
            A: [
                ' ### ',
                '# # #',
                '#####',
            ],
            B: [
                '#### ',
                '#### ',
                '#### ',
            ],
            // Simplified patterns
            ' ': [
                '  ',
                '  ',
                '  ',
            ],
        };
        const lines = ['', '', ''];
        const chars = this.text.toUpperCase().split('');
        for (const char of chars) {
            const pattern = patterns[char] || patterns[' '];
            for (let i = 0; i < 3; i++) {
                lines[i] += pattern[i] + ' ';
            }
        }
        return lines.join('\n');
    }
    /**
     * Generate block style (filled rectangles)
     */
    generateBlock() {
        const width = 5;
        const height = 5;
        const ch = this.fch;
        const lines = [];
        for (let i = 0; i < height; i++) {
            let line = '';
            for (const char of this.text) {
                line += ch.repeat(width) + ' ';
            }
            lines.push(line);
        }
        return lines.join('\n');
    }
    /**
     * Generate simple double-height text
     */
    generateSimple() {
        const topLine = this.text.split('').map(c => c + ' ').join('');
        const bottomLine = topLine;
        return topLine + '\n' + bottomLine;
    }
    /**
     * Update content with generated big text
     */
    updateContent() {
        const bigText = this.generateBigText();
        this.setContent(bigText);
    }
    /**
     * Set text content
     */
    setText(text) {
        this.text = text;
        this.updateContent();
        if (this.screen) {
            this.screen.render();
        }
    }
    /**
     * Get text content
     */
    getText() {
        return this.text;
    }
    /**
     * Set font style
     */
    setFont(font) {
        this.font = font;
        this.updateContent();
        if (this.screen) {
            this.screen.render();
        }
    }
    /**
     * Set fill character
     */
    setFillChar(ch) {
        this.fch = ch;
        this.updateContent();
        if (this.screen) {
            this.screen.render();
        }
    }
    // ============================================================================
    // Responsive Lifecycle Hooks
    // ============================================================================
    _handleBreakpointChange(breakpoint, previousBreakpoint, state) {
        super._handleBreakpointChange(breakpoint, previousBreakpoint, state);
        if (state.isMobile && !this._isMobileMode) {
            this._enterMobileMode();
        }
        else if (!state.isMobile && this._isMobileMode) {
            this._exitMobileMode();
        }
        this.updateContent();
        this.emit('breakpoint-change', breakpoint, previousBreakpoint);
    }
    _enterMobileMode() {
        this._isMobileMode = true;
        // Save desktop font and switch to simpler font for mobile
        this._desktopFont = this.font;
        if (this.font === 'standard' || this.font === 'block') {
            this.font = 'simple';
        }
    }
    _exitMobileMode() {
        this._isMobileMode = false;
        // Restore desktop font
        if (this._desktopFont) {
            this.font = this._desktopFont;
            this._desktopFont = undefined;
        }
    }
}
