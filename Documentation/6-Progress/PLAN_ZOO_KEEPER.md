# Zoo Keeper Arcade Game - Implementation Plan

## Overview

Create a faithful TypeScript door port of the 1982 Taito arcade game "Zoo Keeper" as a **hybrid door** with:
- **Neo-blessed UI** for terminal rendering
- **Tone.js AudioEngine** for sound effects
- **TrackerEngine** for MOD/XM background music
- **Fallback** to server-only mode without audio for terminal-only sessions

## Game Specifications (from research)

### Core Mechanics
- **Zoo Stage**: Run around rectangular perimeter building walls to contain animals
- **Platform Stage**: Jump up moving platforms to rescue Zelda, dodge coconuts
- **Stampede Stage**: Jump over charging animals on escalators
- Wall building under Zeke's feet as he moves
- Animals break through walls from inside
- Net powerup to capture escaped animals
- Timer represented as burning fuse with bonus items

### Animals & Points
| Animal | Capture Pts | Speed | Strength |
|--------|------------|-------|----------|
| Elephant | 250 | Slow | Low |
| Snake | 500 | Medium | Low |
| Camel | 1,000 | Medium | Medium |
| Rhino | 2,000 | Fast | High |
| Moose | 4,000 | Fast | High |
| Lion | 30,000+ | Fastest | Highest |

### Jump Scoring (# animals jumped)
1=100, 2=500, 3=2000, 4=6000, 5=15000, 6=30000, 7=60000, 8=120000, 9=250000, 10=500000, 11=1000000

### Bonus Items
Root beer(120), Clover(300), Watermelon(500), Sundae(1000), Strawberry(2500), Trophy(5000), Money(7500), Net(capture tool)

## Architecture

### File Structure (Hybrid Door)
```
Doors/zoo-keeper/
├── package.json          # runtime: "hybrid" with client/server entries
├── tsconfig.json
├── index.ts              # Server entry - exports for fallback mode
├── client.ts             # Client entry - browser with audio/UI
├── server.ts             # Server RPC handlers (highscores, state)
├── game/
│   ├── types.ts          # Shared game types/interfaces
│   ├── constants.ts      # Game constants (speeds, points, etc.)
│   ├── zoo-stage.ts      # Zoo stage logic
│   ├── platform-stage.ts # Platform stage logic
│   └── stampede-stage.ts # Stampede stage logic
├── audio/
│   ├── sound-effects.ts  # Tone.js sound definitions
│   └── music.ts          # TrackerEngine music loader
├── ui/
│   └── screens.ts        # Neo-blessed screen definitions
├── assets/
│   └── music/            # MOD/XM music files
├── zoo-keeper.info       # Door registration
├── dist/                 # Compiled output
│   ├── client.bundle.js  # Browser bundle (esbuild)
│   └── *.js              # Server compiled
└── highscores.json       # Persistent (auto-created)
```

### Hybrid Door Pattern
```typescript
// package.json
{
  "runtime": "hybrid",
  "client": { "entry": "./client.ts", "bundle": "./dist/client.bundle.js" },
  "server": { "entry": "./server.ts" }
}

// client.ts - Browser with full audio/UI
import { ClientDoor, AudioEngine, TrackerEngine } from '@amiexpress/bbs-door-sdk/client';
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';

// server.ts - RPC handlers for persistence
export const rpcHandlers = {
  getHighscores: () => { /* read JSON */ },
  saveHighscore: (params) => { /* write JSON */ }
};

// index.ts - Fallback for non-hybrid (terminal-only)
import { CoreDoor as Door } from '@amiexpress/bbs-door-sdk';
// Same game logic, no audio, neo-blessed UI only
```

### Audio Architecture
```typescript
// client.ts
import { AudioEngine } from '@amiexpress/bbs-door-sdk/engines/audio/audio-engine';
import { TrackerEngine } from '@amiexpress/bbs-door-sdk/engines/audio/tracker-engine';

class ZooKeeperAudio {
  private sfx: AudioEngine;
  private music: TrackerEngine;
  private enabled: boolean = true;

  async init() {
    try {
      this.sfx = new AudioEngine({ masterVolume: 0.7, sfxVolume: 0.8 });
      await this.sfx.init();

      this.music = new TrackerEngine({ repeatCount: -1, volume: 0.5 });
      this.music.on('initialized', async () => {
        await this.music.load('/doors/zoo-keeper/assets/music/zoo.mod');
      });
    } catch (e) {
      this.enabled = false; // Graceful fallback
    }
  }

  playJump() { if (this.enabled) this.sfx.playSound('jump'); }
  playCapture() { if (this.enabled) this.sfx.playSound('coin'); }
  playDeath() { if (this.enabled) this.sfx.playSound('explosion'); }
  // ... more sound effects
}
```

## Implementation Components

### 1. Neo-Blessed UI System
```typescript
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createBox, createText, createList } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

// Screen setup
const screen = blessed.screen({
  smartCSR: true,
  dockBorders: true,
  title: 'Zoo Keeper',
  output: (data: string) => bbs.write(data)
});

// Game area box
const gameArea = createBox({
  parent: screen,
  top: 1,
  left: 0,
  width: '100%',
  height: '100%-4',
  style: { bg: 'black' }
});

// HUD panel
const hud = createBox({
  parent: screen,
  top: 0,
  width: '100%',
  height: 1,
  content: '{yellow-fg}SCORE: 00000000{/}  {cyan-fg}LEVEL: 1{/}  {red-fg}LIVES: ***{/}'
});

// Footer with controls
const footer = createBox({
  parent: screen,
  bottom: 0,
  width: '100%',
  height: 3,
  content: '{gray-fg}Arrow Keys: Move | Space: Jump | Q: Quit{/}'
});
```

### 2. Game State Interface
```typescript
type GameState = 'menu' | 'playing' | 'platform' | 'stampede' | 'paused' | 'gameover' | 'highscores' | 'enterName';

interface ZooKeeperData {
  state: GameState;
  score: number;
  lives: number;
  level: number;
  round: number;  // 1-4 within each level cycle

  // Zoo stage
  zeke: { x: number; y: number; direction: Direction; hasNet: boolean; netTimer: number };
  animals: Animal[];
  wall: number[][];  // Wall thickness at each position
  bonusItems: BonusItem[];
  timer: number;

  // Platform stage
  platforms: Platform[];
  coconuts: Coconut[];
  zelda: { x: number; y: number };
  monkey: { x: number; y: number };

  // Meta
  highscores: HighScore[];
  menuSelection: number;
  playerName: string;
}
```

### 3. Zoo Stage Layout (Primary Gameplay)
```
+------------------------------------------+
|  SCORE: 00000000   LEVEL: 1   LIVES: ***  |
+------------------------------------------+
|######################################### |
|#                                       # |
|#   +-------------------------------+   # |  <- Outer wall (Zeke runs here)
|#   |                               |   # |
|#   |     [CAGE]                    |   # |  <- Inner area (animals)
|#   |       E  S  C                 |   # |
|#   |          R     M              |   # |
|#   |                               |   # |
|#   +-------------------------------+   # |
|#                                       # |
|##########################################|
|  [===TIMER FUSE===]  Items: B C W S T M  |
+------------------------------------------+
```

### 4. Key Classes

**ZooKeeperGame** (main class)
- createInitialGameData()
- initZooStage() / initPlatformStage() / initStampedeStage()
- updateZooStage() / updatePlatformStage()
- render() with state-specific renderers
- handleInput()
- Game loop with setInterval(30 FPS)

**Renderer** (buffer-based)
- drawWall(x, y, thickness)
- drawAnimal(animal)
- drawZeke(zeke)
- drawPlatforms()
- flush()

**AudioSystem** (terminal bell)
- playJump(), playCapture(), playEscape(), playBonusCollect()

### 5. Movement System

**Zeke (Perimeter Movement)**
- Moves along rectangular perimeter only
- Auto-corners when reaching edge
- Builds wall underneath as he moves
- Jump button for hopping over animals
- Can only move in current direction or reverse

**Animals (Inside Zoo)**
- Bounce inside cage area
- Target weak wall sections
- Break through walls (strength-based damage)
- Once escaped: run opposite from Zeke
- Can be captured with net powerup

### 6. Wall Mechanics
```typescript
interface WallSegment {
  thickness: number;  // 0-3 (0=broken, 3=max)
  x: number;
  y: number;
}

// Wall builds as Zeke passes
// Animals damage from inside
// Visual: ' '=0, '.'=1, '+'=2, '#'=3
```

### 7. Level Progression
- Level 1: Elephants only, partial wall
- Level 2: +Snakes
- Level 3: +Camels
- Level 4: +Rhinos
- Level 5: +Moose
- Level 6+: +Lions, faster animals, less initial wall

### 8. Stage Rotation
1. Zoo Stage (contain animals)
2. Platform Stage (rescue Zelda)
3. Zoo Stage (harder)
4. Stampede Stage (escalators)
5. Repeat with increased difficulty

## Implementation Steps

### Phase 1: Project Setup & Core Structure
1. Create hybrid door files:
   - `package.json` with hybrid runtime config
   - `tsconfig.json` for TypeScript
   - `zoo-keeper.info` for door registration
2. Create `game/types.ts` - shared interfaces
3. Create `game/constants.ts` - game constants
4. Create basic `index.ts` (fallback server door)
5. Create basic `server.ts` (RPC handlers stub)
6. Create basic `client.ts` (ClientDoor setup)

### Phase 2: Neo-Blessed UI Framework
1. Create `ui/screens.ts`:
   - Menu screen with neo-blessed list
   - Game screen with HUD, game area, footer
   - High scores screen
   - Help screen
2. Implement screen transitions
3. Add keyboard navigation (Tab, Enter, Escape)
4. Test UI rendering in both hybrid and fallback modes

### Phase 3: Audio System
1. Create `audio/sound-effects.ts`:
   - Jump sound (Tone.js synth)
   - Capture sound (coin-like)
   - Death sound (explosion)
   - Wall break sound
   - Bonus collect sound
   - Level complete fanfare
2. Create `audio/music.ts`:
   - TrackerEngine wrapper
   - Load MOD/XM files for different stages
   - Menu music, Zoo music, Platform music
3. Add graceful fallback when audio unavailable

### Phase 4: Zoo Stage (Core Gameplay)
1. Create `game/zoo-stage.ts`:
   - Perimeter movement for Zeke
   - Wall building under Zeke's feet
   - Animal spawning from cage
   - Animal AI (bounce, target weak walls)
   - Wall damage system
   - Animal escape logic
   - Net powerup and capture
   - Collision detection (death if touched without net)
2. Implement timer fuse with bonus items
3. Add jump mechanics and scoring

### Phase 5: Platform Stage
1. Create `game/platform-stage.ts`:
   - Horizontally moving platforms
   - Zelda at top of tree
   - Monkey coconut throwing
   - Coconut bouncing physics
   - Jump between platforms
   - Rescue completion bonus

### Phase 6: Stampede Stage
1. Create `game/stampede-stage.ts`:
   - Escalator movement
   - Charging animal waves
   - Jump timing mechanics
   - Extra life reward at top

### Phase 7: Integration & Polish
1. Integrate all stages with level progression
2. Implement high score persistence via RPC
3. Add stage transition animations
4. Add difficulty progression per level
5. Test hybrid mode with audio
6. Test fallback mode without audio
7. Build and bundle client

## Visual Design (ASCII/Unicode)

### Characters
- Zeke: `@` (cyan)
- Elephant: `E` (gray)
- Snake: `S` (green)
- Camel: `C` (yellow)
- Rhino: `R` (gray)
- Moose: `M` (brown)
- Lion: `L` (yellow, bold)
- Zelda: `Z` (magenta)
- Monkey: `m` (brown)
- Coconut: `o` (brown)
- Net: `#` (cyan, when Zeke has it)

### Wall Thickness
```
Thickness 0: ' ' (broken/gap)
Thickness 1: '.' (weak)
Thickness 2: '+' (medium)
Thickness 3: '#' (strong)
```

### Bonus Items
```
B=Beer, C=Clover, W=Watermelon, S=Sundae, T=Trophy, $=Money, N=Net
```

## Controls
- **Arrow Keys / WASD**: Move Zeke (along perimeter)
- **Space**: Jump
- **Q**: Quit to menu
- **P**: Pause

## Critical Files to Reference
- `~/Code/AmiExpress/amiexpress-web/Doors/arkanoid2/` - Hybrid door pattern (client + server)
- `~/Code/AmiExpress/amiexpress-web/Doors/card-lobby/` - Neo-blessed UI patterns
- `~/Code/AmiExpress/amiexpress-web/sdk/engines/audio/audio-engine.ts` - Tone.js AudioEngine
- `~/Code/AmiExpress/amiexpress-web/sdk/engines/audio/tracker-engine.ts` - TrackerEngine
- `~/Code/AmiExpress/amiexpress-web/Documentation/4-Door-Developers/TYPESCRIPT_DOOR_GUIDE.md`
- `~/Code/AmiExpress/amiexpress-web/Documentation/4-Door-Developers/NEO_BLESSED_BEST_PRACTICES.md`

## Files to Create

### Core Files
1. `Doors/zoo-keeper/package.json` - Hybrid door config
2. `Doors/zoo-keeper/tsconfig.json` - TypeScript config
3. `Doors/zoo-keeper/zoo-keeper.info` - Door registration
4. `Doors/zoo-keeper/index.ts` - Fallback server door
5. `Doors/zoo-keeper/client.ts` - Browser client with audio
6. `Doors/zoo-keeper/server.ts` - RPC handlers

### Game Logic
7. `Doors/zoo-keeper/game/types.ts` - Shared interfaces
8. `Doors/zoo-keeper/game/constants.ts` - Game constants
9. `Doors/zoo-keeper/game/zoo-stage.ts` - Zoo stage logic
10. `Doors/zoo-keeper/game/platform-stage.ts` - Platform stage
11. `Doors/zoo-keeper/game/stampede-stage.ts` - Stampede stage

### Audio
12. `Doors/zoo-keeper/audio/sound-effects.ts` - Tone.js sounds
13. `Doors/zoo-keeper/audio/music.ts` - TrackerEngine music

### UI
14. `Doors/zoo-keeper/ui/screens.ts` - Neo-blessed screens

### Assets (if using custom music)
15. `Doors/zoo-keeper/assets/music/zoo.mod` - Game music (optional, can use procedural)

## User Choices
- **Scope**: Full game with all 4 stage types
- **Difficulty**: Authentic arcade rules (escaped animals kill Zeke)
- **UI**: Neo-blessed for terminal rendering
- **Audio**: Tone.js for SFX + TrackerEngine for music
- **Architecture**: Hybrid door with fallback

## Estimated Size
- Total: ~2000-2500 lines TypeScript across all files
- `client.ts`: ~400 lines (UI, audio integration, game loop)
- `index.ts`: ~300 lines (fallback door)
- `server.ts`: ~100 lines (RPC handlers)
- `game/*.ts`: ~800 lines (game logic)
- `audio/*.ts`: ~200 lines (audio systems)
- `ui/screens.ts`: ~300 lines (neo-blessed screens)

## Build Order (Testable Checkpoints)
1. **Phase 1**: Project setup + basic menu (verify door loads)
2. **Phase 2**: Neo-blessed UI framework (verify rendering)
3. **Phase 3**: Audio system (verify sounds play in hybrid mode)
4. **Phase 4**: Zoo Stage complete (core gameplay works)
5. **Phase 5**: Platform Stage (rescue Zelda works)
6. **Phase 6**: Stampede Stage (escalators work)
7. **Phase 7**: Full integration + high scores + polish
