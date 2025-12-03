import {
  GameLoop,
  GameInput,
  ANSIColor,
  HighScoreManager,
  GameUtils,
  Sprite,
  ANSIGraphics,
  SpriteManager,
  PlatformerPhysics,
  CollisionSystem,
  ParticleSystem
} from '../../src/game-engine';

interface GameObject {
  sprite: Sprite;
  x: number;
  y: number;
  width: number;
  height: number;
  velocityX: number;
  velocityY: number;
  onGround: boolean;
}

interface Coin extends GameObject {
  collected: boolean;
}

class MarioPlatformer {
  private socket: any;
  private gameLoop: GameLoop;
  private input: GameInput;
  private highScores: HighScoreManager;
  private graphics: ANSIGraphics;
  private spriteManager: SpriteManager;
  private physics: PlatformerPhysics;
  private particleSystem: ParticleSystem;
  private username: string;
  private doorDirectory: string;

  // Game objects
  private player: GameObject;
  private platforms: GameObject[];
  private enemies: GameObject[];
  private coins: Coin[];
  private goal: GameObject;
  private enemiesGoombas: GameObject[];

  // Game state
  private gameRunning: boolean = false;
  private score: number = 0;
  private lives: number = 3;
  private level: number = 1;
  private keys: Set<string> = new Set();

  // Screen dimensions
  private readonly WIDTH = 80;
  private readonly HEIGHT = 24;

  constructor(socket: any, bbsSession: any, doorDirectory: string) {
    this.socket = socket;
    this.username = bbsSession.username || 'Player';
    this.doorDirectory = doorDirectory;

    this.input = new GameInput(socket);
    this.highScores = new HighScoreManager(doorDirectory, 'mario-scores.json');
    this.gameLoop = new GameLoop(30); // 30 FPS

    // Initialize graphics and game systems
    this.graphics = new ANSIGraphics(socket, this.WIDTH, this.HEIGHT);
    this.spriteManager = new SpriteManager(this.graphics);
    this.physics = new PlatformerPhysics();
    this.particleSystem = new ParticleSystem(socket, this.graphics);

    this.initializeSprites();
    this.setupInput(bbsSession);
    this.setupGameLoop();
  }

  private initializeSprites(): void {
    // Create Mario sprite with animation frames
    const marioFrames = [
      [
        '  @@  ',
        ' @@@@ ',
        ' @@@@ ',
        '  @@  ',
        ' @  @ ',
        '@@  @@'
      ]
    ];

    const marioSprite = new Sprite(5, 15, marioFrames, 0.2);

    // Initialize player
    this.player = {
      sprite: marioSprite,
      x: 5,
      y: 15,
      width: 6,
      height: 6,
      velocityX: 0,
      velocityY: 0,
      onGround: false
    };

    // Initialize game objects
    this.createLevel();
  }

  private createLevel(): void {
    // Clear existing objects
    this.platforms = [];
    this.enemies = [];
    this.coins = [];
    this.enemiesGoombas = [];

    // Create platforms with sprites
    const platformPositions = [
      { x: 0, y: 22, width: 80 },    // Ground
      { x: 15, y: 18, width: 10 },   // Platform 1
      { x: 30, y: 14, width: 8 },    // Platform 2
      { x: 45, y: 10, width: 12 },   // Platform 3
      { x: 65, y: 6, width: 15 },    // Platform 4
    ];

    platformPositions.forEach(pos => {
      for (let x = pos.x; x < pos.x + pos.width; x += 4) {
        const platformFrames = [['####']];
        const platformSprite = new Sprite(x, pos.y, platformFrames, 1.0);

        const platform: GameObject = {
          sprite: platformSprite,
          x: x,
          y: pos.y,
          width: 4,
          height: 1,
          velocityX: 0,
          velocityY: 0,
          onGround: true
        };
        this.platforms.push(platform);
      }
    });

    // Create Goomba enemies
    const enemyPositions = [
      { x: 20, y: 16 },
      { x: 50, y: 8 },
      { x: 35, y: 12 }
    ];

    const goombaFrames = [
      [
        '  @@  ',
        ' @@@@ ',
        '@@@@@@',
        '@@  @@',
        '@@@@@@',
        ' @  @ '
      ]
    ];

    enemyPositions.forEach(pos => {
      const goombaSprite = new Sprite(pos.x, pos.y, goombaFrames, 0.3);
      const goomba: GameObject = {
        sprite: goombaSprite,
        x: pos.x,
        y: pos.y,
        width: 6,
        height: 6,
        velocityX: -1,
        velocityY: 0,
        onGround: false
      };
      this.enemiesGoombas.push(goomba);
    });

    // Create coins
    const coinPositions = [
      { x: 25, y: 15 },
      { x: 33, y: 11 },
      { x: 41, y: 7 },
      { x: 53, y: 15 },
      { x: 69, y: 3 },
      { x: 75, y: 3 }
    ];

    const coinFrames = [
      [' O '],
      [' O ']
    ];

    coinPositions.forEach(pos => {
      const coinSprite = new Sprite(pos.x, pos.y, coinFrames, 0.15);
      const coin: Coin = {
        sprite: coinSprite,
        x: pos.x,
        y: pos.y,
        width: 3,
        height: 1,
        velocityX: 0,
        velocityY: 0,
        collected: false,
        onGround: false
      };
      this.coins.push(coin);
    });

    // Create goal
    const flagFrames = [
      [
        '|===',
        '|  |'
      ]
    ];

    const flagSprite = new Sprite(70, 2, flagFrames, 1.0);
    this.goal = {
      sprite: flagSprite,
      x: 70,
      y: 2,
      width: 4,
      height: 2,
      velocityX: 0,
      velocityY: 0,
      onGround: true
    };
  }

  private setupInput(bbsSession: any): void {
    this.input.setupInputHandling(bbsSession);

    this.input.onKeyPress('arrow_left', () => {
      if (this.gameRunning) {
        this.keys.add('left');
      }
    });

    this.input.onKeyPress('arrow_right', () => {
      if (this.gameRunning) {
        this.keys.add('right');
      }
    });

    this.input.onKeyPress('space', () => {
      if (this.gameRunning && this.player.onGround) {
        this.player.velocityY = -8; // Jump strength
        this.player.onGround = false;

        // Add jump particles
        this.particleSystem.addParticle(
          this.player.x + 2,
          this.player.y + 6,
          (Math.random() - 0.5) * 2,
          Math.random() * -2,
          30,
          '*',
          ANSIColor.WHITE
        );
      }
    });

    this.input.onKeyPress('enter', () => {
      if (!this.gameRunning) {
        this.startGame();
      }
    });

    this.input.onKeyRelease('arrow_left', () => {
      this.keys.delete('left');
    });

    this.input.onKeyRelease('arrow_right', () => {
      this.keys.delete('right');
    });
  }

  private setupGameLoop(): void {
    this.gameLoop.setUpdateCallback(async (deltaTime) => {
      if (!this.gameRunning) return;

      // Handle player movement
      const moveSpeed = 3;
      if (this.keys.has('left')) {
        this.player.velocityX = -moveSpeed;
      } else if (this.keys.has('right')) {
        this.player.velocityX = moveSpeed;
      } else {
        this.player.velocityX = 0;
      }

      // Apply gravity to player
      if (!this.player.onGround) {
        this.player.velocityY += 0.5; // Gravity
      }

      // Update player position
      this.player.x += this.player.velocityX * deltaTime;
      this.player.y += this.player.velocityY * deltaTime;

      // Keep player in bounds
      this.player.x = Math.max(0, Math.min(this.WIDTH - 6, this.player.x));

      // Update enemies
      this.enemiesGoombas.forEach(enemy => {
        enemy.x += enemy.velocityX * deltaTime;

        // Reverse direction at edges
        if (enemy.x < 0 || enemy.x > this.WIDTH - 6) {
          enemy.velocityX *= -1;
        }
      });

      // Update particles
      this.particleSystem.update(deltaTime);

      // Check collisions
      this.checkCollisions();

      // Check win condition
      if (CollisionSystem.rectCollision(
        this.player.x, this.player.y, this.player.width, this.player.height,
        this.goal.x, this.goal.y, this.goal.width, this.goal.height
      )) {
        this.levelComplete();
      }

      // Check if player fell off the screen
      if (this.player.y > this.HEIGHT) {
        this.playerHurt();
      }
    });

    this.gameLoop.setRenderCallback(async () => {
      // Clear screen with graphics
      this.graphics.clear();

      // Draw game objects
      this.renderLevel();

      // Draw particles
      this.particleSystem.render();

      // Draw UI
      this.renderUI();

      // Render to screen
      this.graphics.render();

      if (!this.gameRunning) {
        await this.renderStartScreen();
      }
    });

    this.gameLoop.setInputCallback(async () => {
      // Additional input processing if needed
    });
  }

  private renderLevel(): void {
    // Draw platforms
    this.platforms.forEach(platform => {
      platform.sprite.x = platform.x;
      platform.sprite.y = platform.y;
      platform.sprite.render(this.graphics);
    });

    // Draw player
    this.player.sprite.x = this.player.x;
    this.player.sprite.y = this.player.y;
    this.player.sprite.render(this.graphics);

    // Draw enemies
    this.enemiesGoombas.forEach(enemy => {
      enemy.sprite.x = enemy.x;
      enemy.sprite.y = enemy.y;
      enemy.sprite.render(this.graphics);
    });

    // Draw coins
    this.coins.forEach(coin => {
      if (!coin.collected) {
        coin.sprite.x = coin.x;
        coin.sprite.y = coin.y;
        coin.sprite.render(this.graphics);
      }
    });

    // Draw goal
    this.goal.sprite.x = this.goal.x;
    this.goal.sprite.y = this.goal.y;
    this.goal.sprite.render(this.graphics);
  }

  private renderUI(): void {
    // Score and game info
    this.graphics.drawText(1, 1, `Score: ${this.score}`, ANSIColor.WHITE);
    this.graphics.drawText(20, 1, `Lives: ${this.lives}`, ANSIColor.RED);
    this.graphics.drawText(40, 1, `Level: ${this.level}`, ANSIColor.CYAN);

    // Game instructions
    if (this.gameRunning) {
      this.graphics.drawText(1, this.HEIGHT - 1, 'Arrow Keys: Move  SPACE: Jump', ANSIColor.BRIGHT_BLACK);
    }
  }

  private async renderStartScreen(): Promise<void> {
    this.socket.emit('ansi-output', '\x1b[2J\x1b[H'); // Clear screen

    let output = '';
    output += '\x1b[33m'; // Yellow
    output += GameUtils.centerText('MARIO PLATFORMER') + '\r\n\r\n';
    output += '\x1b[36m'; // Cyan
    output += GameUtils.centerText('Press ENTER to start playing') + '\r\n\r\n';
    output += '\x1b[90m'; // Bright black
    output += GameUtils.centerText('Arrow keys to move, SPACE to jump') + '\r\n';
    output += GameUtils.centerText('Reach the flag to complete each level') + '\r\n\r\n';

    // High scores preview
    const scores = this.highScores.getScores();
    if (scores.length > 0) {
      output += '\x1b[35m'; // Magenta
      output += GameUtils.centerText('Top Score: ' + scores[0].score) + '\r\n';
    }

    output += '\x1b[0m'; // Reset
    this.socket.emit('ansi-output', output);
  }

  private checkCollisions(): void {
    // Player vs coins
    this.coins.forEach((coin, index) => {
      if (!coin.collected && CollisionSystem.rectCollision(
        this.player.x, this.player.y, this.player.width, this.player.height,
        coin.x, coin.y, coin.width, coin.height
      )) {
        coin.collected = true;
        this.score += 100;

        // Add coin collection particles
        this.particleSystem.addParticle(
          coin.x + 1,
          coin.y,
          0,
          -3,
          30,
          '*',
          ANSIColor.YELLOW
        );
      }
    });

    // Player vs enemies
    this.enemiesGoombas.forEach(enemy => {
      if (CollisionSystem.rectCollision(
        this.player.x, this.player.y, this.player.width, this.player.height,
        enemy.x, enemy.y, enemy.width, enemy.height
      )) {
        this.playerHurt();
      }
    });

    // Platform collisions
    this.checkPlatformCollisions();
  }

  private checkPlatformCollisions(): void {
    let onGround = false;
    const playerBottom = this.player.y + this.player.height;

    this.platforms.forEach(platform => {
      if (CollisionSystem.rectCollision(
        this.player.x, this.player.y, this.player.width, this.player.height,
        platform.x, platform.y, platform.width, platform.height
      )) {
        // If player is falling onto platform
        if (this.player.velocityY > 0 && playerBottom >= platform.y) {
          this.player.y = platform.y - this.player.height;
          this.player.velocityY = 0;
          this.player.onGround = true;
          onGround = true;
        }
      }
    });

    if (!onGround && this.player.y < 22) {
      this.player.onGround = false;
    }
  }

  private playerHurt(): void {
    this.lives--;

    // Add hurt particles
    this.particleSystem.addParticle(
      this.player.x + 2,
      this.player.y + 2,
      0,
      -2,
      30,
      'X',
      ANSIColor.RED
    );

    if (this.lives <= 0) {
      this.gameOver();
    } else {
      // Reset player position
      this.player.x = 5;
      this.player.y = 15;
      this.player.velocityY = 0;
    }
  }

  private levelComplete(): void {
    this.gameRunning = false;
    this.score += 1000;
    this.level++;

    if (this.highScores.isHighScore(this.score)) {
      this.highScores.addScore(this.username, this.score, this.level);
    }

    this.socket.emit('ansi-output', '\r\n\x1b[32m'); // Green
    this.socket.emit('ansi-output', GameUtils.centerText('[SUCCESS] LEVEL COMPLETE!') + '\r\n');
    this.socket.emit('ansi-output', '\x1b[0m'); // Reset
    this.socket.emit('ansi-output', `Final Score: ${this.score}\r\n`);
    this.socket.emit('ansi-output', 'Press ENTER for next level...\r\n');

    this.createLevel(); // Create new level
  }

  private gameOver(): void {
    this.gameRunning = false;

    if (this.highScores.isHighScore(this.score)) {
      this.highScores.addScore(this.username, this.score, this.level);
    }

    this.socket.emit('ansi-output', '\r\n\x1b[31m'); // Red
    this.socket.emit('ansi-output', GameUtils.centerText('[X] GAME OVER') + '\r\n');
    this.socket.emit('ansi-output', '\x1b[0m'); // Reset
    this.socket.emit('ansi-output', `Final Score: ${this.score}\r\n`);
    this.socket.emit('ansi-output', 'Press ENTER to play again...\r\n');
  }

  private startGame(): void {
    this.gameRunning = true;
    this.score = 0;
    this.lives = 3;
    this.level = 1;

    // Reset player
    this.player.x = 5;
    this.player.y = 15;
    this.player.velocityY = 0;
    this.player.onGround = false;

    // Clear particles
    this.particleSystem.clear();

    // Reset keys
    this.keys.clear();

    // Recreate level
    this.createLevel();
  }

  public async run(): Promise<void> {
    this.socket.emit('ansi-output', '\x1b[2J\x1b[H'); // Clear screen
    this.socket.emit('ansi-output', '\x1b[33m'); // Yellow
    this.socket.emit('ansi-output', GameUtils.centerText('[GAME] Loading Mario Platformer...') + '\r\n');
    this.socket.emit('ansi-output', '\x1b[0m'); // Reset

    await new Promise(resolve => setTimeout(resolve, 1500));

    // Show high scores
    const scoresOutput = this.highScores.formatScores('[TROPHY] Mario Platformer High Scores');
    this.socket.emit('ansi-output', scoresOutput);
    this.socket.emit('ansi-output', '\r\nPress any key to continue...\r\n');

    // Initialize sprite animations
    this.spriteManager.addSprite(this.player.sprite);
    this.enemiesGoombas.forEach(enemy => this.spriteManager.addSprite(enemy.sprite));
    this.coins.forEach(coin => this.spriteManager.addSprite(coin.sprite));
    this.spriteManager.addSprite(this.goal.sprite);

    // Start game loop
    await this.gameLoop.start();
  }
}

// Export door function
export async function runDoor(doorSession: any): Promise<void> {
  const doorDirectory = doorSession.doorDirectory || process.cwd();
  const game = new MarioPlatformer(doorSession.socket, doorSession, doorDirectory);
  await game.run();
}
