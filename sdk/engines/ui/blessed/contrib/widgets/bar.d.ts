/**
 * Bar Chart Widget
 *
 * 1:1 port from blessed-contrib/lib/widget/charts/bar.js
 * Vertical bar chart with labels
 */
import { Canvas, CanvasOptions } from './canvas';
export interface BarData {
    titles: string[];
    data: number[];
}
export interface BarOptions extends CanvasOptions {
    barWidth?: number;
    barSpacing?: number;
    xOffset?: number;
    maxHeight?: number;
    showText?: boolean;
    barBgColor?: string | number | number[];
    barFgColor?: string | number | number[];
    labelColor?: string | number | number[];
    data?: BarData;
}
/**
 * Bar Chart Widget
 * Displays vertical bars with labels and values
 */
export declare class Bar extends Canvas {
    options: BarOptions;
    private _pendingData;
    constructor(options?: BarOptions);
    calcSize(): void;
    setData(bar: BarData): void;
    private _renderData;
    getOptionsPrototype(): BarOptions;
    get type(): string;
}
/**
 * Factory function
 */
export declare function bar(options?: BarOptions): Bar;
