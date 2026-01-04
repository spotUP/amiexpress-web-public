/**
 * Gauge List Widget
 *
 * 1:1 port from blessed-contrib/lib/widget/gauge-list.js
 * Multiple gauges displayed in a vertical list
 */
import { ContribCanvas as Canvas, ContribCanvasOptions as CanvasOptions } from './contrib-canvas';
export interface GaugeListStack {
    percent: number;
    stroke?: string | number | number[];
}
export interface GaugeListItem {
    showLabel?: boolean;
    stack: (number | GaugeListStack)[];
}
export interface GaugeListOptions extends CanvasOptions {
    stroke?: string | number | number[];
    fill?: string | number | number[];
    showLabel?: boolean;
    gaugeSpacing?: number;
    gaugeHeight?: number;
    gauges?: GaugeListItem[];
}
/**
 * Gauge List Widget
 * Displays multiple progress gauges in a vertical list
 */
export declare class GaugeList extends Canvas {
    options: GaugeListOptions;
    gauges?: GaugeListItem[];
    private _pendingGauges;
    constructor(options?: GaugeListOptions);
    calcSize(): void;
    get type(): string;
    setData(): void;
    setGauges(gauges: GaugeListItem[]): void;
    private _renderGauges;
    setSingleGauge(gauge: GaugeListItem, offset: number): void;
    getOptionsPrototype(): GaugeListOptions;
}
/**
 * Factory function
 */
export declare function gaugeList(options?: GaugeListOptions): GaugeList;
