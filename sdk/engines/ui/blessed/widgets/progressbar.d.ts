/**
 * ProgressBar widget - Visual progress indicator
 */
import { Element } from '../core/element';
import type { ProgressBarOptions } from '../core/types';
export declare class ProgressBar extends Element {
    private filled;
    private orientation;
    private ch;
    private pch;
    constructor(options?: ProgressBarOptions);
    private _updateContent;
    setProgress(percent: number): void;
    getProgress(): number;
    progress(amount: number): void;
    reset(): void;
}
//# sourceMappingURL=progressbar.d.ts.map