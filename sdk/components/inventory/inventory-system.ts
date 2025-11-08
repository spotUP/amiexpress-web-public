/**
 * Inventory System - Item Management for RPG Doors
 *
 * Handles item management, equipment, and inventory operations.
 *
 * Features:
 * - Item stacking
 * - Weight/capacity limits
 * - Equipment slots
 * - Item categories
 * - Item usage/consumption
 * - Crafting recipes
 * - Item durability
 *
 * @example Basic Usage
 * ```typescript
 * const inventory = new InventorySystem({ capacity: 20 });
 *
 * inventory.addItem({
 *   id: 'sword1',
 *   name: 'Iron Sword',
 *   description: 'A basic iron sword',
 *   quantity: 1,
 *   properties: { damage: 10, durability: 100 }
 * });
 *
 * const sword = inventory.getItem('sword1');
 * inventory.useItem('sword1');
 * ```
 *
 * @example Equipment System
 * ```typescript
 * inventory.createSlot('weapon', 1);
 * inventory.createSlot('armor', 1);
 *
 * inventory.equip('sword1', 'weapon');
 * const equipped = inventory.getEquipped('weapon');
 * ```
 */

import { EventEmitter } from 'events';
import { InventoryItem } from '../../core/types';

/**
 * Inventory configuration
 */
export interface InventoryConfig {
  /** Max item capacity (number of stacks) */
  capacity?: number;
  /** Max weight limit */
  maxWeight?: number;
  /** Enable stacking */
  allowStacking?: boolean;
  /** Default stack size */
  defaultStackSize?: number;
}

/**
 * Equipment slot
 */
export interface EquipmentSlot {
  /** Slot name */
  name: string;
  /** Max items in slot */
  capacity: number;
  /** Currently equipped items */
  items: InventoryItem[];
  /** Allowed item types */
  allowedTypes?: string[];
}

/**
 * Crafting recipe
 */
export interface CraftingRecipe {
  /** Recipe ID */
  id: string;
  /** Result item ID */
  result: string;
  /** Result quantity */
  quantity: number;
  /** Required ingredients */
  ingredients: Array<{
    itemId: string;
    quantity: number;
  }>;
  /** Required level/skill */
  requiredLevel?: number;
  /** Crafting time (ms) */
  craftingTime?: number;
}

/**
 * Item filter
 */
export type ItemFilter = (item: InventoryItem) => boolean;

/**
 * Inventory System
 * Handles all inventory and equipment management
 */
export class InventorySystem extends EventEmitter {
  private config: Required<InventoryConfig>;
  private items: Map<string, InventoryItem> = new Map();
  private equipment: Map<string, EquipmentSlot> = new Map();
  private recipes: Map<string, CraftingRecipe> = new Map();
  private currentWeight: number = 0;

  constructor(config: InventoryConfig = {}) {
    super();

    this.config = {
      capacity: config.capacity || 100,
      maxWeight: config.maxWeight || 1000,
      allowStacking: config.allowStacking ?? true,
      defaultStackSize: config.defaultStackSize || 99
    };
  }

  /**
   * Add item to inventory
   */
  addItem(item: InventoryItem): boolean {
    // Check capacity
    if (this.items.size >= this.config.capacity && !this.items.has(item.id)) {
      this.emit('inventory-full');
      return false;
    }

    // Check weight
    const weight = item.properties.weight || 0;
    if (this.currentWeight + (weight * item.quantity) > this.config.maxWeight) {
      this.emit('weight-limit-exceeded');
      return false;
    }

    // Check if item already exists (stacking)
    const existing = this.items.get(item.id);
    if (existing && this.config.allowStacking) {
      const maxStack = item.properties.maxStack || this.config.defaultStackSize;
      const canAdd = maxStack - existing.quantity;

      if (canAdd > 0) {
        existing.quantity += Math.min(item.quantity, canAdd);
        this.currentWeight += weight * Math.min(item.quantity, canAdd);
        this.emit('item-added', existing);
        return true;
      } else {
        this.emit('stack-full', item);
        return false;
      }
    }

    // Add new item
    this.items.set(item.id, item);
    this.currentWeight += weight * item.quantity;
    this.emit('item-added', item);

    return true;
  }

  /**
   * Remove item from inventory
   */
  removeItem(itemId: string, quantity: number = 1): boolean {
    const item = this.items.get(itemId);
    if (!item) return false;

    if (item.quantity <= quantity) {
      // Remove entire stack
      this.items.delete(itemId);
      const weight = item.properties.weight || 0;
      this.currentWeight -= weight * item.quantity;
      this.emit('item-removed', item);
    } else {
      // Reduce quantity
      item.quantity -= quantity;
      const weight = item.properties.weight || 0;
      this.currentWeight -= weight * quantity;
      this.emit('item-quantity-changed', item);
    }

    return true;
  }

  /**
   * Get item by ID
   */
  getItem(itemId: string): InventoryItem | undefined {
    return this.items.get(itemId);
  }

  /**
   * Check if has item
   */
  hasItem(itemId: string, quantity: number = 1): boolean {
    const item = this.items.get(itemId);
    return item !== undefined && item.quantity >= quantity;
  }

  /**
   * Get item count
   */
  getItemCount(itemId: string): number {
    const item = this.items.get(itemId);
    return item ? item.quantity : 0;
  }

  /**
   * Get all items
   */
  getAllItems(): InventoryItem[] {
    return Array.from(this.items.values());
  }

  /**
   * Find items by filter
   */
  findItems(filter: ItemFilter): InventoryItem[] {
    return this.getAllItems().filter(filter);
  }

  /**
   * Find items by name (fuzzy)
   */
  findItemsByName(name: string): InventoryItem[] {
    const lowerName = name.toLowerCase();
    return this.getAllItems().filter(item =>
      item.name.toLowerCase().includes(lowerName)
    );
  }

  /**
   * Sort items by property
   */
  sortItems(property: keyof InventoryItem | string, descending: boolean = false): InventoryItem[] {
    const items = this.getAllItems();

    items.sort((a, b) => {
      let aVal: any = property in a ? a[property as keyof InventoryItem] : a.properties[property];
      let bVal: any = property in b ? b[property as keyof InventoryItem] : b.properties[property];

      if (aVal < bVal) return descending ? 1 : -1;
      if (aVal > bVal) return descending ? -1 : 1;
      return 0;
    });

    return items;
  }

  /**
   * Use item
   */
  useItem(itemId: string): boolean {
    const item = this.items.get(itemId);
    if (!item) return false;

    // Call item's use callback
    if (item.onUse) {
      item.onUse();
    }

    // Reduce durability if applicable
    if (item.properties.durability !== undefined) {
      item.properties.durability--;

      if (item.properties.durability <= 0) {
        this.removeItem(itemId, item.quantity);
        this.emit('item-broken', item);
        return false;
      }
    }

    // Consume item if consumable
    if (item.properties.consumable) {
      this.removeItem(itemId, 1);
    }

    this.emit('item-used', item);
    return true;
  }

  /**
   * Drop item (remove without consuming)
   */
  dropItem(itemId: string, quantity: number = 1): InventoryItem | null {
    const item = this.items.get(itemId);
    if (!item) return null;

    const dropped: InventoryItem = {
      ...item,
      quantity: Math.min(quantity, item.quantity)
    };

    this.removeItem(itemId, quantity);
    this.emit('item-dropped', dropped);

    return dropped;
  }

  /**
   * Create equipment slot
   */
  createSlot(name: string, capacity: number = 1, allowedTypes?: string[]): void {
    this.equipment.set(name, {
      name,
      capacity,
      items: [],
      allowedTypes
    });

    this.emit('slot-created', name);
  }

  /**
   * Equip item to slot
   */
  equip(itemId: string, slotName: string): boolean {
    const item = this.items.get(itemId);
    const slot = this.equipment.get(slotName);

    if (!item || !slot) return false;

    // Check if item type is allowed
    if (slot.allowedTypes && !slot.allowedTypes.includes(item.properties.type || '')) {
      this.emit('equip-failed', item, 'type-mismatch');
      return false;
    }

    // Check slot capacity
    if (slot.items.length >= slot.capacity) {
      // Unequip existing item first
      const existing = slot.items[0];
      this.unequip(existing.id, slotName);
    }

    // Remove from inventory
    this.removeItem(itemId, 1);

    // Add to slot
    slot.items.push(item);

    this.emit('item-equipped', item, slotName);
    return true;
  }

  /**
   * Unequip item from slot
   */
  unequip(itemId: string, slotName: string): boolean {
    const slot = this.equipment.get(slotName);
    if (!slot) return false;

    const index = slot.items.findIndex(i => i.id === itemId);
    if (index === -1) return false;

    const item = slot.items[index];
    slot.items.splice(index, 1);

    // Add back to inventory
    this.addItem(item);

    this.emit('item-unequipped', item, slotName);
    return true;
  }

  /**
   * Get equipped items in slot
   */
  getEquipped(slotName: string): InventoryItem[] {
    const slot = this.equipment.get(slotName);
    return slot ? slot.items : [];
  }

  /**
   * Get all equipped items
   */
  getAllEquipped(): Map<string, InventoryItem[]> {
    const result = new Map<string, InventoryItem[]>();

    for (const [name, slot] of this.equipment.entries()) {
      if (slot.items.length > 0) {
        result.set(name, slot.items);
      }
    }

    return result;
  }

  /**
   * Register crafting recipe
   */
  registerRecipe(recipe: CraftingRecipe): void {
    this.recipes.set(recipe.id, recipe);
    this.emit('recipe-registered', recipe);
  }

  /**
   * Check if can craft recipe
   */
  canCraft(recipeId: string): boolean {
    const recipe = this.recipes.get(recipeId);
    if (!recipe) return false;

    // Check all ingredients
    for (const ingredient of recipe.ingredients) {
      if (!this.hasItem(ingredient.itemId, ingredient.quantity)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Craft item from recipe
   */
  craft(recipeId: string): InventoryItem | null {
    const recipe = this.recipes.get(recipeId);
    if (!recipe || !this.canCraft(recipeId)) {
      return null;
    }

    // Remove ingredients
    for (const ingredient of recipe.ingredients) {
      this.removeItem(ingredient.itemId, ingredient.quantity);
    }

    // Create result item
    const resultItem: InventoryItem = {
      id: `${recipe.result}_${Date.now()}`,
      name: recipe.result,
      description: `Crafted ${recipe.result}`,
      quantity: recipe.quantity,
      properties: {}
    };

    this.addItem(resultItem);
    this.emit('item-crafted', resultItem, recipe);

    return resultItem;
  }

  /**
   * Get current weight
   */
  getCurrentWeight(): number {
    return this.currentWeight;
  }

  /**
   * Get weight percentage
   */
  getWeightPercentage(): number {
    return (this.currentWeight / this.config.maxWeight) * 100;
  }

  /**
   * Get total number of different items
   */
  getTotalItems(): number {
    return this.items.size;
  }

  /**
   * Get capacity percentage
   */
  getCapacityPercentage(): number {
    return (this.items.size / this.config.capacity) * 100;
  }

  /**
   * Clear inventory
   */
  clear(): void {
    this.items.clear();
    this.currentWeight = 0;
    this.emit('inventory-cleared');
  }

  /**
   * Export inventory to JSON
   */
  exportToJSON(): string {
    return JSON.stringify({
      items: Array.from(this.items.values()),
      equipment: Array.from(this.equipment.entries())
    }, null, 2);
  }

  /**
   * Import inventory from JSON
   */
  importFromJSON(json: string): void {
    const data = JSON.parse(json);

    this.clear();

    if (data.items) {
      for (const item of data.items) {
        this.addItem(item);
      }
    }

    if (data.equipment) {
      for (const [name, slot] of data.equipment) {
        this.equipment.set(name, slot);
      }
    }

    this.emit('inventory-imported');
  }

  /**
   * Cleanup
   */
  dispose(): void {
    this.items.clear();
    this.equipment.clear();
    this.recipes.clear();
    this.removeAllListeners();
  }
}
