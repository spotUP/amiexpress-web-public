/**
 * Textbox widget - Single-line text input with horizontal scrolling
 */
import { Element } from '../core/element';
import type { TextboxOptions } from '../core/types';
export declare class Textbox extends Element {
    value: string;
    private cursorPos;
    private viewOffset;
    private secret;
    private censor;
    constructor(options?: TextboxOptions);
    private _onKeypress;
    /**
     * Get the visible width for text (accounting for borders/padding)
     */
    private _getVisibleWidth;
    /**
     * Ensure cursor is visible by adjusting viewOffset
     */
    private _ensureCursorVisible;
    private _updateContent;
    insertChar(ch: string): void;
    deleteChar(): void;
    deleteCharForward(): void;
    cursorLeft(): void;
    cursorRight(): void;
    cursorHome(): void;
    cursorEnd(): void;
    submit(): void;
    cancel(): void;
    setValue(value: string): void;
    getValue(): string;
    clearValue(): void;
    readInput(): void;
}
export declare class Input extends Textbox {
}
/**
 * Textarea - Multi-line text input with vertical scrolling
 */
export declare class Textarea extends Element {
    value: string;
    private cursorPos;
    private viewOffsetY;
    constructor(options?: TextboxOptions);
    private _onKeypress;
    private _getLines;
    private _getCursorLineCol;
    private _getVisibleHeight;
    private _ensureCursorVisible;
    private _updateContent;
    insertChar(ch: string): void;
    deleteChar(): void;
    deleteCharForward(): void;
    cursorLeft(): void;
    cursorRight(): void;
    cursorUp(): void;
    cursorDown(): void;
    cursorHome(): void;
    cursorEnd(): void;
    submit(): void;
    cancel(): void;
    setValue(value: string): void;
    getValue(): string;
    clearValue(): void;
    readInput(): void;
}
//# sourceMappingURL=textbox.d.ts.map