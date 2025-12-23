/**
 * Line - Horizontal or vertical line widget
 */
import { Box } from './box';
import type { ElementOptions } from '../core/types';
export interface LineOptions extends ElementOptions {
    orientation?: 'horizontal' | 'vertical';
    type?: 'line' | 'heavy' | 'double' | 'ascii';
    ch?: string;
}
export declare class Line extends Box {
    private orientation;
    private lineChar;
    constructor(options?: LineOptions);
    /**
     * Get line character based on type
     */
    private getLineChar;
    /**
     * Update line content
     */
    private updateContent;
    /**
     * Set line character
     */
    setChar(ch: string): void;
    /**
     * Set line type
     */
    setType(type: 'line' | 'heavy' | 'double' | 'ascii'): void;
}
