/**
 * Checkbox - Boolean toggle widget for forms
 */
import { Box } from './box';
import type { ElementOptions } from '../core/types';
export interface CheckboxOptions extends ElementOptions {
    checked?: boolean;
    text?: string;
    checkChar?: string;
    uncheckChar?: string;
}
export declare class Checkbox extends Box {
    private _checked;
    private text;
    private checkChar;
    private uncheckChar;
    constructor(options?: CheckboxOptions);
    /**
     * Update checkbox display
     */
    private updateContent;
    /**
     * Check the checkbox
     */
    check(): void;
    /**
     * Uncheck the checkbox
     */
    uncheck(): void;
    /**
     * Toggle checkbox state
     */
    toggle(): void;
    /**
     * Get checked state
     */
    isChecked(): boolean;
    /**
     * Set checked state
     */
    setChecked(checked: boolean): void;
    /**
     * Get checkbox value (for form compatibility)
     */
    getValue(): boolean;
    /**
     * Set checkbox value (for form compatibility)
     */
    setValue(value: boolean): void;
}
