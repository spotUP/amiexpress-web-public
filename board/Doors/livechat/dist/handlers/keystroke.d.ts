/** Keystroke handler for real-time char-by-char display */
export declare class KeystrokeHandler {
    private buffer;
    private onKeystroke;
    private onEnter;
    constructor(onKeystroke: (char: string) => void, onEnter: (message: string) => void);
    /** Handle incoming keystroke */
    handle(data: string): void;
    /** Get current buffer */
    getBuffer(): string;
    /** Clear buffer */
    clear(): void;
}
