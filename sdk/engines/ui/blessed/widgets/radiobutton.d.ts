/**
 * RadioButton - Single radio button (usually used within RadioSet)
 */
import { Box } from './box';
import type { ElementOptions } from '../core/types';
export interface RadioButtonOptions extends ElementOptions {
    checked?: boolean;
    text?: string;
    checkChar?: string;
    uncheckChar?: string;
    value?: any;
}
export declare class RadioButton extends Box {
    private _checked;
    private text;
    private checkChar;
    private uncheckChar;
    value: any;
    constructor(options?: RadioButtonOptions);
    /**
     * Update radio button display
     */
    private updateContent;
    /**
     * Select this radio button
     */
    select(): void;
    /**
     * Deselect this radio button
     */
    deselect(): void;
    /**
     * Get selected state
     */
    isSelected(): boolean;
    /**
     * Set selected state
     */
    setSelected(selected: boolean): void;
    /**
     * Get radio button value
     */
    getValue(): any;
}
//# sourceMappingURL=radiobutton.d.ts.map