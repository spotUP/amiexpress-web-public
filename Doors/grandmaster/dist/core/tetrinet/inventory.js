"use strict";
/**
 * TetriNET Special Inventory
 *
 * FIFO queue for collecting and using special blocks.
 * Players collect specials when clearing lines and use them against opponents.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpecialInventory = void 0;
exports.createInventoryFromState = createInventoryFromState;
const specials_1 = require("./specials");
/**
 * Special inventory manager
 */
class SpecialInventory {
    constructor(maxSize = 10) {
        this.specials = [];
        this.maxSize = Math.max(1, Math.min(256, maxSize));
    }
    /**
     * Add a special to the end of the queue
     * Returns true if added, false if inventory was full (oldest is dropped)
     */
    add(special) {
        if (this.specials.length >= this.maxSize) {
            return false;
        }
        const insertIndex = Math.floor(Math.random() * (this.specials.length + 1));
        this.specials.splice(insertIndex, 0, special);
        return true;
    }
    /**
     * Add multiple specials at once
     */
    addMultiple(specials) {
        for (const special of specials) {
            this.add(special);
        }
    }
    /**
     * Use (remove and return) the first special in queue
     */
    use() {
        if (this.specials.length === 0) {
            return null;
        }
        return this.specials.shift();
    }
    /**
     * Peek at the first special without removing it
     */
    peek() {
        if (this.specials.length === 0) {
            return null;
        }
        return this.specials[0];
    }
    /**
     * Peek at special at specific index
     */
    peekAt(index) {
        if (index < 0 || index >= this.specials.length) {
            return null;
        }
        return this.specials[index];
    }
    /**
     * Get all specials (copy of array)
     */
    getAll() {
        return [...this.specials];
    }
    /**
     * Clear all specials from inventory
     */
    clear() {
        this.specials = [];
    }
    /**
     * Get current inventory size
     */
    size() {
        return this.specials.length;
    }
    /**
     * Check if inventory is empty
     */
    isEmpty() {
        return this.specials.length === 0;
    }
    /**
     * Check if inventory is full
     */
    isFull() {
        return this.specials.length >= this.maxSize;
    }
    /**
     * Get maximum inventory size
     */
    getMaxSize() {
        return this.maxSize;
    }
    /**
     * Set maximum inventory size
     */
    setMaxSize(size) {
        this.maxSize = Math.max(1, Math.min(256, size));
        while (this.specials.length > this.maxSize) {
            this.specials.pop();
        }
    }
    /**
     * Get state for serialization
     */
    getState() {
        return {
            specials: [...this.specials],
            maxSize: this.maxSize,
        };
    }
    /**
     * Load state from serialization
     */
    loadState(state) {
        this.specials = [...state.specials];
        this.maxSize = state.maxSize;
    }
    /**
     * Get display string for inventory (colored special chars)
     */
    getDisplay() {
        if (this.specials.length === 0) {
            return '{gray-fg}[empty]{/gray-fg}';
        }
        return this.specials.map(s => (0, specials_1.getSpecialDisplay)(s)).join('');
    }
    /**
     * Get display string with slots shown
     */
    getDisplayWithSlots() {
        const slots = [];
        for (let i = 0; i < this.maxSize; i++) {
            if (i < this.specials.length) {
                slots.push((0, specials_1.getSpecialDisplay)(this.specials[i]));
            }
            else {
                slots.push('{gray-fg}.{/gray-fg}');
            }
        }
        return '[' + slots.join('') + ']';
    }
    /**
     * Get display info for a specific slot
     */
    getSlotInfo(index) {
        const special = this.peekAt(index);
        if (!special) {
            return { special: null, name: 'Empty', description: 'No special in this slot' };
        }
        const def = specials_1.SPECIALS[special];
        return {
            special,
            name: def.name,
            description: def.description,
        };
    }
    /**
     * Count specials of a specific type
     */
    countType(type) {
        return this.specials.filter(s => s === type).length;
    }
    /**
     * Remove all specials of a specific type
     */
    removeType(type) {
        const count = this.countType(type);
        this.specials = this.specials.filter(s => s !== type);
        return count;
    }
    /**
     * Shuffle the inventory (for certain effects)
     */
    shuffle() {
        for (let i = this.specials.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.specials[i], this.specials[j]] = [this.specials[j], this.specials[i]];
        }
    }
    /**
     * Clone the inventory
     */
    clone() {
        const cloned = new SpecialInventory(this.maxSize);
        cloned.specials = [...this.specials];
        return cloned;
    }
}
exports.SpecialInventory = SpecialInventory;
/**
 * Create inventory from state
 */
function createInventoryFromState(state) {
    const inventory = new SpecialInventory(state.maxSize);
    inventory.loadState(state);
    return inventory;
}
//# sourceMappingURL=inventory.js.map