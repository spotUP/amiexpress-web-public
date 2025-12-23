/**
 * Prompt - Text input dialog box
 */
import { Box } from './box';
import type { ElementOptions } from '../core/types';
export interface PromptOptions extends ElementOptions {
    text?: string;
    title?: string;
    value?: string;
}
export declare class Prompt extends Box {
    private messageText;
    private inputField;
    private okButton;
    private cancelButton;
    private buttonBox;
    constructor(options?: PromptOptions);
    /**
     * Display the prompt
     */
    showInput(text?: string, value?: string, callback?: (err: Error | null, value?: string) => void): void;
    /**
     * Set prompt text
     */
    setText(text: string): void;
    /**
     * Get prompt text
     */
    getText(): string;
    /**
     * Set input value
     */
    setValue(value: string): void;
    /**
     * Get input value
     */
    getValue(): string;
}
