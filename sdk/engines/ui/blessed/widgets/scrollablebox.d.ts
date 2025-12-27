/**
 * ScrollableBox - Box with built-in scrolling support
 */
import { Box } from './box';
import type { ElementOptions } from '../core/types';
export declare class ScrollableBox extends Box {
    constructor(options?: ElementOptions);
    /**
     * Get the current scroll percentage
     */
    getScrollPercent(): number;
    /**
     * Set scroll by percentage (0-100)
     */
    setScrollPercent(percent: number): void;
    /**
     * Check if scrolled to top
     */
    isScrolledToTop(): boolean;
    /**
     * Check if scrolled to bottom
     */
    isScrolledToBottom(): boolean;
    /**
     * Scroll to make line visible
     */
    scrollToLine(line: number): void;
}
//# sourceMappingURL=scrollablebox.d.ts.map