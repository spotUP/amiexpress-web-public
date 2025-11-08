/**
 * {{displayName}}
 * Version {{version}}
 *
 * {{description}}
 *
 * Created with AmiExpress BBS Door SDK
 * https://github.com/amiexpress/sdk
 */

import {
  Door,
  GraphicsEngine,
  PhysicsEngine,
  AudioEngine,
  MenuSystem,
  HUDBuilder,
  AnsiColor
} from '@amiexpress/sdk';

// Create door
const door = new Door({
  name: '{{displayName}}',
  version: '{{version}}',
  author: '{{author}}',
  description: '{{description}}',
  minSecurity: 0,
  maxTime: 30
});

// Initialize engines
const gfx = new GraphicsEngine({ width: 80, height: 24 });
const audio = new AudioEngine();
const hud = new HUDBuilder();

// Game state
let score = 0;
let lives = 3;
let gameRunning = false;

/**
 * Handle user connection
 */
door.onConnect(async (user) => {
  await audio.init();
  await showMainMenu(user.id);
});

/**
 * Show main menu
 */
async function showMainMenu(userId: number): Promise<void> {
  const menu = new MenuSystem({
    title: '{{displayName}}',
    style: 'retro-neon',
    navigation: 'arrow-keys',
    modal: false,
    position: { x: 25, y: 8 }
  });

  menu.addItem('Start Game', () => startGame(userId), { key: 'S' });
  menu.addItem('Instructions', () => showInstructions(userId), { key: 'I' });
  menu.addItem('High Scores', () => showHighScores(userId), { key: 'H' });
  menu.addItem('Quit', () => quit(userId), { key: 'Q' });

  await menu.show(door, userId);
}

/**
 * Start game
 */
async function startGame(userId: number): Promise<void> {
  gameRunning = true;
  score = 0;
  lives = 3;

  // Setup HUD
  hud.addScoreCounter({
    position: { x: 60, y: 1 },
    format: 'SCORE: {score:05d}'
  });

  hud.addText('lives', {
    position: { x: 25, y: 1 },
    format: 'LIVES: {lives}',
    color: AnsiColor.Yellow
  });

  hud.setValue('score', score);
  hud.setValue('lives', lives);

  // Play game music
  audio.generateMusic({
    prompt: 'upbeat game music',
    tempo: 120,
    pattern: 'x-x-x-x-',
    instruments: ['square']
  });

  // Game loop
  await gameLoop(userId);
}

/**
 * Main game loop
 */
async function gameLoop(userId: number): Promise<void> {
  while (gameRunning && lives > 0) {
    // Handle input
    const key = await door.waitForInput(userId, 0);
    if (key) {
      await handleInput(key.key, userId);
    }

    // Update game state
    updateGame();

    // Render frame
    renderGame(userId);

    // Small delay to prevent CPU spinning
    await door.wait(16); // ~60 FPS
  }

  if (lives === 0) {
    await gameOver(userId);
  }
}

/**
 * Handle keyboard input
 */
async function handleInput(key: string, userId: number): Promise<void> {
  // TODO: Implement game controls
  if (key === 'q' || key === 'Q') {
    gameRunning = false;
    await showMainMenu(userId);
  } else if (key === 'p' || key === 'P') {
    // Pause
    gameRunning = !gameRunning;
  }
}

/**
 * Update game state
 */
function updateGame(): void {
  // TODO: Implement game logic
  // Update positions, check collisions, etc.
}

/**
 * Render game frame
 */
function renderGame(userId: number): void {
  // Clear screen
  gfx.clear(AnsiColor.Black);

  // TODO: Draw game graphics
  gfx.drawText(10, 10, '{{displayName}}', AnsiColor.Cyan);
  gfx.drawText(10, 12, 'Game running...', AnsiColor.White);
  gfx.drawText(10, 14, 'Press Q to quit, P to pause', AnsiColor.Gray);

  // Draw HUD
  const hudOutput = hud.render();

  // Send to terminal
  const output = gfx.render() + hudOutput;
  door.sendAnsi(output, userId);
}

/**
 * Game over
 */
async function gameOver(userId: number): Promise<void> {
  audio.playSound('gameover');
  audio.stopMusic();

  door.clearScreen(userId);
  door.send('\\r\\n\\r\\n', userId);
  door.send('╔════════════════════╗\\r\\n', userId);
  door.send('║    GAME OVER!     ║\\r\\n', userId);
  door.send('╚════════════════════╝\\r\\n', userId);
  door.send(`\\r\\nFinal Score: ${score}\\r\\n\\r\\n`, userId);
  door.send('Press any key...\\r\\n', userId);

  await door.waitForInput(userId);
  await showMainMenu(userId);
}

/**
 * Show instructions
 */
async function showInstructions(userId: number): Promise<void> {
  door.clearScreen(userId);
  door.send('\\r\\n', userId);
  door.send('╔══════════════════════╗\\r\\n', userId);
  door.send('║   INSTRUCTIONS     ║\\r\\n', userId);
  door.send('╚══════════════════════╝\\r\\n', userId);
  door.send('\\r\\n', userId);
  door.send('TODO: Add game instructions here\\r\\n', userId);
  door.send('\\r\\n', userId);
  door.send('Press any key...\\r\\n', userId);

  await door.waitForInput(userId);
  await showMainMenu(userId);
}

/**
 * Show high scores
 */
async function showHighScores(userId: number): Promise<void> {
  door.clearScreen(userId);
  door.send('\\r\\n', userId);
  door.send('╔══════════════════════╗\\r\\n', userId);
  door.send('║   HIGH SCORES      ║\\r\\n', userId);
  door.send('╚══════════════════════╝\\r\\n', userId);
  door.send('\\r\\n', userId);
  door.send('Coming soon!\\r\\n\\r\\n', userId);
  door.send('Press any key...\\r\\n', userId);

  await door.waitForInput(userId);
  await showMainMenu(userId);
}

/**
 * Quit game
 */
function quit(userId: number): void {
  audio.dispose();
  door.disconnect(userId);
}

// Start the door
door.start();
