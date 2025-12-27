/**
 * PassBox - Password input widget with character masking
 */
import { Textbox } from './textbox';
import type { TextboxOptions } from '../core/types';
export interface PassBoxOptions extends TextboxOptions {
    mask?: string;
}
export declare class PassBox extends Textbox {
    private mask;
    constructor(options?: PassBoxOptions);
    /**
     * Set mask character
     */
    setMask(mask: string): void;
    /**
     * Get mask character
     */
    getMask(): string;
}
//# sourceMappingURL=passbox.d.ts.map