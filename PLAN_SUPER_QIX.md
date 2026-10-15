# Super Qix Arcade Game - Implementation Plan

## Overview

Create a faithful TypeScript door port of the 1987 Taito arcade game "Super Qix" as a **hybrid door** with:
- **Neo-blessed UI** for terminal rendering
- **Tone.js AudioEngine** for sound effects
- **TrackerEngine** for MOD/XM background music
- **Fallback** to server-only mode without audio for terminal-only sessions

## Game Specifications (from research)

### Core Mechanics
- **Objective**: Claim 75%+ of the playfield by drawing lines and enclosing areas
- **Drawing**: Move marker into unclaimed space while holding draw button
- **Stix**: Lines drawn behind marker; connect back to safe edge to claim area
- **Fast Draw**: Blue lines, faster but lower points
- **Slow Draw**: Red/orange lines, slower but double points
- **16 Levels**: Each reveals a background image when completed
- **98% Bonus**: Claim 98%+ for extra life

### Scoring System
| Action | Points |
|--------|--------|
| Fast Draw area | Base points per % |
| Slow Draw area | 2x base points per % |
| Bonus per % above 75% | 1,000 points each |
| Letter collected | 1,000 points |
| Complete word | 10,000 points |
| Split Qix bonus | 2x-9x multiplier |

### Enemy Types
| Enemy | Behavior |
|-------|----------|
| **Qix/Gremlin** | Bounces randomly in unclaimed space; touch while drawing = death |
| **Sparx** | Patrol borders and claimed areas; touch = death |
| **Super Sparx** | After time, can chase along unfinished lines |
| **Fuse** | Appears if you stop drawing; burns toward you = death |

### Power-Ups (New in Super Qix)
| Power-Up | Effect |
|----------|--------|
| Speed | Faster marker movement |
| Shield | One-time protection from enemies |
| Freeze | Temporarily freeze enemies |
| Warp | Skip to next level |
| Letters | Collect to spell word = auto-complete level |

## Architecture

### File Structure (Hybrid Door)
```
Doors/super-qix/
├── package.json          # runtime: "hybrid" with client/server entries
├── tsconfig.json
├── index.ts              # Server entry - exports for fallback mode
├── client.ts             # Client entry - browser with audio/UI
├── server.ts             # Server RPC handlers (highscores, state)
├── game/
│   ├── types.ts          # Shared game types/interfaces
│   ├── constants.ts      # Game constants (speeds, points, etc.)
│   ├── qix-engine.ts     # Core Qix gameplay engine
│   ├── drawing.ts        # Stix drawing and area calculation
│   ├── enemies.ts        # Qix, Sparx, Fuse behavior
│   └── powerups.ts       # Power-up spawning and effects
├── audio/
│   ├── sound-effects.ts  # Tone.js sound definitions
│   └── music.ts          # TrackerEngine music loader
├── ui/
│   └── screens.ts        # Neo-blessed screen definitions
├── assets/
│   ├── music/            # MOD/XM music files
│   └── images/           # Level background images (16 levels)
├── super-qix.info        # Door registration
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

class SuperQixAudio {
  private sfx: AudioEngine;
  private music: TrackerEngine;
  private enabled: boolean = true;

  async init() {
    try {
      this.sfx = new AudioEngine({ masterVolume: 0.7, sfxVolume: 0.8 });
      await this.sfx.init();

      this.music = new TrackerEngine({ repeatCount: -1, volume: 0.5 });
      this.music.on('initialized', async () => {
        await this.music.load('/doors/super-qix/assets/music/qix.mod');
      });
    } catch (e) {
      this.enabled = false; // Graceful fallback
    }
  }

  playDrawStart() { if (this.enabled) this.sfx.playSound('laser', { frequency: 440 }); }
  playDrawComplete() { if (this.enabled) this.sfx.playSound('coin'); }
  playDeath() { if (this.enabled) this.sfx.playSound('explosion'); }
  playPowerUp() { if (this.enabled) this.sfx.playSound('magic-cast'); }
  playFuse() { if (this.enabled) this.sfx.playSound('laser', { frequency: 220 }); }
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
  title: 'Super Qix',
  output: (data: string) => bbs.write(data)
});

// Game area (playfield)
const playfield = createBox({
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
  content: '{yellow-fg}SCORE: 00000000{/}  {cyan-fg}LEVEL: 1{/}  {green-fg}CLAIMED: 0%{/}  {red-fg}LIVES: 3{/}'
});

// Footer with controls
const footer = createBox({
  parent: screen,
  bottom: 0,
  width: '100%',
  height: 3,
  content: '{gray-fg}Arrow Keys: Move | Z: Slow Draw | X: Fast Draw | Q: Quit{/}'
});
```

### 2. Game State Interface
```typescript
type GameState = 'menu' | 'playing' | 'paused' | 'levelComplete' | 'gameover' | 'highscores' | 'enterName';

interface SuperQixData {
  state: GameState;
  score: number;
  lives: number;
  level: number;
  claimedPercent: number;
  targetPercent: number;  // Usually 75%
  scoreMultiplier: number; // 1-9x from splitting Qix

  // Playfield
  field: CellState[][];    // 2D grid: UNCLAIMED, CLAIMED, BORDER, STIX
  marker: { x: number; y: number };
  currentStix: Point[];    // Line being drawn
  isDrawing: boolean;
  drawSpeed: 'fast' | 'slow';

  // Enemies
  qix: Qix[];              // Can have multiple after splitting
  sparx: Sparx[];
  fuse: Fuse | null;

  // Power-ups & Letters
  powerUps: PowerUp[];
  collectedLetters: string[];
  levelWord: string;       // Word to spell for auto-complete
  activeEffects: ActiveEffect[];

  // Meta
  highscores: HighScore[];
  menuSelection: number;
  playerName: string;
}

type CellState = 'unclaimed' | 'claimed' | 'border' | 'stix';

interface Qix {
  x: number;
  y: number;
  vx: number;
  vy: number;
  segments: Point[];  // The bouncing line/gremlin shape
}

interface Sparx {
  x: number;
  y: number;
  direction: number;  // Patrol direction along border
  isSuper: boolean;
}

interface Fuse {
  x: number;
  y: number;
  pathIndex: number;  // Position along current stix
  active: boolean;
}
```

### 3. Playfield Layout
```
+------------------------------------------+
|  SCORE: 00000000  LEVEL: 1  CLAIMED: 0%   |
+------------------------------------------+
|########################################  |
|#......................................#  |
|#......................................#  |
|#........[UNCLAIMED AREA]..............#  |  <- Qix bounces here
|#...............Q......................#  |
|#......................................#  |
|#......................................#  |
|#......................................#  |
|#..@====[STIX BEING DRAWN]====........#  |  <- Marker drawing
|#......................................#  |
|########################################  |
|  Z: Slow | X: Fast | Letters: S_P_R     |
+------------------------------------------+
```

### 4. Key Classes

**QixEngine** (main game class)
- createInitialGameData()
- initLevel(levelNum)
- updateGame(deltaTime)
- render()
- handleInput(key)
- Game loop with setInterval(30 FPS)

**DrawingSystem** (stix and area calculation)
- startDrawing(speed)
- extendStix(direction)
- completeStix() - flood fill to claim area
- calculateClaimedPercent()
- checkQixSplit()

**EnemySystem** (Qix, Sparx, Fuse)
- updateQix(deltaTime) - random bouncing
- updateSparx(deltaTime) - border patrol
- updateFuse(deltaTime) - burn along stix
- checkCollisions(marker, stix)
- spawnSuperSparx()

**PowerUpSystem**
- spawnPowerUp(position, type)
- applyPowerUp(type)
- updateActiveEffects(deltaTime)
- checkLetterCollection()

### 5. Drawing Mechanics
```typescript
// Core drawing algorithm
class DrawingSystem {
  startDrawing(marker: Point, speed: 'fast' | 'slow'): void {
    this.currentStix = [{ ...marker }];
    this.isDrawing = true;
    this.drawSpeed = speed;
    this.fuseTimer = 0;
  }

  extendStix(direction: Direction): boolean {
    const next = this.getNextPoint(direction);

    // Can't draw into claimed area or cross own stix
    if (this.field[next.y][next.x] === 'claimed') return false;
    if (this.stixContains(next)) return false;  // Self-intersection

    this.currentStix.push(next);
    this.field[next.y][next.x] = 'stix';
    this.fuseTimer = 0;  // Reset fuse
    return true;
  }

  completeStix(): ClaimResult {
    // Connect stix back to border/claimed area
    if (!this.touchesSafeArea()) return { success: false };

    // Flood fill: determine which side has Qix, claim the other
    const areas = this.findEnclosedAreas();
    const areaWithoutQix = areas.find(a => !this.containsQix(a));

    // Claim the area
    this.fillArea(areaWithoutQix);

    // Calculate points
    const percent = this.calculateAreaPercent(areaWithoutQix);
    const points = this.calculatePoints(percent, this.drawSpeed);

    // Check for power-up spawn
    if (Math.random() < 0.3) {
      this.spawnPowerUp(areaWithoutQix.center);
    }

    return { success: true, percent, points };
  }
}
```

### 6. Qix Behavior (Gremlin)
```typescript
class Qix {
  // Random movement within unclaimed space
  update(deltaTime: number, field: CellState[][]): void {
    // Move in current direction
    this.x += this.vx * deltaTime;
    this.y += this.vy * deltaTime;

    // Bounce off claimed areas and borders
    if (this.hitsWall(field)) {
      // Random direction change
      const angle = Math.random() * Math.PI * 2;
      this.vx = Math.cos(angle) * this.speed;
      this.vy = Math.sin(angle) * this.speed;
    }

    // Update visual segments (the bouncing line shape)
    this.updateSegments();
  }

  // Check collision with stix or marker
  checkCollision(marker: Point, stix: Point[]): boolean {
    // Check marker (while drawing)
    if (this.intersectsPoint(marker)) return true;

    // Check stix line
    for (const point of stix) {
      if (this.intersectsPoint(point)) return true;
    }
    return false;
  }
}
```

### 7. Sparx Patrol System
```typescript
class Sparx {
  // Patrol along borders and claimed area edges
  update(deltaTime: number, borders: Point[]): void {
    // Move along border path
    this.pathPosition += this.speed * deltaTime;

    if (this.pathPosition >= this.currentPath.length) {
      // Find next connected border segment
      this.findNextPath();
    }

    this.x = this.currentPath[Math.floor(this.pathPosition)].x;
    this.y = this.currentPath[Math.floor(this.pathPosition)].y;
  }

  // After time limit, transform to Super Sparx
  checkTransform(elapsedTime: number): void {
    if (!this.isSuper && elapsedTime > SUPER_SPARX_TIME) {
      this.isSuper = true;
      this.speed *= 1.5;
      // Can now follow unfinished stix
    }
  }
}
```

### 8. Fuse Mechanic
```typescript
class Fuse {
  // Burns along stix when player stops
  update(deltaTime: number, playerMoving: boolean, stix: Point[]): void {
    if (playerMoving) {
      this.active = false;
      return;
    }

    if (!this.active) {
      // Start fuse at beginning of stix
      this.active = true;
      this.pathIndex = 0;
    }

    // Burn toward player
    this.pathIndex += this.burnSpeed * deltaTime;

    if (this.pathIndex >= stix.length) {
      // Fuse reached player = death
      return { playerDeath: true };
    }

    this.x = stix[Math.floor(this.pathIndex)].x;
    this.y = stix[Math.floor(this.pathIndex)].y;
  }
}
```

### 9. Level Progression
- Level 1-4: Single Qix, slow Sparx, basic power-ups
- Level 5-8: Faster Qix, Super Sparx appear sooner
- Level 9-12: Multiple Qix possible, more enemies
- Level 13-16: Maximum difficulty, fastest enemies
- After Level 16: Loop with increased difficulty

### 10. Power-Up System
```typescript
const POWERUP_TYPES = {
  speed: { duration: 10000, effect: 'doubleSpeed' },
  shield: { duration: 0, effect: 'oneTimeProtection' },
  freeze: { duration: 5000, effect: 'freezeEnemies' },
  warp: { duration: 0, effect: 'skipLevel' },
  letter: { duration: 0, effect: 'collectLetter' }
};

// Letter collection for auto-complete
const LEVEL_WORDS = [
  'CAT', 'DOG', 'FISH', 'BIRD', 'LION',
  'TIGER', 'BEAR', 'WOLF', 'EAGLE', 'SHARK',
  'WHALE', 'SNAKE', 'FROG', 'DEER', 'SEAL', 'PANDA'
];
```

## Implementation Steps

### Phase 1: Project Setup & Core Structure
1. Create hybrid door files:
   - `package.json` with hybrid runtime config
   - `tsconfig.json` for TypeScript
   - `super-qix.info` for door registration
2. Create `game/types.ts` - shared interfaces
3. Create `game/constants.ts` - game constants
4. Create basic `index.ts` (fallback server door)
5. Create basic `server.ts` (RPC handlers stub)
6. Create basic `client.ts` (ClientDoor setup)

### Phase 2: Neo-Blessed UI Framework
1. Create `ui/screens.ts`:
   - Menu screen with neo-blessed list
   - Game screen with playfield, HUD, footer
   - High scores screen
   - Help screen
2. Implement screen transitions
3. Add keyboard navigation (Tab, Enter, Escape)
4. Test UI rendering in both hybrid and fallback modes

### Phase 3: Audio System
1. Create `audio/sound-effects.ts`:
   - Draw start sound (laser-like)
   - Draw complete sound (coin/chime)
   - Death sound (explosion)
   - Power-up collect sound
   - Fuse burning sound
   - Level complete fanfare
2. Create `audio/music.ts`:
   - TrackerEngine wrapper
   - Load MOD/XM files for gameplay
3. Add graceful fallback when audio unavailable

### Phase 4: Playfield & Drawing System
1. Create `game/qix-engine.ts`:
   - Playfield grid initialization
   - Marker movement on borders
   - Draw mode activation (fast/slow)
2. Create `game/drawing.ts`:
   - Stix line management
   - Area claiming (flood fill algorithm)
   - Percentage calculation
   - Split Qix detection
3. Implement points calculation (slow = 2x)

### Phase 5: Enemy System
1. Create `game/enemies.ts`:
   - Qix random movement and bouncing
   - Qix visual rendering (bouncing line/gremlin)
   - Sparx border patrol
   - Super Sparx transformation and stix following
   - Fuse mechanic (burn when stopped)
2. Implement collision detection
3. Add enemy spawning per level

### Phase 6: Power-Ups & Letters
1. Create `game/powerups.ts`:
   - Power-up spawning on area claim
   - Speed boost effect
   - Shield (one-time protection)
   - Freeze enemies
   - Warp to next level
   - Letter collection system
2. Implement word completion = auto-complete level

### Phase 7: Integration & Polish
1. Integrate all systems with level progression
2. Implement high score persistence via RPC
3. Add level transition animations
4. Add background image reveal (16 images)
5. Add difficulty progression per level
6. Test hybrid mode with audio
7. Test fallback mode without audio
8. Build and bundle client

## Visual Design (ASCII/Unicode)

### Characters
- Marker: `@` (cyan when idle, yellow when drawing)
- Qix/Gremlin: `*` or `%` (magenta, bouncing)
- Sparx: `+` (red)
- Super Sparx: `X` (bright red)
- Fuse: `~` (yellow, animated)
- Power-up: `?` (various colors)
- Letter: `A-Z` (green)

### Playfield States
```
Border:    '#' (white)
Unclaimed: '.' (dark gray)
Claimed:   ' ' (with bg color for revealed image)
Stix:      '=' (blue for fast, red for slow)
```

### Level Completion
```
When 75%+ claimed, remaining unclaimed area fills
Background "image" revealed using colored blocks
```

## Controls
- **Arrow Keys / WASD**: Move marker
- **Z**: Slow Draw (hold while moving into unclaimed)
- **X**: Fast Draw (hold while moving into unclaimed)
- **Q**: Quit to menu
- **P**: Pause

## Critical Files to Reference
- `~/Code/amiexpress-web/Doors/arkanoid2/` - Hybrid door pattern (client + server)
- `~/Code/amiexpress-web/Doors/card-lobby/` - Neo-blessed UI patterns
- `~/Code/amiexpress-web/sdk/engines/audio/audio-engine.ts` - Tone.js AudioEngine
- `~/Code/amiexpress-web/sdk/engines/audio/tracker-engine.ts` - TrackerEngine
- `~/Code/amiexpress-web/Documentation/4-Door-Developers/TYPESCRIPT_DOOR_GUIDE.md`
- `~/Code/amiexpress-web/Documentation/4-Door-Developers/NEO_BLESSED_BEST_PRACTICES.md`

## Files to Create

### Core Files
1. `Doors/super-qix/package.json` - Hybrid door config
2. `Doors/super-qix/tsconfig.json` - TypeScript config
3. `Doors/super-qix/super-qix.info` - Door registration
4. `Doors/super-qix/index.ts` - Fallback server door
5. `Doors/super-qix/client.ts` - Browser client with audio
6. `Doors/super-qix/server.ts` - RPC handlers

### Game Logic
7. `Doors/super-qix/game/types.ts` - Shared interfaces
8. `Doors/super-qix/game/constants.ts` - Game constants
9. `Doors/super-qix/game/qix-engine.ts` - Core game engine
10. `Doors/super-qix/game/drawing.ts` - Stix and area claiming
11. `Doors/super-qix/game/enemies.ts` - Qix, Sparx, Fuse
12. `Doors/super-qix/game/powerups.ts` - Power-ups and letters

### Audio
13. `Doors/super-qix/audio/sound-effects.ts` - Tone.js sounds
14. `Doors/super-qix/audio/music.ts` - TrackerEngine music

### UI
15. `Doors/super-qix/ui/screens.ts` - Neo-blessed screens

### Assets (optional)
16. `Doors/super-qix/assets/music/qix.mod` - Game music
17. `Doors/super-qix/assets/images/` - 16 level background patterns

## User Choices
- **Scope**: Full game with 16 levels
- **Difficulty**: Authentic arcade rules (75% threshold, fuse mechanic)
- **UI**: Neo-blessed for terminal rendering
- **Audio**: Tone.js for SFX + TrackerEngine for music
- **Architecture**: Hybrid door with fallback

## Estimated Size
- Total: ~2500-3000 lines TypeScript across all files
- `client.ts`: ~400 lines (UI, audio integration, game loop)
- `index.ts`: ~300 lines (fallback door)
- `server.ts`: ~100 lines (RPC handlers)
- `game/qix-engine.ts`: ~300 lines (main engine)
- `game/drawing.ts`: ~400 lines (stix, flood fill, area calc)
- `game/enemies.ts`: ~400 lines (Qix, Sparx, Fuse)
- `game/powerups.ts`: ~200 lines (power-ups, letters)
- `audio/*.ts`: ~200 lines (audio systems)
- `ui/screens.ts`: ~300 lines (neo-blessed screens)

## Build Order (Testable Checkpoints)
1. **Phase 1**: Project setup + basic menu (verify door loads)
2. **Phase 2**: Neo-blessed UI framework (verify rendering)
3. **Phase 3**: Audio system (verify sounds play in hybrid mode)
4. **Phase 4**: Playfield + drawing (can claim areas, see percentage)
5. **Phase 5**: Enemies (Qix kills player, Sparx patrol, Fuse burns)
6. **Phase 6**: Power-ups + letters (collect items, spell words)
7. **Phase 7**: Full integration + 16 levels + high scores + polish

## Key Algorithms

### Flood Fill for Area Claiming
```typescript
function claimArea(field: CellState[][], stix: Point[], qixPositions: Point[]): void {
  // Find all unclaimed regions separated by stix
  const regions = findRegions(field, stix);

  // Claim region(s) that don't contain Qix
  for (const region of regions) {
    if (!containsAnyPoint(region, qixPositions)) {
      fillRegion(field, region, 'claimed');
    }
  }
}

function findRegions(field: CellState[][], stix: Point[]): Region[] {
  const visited = new Set<string>();
  const regions: Region[] = [];

  for (let y = 0; y < field.length; y++) {
    for (let x = 0; x < field[0].length; x++) {
      const key = `${x},${y}`;
      if (field[y][x] === 'unclaimed' && !visited.has(key)) {
        const region = floodFill(field, x, y, visited);
        regions.push(region);
      }
    }
  }

  return regions;
}
```

### Qix Split Detection
```typescript
function checkQixSplit(field: CellState[][], qixList: Qix[]): boolean {
  if (qixList.length < 2) return false;

  // Check if Qix are in different unclaimed regions
  const regions = findRegions(field);
  const qixRegions = new Set<number>();

  for (const qix of qixList) {
    const regionIndex = regions.findIndex(r => containsPoint(r, qix));
    qixRegions.add(regionIndex);
  }

  // Split if Qix are in different regions
  return qixRegions.size > 1;
}
```
