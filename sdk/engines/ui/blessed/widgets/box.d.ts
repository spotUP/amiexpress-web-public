/**
 * Box widget - Basic container with border support
 *
 * Responsive features:
 * - Breakpoint-aware padding (larger on desktop, smaller on mobile)
 * - Auto-resize handling
 * - Child layout recalculation on resize
 */
import { Element } from '../core/element';
import type { ElementOptions, Padding } from '../core/types';
import type { ResponsiveState } from '../core/responsive-mixin';
import type { BreakpointName } from '../core/responsive-constants';
export interface BoxOptions extends ElementOptions {
    /** Responsive padding - different values per breakpoint */
    responsivePadding?: {
        xs?: number | Padding;
        small?: number | Padding;
        medium?: number | Padding;
        large?: number | Padding;
    };
}
export declare class Box extends Element {
    protected _responsivePadding?: BoxOptions['responsivePadding'];
    private _originalPadding?;
    constructor(options?: BoxOptions);
    /**
     * Handle resize - update padding based on breakpoint
     */
    protected _handleResize(width: number, height: number, state: ResponsiveState): void;
    /**
     * Handle breakpoint change
     */
    protected _handleBreakpointChange(breakpoint: BreakpointName, previousBreakpoint: BreakpointName, state: ResponsiveState): void;
    /**
     * Apply padding based on breakpoint
     */
    private _applyResponsivePadding;
    /**
     * Notify all children of resize event
     */
    private _notifyChildrenResize;
    /**
     * Set responsive padding configuration
     */
    setResponsivePadding(config: BoxOptions['responsivePadding']): void;
    /**
     * Get current effective padding
     */
    getEffectivePadding(): number | Padding;
    /**
     * Helper to get default responsive padding (mobile-aware)
     */
    static getDefaultResponsivePadding(): BoxOptions['responsivePadding'];
}
