/**
 * Grid Layout
 *
 * 1:1 port from blessed-contrib/lib/layout/grid.js
 * Grid-based layout system for arranging widgets
 */
import type { Screen } from '../../core/screen';
import type { Element } from '../../core/element';
export interface GridOptions {
    screen: Screen;
    rows: number;
    cols: number;
    dashboardMargin?: number;
    hideBorder?: boolean;
    color?: string | number | number[];
}
/**
 * Grid Layout
 * Provides grid-based widget positioning
 */
export declare class Grid {
    options: GridOptions;
    cellWidth: number;
    cellHeight: number;
    private widgetSpacing;
    constructor(options: GridOptions);
    set<T extends Element>(row: number, col: number, rowSpan: number, colSpan: number, obj: (opts: any) => T, opts?: any): T;
}
/**
 * Factory function
 */
export declare function grid(options: GridOptions): Grid;
