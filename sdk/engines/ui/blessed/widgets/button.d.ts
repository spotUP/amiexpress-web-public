/**
 * Button widget - Clickable button
 *
 * Responsive features:
 * - Touch-friendly minimum height on mobile (3 rows)
 * - Visual tap feedback (flash effect)
 * - Responsive padding
 */
import { Element } from '../core/element';
import type { ButtonOptions } from '../core/types';
import type { ResponsiveState } from '../core/responsive-mixin';
import type { BreakpointName } from '../core/responsive-constants';
export interface ExtendedButtonOptions extends ButtonOptions {
    /** Enable tap feedback flash (default: true) */
    tapFeedback?: boolean;
    /** Tap feedback duration in ms (default: 100) */
    tapFeedbackDuration?: number;
    /** Touch-friendly height on mobile (default: MIN_TOUCH_HEIGHT) */
    mobileHeight?: number;
}
export declare class Button extends Element {
    private _tapFeedback;
    private _tapFeedbackDuration;
    private _desktopHeight;
    private _mobileHeight;
    private _originalStyle;
    constructor(options?: ExtendedButtonOptions);
    private _onKeypress;
    private _onClick;
    press(): void;
    /**
     * Show visual tap feedback (flash effect)
     */
    private _showTapFeedback;
    /**
     * Handle breakpoint change - adjust height
     */
    protected _handleBreakpointChange(breakpoint: BreakpointName, previousBreakpoint: BreakpointName, state: ResponsiveState): void;
    /**
     * Called when entering mobile mode - increase height for touch targets
     */
    protected _enterMobileMode(): void;
    /**
     * Called when exiting mobile mode - restore desktop height
     */
    protected _exitMobileMode(): void;
    /**
     * Set mobile-friendly height
     */
    private _setMobileHeight;
    /**
     * Restore desktop height
     */
    private _setDesktopHeight;
    /**
     * Enable/disable tap feedback
     */
    setTapFeedback(enabled: boolean): void;
    /**
     * Set tap feedback duration
     */
    setTapFeedbackDuration(duration: number): void;
}
