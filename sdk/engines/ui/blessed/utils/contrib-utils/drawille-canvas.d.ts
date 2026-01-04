/**
 * Drawille Canvas - Canvas 2D API for Terminal
 *
 * 1:1 port from drawille-canvas-blessed-contrib/index.js
 * Provides HTML5 Canvas-like API using Braille characters
 */
import { DrawilleCanvas } from './drawille';
import { Mat2d } from './gl-matrix';
/**
 * Standard terminal colors
 */
export declare const colors: {
    black: number;
    red: number;
    green: number;
    yellow: number;
    blue: number;
    magenta: number;
    cyan: number;
    white: number;
};
/**
 * Canvas 2D Context
 * Provides HTML5 Canvas-like API using Braille characters
 */
export declare class Context {
    _canvas: DrawilleCanvas;
    canvas: DrawilleCanvas;
    _matrix: Mat2d;
    _stack: Mat2d[];
    _currentPath: Array<{
        point: [number, number];
        stroke: boolean;
    }>;
    lineWidth: number;
    constructor(width: number, height: number, canvasClass?: typeof DrawilleCanvas);
    /**
     * Get canvas context (for compatibility)
     */
    getContext(): Context;
    set fillStyle(val: string | number | number[]);
    set strokeStyle(val: string | number | number[]);
    clearRect(x: number, y: number, w: number, h: number): void;
    fillRect(x: number, y: number, w: number, h: number): void;
    strokeRect(x: number, y: number, w: number, h: number): void;
    save(): void;
    restore(): void;
    translate(x: number, y: number): void;
    rotate(a: number): void;
    scale(x: number, y: number): void;
    transform(a: number, b: number, c: number, d: number, e: number, f: number): void;
    setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
    resetTransform(): void;
    beginPath(): void;
    closePath(): void;
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
    quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
    bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): void;
    arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void;
    rect(x: number, y: number, w: number, h: number): void;
    arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, anticlockwise?: boolean): void;
    ellipse(x: number, y: number, radiusX: number, radiusY: number, rotation: number, startAngle: number, endAngle: number, anticlockwise?: boolean): void;
    fill(): void;
    stroke(): void;
    drawFocusIfNeeded(element?: any): void;
    clip(): void;
    isPointInPath(x: number, y: number): boolean;
    isPointInStroke(x: number, y: number): boolean;
    fillText(str: string, x: number, y: number): void;
    strokeText(str: string, x: number, y: number, maxWidth?: number): void;
    measureText(str: string): {
        width: number;
    };
    drawImage(...args: any[]): void;
    createImageData(sw: number, sh: number): any;
    getImageData(sx: number, sy: number, sw: number, sh: number): any;
    putImageData(imageData: any, dx: number, dy: number): void;
    createLinearGradient(x0: number, y0: number, x1: number, y1: number): any;
    createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): any;
    createPattern(image: any, repetition: string): any;
    setLineDash(segments: number[]): void;
    getLineDash(): number[];
    setAlpha(alpha: number): void;
    setCompositeOperation(operation: string): void;
    setLineWidth(width: number): void;
    setLineCap(cap: string): void;
    setLineJoin(join: string): void;
    setMiterLimit(limit: number): void;
    clearShadow(): void;
    setStrokeColor(color: string | number | number[]): void;
    setFillColor(color: string | number | number[]): void;
    drawImageFromRect(image: any, ...args: any[]): void;
    setShadow(offsetX: number, offsetY: number, blur: number, color: string): void;
    getContextAttributes(): any;
}
/**
 * Canvas factory
 * Creates a canvas with getContext() method
 */
export declare class Canvas {
    private ctx?;
    private width;
    private height;
    private canvasClass?;
    constructor(width: number, height: number, canvasClass?: typeof DrawilleCanvas);
    getContext(): Context;
}
export default Context;
