/**
 * Gauge Widget
 *
 * 1:1 port from blessed-contrib/lib/widget/gauge.js
 * Progress bar gauge with single percent or stacked segments
 */
import { Canvas, CanvasOptions } from './canvas';
export interface GaugeStack {
    percent: number;
    stroke?: string | number | number[];
}
export interface GaugeOptions extends CanvasOptions {
    stroke?: string | number | number[];
    fill?: string | number | number[];
    showLabel?: boolean;
    percent?: number;
    stack?: (number | GaugeStack)[];
}
/**
 * Gauge Widget
 * Displays progress bars with percentage labels
 */
export declare class Gauge extends Canvas {
    options: GaugeOptions;
    percent?: number;
    stack?: (number | GaugeStack)[];
    private _pendingPercent;
    private _pendingStack;
    constructor(options?: GaugeOptions);
    calcSize(): void;
    get type(): string;
    setData(data: number | (number | GaugeStack)[]): void;
    setPercent(percent: number): void;
    private _renderPercent;
    setStack(stack: (number | GaugeStack)[]): void;
    private _renderStack;
    getOptionsPrototype(): GaugeOptions;
}
/**
 * Factory function
 */
export declare function gauge(options?: GaugeOptions): Gauge;
