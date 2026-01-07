/**
 * Drawille Canvas - Canvas 2D API for Terminal
 *
 * 1:1 port from drawille-canvas-blessed-contrib/index.js
 * Provides HTML5 Canvas-like API using Braille characters
 */
import { DrawilleCanvas } from './drawille';
import { bresenham } from './bresenham';
import { vec2, mat2d } from './gl-matrix';
import { getColorCode } from './utils';
/**
 * Standard terminal colors
 */
export const colors = {
    black: 0,
    red: 1,
    green: 2,
    yellow: 3,
    blue: 4,
    magenta: 5,
    cyan: 6,
    white: 7
};
/**
 * Get foreground color ANSI code
 */
function getFgCode(color) {
    // String Value
    if (typeof color === 'string' && color !== 'normal') {
        return '\x1b[3' + colors[color] + 'm';
    }
    // RGB Value
    else if (Array.isArray(color) && color.length === 3) {
        return '\x1b[38;5;' + getColorCode(color) + 'm';
    }
    // Number
    else if (typeof color === 'number') {
        return '\x1b[38;5;' + color + 'm';
    }
    // Default
    else {
        return '\x1b[39m';
    }
}
/**
 * Get background color ANSI code
 */
function getBgCode(color) {
    // String Value
    if (typeof color === 'string' && color !== 'normal') {
        return '\x1b[4' + colors[color] + 'm';
    }
    // RGB Value
    else if (Array.isArray(color) && color.length === 3) {
        return '\x1b[48;5;' + getColorCode(color) + 'm';
    }
    // Number
    else if (typeof color === 'number') {
        return '\x1b[48;5;' + color + 'm';
    }
    // Default
    else {
        return '\x1b[49m';
    }
}
/**
 * Bresenham line with callback
 */
function br(p1, p2) {
    return bresenham(Math.floor(p1[0]), Math.floor(p1[1]), Math.floor(p2[0]), Math.floor(p2[1]));
}
/**
 * Triangle filling algorithm
 */
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
/**
 * Quad (rectangle) drawing using two triangles
 */
function quad(m, x, y, w, h, f) {
    const p1 = vec2.transformMat2d(vec2.create(), vec2.fromValues(x, y), m);
    const p2 = vec2.transformMat2d(vec2.create(), vec2.fromValues(x + w, y), m);
    const p3 = vec2.transformMat2d(vec2.create(), vec2.fromValues(x, y + h), m);
    const p4 = vec2.transformMat2d(vec2.create(), vec2.fromValues(x + w, y + h), m);
    triangle(p1, p2, p3, f);
    triangle(p3, p2, p4, f);
}
/**
 * Add point to path
 */
function addPoint(m, p, x, y, s) {
    const v = vec2.transformMat2d(vec2.create(), vec2.fromValues(x, y), m);
    p.push({
        point: [Math.floor(v[0]), Math.floor(v[1])],
        stroke: s
    });
}
/**
 * Canvas 2D Context
 * Provides HTML5 Canvas-like API using Braille characters
 */
export class Context {
    constructor(width, height, canvasClass) {
        // Use EnhancedDrawilleCanvas by default for color support
        const CanvasClass = canvasClass || EnhancedDrawilleCanvas;
        this._canvas = new CanvasClass(width, height);
        this.canvas = this._canvas; // compatibility
        this._matrix = mat2d.create();
        this._stack = [];
        this._currentPath = [];
        this.lineWidth = 1;
    }
    /**
     * Get canvas context (for compatibility)
     */
    getContext() {
        return this;
    }
    // ============================================================================
    // Styles
    // ============================================================================
    set fillStyle(val) {
        this._canvas.fontFg = Array.isArray(val) ? getColorCode(val) : val;
    }
    set strokeStyle(val) {
        this._canvas.color = Array.isArray(val) ? getColorCode(val) : val;
    }
    // ============================================================================
    // Rectangles
    // ============================================================================
    clearRect(x, y, w, h) {
        quad(this._matrix, x, y, w, h, this._canvas.unset.bind(this._canvas));
    }
    fillRect(x, y, w, h) {
        quad(this._matrix, x, y, w, h, this._canvas.set.bind(this._canvas));
    }
    strokeRect(x, y, w, h) {
        // Stub - implement if needed
    }
    // ============================================================================
    // Transform
    // ============================================================================
    save() {
        this._stack.push(mat2d.clone(this._matrix));
    }
    restore() {
        const top = this._stack.pop();
        if (!top)
            return;
        this._matrix = top;
    }
    translate(x, y) {
        mat2d.translate(this._matrix, this._matrix, vec2.fromValues(x, y));
    }
    rotate(a) {
        mat2d.rotate(this._matrix, this._matrix, (a / 180) * Math.PI);
    }
    scale(x, y) {
        mat2d.scale(this._matrix, this._matrix, vec2.fromValues(x, y));
    }
    transform(a, b, c, d, e, f) {
        // Stub
    }
    setTransform(a, b, c, d, e, f) {
        // Stub
    }
    resetTransform() {
        this._matrix = mat2d.create();
    }
    // ============================================================================
    // Paths
    // ============================================================================
    beginPath() {
        this._currentPath = [];
    }
    closePath() {
        // Original implementation is commented out in source
    }
    moveTo(x, y) {
        addPoint(this._matrix, this._currentPath, x, y, false);
    }
    lineTo(x, y) {
        addPoint(this._matrix, this._currentPath, x, y, true);
    }
    quadraticCurveTo(cpx, cpy, x, y) {
        // Stub
    }
    bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y) {
        // Stub
    }
    arcTo(x1, y1, x2, y2, radius) {
        // Stub
    }
    rect(x, y, w, h) {
        // Stub
    }
    arc(x, y, radius, startAngle, endAngle, anticlockwise) {
        // Stub
    }
    ellipse(x, y, radiusX, radiusY, rotation, startAngle, endAngle, anticlockwise) {
        // Stub
    }
    // ============================================================================
    // Drawing Paths
    // ============================================================================
    fill() {
        if (this._currentPath.length < 3)
            return;
        // Get all points in the path
        const points = this._currentPath.map(p => ({
            x: Math.floor(p.point[0]),
            y: Math.floor(p.point[1])
        }));
        // Find bounding box
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
        // For very thin polygons (1-2 pixels tall), use outline drawing
        // This handles degenerate cases where scanline fill fails
        if (maxY - minY <= 2) {
            // Draw all edges using bresenham to ensure visibility
            for (let i = 0; i < points.length; i++) {
                const p1 = points[i];
                const p2 = points[(i + 1) % points.length];
                bresenham(p1.x, p1.y, p2.x, p2.y, set);
            }
            // Also fill any horizontal spans
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
        // Standard scanline fill algorithm for larger polygons
        for (let y = minY; y <= maxY; y++) {
            // Find intersections with all edges
            const intersections = [];
            for (let i = 0; i < points.length; i++) {
                const p1 = points[i];
                const p2 = points[(i + 1) % points.length];
                // Skip horizontal edges
                if (p1.y === p2.y)
                    continue;
                // Check if edge crosses this scanline (using inclusive lower bound)
                const yMin = Math.min(p1.y, p2.y);
                const yMax = Math.max(p1.y, p2.y);
                // Edge crosses if scanline is within edge's y range (exclusive of top vertex)
                if (y >= yMin && y < yMax) {
                    // Calculate x intersection using linear interpolation
                    const t = (y - p1.y) / (p2.y - p1.y);
                    const x = p1.x + t * (p2.x - p1.x);
                    intersections.push(Math.floor(x));
                }
            }
            // Sort intersections
            intersections.sort((a, b) => a - b);
            // Fill between pairs of intersections
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
                bresenham(cur.point[0], cur.point[1], nex.point[0], nex.point[1], set);
            }
        }
    }
    drawFocusIfNeeded(element) {
        // Stub
    }
    clip() {
        // Stub
    }
    isPointInPath(x, y) {
        // Stub
        return false;
    }
    isPointInStroke(x, y) {
        // Stub
        return false;
    }
    // ============================================================================
    // Text
    // ============================================================================
    fillText(str, x, y) {
        const v = vec2.transformMat2d(vec2.create(), vec2.fromValues(x, y), this._matrix);
        this._canvas.writeText(str, Math.floor(v[0]), Math.floor(v[1]));
    }
    strokeText(str, x, y, maxWidth) {
        // Stub
    }
    measureText(str) {
        return this._canvas.measureText(str);
    }
    // ============================================================================
    // Images
    // ============================================================================
    drawImage(...args) {
        // Stub
    }
    // ============================================================================
    // Image Data
    // ============================================================================
    createImageData(sw, sh) {
        // Stub
        return null;
    }
    getImageData(sx, sy, sw, sh) {
        // Stub
        return null;
    }
    putImageData(imageData, dx, dy) {
        // Stub
    }
    // ============================================================================
    // Gradients and Patterns
    // ============================================================================
    createLinearGradient(x0, y0, x1, y1) {
        // Stub
        return null;
    }
    createRadialGradient(x0, y0, r0, x1, y1, r1) {
        // Stub
        return null;
    }
    createPattern(image, repetition) {
        // Stub
        return null;
    }
    // ============================================================================
    // Line Styles
    // ============================================================================
    setLineDash(segments) {
        // Stub
    }
    getLineDash() {
        // Stub
        return [];
    }
    // ============================================================================
    // Legacy Methods (from original stubs)
    // ============================================================================
    setAlpha(alpha) {
        // Stub
    }
    setCompositeOperation(operation) {
        // Stub
    }
    setLineWidth(width) {
        this.lineWidth = width;
    }
    setLineCap(cap) {
        // Stub
    }
    setLineJoin(join) {
        // Stub
    }
    setMiterLimit(limit) {
        // Stub
    }
    clearShadow() {
        // Stub
    }
    setStrokeColor(color) {
        this.strokeStyle = color;
    }
    setFillColor(color) {
        this.fillStyle = color;
    }
    drawImageFromRect(image, ...args) {
        // Stub
    }
    setShadow(offsetX, offsetY, blur, color) {
        // Stub
    }
    getContextAttributes() {
        // Stub
        return null;
    }
}
/**
 * Enhanced Canvas with writeText support
 * Extends DrawilleCanvas with color-aware text rendering
 */
class EnhancedDrawilleCanvas extends DrawilleCanvas {
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
/**
 * Canvas factory
 * Creates a canvas with getContext() method
 */
export class Canvas {
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
// Default export
export default Context;
