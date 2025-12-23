/**
 * Viewport - Scrollable viewport for content larger than container
 */
import { Box } from './box';
import type { ElementOptions } from '../core/types';
export interface ViewportOptions extends ElementOptions {
    alwaysScroll?: boolean;
    baseLimit?: number;
    scrollbarBg?: string;
    scrollbarFg?: string;
}
export declare class Viewport extends Box {
    private alwaysScroll;
    private baseLimit;
    private scrollPosition;
    private contentHeight;
    constructor(options?: ViewportOptions);
    /**
     * Scroll by delta
     */
    scroll(offset: number): void;
    /**
     * Scroll to absolute position
     */
    scrollTo(position: number): void;
    /**
     * Get scroll position
     */
    getScrollPosition(): number;
    /**
     * Get scroll percentage
     */
    getScrollPerc(): number;
    /**
     * Set content and update scrollable height
     */
    setContent(content: string): void;
    /**
     * Get content height
     */
    getContentHeight(): number;
    /**
     * Check if scrolled to bottom
     */
    isAtBottom(): boolean;
    /**
     * Check if scrolled to top
     */
    isAtTop(): boolean;
    /**
     * Reset scroll position to top
     */
    resetScroll(): void;
}
