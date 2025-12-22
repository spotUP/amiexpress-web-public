/**
 * List widget - Scrollable list with selection
 */
import { Element } from '../core/element';
import type { ListOptions } from '../core/types';
export declare class List extends Element {
    items: string[];
    selected: number;
    private interactive;
    private wrapItemsEnabled;
    private lineToItem;
    private itemLineStart;
    private itemLineCount;
    constructor(options?: ListOptions);
    private _onClick;
    private _updateContent;
    private _onKeypress;
    setItems(items: string[]): void;
    select(index: number): void;
    up(amount?: number): void;
    down(amount?: number): void;
    getSelected(): number;
    getSelectedItem(): string | undefined;
    setWrapItems(enabled: boolean): void;
    clearItems(): void;
    addItem(item: string): void;
    removeItem(index: number): void;
    insertItem(index: number, item: string): void;
    private getItemWrapWidth;
    private wrapAnsiText;
}
//# sourceMappingURL=list.d.ts.map