/**
 * Line Chart Widget
 *
 * 1:1 port from blessed-contrib/lib/widget/charts/line.js
 * Multi-line chart with legend, axes, and labels
 */
import { Canvas, CanvasOptions } from './canvas';
import { Box } from '../../widgets/box';
export interface LineData {
    title: string;
    x: string[];
    y: number[];
    style?: {
        line?: string | number | number[];
        [key: string]: any;
    };
}
export interface LineOptions extends Omit<CanvasOptions, 'style'> {
    showNthLabel?: number;
    style?: {
        line?: string | number | number[];
        text?: string | number | number[];
        baseline?: string | number | number[];
        [key: string]: any;
    };
    xLabelPadding?: number;
    xPadding?: number;
    numYLabels?: number;
    legend?: {
        width?: number;
        [key: string]: any;
    };
    wholeNumbersOnly?: boolean;
    minY?: number;
    maxY?: number;
    showLegend?: boolean;
    abbreviate?: boolean;
    data?: LineData[];
}
/**
 * Line Chart Widget
 * Draws multi-line charts with customizable styling
 */
export declare class Line extends Canvas {
    legend?: Box;
    private _pendingData?;
    constructor(options?: LineOptions);
    get lineOptions(): LineOptions;
    calcSize(): void;
    get type(): string;
    setData(dataInput: LineData | LineData[]): void;
    getOptionsPrototype(): LineOptions;
}
/**
 * Factory function
 */
export declare function line(options?: LineOptions): Line;
