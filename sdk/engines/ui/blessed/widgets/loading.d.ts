/**
 * Loading - Loading indicator / spinner widget
 */
import { Box } from './box';
import type { ElementOptions } from '../core/types';
export interface LoadingOptions extends ElementOptions {
    text?: string;
    spinner?: string[];
    interval?: number;
}
export declare class Loading extends Box {
    private messageText;
    private spinnerText;
    private spinner;
    private spinnerIndex;
    private interval;
    private timer;
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
