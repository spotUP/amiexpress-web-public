/**
 * Canvas - Basic drawing canvas for custom rendering
 *
 * Responsive features:
 * - Reinitializes buffer on breakpoint change
 */
import { Box } from './box';
import type { ElementOptions } from '../core/types';
import type { ResponsiveState } from '../core/responsive-mixin';
import type { BreakpointName } from '../core/responsive-constants';
export interface CanvasOptions extends ElementOptions {
    fillChar?: string;
    clearChar?: string;
}
export declare class Canvas extends Box {
    protected buffer: string[][];
    protected fillChar: string;
    protected clearChar: string;
    protected canvasWidth: number;
    protected canvasHeight: number;
    protected _dirty: boolean;
    private _renderTimeout;
    constructor(options?: CanvasOptions);
    /**
     * Initialize canvas buffer
     * Accounts for borders and padding to use actual content area
     */
    private initializeBuffer;
    /**
     * Set pixel at coordinates
     * @param autoRender - If true (default), schedules a debounced render. Set to false for batch operations.
     */
    setPixel(x: number, y: number, char?: string, autoRender?: boolean): void;
    /**
     * Schedule a debounced render (16ms = ~60fps)
     */
    private _scheduleRender;
    /**
     * Get pixel at coordinates
     */
    getPixel(x: number, y: number): string | undefined;
    /**
     * Clear the canvas
     */
    clearCanvas(): void;
    /**
     * Draw a line from (x1, y1) to (x2, y2)
     */
    drawLine(x1: number, y1: number, x2: number, y2: number, char?: string): void;
    /**
     * Draw a rectangle
     */
    drawRect(x: number, y: number, width: number, height: number, char?: string, filled?: boolean): void;
    /**
     * Draw a circle
     */
    drawCircle(cx: number, cy: number, radius: number, char?: string): void;
    /**
     * Draw text at position
     */
    drawText(x: number, y: number, text: string): void;
    /**
     * Fill area with character
     */
    fill(x: number, y: number, char?: string): void;
    /**
     * Render canvas to content
     */
    render(): void;
    /**
     * Get canvas dimensions
     */
    getCanvasSize(): {
        width: number;
        height: number;
    };
    protected _handleBreakpointChange(breakpoint: BreakpointName, previousBreakpoint: BreakpointName, state: ResponsiveState): void;
}
