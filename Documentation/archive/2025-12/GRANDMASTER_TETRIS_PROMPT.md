# GRANDMASTER - Next-Gen Multiplayer BBS Tetris

## The Vision

**GRANDMASTER** isn't just a Tetris clone - it's a **cinematic competitive experience** that pushes terminal gaming beyond what anyone thought possible. Inspired by TGM3's legendary mechanics but evolved with modern multiplayer, progression systems, and visual spectacle that rivals graphical games.

This is the game that makes people say: *"I can't believe this runs in a terminal."*

---

## Core Philosophy

1. **Every Frame Matters** - 60 FPS gameplay, sub-16ms input latency, butter-smooth animations
2. **Cinematic Moments** - Screen shake, particle explosions, dramatic transitions, emotional audio
3. **Endless Depth** - TGM3 mechanics provide years of skill ceiling
4. **Social Competition** - Rankings, tournaments, spectating, rivalries, clans
5. **Rewarding Progression** - Unlocks, achievements, seasons, cosmetics
6. **Pure ANSI Art** - Every pixel is a colored block, zero ASCII - terminal as canvas

---

## The GRANDMASTER Experience

### Boot Sequence

When GRANDMASTER launches, players don't just see a menu - they experience an **attract sequence**:

```
[Screen fades from black]

                    ████████╗███████╗████████╗██████╗ ██╗███████╗
                    ╚══██╔══╝██╔════╝╚══██╔══╝██╔══██╗██║██╔════╝
                       ██║   █████╗     ██║   ██████╔╝██║███████╗
                       ██║   ██╔══╝     ██║   ██╔══██╗██║╚════██║
                       ██║   ███████╗   ██║   ██║  ██║██║███████║
                       ╚═╝   ╚══════╝   ╚═╝   ╚═╝  ╚═╝╚═╝╚══════╝

                    ██████╗ ██████╗  █████╗ ███╗   ██╗██████╗
                    ██╔════╝ ██╔══██╗██╔══██╗████╗  ██║██╔══██╗
                    ██║  ███╗██████╔╝███████║██╔██╗ ██║██║  ██║
                    ██║   ██║██╔══██╗██╔══██║██║╚██╗██║██║  ██║
                    ╚██████╔╝██║  ██║██║  ██║██║ ╚████║██████╔╝
                     ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚═════╝

                    ███╗   ███╗ █████╗ ███████╗████████╗███████╗██████╗
                    ████╗ ████║██╔══██╗██╔════╝╚══██╔══╝██╔════╝██╔══██╗
                    ██╔████╔██║███████║███████╗   ██║   █████╗  ██████╔╝
                    ██║╚██╔╝██║██╔══██║╚════██║   ██║   ██╔══╝  ██╔══██╗
                    ██║ ╚═╝ ██║██║  ██║███████║   ██║   ███████╗██║  ██║
                    ╚═╝     ╚═╝╚═╝  ╚═╝╚══════╝   ╚═╝   ╚══════╝╚═╝  ╚═╝

[Pieces fall from top, building a perfect stack, then TETRIS - rainbow explosion]
[Logo pulses with gradient animation]

                              PRESS ANY KEY TO BEGIN

                    [Demo gameplay loop plays in background]
                    Current Champion: SPOT [GM] - 999 @ 12:34.56
```

### Attract Mode Demo

While idle, the game shows:
- AI playing at GM level with flashy moves
- Recent highlights from top players
- Upcoming tournament announcements
- Leaderboard scrolling
- Tips and tricks rotating

---

## Visual Effects System

### Screen Shake Engine

```typescript
interface ShakeConfig {
  intensity: number;      // Pixels of displacement
  duration: number;       // Milliseconds
  decay: 'linear' | 'exponential' | 'bounce';
  direction: 'horizontal' | 'vertical' | 'circular' | 'random';
}

const SHAKE_PRESETS = {
  // Subtle feedback
  pieceLock: { intensity: 1, duration: 50, decay: 'linear', direction: 'vertical' },

  // Medium impact
  lineClear: { intensity: 2, duration: 100, decay: 'exponential', direction: 'horizontal' },

  // Heavy impact
  tetris: { intensity: 4, duration: 200, decay: 'bounce', direction: 'circular' },

  // Devastating
  perfectClear: { intensity: 6, duration: 400, decay: 'bounce', direction: 'random' },

  // Incoming attack
  garbageReceive: { intensity: 3, duration: 150, decay: 'exponential', direction: 'vertical' },

  // Critical moment
  topOut: { intensity: 8, duration: 600, decay: 'exponential', direction: 'random' },
};

class ScreenShaker {
  private offsetX = 0;
  private offsetY = 0;
  private shakeQueue: ShakeInstance[] = [];

  shake(preset: keyof typeof SHAKE_PRESETS) {
    this.shakeQueue.push(new ShakeInstance(SHAKE_PRESETS[preset]));
  }

  update(deltaTime: number) {
    // Combine all active shakes
    this.offsetX = 0;
    this.offsetY = 0;

    this.shakeQueue = this.shakeQueue.filter(shake => {
      const offset = shake.update(deltaTime);
      this.offsetX += offset.x;
      this.offsetY += offset.y;
      return !shake.isDone();
    });
  }

  applyToScreen(screen: BlessedScreen) {
    // Offset all elements by shake amount
    screen.program.move(Math.round(this.offsetX), Math.round(this.offsetY));
  }
}
```

### Particle Explosion System

```typescript
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  char: string;
  color: string;
  gravity: number;
  friction: number;
  fadeOut: boolean;
  trail: boolean;
}

const PARTICLE_PRESETS = {
  // Line clear - horizontal burst
  lineClear: {
    count: 20,
    spread: { x: 3, y: 0.5 },
    speed: 4,
    life: 15,
    chars: ['█', '▓', '▒', '░'],
    colors: ['white', 'cyan', 'blue'],
    gravity: 0.1,
    friction: 0.95,
  },

  // Tetris - massive explosion
  tetris: {
    count: 80,
    spread: { x: 5, y: 3 },
    speed: 6,
    life: 30,
    chars: ['█', '▓', '▒', '░', '✦', '✧', '◆', '◇'],
    colors: ['red', 'yellow', 'green', 'cyan', 'blue', 'magenta'],
    gravity: 0.15,
    friction: 0.92,
    trail: true,
  },

  // Perfect Clear - screen-filling celebration
  perfectClear: {
    count: 200,
    spread: { x: 40, y: 12 },
    speed: 8,
    life: 60,
    chars: ['█', '▓', '✦', '✧', '★', '☆'],
    colors: ['#FFD700', '#FFA500', '#FF6347', '#FF1493', '#00CED1'],
    gravity: 0.05,
    friction: 0.98,
    trail: true,
  },

  // Grade up - rising sparkles
  gradeUp: {
    count: 40,
    spread: { x: 2, y: 0 },
    speed: 3,
    life: 40,
    chars: ['✦', '✧', '◆', '★'],
    colors: ['yellow', 'white', 'cyan'],
    gravity: -0.1,  // Float upward
    friction: 0.99,
  },

  // Pickup spawn - materializing
  pickupSpawn: {
    count: 12,
    spread: { x: 0, y: 0 },
    speed: 2,
    life: 20,
    chars: ['◆', '◇', '✦'],
    colors: ['yellow', 'white'],
    gravity: 0,
    friction: 0.9,
    pattern: 'circular',
  },

  // Attack sent - aggressive burst toward opponent
  attackSent: {
    count: 30,
    spread: { x: 0.5, y: 0.5 },
    speed: 8,
    life: 25,
    chars: ['►', '▶', '→', '»'],
    colors: ['red', 'orange', 'yellow'],
    gravity: 0,
    friction: 0.99,
    direction: 'right',
  },

  // Elimination - dramatic death
  elimination: {
    count: 150,
    spread: { x: 6, y: 4 },
    speed: 5,
    life: 50,
    chars: ['█', '▓', '▒', '░', 'X'],
    colors: ['red', 'darkred', 'black'],
    gravity: 0.2,
    friction: 0.94,
  },
};

class ParticleEngine {
  private particles: Particle[] = [];
  private maxParticles = 500;

  emit(preset: keyof typeof PARTICLE_PRESETS, x: number, y: number) {
    const config = PARTICLE_PRESETS[preset];

    for (let i = 0; i < config.count && this.particles.length < this.maxParticles; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = config.speed * (0.5 + Math.random() * 0.5);

      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed * config.spread.x,
        vy: Math.sin(angle) * speed * config.spread.y,
        life: config.life * (0.8 + Math.random() * 0.4),
        maxLife: config.life,
        char: config.chars[Math.floor(Math.random() * config.chars.length)],
        color: config.colors[Math.floor(Math.random() * config.colors.length)],
        gravity: config.gravity,
        friction: config.friction,
        fadeOut: true,
        trail: config.trail || false,
      });
    }
  }

  update(deltaTime: number) {
    this.particles = this.particles.filter(p => {
      p.x += p.vx * deltaTime * 60;
      p.y += p.vy * deltaTime * 60;
      p.vy += p.gravity;
      p.vx *= p.friction;
      p.vy *= p.friction;
      p.life--;
      return p.life > 0;
    });
  }

  render(graphics: Graphics) {
    for (const p of this.particles) {
      const alpha = p.fadeOut ? p.life / p.maxLife : 1;
      const colorCode = this.getColorWithAlpha(p.color, alpha);
      graphics.drawChar(Math.round(p.x), Math.round(p.y), p.char, colorCode);
    }
  }
}
```

### 5-Piece Preview Queue (Inspired by Apotris)

```
NEXT QUEUE (5 pieces visible)
.-----.
|  I  |  <- Next piece (large, prominent)
|  I  |
|  I  |
|  I  |
'-----'
.----.
| ██ |  <- Preview 2
| ██ |
'----'
.----.
| ██ |  <- Preview 3
| █  |
'----'
.----.
|  ██|  <- Preview 4
| ██ |
'----'
.----.
| █  |  <- Preview 5
| ███|
'----'
```

```typescript
interface PreviewQueue {
  size: number;           // 1-6 pieces visible (default 5)
  showPieceColors: boolean;
  showPieceNames: boolean;
  animateNewPiece: boolean;
}

class PreviewQueueRenderer {
  private queue: PieceType[] = [];
  private animatingIndex: number = -1;

  // Render with distinct sound per piece type
  render(graphics: Graphics, x: number, y: number) {
    for (let i = 0; i < this.queue.length; i++) {
      const piece = this.queue[i];
      const pieceY = y + i * 4;  // 4 rows per piece slot

      // First piece is larger (active next)
      const scale = i === 0 ? 1.0 : 0.8;

      // Animate new piece sliding in
      if (i === this.animatingIndex) {
        const offset = this.getAnimationOffset();
        this.renderPiece(graphics, x + offset, pieceY, piece, scale);
      } else {
        this.renderPiece(graphics, x, pieceY, piece, scale);
      }
    }
  }

  // Play distinct sound when piece enters queue (TGM3 style)
  onNewPieceGenerated(pieceType: PieceType) {
    this.sounds.playPiecePreview(pieceType);  // SEB_mino1-7
    this.animatingIndex = this.queue.length - 1;
    this.startSlideAnimation();
  }
}
```

### Hold Piece System

```
HOLD PIECE
.-------.
|       |
|  ████ |  <- Currently held piece
|       |
'-------'
   [C]     <- Hold key indicator

States:
- Empty:     No piece held (gray "HOLD" text)
- Available: Piece held, can swap (bright colors)
- Used:      Already swapped this turn (dimmed, locked)
```

```typescript
interface HoldSystem {
  heldPiece: PieceType | null;
  canHold: boolean;        // Reset on piece lock
  holdUsedThisTurn: boolean;
}

class HoldPieceManager {
  private heldPiece: PieceType | null = null;
  private canHold: boolean = true;

  hold(currentPiece: PieceType): PieceType | null {
    if (!this.canHold) {
      this.sounds.play('holdFail');  // Buzz sound
      return null;  // Already used hold this turn
    }

    const previousHeld = this.heldPiece;
    this.heldPiece = currentPiece;
    this.canHold = false;  // Lock until next piece

    this.sounds.play('hold');  // Swap sound
    this.playHoldAnimation();

    return previousHeld;  // Return piece to play (or null for new piece)
  }

  onPieceLocked() {
    this.canHold = true;  // Reset hold availability
  }

  render(graphics: Graphics, x: number, y: number) {
    // Draw hold box
    graphics.drawBox(x, y, 9, 5, 'HOLD', this.canHold ? 'white' : 'gray');

    if (this.heldPiece) {
      const opacity = this.canHold ? 1.0 : 0.4;  // Dim when used
      this.renderPiece(graphics, x + 2, y + 1, this.heldPiece, opacity);
    }
  }
}
```

### Apotris-Inspired Visual Effects

#### Glow System (Per-Cell Intensity Tracking)

```typescript
// 2D glow array tracks intensity for each cell
class GlowSystem {
  private glowGrid: number[][] = [];  // 0.0 to 1.0 intensity per cell
  private readonly DECAY_RATE = 0.92;  // Glow fades each frame

  // Add glow when piece locks (PlaceEffect from Apotris)
  onPieceLock(cells: Cell[]) {
    for (const cell of cells) {
      this.glowGrid[cell.y][cell.x] = 1.0;  // Full intensity
    }
    // Also flash adjacent cells at lower intensity
    for (const cell of cells) {
      this.addAdjacentGlow(cell.x, cell.y, 0.3);
    }
  }

  // Add glow on line clear
  onLineClear(lines: number[]) {
    for (const y of lines) {
      for (let x = 0; x < 10; x++) {
        this.glowGrid[y][x] = 1.5;  // Extra bright for clears
      }
    }
  }

  update() {
    for (let y = 0; y < 24; y++) {
      for (let x = 0; x < 10; x++) {
        this.glowGrid[y][x] *= this.DECAY_RATE;
        if (this.glowGrid[y][x] < 0.01) {
          this.glowGrid[y][x] = 0;
        }
      }
    }
  }

  render(graphics: Graphics) {
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 10; x++) {
        const glow = this.glowGrid[y][x];
        if (glow > 0) {
          // Apply glow overlay (brighter color)
          graphics.addGlowOverlay(x * 2, y, glow);
        }
      }
    }
  }
}
```

#### PlaceEffect (Lock Animation - 12 Frames)

```typescript
// Apotris-style 12-frame lock animation
class PlaceEffect {
  private activeEffects: LockEffect[] = [];

  onPieceLock(cells: Cell[], pieceType: PieceType) {
    this.activeEffects.push({
      cells: cells,
      frame: 0,
      maxFrames: 12,
      color: PIECE_COLORS[pieceType],
    });
  }

  update() {
    this.activeEffects = this.activeEffects.filter(effect => {
      effect.frame++;
      return effect.frame < effect.maxFrames;
    });
  }

  render(graphics: Graphics) {
    for (const effect of this.activeEffects) {
      const progress = effect.frame / effect.maxFrames;

      for (const cell of effect.cells) {
        // Flash white then fade to piece color
        const flashIntensity = 1.0 - progress;
        const color = this.blendColor(
          'white',
          effect.color,
          flashIntensity
        );

        // Expand slightly then contract
        const scale = 1.0 + Math.sin(progress * Math.PI) * 0.1;

        graphics.drawBlock(
          cell.x * 2,
          cell.y,
          color,
          scale
        );
      }
    }
  }
}
```

#### Line Clear Animation (Center-Out or Alternating)

```typescript
type LineClearStyle = 'center_out' | 'alternating' | 'cascade' | 'explode';

class LineClearAnimation {
  private clearingLines: LineClearEffect[] = [];

  startClear(lines: number[], style: LineClearStyle = 'center_out') {
    for (const lineY of lines) {
      this.clearingLines.push({
        y: lineY,
        frame: 0,
        maxFrames: 20,
        style: style,
        cells: this.getCellsInLine(lineY),
      });
    }
  }

  update() {
    this.clearingLines = this.clearingLines.filter(line => {
      line.frame++;
      return line.frame < line.maxFrames;
    });
  }

  render(graphics: Graphics) {
    for (const line of this.clearingLines) {
      const progress = line.frame / line.maxFrames;

      switch (line.style) {
        case 'center_out':
          this.renderCenterOut(graphics, line, progress);
          break;
        case 'alternating':
          this.renderAlternating(graphics, line, progress);
          break;
        case 'cascade':
          this.renderCascade(graphics, line, progress);
          break;
        case 'explode':
          this.renderExplode(graphics, line, progress);
          break;
      }
    }
  }

  private renderCenterOut(graphics: Graphics, line: LineClearEffect, progress: number) {
    // Clear from center toward edges
    const centerX = 5;
    const clearRadius = Math.floor(progress * 5);

    for (let x = 0; x < 10; x++) {
      const distFromCenter = Math.abs(x - centerX);
      if (distFromCenter <= clearRadius) {
        // This cell is being cleared
        const cellProgress = (clearRadius - distFromCenter) / 5;
        graphics.drawBlock(
          x * 2, line.y,
          'white',
          1.0 - cellProgress  // Shrink as it clears
        );
      } else {
        // Not yet cleared, flash
        graphics.drawBlock(x * 2, line.y, line.cells[x].color, 1.0);
      }
    }
  }
}
```

#### Zone Flash Effect

```typescript
// Full-screen flash on big clears
class ZoneFlashEffect {
  private flashIntensity = 0;
  private flashColor = 'white';

  trigger(type: 'tetris' | 'tspin' | 'perfect_clear' | 'combo_break') {
    const FLASH_INTENSITIES = {
      tetris: 0.3,
      tspin: 0.25,
      perfect_clear: 0.8,
      combo_break: 0.15,
    };

    const FLASH_COLORS = {
      tetris: 'cyan',
      tspin: 'magenta',
      perfect_clear: 'gold',
      combo_break: 'white',
    };

    this.flashIntensity = FLASH_INTENSITIES[type];
    this.flashColor = FLASH_COLORS[type];
  }

  update() {
    this.flashIntensity *= 0.85;  // Rapid decay
    if (this.flashIntensity < 0.01) {
      this.flashIntensity = 0;
    }
  }

  render(graphics: Graphics) {
    if (this.flashIntensity > 0) {
      graphics.fillScreen(this.flashColor, this.flashIntensity);
    }
  }
}
```

#### Frame Snow Effect (Apotris Style)

```typescript
// Ambient particle effect for atmosphere
class FrameSnowEffect {
  private particles: SnowParticle[] = [];
  private enabled = true;
  private intensity = 1.0;  // Increases with game speed

  constructor() {
    // Pre-generate particles
    for (let i = 0; i < 50; i++) {
      this.particles.push(this.createParticle());
    }
  }

  private createParticle(): SnowParticle {
    return {
      x: Math.random() * 80,
      y: Math.random() * -10,
      speed: 0.2 + Math.random() * 0.3,
      char: Math.random() > 0.5 ? '.' : ',',
      color: Math.random() > 0.7 ? 'white' : 'gray',
    };
  }

  setIntensity(gravity: number) {
    // More snow at higher speeds
    this.intensity = 1.0 + gravity * 0.5;
  }

  update() {
    if (!this.enabled) return;

    for (const p of this.particles) {
      p.y += p.speed * this.intensity;
      p.x += Math.sin(p.y * 0.1) * 0.1;  // Gentle sway

      if (p.y > 24) {
        // Reset at top
        p.y = -1;
        p.x = Math.random() * 80;
      }
    }
  }

  render(graphics: Graphics) {
    if (!this.enabled) return;

    for (const p of this.particles) {
      if (p.y >= 0 && p.y < 24) {
        graphics.drawChar(Math.floor(p.x), Math.floor(p.y), p.char, p.color);
      }
    }
  }
}
```

#### Physics-Based Screen Shake (Apotris Style)

```typescript
// More sophisticated shake system with physics
class PhysicsScreenShake {
  private offsetX = 0;
  private offsetY = 0;
  private velocityX = 0;
  private velocityY = 0;
  private damping = 0.85;
  private springStrength = 0.3;

  // Apply impulse (replaces preset-based system)
  shake(intensity: number, angle: number = Math.random() * Math.PI * 2) {
    this.velocityX += Math.cos(angle) * intensity;
    this.velocityY += Math.sin(angle) * intensity;
  }

  // Presets using physics
  pieceLock() { this.shake(1, Math.PI / 2); }  // Down
  lineClear(count: number) { this.shake(count * 1.5, Math.random() * Math.PI * 2); }
  tetris() { this.shake(4, Math.PI / 2); }
  perfectClear() { this.shake(8, Math.random() * Math.PI * 2); }
  garbageReceive(lines: number) { this.shake(lines, -Math.PI / 2); }  // Up

  update(deltaTime: number) {
    // Spring physics: pull back to center
    this.velocityX -= this.offsetX * this.springStrength;
    this.velocityY -= this.offsetY * this.springStrength;

    // Apply velocity
    this.offsetX += this.velocityX * deltaTime * 60;
    this.offsetY += this.velocityY * deltaTime * 60;

    // Damping
    this.velocityX *= this.damping;
    this.velocityY *= this.damping;
  }

  getOffset(): { x: number; y: number } {
    return {
      x: Math.round(this.offsetX),
      y: Math.round(this.offsetY),
    };
  }
}
```

### Background Effects

```typescript
// Matrix-style falling code rain in empty board areas
class MatrixRain {
  private columns: RainColumn[] = [];

  constructor(width: number, height: number) {
    for (let x = 0; x < width; x += 2) {
      this.columns.push(new RainColumn(x, height));
    }
  }

  update(deltaTime: number, gameIntensity: number) {
    // Rain speed increases with game intensity
    const speed = 0.5 + gameIntensity * 1.5;

    this.columns.forEach(col => col.update(deltaTime, speed));
  }

  render(graphics: Graphics, boardMask: boolean[][]) {
    // Only render in empty cells
    this.columns.forEach(col => {
      col.render(graphics, boardMask);
    });
  }
}

// Scanline effect for retro feel
class ScanlineEffect {
  private offset = 0;
  private enabled = true;
  private intensity = 0.15;

  update(deltaTime: number) {
    this.offset = (this.offset + deltaTime * 30) % 4;
  }

  apply(graphics: Graphics) {
    if (!this.enabled) return;

    for (let y = Math.floor(this.offset); y < graphics.height; y += 4) {
      for (let x = 0; x < graphics.width; x++) {
        graphics.darken(x, y, this.intensity);
      }
    }
  }
}

// Vignette effect - darkens edges for focus
class VignetteEffect {
  render(graphics: Graphics) {
    const cx = graphics.width / 2;
    const cy = graphics.height / 2;
    const maxDist = Math.sqrt(cx * cx + cy * cy);

    for (let y = 0; y < graphics.height; y++) {
      for (let x = 0; x < graphics.width; x++) {
        const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        const factor = Math.pow(dist / maxDist, 2) * 0.4;
        graphics.darken(x, y, factor);
      }
    }
  }
}

// Heat distortion at high speeds
class HeatDistortion {
  private phase = 0;

  update(deltaTime: number, speed: number) {
    // More distortion at higher speeds
    this.phase += deltaTime * speed * 0.1;
  }

  apply(graphics: Graphics, intensity: number) {
    if (intensity < 0.1) return;

    for (let y = 0; y < graphics.height; y++) {
      const offset = Math.sin(y * 0.5 + this.phase) * intensity * 2;
      graphics.shiftRow(y, Math.round(offset));
    }
  }
}
```

### Transition System

```typescript
type TransitionType =
  | 'fade'           // Fade to black
  | 'wipe_left'      // Wipe from right to left
  | 'wipe_right'     // Wipe from left to right
  | 'wipe_down'      // Wipe from top to bottom
  | 'dissolve'       // Random pixel dissolve
  | 'pixelate'       // Pixelate then unpixelate
  | 'zoom_in'        // Zoom into center
  | 'zoom_out'       // Zoom out from center
  | 'shatter'        // Screen shatters into pieces
  | 'glitch'         // Digital glitch effect
  | 'tetris_fall';   // Pieces fall from top covering screen

class TransitionEngine {
  private currentTransition: Transition | null = null;
  private transitionBuffer: Graphics;

  async transition(
    type: TransitionType,
    duration: number,
    callback: () => void
  ): Promise<void> {
    // Capture current screen
    this.transitionBuffer = this.captureScreen();

    // Execute callback (switch screens)
    callback();

    // Play transition animation
    const transition = this.createTransition(type, duration);

    return new Promise(resolve => {
      transition.onComplete = resolve;
      this.currentTransition = transition;
    });
  }

  private createTransition(type: TransitionType, duration: number): Transition {
    switch (type) {
      case 'shatter':
        return new ShatterTransition(this.transitionBuffer, duration);
      case 'tetris_fall':
        return new TetrisFallTransition(this.transitionBuffer, duration);
      case 'glitch':
        return new GlitchTransition(this.transitionBuffer, duration);
      // ... etc
    }
  }
}

// Example: Tetris Fall transition
class TetrisFallTransition {
  private pieces: FallingPiece[] = [];
  private progress = 0;

  constructor(private buffer: Graphics, private duration: number) {
    // Divide screen into tetromino-shaped pieces
    this.generatePieces();
  }

  update(deltaTime: number) {
    this.progress += deltaTime / this.duration;

    this.pieces.forEach((piece, i) => {
      // Stagger the fall
      const delay = i * 0.02;
      const localProgress = Math.max(0, this.progress - delay);

      piece.y = piece.startY + localProgress * localProgress * 50;
      piece.rotation += piece.rotationSpeed * deltaTime;
    });

    return this.progress >= 1.5;  // Extra time for pieces to fall off
  }

  render(graphics: Graphics) {
    this.pieces.forEach(piece => {
      if (piece.y < graphics.height + 10) {
        piece.render(graphics);
      }
    });
  }
}
```

---

## Audio Design

### Tracker Music Engine (libopenmpt)

GRANDMASTER uses the SDK's **TrackerEngine** for authentic retro music playback. This engine supports 50+ tracker formats with perfect reproduction of classic tracker sounds.

```typescript
import { TrackerEngine, InterpolationFilter, PlaybackState } from '@amiexpress/bbs-door-sdk/engines/audio';

class GrandmasterMusic {
  private tracker: TrackerEngine;
  private currentTrack: string | null = null;

  // Track library by game state
  private readonly TRACKS = {
    menu: '/music/grandmaster_menu.mod',           // Chill menu vibes
    master_0_300: '/music/gm_master_intro.xm',     // Building energy
    master_300_600: '/music/gm_master_mid.xm',     // Increasing tempo
    master_600_900: '/music/gm_master_high.xm',    // High intensity
    master_20g: '/music/gm_20g_crisis.it',         // 20G panic mode
    shirase: '/music/gm_shirase_death.s3m',        // Death mode intensity
    sprint: '/music/gm_sprint_race.xm',            // Speed run energy
    versus: '/music/gm_versus_battle.mod',         // Competitive tension
    royale: '/music/gm_royale_chaos.it',           // Battle Royale mayhem
    boss: '/music/gm_boss_epic.it',                // Epic boss fight
    victory: '/music/gm_victory.mod',              // Celebration
    defeat: '/music/gm_defeat.mod',                // Somber defeat
    credits: '/music/gm_credits.xm',               // Credits roll
  };

  constructor() {
    this.tracker = new TrackerEngine({
      repeatCount: -1,                              // Loop forever
      stereoSeparation: 100,                        // Normal stereo
      interpolationFilter: InterpolationFilter.Sinc8,  // High quality
      volume: 0.8,
    });

    // Track pattern/row for synchronized effects
    this.tracker.on('progress', (pos) => {
      this.onBeat(pos.pattern, pos.row);
    });

    this.tracker.on('ended', () => {
      this.onTrackEnd();
    });
  }

  async setGameState(state: GameState) {
    const newTrack = this.selectTrack(state);

    if (newTrack !== this.currentTrack) {
      await this.crossfade(newTrack, 500);
    }

    // Adjust tempo based on gravity
    const tempoFactor = 1.0 + (state.gravity / 20) * 0.3;  // Up to 30% faster at 20G
    this.tracker.setTempo(Math.min(tempoFactor, 1.5));
  }

  private selectTrack(state: GameState): string {
    if (state.mode === 'master') {
      if (state.gravity >= 20) return this.TRACKS.master_20g;
      if (state.level >= 600) return this.TRACKS.master_600_900;
      if (state.level >= 300) return this.TRACKS.master_300_600;
      return this.TRACKS.master_0_300;
    }

    return this.TRACKS[state.mode] || this.TRACKS.menu;
  }

  private async crossfade(newTrack: string, durationMs: number) {
    // Fade out current
    const fadeSteps = 10;
    const stepTime = durationMs / fadeSteps / 2;

    for (let i = 10; i >= 0; i--) {
      this.tracker.setVolume(i / 10 * 0.8);
      await this.sleep(stepTime);
    }

    // Load and start new track
    await this.tracker.load(newTrack);
    this.currentTrack = newTrack;

    // Fade in
    for (let i = 0; i <= 10; i++) {
      this.tracker.setVolume(i / 10 * 0.8);
      await this.sleep(stepTime);
    }
  }

  // Synchronize visual effects with music beat
  private onBeat(pattern: number, row: number) {
    // Flash on downbeats (every 16 rows typically)
    if (row % 16 === 0) {
      this.emit('downbeat');
    }
    // Pulse on 4th notes
    if (row % 4 === 0) {
      this.emit('beat');
    }
  }

  // Module metadata for display
  getTrackInfo(): { title: string; tracker: string } | null {
    const meta = this.tracker.metadata;
    return meta ? { title: meta.title, tracker: meta.tracker } : null;
  }
}
```

### TGM3 Authentic Sound Effects

Each piece type has its own distinct preview sound, exactly like TGM3:

```typescript
// TGM3 piece preview sounds - each piece has unique audio signature
const PIECE_PREVIEW_SOUNDS = {
  // SEB_mino1 through SEB_mino7 - distinct for each piece
  I: { frequency: 523.25, duration: 0.08, waveform: 'square' },   // C5 - Bright, long piece
  O: { frequency: 392.00, duration: 0.06, waveform: 'sine' },     // G4 - Solid, stable
  T: { frequency: 440.00, duration: 0.07, waveform: 'triangle' }, // A4 - Versatile
  S: { frequency: 329.63, duration: 0.06, waveform: 'sawtooth' }, // E4 - Snaky
  Z: { frequency: 349.23, duration: 0.06, waveform: 'sawtooth' }, // F4 - Opposite of S
  J: { frequency: 293.66, duration: 0.07, waveform: 'square' },   // D4 - Deep blue
  L: { frequency: 587.33, duration: 0.07, waveform: 'square' },   // D5 - Bright orange
};

// Additional TGM3 authentic sounds
const TGM_SOUNDS = {
  // Piece placement
  lock: { freq: 200, dur: 0.05, wave: 'noise', decay: 0.03 },        // SEB_instal
  hardDrop: { freq: 150, dur: 0.08, wave: 'noise', decay: 0.05 },    // Hard lock thump

  // Rotation
  rotate: { freq: 600, dur: 0.03, wave: 'square' },                   // SEB_turn
  rotateWallkick: { freq: 700, dur: 0.05, wave: 'square' },           // Wallkick success
  rotateFail: { freq: 100, dur: 0.02, wave: 'noise' },                // Rotation blocked

  // IRS/IHS (Initial Rotation/Hold System)
  irs: { freq: 800, dur: 0.04, wave: 'sine' },                        // SEB_prerotate
  ihs: { freq: 750, dur: 0.04, wave: 'sine' },                        // Pre-hold sound

  // Line clear sounds (vary by line count)
  lineClear1: { freq: 400, dur: 0.1, sweep: 600 },                    // Single
  lineClear2: { freq: 500, dur: 0.12, sweep: 800 },                   // Double
  lineClear3: { freq: 600, dur: 0.15, sweep: 1000 },                  // Triple
  lineClear4: { freq: 700, dur: 0.2, sweep: 1400 },                   // TETRIS! (SEB_disappear)

  // Section feedback
  sectionCool: { melody: [800, 1000, 1200, 1600], dur: 0.1 },         // SEB_cool - ascending
  sectionRegret: { melody: [600, 500, 400, 300], dur: 0.1 },          // SEB_regret - descending

  // Grade up fanfare (layered)
  gradeUp: {
    base: { freq: 400, dur: 0.3, wave: 'sine' },
    harmony: { freq: 500, dur: 0.3, wave: 'sine' },
    fifth: { freq: 600, dur: 0.3, wave: 'sine' },
  },

  // Danger warnings
  danger: { freq: 200, dur: 0.5, wave: 'square', pulseRate: 8 },      // Danger zone pulse
  twentyGSiren: { freq: 800, dur: 2.0, sweep: 400, oscillate: true }, // 20G warning siren

  // Ready/Go countdown
  ready: { freq: 600, dur: 0.2, wave: 'sine' },                       // "Ready"
  go: { freq: 800, dur: 0.3, wave: 'square', reverb: true },          // "Go!"

  // Multiplayer
  attackSend: { freq: 500, dur: 0.1, sweep: 800 },                    // Sending garbage
  attackReceive: { freq: 300, dur: 0.15, sweep: 150 },                // Receiving garbage
  eliminated: { melody: [600, 400, 300, 200], dur: 0.15 },            // Player eliminated

  // Perfect clear (epic)
  perfectClear: {
    flash: { freq: 1000, dur: 0.05 },
    sweep: { freq: 200, dur: 0.5, sweep: 2000 },
    chord: { freqs: [523, 659, 784, 1047], dur: 0.8 },  // C major chord
  },

  // T-Spin (satisfying crunch)
  tSpin: { freq: 400, dur: 0.15, wave: 'sawtooth', distort: 0.3 },
  tSpinMini: { freq: 350, dur: 0.1, wave: 'sawtooth', distort: 0.2 },

  // Combo escalation
  combo: (count: number) => ({
    freq: 300 + count * 50,  // Pitch rises with combo
    dur: 0.05,
    wave: 'square',
  }),

  // Hold piece
  hold: { freq: 500, dur: 0.06, wave: 'triangle' },
  holdFail: { freq: 200, dur: 0.04, wave: 'noise' },  // Already used hold

  // Menu/UI
  menuMove: { freq: 400, dur: 0.02, wave: 'sine' },
  menuSelect: { freq: 600, dur: 0.05, wave: 'square' },
  menuBack: { freq: 350, dur: 0.04, wave: 'sine' },
};

class TGMSoundEngine {
  private audioContext: AudioContext;
  private masterGain: GainNode;
  private reverbNode: ConvolverNode;

  // Play piece preview sound (when piece appears in NEXT queue)
  playPiecePreview(pieceType: keyof typeof PIECE_PREVIEW_SOUNDS) {
    const sound = PIECE_PREVIEW_SOUNDS[pieceType];
    this.playTone(sound.frequency, sound.duration, sound.waveform);
  }

  // Play combo sound with escalating pitch
  playCombo(comboCount: number) {
    const sound = TGM_SOUNDS.combo(comboCount);
    this.playTone(sound.freq, sound.dur, sound.wave);

    // Add reverb tail for high combos
    if (comboCount >= 5) {
      this.addReverb(0.2);
    }
  }

  // Perfect clear epic moment
  async playPerfectClear() {
    const { flash, sweep, chord } = TGM_SOUNDS.perfectClear;

    // Flash
    this.playTone(flash.freq, flash.dur, 'square');
    await this.sleep(50);

    // Sweep
    this.playSweep(sweep.freq, sweep.sweep, sweep.dur);

    // Chord (all notes together)
    setTimeout(() => {
      chord.freqs.forEach(freq => {
        this.playTone(freq, chord.dur, 'sine', 0.25);
      });
    }, 200);
  }

  // 20G siren - oscillating warning
  play20GSiren() {
    const sound = TGM_SOUNDS.twentyGSiren;
    // Oscillate between two frequencies
    this.playOscillatingSiren(
      sound.freq,
      sound.freq - sound.sweep,
      sound.dur,
      8  // oscillations per second
    );
  }
}

### Voice Announcer System

```typescript
interface VoiceAnnouncement {
  audio: string;            // Audio file or TTS text
  priority: number;         // Higher = more important
  interrupt: boolean;       // Can interrupt current announcement
  cooldown: number;         // Minimum time before same announcement
}

const ANNOUNCEMENTS = {
  // Combo announcements
  combo2: { text: 'DOUBLE!', priority: 1, cooldown: 0 },
  combo3: { text: 'TRIPLE!', priority: 2, cooldown: 0 },
  combo4: { text: 'QUAD!', priority: 3, cooldown: 0 },
  combo5: { text: 'PENTA!', priority: 4, cooldown: 0 },
  combo6plus: { text: 'UNSTOPPABLE!', priority: 5, cooldown: 0 },

  // Line clear types
  tetris: { text: 'TETRIS!', priority: 3, cooldown: 2000 },
  tSpin: { text: 'T-SPIN!', priority: 3, cooldown: 2000 },
  tSpinTriple: { text: 'T-SPIN TRIPLE!', priority: 5, cooldown: 0 },
  perfectClear: { text: 'PERFECT CLEAR!', priority: 10, interrupt: true, cooldown: 0 },
  backToBack: { text: 'BACK TO BACK!', priority: 2, cooldown: 3000 },

  // Grade announcements
  gradeUp: { text: 'GRADE UP!', priority: 4, cooldown: 0 },
  sRank: { text: 'S RANK!', priority: 6, cooldown: 0 },
  mRank: { text: 'MASTER RANK!', priority: 8, cooldown: 0 },
  grandMaster: { text: 'GRAND MASTER!', priority: 10, interrupt: true, cooldown: 0 },

  // Section announcements
  sectionCool: { text: 'COOL!', priority: 5, cooldown: 0 },
  sectionRegret: { text: 'REGRET!', priority: 3, cooldown: 0 },

  // Danger
  dangerZone: { text: 'DANGER!', priority: 2, cooldown: 5000 },
  twentyG: { text: 'TWENTY G!', priority: 6, cooldown: 0 },

  // Multiplayer
  attackIncoming: { text: 'INCOMING!', priority: 4, cooldown: 1000 },
  attackBlocked: { text: 'BLOCKED!', priority: 3, cooldown: 1000 },
  eliminated: { text: 'ELIMINATED!', priority: 5, cooldown: 0 },
  victory: { text: 'VICTORY!', priority: 10, interrupt: true, cooldown: 0 },
  defeat: { text: 'DEFEAT!', priority: 10, interrupt: true, cooldown: 0 },

  // Pickup announcements
  pickupBomb: { text: 'BOMB!', priority: 3, cooldown: 0 },
  pickupShield: { text: 'SHIELD!', priority: 2, cooldown: 0 },
  pickupFreeze: { text: 'TIME FREEZE!', priority: 4, cooldown: 0 },

  // Countdown
  countdown3: { text: 'THREE!', priority: 10, interrupt: true, cooldown: 0 },
  countdown2: { text: 'TWO!', priority: 10, interrupt: true, cooldown: 0 },
  countdown1: { text: 'ONE!', priority: 10, interrupt: true, cooldown: 0 },
  countdownGo: { text: 'GO!', priority: 10, interrupt: true, cooldown: 0 },
};

class VoiceAnnouncerEngine {
  private queue: QueuedAnnouncement[] = [];
  private current: ActiveAnnouncement | null = null;
  private lastPlayed: Map<string, number> = new Map();
  private synth: Tone.Synth;  // For TTS simulation

  announce(key: keyof typeof ANNOUNCEMENTS) {
    const config = ANNOUNCEMENTS[key];

    // Check cooldown
    const lastTime = this.lastPlayed.get(key) || 0;
    if (Date.now() - lastTime < config.cooldown) return;

    // Check if should interrupt
    if (config.interrupt && this.current) {
      this.current.stop();
      this.current = null;
    }

    // Add to queue with priority
    this.queue.push({ key, config, timestamp: Date.now() });
    this.queue.sort((a, b) => b.config.priority - a.config.priority);

    this.processQueue();
  }

  private async processQueue() {
    if (this.current || this.queue.length === 0) return;

    const next = this.queue.shift()!;
    this.current = await this.playAnnouncement(next);
    this.lastPlayed.set(next.key, Date.now());

    this.current.onComplete = () => {
      this.current = null;
      this.processQueue();
    };
  }
}
```

### Spatial Audio for Multiplayer

```typescript
class SpatialAudio {
  private panner: Tone.Panner;

  constructor() {
    this.panner = new Tone.Panner().toDestination();
  }

  // Position opponent sounds based on their board location
  playOpponentSound(sound: string, opponentIndex: number, totalOpponents: number) {
    // Map opponent position to stereo field
    const pan = ((opponentIndex / (totalOpponents - 1)) * 2 - 1) * 0.7;
    this.panner.pan.value = pan;

    // Play with reduced volume for opponents
    this.synth.volume.value = -6;
    this.synth.triggerAttackRelease(sound, '8n');
  }

  // Attacks coming from specific direction
  playAttackFromDirection(direction: 'left' | 'right' | 'center') {
    const panMap = { left: -0.8, center: 0, right: 0.8 };
    this.panner.pan.rampTo(panMap[direction], 0.1);
    this.playSound('attack_incoming');
  }
}
```

---

## Game Modes

GRANDMASTER offers **14 unique game modes** - the most comprehensive Tetris experience ever created for BBS.

### Solo Modes

#### Marathon Mode - The Classic Endurance
- 150/200/endless line options
- Progressive speed increase
- Classic scoring with level multiplier
- Perfect for casual play
- **Goal**: Clear all lines with maximum score

#### Sprint Mode - Speed Run
- Clear 20/40/100 lines as fast as possible
- Ghost of your personal best races alongside you
- Replay comparison at finish
- Global and friend leaderboards
- **Goal**: Sub-60 seconds (40L) is elite, sub-40 is legendary

#### Dig Mode - Garbage Clear Challenge
- Pre-filled garbage at start (10/15/20 rows)
- Clear all garbage to win
- No new garbage spawns
- Tests garbage clearing efficiency
- **Goal**: Clear the board in minimum pieces

#### Ultra Mode - Time Attack
- 2/3/5 minute options
- Maximize your score
- Combo multipliers and perfect clears are key
- Back-to-back tetris chains critical
- **Goal**: Break 100,000 points (3 min)

#### Blitz Mode - High-Intensity Rush
- 2 minutes, increasing gravity every 30 seconds
- Ends at 20G speed
- Quick arcade experience
- **Goal**: Survive and score

#### Combo Mode - Chain Master
- Combo counter never resets between line clears
- Focus on continuous attacks
- No time limit
- **Goal**: Achieve 50+ combo

#### Survival Mode - Endless Pressure
- Garbage rises from bottom continuously
- Clear rate must exceed garbage rate
- Speed increases over time
- **Goal**: Survive as long as possible

#### Classic Mode - Retro Experience
- Original Tetris rules (no hold, no wall kicks)
- NES-style piece randomizer
- Authentic 1989 experience
- **Goal**: Nostalgia with modern polish

#### Master Mode - TGM3 Challenge
- 999 levels to conquer
- Full TGM3 grading: 9 → GM
- 20G unlocks at level 900
- Credit roll invisible challenge for MK+
- Section COOL/REGRET timing
- **Goal**: Achieve the legendary Grand Master rank

#### Death Mode (Shirase) - Ultimate Test
- 1300 levels of pure adrenaline
- Starts at high speed, reaches 20G at level 500
- Torikan (time gate) - too slow = instant death
- Only the elite survive past level 1000
- Bone blocks at high levels (all pieces look identical)
- **Goal**: Prove you can handle anything

#### Zen Mode - Endless Relaxation
- No pressure, no timer, no death
- Chill tracker music, slower speeds
- Relaxing background effects
- Auto-saves progress
- Meditation mode with breathing prompts
- **Goal**: Peace and practice

#### Training Mode - Learn & Improve
- Interactive tutorials for all techniques
- T-Spin trainer with setup guides
- 4-wide combo practice
- Perfect clear puzzles
- Finesse training with feedback
- DAS/ARR calibration helper
- **Goal**: Master every technique

### Versus Modes

#### 2P Battle - Head-to-Head Combat
- Classic 1v1 competitive
- Garbage attack system
- Combo and B2B bonuses
- Multiple match formats (BO1/BO3/BO5)
- Rematch option
- **Goal**: Defeat your opponent

#### CPU Battle - AI Opponent
- 10 difficulty levels (Beginner → Grandmaster)
- Each CPU has distinct personality/style
- Practice competitive without waiting
- **Goal**: Beat the highest difficulty CPU

---

## NetworkEngine Integration

GRANDMASTER leverages the SDK's **NetworkEngine** for production-grade multiplayer, matchmaking, and social features.

### Import and Setup

```typescript
import { NetworkEngine } from '@amiexpress/bbs-door-sdk/engines/network';
import type {
  MatchmakingResult,
  PlayerSkill,
  RankTier,
  Lobby,
  Replay,
  LeaderboardEntry,
} from '@amiexpress/bbs-door-sdk/engines/network';

class GrandmasterNetwork {
  private network: NetworkEngine;

  constructor() {
    this.network = new NetworkEngine({
      matchmaking: {
        defaultSkillRange: 200,  // Initial skill match range
      },
      sync: {
        strategy: 'delta',       // Efficient state sync
        snapshotRate: 60,        // 60 FPS game updates
      },
      prediction: {
        maxPredictionFrames: 10,
        rollbackEnabled: true,   // Fighting game-quality netcode
        maxRollbackFrames: 7,
      },
      interpolation: {
        method: 'linear',        // Tetris doesn't need smooth curves
        bufferSize: 2,
      },
      replay: {
        compression: true,
        maxReplayLength: 3600,   // 1 hour max
      },
    });
  }

  async connect() {
    await this.network.connect();

    // Monitor connection quality
    this.network.connection.on('quality:changed', (quality) => {
      if (quality === 'poor') {
        this.showConnectionWarning();
      }
    });
  }
}
```

### Glicko-2 Ranked Matchmaking

```typescript
class RankedMatchmaking {
  async joinRankedQueue(gameMode: GameMode) {
    // Join queue with skill-based matching
    await this.network.matchmaking.joinQueue({
      queueType: 'ranked',
      gameMode: gameMode,
      skillRange: 200,           // Initial range
      maxWaitTime: 120000,       // Expand range after 2 min
      preferredRegions: ['us-east', 'us-west', 'eu-west'],
    });

    // Show queue status
    this.network.matchmaking.on('queue:status', (status) => {
      this.updateQueueUI({
        position: status.position,
        estimatedWait: status.estimatedWait,
        playersInQueue: status.playersInQueue,
      });
    });

    // Match found!
    this.network.matchmaking.on('match:found', async (match) => {
      this.showMatchFoundUI(match);

      // Auto-accept or show accept button
      await this.network.matchmaking.acceptMatch();
    });

    // Match ready - transition to game
    this.network.matchmaking.on('match:ready', (match) => {
      this.transitionToGame(match);
    });
  }

  async getPlayerSkill(): Promise<PlayerSkill> {
    return await this.network.matchmaking.getSkill();
    // Returns: { rating: 1500, uncertainty: 100, tier: 'gold', gamesPlayed: 47 }
  }

  getRankDisplay(tier: RankTier): { color: string; icon: string } {
    const RANK_DISPLAY = {
      bronze:      { color: '#CD7F32', icon: '[B]' },
      silver:      { color: '#C0C0C0', icon: '[S]' },
      gold:        { color: '#FFD700', icon: '[G]' },
      platinum:    { color: '#00CED1', icon: '[P]' },
      diamond:     { color: '#B9F2FF', icon: '[D]' },
      master:      { color: '#9932CC', icon: '[M]' },
      grandmaster: { color: '#FF1493', icon: '[GM]' },
    };
    return RANK_DISPLAY[tier];
  }
}
```

### Pre-Game Lobbies

```typescript
class GameLobby {
  async createLobby(config: LobbyConfig): Promise<Lobby> {
    return await this.network.lobby.create({
      name: config.name,
      maxPlayers: config.maxPlayers,
      isPrivate: config.isPrivate,
      password: config.password,
      settings: {
        mode: config.gameMode,
        rotationSystem: config.rotationSystem,  // SRS, ARS, NRS, BARS
        gravity: config.startingGravity,
        garbageType: config.garbageType,
        pickupsEnabled: config.pickupsEnabled,
        turnTimeLimit: config.turnBased ? 60 : undefined,
      },
      teams: config.teamMode ? [
        { id: 1, name: 'Team Red', color: '#ff0000', maxSize: 4 },
        { id: 2, name: 'Team Blue', color: '#0000ff', maxSize: 4 },
      ] : undefined,
    });
  }

  setupLobbyEvents() {
    // Player joins
    this.network.lobby.on('player:joined', (player) => {
      this.addPlayerCard(player);
      this.playSound('playerJoin');
    });

    // Ready check
    this.network.lobby.on('player:ready', (player, ready) => {
      this.updatePlayerReady(player, ready);
    });

    // Vote system (map/mode selection)
    this.network.lobby.on('vote:updated', (option, votes) => {
      this.updateVoteDisplay(option, votes);
    });

    // Countdown to game start
    this.network.lobby.on('countdown:tick', (remaining) => {
      this.showCountdown(remaining);
      if (remaining <= 3) {
        this.sounds.play(`countdown${remaining}`);
      }
    });

    // Game starting
    this.network.lobby.on('game:starting', () => {
      this.transitionToGame();
    });
  }

  // Get shareable invite code
  getInviteCode(): string {
    return this.network.lobby.getInviteCode();
  }
}
```

### Client-Side Prediction with Rollback

```typescript
class TetrisPrediction {
  setup() {
    // CRITICAL: Set deterministic simulation callback
    this.network.prediction.setSimulationCallback((state, input) => {
      return this.simulateTick(state, input);
    });

    // Set initial state
    this.network.prediction.setLocalState(this.gameState);

    // Handle server reconciliation
    this.network.prediction.on('state:reconciled', (state, tick) => {
      // Smooth visual correction if prediction was wrong
      this.visualSmooth(state);
    });

    // Rollback notification (useful for debugging/display)
    this.network.prediction.on('rollback', (toTick) => {
      console.log(`Rollback to tick ${toTick}`);
      // Optionally flash a "network correction" indicator
    });
  }

  // Called every frame on player input
  handleInput(input: TetrisInput) {
    // Predict locally (instant response)
    this.network.prediction.predictInput({
      action: input.action,  // 'left', 'right', 'rotate', 'drop', etc.
      tick: this.currentTick,
      timestamp: Date.now(),
    });

    // Get predicted state for rendering
    const renderState = this.network.prediction.getLocalState();
    this.render(renderState);
  }

  // Deterministic simulation - MUST be identical on all clients
  private simulateTick(state: GameState, input: TetrisInput): GameState {
    const newState = { ...state };

    switch (input.action) {
      case 'left':
        if (this.canMove(newState, -1, 0)) {
          newState.pieceX--;
        }
        break;
      case 'right':
        if (this.canMove(newState, 1, 0)) {
          newState.pieceX++;
        }
        break;
      case 'rotate_cw':
        this.tryRotate(newState, 1);
        break;
      case 'hard_drop':
        this.hardDrop(newState);
        break;
      // ... etc
    }

    // Apply gravity
    this.applyGravity(newState);

    return newState;
  }
}
```

### State Synchronization

```typescript
class TetrisSync {
  setup() {
    // Configure sync for Tetris (fast, delta-based)
    this.network.sync.configure({
      strategy: 'delta',
      snapshotRate: 60,           // Match game framerate
      interpolationDelay: 50,     // Minimal delay for responsiveness
      maxDeltaSize: 512,          // Force full snapshot if delta too large
      compression: true,
    });
  }

  // Host pushes state to all clients
  pushGameState(state: TetrisGameState) {
    this.network.sync.pushState('game', {
      boards: state.boards,
      scores: state.scores,
      levels: state.levels,
      grades: state.grades,
      incomingGarbage: state.incomingGarbage,
      tick: state.tick,
    });
  }

  // Push individual board state (for spectators)
  pushPlayerBoard(playerId: string, board: BoardState) {
    this.network.sync.pushEntityState({
      entityId: `board-${playerId}`,
      type: 'tetris-board',
      custom: {
        grid: this.compressGrid(board.grid),
        currentPiece: board.currentPiece,
        holdPiece: board.holdPiece,
        nextQueue: board.nextQueue,
        score: board.score,
        level: board.level,
        grade: board.grade,
      },
    });
  }
}
```

### Social Features

```typescript
class GrandmasterSocial {
  async setup() {
    // Set presence
    this.network.presence.setGameActivity(
      'GRANDMASTER',
      'In Ranked Queue',
      undefined,
      undefined
    );

    // Handle friend requests
    this.network.social.on('friend:request', (request) => {
      this.showFriendRequestPopup(request);
    });

    // Handle game invites
    this.network.social.on('invite:received', (invite) => {
      this.showInvitePopup(invite);
    });

    // Party updates
    this.network.social.on('party:updated', (party) => {
      this.updatePartyUI(party);
    });
  }

  async inviteFriendToMatch(friendId: string) {
    await this.network.social.inviteToGame(friendId, this.currentLobbyId);
  }

  async createPartyAndQueue() {
    // Create party
    const party = await this.network.social.createParty();

    // Invite friends
    for (const friend of this.selectedFriends) {
      await this.network.social.inviteToParty(friend.playerId);
    }

    // Join queue as party
    await this.network.matchmaking.joinQueue({
      queueType: 'ranked',
      gameMode: 'team-battle',
      partyId: party.id,
    });
  }
}
```

### Leaderboards & Achievements

```typescript
class GrandmasterLeaderboards {
  async getLeaderboard(type: 'sprint' | 'ultra' | 'master' | 'ranked'): Promise<LeaderboardEntry[]> {
    return await this.network.leaderboard.getLeaderboard({
      type: 'global',
      gameMode: type,
      limit: 100,
    });
  }

  async getSeasonalLeaderboard(season: number) {
    return await this.network.leaderboard.getLeaderboard({
      type: 'seasonal',
      season: season,
      limit: 100,
    });
  }

  async getFriendsLeaderboard(gameMode: string) {
    return await this.network.leaderboard.getLeaderboard({
      type: 'friends',
      gameMode: gameMode,
    });
  }

  async submitMatchResult(match: MatchResult) {
    await this.network.leaderboard.submitMatchResult({
      matchId: match.id,
      gameMode: match.mode,
      startTime: match.startTime,
      endTime: match.endTime,
      duration: match.duration,
      players: match.players.map(p => ({
        playerId: p.id,
        team: p.team,
        score: p.score,
        stats: {
          linesCleared: p.lines,
          tetrisCount: p.tetrises,
          tSpinCount: p.tSpins,
          perfectClears: p.perfectClears,
          maxCombo: p.maxCombo,
          grade: p.grade,
          apm: p.apm,
        },
      })),
      winner: match.winnerId,
    });
  }

  // Achievement tracking
  setupAchievements() {
    // Listen for unlocks
    this.network.leaderboard.on('achievement:unlocked', (achievement) => {
      this.showAchievementPopup(achievement);
      this.sounds.play('achievementUnlock');
    });
  }

  unlockAchievement(id: string) {
    this.network.leaderboard.unlockAchievement(id);
  }

  updateProgress(id: string, progress: number) {
    this.network.leaderboard.updateAchievementProgress(id, progress);
  }
}
```

### Replay System

```typescript
class GrandmasterReplays {
  private isRecording = false;

  startRecording(matchId: string, players: Player[]) {
    this.network.replay.startRecording(matchId, players.map(p => ({
      playerId: p.id,
      username: p.username,
      team: p.team,
    })));
    this.isRecording = true;
  }

  recordFrame(tick: number, inputs: Map<string, TetrisInput>, state: GameState) {
    if (!this.isRecording) return;

    // Convert inputs to record format
    const inputMap: Record<string, any> = {};
    inputs.forEach((input, playerId) => {
      inputMap[playerId] = input;
    });

    this.network.replay.recordFrame(tick, inputMap, state);
  }

  async stopAndSave(): Promise<string> {
    const replay = this.network.replay.stopRecording();
    this.isRecording = false;

    // Save to server
    const replayId = await this.network.replay.saveReplay(replay);
    return replayId;
  }

  async watchReplay(replayId: string) {
    const replay = await this.network.replay.loadReplay(replayId);

    // Setup playback
    this.network.replay.on('playback:frame', (frame) => {
      this.applyFrame(frame);
    });

    // Playback controls
    this.network.replay.play();
  }

  // Playback controls for UI
  pause() { this.network.replay.pause(); }
  resume() { this.network.replay.resume(); }
  setSpeed(speed: number) { this.network.replay.setSpeed(speed); }
  seek(tick: number) { this.network.replay.seek(tick); }
}
```

---

### Multiplayer Modes

#### Versus (1v1 Duel)
- Classic head-to-head combat
- First to top out loses
- Garbage attacks, combo bonuses
- Ranked matchmaking with ELO
- **Best of 3/5/7 sets**

#### Team Battle (2v2, 3v3, 4v4)
- Coordinate with teammates
- Shared attack meter
- Team combos multiply damage
- Voice chat integration
- **Clan wars and tournaments**

#### Battle Royale (8-64 players!)
```
.--[ GRANDMASTER ROYALE - 32 PLAYERS REMAINING ]--------------------------------.
|  YOUR BOARD   | KILL FEED              | MINIMAPS                    | STATS |
| .----------.  | ---------------------- | .--..--..--..--..--..--..--. |       |
| |          |  | spot [S-4] ELIMINATED  | |▓▓||░░||██||▓▓||░░||██||▓▓| | #12   |
| |          |  |   grumpy [m-2]         | |▓▓||░░||██||▓▓||░░||██||▓▓| |       |
| |    ████  |  | alice [S-1] TETRIS x4  | '──''──''──''──''──''──''──' | KILLS |
| |    ██    |  |   → bob [-16 ATK]      | .--..--..--..--..--..--..--. |   3   |
| |          |  | carol [GM] B2B TETRIS  | |▓▓||░░||██||▓▓||░░||██||▓▓| |       |
| |  ░░░░    |  |   → [BROADCAST -8]     | |▓▓||░░||██||▓▓||░░||██||▓▓| | GRADE |
| |████████  |  | YOU sent 4 → dave      | '──''──''──''──''──''──''──' |  S-4  |
| |██████████|  | eve [9] ELIMINATED     | .--..--..--..--..--..--..--. |       |
| |████████  |  |   × TOP OUT            | |▓▓||░░||░░||██||▓▓||░░||██| | ATK   |
| '----------'  |                        | |XX||░░||░░||██||▓▓||░░||██| | ████  |
| NEXT  HOLD    | [!] 4 INCOMING         | '──''──''──''──''──''──''──' | ████  |
| [T]   [I]     |                        | Targeting: RANDOM            |       |
'-------------------------------------------------------------------------------'
```

- Massive multiplayer elimination
- Attacks target random player or leader
- Shrinking safe zone (forced speed increase)
- Top 3 get rewards
- **Seasonal tournaments with prizes**

#### Boss Rush (Co-op)
```
.--[ BOSS: THE NULLIFIER - Phase 2/3 - HP: ████████░░ 78% ]---------------------.
|  YOUR BOARD   | BOSS PATTERN           | TEAM BOARDS              | TEAM HP  |
| .----------.  | ████████████████████   | [spot]  [alice]  [bob]   | ████████ |
| |          |  | ██                 ██  | .----. .----. .----.     | 156/200  |
| |          |  | ██   ??????????   ██  | |████| |████| |████|     |          |
| |    ████  |  | ██   ??????????   ██  | |██  | |  ██| |████|     | PHASE 2  |
| |    ██    |  | ██                 ██  | '────' '────' '────'     | Clear 50 |
| |          |  | ████████████████████   |                          | lines!   |
| |  ░░░░    |  |                        | BOSS ATTACK IN: 15s      |          |
| |████████  |  | ABILITY: Null Zone     | ░░░░░░░░░░░░░░████████   | COMBO    |
| |██████████|  | Creates invisible area | Damage: ████░░░░░░       | x4       |
| |████████  |  | in random columns!     |                          |          |
| '----------'  |                        | [!] NEXT: Gravity Spike  |          |
'-------------------------------------------------------------------------------'
```

- Fight AI bosses with unique attack patterns
- Boss abilities mess with your board
- Team must deal damage by clearing lines
- Weekly rotating bosses
- **Exclusive rewards for completion**

#### Puzzle Mode
- Pre-set board states
- Find the optimal clear
- T-spin setups, perfect clears, 4-wide combos
- Community-created puzzles
- **Daily puzzle with leaderboard**

---

## Rotation Systems

GRANDMASTER supports **4 rotation systems** for authenticity and player preference (inspired by Apotris):

### SRS (Super Rotation System) - Default

The modern standard used in most Tetris games since 2001.

```typescript
// SRS rotation matrices for each piece
const SRS_ROTATIONS = {
  I: [
    [[0,0,0,0], [1,1,1,1], [0,0,0,0], [0,0,0,0]],  // 0°
    [[0,0,1,0], [0,0,1,0], [0,0,1,0], [0,0,1,0]],  // 90°
    [[0,0,0,0], [0,0,0,0], [1,1,1,1], [0,0,0,0]],  // 180°
    [[0,1,0,0], [0,1,0,0], [0,1,0,0], [0,1,0,0]],  // 270°
  ],
  // ... other pieces
};

// SRS wall kick data (5 tests per rotation)
const SRS_WALL_KICKS = {
  'JLSTZ': {
    '0->1': [[ 0, 0], [-1, 0], [-1, 1], [ 0,-2], [-1,-2]],
    '1->0': [[ 0, 0], [ 1, 0], [ 1,-1], [ 0, 2], [ 1, 2]],
    '1->2': [[ 0, 0], [ 1, 0], [ 1,-1], [ 0, 2], [ 1, 2]],
    '2->1': [[ 0, 0], [-1, 0], [-1, 1], [ 0,-2], [-1,-2]],
    '2->3': [[ 0, 0], [ 1, 0], [ 1, 1], [ 0,-2], [ 1,-2]],
    '3->2': [[ 0, 0], [-1, 0], [-1,-1], [ 0, 2], [-1, 2]],
    '3->0': [[ 0, 0], [-1, 0], [-1,-1], [ 0, 2], [-1, 2]],
    '0->3': [[ 0, 0], [ 1, 0], [ 1, 1], [ 0,-2], [ 1,-2]],
  },
  'I': {
    '0->1': [[ 0, 0], [-2, 0], [ 1, 0], [-2,-1], [ 1, 2]],
    '1->0': [[ 0, 0], [ 2, 0], [-1, 0], [ 2, 1], [-1,-2]],
    // ... I-piece has different kicks
  },
  'O': {}, // O doesn't kick
};

// Features:
// - Wall kicks allow complex T-spins
// - 180° rotation supported
// - Consistent across all modern Tetris
```

### ARS (Arika Rotation System) - TGM Classic

The rotation system from TGM series, known for its unique I-piece behavior.

```typescript
const ARS_FEATURES = {
  iSpawn: 'left_of_center',    // I spawns left-biased
  iRotation: 'asymmetric',     // Different CW vs CCW
  wallKicks: 'minimal',        // Only basic kicks
  floorKicks: false,           // No floor kicks (purist)
  synchroMove: true,           // IRS during ARE
};

// ARS rotation - simpler kicks, feels different
const ARS_WALL_KICKS = {
  'all': {
    'right': [[ 0, 0], [ 1, 0], [-1, 0]],  // Try center, right, left
    'left':  [[ 0, 0], [-1, 0], [ 1, 0]],
  },
};

// Key difference: No T-spin triple setups possible
// Rewards clean stacking over flashy tricks
```

### NRS (Nintendo Rotation System) - Retro

The original NES/GB rotation with no wall kicks.

```typescript
const NRS_FEATURES = {
  wallKicks: 'none',           // No wall kicks at all
  spawnPosition: 'center',     // Pieces spawn at center
  rotationPivot: 'offset',     // Some pieces have odd pivots
  can180: false,               // No 180° rotation
};

// Pure rotation - if it doesn't fit, it doesn't rotate
class NRSRotation {
  rotate(piece: Piece, direction: 1 | -1): boolean {
    const newRotation = (piece.rotation + direction + 4) % 4;
    const newShape = NRS_SHAPES[piece.type][newRotation];

    // Simple collision check - no kicks
    if (this.canPlace(newShape, piece.x, piece.y)) {
      piece.rotation = newRotation;
      return true;
    }
    return false;  // Blocked, can't rotate
  }
}

// Classic feel - requires precise placement
// Popular with speedrun purists
```

### BARS (Bombliss Arika Rotation System) - Hybrid

Custom hybrid system combining best of ARS and SRS.

```typescript
const BARS_FEATURES = {
  wallKicks: 'moderate',       // More than ARS, less than SRS
  floorKicks: true,            // Allow floor kicks
  tSpins: 'detected',          // T-spins work
  synchroMove: true,           // IRS during ARE
};

// BARS wall kicks - balanced
const BARS_WALL_KICKS = {
  'JLSTZ': {
    'any': [[ 0, 0], [-1, 0], [ 1, 0], [ 0,-1], [-1,-1], [ 1,-1]],
  },
  'I': {
    'any': [[ 0, 0], [-1, 0], [ 1, 0], [-2, 0], [ 2, 0]],
  },
};

// Best of both worlds - kicks work but aren't overpowered
```

### Rotation System Selection

```typescript
interface RotationConfig {
  system: 'SRS' | 'ARS' | 'NRS' | 'BARS';
  allow180: boolean;
  irsEnabled: boolean;    // Initial Rotation System
  ihsEnabled: boolean;    // Initial Hold System
}

class RotationManager {
  private system: RotationSystem;

  constructor(config: RotationConfig) {
    switch (config.system) {
      case 'SRS':  this.system = new SRSRotation(); break;
      case 'ARS':  this.system = new ARSRotation(); break;
      case 'NRS':  this.system = new NRSRotation(); break;
      case 'BARS': this.system = new BARSRotation(); break;
    }
  }

  tryRotate(piece: Piece, direction: 1 | -1, board: Board): RotateResult {
    return this.system.rotate(piece, direction, board);
  }
}

// UI for selection
const ROTATION_OPTIONS = [
  { id: 'SRS',  name: 'Super Rotation (Modern)',    desc: 'Full wall kicks, T-spins' },
  { id: 'ARS',  name: 'Arika Rotation (TGM)',       desc: 'Classic TGM feel' },
  { id: 'NRS',  name: 'Nintendo Rotation (Retro)',  desc: 'No kicks, pure skill' },
  { id: 'BARS', name: 'Bombliss Rotation (Hybrid)', desc: 'Balanced kicks' },
];
```

---

## AI Bot System (CPU Battle)

GRANDMASTER features a sophisticated AI system for CPU Battle mode with 10 difficulty levels and distinct play styles.

### Board Evaluation Algorithm

```typescript
// Based on Apotris AI evaluation
class TetrisAI {
  // Evaluation weights (tuned per difficulty)
  private weights = {
    aggregateHeight: -0.51,    // Penalize tall stacks
    completeLines: 0.76,       // Reward line clears
    holes: -0.36,              // Heavily penalize holes
    bumpiness: -0.18,          // Penalize uneven surface
    wellDepth: 0.15,           // Reward Tetris wells
    rowTransitions: -0.10,     // Penalize gaps in rows
    columnTransitions: -0.10,  // Penalize gaps in columns
    coveredCells: -0.25,       // Penalize buried holes
    tSpinSetup: 0.20,          // Reward T-spin setups
  };

  // Evaluate a potential board state
  evaluate(board: Board): number {
    let score = 0;

    score += this.weights.aggregateHeight * this.getAggregateHeight(board);
    score += this.weights.completeLines * this.getCompleteLines(board);
    score += this.weights.holes * this.getHoleCount(board);
    score += this.weights.bumpiness * this.getBumpiness(board);
    score += this.weights.wellDepth * this.getWellDepth(board);
    score += this.weights.rowTransitions * this.getRowTransitions(board);
    score += this.weights.columnTransitions * this.getColumnTransitions(board);
    score += this.weights.coveredCells * this.getCoveredCells(board);
    score += this.weights.tSpinSetup * this.getTSpinSetupScore(board);

    return score;
  }

  // Find best placement for current piece
  findBestMove(piece: Piece, board: Board, nextQueue: Piece[]): Move {
    let bestMove: Move | null = null;
    let bestScore = -Infinity;

    // Try all possible positions and rotations
    for (let rotation = 0; rotation < 4; rotation++) {
      const rotatedPiece = this.rotatePiece(piece, rotation);

      for (let x = -2; x < board.width + 2; x++) {
        if (!this.canPlace(rotatedPiece, x, 0, board)) continue;

        // Simulate drop
        const landingY = this.getDropY(rotatedPiece, x, board);
        const testBoard = this.placePiece(board, rotatedPiece, x, landingY);

        // Evaluate with lookahead
        let score = this.evaluate(testBoard);

        // Lookahead 1-2 pieces for better decisions
        if (this.difficulty >= 7 && nextQueue.length > 0) {
          score += 0.5 * this.evaluateLookahead(testBoard, nextQueue[0]);
        }

        if (score > bestScore) {
          bestScore = score;
          bestMove = { x, rotation, score };
        }
      }
    }

    return bestMove || { x: 4, rotation: 0, score: 0 };
  }

  // Metric calculations
  private getAggregateHeight(board: Board): number {
    let total = 0;
    for (let x = 0; x < board.width; x++) {
      total += this.getColumnHeight(board, x);
    }
    return total;
  }

  private getHoleCount(board: Board): number {
    let holes = 0;
    for (let x = 0; x < board.width; x++) {
      let foundBlock = false;
      for (let y = 0; y < board.height; y++) {
        if (board.get(x, y)) {
          foundBlock = true;
        } else if (foundBlock) {
          holes++;
        }
      }
    }
    return holes;
  }

  private getBumpiness(board: Board): number {
    let bumpiness = 0;
    for (let x = 0; x < board.width - 1; x++) {
      bumpiness += Math.abs(
        this.getColumnHeight(board, x) -
        this.getColumnHeight(board, x + 1)
      );
    }
    return bumpiness;
  }

  private getWellDepth(board: Board): number {
    // Check for Tetris-ready wells (column 9 or 0)
    const rightWell = this.measureWellDepth(board, board.width - 1);
    const leftWell = this.measureWellDepth(board, 0);
    return Math.max(rightWell, leftWell);
  }
}
```

### Difficulty Levels

```typescript
interface AIDifficulty {
  level: number;
  name: string;
  thinkTime: number;      // MS delay before moving
  mistakeRate: number;    // % chance to make suboptimal move
  lookahead: number;      // Pieces to look ahead
  useHold: boolean;
  tSpinAware: boolean;
  useDAS: boolean;        // Fast movement
  targetAPM: number;      // Actions per minute
  personality: AIPersonality;
}

const AI_DIFFICULTIES: AIDifficulty[] = [
  {
    level: 1,
    name: 'Beginner',
    thinkTime: 1000,
    mistakeRate: 0.4,
    lookahead: 0,
    useHold: false,
    tSpinAware: false,
    useDAS: false,
    targetAPM: 20,
    personality: 'random',
  },
  {
    level: 2,
    name: 'Novice',
    thinkTime: 800,
    mistakeRate: 0.3,
    lookahead: 0,
    useHold: false,
    tSpinAware: false,
    useDAS: false,
    targetAPM: 30,
    personality: 'flat_stacker',
  },
  {
    level: 3,
    name: 'Casual',
    thinkTime: 600,
    mistakeRate: 0.2,
    lookahead: 1,
    useHold: true,
    tSpinAware: false,
    useDAS: false,
    targetAPM: 45,
    personality: 'flat_stacker',
  },
  {
    level: 4,
    name: 'Intermediate',
    thinkTime: 400,
    mistakeRate: 0.15,
    lookahead: 1,
    useHold: true,
    tSpinAware: false,
    useDAS: true,
    targetAPM: 60,
    personality: 'tetris_hunter',
  },
  {
    level: 5,
    name: 'Advanced',
    thinkTime: 300,
    mistakeRate: 0.1,
    lookahead: 2,
    useHold: true,
    tSpinAware: true,
    useDAS: true,
    targetAPM: 80,
    personality: 'tetris_hunter',
  },
  {
    level: 6,
    name: 'Expert',
    thinkTime: 200,
    mistakeRate: 0.05,
    lookahead: 2,
    useHold: true,
    tSpinAware: true,
    useDAS: true,
    targetAPM: 100,
    personality: 'aggressive',
  },
  {
    level: 7,
    name: 'Master',
    thinkTime: 100,
    mistakeRate: 0.02,
    lookahead: 3,
    useHold: true,
    tSpinAware: true,
    useDAS: true,
    targetAPM: 120,
    personality: 'optimizer',
  },
  {
    level: 8,
    name: 'Grandmaster',
    thinkTime: 50,
    mistakeRate: 0.01,
    lookahead: 3,
    useHold: true,
    tSpinAware: true,
    useDAS: true,
    targetAPM: 150,
    personality: 'optimizer',
  },
  {
    level: 9,
    name: 'Legend',
    thinkTime: 30,
    mistakeRate: 0,
    lookahead: 4,
    useHold: true,
    tSpinAware: true,
    useDAS: true,
    targetAPM: 180,
    personality: 'perfect',
  },
  {
    level: 10,
    name: 'TAS',
    thinkTime: 16,  // Frame-perfect
    mistakeRate: 0,
    lookahead: 5,
    useHold: true,
    tSpinAware: true,
    useDAS: true,
    targetAPM: 300,
    personality: 'perfect',
  },
];

type AIPersonality =
  | 'random'         // No strategy, random placement
  | 'flat_stacker'   // Keeps board flat, avoids holes
  | 'tetris_hunter'  // Always keeps well for I-pieces
  | 'aggressive'     // Sends garbage ASAP
  | 'optimizer'      // Maximizes efficiency
  | 'perfect';       // Superhuman play
```

### AI Controller

```typescript
class AIController {
  private ai: TetrisAI;
  private config: AIDifficulty;
  private currentMove: Move | null = null;
  private thinkTimer: number = 0;

  constructor(level: number) {
    this.config = AI_DIFFICULTIES[level - 1];
    this.ai = new TetrisAI(this.config);
  }

  update(deltaTime: number, gameState: GameState): AIInput | null {
    // Thinking delay
    this.thinkTimer += deltaTime;
    if (this.thinkTimer < this.config.thinkTime) {
      return null;  // Still thinking
    }

    // Calculate move if needed
    if (!this.currentMove) {
      this.currentMove = this.calculateMove(gameState);
    }

    // Execute move step by step
    return this.executeMove(gameState);
  }

  private calculateMove(state: GameState): Move {
    // Maybe use hold?
    if (this.config.useHold && this.shouldUseHold(state)) {
      return { action: 'hold' };
    }

    // Find best placement
    let move = this.ai.findBestMove(
      state.currentPiece,
      state.board,
      state.nextQueue.slice(0, this.config.lookahead)
    );

    // Maybe make a mistake
    if (Math.random() < this.config.mistakeRate) {
      move = this.makeSuboptimalMove(state);
    }

    return move;
  }

  private executeMove(state: GameState): AIInput {
    const piece = state.currentPiece;
    const target = this.currentMove!;

    // Rotate first
    if (piece.rotation !== target.rotation) {
      const rotationsNeeded = (target.rotation - piece.rotation + 4) % 4;
      if (rotationsNeeded === 1 || rotationsNeeded === 3) {
        return { action: rotationsNeeded === 1 ? 'rotate_cw' : 'rotate_ccw' };
      } else if (rotationsNeeded === 2) {
        return { action: 'rotate_180' };
      }
    }

    // Then move horizontally
    if (piece.x < target.x) {
      return { action: 'right' };
    }
    if (piece.x > target.x) {
      return { action: 'left' };
    }

    // Finally, hard drop
    this.currentMove = null;
    this.thinkTimer = 0;
    return { action: 'hard_drop' };
  }

  // Personality-specific behaviors
  private shouldUseHold(state: GameState): boolean {
    if (!state.canHold) return false;

    const currentScore = this.ai.evaluate(
      this.ai.simulateDrop(state.currentPiece, state.board)
    );

    const holdPiece = state.holdPiece || state.nextQueue[0];
    const holdScore = this.ai.evaluate(
      this.ai.simulateDrop(holdPiece, state.board)
    );

    // Hold if held piece is significantly better
    return holdScore > currentScore + 0.2;
  }
}
```

### AI Display in Game

```
.--[ VS CPU: GRANDMASTER (Lv.8) ]-------.
|  YOUR BOARD   |   CPU BOARD   | STATS |
| .----------.  | .----------.  |       |
| |          |  | |          |  | CPU   |
| |          |  | |          |  | APM   |
| |    ████  |  | |   ██     |  | 147   |
| |    ██    |  | |   ██░░   |  |       |
| |          |  | |   ░░░░   |  | CPU   |
| |  ░░░░    |  | |████████  |  | Lines |
| |████████  |  | |██████████|  |  89   |
| |██████████|  | |████████  |  |       |
| |████████  |  | |██████████|  | YOU   |
| '----------'  | '----------'  | Lines |
|               | [!] TETRIS!   |  72   |
'---------------------------------------'
```

---

## Competitive Systems

### Ranked Ladder

```typescript
interface RankInfo {
  tier: RankTier;
  division: number;     // 1-4 within tier
  points: number;       // 0-100 within division
  peakRank: string;     // Highest achieved
  winStreak: number;
  lossStreak: number;
}

type RankTier =
  | 'Bronze'    // 0-399
  | 'Silver'    // 400-799
  | 'Gold'      // 800-1199
  | 'Platinum'  // 1200-1599
  | 'Diamond'   // 1600-1999
  | 'Master'    // 2000-2399
  | 'Grandmaster' // 2400+
  | 'Legend';   // Top 100 players

const RANK_DISPLAY = {
  Bronze:      { color: '#CD7F32', icon: '◆' },
  Silver:      { color: '#C0C0C0', icon: '◆◆' },
  Gold:        { color: '#FFD700', icon: '◆◆◆' },
  Platinum:    { color: '#00CED1', icon: '★' },
  Diamond:     { color: '#B9F2FF', icon: '★★' },
  Master:      { color: '#9932CC', icon: '★★★' },
  Grandmaster: { color: '#FF1493', icon: '✦' },
  Legend:      { color: '#FFD700', icon: '♔', animated: true },
};

// Matchmaking
class RankedMatchmaker {
  private queue: QueuedPlayer[] = [];

  findMatch(player: Player): Promise<Match> {
    // Expand search range over time
    const searchRange = {
      initial: 100,
      expansion: 50,        // Expand by 50 every 30s
      maxWait: 180,         // 3 min max wait
      maxRange: 500,        // Never match more than 500 apart
    };

    // Consider win/loss streaks for closer matches
    // Hot streak players face each other
    // Cold streak players get slightly easier opponents
  }
}
```

### Seasonal System

```
╔══════════════════════════════════════════════════════════════╗
║                    SEASON 7: INFINITE                        ║
║                   42 days remaining                          ║
╠══════════════════════════════════════════════════════════════╣
║  YOUR PROGRESS                                               ║
║  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░████████ Level 34/100    ║
║                                                              ║
║  REWARDS UNLOCKED:                                           ║
║  [✓] Lv.5   Holographic Border                              ║
║  [✓] Lv.10  "Rising Star" Title                             ║
║  [✓] Lv.20  Neon Block Set                                  ║
║  [✓] Lv.30  Rainbow Trail Effect                            ║
║  [ ] Lv.40  Animated Avatar Frame                           ║
║  [ ] Lv.50  "Infinite" Chat Badge                           ║
║  [ ] Lv.75  Exclusive Announcer Voice                       ║
║  [ ] Lv.100 Legendary "Infinite" Title                      ║
║                                                              ║
║  SEASON CHALLENGES:                                          ║
║  [■■■■■■■░░░] Clear 500 lines           (420/500)          ║
║  [■■■■░░░░░░] Win 50 ranked matches    (22/50)             ║
║  [■■░░░░░░░░] Achieve S-Rank 10 times   (2/10)             ║
║  [░░░░░░░░░░] Get a Perfect Clear       (0/1)              ║
╚══════════════════════════════════════════════════════════════╝
```

- 3-month seasons with themes
- Season pass with free and premium tracks
- Exclusive cosmetics each season
- End-of-season rewards based on final rank
- Seasonal achievements and challenges

### Tournament System

```typescript
interface Tournament {
  id: string;
  name: string;
  type: 'single_elimination' | 'double_elimination' | 'swiss' | 'round_robin';
  format: 'bo3' | 'bo5' | 'bo7';
  maxPlayers: number;
  startTime: Date;
  prizes: Prize[];
  entryRequirement?: RankTier;
}

// Weekly automated tournaments
const WEEKLY_TOURNAMENTS = [
  {
    name: 'Monday Mayhem',
    day: 'monday',
    time: '20:00 UTC',
    type: 'single_elimination',
    maxPlayers: 64,
  },
  {
    name: 'Weekend Warriors',
    day: 'saturday',
    time: '18:00 UTC',
    type: 'double_elimination',
    maxPlayers: 128,
  },
  {
    name: 'Grand Prix Sunday',
    day: 'sunday',
    time: '16:00 UTC',
    type: 'swiss',
    rounds: 7,
    maxPlayers: 256,
    entryRequirement: 'Gold',
  },
];

// Tournament UI
class TournamentBracket {
  render(tournament: Tournament) {
    return `
╔══[ ${tournament.name} ]═══════════════════════════════════════╗
║                        GRAND FINALS                          ║
║                         ┌─────┐                              ║
║                         │ ??? │                              ║
║                    ┌────┴─────┴────┐                         ║
║                    │               │                         ║
║                ┌───┴───┐       ┌───┴───┐                     ║
║                │ spot  │       │ alice │                     ║
║            ┌───┴───┬───┴───┬───┴───┬───┴───┐                 ║
║            │ spot  │ bob   │ alice │ carol │                 ║
║            │  2-0  │  1-2  │  2-1  │  0-2  │                 ║
║         ┌──┴──┬────┴──┬────┴──┬────┴──┬────┴──┐              ║
║         │spot │grumpy │ bob  │  eve  │ alice │...           ║
╚══════════════════════════════════════════════════════════════╝
    `;
  }
}
```

### Replay System

```typescript
interface Replay {
  id: string;
  players: ReplayPlayer[];
  mode: GameMode;
  timestamp: Date;
  duration: number;
  inputs: CompressedInputs;  // Delta-encoded for size
  highlights: Highlight[];
  metadata: {
    finalScores: number[];
    grades: string[];
    lineClears: LineClearStats;
    maxCombo: number;
    perfectClears: number;
  };
}

interface Highlight {
  timestamp: number;
  type: 'tetris' | 'perfect_clear' | 't_spin' | 'combo' | 'clutch' | 'elimination';
  player: string;
  description: string;
}

class ReplayViewer {
  private replay: Replay;
  private playbackSpeed = 1;
  private currentTime = 0;
  private isPaused = false;

  // Playback controls
  play() { this.isPaused = false; }
  pause() { this.isPaused = true; }
  setSpeed(speed: number) { this.playbackSpeed = speed; }  // 0.25x to 4x
  seekTo(time: number) { this.currentTime = time; }
  skipToHighlight(index: number) {
    this.seekTo(this.replay.highlights[index].timestamp);
  }

  // UI
  renderControls() {
    return `
┌─[ REPLAY: spot vs alice - Ranked Match ]──────────────────────┐
│ [◄◄] [◄] [${this.isPaused ? '▶' : '❚❚'}] [►] [►►]  Speed: ${this.playbackSpeed}x  │
│ ░░░░░░░░░░░░░░░████░░░░░░░░░░░░░░░░░░░░░░  2:34 / 5:12       │
│                    ▲                                          │
│ HIGHLIGHTS: [Tetris 0:45] [T-Spin 1:23] [Perfect Clear 2:34] │
└───────────────────────────────────────────────────────────────┘
    `;
  }
}
```

### Spectator Mode

```typescript
class SpectatorMode {
  private viewers: Set<Socket> = new Set();
  private casterCommentary: boolean = false;
  private focusedPlayer: string | null = null;
  private autoDirector: boolean = true;

  // Auto-director AI picks the most interesting view
  updateAutoDirector(gameState: GameState) {
    if (!this.autoDirector) return;

    // Score each player's "interest level"
    const interest = gameState.players.map(p => {
      let score = 0;

      // High stack = tension
      score += p.stackHeight * 5;

      // Active combo
      score += p.combo * 20;

      // Recent line clear
      if (p.recentLineClear) score += 50;

      // About to die
      if (p.stackHeight >= 18) score += 100;

      // Big attack incoming
      score += p.incomingGarbage * 10;

      return { player: p.id, score };
    });

    // Switch to most interesting player
    const mostInteresting = interest.sort((a, b) => b.score - a.score)[0];
    if (mostInteresting.player !== this.focusedPlayer) {
      this.switchFocus(mostInteresting.player);
    }
  }

  // Picture-in-picture for multiple players
  renderMultiView(players: Player[], layout: 'side_by_side' | 'focused' | 'grid') {
    // ...
  }

  // Caster tools
  enableCasterMode(caster: Socket) {
    this.casterCommentary = true;
    // Caster gets:
    // - Manual camera control
    // - Telestrator (draw on screen)
    // - Player stats overlay
    // - Slow-mo replay
  }
}
```

---

## Progression & Customization

### Achievement System

```typescript
const ACHIEVEMENTS = {
  // Skill achievements
  first_tetris: { name: 'Block Buster', desc: 'Clear your first Tetris', xp: 100 },
  first_tspin: { name: 'Spin Doctor', desc: 'Perform your first T-Spin', xp: 150 },
  perfect_clear: { name: 'Clean Slate', desc: 'Get a Perfect Clear', xp: 500 },
  combo_10: { name: 'Combo King', desc: 'Achieve a 10+ combo', xp: 300 },
  combo_20: { name: 'Combo Legend', desc: 'Achieve a 20+ combo', xp: 1000 },

  // Grade achievements
  reach_s1: { name: 'S-Class', desc: 'Reach S1 grade', xp: 200 },
  reach_s13: { name: 'S-Max', desc: 'Reach S13 grade', xp: 1000 },
  reach_m1: { name: 'Master Class', desc: 'Reach m1 grade', xp: 2000 },
  reach_gm: { name: 'GRAND MASTER', desc: 'Achieve GM rank', xp: 10000, legendary: true },

  // Speed achievements
  sprint_sub60: { name: 'Speedster', desc: 'Clear 40 lines under 60s', xp: 500 },
  sprint_sub40: { name: 'Lightning', desc: 'Clear 40 lines under 40s', xp: 2000 },
  sprint_sub30: { name: 'Impossible Speed', desc: 'Clear 40 lines under 30s', xp: 5000, legendary: true },

  // Multiplayer achievements
  first_win: { name: 'Victor', desc: 'Win your first match', xp: 100 },
  win_streak_5: { name: 'Hot Streak', desc: 'Win 5 matches in a row', xp: 300 },
  win_streak_10: { name: 'Unstoppable', desc: 'Win 10 matches in a row', xp: 1000 },
  tournament_win: { name: 'Champion', desc: 'Win a tournament', xp: 2000 },

  // Social achievements
  play_100_matches: { name: 'Veteran', desc: 'Play 100 multiplayer matches', xp: 500 },
  play_1000_matches: { name: 'Legend', desc: 'Play 1000 multiplayer matches', xp: 2000 },

  // Challenge achievements
  survive_20g: { name: '20G Survivor', desc: 'Survive 100 pieces in 20G', xp: 500 },
  all_cools: { name: 'Cool Master', desc: 'Get COOL on all sections', xp: 3000 },
  invisible_clear: { name: 'Blind Faith', desc: 'Complete credit roll invisible challenge', xp: 5000 },

  // Hidden achievements
  secret_code: { name: '???', desc: 'Enter the Konami code', xp: 100, hidden: true },
  stack_20: { name: 'Living Dangerously', desc: 'Survive at row 20 for 60 seconds', xp: 500, hidden: true },
};
```

### Cosmetic System

```typescript
interface Cosmetics {
  // Block themes
  blockSets: BlockSet[];        // Different piece appearances
  ghostStyles: GhostStyle[];    // Ghost piece effects

  // Board themes
  boardSkins: BoardSkin[];      // Background, border style
  lineClears: LineClearEffect[];
  lockEffects: LockEffect[];

  // Profile
  avatarFrames: AvatarFrame[];
  titles: Title[];
  nameplates: Nameplate[];

  // Effects
  trailEffects: TrailEffect[];  // Piece movement trails
  auras: Aura[];                // Around your board
  emotes: Emote[];              // In-match reactions

  // Audio
  announcerPacks: AnnouncerPack[];
  sfxPacks: SFXPack[];
}

const BLOCK_SETS: BlockSet[] = [
  { id: 'classic', name: 'Classic', unlockMethod: 'default' },
  { id: 'neon', name: 'Neon Glow', unlockMethod: 'season_5_reward' },
  { id: 'holographic', name: 'Holographic', unlockMethod: 'gm_achievement' },
  { id: 'fire', name: 'Blazing', unlockMethod: 'purchase', cost: 500 },
  { id: 'ice', name: 'Frozen', unlockMethod: 'purchase', cost: 500 },
  { id: 'galaxy', name: 'Galaxy', unlockMethod: 'tournament_winner' },
  { id: 'invisible', name: 'Shadow', unlockMethod: 'legend_rank' },
  { id: 'rainbow', name: 'Prismatic', unlockMethod: 'all_achievements' },
];

// Block set rendering
const BLOCK_SET_RENDERS: Record<string, BlockColors> = {
  classic: {
    I: '\x1b[46m  \x1b[0m',
    O: '\x1b[43m  \x1b[0m',
    // ... standard colors
  },
  neon: {
    I: '\x1b[96;46m▓▓\x1b[0m',  // Bright cyan with glow
    O: '\x1b[93;43m▓▓\x1b[0m',  // Bright yellow with glow
    // ... with pulsing animation
  },
  holographic: {
    // Shifts colors over time
    I: (frame: number) => HOLO_CYCLE[(frame / 10) % HOLO_CYCLE.length],
  },
  fire: {
    I: '\x1b[91;41m░░\x1b[0m',  // Red flame pattern
    // ... with flame particle emitter
  },
};
```

### Player Profiles

```
╔══[ PLAYER PROFILE: spot ]════════════════════════════════════════╗
║  ┌──────┐                                                        ║
║  │ [GM] │  ★★★ GRAND MASTER ★★★                                 ║
║  │ ████ │  "The Untouchable"                                     ║
║  │ ████ │                                                        ║
║  └──────┘  Rank: Diamond II (1847 ELO)                          ║
║            Season 7 Peak: Master I                               ║
║                                                                  ║
║  ═══[ STATS ]════════════════════════════════════════════════   ║
║  Games Played: 2,847          Win Rate: 67.3%                    ║
║  Total Lines: 847,293         Avg APM: 142                       ║
║  Best Combo: 24               Perfect Clears: 47                 ║
║  Time Played: 312h 47m                                           ║
║                                                                  ║
║  ═══[ ACHIEVEMENTS ]═════════════════════════════════════════   ║
║  ████████████████████████████████████░░░░  47/52 (90%)          ║
║  Recent: [GRAND MASTER] [All COOLs] [Lightning]                  ║
║                                                                  ║
║  ═══[ MATCH HISTORY ]════════════════════════════════════════   ║
║  W  vs alice     [S-4]   2-1   5 min ago                        ║
║  W  vs grumpy    [m-2]   2-0   32 min ago                       ║
║  L  vs bob       [GM]    1-2   1 hour ago                       ║
║  W  vs carol     [S-9]   2-0   2 hours ago                      ║
║                                                                  ║
║  ═══[ EQUIPPED COSMETICS ]═══════════════════════════════════   ║
║  Blocks: Holographic    Trail: Rainbow    Aura: Champion's Glow ║
║  Frame: Diamond Border  Title: The Untouchable                   ║
╚══════════════════════════════════════════════════════════════════╝
```

---

## Advanced Mechanics

### T-Spin Detection

```typescript
type TSpinType = 'none' | 'mini' | 'single' | 'double' | 'triple';

class TSpinDetector {
  detect(board: Board, piece: Piece, lastAction: Action): TSpinType {
    if (piece.type !== 'T') return 'none';
    if (lastAction !== 'rotate') return 'none';

    // Check 4 corners around T center
    const corners = this.getCorners(piece.x, piece.y);
    const filledCorners = corners.filter(c => board.isOccupied(c.x, c.y)).length;

    if (filledCorners < 3) return 'none';

    // Check front corners (pointing direction)
    const frontCorners = this.getFrontCorners(piece);
    const frontFilled = frontCorners.filter(c => board.isOccupied(c.x, c.y)).length;

    const linesCleared = board.getLinesCleared();

    if (frontFilled === 2) {
      // Full T-Spin
      if (linesCleared === 3) return 'triple';
      if (linesCleared === 2) return 'double';
      if (linesCleared === 1) return 'single';
    } else {
      // Mini T-Spin
      if (linesCleared >= 1) return 'mini';
    }

    return 'none';
  }
}

// T-Spin rewards
const TSPIN_ATTACK = {
  mini: 0,
  single: 2,
  double: 4,
  triple: 6,
};

const TSPIN_SCORE = {
  mini: 100,
  single: 800,
  double: 1200,
  triple: 1600,
};
```

### Combo System

```typescript
class ComboSystem {
  private combo = 0;
  private backToBack = false;
  private lastClearType: ClearType = 'none';

  onLineClear(clearType: ClearType, linesCleared: number): AttackResult {
    // Increment combo
    this.combo++;

    // Check back-to-back (Tetris or T-Spin)
    const isDifficultClear = clearType === 'tetris' || clearType.startsWith('tspin');

    if (isDifficultClear && this.lastClearType === clearType) {
      this.backToBack = true;
    } else if (!isDifficultClear) {
      this.backToBack = false;
    }

    this.lastClearType = clearType;

    // Calculate attack
    const baseAttack = this.getBaseAttack(clearType, linesCleared);
    const comboBonus = this.getComboBonus();
    const b2bBonus = this.backToBack ? 1 : 0;

    const totalAttack = baseAttack + comboBonus + b2bBonus;

    return {
      attack: totalAttack,
      combo: this.combo,
      backToBack: this.backToBack,
      clearType,
    };
  }

  private getComboBonus(): number {
    // Combo table (TGM style)
    const table = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5];
    return table[Math.min(this.combo, table.length - 1)];
  }

  onPieceLockNoLineClear() {
    this.combo = 0;
  }
}
```

### Perfect Clear Detection

```typescript
class PerfectClearDetector {
  detect(board: Board): boolean {
    // Check if board is completely empty after line clear
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 10; x++) {
        if (board.isOccupied(x, y)) {
          return false;
        }
      }
    }
    return true;
  }
}

const PERFECT_CLEAR_ATTACK = {
  single: 8,
  double: 10,
  triple: 12,
  tetris: 16,  // Devastation
};
```

### Finesse Detection

```typescript
// Track optimal vs actual inputs for each piece placement
class FinesseTracker {
  private totalPlacements = 0;
  private perfectPlacements = 0;
  private totalInputs = 0;
  private optimalInputs = 0;

  trackPlacement(piece: Piece, finalPos: Position, inputs: Input[]) {
    const optimal = this.calculateOptimalInputs(piece, finalPos);

    this.totalPlacements++;
    this.totalInputs += inputs.length;
    this.optimalInputs += optimal.length;

    if (inputs.length === optimal.length) {
      this.perfectPlacements++;
    }
  }

  getFinesse(): FinesseStats {
    return {
      finessePercentage: (this.optimalInputs / this.totalInputs) * 100,
      perfectRate: (this.perfectPlacements / this.totalPlacements) * 100,
      wastedInputs: this.totalInputs - this.optimalInputs,
    };
  }
}
```

---

## Pickup System (Enhanced)

### Pickup Categories

```typescript
type PickupRarity = 'common' | 'uncommon' | 'rare' | 'legendary';

interface Pickup {
  id: string;
  name: string;
  rarity: PickupRarity;
  icon: string;
  color: string;
  effect: PickupEffect;
  duration?: number;
  targetType: 'self' | 'opponent' | 'all_opponents' | 'random';
}

const PICKUPS: Pickup[] = [
  // === COMMON (60% spawn rate) ===
  {
    id: 'clear_line',
    name: 'Line Clear',
    rarity: 'common',
    icon: '+',
    color: 'green',
    effect: { type: 'clear_bottom_row' },
    targetType: 'self',
  },
  {
    id: 'garbage_small',
    name: 'Mini Bomb',
    rarity: 'common',
    icon: '!',
    color: 'red',
    effect: { type: 'send_garbage', lines: 2 },
    targetType: 'opponent',
  },

  // === UNCOMMON (25% spawn rate) ===
  {
    id: 'shield',
    name: 'Shield',
    rarity: 'uncommon',
    icon: 'O',
    color: 'cyan',
    effect: { type: 'block_attack' },
    targetType: 'self',
  },
  {
    id: 'speed_up',
    name: 'Adrenaline',
    rarity: 'uncommon',
    icon: '>>',
    color: 'yellow',
    effect: { type: 'double_gravity', duration: 10000 },
    targetType: 'opponent',
  },
  {
    id: 'blind',
    name: 'Blackout',
    rarity: 'uncommon',
    icon: '?',
    color: 'magenta',
    effect: { type: 'hide_next_queue', duration: 15000 },
    targetType: 'opponent',
  },

  // === RARE (12% spawn rate) ===
  {
    id: 'time_freeze',
    name: 'Time Freeze',
    rarity: 'rare',
    icon: '*',
    color: 'blue',
    effect: { type: 'pause_gravity', duration: 5000 },
    targetType: 'self',
  },
  {
    id: 'garbage_bomb',
    name: 'Bomb',
    rarity: 'rare',
    icon: '!',
    color: 'orange',
    effect: { type: 'send_garbage', lines: 4 },
    targetType: 'opponent',
  },
  {
    id: 'reverse',
    name: 'Confusion',
    rarity: 'rare',
    icon: '<>',
    color: 'purple',
    effect: { type: 'reverse_controls', duration: 8000 },
    targetType: 'opponent',
  },

  // === LEGENDARY (3% spawn rate) ===
  {
    id: 'nuke',
    name: 'NUKE',
    rarity: 'legendary',
    icon: '☢',
    color: 'red',
    effect: { type: 'send_garbage', lines: 8 },
    targetType: 'opponent',
  },
  {
    id: 'clear_all',
    name: 'Purify',
    rarity: 'legendary',
    icon: '✦',
    color: 'gold',
    effect: { type: 'clear_half_board' },
    targetType: 'self',
  },
  {
    id: 'mirror',
    name: 'Mirror',
    rarity: 'legendary',
    icon: '⟷',
    color: 'silver',
    effect: { type: 'copy_next_attack_back' },
    targetType: 'self',
  },
  {
    id: 'ultimate',
    name: 'GRAND ATTACK',
    rarity: 'legendary',
    icon: '★',
    color: 'rainbow',
    effect: { type: 'send_garbage', lines: 4 },
    targetType: 'all_opponents',
  },
];
```

### Target Selection UI (Enhanced)

```
┌──[ PICKUP: NUKE ]────────────────────────┐
│                                          │
│     ☢  LEGENDARY NUKE  ☢                │
│       Sends 8 garbage lines              │
│                                          │
│  ┌──[ SELECT TARGET ]───────────────┐   │
│  │                                   │   │
│  │  > [1] ████ spot     [S-4]  HP:16 │   │
│  │    [2] ████ grumpy   [m-2]  HP:12 │   │
│  │    [3] ████ alice    [S-1]  HP:8  │   │
│  │    [4] ████ bob      [9]    HP:4  │   │
│  │                                   │   │
│  │  ░░░░░░░░░░░░░░░░████  3s        │   │
│  └───────────────────────────────────┘   │
│                                          │
│  TIP: Target the leader to even things!  │
│                                          │
│  Press 1-4, click, or wait for random    │
│  [ESC] Cancel and save for later         │
└──────────────────────────────────────────┘
```

---

## Controls & Input

### Control Scheme

```
╔══[ CONTROLS ]═══════════════════════════════════════════════════╗
║                                                                  ║
║  MOVEMENT                      ROTATION                         ║
║  ───────────────────────────   ─────────────────────────────    ║
║  [←] [→]  Move left/right      [Z]        Rotate left (CCW)     ║
║  [↓]      Soft drop            [X] [↑]    Rotate right (CW)     ║
║  [↑]      Hard drop            [A]        Rotate 180°           ║
║  [SPACE]  Hard drop                                             ║
║                                                                  ║
║  SPECIAL                       MENU                             ║
║  ───────────────────────────   ─────────────────────────────    ║
║  [C] [SHIFT]  Hold piece       [ESC]      Pause / Menu          ║
║  [D]          Sonic drop       [TAB]      Toggle minimap        ║
║               (drop, no lock)  [F1]       Help                  ║
║                                [R]        Restart (practice)    ║
║                                                                  ║
║  MULTIPLAYER                                                     ║
║  ─────────────────────────────────────────────────────────────  ║
║  [T]       Open chat           [1-9]      Target opponent       ║
║  [ENTER]   Send message        [0]        Auto-target           ║
║                                                                  ║
║  All controls are fully customizable in Settings.               ║
╚══════════════════════════════════════════════════════════════════╝
```

### DAS/ARR Tuning

```typescript
interface InputConfig {
  das: number;           // Delayed Auto-Shift (ms) - default 133
  arr: number;           // Auto-Repeat Rate (ms) - default 0 (instant)
  sdf: number;           // Soft Drop Factor - default 20x
  gravity: 'auto' | number;
  dasCancel: boolean;    // Cancel DAS on direction change
  dasCutDelay: number;   // Frames before DAS on new piece
}

const INPUT_PRESETS = {
  beginner: { das: 200, arr: 50, sdf: 10 },
  default: { das: 133, arr: 20, sdf: 20 },
  fast: { das: 100, arr: 0, sdf: 40 },
  instant: { das: 0, arr: 0, sdf: 'infinity' },
};

class InputHandler {
  private heldKeys = new Set<string>();
  private dasTimers = new Map<string, number>();
  private arrTimers = new Map<string, number>();
  private config: InputConfig;

  update(deltaTime: number) {
    for (const key of this.heldKeys) {
      const dasTimer = this.dasTimers.get(key) || 0;
      const arrTimer = this.arrTimers.get(key) || 0;

      if (dasTimer < this.config.das) {
        // Still in DAS delay
        this.dasTimers.set(key, dasTimer + deltaTime * 1000);
      } else {
        // DAS triggered, now use ARR
        if (arrTimer >= this.config.arr) {
          this.executeKeyAction(key);
          this.arrTimers.set(key, 0);
        } else {
          this.arrTimers.set(key, arrTimer + deltaTime * 1000);
        }
      }
    }
  }

  onKeyDown(key: string) {
    if (!this.heldKeys.has(key)) {
      this.heldKeys.add(key);
      this.dasTimers.set(key, 0);
      this.arrTimers.set(key, 0);
      this.executeKeyAction(key);  // Immediate first press
    }
  }

  onKeyUp(key: string) {
    this.heldKeys.delete(key);
    this.dasTimers.delete(key);
    this.arrTimers.delete(key);
  }
}
```

---

## Database Schema

```sql
-- Core user profile
CREATE TABLE grandmaster_profiles (
  user_id INTEGER PRIMARY KEY,
  username TEXT NOT NULL,

  -- Ranking
  elo_rating INTEGER DEFAULT 1200,
  rank_tier TEXT DEFAULT 'Bronze',
  rank_division INTEGER DEFAULT 4,
  rank_points INTEGER DEFAULT 0,
  peak_elo INTEGER DEFAULT 1200,

  -- Progression
  experience INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  currency INTEGER DEFAULT 0,
  premium_currency INTEGER DEFAULT 0,

  -- Cosmetics (JSON arrays of unlocked IDs)
  unlocked_blocks TEXT DEFAULT '["classic"]',
  unlocked_trails TEXT DEFAULT '[]',
  unlocked_frames TEXT DEFAULT '[]',
  unlocked_titles TEXT DEFAULT '[]',

  -- Equipped cosmetics
  equipped_blocks TEXT DEFAULT 'classic',
  equipped_trail TEXT DEFAULT NULL,
  equipped_frame TEXT DEFAULT NULL,
  equipped_title TEXT DEFAULT NULL,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Detailed statistics
CREATE TABLE grandmaster_stats (
  user_id INTEGER PRIMARY KEY,

  -- Games played
  games_total INTEGER DEFAULT 0,
  games_solo INTEGER DEFAULT 0,
  games_versus INTEGER DEFAULT 0,
  games_tournament INTEGER DEFAULT 0,

  -- Wins/losses
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  draws INTEGER DEFAULT 0,
  win_streak_current INTEGER DEFAULT 0,
  win_streak_best INTEGER DEFAULT 0,

  -- Line clears
  lines_total BIGINT DEFAULT 0,
  singles INTEGER DEFAULT 0,
  doubles INTEGER DEFAULT 0,
  triples INTEGER DEFAULT 0,
  tetrises INTEGER DEFAULT 0,
  tspins INTEGER DEFAULT 0,
  tspin_singles INTEGER DEFAULT 0,
  tspin_doubles INTEGER DEFAULT 0,
  tspin_triples INTEGER DEFAULT 0,
  perfect_clears INTEGER DEFAULT 0,

  -- Combos
  max_combo INTEGER DEFAULT 0,
  total_combo_count INTEGER DEFAULT 0,
  back_to_back_count INTEGER DEFAULT 0,

  -- Speed records
  sprint_best_time INTEGER DEFAULT NULL,  -- milliseconds
  ultra_best_score INTEGER DEFAULT 0,

  -- TGM records
  master_best_grade TEXT DEFAULT '9',
  master_best_level INTEGER DEFAULT 0,
  master_best_time INTEGER DEFAULT NULL,
  master_gm_achieved BOOLEAN DEFAULT FALSE,
  master_gm_date TIMESTAMP DEFAULT NULL,
  shirase_best_level INTEGER DEFAULT 0,

  -- Attack stats
  garbage_sent BIGINT DEFAULT 0,
  garbage_received BIGINT DEFAULT 0,
  attacks_blocked INTEGER DEFAULT 0,

  -- Pickups
  pickups_collected INTEGER DEFAULT 0,
  pickups_used INTEGER DEFAULT 0,

  -- Time
  playtime_seconds BIGINT DEFAULT 0,

  -- APM (actions per minute)
  apm_average REAL DEFAULT 0,
  apm_best INTEGER DEFAULT 0,

  -- Finesse
  finesse_average REAL DEFAULT 0,
  finesse_best REAL DEFAULT 0,

  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Match history
CREATE TABLE grandmaster_matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Match info
  mode TEXT NOT NULL,
  match_type TEXT NOT NULL,  -- ranked, casual, tournament
  tournament_id INTEGER DEFAULT NULL,

  -- Players (JSON array)
  players TEXT NOT NULL,

  -- Results
  winner_id INTEGER,
  final_standings TEXT,  -- JSON array
  duration_ms INTEGER,

  -- Detailed stats (JSON)
  match_stats TEXT,

  -- Replay
  replay_data BLOB,
  replay_highlights TEXT,  -- JSON array

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Achievements
CREATE TABLE grandmaster_achievements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  achievement_id TEXT NOT NULL,
  unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, achievement_id)
);

-- Season data
CREATE TABLE grandmaster_seasons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  season_number INTEGER NOT NULL,

  -- Season progress
  season_level INTEGER DEFAULT 1,
  season_xp INTEGER DEFAULT 0,

  -- Ranking
  final_elo INTEGER,
  final_rank TEXT,
  peak_elo INTEGER,

  -- Rewards claimed (JSON)
  rewards_claimed TEXT DEFAULT '[]',

  UNIQUE(user_id, season_number)
);

-- Replays (separate table for size)
CREATE TABLE grandmaster_replays (
  id TEXT PRIMARY KEY,  -- UUID
  match_id INTEGER REFERENCES grandmaster_matches(id),
  compressed_data BLOB NOT NULL,
  size_bytes INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Leaderboards (cached/materialized)
CREATE TABLE grandmaster_leaderboards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  leaderboard_type TEXT NOT NULL,  -- sprint, ultra, elo, master_grade, etc.
  timeframe TEXT NOT NULL,  -- all_time, season, weekly, daily
  user_id INTEGER NOT NULL,
  score INTEGER NOT NULL,
  rank INTEGER NOT NULL,
  metadata TEXT,  -- JSON with additional info
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(leaderboard_type, timeframe, user_id)
);

-- Tournaments
CREATE TABLE grandmaster_tournaments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  format TEXT NOT NULL,
  max_players INTEGER,
  entry_requirement TEXT,
  prizes TEXT,  -- JSON
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  status TEXT DEFAULT 'upcoming',
  bracket_data TEXT,  -- JSON
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tournament registrations
CREATE TABLE grandmaster_tournament_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER REFERENCES grandmaster_tournaments(id),
  user_id INTEGER NOT NULL,
  seed INTEGER,
  final_placement INTEGER,
  registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tournament_id, user_id)
);

-- Clans
CREATE TABLE grandmaster_clans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  tag TEXT UNIQUE NOT NULL,
  owner_id INTEGER NOT NULL,
  description TEXT,
  emblem TEXT,  -- Cosmetic ID
  member_count INTEGER DEFAULT 1,
  total_elo BIGINT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Clan members
CREATE TABLE grandmaster_clan_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clan_id INTEGER REFERENCES grandmaster_clans(id),
  user_id INTEGER NOT NULL,
  role TEXT DEFAULT 'member',  -- owner, officer, member
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id)
);
```

---

## Commands

```
GMASTER                - Main menu (animated intro)
GMASTER PLAY           - Quick play (auto-matchmaking)
GMASTER MASTER         - Solo Master mode
GMASTER SHIRASE        - Solo Shirase mode
GMASTER SPRINT         - 40-line sprint
GMASTER ULTRA          - 3-minute score attack
GMASTER ZEN            - Endless relaxation mode
GMASTER VERSUS         - Multiplayer lobby
GMASTER RANKED         - Ranked matchmaking
GMASTER ROYALE         - Battle Royale queue
GMASTER TOURNAMENT     - Tournament browser
GMASTER COOP           - Cooperative modes
GMASTER PUZZLE         - Puzzle mode
GMASTER REPLAY <id>    - Watch replay
GMASTER SPECTATE       - Spectate live matches
GMASTER PROFILE [user] - View profile
GMASTER STATS [user]   - Detailed statistics
GMASTER TOP [category] - Leaderboards
GMASTER ACHIEVEMENTS   - Achievement tracker
GMASTER COSMETICS      - Customize appearance
GMASTER SETTINGS       - Game settings
GMASTER CLAN           - Clan management
GMASTER DAILY          - Daily challenges
GMASTER SEASON         - Season pass progress
GMASTER TUTORIAL       - Interactive tutorial
GMASTER CREDITS        - Credits and thanks
```

---

## Success Criteria

### Technical Excellence
- [ ] 60 FPS gameplay with zero frame drops
- [ ] Sub-16ms input latency (imperceptible)
- [ ] Smooth animations on all effects
- [ ] Zero flicker or visual artifacts
- [ ] Works on all major terminals

### Authentic TGM Feel
- [ ] Exact TGM3 speed curve
- [ ] Proper lock delay mechanics
- [ ] IRS and IHS functional
- [ ] Grade system matches TGM3
- [ ] 20G is playable and fair

### Competitive Features
- [ ] Ranked matchmaking with ELO
- [ ] Tournament system functional
- [ ] Replay system with playback controls
- [ ] Spectator mode with auto-director
- [ ] Leaderboards update in real-time

### Visual Impact
- [ ] "Wow" reaction on first launch
- [ ] Screen shake feels impactful
- [ ] Particle effects enhance without distracting
- [ ] Transitions are smooth and stylish
- [ ] Color palette is cohesive and readable

### Audio Design
- [ ] Dynamic music responds to gameplay
- [ ] Sound effects are satisfying and clear
- [ ] Voice announcer adds excitement
- [ ] Wet reverb creates atmosphere
- [ ] Audio never clips or distorts

### Progression
- [ ] Players feel rewarded for playing
- [ ] Achievements are meaningful
- [ ] Cosmetics are desirable
- [ ] Season pass provides value
- [ ] No pay-to-win mechanics

### Social
- [ ] Players engage in rivalries
- [ ] Clans are active
- [ ] Tournament participation is strong
- [ ] Spectator numbers grow
- [ ] Community creates content

---

## File Structure

```
sdk/doors/grandmaster/
├── package.json
├── tsconfig.json
├── index.ts                    # Entry point
├── app.ts                      # Main application
├── client.ts                   # Browser client (hybrid door)
│
├── core/
│   ├── game.ts                 # Game engine core
│   ├── board.ts                # Board logic
│   ├── pieces.ts               # Tetromino definitions + SRS
│   ├── gravity.ts              # Speed curves
│   ├── grading.ts              # TGM3 grading system
│   ├── sections.ts             # Section COOL/REGRET
│   ├── lock-delay.ts           # Lock mechanics
│   ├── combo.ts                # Combo + B2B system
│   ├── tspin.ts                # T-Spin detection
│   ├── perfect-clear.ts        # Perfect clear detection
│   ├── credit-roll.ts          # Invisible challenge
│   └── finesse.ts              # Finesse tracking
│
├── modes/
│   ├── master.ts               # Master mode
│   ├── shirase.ts              # Death mode
│   ├── sprint.ts               # 40-line sprint
│   ├── ultra.ts                # Time attack
│   ├── zen.ts                  # Endless mode
│   ├── versus.ts               # 1v1 combat
│   ├── team-battle.ts          # Team modes
│   ├── royale.ts               # Battle Royale
│   ├── coop.ts                 # Cooperative
│   ├── boss-rush.ts            # Boss battles
│   └── puzzle.ts               # Puzzle mode
│
├── network/
│   ├── lobby.ts                # Lobby system
│   ├── matchmaking.ts          # Ranked matchmaking
│   ├── match.ts                # Match coordination
│   ├── attack.ts               # Attack system
│   ├── sync.ts                 # State synchronization
│   └── spectator.ts            # Spectator system
│
├── pickups/
│   ├── types.ts                # Pickup definitions
│   ├── spawner.ts              # Spawn logic
│   ├── effects.ts              # Effect implementations
│   └── target-select.ts        # Target selection UI
│
├── ui/
│   ├── screen.ts               # Screen management
│   ├── attract.ts              # Attract mode / intro
│   ├── menus/
│   │   ├── main-menu.ts        # Main menu
│   │   ├── mode-select.ts      # Mode selection
│   │   ├── lobby.ts            # Multiplayer lobby
│   │   ├── settings.ts         # Settings menu
│   │   └── cosmetics.ts        # Customization
│   ├── game/
│   │   ├── board-renderer.ts   # Board rendering
│   │   ├── minimap.ts          # Minimap rendering
│   │   ├── hud.ts              # HUD elements
│   │   ├── opponent-boards.ts  # Opponent display
│   │   └── overlays.ts         # In-game overlays
│   ├── effects/
│   │   ├── particles.ts        # Particle system
│   │   ├── screen-shake.ts     # Screen shake
│   │   ├── transitions.ts      # Screen transitions
│   │   ├── scanlines.ts        # Scanline effect
│   │   ├── vignette.ts         # Vignette effect
│   │   └── heat-distortion.ts  # Heat distortion
│   └── components/
│       ├── profile-card.ts     # Player profile
│       ├── leaderboard.ts      # Leaderboard view
│       ├── replay-viewer.ts    # Replay playback
│       └── tournament.ts       # Tournament bracket
│
├── audio/
│   ├── engine.ts               # Audio engine
│   ├── music.ts                # Dynamic music
│   ├── sfx.ts                  # Sound effects
│   ├── announcer.ts            # Voice announcer
│   └── spatial.ts              # Spatial audio
│
├── input/
│   ├── handler.ts              # Input handling
│   ├── das-arr.ts              # DAS/ARR system
│   └── config.ts               # Key bindings
│
├── progression/
│   ├── experience.ts           # XP system
│   ├── achievements.ts         # Achievements
│   ├── seasons.ts              # Season pass
│   ├── cosmetics.ts            # Cosmetic system
│   └── rewards.ts              # Reward distribution
│
├── competitive/
│   ├── ranked.ts               # Ranked system
│   ├── elo.ts                  # ELO calculation
│   ├── tournaments.ts          # Tournament system
│   ├── clans.ts                # Clan system
│   └── leaderboards.ts         # Leaderboard management
│
├── data/
│   ├── repository.ts           # Database access
│   ├── migrations.ts           # DB migrations
│   └── cache.ts                # Caching layer
│
└── replays/
    ├── recorder.ts             # Replay recording
    ├── player.ts               # Replay playback
    ├── compression.ts          # Replay compression
    └── highlights.ts           # Auto-highlight detection
```

---

## SDK Engine Quick References

GRANDMASTER leverages multiple SDK engines. Each has a quick reference guide in `sdk/docs/`:

| Engine     | File                               | Key Features                              |
|------------|------------------------------------|-------------------------------------------|
| AI         | AI_ENGINE_QUICK_REFERENCE.md       | A* pathfinding, behavior FSM, agents      |
| Audio      | AUDIO_ENGINE_QUICK_REFERENCE.md    | Tone.js synthesis, adaptive music         |
| Cards      | CARDS_ENGINE_QUICK_REFERENCE.md    | ASCII cards, UNO, deck operations         |
| Graphics   | GRAPHICS_ENGINE_QUICK_REFERENCE.md | ANSI buffer, sprites, parallax, particles |
| Input      | INPUT_ENGINE_QUICK_REFERENCE.md    | Key-to-action bindings                    |
| Network    | NETWORK_ENGINE_QUICK_REFERENCE.md  | Matchmaking, lobbies, sync, presence      |
| Physics    | PHYSICS_ENGINE_QUICK_REFERENCE.md  | 2D AABB, gravity, forces, raycast         |
| Poker      | POKER_ENGINE_QUICK_REFERENCE.md    | Texas Hold'em, hand evaluation            |
| Tactical   | TACTICAL_ENGINE_QUICK_REFERENCE.md | Fire Emblem combat, weapon triangle       |
| UI/Blessed | UI_BLESSED_QUICK_REFERENCE.md      | 30+ widgets, forms, dialogs               |

### What Each Reference Includes

- **Import statements** - Correct paths and named exports
- **Core API methods** - Primary functions with signatures
- **Configuration options** - All configurable settings
- **Common patterns/examples** - Copy-paste code snippets
- **Reference tables** - Enums, options, and constants

### Engines Used by GRANDMASTER

```typescript
// Core game engines
import { GraphicsEngine } from '@amiexpress/bbs-door-sdk/engines/graphics';
import { InputEngine } from '@amiexpress/bbs-door-sdk/engines/input';
import { AudioEngine } from '@amiexpress/bbs-door-sdk/engines/audio';
import { TrackerEngine } from '@amiexpress/bbs-door-sdk/engines/audio';

// Multiplayer
import { NetworkEngine } from '@amiexpress/bbs-door-sdk/engines/network';

// AI opponents
import { AIEngine } from '@amiexpress/bbs-door-sdk/engines/ai';

// UI framework
import blessed from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createBox, createList } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';

// Physics (for particle effects, screen shake)
import { PhysicsEngine } from '@amiexpress/bbs-door-sdk/engines/physics';
```

### Quick Reference Locations

```
sdk/docs/
├── AI_ENGINE_QUICK_REFERENCE.md
├── AUDIO_ENGINE_QUICK_REFERENCE.md
├── CARDS_ENGINE_QUICK_REFERENCE.md
├── GRAPHICS_ENGINE_QUICK_REFERENCE.md
├── INPUT_ENGINE_QUICK_REFERENCE.md
├── NETWORK_ENGINE_QUICK_REFERENCE.md
├── NETWORK_ENGINE_GUIDE.md           # Full network guide
├── PHYSICS_ENGINE_QUICK_REFERENCE.md
├── POKER_ENGINE_QUICK_REFERENCE.md
├── TACTICAL_ENGINE_QUICK_REFERENCE.md
├── UI_BLESSED_QUICK_REFERENCE.md
└── NEO_BLESSED_GUIDE.md              # Full blessed guide
```

---

## The GRANDMASTER Promise

This isn't just a game. It's a **competitive ecosystem** that will:

1. **Captivate** players from the first frame
2. **Challenge** them with authentic TGM3 mechanics
3. **Connect** them through real-time multiplayer
4. **Reward** them with meaningful progression
5. **Inspire** them to push for Grand Master

**GRANDMASTER will be the definitive proof that terminal gaming can rival any graphical game in depth, polish, and competitive spirit.**

---

*Last updated: December 2024*
*Version: 2.0 - Next-Gen Edition*
