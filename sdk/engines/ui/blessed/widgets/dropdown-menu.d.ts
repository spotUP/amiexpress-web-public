/**
 * DropdownMenu widget - Keyboard/mouse dropdown with focus trapping
 */
import { Element } from '../core/element';
import type { Screen } from '../core/screen';
export interface DropdownMenuItem {
    label: string;
    value?: string;
    disabled?: boolean;
    separator?: boolean;
    action?: () => void;
}
export interface DropdownMenuOptions {
    items: DropdownMenuItem[];
    parent?: any;
    screen?: Screen;
    width?: number;
    maxHeight?: number;
    label?: string;
    style?: any;
}
export declare class DropdownMenu extends Element {
    private static openMenus;
    private static justClosed;
    private items;
    private selectedIndex;
    private outsideClickHandler?;
    private anchor?;
    private anchorLeft;
    private anchorTop;
    /**
     * Close all currently open dropdown menus
     */
    static closeAll(): void;
    /**
     * Check if any dropdown menu is currently open
     */
    static isAnyOpen(): boolean;
    /**
     * Check if a menu was just closed (blocks canvas clicks for one tick)
     */
    static wasJustClosed(): boolean;
    /**
     * Check if click should be blocked (menu open OR just closed)
     */
    static shouldBlockClick(): boolean;
    constructor(options: DropdownMenuOptions);
    openAt(left: number, top: number): void;
    openFor(anchor: Element, align?: 'left' | 'right'): void;
    close(fromOutsideClick?: boolean): void;
    setItems(items: DropdownMenuItem[]): void;
    /**
     * Register an anchor element for hover-to-open behavior
     * When any menu is open, hovering over this anchor opens this menu
     * @param anchor The element that triggers this menu
     * @param leftOffset Additional left offset (optional, default 0)
     * @param topOffset Additional top offset (optional, default 0 to open directly below anchor)
     */
    registerAnchor(anchor: Element, leftOffset?: number, topOffset?: number): void;
    /**
     * Check if this menu is currently open
     */
    isOpen(): boolean;
    private move;
    private selectItem;
    private updateContent;
    private attachOutsideClick;
    private detachOutsideClick;
}
export declare function dropdownMenu(options: DropdownMenuOptions): DropdownMenu;
