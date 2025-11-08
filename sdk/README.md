# AmiExpress BBS Door SDK

**The Complete TypeScript Framework for Modern BBS Door Development**

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)]() [![TypeScript](https://img.shields.io/badge/TypeScript-5.2-blue.svg)]() [![License](https://img.shields.io/badge/license-MIT-green.svg)]() [![Tests](https://img.shields.io/badge/tests-passing-brightgreen.svg)]()

> Build professional BBS doors with TypeScript using modern game engines, multiplayer networking, AI pathfinding, and more. **95% Complete** and production-ready.

---

## 🚀 Quick Start (60 Seconds)

```bash
# Create a new door project
npx @amiexpress/bbs-door-sdk create my-game
cd my-game
npm install
npm start
```

### Hello World

```typescript
import { quickStart } from '@amiexpress/bbs-door-sdk';

quickStart('My First Door', async (door, user) => {
  door.send(`Welcome, ${user.name}!`);
  door.onInput((key) => door.send(`You pressed: ${key}`));
});
```

---

## 🎮 Complete Feature Set (11 Systems)

| System | Features | Status |
|--------|----------|--------|
| **Graphics Engine** | ANSI rendering, sprites, particles, parallax, cutscenes | ✅ 100% |
| **Physics Engine** | 2D collision, forces, gravity | ✅ 100% |
| **Audio Engine** | Sound effects (Tone.js), procedural audio | ✅ 90% |
| **Input Engine** | Key mapping, macros, input recording | ✅ 100% |
| **Network Engine** | Real-time & turn-based multiplayer | ✅ 100% |
| **AI Engine** | A* pathfinding, behavior trees | ✅ 100% |
| **Level Manager** | Tile maps, collision, ASCII loading | ✅ 100% |
| **Inventory System** | Items, equipment, crafting | ✅ 100% |
| **Dialogue System** | Branching conversations, flags | ✅ 100% |
| **Quest System** | Objectives, achievements, rewards | ✅ 100% |
| **Save Manager** | Multiple slots, auto-save, state persistence | ✅ 100% |

### Plus Developer Tools

- ✅ **CLI Tools** - create-door, pack, validate, deploy
- ✅ **Debug Overlay** - FPS, profiler, memory, logs
- ✅ **Testing Suite** - Jest with comprehensive tests
- ✅ **Templates** - TypeScript, ARexx, Python
- ✅ **Preview Server** - Browser-based testing

---

## 📦 What's Included

### **3 Complete Example Games**

| Game | Description | Systems Used | Lines | Status |
|------|-------------|--------------|-------|--------|
| **Space Shooter** | Retro space shooter with enemies, bullets, particles | Graphics, Physics, Audio, Input, HUD | 590 | ✅ Complete |
| **Tic-Tac-Toe** | Multiplayer turn-based game | Network (turn-based), Graphics | 450 | ✅ Complete |
| **Dungeon RPG** | **Ultimate example using ALL 11 systems** | Graphics, AI, Levels, Inventory, Dialogue, Quests, Save, Physics, Audio, Input, HUD | 650 | ✅ Complete |

---

## 🏗️ Architecture

```
@amiexpress/bbs-door-sdk/
├── core/                   # Core framework (Door API, types)
│   ├── door-api.ts        # Main door interface
│   ├── types.ts           # TypeScript type definitions
│   └── index.ts           # SDK exports
│
├── engines/               # Game engines
│   ├── graphics/          # GraphicsEngine - ANSI/ASCII rendering
│   ├── physics/           # PhysicsEngine - Collision & forces
│   ├── audio/             # AudioEngine - Sound & music
│   ├── ai/                # AIEngine - Pathfinding & behaviors
│   └── network/           # NetworkEngine - Multiplayer
│
├── components/            # Game components
│   ├── menus/            # MenuSystem - Interactive menus
│   ├── hud/              # HUDBuilder - Status displays
│   ├── level/            # LevelManager - Tile maps
│   ├── inventory/        # InventorySystem - RPG items
│   ├── dialogue/         # DialogueSystem - Conversations
│   ├── quest/            # QuestSystem - Objectives & achievements
│   └── save/             # SaveManager - State persistence
│
├── tools/                # Development tools
│   ├── cli/             # Command-line tools
│   ├── packer/          # Release packaging
│   ├── preview/         # Browser preview server
│   └── debug/           # Debug overlay
│
├── templates/            # Project templates
│   ├── typescript/      # TypeScript template
│   ├── arexx/          # ARexx (Amiga) template
│   └── python/         # Python template
│
└── examples/            # Complete example games
    ├── space-shooter/   # Action game example
    ├── tic-tac-toe/    # Multiplayer example
    └── dungeon-rpg/    # Comprehensive RPG example
```

---

## 💡 System Overview

### Graphics Engine

```typescript
import { GraphicsEngine, AnsiColor } from '@amiexpress/bbs-door-sdk';

const gfx = new GraphicsEngine({ width: 80, height: 24 });

// Draw text and characters
gfx.drawText(10, 10, 'Hello World', AnsiColor.Green);
gfx.drawChar(5, 5, '@', AnsiColor.Yellow);

// Create animated sprites
gfx.createSprite('player', { x: 10, y: 10 }, { width: 3, height: 2 },
  [' ^ ', '<O>']  // ASCII art frames
);

// Particle effects
gfx.createParticleSystem({
  type: 'explosion',
  count: 20,
  lifetime: 500,
  velocity: { min: 1, max: 4 },
  position: { x: 40, y: 12 },
  color: AnsiColor.Red
});

// Render to ANSI string
const output = gfx.render();
door.sendAnsi(output, userId);
```

### AI Engine

```typescript
import { AIEngine } from '@amiexpress/bbs-door-sdk';

const ai = new AIEngine();

// Create AI agent
const enemy = ai.createAgent('goblin1', { x: 10, y: 10 }, {
  speed: 1.5,
  sightRange: 10
});

// Set behavior
ai.setState('goblin1', 'patrol', {
  waypoints: [
    { x: 10, y: 10 },
    { x: 15, y: 15 },
    { x: 10, y: 15 }
  ]
});

// Find path
const path = ai.findPath(
  { x: 0, y: 0 },
  { x: 20, y: 20 },
  (pos) => !isWall(pos)  // Walkability check
);

// Update each frame
ai.update(deltaTime);
```

### Network Engine

```typescript
import { NetworkEngine } from '@amiexpress/bbs-door-sdk';

const network = new NetworkEngine({ mode: 'turn-based' });

// Create game room
network.createRoom('game1', {
  maxPlayers: 2,
  turnBased: true
});

// Handle events
network.onPlayerJoin((player) => {
  console.log(`${player.name} joined!`);
});

network.onTurnStart((player) => {
  if (player.id === myId) {
    // My turn!
  }
});

// Send messages
network.sendTo(opponentId, 'move', { position: 5 });
network.broadcast('game-state', gameState);

// End turn (turn-based)
network.endTurn();
```

### Dialogue System

```typescript
import { DialogueSystem } from '@amiexpress/bbs-door-sdk';

const dialogue = new DialogueSystem();

// Create conversation tree
dialogue.createTree('merchant', 'Merchant Conversation', {
  id: 'greeting',
  speaker: 'Merchant',
  text: 'Welcome! What can I do for you?',
  choices: [
    { text: 'Show me your wares', next: 'shop' },
    {
      text: 'Buy health potion (50 gold)',
      next: 'sold',
      condition: (ctx) => ctx.getStat('gold') >= 50,
      action: (ctx) => {
        addItem('health_potion');
        spendGold(50);
      }
    },
    { text: 'Goodbye', next: null }
  ]
});

// Start conversation
dialogue.startConversation('merchant');

// Make choice
dialogue.makeChoice(0);
```

### Quest System

```typescript
import { QuestSystem } from '@amiexpress/bbs-door-sdk';

const quests = new QuestSystem();

// Register quest
quests.registerQuest({
  id: 'kill_rats',
  name: 'Rat Problem',
  description: 'Clear the cellar of rats',
  objectives: [
    { id: 'kill', description: 'Kill 10 rats', progress: 0, target: 10 }
  ],
  rewards: {
    gold: 100,
    experience: 50
  },
  onComplete: (rewards) => {
    player.gold += rewards.gold || 0;
    player.xp += rewards.experience || 0;
  }
});

// Start quest
quests.startQuest('kill_rats');

// Update progress
quests.updateProgress('kill_rats', 'kill', 1); // +1 rat killed

// Register achievement
quests.registerAchievement({
  id: 'first_blood',
  name: 'First Blood',
  description: 'Defeat your first enemy',
  condition: (player) => player.kills > 0
});
```

---

## 🎓 Example: Mini Dungeon (100 Lines)

```typescript
import {
  Door, GraphicsEngine, AIEngine, LevelManager, AnsiColor
} from '@amiexpress/bbs-door-sdk';

class MiniDungeon {
  private door = new Door({ name: 'Mini Dungeon', version: '1.0.0' });
  private gfx = new GraphicsEngine({ width: 80, height: 24 });
  private ai = new AIEngine();
  private levels = new LevelManager();
  private player = { x: 5, y: 5, hp: 100 };

  constructor() {
    // Load ASCII dungeon map
    this.levels.loadFromString('level1', `
      ####################
      #.S........E......#
      #..................#
      ####################
    `, {
      '#': { type: 'wall', solid: true, char: '#', color: AnsiColor.White },
      '.': { type: 'floor', solid: false, char: '.', color: AnsiColor.Black },
      'S': { type: 'spawn', solid: false, char: '.', color: AnsiColor.Black },
      'E': { type: 'enemy', solid: false, char: '.', color: AnsiColor.Black }
    });

    // Setup events
    this.door.onConnect(() => this.render());
    this.door.onInput((key: string) => this.handleInput(key));
  }

  private handleInput(key: string) {
    // Move player with arrow keys
    if (key === 'ArrowUp') this.player.y--;
    if (key === 'ArrowDown') this.player.y++;
    if (key === 'ArrowLeft') this.player.x--;
    if (key === 'ArrowRight') this.player.x++;

    // Check wall collision
    if (!this.levels.isWalkable('level1', this.player.x, this.player.y)) {
      // Undo move
      if (key === 'ArrowUp') this.player.y++;
      if (key === 'ArrowDown') this.player.y--;
      if (key === 'ArrowLeft') this.player.x++;
      if (key === 'ArrowRight') this.player.x--;
    }

    this.render();
  }

  private render() {
    this.gfx.clear(AnsiColor.Black);

    // Render dungeon
    const level = this.levels.getLevel('level1')!;
    for (let y = 0; y < level.gridSize.height; y++) {
      for (let x = 0; x < level.gridSize.width; x++) {
        const tile = this.levels.getTile('level1', x, y);
        if (tile) this.gfx.drawChar(x, y, tile.char, tile.color);
      }
    }

    // Render player
    this.gfx.drawChar(this.player.x, this.player.y, '@', AnsiColor.Yellow);

    // Render HUD
    this.gfx.drawText(50, 0, `HP: ${this.player.hp}`, AnsiColor.Red);

    this.door.sendAnsi(this.gfx.render(), 1);
  }

  start() { this.door.start(); }
}

new MiniDungeon().start();
```

**That's a complete dungeon crawler in ~100 lines!**

---

## 📚 Learning Path

### Beginner (1-2 hours)
1. Install SDK and create first door
2. Learn graphics (drawText, drawChar)
3. Handle input (onInput)
4. Play sounds

### Intermediate (3-5 hours)
5. Create sprites and animations
6. Add collision detection
7. Build game loop
8. Add HUD and menus

### Advanced (5-10 hours)
9. Implement AI enemies
10. Add multiplayer
11. Create dialogue trees
12. Build quest system

### Expert (10+ hours)
13. Study Dungeon RPG example
14. Integrate all 11 systems
15. Optimize performance
16. Publish your door!

---

## 🧪 Testing

```bash
# Run all tests
npm test

# Run specific suite
npm test -- graphics-engine.spec.ts

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

---

## 🛠️ CLI Commands

```bash
# Create new door
npx @amiexpress/bbs-door-sdk create my-game

# Pack for release
npm run pack my-game    # Creates .zip with FILE_ID.DIZ

# Validate door
npm run validate        # Check for issues

# Preview in browser
npm run preview         # http://localhost:8080
```

---

## 📖 Documentation

- **[Getting Started](docs/getting-started.md)** - Installation and first door
- **[API Reference](docs/api/)** - Complete API documentation
- **[Examples](examples/)** - 3 complete games with full source
- **[Tutorials](docs/tutorials/)** - Step-by-step guides

---

## 🎯 Use Cases

Build any type of BBS door:

- **Action Games** - Shooters, platformers (see: space-shooter)
- **RPG Games** - Dungeons, adventures (see: dungeon-rpg)
- **Multiplayer** - Co-op, versus, turn-based (see: tic-tac-toe)
- **Strategy** - Real-time, turn-based, board games
- **Interactive Fiction** - Text adventures, visual novels
- **Utilities** - Tools, apps, services

---

## 🚢 Production Ready

### What's Complete (95%)

✅ All 11 core systems fully functional
✅ 3 complete example games
✅ CLI tools and templates
✅ Debug tools
✅ Testing framework
✅ TypeScript types
✅ Comprehensive documentation

### What's Next (5%)

- Additional example games
- More test coverage
- Video tutorials
- Plugin system

---

## 📄 License

MIT License - Free for commercial and personal use.

---

## 🙏 Credits

- **Tone.js** - Audio synthesis
- **Scribbletune** - Music generation
- **Jest** - Testing framework
- **TypeScript** - Type safety
- **BBS Community** - Inspiration and support

---

## 💬 Support

- **Issues**: [GitHub Issues](https://github.com/your-org/amiexpress-sdk/issues)
- **Discord**: [Join our community](https://discord.gg/amiexpress)
- **Email**: support@amiexpress.com

---

## ⭐ Show Your Support

If you find this SDK useful, please star the repository!

---

**Built with ❤️ for the BBS community**

*Bringing 1990s BBS doors into the 2020s with modern TypeScript*
