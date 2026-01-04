"use strict";
/**
 * Drawille - Braille Canvas for Terminal
 *
 * 1:1 port from drawille-blessed-contrib/index.js
 * Uses Unicode Braille characters (U+2800-U+28FF) for high-resolution terminal graphics
 *
 * Each Braille character represents a 2x4 pixel grid:
 * ⠁ ⠂ ⠄ ⠈ ⠐ ⠠ ⡀ ⢀
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DrawilleCanvas = exports.colors = void 0;
/**
 * Braille dot mapping for 2x4 grid
 * [y%4][x%2] = bit mask
 */
const map = [
    [0x1, 0x8], // Row 0: dots 1 and 4
    [0x2, 0x10], // Row 1: dots 2 and 5
    [0x4, 0x20], // Row 2: dots 3 and 6
    [0x40, 0x80] // Row 3: dots 7 and 8
];
/**
 * Standard terminal color codes
 */
exports.colors = {
    black: 0,
    red: 1,
    green: 2,
    yellow: 3,
    blue: 4,
    magenta: 5,
    cyan: 6,
    white: 7,
    normal: 9
};
/**
 * Braille Canvas
 * Provides high-resolution drawing using Unicode Braille characters
 */
class DrawilleCanvas {
    constructor(width, height) {
        if (width % 2 !== 0) {
            throw new Error('Width must be multiple of 2!');
        }
        if (height % 4 !== 0) {
            throw new Error('Height must be multiple of 4!');
        }
        this.width = width;
        this.height = height;
        this.content = new Uint8Array(width * height / 8);
        this.colors = new Array(width * height / 8);
        this.chars = new Array(width * height / 8);
        this.content.fill(0);
        this.fontFg = 'normal';
        this.fontBg = 'normal';
        this.color = 'normal';
    }
    /**
     * Get coordinate index in the buffer
     */
    getCoord(x, y) {
        x = Math.floor(x);
        y = Math.floor(y);
        const nx = Math.floor(x / 2);
        const ny = Math.floor(y / 4);
        const coord = nx + (this.width / 2) * ny;
        return coord;
    }
    /**
     * Set a pixel (turn on)
     */
    set(x, y) {
        if (!(x >= 0 && x < this.width && y >= 0 && y < this.height)) {
            return;
        }
        const coord = this.getCoord(x, y);
        const mask = map[y % 4][x % 2];
        this.content[coord] |= mask;
        this.colors[coord] = typeof this.color === 'string' ? exports.colors[this.color] : this.color;
        this.chars[coord] = null;
    }
    /**
     * Unset a pixel (turn off)
     */
    unset(x, y) {
        if (!(x >= 0 && x < this.width && y >= 0 && y < this.height)) {
            return;
        }
        const coord = this.getCoord(x, y);
        const mask = map[y % 4][x % 2];
        this.content[coord] &= ~mask;
        this.colors[coord] = null;
        this.chars[coord] = null;
    }
    /**
     * Toggle a pixel
     */
    toggle(x, y) {
        if (!(x >= 0 && x < this.width && y >= 0 && y < this.height)) {
            return;
        }
        const coord = this.getCoord(x, y);
        const mask = map[y % 4][x % 2];
        this.content[coord] ^= mask;
        this.colors[coord] = null;
        this.chars[coord] = null;
    }
    /**
     * Clear the entire canvas
     */
    clear() {
        this.content.fill(0);
    }
    /**
     * Measure text width
     */
    measureText(str) {
        return { width: str.length * 2 + 2 };
    }
    /**
     * Write text at position
     */
    writeText(str, x, y) {
        const coord = this.getCoord(x, y);
        for (let i = 0; i < str.length; i++) {
            this.chars[coord + i] = str[i];
        }
        const bg = typeof this.fontBg === 'string' ? exports.colors[this.fontBg] : this.fontBg;
        const fg = typeof this.fontFg === 'string' ? exports.colors[this.fontFg] : this.fontFg;
        this.chars[coord] = '\x1b[3' + fg + 'm' + '\x1b[4' + bg + 'm' + this.chars[coord];
        this.chars[coord + str.length - 1] += '\x1b[39m\x1b[49m';
    }
    /**
     * Render canvas to string
     * @param delimiter Line delimiter (default: '\n')
     * @returns Rendered canvas as string with ANSI codes
     */
    frame(delimiter) {
        delimiter = delimiter || '\n';
        const result = [];
        for (let i = 0, j = 0; i < this.content.length; i++, j++) {
            if (j === this.width / 2) {
                result.push(delimiter);
                j = 0;
            }
            if (this.chars[i]) {
                result.push(this.chars[i]);
            }
            else if (this.content[i] === 0) {
                result.push(' ');
            }
            else {
                result.push('\x1b[3' + this.colors[i] + 'm' + String.fromCharCode(0x2800 + this.content[i]) + '\x1b[39m');
            }
        }
        result.push(delimiter);
        return result.join('');
    }
}
exports.DrawilleCanvas = DrawilleCanvas;
