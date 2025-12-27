/**
 * List widget - Scrollable list with selection
 */
import { Element } from '../core/element';
import type { ListOptions } from '../core/types';
export declare class List extends Element {
    items: string[];
    selected: number;
    private previousSelected;
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
    /**
     * Get item by index, string content, or element
     * EXACT from neo-blessed list.js lines 358-360
     */
    getItem(child: number | string): string | undefined;
    /**
     * Set item content by index, string, or element
     * EXACT from neo-blessed list.js lines 362-368
     */
    setItem(child: number | string, content: string): void;
    /**
     * Push item to end of list (returns new length)
     * EXACT from neo-blessed list.js lines 411-414
     */
    pushItem(content: string): number;
    /**
     * Pop last item from list
     * EXACT from neo-blessed list.js lines 416-418
     */
    popItem(): string | undefined;
    /**
     * Add item to beginning of list (returns new length)
     * EXACT from neo-blessed list.js lines 420-423
     */
    unshiftItem(content: string): number;
    /**
     * Remove and return first item from list
     * EXACT from neo-blessed list.js lines 425-427
     */
    shiftItem(): string | undefined;
    /**
     * Splice items (remove and/or insert)
     * EXACT from neo-blessed list.js lines 429-442
     */
    spliceItem(child: number | string, n: number, ...items: string[]): string[];
    /**
     * Find item by search string or regex (with wrap-around)
     * EXACT from neo-blessed list.js lines 444-487
     */
    find(search: string | RegExp | ((item: string) => boolean), back?: boolean): number;
    /**
     * Fuzzy find item by search string or regex
     * EXACT from neo-blessed list.js lines 444-487
     */
    fuzzyFind(search: string | RegExp | ((item: string) => boolean), back?: boolean): number;
    /**
     * Get item index from various inputs (number, string content, or element)
     * EXACT from neo-blessed list.js lines 489-504
     */
    getItemIndex(child: number | string | any): number;
    /**
     * Move selection by offset
     * EXACT from neo-blessed list.js lines 540-542
     */
    move(offset: number): void;
    /**
     * Interactive picker - focus list, wait for selection
     * EXACT from neo-blessed list.js lines 552-585
     */
    pick(label: string | ((err?: Error, selected?: string) => void), callback?: (err?: Error, selected?: string) => void): void;
    /**
     * Emit action and select events for current selection
     * EXACT from neo-blessed list.js lines 587-591
     */
    enterSelected(i?: number): void;
    /**
     * Emit action and cancel events
     * EXACT from neo-blessed list.js lines 593-597
     */
    cancelSelected(i?: number): void;
    private getItemWrapWidth;
    private wrapAnsiText;
}
//# sourceMappingURL=list.d.ts.map