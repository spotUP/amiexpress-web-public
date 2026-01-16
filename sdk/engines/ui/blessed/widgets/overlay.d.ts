/**
 * Overlay - Semi-transparent overlay widget
 *
 * For web connections: Uses actual CSS transparency via socket events
 * For telnet/SSH: Falls back to solid dark background
 *
 * Responsive features:
 * - Tap-to-dismiss on mobile (tap outside content to close)
 * - Adjustable mobile opacity
 * - Touch-friendly dismiss targets
 */
import { Box, BoxOptions } from './box';
import type { ResponsiveState } from '../core/responsive-mixin';
import type { BreakpointName } from '../core/responsive-constants';
export interface OverlayOptions extends BoxOptions {
    opacity?: number;
    /** Enable tap-to-dismiss on mobile (default: true) */
    tapToDismiss?: boolean;
    /** Mobile opacity (default: 0.7, higher for visibility) */
    mobileOpacity?: number;
}
export declare class Overlay extends Box {
    private _overlayOpacity;
    private _desktopOpacity;
    private _mobileOpacity;
    private _overlayWidgetId;
    private _tapToDismiss;
    constructor(options?: OverlayOptions);
    /**
     * Emit overlay event for web clients to render actual transparency
     */
    private _emitOverlayWidgetEvent;
    /**
     * Get overlay opacity
     */
    get opacity(): number;
    /**
     * Set overlay opacity (0-1)
     */
    setOpacity(opacity: number): void;
    /**
     * Get overlay opacity (legacy method)
     */
    getOpacity(): number;
    /**
     * Show overlay with fade in effect
     */
    fadeIn(duration?: number, callback?: () => void): void;
    /**
     * Hide overlay with fade out effect
     */
    fadeOut(duration?: number, callback?: () => void): void;
    /**
     * Handle resize - update overlay dimensions
     */
    protected _handleResize(width: number, height: number, state: ResponsiveState): void;
    /**
     * Handle breakpoint change - adjust opacity
     */
    protected _handleBreakpointChange(breakpoint: BreakpointName, previousBreakpoint: BreakpointName, state: ResponsiveState): void;
    /**
     * Called when entering mobile mode - increase opacity for visibility
     */
    protected _enterMobileMode(): void;
    /**
     * Called when exiting mobile mode - restore desktop opacity
     */
    protected _exitMobileMode(): void;
    /**
     * Enable/disable tap-to-dismiss
     */
    setTapToDismiss(enabled: boolean): void;
    /**
     * Check if tap-to-dismiss is enabled
     */
    isTapToDismissEnabled(): boolean;
    /**
     * Set mobile opacity
     */
    setMobileOpacity(opacity: number): void;
    /**
     * Set desktop opacity
     */
    setDesktopOpacity(opacity: number): void;
}
