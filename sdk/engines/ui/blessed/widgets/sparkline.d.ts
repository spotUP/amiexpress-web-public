/**
 * Sparkline Widget
 *
 * 1:1 port from blessed-contrib/lib/widget/sparkline.js
 * Displays sparkline charts using Unicode sparkline characters
 */
import { Box } from './box';
import type { ElementOptions } from '../core/types';
export interface SparklineOptions extends ElementOptions {
    bufferLength?: number;
    data?: {
        titles: string[];
        data: number[][];
    };
}
/**
 * Sparkline Widget
 * Displays multiple sparklines with titles
 */
export declare class Sparkline extends Box {
    options: SparklineOptions;
    private titleFg;
    constructor(options?: SparklineOptions);
    /**
     * Set sparkline data
     * @param titles Array of titles for each sparkline
     * @param datasets Array of data arrays for each sparkline
     */
    setData(titles: string[], datasets: number[][]): void;
    /**
     * Get default options (for reference/examples)
     */
    getOptionsPrototype(): SparklineOptions;
    get type(): string;
}
/**
 * Factory function
 */
export declare function sparkline(options?: SparklineOptions): Sparkline;
