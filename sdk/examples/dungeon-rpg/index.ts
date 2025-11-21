// @ts-nocheck
/// <reference path="./types.d.ts" />
/**
 * Dungeon RPG - Comprehensive SDK Example
 *
 * A complete dungeon crawler demonstrating ALL SDK features:
 * - AI Engine: Enemy pathfinding and behavior
 * - Level Manager: Tile-based dungeon maps
 * - Inventory: Equipment and items
 * - Save/Load: Persistent game state
 * - Dialogue: NPC conversations
 * - Quest System: Objectives and rewards
 * - Graphics: ANSI dungeon rendering
 * - Physics: Collision detection
 * - Audio: Sound effects
 * - Input: Player movement
 * - HUD: Status display
 *
 * Controls:
 * - Arrow Keys: Move
 * - Space: Attack
 * - I: Inventory
 * - Q: Quests
 * - T: Talk to NPC
 * - S: Save Game
 * - L: Load Game
 * - Esc: Menu
 */

import {
  ClientDoor,
  GraphicsEngine,
  PhysicsEngine,
  AudioEngine,
  AIEngine,
  InputEngine,
  LevelManager,
  InventorySystem,
  DialogueSystem,
  QuestSystem,
  HUDBuilder,
  AnsiColor
} from '@amiexpress/bbs-door-sdk/client';

interface Player {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  level: number;
  xp: number;
  gold: number;
}

interface Enemy {
  id: string;
  name: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  damage: number;
  xp: number;
  gold: number;
}

class DungeonRPG {
  private door: ClientDoor;
  private gfx: GraphicsEngine;
  private physics: PhysicsEngine;
  private audio: AudioEngine;
  private ai: AIEngine;
  private input: InputEngine;
  private levelMgr: LevelManager;
  private inventory: InventorySystem;
  private dialogue: DialogueSystem;
  private quests: QuestSystem;
  private hud: HUDBuilder;

  private player: Player;
  private enemies: Map<string, Enemy> = new Map();
  private npcs: Map<string, { x: number; y: number; name: string }> = new Map();
  private currentLevel: string = 'dungeon1';
  private userId?: number;
  private gameLoop?: NodeJS.Timeout;
  private inMenu: boolean = false;

  constructor() {
    this.door = new ClientDoor({
      name: 'Dungeon RPG',
      version: '1.0.0',
      author: 'AmiExpress SDK Team',
      description: 'Comprehensive RPG example'
    });

    this.gfx = new GraphicsEngine({ width: 80, height: 24 });
    this.physics = new PhysicsEngine({ gravity: 0 });
    this.audio = new AudioEngine();
    this.ai = new AIEngine({ updateInterval: 200 });
    this.input = new InputEngine();
    this.levelMgr = new LevelManager();
    this.inventory = new InventorySystem({ capacity: 20, maxWeight: 100 });
    this.dialogue = new DialogueSystem();
    this.quests = new QuestSystem();
    this.hud = new HUDBuilder();

    this.player = {
      x: 5,
      y: 5,
      hp: 100,
      maxHp: 100,
      level: 1,
      xp: 0,
      gold: 0
    };

    this.setupLevel();
    this.setupQuests();
    this.setupDialogue();
    this.setupInput();
    this.setupDoorEvents();
  }

  private setupLevel() {
    // Create dungeon level
    this.levelMgr.loadFromString('dungeon1', `
####################
#..................#
#..S.........E....#
#....#####.........#
#....#...#.........#
#....#.N.#.........#
#....#...#.........#
#....#####.........#
#..................#
#.........#####....#
#.........#...#....#
#.........#.X.#....#
#.........#...#....#
#.........#####....#
#..................#
####################
    `.trim(), {
      '#': { type: 'wall', solid: true, char: '#', color: AnsiColor.White },
      '.': { type: 'floor', solid: false, char: '.', color: AnsiColor.Black },
      'S': { type: 'spawn', solid: false, char: '.', color: AnsiColor.Black },
      'E': { type: 'enemy', solid: false, char: '.', color: AnsiColor.Black },
      'N': { type: 'npc', solid: false, char: '.', color: AnsiColor.Black },
      'X': { type: 'exit', solid: false, char: '.', color: AnsiColor.Black }
    });

    // Place player at spawn
    const spawn = this.levelMgr.getSpawnPoint('dungeon1', 0);
    if (spawn) {
      this.player.x = spawn.x;
      this.player.y = spawn.y;
    }

    // Spawn enemies
    const enemyTiles = this.levelMgr.findTilesByType('dungeon1', 'enemy');
    enemyTiles.forEach((tile, i) => {
      const enemy: Enemy = {
        id: `enemy_${i}`,
        name: 'Goblin',
        x: tile.gridPosition.x,
        y: tile.gridPosition.y,
        hp: 30,
        maxHp: 30,
        damage: 5,
        xp: 25,
        gold: 10
      };
      this.enemies.set(enemy.id, enemy);

      // Create AI agent
      this.ai.createAgent(enemy.id, { x: enemy.x, y: enemy.y }, {
        speed: 0.5,
        sightRange: 8
      });
      this.ai.setState(enemy.id, 'patrol', {
        waypoints: [
          { x: enemy.x, y: enemy.y },
          { x: enemy.x + 3, y: enemy.y },
          { x: enemy.x + 3, y: enemy.y + 3 },
          { x: enemy.x, y: enemy.y + 3 }
        ],
        currentWaypoint: 0
      });
    });

    // Place NPCs
    const npcTiles = this.levelMgr.findTilesByType('dungeon1', 'npc');
    npcTiles.forEach((tile, i) => {
      this.npcs.set(`npc_${i}`, {
        x: tile.gridPosition.x,
        y: tile.gridPosition.y,
        name: 'Wizard'
      });
    });
  }

  private setupQuests() {
    // Main quest: Clear the dungeon
    this.quests.registerQuest({
      id: 'clear_dungeon',
      name: 'Clear the Dungeon',
      description: 'Defeat all goblins in the dungeon',
      objectives: [
        { id: 'kill_goblins', description: 'Kill all goblins', progress: 0, target: this.enemies.size }
      ],
      rewards: {
        gold: 100,
        experience: 100
      },
      category: 'main',
      onComplete: (rewards) => {
        this.player.gold += rewards.gold || 0;
        this.player.xp += rewards.experience || 0;
        this.showMessage('Quest Complete! Gained 100 gold and 100 XP!');
      }
    });

    this.quests.startQuest('clear_dungeon');

    // Achievement: First Blood
    this.quests.registerAchievement({
      id: 'first_blood',
      name: 'First Blood',
      description: 'Defeat your first enemy',
      points: 10,
      condition: () => {
        const quest = this.quests.getActiveQuests().find(q => q.id === 'clear_dungeon');
        const obj = quest?.objectives.find(o => o.id === 'kill_goblins');
        return obj ? obj.progress > 0 : false;
      }
    });
  }

  private setupDialogue() {
    // Wizard dialogue
    this.dialogue.createTree('wizard', 'Wizard Conversation', {
      id: 'greeting',
      speaker: 'Wizard',
      text: 'Greetings, adventurer! I sensed your arrival.',
      choices: [
        { text: 'What is this place?', next: 'about_dungeon' },
        { text: 'Can you help me?', next: 'offer_help' },
        { text: 'Goodbye', next: null }
      ]
    });

    this.dialogue.addNode('wizard', {
      id: 'about_dungeon',
      speaker: 'Wizard',
      text: 'This is an ancient dungeon, overrun by goblins. Many have tried to clear it, but few succeed.',
      choices: [
        { text: 'I will clear it!', next: 'brave_one', setFlag: 'accepted_quest', flagValue: true },
        { text: 'Sounds dangerous...', next: 'greeting' }
      ]
    });

    this.dialogue.addNode('wizard', {
      id: 'brave_one',
      speaker: 'Wizard',
      text: 'Brave words! Here, take this health potion. You\'ll need it.',
      choices: [
        { text: 'Thank you!', next: null, action: (ctx) => {
          this.inventory.addItem({
            id: 'health_potion',
            name: 'Health Potion',
            description: 'Restores 50 HP',
            quantity: 1,
            properties: { consumable: true, heal: 50 }
          });
          this.showMessage('Received Health Potion!');
        }}
      ]
    });

    this.dialogue.addNode('wizard', {
      id: 'offer_help',
      speaker: 'Wizard',
      text: 'I can teach you a spell... for a price. 50 gold pieces.',
      choices: [
        {
          text: 'Buy spell (50 gold)',
          next: 'sold_spell',
          condition: (ctx) => this.player.gold >= 50,
          action: (ctx) => {
            this.player.gold -= 50;
          }
        },
        { text: 'Too expensive', next: 'greeting' }
      ]
    });

    this.dialogue.addNode('wizard', {
      id: 'sold_spell',
      speaker: 'Wizard',
      text: 'Excellent! You now know Fireball. Use it wisely.',
      autoNext: 'greeting',
      autoDelay: 2000
    });

    // Update context
    this.dialogue.setContext({
      flags: new Map(),
      hasItem: (itemId) => this.inventory.hasItem(itemId),
      getStat: (stat) => this.player.level,
      data: {}
    });
  }

  private setupInput() {
    // Movement
    this.input.bindAction('move-up', 'ArrowUp', () => this.movePlayer(0, -1));
    this.input.bindAction('move-down', 'ArrowDown', () => this.movePlayer(0, 1));
    this.input.bindAction('move-left', 'ArrowLeft', () => this.movePlayer(-1, 0));
    this.input.bindAction('move-right', 'ArrowRight', () => this.movePlayer(1, 0));

    // Actions
    this.input.bindAction('attack', ' ', () => this.attack());
    this.input.bindAction('inventory', 'i', () => this.showInventory());
    this.input.bindAction('quests', 'q', () => this.showQuests());
    this.input.bindAction('talk', 't', () => this.talkToNPC());
    this.input.bindAction('save', 's', () => this.saveGame());
    this.input.bindAction('load', 'l', () => this.loadGame());
  }

  private setupDoorEvents() {
    this.door.onConnect(async (user: any) => {
      this.userId = user.id;

      await this.audio.init();
      this.ai.init();

      this.showTitle();
      this.startGame();
    });

    this.door.onInput((user, keyEvent) => {
      this.input.processInput(keyEvent);
    });

    this.door.onDisconnect(() => {
      if (this.gameLoop) clearInterval(this.gameLoop);
      this.ai.dispose();
    });
  }

  private showTitle() {
    if (!this.userId) return;

    this.gfx.clear(AnsiColor.Black);

    // Draw box using drawBox method (handles positioning correctly)
    this.gfx.drawBox({ x: 30, y: 8, width: 18, height: 3 }, 'double', AnsiColor.Cyan);
    this.gfx.drawText(31, 9, 'DUNGEON  RPG', AnsiColor.Cyan);

    this.gfx.drawText(20, 14, 'Complete SDK Example - All Features!', AnsiColor.Yellow);
    this.gfx.drawText(30, 17, 'Press any key...', AnsiColor.White);

    this.door.sendAnsi(this.gfx.render());
  }

  private startGame() {
    this.gameLoop = setInterval(() => {
      this.update();
      this.render();
    }, 100);
  }

  private update() {
    // Update AI
    this.ai.update(0.1);

    // Update enemy positions from AI
    for (const [id, enemy] of this.enemies.entries()) {
      const agent = this.ai.getAgent(id);
      if (agent) {
        enemy.x = Math.floor(agent.position.x);
        enemy.y = Math.floor(agent.position.y);

        // Check if can see player
        if (this.ai.canSee(id, { x: this.player.x, y: this.player.y })) {
          this.ai.setState(id, 'chase', { target: { x: this.player.x, y: this.player.y } });
        }
      }
    }

    // Check achievements
    this.quests.checkAchievements(this.player);
  }

  private render() {
    if (!this.userId || this.inMenu) return;

    this.gfx.clear(AnsiColor.Black);

    // Render level
    const level = this.levelMgr.getCurrentLevel() || this.levelMgr.getLevel(this.currentLevel);
    if (level) {
      for (let y = 0; y < level.gridSize.height && y < 20; y++) {
        for (let x = 0; x < level.gridSize.width && x < 40; x++) {
          const tile = this.levelMgr.getTile(this.currentLevel, x, y);
          if (tile) {
            this.gfx.drawChar(x, y, tile.char, tile.color);
          }
        }
      }
    }

    // Render NPCs
    for (const npc of this.npcs.values()) {
      this.gfx.drawChar(npc.x, npc.y, '@', AnsiColor.Cyan);
    }

    // Render enemies
    for (const enemy of this.enemies.values()) {
      this.gfx.drawChar(enemy.x, enemy.y, 'G', AnsiColor.Red);
    }

    // Render player
    this.gfx.drawChar(this.player.x, this.player.y, '@', AnsiColor.Yellow);

    // Render HUD
    this.hud.reset();
    this.hud.addBar('HP', this.player.hp, this.player.maxHp, { x: 42, y: 0 }, 15, AnsiColor.Red);
    this.hud.addText('level', { position: { x: 42, y: 2 }, format: `Level ${this.player.level}`, color: AnsiColor.Yellow });
    this.hud.addText('xp', { position: { x: 42, y: 3 }, format: `XP: ${this.player.xp}`, color: AnsiColor.Cyan });
    this.hud.addText('gold', { position: { x: 42, y: 4 }, format: `Gold: ${this.player.gold}`, color: AnsiColor.Yellow });

    const hudOutput = this.hud.render();
    this.gfx.drawText(0, 0, hudOutput, AnsiColor.White);

    // Controls help
    this.gfx.drawText(42, 6, 'Controls:', AnsiColor.White);
    this.gfx.drawText(42, 7, 'Arrows: Move', AnsiColor.White);
    this.gfx.drawText(42, 8, 'Space: Attack', AnsiColor.White);
    this.gfx.drawText(42, 9, 'I: Inventory', AnsiColor.White);
    this.gfx.drawText(42, 10, 'Q: Quests', AnsiColor.White);
    this.gfx.drawText(42, 11, 'T: Talk', AnsiColor.White);
    this.gfx.drawText(42, 12, 'S: Save', AnsiColor.White);

    this.door.sendAnsi(this.gfx.render());
  }

  private movePlayer(dx: number, dy: number) {
    const newX = this.player.x + dx;
    const newY = this.player.y + dy;

    if (this.levelMgr.isWalkable(this.currentLevel, newX, newY)) {
      this.player.x = newX;
      this.player.y = newY;
      this.audio.playSound('step', { frequency: 200, duration: 0.1, envelope: 'pluck', volume: 0.2 });
    }
  }

  private attack() {
    // Check for adjacent enemies
    for (const [id, enemy] of this.enemies.entries()) {
      const dist = Math.abs(enemy.x - this.player.x) + Math.abs(enemy.y - this.player.y);
      if (dist === 1) {
        enemy.hp -= 20;
        this.audio.playSound('hit', { frequency: 150, duration: 0.3, envelope: 'pluck', volume: 0.5 });

        if (enemy.hp <= 0) {
          this.enemies.delete(id);
          this.ai.removeAgent(id);
          this.player.xp += enemy.xp;
          this.player.gold += enemy.gold;

          // Update quest
          this.quests.updateProgress('clear_dungeon', 'kill_goblins', 1);

          this.audio.playSound('kill', { frequency: 100, duration: 0.5, envelope: 'pluck', volume: 0.6 });
          this.showMessage(`Defeated ${enemy.name}! +${enemy.xp} XP, +${enemy.gold} gold`);
        }
        return;
      }
    }
  }

  private talkToNPC() {
    // Find adjacent NPC
    for (const [id, npc] of this.npcs.entries()) {
      const dist = Math.abs(npc.x - this.player.x) + Math.abs(npc.y - this.player.y);
      if (dist === 1) {
        this.dialogue.startConversation('wizard');
        this.showDialogue();
        return;
      }
    }
  }

  private showDialogue() {
    if (!this.userId) return;
    this.inMenu = true;

    const node = this.dialogue.getCurrentNode();
    if (!node) {
      this.inMenu = false;
      return;
    }

    this.gfx.clear(AnsiColor.Black);
    this.gfx.drawText(5, 5, `${node.speaker}:`, AnsiColor.Cyan);
    this.gfx.drawText(5, 7, node.text, AnsiColor.White);

    const choices = this.dialogue.getAvailableChoices();
    choices.forEach((choice, i) => {
      this.gfx.drawText(5, 10 + i, `${i + 1}. ${choice.text}`, AnsiColor.Yellow);
    });

    this.door.sendAnsi(this.gfx.render());

    // Handle choice (simplified - in production use input binding)
    // For now, end dialogue after showing
    setTimeout(() => {
      this.dialogue.endConversation();
      this.inMenu = false;
    }, 3000);
  }

  private showInventory() {
    if (!this.userId) return;
    this.inMenu = true;

    this.gfx.clear(AnsiColor.Black);
    this.gfx.drawText(5, 2, '=== INVENTORY ===', AnsiColor.Cyan);

    const items = this.inventory.getAllItems();
    items.forEach((item, i) => {
      this.gfx.drawText(5, 4 + i, `${item.name} x${item.quantity}`, AnsiColor.White);
    });

    this.gfx.drawText(5, 15, 'Press any key to close', AnsiColor.Yellow);
    this.door.sendAnsi(this.gfx.render());

    setTimeout(() => { this.inMenu = false; }, 2000);
  }

  private showQuests() {
    if (!this.userId) return;
    this.inMenu = true;

    this.gfx.clear(AnsiColor.Black);
    this.gfx.drawText(5, 2, '=== QUESTS ===', AnsiColor.Cyan);

    const quests = this.quests.getActiveQuests();
    let y = 4;
    quests.forEach(quest => {
      this.gfx.drawText(5, y++, quest.name, AnsiColor.Yellow);
      quest.objectives.forEach(obj => {
        const progress = `${obj.progress}/${obj.target}`;
        this.gfx.drawText(7, y++, `${obj.description}: ${progress}`, AnsiColor.White);
      });
      y++;
    });

    this.gfx.drawText(5, 18, 'Press any key to close', AnsiColor.Yellow);
    this.door.sendAnsi(this.gfx.render());

    setTimeout(() => { this.inMenu = false; }, 3000);
  }

  private async saveGame() {
    if (!this.userId) return;

    const result = await this.door.rpc('saveGame', {
      userId: this.userId,
      slot: 1,
      state: {
        player: this.player,
        enemies: Array.from(this.enemies.entries()),
        inventory: this.inventory.exportToJSON(),
        quests: this.quests.exportState(),
        dialogue: this.dialogue.saveState(),
        currentLevel: this.currentLevel
      }
    });

    if (result.success) {
      this.showMessage('Game saved!');
    } else {
      this.showMessage('Failed to save game!');
    }
  }

  private async loadGame() {
    if (!this.userId) return;

    const result = await this.door.rpc('loadGame', {
      userId: this.userId,
      slot: 1
    });

    if (result.success && result.state) {
      this.player = result.state.player;
      this.enemies = new Map(result.state.enemies);
      this.inventory.importFromJSON(result.state.inventory);
      this.quests.importState(result.state.quests);
      this.dialogue.loadState(result.state.dialogue);
      if (result.state.currentLevel) {
        this.currentLevel = result.state.currentLevel;
      }

      this.showMessage('Game loaded!');
    } else {
      this.showMessage('No saved game found!');
    }
  }

  private showMessage(text: string) {
    if (!this.userId) return;

    // Display message in HUD area below controls
    this.gfx.drawText(42, 14, '─'.repeat(38), AnsiColor.White);

    // Wrap long messages if needed
    const maxWidth = 38;
    const lines: string[] = [];
    let currentLine = '';

    text.split(' ').forEach(word => {
      if ((currentLine + word).length > maxWidth) {
        if (currentLine) lines.push(currentLine.trim());
        currentLine = word + ' ';
      } else {
        currentLine += word + ' ';
      }
    });
    if (currentLine) lines.push(currentLine.trim());

    // Display up to 3 lines
    lines.slice(0, 3).forEach((line, i) => {
      this.gfx.drawText(42, 15 + i, line.padEnd(maxWidth), AnsiColor.Yellow);
    });

    this.door.sendAnsi(this.gfx.render());

    // Clear message after 3 seconds
    setTimeout(() => {
      if (this.userId) {
        for (let i = 0; i < 4; i++) {
          this.gfx.drawText(42, 14 + i, ' '.repeat(38), AnsiColor.Black);
        }
      }
    }, 3000);
  }

  start() {
    this.door.start();
  }
}

if (typeof process !== 'undefined' && process.argv?.[1]?.includes('dungeon-rpg')) {
  const game = new DungeonRPG();
  game.start();
}

export async function runDoor(doorSession: any): Promise<void> {
  const { socket } = doorSession;

  socket.emit('ansi-output', '\r\n\x1b[33mDungeon RPG currently runs as a client/hybrid door with full browser graphics.\x1b[0m\r\n');
  socket.emit('ansi-output', '\x1b[33mUse the web preview to experience the game. This text node shows a placeholder.\x1b[0m\r\n');
  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to return to the menu...\x1b[0m');

  await new Promise<void>((resolve) => {
    const handler = () => {
      socket.off('user-input', handler);
      resolve();
    };
    socket.on('user-input', handler);
  });
}
// @ts-nocheck
/// <reference path="./types.d.ts" />
