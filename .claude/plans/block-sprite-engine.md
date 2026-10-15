# ANSI Block Sprite Engine - Implementation Plan

## Overview

Create a dedicated sprite engine for ANSI block character graphics, enabling smooth animated sprites for arcade game ports. This engine will be added to the SDK and used by all upcoming arcade game doors.

## Block Character Set

### Available Unicode Block Elements (U+2580 - U+259F)
```
Full blocks:    █ (full)
Half blocks:    ▀ (top) ▄ (bottom) ▌ (left) ▐ (right)
Quarter blocks: ▖ ▗ ▘ ▙ ▚ ▛ ▜ ▝ ▞ ▟
Shade blocks:   ░ (light) ▒ (medium) ▓ (dark)
```

### Resolution Modes
- **1x1 Mode**: Each character cell = 1 block (simple, fast)
- **2x2 Subpixel Mode**: Use half/quarter blocks for 2x resolution per cell
- **Shade Mode**: Use shading characters for anti-aliased edges

## Architecture

### File Structure
```
sdk/engines/graphics/
├── block-sprite/
│   ├── index.ts              # Main exports
│   ├── block-charset.ts      # Block character definitions
│   ├── block-sprite.ts       # Sprite class with block frames
│   ├── block-renderer.ts     # Rendering engine
│   ├── block-animation.ts    # Animation controller
│   ├── block-collision.ts    # Collision detection
│   ├── sprite-sheet.ts       # Sprite sheet management
│   └── patterns/
│       ├── index.ts
│       ├── characters.ts     # Common character sprites
│       ├── effects.ts        # Explosion, spark, etc.
│       └── projectiles.ts    # Bullets, missiles, etc.
```

## Core Interfaces

### BlockChar
```typescript
// Block character with color
interface BlockChar {
  char: string;           // Block character (█, ▀, etc.)
  fg?: AnsiColor;         // Foreground color
  bg?: AnsiColor;         // Background color
  transparent?: boolean;  // Skip rendering if true
}

// Shorthand: just string means default colors
type BlockCell = BlockChar | string | null;
```

### BlockFrame
```typescript
interface BlockFrame {
  width: number;
  height: number;
  data: BlockCell[][];    // 2D array of block cells
  duration?: number;      // Frame duration in ms (default: 100)
  origin?: { x: number; y: number };  // Sprite origin point
}
```

### BlockSprite
```typescript
interface BlockSprite {
  id: string;
  x: number;
  y: number;
  z: number;              // Z-index for layering
  frames: BlockFrame[];
  currentFrame: number;
  playing: boolean;
  loop: boolean;
  speed: number;          // Animation speed multiplier
  visible: boolean;
  flipX: boolean;
  flipY: boolean;

  // Collision
  hitbox?: { x: number; y: number; width: number; height: number };
}
```

## BlockSpriteEngine Class

```typescript
class BlockSpriteEngine {
  private sprites: Map<string, BlockSprite>;
  private buffer: BlockCell[][];
  private width: number;
  private height: number;
  private lastTime: number;

  constructor(width: number, height: number);

  // Sprite management
  createSprite(config: BlockSpriteConfig): BlockSprite;
  removeSprite(id: string): void;
  getSprite(id: string): BlockSprite | null;

  // Rendering
  clear(): void;
  render(): string;  // Returns ANSI string for output

  // Animation
  update(deltaTime: number): void;
  playSprite(id: string): void;
  stopSprite(id: string): void;
  setFrame(id: string, frame: number): void;

  // Collision
  checkCollision(id1: string, id2: string): boolean;
  checkPointCollision(id: string, x: number, y: number): boolean;
  getSpritesAt(x: number, y: number): BlockSprite[];

  // Batch operations
  moveSprite(id: string, x: number, y: number): void;
  setSpritesVisible(ids: string[], visible: boolean): void;
}
```

## Sprite Definition Format

### Simple Sprite (Static)
```typescript
const playerSprite = engine.createSprite({
  id: 'player',
  x: 10, y: 5,
  frames: [{
    width: 3, height: 3,
    data: [
      [null, '▄', null],
      ['█', '█', '█'],
      ['▀', null, '▀']
    ]
  }]
});
```

### Animated Sprite
```typescript
const explosionSprite = engine.createSprite({
  id: 'explosion',
  x: 20, y: 10,
  loop: false,
  frames: [
    { width: 1, height: 1, data: [['░']], duration: 50 },
    { width: 3, height: 3, data: [
      [null, '░', null],
      ['░', '▒', '░'],
      [null, '░', null]
    ], duration: 50 },
    { width: 5, height: 5, data: [
      [null, null, '░', null, null],
      [null, '░', '▓', '░', null],
      ['░', '▓', '█', '▓', '░'],
      [null, '░', '▓', '░', null],
      [null, null, '░', null, null]
    ], duration: 100 },
    // ... more frames
  ]
});
```

### Colored Sprite
```typescript
const frogSprite = engine.createSprite({
  id: 'frog',
  x: 40, y: 12,
  frames: [{
    width: 3, height: 2,
    data: [
      [
        { char: '▄', fg: 'green' },
        { char: '█', fg: 'green' },
        { char: '▄', fg: 'green' }
      ],
      [
        { char: '█', fg: 'green' },
        { char: '▀', fg: 'white' },  // Eyes
        { char: '█', fg: 'green' }
      ]
    ]
  }]
});
```

## Rendering Pipeline

1. **Clear buffer** - Fill with transparent cells
2. **Sort sprites by Z-index**
3. **For each sprite (back to front)**:
   - Get current animation frame
   - Apply flip transformations
   - Write non-transparent cells to buffer
4. **Convert buffer to ANSI string**:
   - Track current fg/bg colors
   - Emit color codes only on change
   - Build optimized output string
5. **Return for screen output**

## Collision Detection

### Bounding Box (Fast)
```typescript
function checkAABB(a: BlockSprite, b: BlockSprite): boolean {
  const aBox = a.hitbox || { x: 0, y: 0, width: frameWidth, height: frameHeight };
  const bBox = b.hitbox || { x: 0, y: 0, width: frameWidth, height: frameHeight };

  return !(
    a.x + aBox.x + aBox.width < b.x + bBox.x ||
    b.x + bBox.x + bBox.width < a.x + aBox.x ||
    a.y + aBox.y + aBox.height < b.y + bBox.y ||
    b.y + bBox.y + bBox.height < a.y + aBox.y
  );
}
```

### Pixel-Perfect (Accurate)
```typescript
function checkPixelPerfect(a: BlockSprite, b: BlockSprite): boolean {
  // First check AABB for early exit
  if (!checkAABB(a, b)) return false;

  // Then check overlapping non-transparent cells
  const aFrame = a.frames[a.currentFrame];
  const bFrame = b.frames[b.currentFrame];

  // ... detailed cell-by-cell check
}
```

## Pre-built Sprite Patterns

### Common Characters
```typescript
export const SPRITE_PATTERNS = {
  // Player characters
  humanoid: { idle: [...], walk: [...], jump: [...] },

  // Animals
  frog: { idle: [...], hop: [...] },
  bird: { idle: [...], flap: [...] },

  // Vehicles
  car: { right: [...], left: [...] },
  spaceship: { idle: [...], thrust: [...] },

  // Projectiles
  bullet: { default: [...] },
  missile: { default: [...], trail: [...] },

  // Effects
  explosion: { small: [...], medium: [...], large: [...] },
  splash: { default: [...] },
  spark: { default: [...] },

  // Environmental
  water: { wave1: [...], wave2: [...] },
  fire: { burn1: [...], burn2: [...], burn3: [...] },
};
```

## Integration with Blessed

```typescript
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { BlockSpriteEngine } from '@amiexpress/bbs-door-sdk/engines/graphics/block-sprite';

// Create game area box
const gameBox = blessed.box({
  parent: screen,
  width: 80,
  height: 20,
  tags: true
});

// Create sprite engine matching game area size
const spriteEngine = new BlockSpriteEngine(80, 20);

// Game loop
setInterval(() => {
  spriteEngine.update(33);  // ~30 FPS
  gameBox.setContent(spriteEngine.render());
  screen.render();
}, 33);
```

## Performance Optimizations

1. **Dirty Rectangle Tracking**: Only re-render changed areas
2. **String Pooling**: Reuse ANSI escape sequences
3. **Frame Caching**: Pre-render static sprite frames
4. **Delta Updates**: Send only changed cells to terminal
5. **Sprite Culling**: Skip off-screen sprites

## Implementation Steps

### Phase 1: Core Engine
1. Create `block-charset.ts` with all block characters
2. Create `block-sprite.ts` with BlockSprite class
3. Create `block-renderer.ts` with buffer and ANSI output
4. Basic sprite creation and rendering

### Phase 2: Animation
1. Create `block-animation.ts` with frame timing
2. Add play/stop/loop controls
3. Add speed multiplier
4. Add flip transformations

### Phase 3: Collision
1. Create `block-collision.ts` with AABB
2. Add pixel-perfect collision
3. Add point and area queries

### Phase 4: Patterns Library
1. Create common sprite patterns
2. Create effect animations
3. Create projectile sprites
4. Document usage examples

### Phase 5: Integration
1. Integrate with blessed UI
2. Add helper functions
3. Performance testing
4. Documentation

## Files to Create

1. `sdk/engines/graphics/block-sprite/index.ts`
2. `sdk/engines/graphics/block-sprite/block-charset.ts`
3. `sdk/engines/graphics/block-sprite/block-sprite.ts`
4. `sdk/engines/graphics/block-sprite/block-renderer.ts`
5. `sdk/engines/graphics/block-sprite/block-animation.ts`
6. `sdk/engines/graphics/block-sprite/block-collision.ts`
7. `sdk/engines/graphics/block-sprite/sprite-sheet.ts`
8. `sdk/engines/graphics/block-sprite/patterns/index.ts`
9. `sdk/engines/graphics/block-sprite/patterns/characters.ts`
10. `sdk/engines/graphics/block-sprite/patterns/effects.ts`
11. `sdk/engines/graphics/block-sprite/patterns/projectiles.ts`

## Estimated Size
- Core engine: ~800 lines
- Animation system: ~300 lines
- Collision system: ~200 lines
- Patterns library: ~500 lines
- Total: ~1800 lines TypeScript
