/**
 * Canvas Widget
 *
 * 1:1 port from blessed-contrib/lib/widget/canvas.js
 * Provides a canvas widget with Braille-based drawing
 */
import { Box } from './box';
import { Canvas as InnerCanvas, Context } from '../utils/contrib-utils/drawille-canvas';
import type { ElementOptions } from '../core/types';
export interface CanvasOptions extends ElementOptions {
    data?: any;
}
/**
 * Canvas Widget
 * Box with Braille-based drawing canvas
 */
export declare class Canvas extends Box {
    options: CanvasOptions;
    _canvas?: InnerCanvas;
    ctx?: Context;
    canvasSize?: {
        width: number;
        height: number;
    };
    constructor(options?: CanvasOptions);
    /**
     * Calculate canvas size based on widget dimensions
     * Braille characters are 2x4 pixels, so we multiply accordingly
     * Width must be multiple of 2, height must be multiple of 4
     */
    calcSize(): void;
    /**
     * Clear the canvas
     */
    clear(): void;
    /**
     * Set data (override in subclasses)
     */
    setData(data: any): void;
    /**
     * Sync canvas content to element content
     * Call this after drawing operations to make content visible
     */
    syncContent(): void;
    /**
     * Render the canvas
     */
    render(): any;
}
/**
 * Factory function
 */
export declare function canvas(options?: CanvasOptions): Canvas;
