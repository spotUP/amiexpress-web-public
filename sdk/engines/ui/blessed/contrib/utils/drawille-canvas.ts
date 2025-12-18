/**
 * Drawille Canvas - Canvas 2D API for Terminal
 *
 * 1:1 port from drawille-canvas-blessed-contrib/index.js
 * Provides HTML5 Canvas-like API using Braille characters
 */

import { DrawilleCanvas, colors as drawilleColors } from './drawille';
import { bresenham } from './bresenham';
import { vec2, mat2d, Vec2, Mat2d } from './gl-matrix';
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
function getFgCode(color: string | number | number[]): string {
  // String Value
  if (typeof color === 'string' && color !== 'normal') {
    return '\x1b[3' + colors[color as keyof typeof colors] + 'm';
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
function getBgCode(color: string | number | number[]): string {
  // String Value
  if (typeof color === 'string' && color !== 'normal') {
    return '\x1b[4' + colors[color as keyof typeof colors] + 'm';
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
function br(p1: Vec2, p2: Vec2): ReturnType<typeof bresenham> {
  return bresenham(Math.floor(p1[0]), Math.floor(p1[1]), Math.floor(p2[0]), Math.floor(p2[1]));
}

/**
 * Triangle filling algorithm
 */
function triangle(pa: Vec2, pb: Vec2, pc: Vec2, f: (x: number, y: number) => void): void {
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
    } else {
      f(cur.x, cur.y);
    }
  }
}

/**
 * Quad (rectangle) drawing using two triangles
 */
function quad(
  m: Mat2d,
  x: number,
  y: number,
  w: number,
  h: number,
  f: (x: number, y: number) => void
): void {
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
function addPoint(
  m: Mat2d,
  p: Array<{ point: [number, number]; stroke: boolean }>,
  x: number,
  y: number,
  s: boolean
): void {
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
  _canvas: DrawilleCanvas;
  canvas: DrawilleCanvas;
  _matrix: Mat2d;
  _stack: Mat2d[];
  _currentPath: Array<{ point: [number, number]; stroke: boolean }>;
  lineWidth: number;

  constructor(width: number, height: number, canvasClass?: typeof DrawilleCanvas) {
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
  getContext(): Context {
    return this;
  }

  // ============================================================================
  // Styles
  // ============================================================================

  set fillStyle(val: string | number | number[]) {
    this._canvas.fontFg = Array.isArray(val) ? getColorCode(val) as number : val;
  }

  set strokeStyle(val: string | number | number[]) {
    this._canvas.color = Array.isArray(val) ? getColorCode(val) as number : val;
  }

  // ============================================================================
  // Rectangles
  // ============================================================================

  clearRect(x: number, y: number, w: number, h: number): void {
    quad(this._matrix, x, y, w, h, this._canvas.unset.bind(this._canvas));
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    quad(this._matrix, x, y, w, h, this._canvas.set.bind(this._canvas));
  }

  strokeRect(x: number, y: number, w: number, h: number): void {
    // Stub - implement if needed
  }

  // ============================================================================
  // Transform
  // ============================================================================

  save(): void {
    this._stack.push(mat2d.clone(this._matrix));
  }

  restore(): void {
    const top = this._stack.pop();
    if (!top) return;
    this._matrix = top;
  }

  translate(x: number, y: number): void {
    mat2d.translate(this._matrix, this._matrix, vec2.fromValues(x, y));
  }

  rotate(a: number): void {
    mat2d.rotate(this._matrix, this._matrix, (a / 180) * Math.PI);
  }

  scale(x: number, y: number): void {
    mat2d.scale(this._matrix, this._matrix, vec2.fromValues(x, y));
  }

  transform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    // Stub
  }

  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    // Stub
  }

  resetTransform(): void {
    this._matrix = mat2d.create();
  }

  // ============================================================================
  // Paths
  // ============================================================================

  beginPath(): void {
    this._currentPath = [];
  }

  closePath(): void {
    // Original implementation is commented out in source
  }

  moveTo(x: number, y: number): void {
    addPoint(this._matrix, this._currentPath, x, y, false);
  }

  lineTo(x: number, y: number): void {
    addPoint(this._matrix, this._currentPath, x, y, true);
  }

  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void {
    // Stub
  }

  bezierCurveTo(
    cp1x: number,
    cp1y: number,
    cp2x: number,
    cp2y: number,
    x: number,
    y: number
  ): void {
    // Stub
  }

  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void {
    // Stub
  }

  rect(x: number, y: number, w: number, h: number): void {
    // Stub
  }

  arc(
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number,
    anticlockwise?: boolean
  ): void {
    // Stub
  }

  ellipse(
    x: number,
    y: number,
    radiusX: number,
    radiusY: number,
    rotation: number,
    startAngle: number,
    endAngle: number,
    anticlockwise?: boolean
  ): void {
    // Stub
  }

  // ============================================================================
  // Drawing Paths
  // ============================================================================

  fill(): void {
    if (this._currentPath.length < 3) return;

    // Get all points in the path
    const points = this._currentPath.map(p => ({
      x: Math.floor(p.point[0]),
      y: Math.floor(p.point[1])
    }));

    // Find bounding box
    let minY = Infinity, maxY = -Infinity;
    let minX = Infinity, maxX = -Infinity;
    for (const p of points) {
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
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
        const xVals: number[] = [];
        for (const p of points) {
          if (p.y === y) xVals.push(p.x);
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
      const intersections: number[] = [];
      for (let i = 0; i < points.length; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];

        // Skip horizontal edges
        if (p1.y === p2.y) continue;

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

  stroke(): void {
    if (this.lineWidth === 0) return;

    const set = this._canvas.set.bind(this._canvas);
    for (let i = 0; i < this._currentPath.length - 1; i++) {
      const cur = this._currentPath[i];
      const nex = this._currentPath[i + 1];
      if (nex.stroke) {
        bresenham(cur.point[0], cur.point[1], nex.point[0], nex.point[1], set);
      }
    }
  }

  drawFocusIfNeeded(element?: any): void {
    // Stub
  }

  clip(): void {
    // Stub
  }

  isPointInPath(x: number, y: number): boolean {
    // Stub
    return false;
  }

  isPointInStroke(x: number, y: number): boolean {
    // Stub
    return false;
  }

  // ============================================================================
  // Text
  // ============================================================================

  fillText(str: string, x: number, y: number): void {
    const v = vec2.transformMat2d(vec2.create(), vec2.fromValues(x, y), this._matrix);
    this._canvas.writeText(str, Math.floor(v[0]), Math.floor(v[1]));
  }

  strokeText(str: string, x: number, y: number, maxWidth?: number): void {
    // Stub
  }

  measureText(str: string): { width: number } {
    return this._canvas.measureText(str);
  }

  // ============================================================================
  // Images
  // ============================================================================

  drawImage(...args: any[]): void {
    // Stub
  }

  // ============================================================================
  // Image Data
  // ============================================================================

  createImageData(sw: number, sh: number): any {
    // Stub
    return null;
  }

  getImageData(sx: number, sy: number, sw: number, sh: number): any {
    // Stub
    return null;
  }

  putImageData(imageData: any, dx: number, dy: number): void {
    // Stub
  }

  // ============================================================================
  // Gradients and Patterns
  // ============================================================================

  createLinearGradient(x0: number, y0: number, x1: number, y1: number): any {
    // Stub
    return null;
  }

  createRadialGradient(
    x0: number,
    y0: number,
    r0: number,
    x1: number,
    y1: number,
    r1: number
  ): any {
    // Stub
    return null;
  }

  createPattern(image: any, repetition: string): any {
    // Stub
    return null;
  }

  // ============================================================================
  // Line Styles
  // ============================================================================

  setLineDash(segments: number[]): void {
    // Stub
  }

  getLineDash(): number[] {
    // Stub
    return [];
  }

  // ============================================================================
  // Legacy Methods (from original stubs)
  // ============================================================================

  setAlpha(alpha: number): void {
    // Stub
  }

  setCompositeOperation(operation: string): void {
    // Stub
  }

  setLineWidth(width: number): void {
    this.lineWidth = width;
  }

  setLineCap(cap: string): void {
    // Stub
  }

  setLineJoin(join: string): void {
    // Stub
  }

  setMiterLimit(limit: number): void {
    // Stub
  }

  clearShadow(): void {
    // Stub
  }

  setStrokeColor(color: string | number | number[]): void {
    this.strokeStyle = color;
  }

  setFillColor(color: string | number | number[]): void {
    this.fillStyle = color;
  }

  drawImageFromRect(image: any, ...args: any[]): void {
    // Stub
  }

  setShadow(offsetX: number, offsetY: number, blur: number, color: string): void {
    // Stub
  }

  getContextAttributes(): any {
    // Stub
    return null;
  }
}

/**
 * Enhanced Canvas with writeText support
 * Extends DrawilleCanvas with color-aware text rendering
 */
class EnhancedDrawilleCanvas extends DrawilleCanvas {
  writeText(str: string, x: number, y: number): void {
    const coord = this.getCoord(x, y);
    for (let i = 0; i < str.length; i++) {
      this.chars[coord + i] = str[i];
    }

    const bg = getBgCode(this.fontBg);
    const fg = getFgCode(this.fontFg);

    this.chars[coord] = fg + bg + this.chars[coord];
    this.chars[coord + str.length - 1] += '\x1b[39m\x1b[49m';
  }

  set(x: number, y: number): void {
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

  frame(delimiter?: string): string {
    delimiter = delimiter || '\n';
    const result: string[] = [];

    for (let i = 0, j = 0; i < this.content.length; i++, j++) {
      if (j === this.width / 2) {
        result.push(delimiter);
        j = 0;
      }
      if (this.chars[i]) {
        result.push(this.chars[i]!);
      } else if (this.content[i] === 0) {
        result.push(' ');
      } else {
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
  private ctx?: Context;
  private width: number;
  private height: number;
  private canvasClass?: typeof DrawilleCanvas;

  constructor(width: number, height: number, canvasClass?: typeof DrawilleCanvas) {
    this.width = width;
    this.height = height;
    this.canvasClass = canvasClass;
  }

  getContext(): Context {
    if (!this.ctx) {
      this.ctx = new Context(this.width, this.height, this.canvasClass);
    }
    return this.ctx;
  }
}

// Default export
export default Context;
