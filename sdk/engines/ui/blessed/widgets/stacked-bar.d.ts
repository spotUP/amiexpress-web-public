/**
 * Stacked Bar Chart Widget
 *
 * 1:1 port from blessed-contrib/lib/widget/charts/stacked-bar.js
 * Vertical stacked bar chart with legend
 */
import { ContribCanvas as Canvas, ContribCanvasOptions as CanvasOptions } from './contrib-canvas';
import { Box } from './box';
export interface StackedBarData {
    barCategory: string[];
    stackedCategory: string[];
    data: number[][];
}
export interface StackedBarOptions extends CanvasOptions {
    barWidth?: number;
    barSpacing?: number;
    xOffset?: number;
    maxValue?: number;
    showText?: boolean;
    barBgColor?: (string | number | number[])[];
    barFgColor?: string | number | number[];
    labelColor?: string | number | number[];
    legend?: {
        width?: number;
        [key: string]: any;
    };
    showLegend?: boolean;
    data?: StackedBarData;
}
/**
 * Stacked Bar Chart Widget
 * Displays vertical stacked bars with legend
 */
export declare class StackedBar extends Canvas {
    options: StackedBarOptions;
    legend?: Box;
    private _pendingData;
    constructor(options?: StackedBarOptions);
    calcSize(): void;
    getSummedBars(bars: number[][]): number[];
    setData(bars: StackedBarData): void;
    private _renderData;
    renderBar(x: number, bar: number[], curBarSummedValue: number, maxBarValue: number, category: string): void;
    renderBarSection(x: number, y: number, data: number, curBarSummedValue: number, currentBarHeight: number, availableBarHeight: number, bg: string | number | number[]): number;
    addLegend(bars: StackedBarData, x: number): void;
    getOptionsPrototype(): StackedBarOptions;
    get type(): string;
}
/**
 * Factory function
 */
export declare function stackedBar(options?: StackedBarOptions): StackedBar;
