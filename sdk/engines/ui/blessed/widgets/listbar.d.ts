/**
 * Listbar - Horizontal menu bar widget
 */
import { Box } from './box';
import type { Colors, ElementOptions } from '../core/types';
export interface ListbarOptions extends ElementOptions {
    style?: ElementOptions['style'] & {
        item?: Colors;
        selected?: Colors;
    };
    items?: Record<string, ListbarItem>;
    commands?: Record<string, ListbarItem | {
        callback?: () => void;
    }>;
    autoCommandKeys?: boolean;
    itemPadding?: number;
    itemGap?: number;
}
export interface ListbarItem {
    text?: string;
    keys?: string[];
    callback?: () => void;
}
export declare class Listbar extends Box {
    private items;
    private selectedIndex;
    private itemKeys;
    private inactiveStyle;
    private activeStyle;
    private itemPadding;
    private itemGap;
    constructor(options?: ListbarOptions);
    /**
     * Set listbar items
     */
    setItems(items: Record<string, ListbarItem>): void;
    /**
     * Clear all items
     */
    private clearItems;
    /**
     * Select item by index
     */
    selectItem(index: number): void;
    /**
     * Select previous item
     */
    selectPrevious(): void;
    /**
     * Select next item
     */
    selectNext(): void;
    /**
     * Select current item (trigger action)
     */
    selectCurrent(): void;
    /**
     * Add a single item
     */
    addItem(key: string, item: ListbarItem): void;
    /**
     * Remove an item
     */
    removeItem(key: string): void;
    /**
     * Get item by key
     */
    getItem(key: string): ListbarItem | undefined;
    /**
     * Get all item keys
     */
    getItemKeys(): string[];
    private applySelectionStyles;
}
