# AI Door Creation Guide for AmiExpress BBS SDK

**Version:** 2.0.0  
**Last Updated:** 2025-11-14  
**Purpose:** Complete guide for AI agents to create production-ready, error-free BBS doors

---

## Table of Contents

1. [Core Principles](#core-principles)
2. [SDK Architecture Overview](#sdk-architecture-overview)
3. [Step-by-Step Door Creation Process](#step-by-step-door-creation-process)
4. [Framework Selection Guide](#framework-selection-guide)
5. [Production Readiness Checklist](#production-readiness-checklist)
6. [Common Patterns and Best Practices](#common-patterns-and-best-practices)
7. [Testing and Validation](#testing-and-validation)
8. [Doorman Compatibility](#doorman-compatibility)

---

## Core Principles

### CRITICAL RULES - READ FIRST

1. **NO TODOs, NO STUBS, NO PLACEHOLDERS**
   - Every function must be fully implemented
   - Every feature must be complete and working
   - Use clear comments for extension points, never "TODO"

2. **Production-Ready from Day One**
   - All doors must build with ZERO errors
   - All doors must run without crashes
   - All doors must handle edge cases gracefully

3. **TypeScript Strictness**
   - Always enable strict type checking
   - No `any` types without justification
   - All interfaces must be properly defined

4. **Error Handling**
   - Wrap file I/O in try-catch blocks
   - Provide meaningful error messages
   - Never let exceptions crash the door

5. **Data Persistence**
   - Use Node.js `fs` module for file operations
   - Store data in `process.env.DATA_DIR` or `./data`
   - Always use JSON for structured data
   - Create directories with `{ recursive: true }`

6. **Input Handling** ⚠️ CRITICAL
   - **ALWAYS** use `bbsSession.doorInputHandler` for input
   - **NEVER** use `socket.on('user-input')` or `socket.once('user-input')`
   - The socket patterns are deprecated and don't work
   - See [TypeScript Door Guide](./TYPESCRIPT_DOOR_GUIDE.md) for details

---

## Door Patterns

The SDK supports two door development patterns:

### Pattern 1: Simple runDoor() Function (Recommended for Most Doors)

Use this for utilities, simple games, and straightforward doors:

```typescript
export async function runDoor(doorSession: any): Promise<void> {
  const { socket, user, bbsSession, bbs, params } = doorSession;

  // Your door logic
  socket.emit('ansi-output', `Hello, ${user.username}!\r\n`);

  // Input handling (CORRECT WAY)
  await new Promise<void>((resolve) => {
    bbsSession.doorInputHandler = (data: string) => {
      delete bbsSession.doorInputHandler;
      resolve();
    };
  });
}
```

**Pros:** Simple, direct, no framework overhead
**Cons:** Manual ANSI handling, no high-level UI components
**Best for:** Information displays, simple utilities, quick tools

📖 **See:** [TypeScript Door Guide](./TYPESCRIPT_DOOR_GUIDE.md) for complete details

### Pattern 2: SDK Class-Based Framework (For Complex Games)

Use this for advanced games requiring engines (graphics, physics, AI):

```typescript
import { Door, GraphicsEngine, InputEngine } from '@amiexpress/sdk';

const door = new Door({ name: 'My Game', version: '1.0.0' });
const gfx = new GraphicsEngine({ width: 80, height: 24 });

door.onConnect(async (user) => {
  // Complex game logic with engines
});

door.start();
```

**Pros:** Rich UI components, physics, AI, multiplayer support
**Cons:** More complex, larger bundle size
**Best for:** RPGs, arcade games, multiplayer experiences

📖 **See:** Sections below for full SDK framework details

---

## SDK Architecture Overview

The SDK provides **12 complete systems** for door development:

### Core Systems

| System | Location | Primary Use | Complexity |
|--------|----------|-------------|------------|
| **Door API** | `core/door-api.ts` | Connection handling, events, lifecycle | Essential |
| **UIEngine (Neo-Blessed)** | `engines/ui/` | Terminal UI with widgets | High-level |
| **GraphicsEngine** | `engines/graphics/` | ANSI rendering, sprites, particles | Medium |
| **PhysicsEngine** | `engines/physics/` | Collision detection, forces | Specialized |
| **AudioEngine** | `engines/audio/` | Sound effects with Tone.js | Specialized |
| **InputEngine** | `engines/input/` | Key mapping, macros | Essential |
| **NetworkEngine** | `engines/network/` | Multiplayer, real-time/turn-based | Advanced |
| **AIEngine** | `engines/ai/` | Pathfinding (A*), behavior trees | Specialized |

### Component Systems

| Component | Location | Primary Use |
|-----------|----------|-------------|
| **MenuSystem** | `components/menus/` | Interactive ANSI menus |
| **HUDBuilder** | `components/hud/` | Status displays, health bars |
| **LevelManager** | `components/level/` | Tile maps, collision layers |
| **InventorySystem** | `components/inventory/` | RPG items, equipment |
| **DialogueSystem** | `components/dialogue/` | Branching conversations |
| **QuestSystem** | `components/quest/` | Objectives, achievements |
| **SaveManager** | `components/save/` | Save slots, auto-save |
| **TacticalCombat** | `components/tactical/` | Turn-based combat system |

### Utilities

| Utility | Location | Purpose |
|---------|----------|---------|
| **AnsiStringUtil** | `tools/ansi-string-util/` | ANSI escape code handling |
| **FileBuilder** | `tools/file-builder/` | Packaging door archives |
| **BrailleGraphics** | `tools/braille-graphics/` | High-res terminal graphics |

---

## Step-by-Step Door Creation Process

### Phase 1: Planning (REQUIRED)

Before writing ANY code:

1. **Identify the door's primary purpose**
   - Game? Utility? Chat? Information display?

2. **List required features**
   - User interaction patterns
   - Data storage needs
   - Multiplayer requirements
   - UI complexity level

3. **Select appropriate SDK systems**
   - See [Framework Selection Guide](#framework-selection-guide)
   - Start minimal, add systems as needed

4. **Create a development checklist**
   - Break features into discrete tasks
   - Identify data models
   - Plan testing approach

### Phase 2: Scaffolding

```bash
# Option 1: Use SDK CLI (recommended)
cd /path/to/sdk
npm run create-door

# Option 2: Copy example door
cp -r examples/hello-world my-new-door
cd my-new-door
```

### Phase 3: Package.json Setup

**Critical fields for production-ready doors:**

```json
{
  "name": "my-door-name",
  "version": "1.0.0",
  "description": "Clear description of what the door does",
  "main": "dist/index.js",
  "bbsCommand": "MYDOOR",
  "author": "Your Name",
  "license": "MIT",
  "category": "game|utility|chat|info",
  "runtime": "server",
  "buildable": true,
  "scripts": {
    "build": "tsc",
    "start": "npx tsx index.ts",
    "dev": "npx tsx --watch index.ts"
  },
  "dependencies": {
    "@amiexpress/bbs-door-sdk": "file:../.."
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.2.2",
    "tsx": "^4.19.2"
  }
}
```

**Required fields:**
- `name`: Unique identifier
- `version`: Semantic versioning
- `description`: User-facing description
- `main`: Points to compiled JS (`dist/index.js`)
- `bbsCommand`: Command users type to run door
- `buildable`: MUST be `true` for distribution
- `scripts.build`: MUST include TypeScript compilation

### Phase 4: TypeScript Configuration

**tsconfig.json** (use this template):

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

### Phase 5: Core Implementation

#### Minimal Door Template

```typescript
import { Door } from '@amiexpress/bbs-door-sdk';
import * as fs from 'fs';
import * as path from 'path';

class MyDoor {
  private door: Door;
  private dataDir: string;

  constructor() {
    this.door = new Door({
      name: 'My Door Name',
      version: '1.0.0',
      author: 'Your Name',
      description: 'What this door does',
    });

    // Setup data directory
    this.dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }

    // Setup event handlers
    this.door.onConnect(async (user) => {
      await this.handleConnect(user);
    });

    this.door.onInput((user, key) => {
      this.handleInput(user, key.key);
    });

    this.door.onDisconnect((user) => {
      this.handleDisconnect(user);
    });
  }

  private async handleConnect(user: any): Promise<void> {
    // Load user data
    // Display welcome screen
    // Initialize game state
  }

  private handleInput(user: any, key: string): void {
    // Process user input
  }

  private handleDisconnect(user: any): void {
    // Save user data
    // Cleanup resources
  }

  public start(): void {
    this.door.start();
  }
}

const door = new MyDoor();
door.start();
```

### Phase 6: Data Persistence Pattern

**ALWAYS use this pattern for saving/loading data:**

```typescript
interface MyDataStructure {
  userId: number;
  score: number;
  level: number;
  // ... other fields
}

class MyDoor {
  private dataFile: string;

  constructor() {
    this.dataFile = path.join(this.dataDir, 'my-door-data.json');
  }

  private loadData(userId: number): MyDataStructure | null {
    try {
      if (fs.existsSync(this.dataFile)) {
        const data = fs.readFileSync(this.dataFile, 'utf-8');
        const allData: { [userId: number]: MyDataStructure } = JSON.parse(data);
        return allData[userId] || null;
      }
      return null;
    } catch (error) {
      console.error('[ERROR] Failed to load data:', error);
      return null;
    }
  }

  private saveData(userId: number, userData: MyDataStructure): void {
    try {
      let allData: { [userId: number]: MyDataStructure } = {};

      if (fs.existsSync(this.dataFile)) {
        const data = fs.readFileSync(this.dataFile, 'utf-8');
        allData = JSON.parse(data);
      }

      allData[userId] = userData;
      fs.writeFileSync(this.dataFile, JSON.stringify(allData, null, 2));
    } catch (error) {
      console.error('[ERROR] Failed to save data:', error);
    }
  }
}
```

---

## Framework Selection Guide

### Decision Tree: Which System Should I Use?

#### Need Terminal UI with Forms/Dialogs/Widgets?
→ **Use UIEngine (Neo-Blessed)**  
Examples: bug-tracker, bbs-dashboard, blessed-contrib-demos  
Complexity: Medium  
Best for: Interactive applications, forms, complex UI layouts

#### Need Simple ANSI Graphics/Text?
→ **Use GraphicsEngine**  
Examples: space-shooter, tetris, 2048-game  
Complexity: Low  
Best for: Games, simple rendering, real-time updates

#### Need Multiplayer?
→ **Use NetworkEngine**  
Examples: fire-emblem (tactical multiplayer), tic-tac-toe  
Types: Real-time (action) or Turn-based (strategy)  
Complexity: High

#### Need RPG Features?
→ **Use InventorySystem + DialogueSystem + QuestSystem**  
Examples: dungeon-rpg, fire-emblem  
Complexity: High  
Includes: Items, equipment, conversations, objectives

#### Need Tactical Combat?
→ **Use TacticalCombat Component**  
Example: fire-emblem  
Features: Grid-based combat, movement ranges, hit calculations  
Complexity: Very High

#### Need Pathfinding/AI?
→ **Use AIEngine**  
Example: dungeon-rpg (enemy AI)  
Features: A* pathfinding, behavior trees  
Complexity: Medium

#### Need Sound Effects?
→ **Use AudioEngine**  
Example: space-shooter  
Features: Tone.js integration, procedural audio  
Note: Limited terminal support, use sparingly

#### Need Physics?
→ **Use PhysicsEngine**  
Example: space-shooter (bullet collisions)  
Features: 2D collision detection, forces, gravity  
Complexity: Medium

### System Combinations (Common Patterns)

| Door Type | Recommended Systems | Example |
|-----------|---------------------|---------|
| **Simple Utility** | Door API only | hello-world, discord-announce |
| **Text Game** | Door + GraphicsEngine | 2048-game, tic-tac-toe |
| **Action Game** | Door + GraphicsEngine + PhysicsEngine + InputEngine | space-shooter |
| **RPG** | Door + GraphicsEngine + Inventory + Dialogue + Quest + Save | dungeon-rpg |
| **Tactical RPG** | All of the above + TacticalCombat + NetworkEngine | fire-emblem |
| **Terminal App** | Door + UIEngine | bug-tracker, bbs-dashboard |
| **Visual Demo** | Door + UIEngine + BrailleGraphics | drawille-cube |

---

## Production Readiness Checklist

Use this checklist for EVERY door before considering it complete:

### Code Quality
- [ ] Zero TypeScript compilation errors (`tsc --noEmit`)
- [ ] Zero runtime errors in basic testing
- [ ] All functions fully implemented (no TODOs)
- [ ] All edge cases handled
- [ ] Error handling with try-catch for I/O operations
- [ ] No `console.log` for debugging (use proper logging)
- [ ] All types properly defined (no `any` without reason)

### Functionality
- [ ] Door connects successfully
- [ ] User input handled correctly
- [ ] Door disconnects gracefully
- [ ] Data persists across sessions
- [ ] All features work as documented
- [ ] No crashes or hangs during normal use

### Data Integrity
- [ ] Data directory created automatically
- [ ] File operations wrapped in error handling
- [ ] JSON data validated before use
- [ ] Concurrent access handled (if multiplayer)
- [ ] Data cleanup on disconnect

### User Experience
- [ ] Clear instructions displayed
- [ ] Intuitive controls
- [ ] Visual feedback for actions
- [ ] Graceful error messages (no stack traces to user)
- [ ] Proper exit mechanism (Q key, ESC, etc.)

### Package Metadata
- [ ] `package.json` has all required fields
- [ ] `version` follows semantic versioning
- [ ] `description` is clear and accurate
- [ ] `bbsCommand` is unique and memorable
- [ ] `main` points to `dist/index.js`
- [ ] `buildable: true` is set
- [ ] `build` script compiles successfully

### Documentation
- [ ] README.md explains what the door does
- [ ] README.md has installation instructions
- [ ] README.md has usage instructions
- [ ] Code has comments for complex logic
- [ ] API usage documented (if library door)

### Doorman Compatibility
- [ ] Package includes `.info` file (auto-generated)
- [ ] Can be packaged with `npm run pack` (if CLI available)
- [ ] Archive structure follows BBS standards
- [ ] Runs on both client and server runtimes (if applicable)

### Testing
- [ ] Manual testing performed
- [ ] Edge cases tested (empty input, invalid data, etc.)
- [ ] Multiplayer tested with 2+ users (if applicable)
- [ ] Data persistence tested (save/load cycles)
- [ ] Long-running stability tested (no memory leaks)

---

## Common Patterns and Best Practices

### Pattern 1: Game Loop

```typescript
class MyGame {
  private gameRunning = false;
  private frameDelay = 100; // milliseconds

  private gameLoop(): void {
    if (!this.gameRunning) return;

    this.update();  // Update game state
    this.render();  // Render to screen

    setTimeout(() => this.gameLoop(), this.frameDelay);
  }

  public start(): void {
    this.gameRunning = true;
    this.gameLoop();
  }

  public stop(): void {
    this.gameRunning = false;
  }
}
```

### Pattern 2: Menu System

```typescript
import { GraphicsEngine, AnsiColor } from '@amiexpress/bbs-door-sdk';

class MenuExample {
  private gfx: GraphicsEngine;
  private selectedIndex = 0;
  private menuItems = ['Play Game', 'High Scores', 'Options', 'Quit'];

  private renderMenu(): void {
    this.gfx.clear(AnsiColor.Black);
    this.gfx.drawText(30, 5, 'MAIN MENU', AnsiColor.Yellow);

    this.menuItems.forEach((item, index) => {
      const color = index === this.selectedIndex 
        ? AnsiColor.BrightWhite 
        : AnsiColor.White;
      const prefix = index === this.selectedIndex ? '>' : ' ';
      this.gfx.drawText(32, 8 + index, `${prefix} ${item}`, color);
    });

    this.door.sendAnsi(this.gfx.render());
  }

  private handleMenuInput(key: string): void {
    switch (key) {
      case 'ArrowUp':
        this.selectedIndex = Math.max(0, this.selectedIndex - 1);
        break;
      case 'ArrowDown':
        this.selectedIndex = Math.min(this.menuItems.length - 1, this.selectedIndex + 1);
        break;
      case 'Enter':
        this.selectMenuItem(this.selectedIndex);
        break;
    }
    this.renderMenu();
  }
}
```

### Pattern 3: State Machine

```typescript
type GameState = 'menu' | 'playing' | 'paused' | 'gameOver';

class StateMachineExample {
  private state: GameState = 'menu';

  private handleInput(key: string): void {
    switch (this.state) {
      case 'menu':
        this.handleMenuInput(key);
        break;
      case 'playing':
        this.handleGameInput(key);
        break;
      case 'paused':
        this.handlePauseInput(key);
        break;
      case 'gameOver':
        this.handleGameOverInput(key);
        break;
    }
  }

  private setState(newState: GameState): void {
    this.state = newState;
    this.onStateEnter(newState);
  }

  private onStateEnter(state: GameState): void {
    switch (state) {
      case 'menu':
        this.showMenu();
        break;
      case 'playing':
        this.startGame();
        break;
      // ... etc
    }
  }
}
```

### Pattern 4: High Score Tracking

```typescript
interface ScoreEntry {
  userId: number;
  userName: string;
  score: number;
  timestamp: number;
}

class HighScoreManager {
  private scoresFile: string;
  private maxEntries = 10;

  constructor(dataDir: string) {
    this.scoresFile = path.join(dataDir, 'highscores.json');
  }

  private loadScores(): ScoreEntry[] {
    try {
      if (fs.existsSync(this.scoresFile)) {
        const data = fs.readFileSync(this.scoresFile, 'utf-8');
        return JSON.parse(data);
      }
      return [];
    } catch (error) {
      console.error('[ERROR] Failed to load high scores:', error);
      return [];
    }
  }

  public addScore(userId: number, userName: string, score: number): boolean {
    try {
      const scores = this.loadScores();
      
      // Add new score
      scores.push({
        userId,
        userName,
        score,
        timestamp: Date.now()
      });

      // Sort by score (descending)
      scores.sort((a, b) => b.score - a.score);

      // Keep only top N
      const topScores = scores.slice(0, this.maxEntries);

      // Save
      fs.writeFileSync(this.scoresFile, JSON.stringify(topScores, null, 2));

      // Return true if this score made the list
      return topScores.some(entry => 
        entry.userId === userId && 
        entry.score === score
      );
    } catch (error) {
      console.error('[ERROR] Failed to save high score:', error);
      return false;
    }
  }
}
```

---

## Testing and Validation

### Build Test

```bash
# MUST pass with zero errors
npm run build
```

Expected output: Clean compilation with no errors

### Runtime Test

```bash
# Test door execution
npm start
```

Check for:
- No crashes on startup
- Responds to input
- Exits cleanly

### SDK Preview Test

```bash
# From SDK root
npm run preview your-door-name
```

Features:
- Live reload on code changes
- Simulated BBS environment
- View door metadata
- Test with mock users

---

## Doorman Compatibility

Doorman is the standard BBS door distribution format. To ensure compatibility:

### Required Files

1. **package.json** - With correct metadata
2. **dist/index.js** - Compiled door code
3. **README.md** - User documentation

### Archive Structure

```
my-door.zip
├── package.json
├── dist/
│   └── index.js
├── README.md
└── data/          (optional, for default data)
```

### Creating Distribution Package

```bash
# Using SDK CLI (recommended)
cd sdk
npm run pack your-door-name

# Manual (if CLI unavailable)
cd your-door
npm run build
zip -r my-door.zip dist/ package.json README.md
```

---

## Quick Reference: SDK Imports

```typescript
// Core
import { Door, DoorConfig, BBSUser } from '@amiexpress/bbs-door-sdk';

// Graphics
import { GraphicsEngine, AnsiColor, Sprite } from '@amiexpress/bbs-door-sdk';

// UI (Neo-Blessed)
import { UIEngine, UIScreen, UIButton, UIForm } from '@amiexpress/bbs-door-sdk';

// Components
import { MenuSystem } from '@amiexpress/bbs-door-sdk';
import { HUDBuilder } from '@amiexpress/bbs-door-sdk';
import { InventorySystem } from '@amiexpress/bbs-door-sdk';
import { DialogueSystem } from '@amiexpress/bbs-door-sdk';
import { QuestSystem } from '@amiexpress/bbs-door-sdk';
import { SaveManager } from '@amiexpress/bbs-door-sdk';

// Engines
import { PhysicsEngine } from '@amiexpress/bbs-door-sdk';
import { AudioEngine } from '@amiexpress/bbs-door-sdk';
import { NetworkEngine } from '@amiexpress/bbs-door-sdk';
import { AIEngine } from '@amiexpress/bbs-door-sdk';

// Node.js Standard
import * as fs from 'fs';
import * as path from 'path';
```

---

## Example Door Types and Templates

### 1. Utility Door (No Graphics)

**Use Case:** Background task, data processing, announcements

```typescript
import { Door } from '@amiexpress/bbs-door-sdk';

class UtilityDoor {
  private door: Door;

  constructor() {
    this.door = new Door({
      name: 'Utility Name',
      version: '1.0.0',
      author: 'Your Name',
    });

    this.door.onConnect(async (user) => {
      // Perform utility function
      this.door.send('Task completed!');
      this.door.disconnect(user.id);
    });
  }

  public start(): void {
    this.door.start();
  }
}

const door = new UtilityDoor();
door.start();
```

### 2. Simple Text Game

**Use Case:** Interactive fiction, trivia, simple puzzles

```typescript
import { Door, GraphicsEngine, AnsiColor } from '@amiexpress/bbs-door-sdk';

class TextGame {
  private door: Door;
  private gfx: GraphicsEngine;
  private currentUserId = 0;

  constructor() {
    this.door = new Door({
      name: 'Text Game',
      version: '1.0.0',
      author: 'Your Name',
    });

    this.gfx = new GraphicsEngine({ width: 80, height: 24 });

    this.door.onConnect(async (user) => {
      this.currentUserId = user.id;
      this.render();
    });

    this.door.onInput((user, key) => {
      this.handleInput(key.key);
    });
  }

  private render(): void {
    this.gfx.clear(AnsiColor.Black);
    this.gfx.drawText(10, 10, 'Hello, BBS World!', AnsiColor.Cyan);
    this.door.sendAnsi(this.gfx.render(), this.currentUserId);
  }

  private handleInput(key: string): void {
    if (key === 'q' || key === 'Q') {
      this.door.disconnect(this.currentUserId);
    }
  }

  public start(): void {
    this.door.start();
  }
}

const game = new TextGame();
game.start();
```

### 3. Terminal Application

**Use Case:** Forms, dashboards, configuration tools

```typescript
import { Door, UIEngine, UIScreen, UIButton } from '@amiexpress/bbs-door-sdk';

class TerminalApp {
  private door: Door;
  private ui: UIEngine;

  constructor() {
    this.door = new Door({
      name: 'Terminal App',
      version: '1.0.0',
      author: 'Your Name',
    });

    this.ui = new UIEngine();

    this.door.onConnect(async (user) => {
      const screen = new UIScreen('main');
      
      const button = new UIButton({
        top: 10,
        left: 30,
        width: 20,
        height: 3,
        content: 'Click Me!',
        onClick: () => {
          console.log('Button clicked!');
        }
      });

      screen.addWidget(button);
      this.ui.addScreen(screen);
      this.ui.showScreen('main');
    });
  }

  public start(): void {
    this.door.start();
  }
}

const app = new TerminalApp();
app.start();
```

---

## Conclusion

When creating a door:

1. **START SIMPLE** - Begin with Door API only, add systems as needed
2. **TEST FREQUENTLY** - Build and test after each feature
3. **NO SHORTCUTS** - Implement fully, no TODOs or stubs
4. **FOLLOW PATTERNS** - Use examples as templates
5. **DOCUMENT WELL** - Future maintainers (including AI) will thank you

**Remember:** A production-ready door is one that:
- Builds with zero errors
- Runs without crashes
- Handles data safely
- Provides clear UX
- Is ready to distribute

Refer to example doors in `sdk/doors/` for complete, working implementations.

---

**Questions?** Check the comprehensive SDK documentation in `sdk/docs/` or refer to the example doors for patterns.
