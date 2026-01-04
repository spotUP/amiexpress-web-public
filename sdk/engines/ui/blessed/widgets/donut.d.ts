/**
 * Donut Chart Widget
 *
 * 1:1 port from blessed-contrib/lib/widget/donut.js
 * Displays donut/pie charts with percentage labels
 */
import { ContribCanvas as Canvas, ContribCanvasOptions as CanvasOptions } from './contrib-canvas';
export interface DonutData {
    label: string;
    percent: number | string;
    percentAltNumber?: number;
    color?: string | number | number[];
}
export interface DonutOptions extends CanvasOptions {
    stroke?: string | number | number[];
    fill?: string | number | number[];
    radius?: number;
    arcWidth?: number;
    spacing?: number;
    yPadding?: number;
    remainColor?: string | number | number[];
    data?: DonutData[];
}
/**
 * Donut Chart Widget
 * Displays circular progress indicators with labels
 */
export declare class Donut extends Canvas {
    options: DonutOptions;
    currentData?: DonutData[];
    private _pendingData?;
    constructor(options?: DonutOptions);
    calcSize(): void;
    get type(): string;
    setData(data: DonutData[]): void;
    update(data: DonutData[]): void;
    getOptionsPrototype(): DonutOptions;
}
/**
 * Factory function
 */
export declare function donut(options?: DonutOptions): Donut;
