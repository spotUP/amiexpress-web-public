/**
 * RadioSet - Container for managing a group of radio buttons
 */
import { Box } from './box';
import { RadioButton, RadioButtonOptions } from './radiobutton';
import type { ElementOptions } from '../core/types';
export interface RadioSetOptions extends ElementOptions {
    items?: Array<string | RadioButtonOptions>;
    selected?: number;
    vertical?: boolean;
    spacing?: number;
}
export declare class RadioSet extends Box {
    private radioButtons;
    private selectedIndex;
    constructor(options?: RadioSetOptions);
    /**
     * Select a radio button by index
     */
    selectRadio(index: number): void;
    /**
     * Select previous radio button
     */
    selectPrevious(): void;
    /**
     * Select next radio button
     */
    selectNext(): void;
    /**
     * Get selected radio button index
     */
    getSelectedIndex(): number;
    /**
     * Get selected radio button value
     */
    getValue(): any;
    /**
     * Set selected radio button by value
     */
    setValue(value: any): void;
    /**
     * Get all radio buttons
     */
    getRadioButtons(): RadioButton[];
    /**
     * Add a radio button
     */
    addRadio(options: RadioButtonOptions | string): RadioButton;
    /**
     * Remove a radio button by index
     */
    removeRadio(index: number): void;
}
