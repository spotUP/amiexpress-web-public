/**
 * Message - Simple message dialog box
 */
import { Box } from './box';
import type { ElementOptions } from '../core/types';
export interface MessageOptions extends ElementOptions {
    text?: string;
    title?: string;
}
export declare class Message extends Box {
    private messageText;
    private okButton;
    constructor(options?: MessageOptions);
    /**
     * Display the message
     */
    display(text?: string, callback?: () => void): void;
    /**
     * Set message text
     */
    setText(text: string): void;
    /**
     * Get message text
     */
    getText(): string;
}
//# sourceMappingURL=message.d.ts.map