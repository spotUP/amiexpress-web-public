// ANSI codes and cursor positioning
const ANSI = {
  RESET: '\x1b[0m',
  CYAN: '\x1b[36m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  RED: '\x1b[31m',
  WHITE: '\x1b[37m',
  GRAY: '\x1b[90m',
  CLEAR_SCREEN: '\x1b[2J\x1b[H',
  HIDE_CURSOR: '\x1b[?25l',
  SHOW_CURSOR: '\x1b[?25h'
};

function moveCursor(row: number, col: number): string {
  return `\x1b[${row};${col}H`;
}

function centerText(text: string, width: number = 80): string {
  const padding = Math.max(0, Math.floor((width - text.length) / 2));
  return ' '.repeat(padding) + text;
}

interface Enemy {
  x: number;
  y: number;
  alive: boolean;
}

interface Bullet {
  x: number;
  y: number;
}

interface GameState {
  playerX: number;
  enemies: Enemy[];
  bullets: Bullet[];
  score: number;
  lives: number;
  currentWave: number;
  gameRunning: boolean;
}

function createGame(): GameState {
  const enemies: Enemy[] = [];
  // Create enemy formation (3 rows, 8 columns)
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 8; col++) {
      enemies.push({
        x: 10 + col * 8,
        y: 3 + row * 3,
        alive: true
      });
    }
  }

  return {
    playerX: 40,
    enemies,
    bullets: [],
    score: 0,
    lives: 3,
    currentWave: 1,
    gameRunning: true
  };
}

function drawGame(socket: any, game: GameState): void {
  let output = ANSI.CLEAR_SCREEN + ANSI.HIDE_CURSOR;

  // Draw border
  output += ANSI.WHITE;
  output += '+' + '-'.repeat(78) + '+\r\n';
  for (let i = 0; i < 22; i++) {
    output += '|' + ' '.repeat(78) + '|\r\n';
  }
  output += '+' + '-'.repeat(78) + '+\r\n';

  // Draw UI at top
  output += moveCursor(1, 2) + ANSI.WHITE + `Score: ${game.score.toString().padStart(6)}`;
  output += moveCursor(1, 35) + ANSI.CYAN + `Wave: ${game.currentWave}`;
  output += moveCursor(1, 65) + ANSI.RED + `Lives: ${game.lives}`;

  // Draw player
  output += moveCursor(21, game.playerX) + ANSI.GREEN + '^';

  // Draw enemies
  game.enemies.forEach((enemy, index) => {
    if (enemy.alive) {
      const color = index < 8 ? ANSI.RED :
                   index < 16 ? ANSI.YELLOW : ANSI.CYAN;
      output += moveCursor(enemy.y, enemy.x) + color + 'W';
    }
  });

  // Draw bullets
  game.bullets.forEach(bullet => {
    output += moveCursor(bullet.y, bullet.x) + ANSI.YELLOW + '|';
  });

  output += moveCursor(24, 1) + ANSI.WHITE + 'Controls: A/LEFT=Left  D/RIGHT=Right  SPACE=Fire  Q=Quit';
  output += ANSI.RESET + ANSI.SHOW_CURSOR;

  socket.emit('ansi-output', output);
}

function updateGame(game: GameState): void {
  // Update bullets
  game.bullets = game.bullets.filter(bullet => {
    bullet.y--;

    // Check collision with enemies
    for (const enemy of game.enemies) {
      if (enemy.alive && Math.abs(bullet.x - enemy.x) < 2 && bullet.y === enemy.y) {
        enemy.alive = false;
        game.score += 10;
        return false; // Remove bullet
      }
    }

    return bullet.y > 1; // Remove if out of bounds
  });

  // Simple enemy movement
  game.enemies.forEach(enemy => {
    if (enemy.alive && Math.random() < 0.1) {
      enemy.x += Math.random() < 0.5 ? -1 : 1;
      enemy.x = Math.max(2, Math.min(77, enemy.x));
    }
  });
}

async function getKey(socket: any, bbsSession: any): Promise<string> {
  return new Promise<string>((resolve) => {
    bbsSession.doorInputHandler = (data: string) => {
      delete bbsSession.doorInputHandler;
      resolve(data);
    };
  });
}

async function playGame(socket: any, bbsSession: any): Promise<void> {
  const game = createGame();

  socket.emit('ansi-output', ANSI.CLEAR_SCREEN);
  socket.emit('ansi-output', ANSI.YELLOW + centerText('SPACE INVADERS', 80) + '\r\n' + ANSI.RESET);
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', 'Defend Earth from alien invasion!\r\n');
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', ANSI.GREEN + 'Controls:\r\n');
  socket.emit('ansi-output', '  A or LEFT arrow - Move left\r\n');
  socket.emit('ansi-output', '  D or RIGHT arrow - Move right\r\n');
  socket.emit('ansi-output', '  SPACE - Fire weapons\r\n');
  socket.emit('ansi-output', '  Q - Quit game\r\n' + ANSI.RESET);
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', 'Press ENTER to start...\r\n');
  await getKey(socket, bbsSession);

  let lastUpdate = Date.now();
  const updateInterval = 500; // Update every 500ms

  while (game.gameRunning && game.lives > 0) {
    drawGame(socket, game);

    // Non-blocking input with timeout
    const inputPromise = getKey(socket, bbsSession);
    const timeoutPromise = new Promise<string>((resolve) =>
      setTimeout(() => resolve('timeout'), 300)
    );

    const key = await Promise.race([inputPromise, timeoutPromise]);

    if (key !== 'timeout') {
      const keyLower = key.toLowerCase();
      switch (keyLower) {
        case 'a':
        case 'arrowleft':
          game.playerX = Math.max(2, game.playerX - 2);
          break;
        case 'd':
        case 'arrowright':
          game.playerX = Math.min(78, game.playerX + 2);
          break;
        case ' ':
          game.bullets.push({ x: game.playerX, y: 20 });
          break;
        case 'q':
          game.gameRunning = false;
          break;
      }
    }

    // Update game state periodically
    const now = Date.now();
    if (now - lastUpdate >= updateInterval) {
      updateGame(game);
      lastUpdate = now;

      // Check if wave complete
      if (game.enemies.every(e => !e.alive)) {
        socket.emit('ansi-output', ANSI.CLEAR_SCREEN);
        socket.emit('ansi-output', ANSI.GREEN);
        socket.emit('ansi-output', centerText(`WAVE ${game.currentWave} COMPLETE!`, 80) + '\r\n');
        socket.emit('ansi-output', ANSI.RESET);
        socket.emit('ansi-output', '\r\n');
        socket.emit('ansi-output', 'Press any key for next wave...\r\n');
        await getKey(socket, bbsSession);

        game.currentWave++;
        game.enemies = [];
        for (let row = 0; row < 3; row++) {
          for (let col = 0; col < 8; col++) {
            game.enemies.push({
              x: 10 + col * 8,
              y: 3 + row * 3,
              alive: true
            });
          }
        }
      }

      // Check if enemies reached bottom
      const lowestEnemy = game.enemies
        .filter(e => e.alive)
        .reduce((max, e) => Math.max(max, e.y), 0);

      if (lowestEnemy >= 20) {
        game.lives--;
        if (game.lives > 0) {
          socket.emit('ansi-output', ANSI.CLEAR_SCREEN);
          socket.emit('ansi-output', ANSI.RED);
          socket.emit('ansi-output', centerText('ENEMIES REACHED YOUR BASE!', 80) + '\r\n');
          socket.emit('ansi-output', ANSI.RESET);
          await new Promise(resolve => setTimeout(resolve, 2000));

          // Reset enemy positions
          game.enemies.forEach((enemy, index) => {
            const row = Math.floor(index / 8);
            const col = index % 8;
            enemy.x = 10 + col * 8;
            enemy.y = 3 + row * 3;
            enemy.alive = true;
          });
        }
      }
    }
  }

  // Game over
  socket.emit('ansi-output', ANSI.CLEAR_SCREEN);
  socket.emit('ansi-output', ANSI.RED);
  socket.emit('ansi-output', centerText('GAME OVER', 80) + '\r\n');
  socket.emit('ansi-output', ANSI.RESET);
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', ANSI.YELLOW);
  socket.emit('ansi-output', centerText(`Final Score: ${game.score}`, 80) + '\r\n');
  socket.emit('ansi-output', centerText(`Waves Completed: ${game.currentWave - 1}`, 80) + '\r\n');
  socket.emit('ansi-output', ANSI.RESET);
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', 'Press ENTER to exit...\r\n');
  await getKey(socket, bbsSession);
}

export async function runDoor(doorSession: any): Promise<void> {
  const { socket, bbsSession } = doorSession;
  await playGame(socket, bbsSession);
}
