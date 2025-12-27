/**
 * Message - Simple message dialog box
 *
 * Supports optional overlay for semi-transparent dimming effect:
 *   overlay: true (uses default 0.5 opacity)
 *   overlayOpacity: 0.7 (custom opacity)
 */
import { Box } from './box';
import type { ElementOptions } from '../core/types';
export interface MessageOptions extends ElementOptions {
    text?: string;
    title?: string;
    overlay?: boolean;
    overlayOpacity?: number;
}
export declare class Message extends Box {
    private messageText;
    private okButton;
    private _overlay?;
    constructor(options?: MessageOptions);
    /**
     * Display the message
     */
    display(text?: string, callback?: () => void): void;
    /**
     * Override hide to also hide overlay
     */
    hide(): void;
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