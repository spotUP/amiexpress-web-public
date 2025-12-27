/**
 * Canvas - Basic drawing canvas for custom rendering
 */
import { Box } from './box';
import type { ElementOptions } from '../core/types';
export interface CanvasOptions extends ElementOptions {
    fillChar?: string;
    clearChar?: string;
}
export declare class Canvas extends Box {
    private buffer;
    private fillChar;
    private clearChar;
    private canvasWidth;
    private canvasHeight;
    private _dirty;
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
}
//# sourceMappingURL=canvas.d.ts.map