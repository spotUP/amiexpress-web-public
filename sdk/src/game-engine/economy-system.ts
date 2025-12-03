/**
 * Crafting recipe interface
 */
export interface Recipe {
  id: string;
  name: string;
  ingredients: Array<{ itemId: string; quantity: number }>;
  result: { itemId: string; quantity: number };
  skillRequired?: string;
  skillLevel?: number;
  time: number; // milliseconds
}

/**
 * Market interface
 */
export interface Market {
  items: Map<string, number>; // itemId -> stock
  prices: Map<string, number>; // itemId -> basePrice
  trends: Map<string, number>; // itemId -> price multiplier
}

/**
 * Inventory interface
 */
export interface Inventory {
  items: Map<string, number>; // itemId -> quantity
  gold: number;
}

/**
 * Economy System for trading and crafting
 */
export class EconomySystem {
  private market: Market;
  private playerInventory: Inventory;
  private craftingRecipes: Map<string, Recipe>;

  constructor(startingGold: number = 100) {
    this.market = {
      items: new Map(),
      prices: new Map(),
      trends: new Map()
    };
    this.playerInventory = {
      items: new Map(),
      gold: startingGold
    };
    this.craftingRecipes = new Map();
    this.initializeDefaultRecipes();
  }

  /**
   * Initialize default crafting recipes
   */
  private initializeDefaultRecipes(): void {
    this.addRecipe({
      id: 'sword',
      name: 'Iron Sword',
      ingredients: [
        { itemId: 'iron_ore', quantity: 2 },
        { itemId: 'wood', quantity: 1 }
      ],
      result: { itemId: 'iron_sword', quantity: 1 },
      skillRequired: 'smithing',
      skillLevel: 1,
      time: 5000 // 5 seconds
    });

    this.addRecipe({
      id: 'armor',
      name: 'Iron Armor',
      ingredients: [
        { itemId: 'iron_ore', quantity: 4 },
        { itemId: 'leather', quantity: 2 }
      ],
      result: { itemId: 'iron_armor', quantity: 1 },
      skillRequired: 'smithing',
      skillLevel: 2,
      time: 10000 // 10 seconds
    });
  }

  /**
   * Add crafting recipe
   */
  addRecipe(recipe: Recipe): void {
    this.craftingRecipes.set(recipe.id, recipe);
  }

  /**
   * Get recipe by ID
   */
  getRecipe(recipeId: string): Recipe | undefined {
    return this.craftingRecipes.get(recipeId);
  }

  /**
   * Get all recipes
   */
  getAllRecipes(): Recipe[] {
    return Array.from(this.craftingRecipes.values());
  }

  /**
   * Set item price
   */
  setItemPrice(itemId: string, price: number): void {
    this.market.prices.set(itemId, price);
  }

  /**
   * Set item stock
   */
  setItemStock(itemId: string, stock: number): void {
    this.market.items.set(itemId, stock);
  }

  /**
   * Buy item from market
   */
  buyItem(itemId: string, quantity: number = 1): { success: boolean; message: string } {
    const price = this.getItemPrice(itemId) * quantity;
    const stock = this.market.items.get(itemId) || 0;

    if (stock < quantity) {
      return { success: false, message: 'Not enough stock!' };
    }

    if (this.playerInventory.gold >= price) {
      this.playerInventory.gold -= price;
      this.addToInventory(itemId, quantity);
      this.market.items.set(itemId, stock - quantity);

      return { success: true, message: `Bought ${quantity}x ${itemId} for ${price} gold.` };
    }

    return { success: false, message: 'Not enough gold!' };
  }

  /**
   * Sell item to market
   */
  sellItem(itemId: string, quantity: number = 1): { success: boolean; message: string } {
    const itemCount = this.playerInventory.items.get(itemId) || 0;

    if (itemCount >= quantity) {
      const price = Math.floor(this.getItemPrice(itemId) * quantity * 0.7); // 70% of buy price
      this.playerInventory.gold += price;
      this.removeFromInventory(itemId, quantity);

      const currentStock = this.market.items.get(itemId) || 0;
      this.market.items.set(itemId, currentStock + quantity);

      return { success: true, message: `Sold ${quantity}x ${itemId} for ${price} gold.` };
    }

    return { success: false, message: 'Not enough items!' };
  }

  /**
   * Craft an item
   */
  craftItem(recipeId: string): { success: boolean; message: string } {
    const recipe = this.craftingRecipes.get(recipeId);
    if (!recipe) {
      return { success: false, message: 'Unknown recipe!' };
    }

    // Check ingredients
    for (const ingredient of recipe.ingredients) {
      const count = this.playerInventory.items.get(ingredient.itemId) || 0;
      if (count < ingredient.quantity) {
        return { success: false, message: `Not enough ${ingredient.itemId}!` };
      }
    }

    // Remove ingredients
    for (const ingredient of recipe.ingredients) {
      this.removeFromInventory(ingredient.itemId, ingredient.quantity);
    }

    // Add result
    this.addToInventory(recipe.result.itemId, recipe.result.quantity);

    return { success: true, message: `Successfully crafted ${recipe.name}!` };
  }

  /**
   * Get item price with market fluctuations
   */
  getItemPrice(itemId: string): number {
    const basePrice = this.market.prices.get(itemId) || 10;
    const trend = this.market.trends.get(itemId) || 0;

    // Add some randomness
    const fluctuation = (Math.random() - 0.5) * 0.2; // ±10%

    return Math.floor(basePrice * (1 + trend + fluctuation));
  }

  /**
   * Add to inventory
   */
  addToInventory(itemId: string, quantity: number): void {
    const current = this.playerInventory.items.get(itemId) || 0;
    this.playerInventory.items.set(itemId, current + quantity);
  }

  /**
   * Remove from inventory
   */
  removeFromInventory(itemId: string, quantity: number): boolean {
    const current = this.playerInventory.items.get(itemId) || 0;
    if (current >= quantity) {
      this.playerInventory.items.set(itemId, current - quantity);
      return true;
    }
    return false;
  }

  /**
   * Get inventory
   */
  getInventory(): Inventory {
    return {
      items: new Map(this.playerInventory.items),
      gold: this.playerInventory.gold
    };
  }

  /**
   * Get gold amount
   */
  getGold(): number {
    return this.playerInventory.gold;
  }

  /**
   * Set gold amount
   */
  setGold(amount: number): void {
    this.playerInventory.gold = Math.max(0, amount);
  }

  /**
   * Add gold
   */
  addGold(amount: number): void {
    this.playerInventory.gold += amount;
  }

  /**
   * Remove gold
   */
  removeGold(amount: number): boolean {
    if (this.playerInventory.gold >= amount) {
      this.playerInventory.gold -= amount;
      return true;
    }
    return false;
  }

  /**
   * Get market info
   */
  getMarket(): Market {
    return {
      items: new Map(this.market.items),
      prices: new Map(this.market.prices),
      trends: new Map(this.market.trends)
    };
  }

  /**
   * Update market trends (call periodically)
   */
  updateMarketTrends(): void {
    this.market.trends.forEach((trend, itemId) => {
      // Slowly drift back to 0
      const newTrend = trend * 0.9 + (Math.random() - 0.5) * 0.1;
      this.market.trends.set(itemId, Math.max(-0.5, Math.min(0.5, newTrend)));
    });
  }
}
