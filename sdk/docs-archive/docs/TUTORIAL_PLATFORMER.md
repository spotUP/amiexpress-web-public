# Tutorial: Building a Platformer Game

Learn to create a full 2D platformer with physics, animations, and sound!

## What We'll Build

A platformer game featuring:
- Player character with jumping and movement
- Physics-based gameplay
- Platforms and obstacles
- Collectible items
- Animated sprites
- Sound effects
- HUD (score, lives, timer)
- Multiple levels

## Step 1: Project Setup

Create a new directory and initialize:

```bash
mkdir my-platformer
cd my-platformer
npm init -y
npm install @amiexpress/sdk
```

Create `platformer.ts`:

```typescript
import {
  Door,
  GraphicsEngine,
  PhysicsEngine,
  AudioEngine,
  HUDBuilder,
  AnsiColor
} from '@amiexpress/sdk';

const door = new Door({
  name: 'Super BBS Platformer',
  version: '1.0.0',
  author: 'Your Name'
});

door.start();
```

## Step 2: Initialize Engines

```typescript
const gfx = new GraphicsEngine({ width: 80, height: 24 });
const physics = new PhysicsEngine({ gravity: 20 });
const audio = new AudioEngine();
const hud = new HUDBuilder();

// Game state
let player: any;
let platforms: any[] = [];
let coins: any[] = [];
let score = 0;
let lives = 3;

door.onConnect(async (user) => {
  await audio.init();
  await initGame();
  await gameLoop(user.id);
});
```

## Step 3: Create Player

```typescript
function initGame() {
  // Create player physics body
  player = physics.createBody({
    id: 'player',
    position: { x: 10, y: 15 },
    size: { width: 2, height: 3 },
    mass: 1,
    friction: 0.9,
    bounce: 0.1,
    category: 'player'
  });

  // Player sprite
  gfx.createSprite({
    id: 'player-idle',
    frames: [
      { data: ' O\\n/|\\\\n/ \\\\', duration: 500 },
      { data: ' O\\n/|\\\\n/ \\\\', duration: 500 }
    ],
    position: player.position,
    loop: true
  });

  // Setup HUD
  hud.addHealthBar({
    position: { x: 2, y: 1 },
    width: 15,
    color: AnsiColor.Red
  });

  hud.addScoreCounter({
    position: { x: 60, y: 1 },
    format: 'SCORE: {score:05d}'
  });

  hud.addText('lives', {
    position: { x: 25, y: 1 },
    format: 'LIVES: {lives}',
    color: AnsiColor.Yellow
  });

  hud.setValue('health', 100);
  hud.setValue('score', 0);
  hud.setValue('lives', 3);
}
```

## Step 4: Create Level

```typescript
function createLevel() {
  // Ground platform
  platforms.push(
    physics.createBody({
      id: 'ground',
      position: { x: 0, y: 22 },
      size: { width: 80, height: 2 },
      static: true,
      category: 'terrain'
    })
  );

  // Floating platforms
  platforms.push(
    physics.createBody({
      id: 'platform1',
      position: { x: 20, y: 18 },
      size: { width: 15, height: 1 },
      static: true,
      category: 'terrain'
    })
  );

  platforms.push(
    physics.createBody({
      id: 'platform2',
      position: { x: 45, y: 14 },
      size: { width: 15, height: 1 },
      static: true,
      category: 'terrain'
    })
  );

  // Collectible coins
  for (let i = 0; i < 5; i++) {
    coins.push(
      physics.createBody({
        id: `coin${i}`,
        position: { x: 15 + i * 12, y: 10 },
        size: { width: 1, height: 1 },
        static: true,
        category: 'collectible'
      })
    );
  }

  // Collision handlers
  physics.onCollision('player', 'collectible', (collision) => {
    collectCoin(collision.bodyB);
  });

  physics.onCollision('player', 'terrain', (collision) => {
    // Player can jump when on ground
    canJump = true;
  });
}
```

## Step 5: Input Handling

```typescript
let canJump = false;

door.onInput((user, key) => {
  if (key.key === 'ArrowLeft') {
    // Move left
    physics.setVelocity(player, {
      x: -10,
      y: player.velocity.y
    });
  } else if (key.key === 'ArrowRight') {
    // Move right
    physics.setVelocity(player, {
      x: 10,
      y: player.velocity.y
    });
  } else if (key.key === ' ' && canJump) {
    // Jump
    physics.applyImpulse(player, { x: 0, y: -15 });
    audio.playSound('jump');
    canJump = false;
  } else if (key.key === 'q' || key.key === 'Q') {
    door.disconnect(user.id);
  }
});
```

## Step 6: Game Loop

```typescript
async function gameLoop(userId: number) {
  let lastTime = Date.now();

  while (lives > 0) {
    const now = Date.now();
    const delta = (now - lastTime) / 1000;
    lastTime = now;

    // Update physics
    physics.applyGravity(player);
    physics.update(delta);

    // Update HUD
    hud.update(delta * 1000);

    // Render frame
    render(userId);

    // Check win condition
    if (coins.length === 0) {
      await levelComplete(userId);
      break;
    }

    // Check death
    if (player.position.y > 24) {
      lives--;
      hud.setValue('lives', lives);
      audio.playSound('hit');

      if (lives > 0) {
        // Reset position
        player.position = { x: 10, y: 15 };
      }
    }

    await door.wait(16); // ~60 FPS
  }

  if (lives === 0) {
    await gameOver(userId);
  }
}
```

## Step 7: Rendering

```typescript
function render(userId: number) {
  // Clear screen
  gfx.clear(AnsiColor.Blue);

  // Draw platforms
  platforms.forEach((platform) => {
    gfx.drawRect(
      {
        x: platform.position.x,
        y: platform.position.y,
        width: platform.size.width,
        height: platform.size.height
      },
      '═',
      AnsiColor.BrightYellow
    );
  });

  // Draw coins
  coins.forEach((coin) => {
    gfx.drawChar(
      coin.position.x,
      coin.position.y,
      '$',
      AnsiColor.Yellow
    );
  });

  // Draw player
  gfx.drawChar(
    Math.floor(player.position.x),
    Math.floor(player.position.y),
    '@',
    AnsiColor.Red
  );

  // Render HUD
  const hudOutput = hud.render();

  // Send to terminal
  const output = gfx.render() + hudOutput;
  door.sendAnsi(output, userId);
}
```

## Step 8: Coin Collection

```typescript
function collectCoin(coin: any) {
  const index = coins.findIndex((c) => c.id === coin.id);
  if (index !== -1) {
    coins.splice(index, 1);
    physics.removeBody(coin.id);

    score += 100;
    hud.setValue('score', score);

    audio.playSound('coin');
  }
}
```

## Step 9: Level Complete

```typescript
async function levelComplete(userId: number) {
  audio.playSound('powerup');

  door.clearScreen(userId);
  door.send('\\r\\n\\r\\n', userId);
  door.send('╔════════════════════╗\\r\\n', userId);
  door.send('║   LEVEL COMPLETE!  ║\\r\\n', userId);
  door.send('╚════════════════════╝\\r\\n', userId);
  door.send(`\\r\\nScore: ${score}\\r\\n`, userId);
  door.send(`Lives: ${lives}\\r\\n\\r\\n`, userId);
  door.send('Press any key...\\r\\n', userId);

  await door.waitForInput(userId);

  // TODO: Load next level
  door.disconnect(userId);
}
```

## Step 10: Game Over

```typescript
async function gameOver(userId: number) {
  audio.playSound('gameover');

  door.clearScreen(userId);
  door.send('\\r\\n\\r\\n', userId);
  door.send('╔════════════════════╗\\r\\n', userId);
  door.send('║    GAME OVER!     ║\\r\\n', userId);
  door.send('╚════════════════════╝\\r\\n', userId);
  door.send(`\\r\\nFinal Score: ${score}\\r\\n\\r\\n`, userId);
  door.send('Press any key...\\r\\n', userId);

  await door.waitForInput(userId);
  door.disconnect(userId);
}
```

## Enhancement Ideas

1. **Multiple Levels**
   - Load levels from JSON files
   - Progressive difficulty
   - Different themes

2. **Enemies**
   - AI-controlled enemies
   - Patrol patterns
   - Combat mechanics

3. **Power-ups**
   - Speed boost
   - Double jump
   - Invincibility

4. **Parallax Scrolling**
   - Multi-layer backgrounds
   - Depth effects

5. **Better Graphics**
   - Animated sprites
   - Particle effects
   - Cutscenes

## Complete Code

See `examples/platformer/` for the complete, production-ready version with all enhancements!

## Next Steps

- Add save/load functionality
- Implement high scores
- Create level editor
- Add multiplayer co-op

Happy coding! 🎮
