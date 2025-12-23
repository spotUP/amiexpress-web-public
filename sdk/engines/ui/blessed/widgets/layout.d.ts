/**
 * Layout - Container widget for arranging children in rows/columns
 */
import { Box } from './box';
import type { ElementOptions } from '../core/types';
export interface LayoutOptions extends ElementOptions {
    layout?: 'inline' | 'grid';
    renderer?: (coords: any) => any;
}
export declare class Layout extends Box {
    private layoutType;
    private renderer?;
    constructor(options?: LayoutOptions);
    /**
     * Perform layout calculation
     */
    private performLayout;
    /**
     * Inline layout - arrange children horizontally
     */
    private layoutInline;
    /**
     * Grid layout - arrange children in a grid
     */
    private layoutGrid;
    /**
     * Get child width (handle percentages and 'shrink')
     */
    private getChildWidth;
    /**
     * Get child height (handle percentages and 'shrink')
     */
    private getChildHeight;
    /**
     * Get layout coordinates for all children
     */
    private getLayoutCoords;
    /**
     * Set layout type
     */
    setLayout(layout: 'inline' | 'grid'): void;
    /**
     * Get layout type
     */
    getLayout(): 'inline' | 'grid';
    /**
     * Reflow layout (force recalculation)
     */
    reflow(): void;
}
