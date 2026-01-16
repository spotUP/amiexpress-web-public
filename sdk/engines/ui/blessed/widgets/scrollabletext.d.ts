/**
 * ScrollableText - Text widget with built-in scrolling support
 */
import { Text } from './text';
import type { ElementOptions } from '../core/types';
import type { ResponsiveState } from '../core/responsive-mixin';
import type { BreakpointName } from '../core/responsive-constants';
export interface ScrollableTextOptions extends ElementOptions {
    alwaysScroll?: boolean;
}
export declare class ScrollableText extends Text {
    constructor(options?: ScrollableTextOptions);
    /**
     * Get the current scroll percentage
     */
    getScrollPercent(): number;
    /**
     * Set scroll by percentage (0-100)
     */
    setScrollPercent(percent: number): void;
    protected _handleBreakpointChange(breakpoint: BreakpointName, previousBreakpoint: BreakpointName, state: ResponsiveState): void;
}
/**
 * Factory function
 */
export declare function scrollabletext(options?: ScrollableTextOptions): ScrollableText;
