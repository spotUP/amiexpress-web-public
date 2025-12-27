/**
 * ScrollableText - Text widget with built-in scrolling support
 */
import { Text } from './text';
import type { ElementOptions } from '../core/types';
export declare class ScrollableText extends Text {
    constructor(options?: ElementOptions);
    /**
     * Get the current scroll percentage
     */
    getScrollPercent(): number;
    /**
     * Set scroll by percentage (0-100)
     */
    setScrollPercent(percent: number): void;
}
//# sourceMappingURL=scrollabletext.d.ts.map