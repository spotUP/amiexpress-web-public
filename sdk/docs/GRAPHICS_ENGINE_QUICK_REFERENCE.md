# GraphicsEngine Quick Reference

Fast lookup for GraphicsEngine APIs. Provides ANSI rendering, sprites, parallax, and particle effects.

## Import

```typescript
import { GraphicsEngine } from '@amiexpress/sdk/engines/graphics';
const gfx = new GraphicsEngine(80, 24);  // width, height
```

## Basic Drawing

```typescript
// Draw single character
gfx.drawChar(x, y, '@', 'yellow', 'black');

// Draw text
gfx.drawText(x, y, 'Hello World', 'green');

// Draw with background
gfx.drawText(x, y, 'Score: 100', 'white', 'blue');

// Clear screen
gfx.clear();

// Clear with color
gfx.clear('black');
```

## Box Drawing

```typescript
// Draw box with border
gfx.drawBox(x, y, width, height, {
  borderColor: 'white',
  fillColor: 'blue',
  borderStyle: 'single'   // single, double, rounded, ascii
});

// Box with title
gfx.drawBox(x, y, 30, 10, {
  title: ' Menu ',
  borderColor: 'cyan'
});

// Filled rectangle (no border)
gfx.fillRect(x, y, width, height, 'red');
```

## Border Styles

| Style | Characters |
|-------|------------|
| `single` | `+--+`, `|  |` |
| `double` | `+==+`, `|  |` (Unicode) |
| `rounded` | Rounded corners |
| `ascii` | Basic ASCII only |

## Sprites

```typescript
// Create sprite from string array
const playerSprite = gfx.createSprite({
  id: 'player',
  frames: [
    ['  O  ', ' /|\\ ', ' / \\ '],  // Frame 1
    ['  O  ', ' \\|/ ', ' / \\ ']   // Frame 2
  ],
  x: 40,
  y: 12,
  color: 'cyan'
});

// Update sprite position
gfx.setSpritePosition('player', 45, 12);

// Animate sprite
gfx.setSpriteFrame('player', 1);

// Remove sprite
gfx.removeSprite('player');

// Get sprite info
const sprite = gfx.getSprite('player');
```

## Animated Sprites

```typescript
// Create auto-animating sprite
const explosion = gfx.createSprite({
  id: 'explosion',
  frames: explosionFrames,  // Array of frames
  x: 20, y: 10,
  animated: true,
  frameRate: 12,           // Frames per second
  loop: false              // Stop after one cycle
});

// Control animation
gfx.pauseAnimation('explosion');
gfx.resumeAnimation('explosion');
gfx.resetAnimation('explosion');
```

## Parallax Scrolling

```typescript
// Add background layer (scrolls slow)
gfx.addParallaxLayer({
  id: 'mountains',
  content: mountainArt,    // String array
  speed: 0.2,              // Scroll speed multiplier
  y: 0
});

// Add midground layer
gfx.addParallaxLayer({
  id: 'trees',
  content: treeArt,
  speed: 0.5,
  y: 10
});

// Add foreground layer (scrolls fast)
gfx.addParallaxLayer({
  id: 'ground',
  content: groundArt,
  speed: 1.0,
  y: 20
});

// Scroll all layers
gfx.scrollParallax(5);  // Scroll 5 units right

// Remove layer
gfx.removeParallaxLayer('mountains');
```

## Particle Systems

```typescript
// Create particle emitter
gfx.createParticleSystem({
  id: 'sparks',
  x: 40, y: 12,
  count: 20,               // Particles to spawn
  lifetime: 1000,          // Particle life in ms
  speed: { min: 1, max: 3 },
  direction: { min: 0, max: 360 },  // Degrees
  gravity: 0.1,
  color: ['yellow', 'red', 'orange'],  // Random from list
  char: '*'
});

// Burst particles
gfx.emitParticles('sparks', 10);  // Emit 10 particles

// Continuous emission
gfx.startEmitter('sparks');
gfx.stopEmitter('sparks');

// Remove system
gfx.removeParticleSystem('sparks');
```

## Cutscenes

```typescript
// Play cutscene (sequence of frames)
await gfx.playCutscene({
  frames: [
    { art: frame1Art, duration: 2000, text: 'Chapter 1' },
    { art: frame2Art, duration: 2000, text: 'The Beginning...' },
    { art: frame3Art, duration: 3000 }
  ],
  textPosition: 'bottom',
  textColor: 'white',
  skipKey: 'space',        // Allow skip with space
  fadeIn: true,
  fadeOut: true
});

// Check if cutscene playing
const playing = gfx.isCutscenePlaying();

// Skip current cutscene
gfx.skipCutscene();
```

## Rendering

```typescript
// Update all animations/particles (call each frame)
gfx.update(deltaTime);

// Get rendered buffer as string
const output = gfx.render();

// Get as array of lines
const lines = gfx.renderLines();

// Render to output callback
gfx.renderTo((output) => {
  process.stdout.write(output);
});
```

## Colors

| Color | ANSI Code |
|-------|-----------|
| `black` | 30 |
| `red` | 31 |
| `green` | 32 |
| `yellow` | 33 |
| `blue` | 34 |
| `magenta` | 35 |
| `cyan` | 36 |
| `white` | 37 |

Bright variants: `brightRed`, `brightGreen`, etc.

## Utility Functions

```typescript
// Get screen dimensions
const { width, height } = gfx.getSize();

// Resize screen
gfx.resize(100, 30);

// Get character at position
const { char, fg, bg } = gfx.getCell(x, y);

// Check if position is in bounds
const valid = gfx.inBounds(x, y);
```

## Events

```typescript
gfx.on('spriteCollision', (sprite1Id, sprite2Id) => { });
gfx.on('animationComplete', (spriteId) => { });
gfx.on('particleSystemComplete', (systemId) => { });
gfx.on('cutsceneComplete', () => { });
gfx.on('cutsceneSkipped', () => { });
```

## Example: Side-Scroller

```typescript
const gfx = new GraphicsEngine(80, 24);

// Setup parallax background
gfx.addParallaxLayer({ id: 'sky', content: skyArt, speed: 0.1, y: 0 });
gfx.addParallaxLayer({ id: 'mountains', content: mountainArt, speed: 0.3, y: 5 });
gfx.addParallaxLayer({ id: 'ground', content: groundArt, speed: 1.0, y: 20 });

// Player sprite
gfx.createSprite({
  id: 'player',
  frames: playerFrames,
  x: 10, y: 18,
  animated: true,
  frameRate: 8
});

// Game loop
function gameLoop() {
  gfx.scrollParallax(1);
  gfx.update(16);
  const output = gfx.render();
  process.stdout.write('\x1b[H' + output);  // Move cursor home + draw
  setTimeout(gameLoop, 16);
}
```

## Cleanup

```typescript
gfx.dispose();  // Clear all resources
```
