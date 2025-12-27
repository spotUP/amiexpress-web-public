/**
 * Loading - Loading indicator / spinner widget
 *
 * Supports optional overlay for semi-transparent dimming effect:
 *   overlay: true (uses default 0.5 opacity)
 *   overlayOpacity: 0.7 (custom opacity)
 */
import { Box } from './box';
import type { ElementOptions } from '../core/types';
export interface LoadingOptions extends ElementOptions {
    text?: string;
    spinner?: string[];
    interval?: number;
    overlay?: boolean;
    overlayOpacity?: number;
}
export declare class Loading extends Box {
    private messageText;
    private spinnerText;
    private spinner;
    private spinnerIndex;
    private interval;
    private timer;
    private _overlay?;
    constructor(options?: LoadingOptions);
    /**
     * Start the loading animation
     */
    load(text?: string): void;
    /**
     * Stop the loading animation and hide
     */
    stop(): void;
    /**
     * Override hide to also hide overlay
     */
    hide(): void;
    /**
     * Start spinner animation
     */
    private startSpinner;
    /**
     * Stop spinner animation
     */
    private stopSpinner;
    /**
     * Set loading text
     */
    setText(text: string): void;
    /**
     * Get loading text
     */
    getText(): string;
    /**
     * Set custom spinner frames
     */
    setSpinner(frames: string[]): void;
    /**
     * Destroy and clean up
     */
    destroy(): void;
}
//# sourceMappingURL=loading.d.ts.map