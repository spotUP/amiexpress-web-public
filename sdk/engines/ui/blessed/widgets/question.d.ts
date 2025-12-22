/**
 * Question - Yes/No dialog box
 */
import { Box } from './box';
import type { ElementOptions } from '../core/types';
export interface QuestionOptions extends ElementOptions {
    text?: string;
    title?: string;
}
export declare class Question extends Box {
    private messageText;
    private yesButton;
    private noButton;
    private buttonBox;
    constructor(options?: QuestionOptions);
    /**
     * Display the question
     */
    ask(text?: string, callback?: (answer: boolean) => void): void;
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