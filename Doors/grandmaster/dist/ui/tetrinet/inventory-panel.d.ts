/**
 * TetriNET Inventory Panel
 *
 * Displays the player's special inventory as a horizontal queue.
 * - Shows up to 15 special blocks with their letter codes
 * - Highlights the first (usable) special
 * - Updates in real-time as specials are collected/used
 */
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { SpecialInventory } from '../../core/tetrinet/inventory';
import type { SpecialType } from '../../core/tetrinet/specials';
/**
 * Inventory Panel options
 */
export interface InventoryPanelOptions {
    parent: Screen;
    top: number | string;
    left: number | string;
    width?: number;
    height?: number;
    maxSlots?: number;
}
/**
 * Inventory Panel component
 */
export declare class InventoryPanel {
    private box;
    private maxSlots;
    constructor(options: InventoryPanelOptions);
    /**
     * Update display with current inventory
     */
    update(inventory: SpecialInventory): void;
    /**
     * Update display with special array directly
     */
    updateFromArray(specials: SpecialType[]): void;
    /**
     * Render empty inventory
     */
    private renderEmpty;
    /**
     * Render specials in inventory
     */
    private renderSpecials;
    /**
     * Show use animation for first slot
     */
    showUseAnimation(): void;
    /**
     * Show receive animation when special is added
     */
    showReceiveAnimation(): void;
    /**
     * Get the blessed box element
     */
    getElement(): any;
    /**
     * Destroy the panel
     */
    destroy(): void;
}
//# sourceMappingURL=inventory-panel.d.ts.map