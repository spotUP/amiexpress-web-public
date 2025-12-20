# SDK v2.0 - Comprehensive Feature Guide

This guide shows how to use ALL the features available in the SDK v2.0:
- Full BBS API (40+ functions)
- Game Engines (Audio, Graphics, Physics, AI, etc.)
- UI Components (Menus, HUD, Inventory, etc.)
- Advanced Features

## Table of Contents

1. [Full BBS API Reference](#full-bbs-api-reference)
2. [Game Engines](#game-engines)
3. [UI Components](#ui-components)
4. [Complete Game Example](#complete-game-example)
5. [ClientDoor API](#clientdoor-api-hybridclient-doors)

---

## Full BBS API Reference

The `ctx.bbs` object provides access to all AmiExpress door functions:

### Output Functions

```typescript
import { CoreDoor as Door } from '@amiexpress/bbs-door-sdk';

const door = new Door({ name: 'Output Demo', version: '1.0.0', author: 'You' });

door.onStart(async (ctx) => {
  // Basic output
  ctx.bbs.write('Hello ');          // No newline
  ctx.bbs.writeLine('World!');      // With newline

  // Screen control
  ctx.bbs.clearScreen();
  ctx.bbs.moveCursor(10, 5);        // Row 10, Col 5
  ctx.bbs.setColor(32);             // ANSI green

  // Terminal info
  const { width, height } = ctx.bbs.getTerminalSize();
  ctx.bbs.writeLine(`Terminal: ${width}x${height}`);

  // PETSCII support (C64 terminals)
  if (ctx.bbs.isPetsciiMode()) {
    ctx.bbs.writePetscii(Buffer.from([0x93, 0x05])); // Clear + white
  }

  // Auto-detect ANSI or PETSCII
  ctx.bbs.writeAuto('\x1b[32mGreen text\x1b[0m', Buffer.from([0x1e, 'TEXT']));

  // MCI codes
  ctx.bbs.displayMCI('Hello ~UN! You have ~UR minutes left.');
});
```

### Input Functions

```typescript
door.onStart(async (ctx) => {
  // Line input
  const name = await ctx.bbs.getLine('Enter your name: ', 40);

  // Single key
  const key = await ctx.bbs.getKey('Press any key...');

  // Hotkey menu
  const choice = await ctx.bbs.hotkey(
    ['A', 'B', 'C', 'Q'],
    '[A]ttack [B]lock [C]ast spell [Q]uit: '
  );

  // Real-time game input
  ctx.bbs.enableGameMode();

  ctx.bbs.onKeyDown((key, keyState) => {
    if (key === 'ArrowUp') {
      // Move player up
    }
    if (keyState['Shift'] && key === 'Space') {
      // Fire special weapon
    }
  });

  // Check key state
  if (ctx.bbs.isKeyPressed('Space')) {
    // Fire weapon
  }

  const pressedKeys = ctx.bbs.getPressedKeys();
  // ['ArrowLeft', 'Space', 'Shift']
});
```

### User Functions

```typescript
door.onStart(async (ctx) => {
  const user = ctx.bbs.getUser();
  if (user) {
    ctx.bbs.writeLine(`Username: ${user.username}`);
    ctx.bbs.writeLine(`Real name: ${user.realname}`);
    ctx.bbs.writeLine(`Location: ${user.location}`);
    ctx.bbs.writeLine(`Security level: ${user.secLevel}`);
    ctx.bbs.writeLine(`Calls: ${user.numCalls}`);
    ctx.bbs.writeLine(`Downloads: ${user.downloads} / Uploads: ${user.uploads}`);
  }

  const secLevel = ctx.bbs.getUserSecLevel();
  const timeLeft = ctx.bbs.getTimeRemaining();    // Minutes
  const timeOnline = ctx.bbs.getTimeOnline();     // Minutes

  ctx.bbs.writeLine(`Time left: ${timeLeft} mins`);
});
```

### Conference Functions

```typescript
door.onStart(async (ctx) => {
  // Current conference
  const confNum = ctx.bbs.getCurrentConference();
  const confName = ctx.bbs.getCurrentConferenceName();

  ctx.bbs.writeLine(`You are in: ${confName} (#${confNum})`);

  // List all conferences
  const conferences = await ctx.bbs.listConferences();
  for (const conf of conferences) {
    ctx.bbs.writeLine(`[${conf.id}] ${conf.name} - Access: ${conf.accessLevel}`);
  }

  // Join conference
  const success = await ctx.bbs.joinConference(2);
  if (success) {
    ctx.bbs.writeLine('Joined conference 2');
  }
});
```

### System Functions

```typescript
door.onStart(async (ctx) => {
  const nodeNum = ctx.bbs.getNodeNumber();
  const sysInfo = ctx.bbs.getSystemInfo();

  ctx.bbs.writeLine(`BBS: ${sysInfo.bbsName}`);
  ctx.bbs.writeLine(`Sysop: ${sysInfo.sysopName}`);
  ctx.bbs.writeLine(`Version: ${sysInfo.version}`);
  ctx.bbs.writeLine(`Nodes: ${sysInfo.nodes}`);
  ctx.bbs.writeLine(`You are on node: ${nodeNum}`);

  // Who's online
  const nodes = await ctx.bbs.getNodes();
  for (const node of nodes) {
    if (node.online) {
      ctx.bbs.writeLine(`Node ${node.nodeId}: ${node.username} - ${node.activity}`);
    }
  }
});
```

### File Functions

```typescript
door.onStart(async (ctx) => {
  // Read file
  const content = await ctx.bbs.readFile('doors/mygame/data.txt');
  if (content) {
    ctx.bbs.writeLine(content);
  }

  // Write file
  await ctx.bbs.writeFile('doors/mygame/scores.txt', 'High Score: 1000\n');

  // Check if file exists
  if (await ctx.bbs.fileExists('doors/mygame/config.json')) {
    // Load config
  }

  // List files
  const files = await ctx.bbs.listFiles('doors/mygame', '*.txt');
  for (const file of files) {
    ctx.bbs.writeLine(`Found: ${file}`);
  }

  // Display file to user (with ANSI/MCI processing)
  await ctx.bbs.displayFile('doors/mygame/welcome.ans');
});
```

### Message Functions

```typescript
door.onStart(async (ctx) => {
  // Send private message
  await ctx.bbs.sendMessage(
    'Sysop',
    'High Score!',
    'I just got a score of 10,000 in your game!'
  );

  // Post to current conference
  await ctx.bbs.postMessage(
    'New High Score',
    'Check out my amazing score in the game!'
  );
});
```

### Utility Functions

```typescript
door.onStart(async (ctx) => {
  // Log activity
  await ctx.bbs.logActivity('game_started', 'User started new game');
  await ctx.bbs.logActivity('high_score', `Score: ${score}`);

  // Pause with custom prompt
  await ctx.bbs.pause('\r\n[Press SPACE to continue]');
});
```

---

## Game Engines

The SDK includes powerful game engines that work with the BBS API.

### Audio Engine (Tone.js)

```typescript
import { CoreDoor as Door } from '@amiexpress/bbs-door-sdk';
import { AudioEngine } from '@amiexpress/bbs-door-sdk';

const door = new Door({ name: 'Music Game', version: '1.0.0', author: 'You' });
const audio = new AudioEngine();

door.onStart(async (ctx) => {
  // Play notes
  audio.playNote('C4', 0.5);  // Quarter note
  audio.playNote('E4', 0.5);
  audio.playNote('G4', 1.0);  // Half note

  // Play melody
  audio.playMelody([
    { note: 'C4', duration: 0.25 },
    { note: 'D4', duration: 0.25 },
    { note: 'E4', duration: 0.25 },
    { note: 'F4', duration: 0.25 },
    { note: 'G4', duration: 1.0 }
  ]);

  // Play chord
  audio.playChord(['C4', 'E4', 'G4'], 1.0);

  // Sound effects
  audio.playSoundEffect('explosion');
  audio.playSoundEffect('powerup');

  // Background music
  audio.playBackgroundMusic('game_theme');
  audio.setVolume(0.5);
  audio.stopBackgroundMusic();
});
```

### Graphics Engine (Braille/ASCII)

```typescript
import { GraphicsEngine, BrailleCanvas } from '@amiexpress/bbs-door-sdk';

door.onStart(async (ctx) => {
  const gfx = new GraphicsEngine(ctx.bbs);

  // Draw shapes
  gfx.drawLine(0, 0, 79, 23);
  gfx.drawRect(10, 5, 30, 10);
  gfx.drawCircle(40, 12, 8);
  gfx.fillRect(50, 15, 60, 20, '#');

  // Braille graphics (high resolution)
  const canvas = new BrailleCanvas(80, 24);
  canvas.setPixel(10, 10, true);
  canvas.drawLine(0, 0, 79, 23);
  canvas.drawCircle(40, 12, 8);

  const ansiOutput = canvas.render();
  ctx.bbs.write(ansiOutput);

  // Waveform visualizer
  const waveform = new BrailleWaveform(80, 8);
  waveform.addSample(0.5);
  waveform.addSample(0.8);
  waveform.addSample(0.3);
  ctx.bbs.write(waveform.render());

  // VU meter
  const vu = new BrailleVUMeter(20, 4);
  vu.setLevel(0.75);  // 75%
  ctx.bbs.write(vu.render());
});
```

### Card Engine (Playing Cards + UNO)

```typescript
import { CardEngine } from '@amiexpress/bbs-door-sdk';

door.onStart(async (ctx) => {
  const cards = new CardEngine(); // defaults to ASCII + ANSI colors

  const deck = cards.buildStandardDeck();
  const hand = cards.shuffleCards(deck, 'seed-1').slice(0, 5);

  const handArt = cards.renderHand(hand, { layout: 'flat-condensed' });
  await ctx.output.write(handArt + '\r\n');

  const unoArt = cards.renderUnoHand(
    [
      { color: 'R', value: '5' },
      { color: 'G', value: 'draw2' }
    ],
    { layout: 'flat-condensed' }
  );
  await ctx.output.write(unoArt + '\r\n');
});
```

### Poker Engine (Texas Hold'em)

```typescript
import { PokerEngine, ActionType } from '@amiexpress/bbs-door-sdk';

door.onStart(async (ctx) => {
  const poker = new PokerEngine({ smallBlind: 10, bigBlind: 20 });

  poker.sit(0, 'p1', 'Alice', 1000);
  poker.sit(1, 'p2', 'Bob', 1000);
  poker.sit(2, 'p3', 'Cara', 1000);

  poker.deal();

  await ctx.output.writeLine('Board:');
  for (const line of poker.renderBoardLines({ layout: 'flat' })) {
    await ctx.output.writeLine(line);
  }

  await ctx.output.writeLine('');
  await ctx.output.writeLine('Alice hand:');
  for (const line of poker.renderPlayerHandLines('p1', { layout: 'flat' })) {
    await ctx.output.writeLine(line);
  }

  // Example action
  poker.act({ type: ActionType.CALL, playerId: 'p1' });
});
```

Notes:
- PokerEngine uses two-character card codes (`As`, `Td`, `7h`). The SDK helpers normalize `T` to `10` for CardEngine rendering.

### Physics Engine

```typescript
import { PhysicsEngine } from '@amiexpress/bbs-door-sdk';

door.onStart(async (ctx) => {
  const physics = new PhysicsEngine();

  // Create objects
  const player = physics.createBody({
    x: 40,
    y: 12,
    vx: 0,
    vy: 0,
    mass: 1,
    friction: 0.9
  });

  const enemy = physics.createBody({
    x: 60,
    y: 10,
    vx: -2,
    vy: 0,
    mass: 2
  });

  // Add gravity
  physics.setGravity(0, 0.5);

  // Game loop
  const gameLoop = setInterval(() => {
    // Update physics
    physics.update(1/60);  // 60 FPS

    // Check collisions
    if (physics.checkCollision(player, enemy)) {
      audio.playSoundEffect('collision');
    }

    // Render
    ctx.bbs.clearScreen();
    ctx.bbs.moveCursor(Math.floor(player.y), Math.floor(player.x));
    ctx.bbs.write('@');
    ctx.bbs.moveCursor(Math.floor(enemy.y), Math.floor(enemy.x));
    ctx.bbs.write('E');
  }, 16);  // ~60 FPS

  // Apply force
  ctx.bbs.onKeyDown((key) => {
    if (key === 'ArrowUp') physics.applyForce(player, 0, -5);
    if (key === 'ArrowDown') physics.applyForce(player, 0, 5);
    if (key === 'ArrowLeft') physics.applyForce(player, -5, 0);
    if (key === 'ArrowRight') physics.applyForce(player, 5, 0);
  });
});
```

### UI Engine (Neo-Blessed)

```typescript
import { UIEngine } from '@amiexpress/bbs-door-sdk';

door.onStart(async (ctx) => {
  const ui = new UIEngine(ctx.bbs);

  // Create menu
  const menu = ui.createMenu({
    title: 'Main Menu',
    items: [
      { label: 'New Game', value: 'new' },
      { label: 'Load Game', value: 'load' },
      { label: 'Options', value: 'options' },
      { label: 'Quit', value: 'quit' }
    ]
  });

  const choice = await menu.show();

  // Create dialog
  const confirm = await ui.confirm('Start new game?');
  if (confirm) {
    // Start game
  }

  // Input dialog
  const name = await ui.prompt('Enter your name:', { maxLength: 20 });

  // List selection
  const items = ['Item 1', 'Item 2', 'Item 3'];
  const selected = await ui.select('Choose item:', items);

  // Progress bar
  const progress = ui.createProgressBar({ max: 100 });
  for (let i = 0; i <= 100; i++) {
    progress.update(i);
    await sleep(50);
  }

  // Status bar
  ui.createStatusBar({
    left: 'HP: 100/100',
    center: 'Level 5',
    right: 'Gold: 1500'
  });
});
```

### AI Engine

```typescript
import { AIEngine } from '@amiexpress/bbs-door-sdk';

door.onStart(async (ctx) => {
  const ai = new AIEngine();

  // Pathfinding
  const map = [
    [0, 0, 0, 1, 0],
    [0, 1, 0, 1, 0],
    [0, 1, 0, 0, 0],
    [0, 0, 0, 1, 0]
  ];

  const path = ai.findPath(
    map,
    { x: 0, y: 0 },  // Start
    { x: 4, y: 3 }   // Goal
  );

  // Enemy AI behavior
  const enemyAI = ai.createBehaviorTree({
    selector: [
      {
        sequence: [
          () => ai.canSeePlayer(),
          () => ai.attackPlayer()
        ]
      },
      {
        sequence: [
          () => ai.isLowHealth(),
          () => ai.flee()
        ]
      },
      () => ai.patrol()
    ]
  });

  enemyAI.tick();

  // Decision making
  const decision = ai.makeDecision({
    health: 50,
    enemyDistance: 5,
    hasPotion: true
  }, [
    { condition: (state) => state.health < 30 && state.hasPotion, action: 'usePotion' },
    { condition: (state) => state.enemyDistance < 3, action: 'attack' },
    { condition: (state) => state.enemyDistance > 10, action: 'advance' },
    { condition: () => true, action: 'defend' }
  ]);
});
```

### Tactical Combat Engine

```typescript
import { TacticalCombatEngine } from '@amiexpress/bbs-door-sdk';

door.onStart(async (ctx) => {
  const combat = new TacticalCombatEngine();

  // Create grid-based battle
  combat.createGrid(20, 10);

  // Add combatants
  const player = combat.addUnit({
    name: 'Player',
    hp: 100,
    attack: 15,
    defense: 10,
    movement: 5,
    position: { x: 2, y: 5 }
  });

  const enemy = combat.addUnit({
    name: 'Goblin',
    hp: 50,
    attack: 8,
    defense: 5,
    movement: 4,
    position: { x: 15, y: 5 }
  });

  // Combat loop
  while (!combat.isBattleOver()) {
    // Show grid
    combat.renderGrid(ctx.bbs);

    // Get valid moves
    const moves = combat.getValidMoves(player);

    // Get valid attacks
    const targets = combat.getAttackTargets(player);

    // Player turn
    const action = await ctx.bbs.hotkey(['M', 'A', 'S'], '[M]ove [A]ttack [S]kill: ');

    if (action === 'M') {
      const newPos = await selectPosition(ctx, moves);
      combat.moveUnit(player, newPos);
    } else if (action === 'A') {
      const target = await selectTarget(ctx, targets);
      combat.attack(player, target);
    }

    // Enemy AI turn
    combat.aiTurn(enemy);

    // End turn
    combat.endTurn();
  }

  const winner = combat.getWinner();
  ctx.bbs.writeLine(`${winner.name} wins!`);
});
```

---

## UI Components

### Menu System

```typescript
import { MenuSystem } from '@amiexpress/bbs-door-sdk';

door.onStart(async (ctx) => {
  const menu = new MenuSystem(ctx.bbs);

  menu.addItem('new_game', 'New Game', () => startNewGame());
  menu.addItem('continue', 'Continue', () => loadGame());
  menu.addItem('options', 'Options', () => showOptions());
  menu.addItem('quit', 'Quit', () => door.exit());

  await menu.show();
});
```

### HUD Builder

```typescript
import { HUDBuilder } from '@amiexpress/bbs-door-sdk';

door.onStart(async (ctx) => {
  const hud = new HUDBuilder(ctx.bbs);

  hud.addElement('health', { x: 1, y: 1, format: 'HP: {value}/{max}' });
  hud.addElement('mana', { x: 1, y: 2, format: 'MP: {value}/{max}' });
  hud.addElement('level', { x: 60, y: 1, format: 'Level: {value}' });
  hud.addElement('gold', { x: 60, y: 2, format: 'Gold: {value}' });

  hud.update('health', { value: 85, max: 100 });
  hud.update('mana', { value: 50, max: 75 });
  hud.update('level', { value: 5 });
  hud.update('gold', { value: 1500 });

  hud.render();
});
```

### Inventory System

```typescript
import { InventorySystem } from '@amiexpress/bbs-door-sdk';

door.onStart(async (ctx) => {
  const inventory = new InventorySystem({ capacity: 20 });

  // Add items
  inventory.addItem({ id: 'sword', name: 'Iron Sword', weight: 5, type: 'weapon' });
  inventory.addItem({ id: 'potion', name: 'Health Potion', weight: 1, quantity: 5 });

  // Show inventory
  const items = inventory.getItems();
  for (const item of items) {
    ctx.bbs.writeLine(`${item.name} x${item.quantity || 1}`);
  }

  // Use item
  const potion = inventory.findItem('potion');
  if (potion) {
    inventory.removeItem('potion', 1);
    // Heal player
  }

  // Check capacity
  const weight = inventory.getTotalWeight();
  const capacity = inventory.getCapacity();
  ctx.bbs.writeLine(`Weight: ${weight}/${capacity}`);
});
```

---

## Complete Game Example

Here's a complete game using multiple engines:

```typescript
import { CoreDoor as Door, AnsiColor } from '@amiexpress/bbs-door-sdk';
import {
  AudioEngine,
  GraphicsEngine,
  PhysicsEngine,
  HUDBuilder,
  InventorySystem
} from '@amiexpress/bbs-door-sdk';

const door = new Door({
  name: 'Space Combat',
  version: '1.0.0',
  author: 'You',
  description: 'Real-time space combat game'
});

// Game state
let gameState: any = {};

door.onStart(async (ctx) => {
  // Initialize engines
  const audio = new AudioEngine();
  const gfx = new GraphicsEngine(ctx.bbs);
  const physics = new PhysicsEngine();
  const hud = new HUDBuilder(ctx.bbs);
  const inventory = new InventorySystem({ capacity: 10 });

  // Setup HUD
  hud.addElement('health', { x: 1, y: 1, format: 'HP: {value}/{max}' });
  hud.addElement('shields', { x: 1, y: 2, format: 'Shields: {value}/{max}' });
  hud.addElement('score', { x: 60, y: 1, format: 'Score: {value}' });
  hud.addElement('level', { x: 60, y: 2, format: 'Level: {value}' });

  // Create player ship
  const player = physics.createBody({
    x: 40, y: 20,
    vx: 0, vy: 0,
    mass: 1
  });

  // Game state
  gameState = {
    player,
    health: 100,
    shields: 100,
    score: 0,
    level: 1,
    enemies: [],
    bullets: []
  };

  // Start background music
  audio.playBackgroundMusic('space_theme');

  // Enable real-time input
  ctx.bbs.enableGameMode();

  // Input handlers
  ctx.bbs.onKeyDown((key, keyState) => {
    if (key === 'ArrowUp') physics.applyForce(player, 0, -2);
    if (key === 'ArrowDown') physics.applyForce(player, 0, 2);
    if (key === 'ArrowLeft') physics.applyForce(player, -2, 0);
    if (key === 'ArrowRight') physics.applyForce(player, 2, 0);

    if (key === 'Space') {
      fireBullet();
      audio.playSoundEffect('laser');
    }
  });

  // Game loop
  const gameLoop = setInterval(() => {
    // Update physics
    physics.update(1/60);

    // Update game logic
    updateEnemies();
    updateBullets();
    checkCollisions();

    // Render
    render(ctx, gfx, hud);
  }, 16);  // 60 FPS

  // Spawn enemies
  setInterval(() => spawnEnemy(physics), 2000);

  function fireBullet() {
    const bullet = physics.createBody({
      x: player.x,
      y: player.y - 1,
      vx: 0,
      vy: -10,
      mass: 0.1
    });
    gameState.bullets.push(bullet);
  }

  function spawnEnemy(physics: PhysicsEngine) {
    const enemy = physics.createBody({
      x: Math.random() * 70 + 5,
      y: 2,
      vx: 0,
      vy: 2,
      mass: 1
    });
    gameState.enemies.push(enemy);
  }

  function updateEnemies() {
    // Move enemies
    gameState.enemies = gameState.enemies.filter((enemy: any) => {
      if (enemy.y > 24) return false;  // Off screen
      return true;
    });
  }

  function updateBullets() {
    // Remove off-screen bullets
    gameState.bullets = gameState.bullets.filter((bullet: any) => {
      return bullet.y > 0;
    });
  }

  function checkCollisions() {
    // Bullet vs Enemy
    for (const bullet of gameState.bullets) {
      for (const enemy of gameState.enemies) {
        if (physics.checkCollision(bullet, enemy)) {
          // Hit!
          audio.playSoundEffect('explosion');
          gameState.score += 100;

          // Remove both
          gameState.bullets = gameState.bullets.filter((b: any) => b !== bullet);
          gameState.enemies = gameState.enemies.filter((e: any) => e !== enemy);
        }
      }
    }

    // Enemy vs Player
    for (const enemy of gameState.enemies) {
      if (physics.checkCollision(enemy, player)) {
        audio.playSoundEffect('damage');
        gameState.health -= 10;
        gameState.enemies = gameState.enemies.filter((e: any) => e !== enemy);

        if (gameState.health <= 0) {
          gameOver();
        }
      }
    }
  }

  function render(ctx: any, gfx: GraphicsEngine, hud: HUDBuilder) {
    // Clear screen
    ctx.bbs.clearScreen();

    // Draw player
    ctx.bbs.moveCursor(Math.floor(player.y), Math.floor(player.x));
    ctx.bbs.setColor(36);  // Cyan
    ctx.bbs.write('^');

    // Draw enemies
    for (const enemy of gameState.enemies) {
      ctx.bbs.moveCursor(Math.floor(enemy.y), Math.floor(enemy.x));
      ctx.bbs.setColor(31);  // Red
      ctx.bbs.write('V');
    }

    // Draw bullets
    for (const bullet of gameState.bullets) {
      ctx.bbs.moveCursor(Math.floor(bullet.y), Math.floor(bullet.x));
      ctx.bbs.setColor(33);  // Yellow
      ctx.bbs.write('|');
    }

    // Update HUD
    hud.update('health', { value: gameState.health, max: 100 });
    hud.update('shields', { value: gameState.shields, max: 100 });
    hud.update('score', { value: gameState.score });
    hud.update('level', { value: gameState.level });
    hud.render();
  }

  function gameOver() {
    clearInterval(gameLoop);
    audio.stopBackgroundMusic();
    audio.playSoundEffect('game_over');

    ctx.bbs.clearScreen();
    ctx.bbs.moveCursor(12, 30);
    ctx.bbs.setColor(31);  // Red
    ctx.bbs.writeLine('GAME OVER');
    ctx.bbs.moveCursor(14, 25);
    ctx.bbs.setColor(37);  // White
    ctx.bbs.writeLine(`Final Score: ${gameState.score}`);

    setTimeout(() => door.exit(), 5000);
  }
});

export default door;
```

---

## ClientDoor API (Hybrid/Client Doors)

For hybrid and client doors that run in the browser, the `ClientDoor` class provides additional methods.

### Cursor Visibility

Control the text cursor visibility for games:

```typescript
import { ClientDoor } from '@amiexpress/bbs-door-sdk/client';

const door = new ClientDoor({ name: 'My Game', version: '1.0.0' });

door.onConnect(async (user) => {
  // Hide cursor during gameplay
  door.hideCursor();
  // or: door.setCursorVisible(false);

  // Game code here...

  // Show cursor before exiting
  door.showCursor();
  // or: door.setCursorVisible(true);
});
```

**Methods:**
- `setCursorVisible(visible: boolean)` - Show or hide text cursor
- `hideCursor()` - Hide the text cursor (convenience method)
- `showCursor()` - Show the text cursor (convenience method)

### Game Mode Input (Smooth Keyboard)

Hybrid/client doors automatically receive game mode input with `keydown`/`keyup` events for smooth, real-time keyboard control:

```typescript
class MyGame {
  private heldKeys: Set<string> = new Set();
  private door: ClientDoor;

  constructor() {
    this.door = new ClientDoor({ name: 'Game', version: '1.0.0' });

    // Input handler receives keydown/keyup events
    this.door.onInput((user, key) => {
      const keyType = (key as any).type;  // 'keydown' or 'keyup'
      const keyName = ((key as any).key || '').toLowerCase();

      if (keyType === 'keydown') {
        this.heldKeys.add(keyName);
      } else if (keyType === 'keyup') {
        this.heldKeys.delete(keyName);
      }
    });

    // Process held keys in update loop for smooth movement
    this.door.onUpdate((delta) => {
      if (this.heldKeys.has('arrowleft')) {
        this.movePlayer(-1, 0);
      }
      if (this.heldKeys.has('arrowright')) {
        this.movePlayer(1, 0);
      }
    });
  }
}
```

### Mouse Events

Mouse events come through `onInput()` as JSON-encoded strings:

```typescript
door.onInput((user, key) => {
  const keyStr = typeof key === 'string' ? key : key.key;

  if (keyStr?.startsWith('{')) {
    try {
      const event = JSON.parse(keyStr);
      // event.type: 'mouse-click', 'mouse-hover', 'mouse-drag', 'mouse-up'
      // event.x: column (0-indexed, add 1 for ANSI positioning)
      // event.y: row (0-indexed, add 1 for ANSI positioning)
      // event.button: 0=left, 1=middle, 2=right

      const mouseX = event.x + 1;  // Convert to 1-indexed
      const mouseY = event.y + 1;

      if (event.type === 'mouse-click') {
        this.handleClick(mouseX, mouseY);
      } else if (event.type === 'mouse-hover') {
        this.handleHover(mouseX, mouseY);
      }
    } catch (e) {
      // Not a mouse event
    }
  }
});
```

**Best Practice:** Make all "Press Enter" prompts respond to mouse clicks:

```typescript
if (event.type === 'mouse-click') {
  switch (this.state) {
    case 'gameover':
    case 'victory':
    case 'help':
      // Click anywhere acts like pressing Enter
      this.state = 'menu';
      break;
  }
}
```

---

## Summary

The SDK v2.0 provides:

1. **Full BBS API** - 40+ functions matching native AmiExpress capabilities
2. **Game Engines** - Audio, Graphics, Physics, AI, Combat
3. **UI Components** - Menus, HUD, Inventory, Dialogs
4. **ClientDoor API** - Cursor control, game mode input, mouse events
5. **Type Safety** - Full TypeScript types for everything
6. **Easy Integration** - All features work together seamlessly

You can mix and match any combination of these features to create sophisticated BBS games and applications!
