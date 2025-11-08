/**
 * Inventory System Test Suite
 *
 * Tests item management, equipment, and crafting.
 */

import { InventorySystem } from '../components/inventory/inventory-system';

describe('InventorySystem', () => {
  let inventory: InventorySystem;

  beforeEach(() => {
    inventory = new InventorySystem({ capacity: 10, maxWeight: 100 });
  });

  afterEach(() => {
    inventory.dispose();
  });

  describe('Item Management', () => {
    it('should add item to inventory', () => {
      const item = {
        id: 'sword1',
        name: 'Iron Sword',
        description: 'A basic sword',
        quantity: 1,
        properties: {}
      };

      const added = inventory.addItem(item);
      expect(added).toBe(true);
      expect(inventory.hasItem('sword1')).toBe(true);
    });

    it('should stack identical items', () => {
      const item = {
        id: 'potion',
        name: 'Health Potion',
        description: 'Restores HP',
        quantity: 1,
        properties: { maxStack: 99 }
      };

      inventory.addItem(item);
      inventory.addItem({ ...item, quantity: 5 });

      expect(inventory.getItemCount('potion')).toBe(6);
    });

    it('should remove items', () => {
      const item = {
        id: 'item1',
        name: 'Test Item',
        description: 'Test',
        quantity: 5,
        properties: {}
      };

      inventory.addItem(item);
      inventory.removeItem('item1', 2);

      expect(inventory.getItemCount('item1')).toBe(3);
    });

    it('should respect capacity limits', () => {
      const inv = new InventorySystem({ capacity: 2 });

      inv.addItem({ id: '1', name: '1', description: '', quantity: 1, properties: {} });
      inv.addItem({ id: '2', name: '2', description: '', quantity: 1, properties: {} });
      const added = inv.addItem({ id: '3', name: '3', description: '', quantity: 1, properties: {} });

      expect(added).toBe(false);
    });

    it('should respect weight limits', () => {
      const inv = new InventorySystem({ maxWeight: 10 });

      const added = inv.addItem({
        id: 'heavy',
        name: 'Heavy Item',
        description: 'Very heavy',
        quantity: 1,
        properties: { weight: 20 }
      });

      expect(added).toBe(false);
    });
  });

  describe('Item Queries', () => {
    beforeEach(() => {
      inventory.addItem({ id: 'sword', name: 'Sword', description: '', quantity: 1, properties: { type: 'weapon' } });
      inventory.addItem({ id: 'shield', name: 'Shield', description: '', quantity: 1, properties: { type: 'armor' } });
      inventory.addItem({ id: 'potion', name: 'Potion', description: '', quantity: 5, properties: { type: 'consumable' } });
    });

    it('should get all items', () => {
      const items = inventory.getAllItems();
      expect(items).toHaveLength(3);
    });

    it('should find items by filter', () => {
      const weapons = inventory.findItems(item => item.properties.type === 'weapon');
      expect(weapons).toHaveLength(1);
      expect(weapons[0].id).toBe('sword');
    });

    it('should find items by name', () => {
      const found = inventory.findItemsByName('sword');
      expect(found).toHaveLength(1);
      expect(found[0].id).toBe('sword');
    });
  });

  describe('Equipment System', () => {
    it('should create equipment slot', () => {
      inventory.createSlot('weapon', 1);
      expect(inventory.getEquipped('weapon')).toHaveLength(0);
    });

    it('should equip item', () => {
      inventory.createSlot('weapon', 1);
      inventory.addItem({
        id: 'sword',
        name: 'Sword',
        description: '',
        quantity: 1,
        properties: { type: 'weapon' }
      });

      const equipped = inventory.equip('sword', 'weapon');
      expect(equipped).toBe(true);
      expect(inventory.getEquipped('weapon')).toHaveLength(1);
    });

    it('should unequip item', () => {
      inventory.createSlot('weapon', 1);
      inventory.addItem({ id: 'sword', name: 'Sword', description: '', quantity: 1, properties: {} });
      inventory.equip('sword', 'weapon');
      inventory.unequip('sword', 'weapon');

      expect(inventory.getEquipped('weapon')).toHaveLength(0);
      expect(inventory.hasItem('sword')).toBe(true);
    });
  });

  describe('Crafting', () => {
    it('should register recipe', () => {
      const recipe = {
        id: 'craft_sword',
        result: 'iron_sword',
        quantity: 1,
        ingredients: [
          { itemId: 'iron', quantity: 3 },
          { itemId: 'wood', quantity: 1 }
        ]
      };

      inventory.registerRecipe(recipe);
      expect(inventory.canCraft('craft_sword')).toBe(false); // No ingredients yet
    });

    it('should craft item when ingredients available', () => {
      const recipe = {
        id: 'craft_sword',
        result: 'iron_sword',
        quantity: 1,
        ingredients: [
          { itemId: 'iron', quantity: 2 }
        ]
      };

      inventory.registerRecipe(recipe);
      inventory.addItem({ id: 'iron', name: 'Iron', description: '', quantity: 2, properties: {} });

      const crafted = inventory.craft('craft_sword');
      expect(crafted).not.toBeNull();
      expect(inventory.getItemCount('iron')).toBe(0);
    });
  });

  describe('Import/Export', () => {
    it('should export to JSON', () => {
      inventory.addItem({ id: 'item1', name: 'Item', description: '', quantity: 1, properties: {} });
      const json = inventory.exportToJSON();
      expect(json).toContain('item1');
    });

    it('should import from JSON', () => {
      const json = inventory.exportToJSON();
      const newInv = new InventorySystem();
      newInv.importFromJSON(json);
      expect(newInv.getTotalItems()).toBe(inventory.getTotalItems());
    });
  });
});
