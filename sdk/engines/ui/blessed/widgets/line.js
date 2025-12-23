"use strict";
/**
 * Line - Horizontal or vertical line widget
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Line = void 0;
const box_1 = require("./box");
class Line extends box_1.Box {
    constructor(options = {}) {
        const orientation = options.orientation || 'horizontal';
        super({
            ...options,
            width: orientation === 'horizontal' ? options.width || '100%' : options.width || 1,
            height: orientation === 'horizontal' ? options.height || 1 : options.height || '100%',
        });
        this.orientation = orientation;
        this.lineChar = options.ch || this.getLineChar(options.type || 'line');
        this.updateContent();
    }
    /**
     * Get line character based on type
     */
    getLineChar(type) {
        if (this.orientation === 'horizontal') {
            const chars = {
                line: '─',
                heavy: '━',
                double: '═',
                ascii: '-',
            };
            return chars[type];
        }
        else {
            const chars = {
                line: '│',
                heavy: '┃',
                double: '║',
                ascii: '|',
            };
            return chars[type];
        }
    }
    /**
     * Update line content
     */
    updateContent() {
        if (this.orientation === 'horizontal') {
            const width = this.iwidth;
            this.setContent(this.lineChar.repeat(width));
        }
        else {
            const height = this.iheight;
            const lines = [];
            for (let i = 0; i < height; i++) {
                lines.push(this.lineChar);
            }
            this.setContent(lines.join('\n'));
        }
    }
    /**
     * Set line character
     */
    setChar(ch) {
        this.lineChar = ch;
        this.updateContent();
        if (this.screen) {
            this.screen.render();
        }
    }
    /**
     * Set line type
     */
    setType(type) {
        this.lineChar = this.getLineChar(type);
        this.updateContent();
        if (this.screen) {
            this.screen.render();
        }
    }
}
exports.Line = Line;
