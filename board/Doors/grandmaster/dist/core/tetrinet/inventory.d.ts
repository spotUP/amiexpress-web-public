/**
 * TetriNET Special Inventory
 *
 * FIFO queue for collecting and using special blocks.
 * Players collect specials when clearing lines and use them against opponents.
 */
import type { SpecialType } from './specials';
/**
 * Inventory state
 */
export interface InventoryState {
    specials: SpecialType[];
    maxSize: number;
}
/**
 * Special inventory manager
 */
export declare class SpecialInventory {
    private specials;
    private maxSize;
    constructor(maxSize?: number);
    /**
     * Add a special to the end of the queue
     * Returns true if added, false if inventory was full (oldest is dropped)
     */
    add(special: SpecialType): boolean;
    /**
     * Add multiple specials at once
     */
    addMultiple(specials: SpecialType[]): void;
    /**
     * Use (remove and return) the first special in queue
     */
    use(): SpecialType | null;
    /**
     * Peek at the first special without removing it
     */
    peek(): SpecialType | null;
    /**
     * Peek at special at specific index
     */
    peekAt(index: number): SpecialType | null;
    /**
     * Get all specials (copy of array)
     */
    getAll(): SpecialType[];
    /**
     * Clear all specials from inventory
     */
    clear(): void;
    /**
     * Get current inventory size
     */
    size(): number;
    /**
     * Check if inventory is empty
     */
    isEmpty(): boolean;
    /**
     * Check if inventory is full
     */
    isFull(): boolean;
    /**
     * Get maximum inventory size
     */
    getMaxSize(): number;
    /**
     * Set maximum inventory size
     */
    setMaxSize(size: number): void;
    /**
     * Get state for serialization
     */
    getState(): InventoryState;
    /**
     * Load state from serialization
     */
    loadState(state: InventoryState): void;
    /**
     * Get display string for inventory (colored special chars)
     */
    getDisplay(): string;
    /**
     * Get display string with slots shown
     */
    getDisplayWithSlots(): string;
    /**
     * Get display info for a specific slot
     */
    getSlotInfo(index: number): {
        special: SpecialType | null;
        name: string;
        description: string;
    };
    /**
     * Count specials of a specific type
     */
    countType(type: SpecialType): number;
    /**
     * Remove all specials of a specific type
     */
    removeType(type: SpecialType): number;
    /**
     * Shuffle the inventory (for certain effects)
     */
    shuffle(): void;
    /**
     * Clone the inventory
     */
    clone(): SpecialInventory;
}
/**
 * Create inventory from state
 */
export declare function createInventoryFromState(state: InventoryState): SpecialInventory;
//# sourceMappingURL=inventory.d.ts.map