/**
 * IFrame - Embedded frame widget for nested screens
 */
import { Box } from './box';
import type { Element } from '../core/element';
import type { ElementOptions } from '../core/types';
export interface IFrameOptions extends ElementOptions {
    detached?: boolean;
}
export declare class IFrame extends Box {
    private frameChildren;
    private detached;
    constructor(options?: IFrameOptions);
    /**
     * Append element to iframe
     */
    append(element: Element): void;
    /**
     * Prepend element to iframe
     */
    prepend(element: Element): void;
    /**
     * Remove element from iframe
     */
    remove(element: Element): void;
    /**
     * Get all frame children
     */
    getFrameChildren(): Element[];
    /**
     * Clear all frame children
     */
    clearFrame(): void;
    /**
     * Focus first focusable child
     */
    focusFirst(): void;
    /**
     * Focus last focusable child
     */
    focusLast(): void;
    /**
     * Focus next focusable child
     */
    focusNext(): void;
    /**
     * Focus previous focusable child
     */
    focusPrevious(): void;
    /**
     * Get focused child
     */
    getFocusedChild(): Element | undefined;
    /**
     * Show/hide frame
     */
    toggle(): void;
    /**
     * Get frame visibility
     */
    isVisible(): boolean;
    /**
     * Get frame count
     */
    getFrameCount(): number;
}
//# sourceMappingURL=iframe.d.ts.map