/**
 * LCD Widget
 *
 * 1:1 port from blessed-contrib/lib/widget/lcd.js
 * LCD sixteen-segment display for alphanumeric characters
 * Thanks to https://github.com/Enderer/sixteensegment for the original implementation
 */
import { Canvas, CanvasOptions } from './canvas';
import type { Context } from '../utils/drawille-canvas';
export interface LCDOptions extends CanvasOptions {
    segmentWidth?: number;
    segmentInterval?: number;
    strokeWidth?: number;
    elements?: number;
    display?: number | string;
    elementSpacing?: number;
    elementPadding?: number;
    color?: string | number | number[];
}
interface Point {
    x: number;
    y: number;
}
/**
 * LCD Widget
 * Displays alphanumeric characters using sixteen-segment display
 */
export declare class LCD extends Canvas {
    options: LCDOptions;
    segment16: SixteenSegment | null;
    private _pendingDisplay;
    constructor(options?: LCDOptions);
    calcSize(): void;
    get type(): string;
    increaseWidth(): void;
    decreaseWidth(): void;
    increaseInterval(): void;
    decreaseInterval(): void;
    increaseStroke(): void;
    decreaseStroke(): void;
    setOptions(options: LCDOptions): void;
    setData(data: number | string): void;
    setDisplay(display: number | string): void;
    private _renderDisplay;
    getOptionsPrototype(): LCDOptions;
}
/**
 * ElementArray Class
 * Manages the array of segment values for each display element
 */
declare class ElementArray {
    NullMask: number;
    Elements: number[];
    constructor(count: number);
    SetCount(count: number): void;
    SetText(value: number | string | null, charMaps: Record<string, number>): void;
    SetElementValue(i: number, value: number): void;
}
/**
 * SixteenSegment Class
 * Renders sixteen-segment LCD display characters
 */
declare class SixteenSegment {
    ElementArray: ElementArray;
    SegmentWidth: number;
    SegmentInterval: number;
    BevelWidth: number;
    SideBevelEnabled: boolean;
    StrokeLight: string | number | number[];
    StrokeWidth: number;
    Padding: number;
    Spacing: number;
    ElementWidth: number;
    ElementHeight: number;
    FillLight: string;
    FillDark: string;
    StrokeDark: string;
    X: number;
    Y: number;
    ElementCount: number;
    Width: number;
    Height: number;
    Canvas: Context;
    Points: Point[][];
    constructor(count: number, canvas: Context, width: number, height: number, x: number, y: number, options: LCDOptions);
    setOptions(options: LCDOptions): void;
    DisplayText(value: number | string): void;
    CalcElementDimensions(): {
        Width: number;
        Height: number;
    };
    FlipVertical(points: Point[], height: number): Point[];
    FlipHorizontal(points: Point[], width: number): Point[];
    Draw(context: Context, elements: number[]): void;
    CalcPoints(): void;
}
/**
 * Factory function
 */
export declare function lcd(options?: LCDOptions): LCD;
export {};
