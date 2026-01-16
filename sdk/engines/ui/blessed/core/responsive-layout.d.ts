/**
 * Responsive Layout System
 *
 * Provides automatic terminal resize handling and responsive layouts
 *
 * Features:
 * - Automatic resize detection and handling
 * - Percentage-based layouts that adapt to terminal size
 * - Constraint-based positioning
 * - Breakpoints for different terminal sizes
 * - Layout managers (FlexLayout, GridLayout)
 */
import type { Element } from '../core/element';
import type { Screen } from '../core/screen';
export interface LayoutConstraints {
    minWidth?: number;
    minHeight?: number;
    maxWidth?: number;
    maxHeight?: number;
    aspectRatio?: number;
}
export interface ResponsiveConfig {
    breakpoints?: {
        xs?: number;
        small?: number;
        medium?: number;
        large?: number;
    };
    enableAutoResize?: boolean;
    preserveAspectRatio?: boolean;
}
export interface FlexLayoutOptions {
    direction: 'row' | 'column';
    gap?: number;
    padding?: number;
    wrap?: boolean;
}
export interface GridLayoutOptions {
    columns: number;
    rows?: number;
    gap?: number;
    padding?: number;
}
/**
 * Responsive Layout Manager
 * Handles automatic resizing and responsive behavior for blessed screens
 */
export declare class ResponsiveLayoutManager {
    private screen;
    private resizeHandlers;
    private elements;
    private config;
    constructor(screen: Screen, config?: ResponsiveConfig);
    /**
     * Setup automatic resize detection
     */
    private setupResizeHandling;
    /**
     * Handle terminal resize
     */
    private handleResize;
    /**
     * Register an element with layout constraints
     */
    registerElement(element: Element, constraints: LayoutConstraints): void;
    /**
     * Unregister an element
     */
    unregisterElement(element: Element): void;
    /**
     * Apply constraints to an element
     */
    private applyConstraints;
    /**
     * Resolve size value (percentage or fixed)
     */
    private resolveSize;
    /**
     * Register a custom resize handler
     */
    onResize(handler: (width: number, height: number) => void): () => void;
    /**
     * Get current breakpoint
     */
    getBreakpoint(): 'xs' | 'small' | 'medium' | 'large';
    /**
     * Create a flex layout
     */
    createFlexLayout(parent: Element, children: Element[], options: FlexLayoutOptions): void;
    /**
     * Layout children in a row
     */
    private layoutRow;
    /**
     * Layout children in a column
     */
    private layoutColumn;
    /**
     * Create a grid layout
     */
    createGridLayout(parent: Element, children: Element[], options: GridLayoutOptions): void;
    /**
     * Clear all registered elements and handlers
     */
    destroy(): void;
}
