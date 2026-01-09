/**
 * TetriNET Special Inventory
 *
 * FIFO queue for collecting and using special blocks.
 * Players collect specials when clearing lines and use them against opponents.
 */

import type { SpecialType } from './specials';
import { SPECIALS, getSpecialDisplay } from './specials';

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
export class SpecialInventory {
  private specials: SpecialType[] = [];
  private maxSize: number;

  constructor(maxSize: number = 10) {
    this.maxSize = Math.max(1, Math.min(15, maxSize));  // Clamp 1-15
  }

  /**
   * Add a special to the end of the queue
   * Returns true if added, false if inventory was full (oldest is dropped)
   */
  add(special: SpecialType): boolean {
    if (this.specials.length >= this.maxSize) {
      // Drop oldest (front) to make room
      this.specials.shift();
      this.specials.push(special);
      return false;  // Indicates overflow
    }

    this.specials.push(special);
    return true;
  }

  /**
   * Add multiple specials at once
   */
  addMultiple(specials: SpecialType[]): void {
    for (const special of specials) {
      this.add(special);
    }
  }

  /**
   * Use (remove and return) the first special in queue
   */
  use(): SpecialType | null {
    if (this.specials.length === 0) {
      return null;
    }
    return this.specials.shift()!;
  }

  /**
   * Peek at the first special without removing it
   */
  peek(): SpecialType | null {
    if (this.specials.length === 0) {
      return null;
    }
    return this.specials[0];
  }

  /**
   * Peek at special at specific index
   */
  peekAt(index: number): SpecialType | null {
    if (index < 0 || index >= this.specials.length) {
      return null;
    }
    return this.specials[index];
  }

  /**
   * Get all specials (copy of array)
   */
  getAll(): SpecialType[] {
    return [...this.specials];
  }

  /**
   * Clear all specials from inventory
   */
  clear(): void {
    this.specials = [];
  }

  /**
   * Get current inventory size
   */
  size(): number {
    return this.specials.length;
  }

  /**
   * Check if inventory is empty
   */
  isEmpty(): boolean {
    return this.specials.length === 0;
  }

  /**
   * Check if inventory is full
   */
  isFull(): boolean {
    return this.specials.length >= this.maxSize;
  }

  /**
   * Get maximum inventory size
   */
  getMaxSize(): number {
    return this.maxSize;
  }

  /**
   * Set maximum inventory size
   */
  setMaxSize(size: number): void {
    this.maxSize = Math.max(1, Math.min(15, size));
    // Trim if needed
    while (this.specials.length > this.maxSize) {
      this.specials.shift();
    }
  }

  /**
   * Get state for serialization
   */
  getState(): InventoryState {
    return {
      specials: [...this.specials],
      maxSize: this.maxSize,
    };
  }

  /**
   * Load state from serialization
   */
  loadState(state: InventoryState): void {
    this.specials = [...state.specials];
    this.maxSize = state.maxSize;
  }

  /**
   * Get display string for inventory (colored special chars)
   */
  getDisplay(): string {
    if (this.specials.length === 0) {
      return '{gray-fg}[empty]{/gray-fg}';
    }

    return this.specials.map(s => getSpecialDisplay(s)).join('');
  }

  /**
   * Get display string with slots shown
   */
  getDisplayWithSlots(): string {
    const slots: string[] = [];

    for (let i = 0; i < this.maxSize; i++) {
      if (i < this.specials.length) {
        slots.push(getSpecialDisplay(this.specials[i]));
      } else {
        slots.push('{gray-fg}.{/gray-fg}');
      }
    }

    return '[' + slots.join('') + ']';
  }

  /**
   * Get display info for a specific slot
   */
  getSlotInfo(index: number): { special: SpecialType | null; name: string; description: string } {
    const special = this.peekAt(index);
    if (!special) {
      return { special: null, name: 'Empty', description: 'No special in this slot' };
    }

    const def = SPECIALS[special];
    return {
      special,
      name: def.name,
      description: def.description,
    };
  }

  /**
   * Count specials of a specific type
   */
  countType(type: SpecialType): number {
    return this.specials.filter(s => s === type).length;
  }

  /**
   * Remove all specials of a specific type
   */
  removeType(type: SpecialType): number {
    const count = this.countType(type);
    this.specials = this.specials.filter(s => s !== type);
    return count;
  }

  /**
   * Shuffle the inventory (for certain effects)
   */
  shuffle(): void {
    for (let i = this.specials.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.specials[i], this.specials[j]] = [this.specials[j], this.specials[i]];
    }
  }

  /**
   * Clone the inventory
   */
  clone(): SpecialInventory {
    const cloned = new SpecialInventory(this.maxSize);
    cloned.specials = [...this.specials];
    return cloned;
  }
}

/**
 * Create inventory from state
 */
export function createInventoryFromState(state: InventoryState): SpecialInventory {
  const inventory = new SpecialInventory(state.maxSize);
  inventory.loadState(state);
  return inventory;
}
