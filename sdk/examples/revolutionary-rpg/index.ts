import {
  ANSIColor,
  AINPC,
  ProceduralGenerator,
  WorldGenerator,
  EconomySystem,
  RPGCharacter,
  Quest,
  GameUtils
} from '../../src/game-engine';

class RevolutionaryRPG {
  private socket: any;
  private player: RPGCharacter;
  private aiCompanion: AINPC;
  private generator: ProceduralGenerator;
  private world: WorldGenerator;
  private economy: EconomySystem;
  private username: string;
  private doorDirectory: string;
  private currentLocation: { x: number; y: number } = { x: 0, y: 0 };
  private activeQuests: Quest[] = [];

  constructor(socket: any, bbsSession: any, doorDirectory: string) {
    this.socket = socket;
    this.username = bbsSession.username || 'Player';
    this.doorDirectory = doorDirectory;

    this.player = new RPGCharacter({
      name: this.username,
      level: 1,
      experience: 0,
      health: 100,
      maxHealth: 100,
      mana: 50,
      maxMana: 50,
      gold: 100,
      inventory: [],
      equipment: {}
    });

    // Initialize AI companion with friendly personality
    this.aiCompanion = new AINPC({
      openness: 80,
      conscientiousness: 70,
      extraversion: 60,
      agreeableness: 85,
      neuroticism: 30,
      intelligence: 75,
      creativity: 70
    });

    this.generator = new ProceduralGenerator();
    this.world = new WorldGenerator();
    this.economy = new EconomySystem(100);

    // Set up basic market prices
    this.economy.setItemPrice('health_potion', 10);
    this.economy.setItemPrice('mana_potion', 15);
    this.economy.setItemPrice('iron_sword', 50);
    this.economy.setItemStock('health_potion', 100);
    this.economy.setItemStock('mana_potion', 100);
    this.economy.setItemStock('iron_sword', 10);
  }

  async run(): Promise<void> {
    try {
      await this.showIntro();
      await this.mainGameLoop();
    } catch (error) {
      console.error('Game error:', error);
      this.output('\r\n[ERROR] An error occurred. Please contact the sysop.\r\n');
    }
  }

  private async showIntro(): Promise<void> {
    let output = '\x1b[2J\x1b[H'; // Clear screen
    output += '\x1b[36m'; // Cyan
    output += GameUtils.centerText('==============================================================') + '\r\n';
    output += GameUtils.centerText('              REVOLUTIONARY BBS RPG') + '\r\n';
    output += GameUtils.centerText('         Next-Generation Gaming Experience') + '\r\n';
    output += GameUtils.centerText('==============================================================') + '\r\n';
    output += '\x1b[0m\r\n'; // Reset

    output += 'Welcome to the future of BBS gaming!\r\n\r\n';
    output += 'Features:\r\n';
    output += '\x1b[32m'; // Green
    output += '* AI Companions with Personality\r\n';
    output += '* Procedurally Generated Worlds\r\n';
    output += '* Dynamic Economy & Crafting\r\n';
    output += '* Quest System\r\n';
    output += '* Character Progression\r\n';
    output += '\x1b[0m\r\n'; // Reset

    output += 'Press any key to begin your adventure...\r\n';
    this.socket.emit('ansi-output', output);

    await this.waitForKey();
  }

  private async mainGameLoop(): Promise<void> {
    while (true) {
      const choice = await this.showMainMenu();

      switch (choice) {
        case 0:
          await this.exploreWorld();
          break;
        case 1:
          await this.interactWithCompanion();
          break;
        case 2:
          await this.manageInventory();
          break;
        case 3:
          await this.viewQuests();
          break;
        case 4:
          await this.craftingMenu();
          break;
        case 5:
          await this.viewStats();
          break;
        case 6:
          return; // Exit
      }
    }
  }

  private async showMainMenu(): Promise<number> {
    let output = '\x1b[2J\x1b[H'; // Clear screen

    output += '\x1b[33m'; // Yellow
    output += GameUtils.centerText('REVOLUTIONARY RPG') + '\r\n\r\n';
    output += '\x1b[0m'; // Reset

    output += '\x1b[33mMain Menu:\x1b[0m\r\n';
    const options = [
      '1. Explore World',
      '2. Talk to AI Companion',
      '3. Manage Inventory',
      '4. View Quests',
      '5. Crafting',
      '6. View Stats',
      '7. Exit Game'
    ];

    options.forEach(opt => {
      output += opt + '\r\n';
    });

    output += '\r\nChoose an option (1-7): ';
    this.socket.emit('ansi-output', output);

    const choice = await this.getInput();
    const num = parseInt(choice);
    return (num >= 1 && num <= 7) ? num - 1 : 0;
  }

  private async exploreWorld(): Promise<void> {
    let output = '\x1b[2J\x1b[H'; // Clear screen
    output += GameUtils.centerText('World Exploration') + '\r\n\r\n';

    // Generate current chunk
    const chunk = this.world.getChunk(this.currentLocation.x, this.currentLocation.y);

    output += `Current Location: ${chunk.x}, ${chunk.y}\r\n\r\n`;

    // Show nearby entities
    if (chunk.entities.length > 0) {
      output += '\x1b[36mNearby:\x1b[0m\r\n';
      for (const entity of chunk.entities) {
        output += `* ${entity.name} (${entity.type})\r\n`;
      }
      output += '\r\n';
    } else {
      output += 'The area seems quiet...\r\n\r\n';
    }

    // Movement options
    output += 'Movement:\r\n';
    output += '1. North\r\n2. South\r\n3. East\r\n4. West\r\n';
    if (chunk.entities.length > 0) output += '5. Interact\r\n';
    output += '0. Back\r\n\r\nChoice: ';

    this.socket.emit('ansi-output', output);

    const choice = await this.getInput();
    const num = parseInt(choice);

    switch (num) {
      case 1: this.currentLocation.y--; break;
      case 2: this.currentLocation.y++; break;
      case 3: this.currentLocation.x++; break;
      case 4: this.currentLocation.x--; break;
      case 5:
        if (chunk.entities.length > 0) {
          await this.interactWithEntities(chunk.entities);
        }
        break;
      case 0: return;
    }

    // Random encounters
    if (Math.random() < 0.3) {
      await this.randomEncounter();
    }
  }

  private async interactWithCompanion(): Promise<void> {
    let output = '\x1b[2J\x1b[H'; // Clear screen
    output += GameUtils.centerText('AI Companion') + '\r\n\r\n';
    output += 'Your AI companion awaits your words...\r\n\r\n';
    output += 'What do you say? ';
    this.socket.emit('ansi-output', output);

    const input = await this.getInput();

    if (input.trim()) {
      const response = this.aiCompanion.converse(input);

      output = '\r\n\x1b[35m'; // Magenta
      output += `Companion: "${response}"\r\n`;
      output += '\x1b[0m\r\nPress any key...\r\n';
      this.socket.emit('ansi-output', output);

      await this.waitForKey();
    }
  }

  private async manageInventory(): Promise<void> {
    let output = '\x1b[2J\x1b[H'; // Clear screen
    output += GameUtils.centerText('Inventory & Economy') + '\r\n\r\n';

    const inventory = this.economy.getInventory();

    output += `\x1b[33mGold: ${inventory.gold}\x1b[0m\r\n\r\n`;

    if (inventory.items.size === 0) {
      output += 'Your inventory is empty.\r\n';
    } else {
      output += 'Items:\r\n';
      for (const [itemId, count] of inventory.items) {
        output += `* ${itemId}: ${count}\r\n`;
      }
    }

    output += '\r\n1. Buy Items\r\n2. Sell Items\r\n0. Back\r\n\r\nChoice: ';
    this.socket.emit('ansi-output', output);

    const choice = await this.getInput();
    const num = parseInt(choice);

    if (num === 1) {
      output = '\r\nShop:\r\n';
      output += '1. Health Potion (10g)\r\n2. Mana Potion (15g)\r\n3. Iron Sword (50g)\r\n0. Cancel\r\n\r\nChoice: ';
      this.socket.emit('ansi-output', output);

      const buyChoice = await this.getInput();
      const buyNum = parseInt(buyChoice);

      if (buyNum >= 1 && buyNum <= 3) {
        const items = ['health_potion', 'mana_potion', 'iron_sword'];
        const result = this.economy.buyItem(items[buyNum - 1], 1);

        output = '\r\n' + result.message + '\r\n';
        this.socket.emit('ansi-output', output);
      }
    } else if (num === 2 && inventory.items.size > 0) {
      output = '\r\nSell:\r\n';
      const itemArray = Array.from(inventory.items.keys());
      itemArray.forEach((item, i) => {
        output += `${i + 1}. ${item}\r\n`;
      });
      output += '0. Cancel\r\n\r\nChoice: ';
      this.socket.emit('ansi-output', output);

      const sellChoice = await this.getInput();
      const sellNum = parseInt(sellChoice);

      if (sellNum >= 1 && sellNum <= itemArray.length) {
        const result = this.economy.sellItem(itemArray[sellNum - 1], 1);
        output = '\r\n' + result.message + '\r\n';
        this.socket.emit('ansi-output', output);
      }
    }

    output = '\r\nPress any key...\r\n';
    this.socket.emit('ansi-output', output);
    await this.waitForKey();
  }

  private async viewQuests(): Promise<void> {
    let output = '\x1b[2J\x1b[H'; // Clear screen
    output += GameUtils.centerText('Active Quests') + '\r\n\r\n';

    if (this.activeQuests.length === 0) {
      output += 'No active quests.\r\n\r\n';

      // Generate a random quest
      const quest = this.generator.generateQuest();
      output += 'A wandering adventurer approaches...\r\n';
      output += `\x1b[36m"${quest.title}"\x1b[0m\r\n`;
      output += quest.description + '\r\n\r\n';
      output += 'Accept quest? (y/n): ';
      this.socket.emit('ansi-output', output);

      const accept = await this.getInput();
      if (accept.toLowerCase().startsWith('y')) {
        this.activeQuests.push(quest);
        output = '\r\nQuest accepted!\r\n';
        this.socket.emit('ansi-output', output);
      }
    } else {
      for (const quest of this.activeQuests) {
        output += `\x1b[32m${quest.title}\x1b[0m\r\n`;
        output += quest.description + '\r\n';
        output += `Objectives: ${quest.objectives.join(', ')}\r\n`;
        output += `Reward: ${quest.reward.gold || 0}g`;
        if (quest.reward.xp) output += `, ${quest.reward.xp} XP`;
        output += '\r\n\r\n';
      }
    }

    output += '\r\nPress any key...\r\n';
    this.socket.emit('ansi-output', output);
    await this.waitForKey();
  }

  private async craftingMenu(): Promise<void> {
    let output = '\x1b[2J\x1b[H'; // Clear screen
    output += GameUtils.centerText('Crafting System') + '\r\n\r\n';

    const recipes = this.economy.getAllRecipes();

    output += 'Available Recipes:\r\n\r\n';

    recipes.forEach((recipe, i) => {
      output += `${i + 1}. ${recipe.name}\r\n`;
      output += `   Ingredients: ${recipe.ingredients.map(ing => `${ing.quantity}x ${ing.itemId}`).join(', ')}\r\n`;
      output += `   Time: ${recipe.time / 1000}s\r\n\r\n`;
    });

    output += 'Enter recipe number (or 0 to cancel): ';
    this.socket.emit('ansi-output', output);

    const choice = await this.getInput();
    const numChoice = parseInt(choice) - 1;

    if (numChoice >= 0 && numChoice < recipes.length) {
      const result = this.economy.craftItem(recipes[numChoice].id);
      output = '\r\n' + result.message + '\r\n';
      this.socket.emit('ansi-output', output);
    }

    output = '\r\nPress any key...\r\n';
    this.socket.emit('ansi-output', output);
    await this.waitForKey();
  }

  private async viewStats(): Promise<void> {
    const stats = this.player.formatCharacterSheet();

    let output = '\x1b[2J\x1b[H'; // Clear screen
    output += stats;
    output += '\r\nPress any key...\r\n';
    this.socket.emit('ansi-output', output);

    await this.waitForKey();
  }

  private async interactWithEntities(entities: any[]): Promise<void> {
    if (entities.length === 0) return;

    let output = '\r\nInteract with:\r\n';
    entities.forEach((e, i) => {
      output += `${i + 1}. ${e.name}\r\n`;
    });
    output += '0. Cancel\r\n\r\nChoice: ';
    this.socket.emit('ansi-output', output);

    const choice = await this.getInput();
    const num = parseInt(choice) - 1;

    if (num >= 0 && num < entities.length) {
      const entity = entities[num];
      output = `\r\nYou approach the ${entity.name}...\r\n`;

      if (entity.type === 'npc') {
        const response = this.aiCompanion.converse('Hello there!');
        output += `\x1b[32m${entity.name}: "${response}"\x1b[0m\r\n`;
      } else if (entity.type === 'monster') {
        output += 'A battle begins!\r\n';
      } else if (entity.type === 'treasure') {
        output += '\x1b[33mYou found treasure!\x1b[0m\r\n';
        this.player.addGold(50);
        output += 'Gained 50 gold!\r\n';
      }

      this.socket.emit('ansi-output', output);
      await this.waitForKey();
    }
  }

  private async randomEncounter(): Promise<void> {
    const encounters = [
      'a wandering merchant',
      'a mysterious stranger',
      'a wild creature',
      'an ancient ruin',
      'a hidden treasure'
    ];

    const encounter = encounters[Math.floor(Math.random() * encounters.length)];

    let output = '\r\n\x1b[31m';
    output += `You encounter ${encounter}!\r\n`;
    output += '\x1b[0m';
    this.socket.emit('ansi-output', output);

    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  private output(text: string): void {
    this.socket.emit('ansi-output', text);
  }

  private async getInput(): Promise<string> {
    return new Promise((resolve) => {
      const handler = (data: string) => {
        this.socket.removeListener('user-input', handler);
        resolve(data.trim());
      };
      this.socket.on('user-input', handler);
    });
  }

  private async waitForKey(): Promise<void> {
    return new Promise((resolve) => {
      const handler = () => {
        this.socket.removeListener('user-input', handler);
        resolve();
      };
      this.socket.once('user-input', handler);
    });
  }
}

// Export door function
export async function runDoor(doorSession: any): Promise<void> {
  const doorDirectory = doorSession.doorDirectory || process.cwd();
  const game = new RevolutionaryRPG(doorSession.socket, doorSession, doorDirectory);
  await game.run();
}
