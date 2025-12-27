/**
 * Prompt - Text input dialog box
 *
 * Supports optional overlay for semi-transparent dimming effect:
 *   overlay: true (uses default 0.5 opacity)
 *   overlayOpacity: 0.7 (custom opacity)
 */
import { Box } from './box';
import type { ElementOptions } from '../core/types';
export interface PromptOptions extends ElementOptions {
    text?: string;
    title?: string;
    value?: string;
    overlay?: boolean;
    overlayOpacity?: number;
}
export declare class Prompt extends Box {
    private messageText;
    private inputField;
    private okButton;
    private cancelButton;
    private buttonBox;
    private _overlay?;
    constructor(options?: PromptOptions);
    /**
     * Display the prompt
     */
    showInput(text?: string, value?: string, callback?: (err: Error | null, value?: string) => void): void;
    /**
     * Override hide to also hide overlay
     */
    hide(): void;
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
//# sourceMappingURL=prompt.d.ts.map