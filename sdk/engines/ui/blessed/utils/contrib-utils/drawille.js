"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DrawilleCanvas = exports.colors = void 0;
const map = [
    [0x1, 0x8],
    [0x2, 0x10],
    [0x4, 0x20],
    [0x40, 0x80]
];
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
    getCoord(x, y) {
        x = Math.floor(x);
        y = Math.floor(y);
        const nx = Math.floor(x / 2);
        const ny = Math.floor(y / 4);
        const coord = nx + (this.width / 2) * ny;
        return coord;
    }
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
    clear() {
        this.content.fill(0);
    }
    measureText(str) {
        return { width: str.length * 2 + 2 };
    }
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
