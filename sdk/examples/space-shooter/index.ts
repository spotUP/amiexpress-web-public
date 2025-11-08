/**
 * Space Shooter - Complete BBS Door Game Example
 *
 * Showcases all AmiExpress SDK features:
 * - Graphics: Sprites, parallax backgrounds, particle effects
 * - Physics: Collision detection, movement
 * - Audio: Sound effects and music
 * - Input: Keyboard controls with macros
 * - Menus: Title screen, pause, game over
 * - HUD: Score, lives, wave display
 * - Persistence: High scores
 *
 * Controls:
 * - Arrow Keys: Move ship
 * - Space: Fire
 * - P: Pause
 * - Q: Quit
 */

import {
  Door,
  GraphicsEngine,
  PhysicsEngine,
  AudioEngine,
  InputEngine,
  MenuSystem,
  HUDBuilder,
  AnsiColor,
  Position,
  Size
} from '@amiexpress/bbs-door-sdk';

// ====================
// Constants
// ====================
const SCREEN_WIDTH = 80;
const SCREEN_HEIGHT = 24;
const PLAYER_SPEED = 2;
const BULLET_SPEED = 3;
const ENEMY_SPEED = 0.5;
const SPAWN_INTERVAL = 2000; // ms
const WAVE_ENEMY_COUNT = 10;

// ====================
// Types
// ====================
interface GameObject {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  alive: boolean;
  sprite: string;
}

interface Enemy extends GameObject {
  points: number;
  shootChance: number;
}

interface HighScore {
  name: string;
  score: number;
  wave: number;
  date: string;
}

// ====================
// Game State
// ====================
class GameState {
  player: GameObject;
  enemies: Enemy[] = [];
  bullets: GameObject[] = [];
  enemyBullets: GameObject[] = [];
  powerups: GameObject[] = [];

  score: number = 0;
  lives: number = 3;
  wave: number = 1;
  enemiesKilled: number = 0;

  paused: boolean = false;
  gameOver: boolean = false;

  lastSpawn: number = 0;
  lastEnemyShot: number = 0;

  highScores: HighScore[] = [];

  constructor() {
    this.player = {
      id: 'player',
      x: SCREEN_WIDTH / 2,
      y: SCREEN_HEIGHT - 3,
      vx: 0,
      vy: 0,
      width: 3,
      height: 2,
      alive: true,
      sprite: ' ^ \n<O>'
    };

    this.loadHighScores();
  }

  reset() {
    this.player.x = SCREEN_WIDTH / 2;
    this.player.y = SCREEN_HEIGHT - 3;
    this.player.alive = true;

    this.enemies = [];
    this.bullets = [];
    this.enemyBullets = [];
    this.powerups = [];

    this.score = 0;
    this.lives = 3;
    this.wave = 1;
    this.enemiesKilled = 0;

    this.paused = false;
    this.gameOver = false;
  }

  loadHighScores() {
    // In production, load from file/database
    this.highScores = [
      { name: 'ACE', score: 10000, wave: 10, date: '2025-01-01' },
      { name: 'NOVA', score: 7500, wave: 8, date: '2025-01-02' },
      { name: 'PILOT', score: 5000, wave: 6, date: '2025-01-03' }
    ];
  }

  saveHighScore(name: string) {
    this.highScores.push({
      name: name.substring(0, 10).toUpperCase(),
      score: this.score,
      wave: this.wave,
      date: new Date().toISOString().split('T')[0]
    });

    this.highScores.sort((a, b) => b.score - a.score);
    this.highScores = this.highScores.slice(0, 10);

    // In production, save to file/database
  }
}

// ====================
// Main Game Class
// ====================
class SpaceShooter {
  private door: Door;
  private gfx: GraphicsEngine;
  private physics: PhysicsEngine;
  private audio: AudioEngine;
  private input: InputEngine;
  private hud: HUDBuilder;

  private state: GameState;
  private gameLoopInterval?: NodeJS.Timeout;
  private userId?: number;

  constructor() {
    this.door = new Door({
      name: 'Space Shooter',
      version: '1.0.0',
      author: 'AmiExpress SDK Team',
      description: 'Retro space shooter showcasing SDK features'
    });

    this.gfx = new GraphicsEngine({ width: SCREEN_WIDTH, height: SCREEN_HEIGHT });
    this.physics = new PhysicsEngine({ gravity: 0 });
    this.audio = new AudioEngine();
    this.input = new InputEngine();
    this.hud = new HUDBuilder();

    this.state = new GameState();

    this.setupInput();
    this.setupDoorEvents();
  }

  private setupInput() {
    // Movement
    this.input.mapKey('w', 'ArrowUp');
    this.input.mapKey('a', 'ArrowLeft');
    this.input.mapKey('s', 'ArrowDown');
    this.input.mapKey('d', 'ArrowRight');

    // Actions
    this.input.bindAction('fire', ' ', () => this.fire());
    this.input.bindAction('pause', 'p', () => this.togglePause());
    this.input.bindAction('quit', 'q', () => this.quit());

    // Konami code for extra life!
    this.input.addMacro('konami', [
      'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
      'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight'
    ], 1000);
  }

  private setupDoorEvents() {
    this.door.onConnect(async (user: any) => {
      this.userId = user.id;
      console.log(`Player ${user.name} connected`);

      await this.audio.init();
      this.showTitleScreen();
    });

    this.door.onInput((key: string, userId: number) => {
      const keyEvent = {
        key,
        ctrl: false,
        alt: false,
        shift: false,
        code: key.charCodeAt(0)
      };
      this.input.processInput(keyEvent);

      // Handle movement
      if (key === 'ArrowLeft') this.state.player.vx = -PLAYER_SPEED;
      else if (key === 'ArrowRight') this.state.player.vx = PLAYER_SPEED;
      else if (key === 'ArrowUp') this.state.player.vy = -PLAYER_SPEED;
      else if (key === 'ArrowDown') this.state.player.vy = PLAYER_SPEED;
    });

    this.door.onDisconnect(() => {
      if (this.gameLoopInterval) {
        clearInterval(this.gameLoopInterval);
      }
    });
  }

  private showTitleScreen() {
    if (!this.userId) return;

    this.gfx.clear(AnsiColor.Black);

    // Title
    this.gfx.drawText(28, 5, '╔════════════════════╗', AnsiColor.Cyan);
    this.gfx.drawText(28, 6, '║  SPACE SHOOTER    ║', AnsiColor.Cyan);
    this.gfx.drawText(28, 7, '╚════════════════════╝', AnsiColor.Cyan);

    // ASCII art spaceship
    this.gfx.drawText(38, 10, ' ^ ', AnsiColor.Yellow);
    this.gfx.drawText(37, 11, '<O>', AnsiColor.Yellow);
    this.gfx.drawText(36, 12, '< * >', AnsiColor.Red);

    // Instructions
    this.gfx.drawText(30, 15, 'Press SPACE to start', AnsiColor.Green);
    this.gfx.drawText(26, 17, 'Arrow Keys: Move   Space: Fire', AnsiColor.White);
    this.gfx.drawText(31, 18, 'P: Pause   Q: Quit', AnsiColor.White);

    // High scores
    this.gfx.drawText(2, 20, 'HIGH SCORES:', AnsiColor.Yellow);
    for (let i = 0; i < Math.min(3, this.state.highScores.length); i++) {
      const hs = this.state.highScores[i];
      this.gfx.drawText(2, 21 + i,
        `${i + 1}. ${hs.name.padEnd(10)} ${hs.score.toString().padStart(6)} Wave ${hs.wave}`,
        AnsiColor.Cyan
      );
    }

    this.door.sendAnsi(this.gfx.render(), this.userId);

    // Wait for space to start
    this.input.bindAction('start', ' ', () => {
      this.input.unbindAction('start');
      this.startGame();
    });
  }

  private startGame() {
    if (!this.userId) return;

    this.state.reset();

    // Start background music
    this.audio.generateMusic({
      prompt: 'intense space battle music',
      tempo: 140,
      pattern: 'x-x-x-x-',
      instruments: ['square', 'triangle']
    });

    // Start game loop
    this.gameLoopInterval = setInterval(() => {
      if (!this.state.paused && !this.state.gameOver) {
        this.update();
      }
      this.render();
    }, 50); // 20 FPS
  }

  private update() {
    const now = Date.now();

    // Check konami code
    if (this.input.isMacroTriggered('konami')) {
      this.state.lives++;
      this.audio.playSound('powerup', { frequency: 880, duration: 0.5, envelope: 'pluck', volume: 0.7 });
      this.input.resetMacro('konami');
    }

    // Move player
    this.state.player.x += this.state.player.vx;
    this.state.player.y += this.state.player.vy;
    this.state.player.vx *= 0.7; // Friction
    this.state.player.vy *= 0.7;

    // Clamp player to screen
    this.state.player.x = Math.max(0, Math.min(SCREEN_WIDTH - this.state.player.width, this.state.player.x));
    this.state.player.y = Math.max(0, Math.min(SCREEN_HEIGHT - this.state.player.height, this.state.player.y));

    // Move bullets
    this.state.bullets.forEach(bullet => {
      bullet.y += bullet.vy;
      if (bullet.y < 0) bullet.alive = false;
    });
    this.state.bullets = this.state.bullets.filter(b => b.alive);

    // Move enemy bullets
    this.state.enemyBullets.forEach(bullet => {
      bullet.y += bullet.vy;
      if (bullet.y > SCREEN_HEIGHT) bullet.alive = false;
    });
    this.state.enemyBullets = this.state.enemyBullets.filter(b => b.alive);

    // Spawn enemies
    if (now - this.state.lastSpawn > SPAWN_INTERVAL && this.state.enemiesKilled < WAVE_ENEMY_COUNT * this.state.wave) {
      this.spawnEnemy();
      this.state.lastSpawn = now;
    }

    // Move enemies
    this.state.enemies.forEach(enemy => {
      enemy.y += ENEMY_SPEED * this.state.wave * 0.5;
      enemy.x += Math.sin(enemy.y * 0.1) * 0.5; // Wave pattern

      // Enemy shoots randomly
      if (Math.random() < enemy.shootChance && now - this.state.lastEnemyShot > 1000) {
        this.enemyFire(enemy);
        this.state.lastEnemyShot = now;
      }

      if (enemy.y > SCREEN_HEIGHT) enemy.alive = false;
    });
    this.state.enemies = this.state.enemies.filter(e => e.alive);

    // Collision detection
    this.checkCollisions();

    // Check wave complete
    if (this.state.enemiesKilled >= WAVE_ENEMY_COUNT * this.state.wave && this.state.enemies.length === 0) {
      this.nextWave();
    }

    // Game over check
    if (this.state.lives <= 0) {
      this.endGame();
    }
  }

  private spawnEnemy() {
    const enemy: Enemy = {
      id: `enemy_${Date.now()}`,
      x: Math.random() * (SCREEN_WIDTH - 3),
      y: -2,
      vx: 0,
      vy: ENEMY_SPEED,
      width: 3,
      height: 1,
      alive: true,
      sprite: '<W>',
      points: 100,
      shootChance: 0.01
    };
    this.state.enemies.push(enemy);
  }

  private fire() {
    if (this.state.gameOver || this.state.paused) return;

    const bullet: GameObject = {
      id: `bullet_${Date.now()}`,
      x: this.state.player.x + 1,
      y: this.state.player.y - 1,
      vx: 0,
      vy: -BULLET_SPEED,
      width: 1,
      height: 1,
      alive: true,
      sprite: '|'
    };
    this.state.bullets.push(bullet);

    this.audio.playSound('shoot', { frequency: 440, duration: 0.1, envelope: 'pluck', volume: 0.3 });
  }

  private enemyFire(enemy: Enemy) {
    const bullet: GameObject = {
      id: `ebullet_${Date.now()}`,
      x: enemy.x + 1,
      y: enemy.y + 1,
      vx: 0,
      vy: BULLET_SPEED,
      width: 1,
      height: 1,
      alive: true,
      sprite: '!'
    };
    this.state.enemyBullets.push(bullet);
  }

  private checkCollisions() {
    // Player bullets vs enemies
    this.state.bullets.forEach(bullet => {
      this.state.enemies.forEach(enemy => {
        if (this.collides(bullet, enemy)) {
          bullet.alive = false;
          enemy.alive = false;
          this.state.score += enemy.points;
          this.state.enemiesKilled++;

          // Explosion particles
          this.gfx.createParticleSystem({
            type: 'explosion',
            count: 15,
            lifetime: 400,
            velocity: { min: 1, max: 4 },
            position: { x: enemy.x, y: enemy.y },
            color: AnsiColor.Red
          });

          this.audio.playSound('explosion', { frequency: 100, duration: 0.3, envelope: 'pluck', volume: 0.5 });
        }
      });
    });

    // Enemy bullets vs player
    this.state.enemyBullets.forEach(bullet => {
      if (this.collides(bullet, this.state.player)) {
        bullet.alive = false;
        this.state.lives--;

        this.gfx.createParticleSystem({
          type: 'hit',
          count: 20,
          lifetime: 500,
          velocity: { min: 2, max: 5 },
          position: { x: this.state.player.x, y: this.state.player.y },
          color: AnsiColor.Yellow
        });

        this.audio.playSound('hit', { frequency: 200, duration: 0.5, envelope: 'pluck', volume: 0.6 });
      }
    });

    // Enemies vs player
    this.state.enemies.forEach(enemy => {
      if (this.collides(enemy, this.state.player)) {
        enemy.alive = false;
        this.state.lives--;
        this.audio.playSound('hit', { frequency: 200, duration: 0.5, envelope: 'pluck', volume: 0.6 });
      }
    });
  }

  private collides(a: GameObject, b: GameObject): boolean {
    return a.alive && b.alive &&
      a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y;
  }

  private nextWave() {
    this.state.wave++;
    this.state.score += 1000;
    this.audio.playSound('wave', { frequency: 600, duration: 1.0, envelope: 'pluck', volume: 0.7 });
  }

  private togglePause() {
    this.state.paused = !this.state.paused;
  }

  private endGame() {
    this.state.gameOver = true;
    this.audio.stopMusic();
    this.audio.playSound('gameover', { frequency: 200, duration: 2.0, envelope: 'fade', volume: 0.8 });

    // Save high score if qualified
    if (this.state.highScores.length < 10 || this.state.score > this.state.highScores[9].score) {
      this.state.saveHighScore('PLAYER');
    }
  }

  private quit() {
    if (this.gameLoopInterval) {
      clearInterval(this.gameLoopInterval);
    }
    if (this.userId) {
      this.door.disconnect(this.userId);
    }
  }

  private render() {
    if (!this.userId) return;

    this.gfx.clear(AnsiColor.Black);

    // Update particles
    this.gfx.updateParticles(50);

    // Draw stars (simple parallax)
    for (let i = 0; i < 30; i++) {
      const x = Math.floor(Math.random() * SCREEN_WIDTH);
      const y = Math.floor(Math.random() * SCREEN_HEIGHT);
      this.gfx.drawChar(x, y, '.', AnsiColor.White);
    }

    // Draw particles
    this.gfx.drawParticles();

    // Draw player
    if (this.state.player.alive) {
      const lines = this.state.player.sprite.split('\n');
      lines.forEach((line, i) => {
        this.gfx.drawText(Math.floor(this.state.player.x), Math.floor(this.state.player.y) + i, line, AnsiColor.Cyan);
      });
    }

    // Draw bullets
    this.state.bullets.forEach(bullet => {
      this.gfx.drawChar(Math.floor(bullet.x), Math.floor(bullet.y), bullet.sprite, AnsiColor.Yellow);
    });

    // Draw enemies
    this.state.enemies.forEach(enemy => {
      this.gfx.drawText(Math.floor(enemy.x), Math.floor(enemy.y), enemy.sprite, AnsiColor.Red);
    });

    // Draw enemy bullets
    this.state.enemyBullets.forEach(bullet => {
      this.gfx.drawChar(Math.floor(bullet.x), Math.floor(bullet.y), bullet.sprite, AnsiColor.Magenta);
    });

    // Draw HUD
    this.hud.reset();
    this.hud.addBar('LIVES', this.state.lives, 3, { x: 2, y: 0 }, 10, AnsiColor.Green);
    this.hud.addScore('SCORE', this.state.score, { x: 30, y: 0 }, AnsiColor.Yellow);
    this.hud.addText(`WAVE ${this.state.wave}`, { x: 65, y: 0 }, AnsiColor.Cyan);

    const hudOutput = this.hud.render();
    this.gfx.drawText(0, 0, hudOutput, AnsiColor.White);

    // Paused overlay
    if (this.state.paused) {
      this.gfx.drawText(35, 12, '║ PAUSED ║', AnsiColor.Yellow);
    }

    // Game over overlay
    if (this.state.gameOver) {
      this.gfx.drawText(30, 10, '╔══════════════╗', AnsiColor.Red);
      this.gfx.drawText(30, 11, '║  GAME OVER  ║', AnsiColor.Red);
      this.gfx.drawText(30, 12, '╚══════════════╝', AnsiColor.Red);
      this.gfx.drawText(26, 14, `Final Score: ${this.state.score}`, AnsiColor.Yellow);
      this.gfx.drawText(26, 15, `Wave Reached: ${this.state.wave}`, AnsiColor.Cyan);
      this.gfx.drawText(28, 17, 'Press Q to quit', AnsiColor.White);
    }

    // Send to terminal
    this.door.sendAnsi(this.gfx.render(), this.userId);
  }

  start() {
    this.door.start();
  }
}

// ====================
// Entry Point
// ====================
const game = new SpaceShooter();
game.start();
