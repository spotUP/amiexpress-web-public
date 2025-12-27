/**
 * Question - Yes/No dialog box
 *
 * Supports optional overlay for semi-transparent dimming effect:
 *   overlay: true (uses default 0.5 opacity)
 *   overlayOpacity: 0.7 (custom opacity)
 */
import { Box } from './box';
import type { ElementOptions } from '../core/types';
export interface QuestionOptions extends ElementOptions {
    text?: string;
    title?: string;
    overlay?: boolean;
    overlayOpacity?: number;
}
export declare class Question extends Box {
    private messageText;
    private yesButton;
    private noButton;
    private buttonBox;
    private _overlay?;
    constructor(options?: QuestionOptions);
    /**
     * Display the question
     */
    ask(text?: string, callback?: (answer: boolean) => void): void;
    /**
     * Override hide to also hide overlay
     */
    hide(): void;
    /**
     * Set question text
     */
    setText(text: string): void;
    /**
     * Get question text
     */
    getText(): string;
}
//# sourceMappingURL=question.d.ts.map