"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Canvas = exports.Context = exports.colors = void 0;
const drawille_1 = require("./drawille");
const bresenham_1 = require("./bresenham");
const gl_matrix_1 = require("./gl-matrix");
const utils_1 = require("./utils");
exports.colors = {
    black: 0,
    red: 1,
    green: 2,
    yellow: 3,
    blue: 4,
    magenta: 5,
    cyan: 6,
    white: 7
};
function getFgCode(color) {
    if (typeof color === 'string' && color !== 'normal') {
        return '\x1b[3' + exports.colors[color] + 'm';
    }
    else if (Array.isArray(color) && color.length === 3) {
        return '\x1b[38;5;' + (0, utils_1.getColorCode)(color) + 'm';
    }
    else if (typeof color === 'number') {
        return '\x1b[38;5;' + color + 'm';
    }
    else {
        return '\x1b[39m';
    }
}
function getBgCode(color) {
    if (typeof color === 'string' && color !== 'normal') {
        return '\x1b[4' + exports.colors[color] + 'm';
    }
    else if (Array.isArray(color) && color.length === 3) {
        return '\x1b[48;5;' + (0, utils_1.getColorCode)(color) + 'm';
    }
    else if (typeof color === 'number') {
        return '\x1b[48;5;' + color + 'm';
    }
    else {
        return '\x1b[49m';
    }
}
function br(p1, p2) {
    return (0, bresenham_1.bresenham)(Math.floor(p1[0]), Math.floor(p1[1]), Math.floor(p2[0]), Math.floor(p2[1]));
}
function triangle(pa, pb, pc, f) {
    const a = br(pb, pc);
    const b = br(pa, pc);
    const c = br(pa, pb);
    const s = a
        .concat(b)
        .concat(c)
        .sort(function (a, b) {
        if (a.y === b.y) {
            return a.x - b.x;
        }
        return a.y - b.y;
    });
    for (let i = 0; i < s.length - 1; i++) {
        const cur = s[i];
        const nex = s[i + 1];
        if (cur.y === nex.y) {
            for (let j = cur.x; j <= nex.x; j++) {
                f(j, cur.y);
            }
        }
        else {
            f(cur.x, cur.y);
        }
    }
}
function quad(m, x, y, w, h, f) {
    const p1 = gl_matrix_1.vec2.transformMat2d(gl_matrix_1.vec2.create(), gl_matrix_1.vec2.fromValues(x, y), m);
    const p2 = gl_matrix_1.vec2.transformMat2d(gl_matrix_1.vec2.create(), gl_matrix_1.vec2.fromValues(x + w, y), m);
    const p3 = gl_matrix_1.vec2.transformMat2d(gl_matrix_1.vec2.create(), gl_matrix_1.vec2.fromValues(x, y + h), m);
    const p4 = gl_matrix_1.vec2.transformMat2d(gl_matrix_1.vec2.create(), gl_matrix_1.vec2.fromValues(x + w, y + h), m);
    triangle(p1, p2, p3, f);
    triangle(p3, p2, p4, f);
}
function addPoint(m, p, x, y, s) {
    const v = gl_matrix_1.vec2.transformMat2d(gl_matrix_1.vec2.create(), gl_matrix_1.vec2.fromValues(x, y), m);
    p.push({
        point: [Math.floor(v[0]), Math.floor(v[1])],
        stroke: s
    });
}
class Context {
    constructor(width, height, canvasClass) {
        const CanvasClass = canvasClass || EnhancedDrawilleCanvas;
        this._canvas = new CanvasClass(width, height);
        this.canvas = this._canvas;
        this._matrix = gl_matrix_1.mat2d.create();
        this._stack = [];
        this._currentPath = [];
        this.lineWidth = 1;
    }
    getContext() {
        return this;
    }
    set fillStyle(val) {
        this._canvas.fontFg = Array.isArray(val) ? (0, utils_1.getColorCode)(val) : val;
    }
    set strokeStyle(val) {
        this._canvas.color = Array.isArray(val) ? (0, utils_1.getColorCode)(val) : val;
    }
    clearRect(x, y, w, h) {
        quad(this._matrix, x, y, w, h, this._canvas.unset.bind(this._canvas));
    }
    fillRect(x, y, w, h) {
        quad(this._matrix, x, y, w, h, this._canvas.set.bind(this._canvas));
    }
    strokeRect(x, y, w, h) {
    }
    save() {
        this._stack.push(gl_matrix_1.mat2d.clone(this._matrix));
    }
    restore() {
        const top = this._stack.pop();
        if (!top)
            return;
        this._matrix = top;
    }
    translate(x, y) {
        gl_matrix_1.mat2d.translate(this._matrix, this._matrix, gl_matrix_1.vec2.fromValues(x, y));
    }
    rotate(a) {
        gl_matrix_1.mat2d.rotate(this._matrix, this._matrix, (a / 180) * Math.PI);
    }
    scale(x, y) {
        gl_matrix_1.mat2d.scale(this._matrix, this._matrix, gl_matrix_1.vec2.fromValues(x, y));
    }
    transform(a, b, c, d, e, f) {
    }
    setTransform(a, b, c, d, e, f) {
    }
    resetTransform() {
        this._matrix = gl_matrix_1.mat2d.create();
    }
    beginPath() {
        this._currentPath = [];
    }
    closePath() {
    }
    moveTo(x, y) {
        addPoint(this._matrix, this._currentPath, x, y, false);
    }
    lineTo(x, y) {
        addPoint(this._matrix, this._currentPath, x, y, true);
    }
    quadraticCurveTo(cpx, cpy, x, y) {
    }
    bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y) {
    }
    arcTo(x1, y1, x2, y2, radius) {
    }
    rect(x, y, w, h) {
    }
    arc(x, y, radius, startAngle, endAngle, anticlockwise) {
    }
    ellipse(x, y, radiusX, radiusY, rotation, startAngle, endAngle, anticlockwise) {
    }
    fill() {
        if (this._currentPath.length < 3)
            return;
        const points = this._currentPath.map(p => ({
            x: Math.floor(p.point[0]),
            y: Math.floor(p.point[1])
        }));
        let minY = Infinity, maxY = -Infinity;
        let minX = Infinity, maxX = -Infinity;
        for (const p of points) {
            if (p.y < minY)
                minY = p.y;
            if (p.y > maxY)
                maxY = p.y;
            if (p.x < minX)
                minX = p.x;
            if (p.x > maxX)
                maxX = p.x;
        }
        const set = this._canvas.set.bind(this._canvas);
        if (maxY - minY <= 2) {
            for (let i = 0; i < points.length; i++) {
                const p1 = points[i];
                const p2 = points[(i + 1) % points.length];
                (0, bresenham_1.bresenham)(p1.x, p1.y, p2.x, p2.y, set);
            }
            for (let y = minY; y <= maxY; y++) {
                const xVals = [];
                for (const p of points) {
                    if (p.y === y)
                        xVals.push(p.x);
                }
                if (xVals.length >= 2) {
                    const xMin = Math.min(...xVals);
                    const xMax = Math.max(...xVals);
                    for (let x = xMin; x <= xMax; x++) {
                        set(x, y);
                    }
                }
            }
            return;
        }
        for (let y = minY; y <= maxY; y++) {
            const intersections = [];
            for (let i = 0; i < points.length; i++) {
                const p1 = points[i];
                const p2 = points[(i + 1) % points.length];
                if (p1.y === p2.y)
                    continue;
                const yMin = Math.min(p1.y, p2.y);
                const yMax = Math.max(p1.y, p2.y);
                if (y >= yMin && y < yMax) {
                    const t = (y - p1.y) / (p2.y - p1.y);
                    const x = p1.x + t * (p2.x - p1.x);
                    intersections.push(Math.floor(x));
                }
            }
            intersections.sort((a, b) => a - b);
            for (let i = 0; i < intersections.length - 1; i += 2) {
                for (let x = intersections[i]; x <= intersections[i + 1]; x++) {
                    set(x, y);
                }
            }
        }
    }
    stroke() {
        if (this.lineWidth === 0)
            return;
        const set = this._canvas.set.bind(this._canvas);
        for (let i = 0; i < this._currentPath.length - 1; i++) {
            const cur = this._currentPath[i];
            const nex = this._currentPath[i + 1];
            if (nex.stroke) {
                (0, bresenham_1.bresenham)(cur.point[0], cur.point[1], nex.point[0], nex.point[1], set);
            }
        }
    }
    drawFocusIfNeeded(element) {
    }
    clip() {
    }
    isPointInPath(x, y) {
        return false;
    }
    isPointInStroke(x, y) {
        return false;
    }
    fillText(str, x, y) {
        const v = gl_matrix_1.vec2.transformMat2d(gl_matrix_1.vec2.create(), gl_matrix_1.vec2.fromValues(x, y), this._matrix);
        this._canvas.writeText(str, Math.floor(v[0]), Math.floor(v[1]));
    }
    strokeText(str, x, y, maxWidth) {
    }
    measureText(str) {
        return this._canvas.measureText(str);
    }
    drawImage(...args) {
    }
    createImageData(sw, sh) {
        return null;
    }
    getImageData(sx, sy, sw, sh) {
        return null;
    }
    putImageData(imageData, dx, dy) {
    }
    createLinearGradient(x0, y0, x1, y1) {
        return null;
    }
    createRadialGradient(x0, y0, r0, x1, y1, r1) {
        return null;
    }
    createPattern(image, repetition) {
        return null;
    }
    setLineDash(segments) {
    }
    getLineDash() {
        return [];
    }
    setAlpha(alpha) {
    }
    setCompositeOperation(operation) {
    }
    setLineWidth(width) {
        this.lineWidth = width;
    }
    setLineCap(cap) {
    }
    setLineJoin(join) {
    }
    setMiterLimit(limit) {
    }
    clearShadow() {
    }
    setStrokeColor(color) {
        this.strokeStyle = color;
    }
    setFillColor(color) {
        this.fillStyle = color;
    }
    drawImageFromRect(image, ...args) {
    }
    setShadow(offsetX, offsetY, blur, color) {
    }
    getContextAttributes() {
        return null;
    }
}
exports.Context = Context;
class EnhancedDrawilleCanvas extends drawille_1.DrawilleCanvas {
    writeText(str, x, y) {
        const coord = this.getCoord(x, y);
        for (let i = 0; i < str.length; i++) {
            this.chars[coord + i] = str[i];
        }
        const bg = getBgCode(this.fontBg);
        const fg = getFgCode(this.fontFg);
        this.chars[coord] = fg + bg + this.chars[coord];
        this.chars[coord + str.length - 1] += '\x1b[39m\x1b[49m';
    }
    set(x, y) {
        if (!(x >= 0 && x < this.width && y >= 0 && y < this.height)) {
            return;
        }
        const coord = this.getCoord(x, y);
        const map = [
            [0x1, 0x8],
            [0x2, 0x10],
            [0x4, 0x20],
            [0x40, 0x80]
        ];
        const mask = map[y % 4][x % 2];
        this.content[coord] |= mask;
        this.colors[coord] = typeof this.color === 'string' ? getFgCode(this.color) : this.color;
        this.chars[coord] = null;
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
                const colorCode = this.colors[i] || '';
                result.push(colorCode + String.fromCharCode(0x2800 + this.content[i]) + '\x1b[39m');
            }
        }
        result.push(delimiter);
        return result.join('');
    }
}
class Canvas {
    constructor(width, height, canvasClass) {
        this.width = width;
        this.height = height;
        this.canvasClass = canvasClass;
    }
    getContext() {
        if (!this.ctx) {
            this.ctx = new Context(this.width, this.height, this.canvasClass);
        }
        return this.ctx;
    }
}
exports.Canvas = Canvas;
exports.default = Context;
