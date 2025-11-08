/**
 * Space Shooter - Simple BBS Door Game
 * Demonstrates GraphicsEngine and basic game loop
 */

import { Door, GraphicsEngine, AnsiColor } from '@amiexpress/bbs-door-sdk';

interface Player {
  x: number;
  y: number;
  lives: number;
}

interface Enemy {
  x: number;
  y: number;
  active: boolean;
}

interface Bullet {
  x: number;
  y: number;
  active: boolean;
}

class SpaceShooter {
  private door: Door;
  private gfx: GraphicsEngine;
  private player: Player;
  private enemies: Enemy[] = [];
  private bullets: Bullet[] = [];
  private score = 0;
  private gameRunning = false;
  private currentUserId = 0;

  constructor() {
    this.door = new Door({
      name: 'Space Shooter',
      version: '1.0.0',
      author: 'AmiExpress Team',
    });

    this.gfx = new GraphicsEngine({ width: 80, height: 24 });

    this.player = {
      x: 40,
      y: 20,
      lives: 3,
    };

    this.door.onConnect((user) => {
      this.currentUserId = user.id;
      this.startGame();
    });

    this.door.onInput((_user, key) => {
      this.handleInput(key.key);
    });
  }

  private startGame(): void {
    this.gameRunning = true;
    this.spawnEnemies();
    this.gameLoop();
  }

  private spawnEnemies(): void {
    for (let i = 0; i < 5; i++) {
      this.enemies.push({
        x: Math.floor(Math.random() * 70) + 5,
        y: Math.floor(Math.random() * 8) + 2,
        active: true,
      });
    }
  }

  private handleInput(key: string): void {
    if (!this.gameRunning) return;

    if (key === 'ArrowLeft' && this.player.x > 1) {
      this.player.x -= 2;
    } else if (key === 'ArrowRight' && this.player.x < 78) {
      this.player.x += 2;
    } else if (key === ' ') {
      // Fire bullet
      this.bullets.push({
        x: this.player.x,
        y: this.player.y - 1,
        active: true,
      });
    } else if (key === 'q' || key === 'Q') {
      this.gameRunning = false;
      this.door.disconnect(this.currentUserId);
    }
  }

  private update(): void {
    // Update bullets
    this.bullets.forEach((bullet) => {
      if (bullet.active) {
        bullet.y--;
        if (bullet.y < 0) {
          bullet.active = false;
        }
      }
    });

    // Check collisions
    this.bullets.forEach((bullet) => {
      if (!bullet.active) return;

      this.enemies.forEach((enemy) => {
        if (!enemy.active) return;

        if (Math.abs(bullet.x - enemy.x) < 2 && Math.abs(bullet.y - enemy.y) < 1) {
          bullet.active = false;
          enemy.active = false;
          this.score += 100;
        }
      });
    });

    // Remove inactive entities
    this.bullets = this.bullets.filter((b) => b.active);

    // Spawn new enemies if needed
    if (this.enemies.filter((e) => e.active).length < 3) {
      this.enemies.push({
        x: Math.floor(Math.random() * 70) + 5,
        y: 2,
        active: true,
      });
    }
  }

  private render(): void {
    this.gfx.clear(AnsiColor.Black);

    // Draw HUD
    this.gfx.drawText(2, 0, `SCORE: ${this.score.toString().padStart(6, '0')}`, AnsiColor.Yellow);
    this.gfx.drawText(30, 0, `LIVES: ${this.player.lives}`, AnsiColor.Green);
    this.gfx.drawText(60, 0, 'Q=QUIT', AnsiColor.White);

    // Draw player
    this.gfx.drawChar(this.player.x, this.player.y, '^', AnsiColor.Cyan);

    // Draw enemies
    this.enemies.forEach((enemy) => {
      if (enemy.active) {
        this.gfx.drawChar(enemy.x, enemy.y, 'V', AnsiColor.Red);
      }
    });

    // Draw bullets
    this.bullets.forEach((bullet) => {
      if (bullet.active) {
        this.gfx.drawChar(bullet.x, bullet.y, '|', AnsiColor.Yellow);
      }
    });

    // Instructions
    this.gfx.drawText(25, 23, 'ARROWS=MOVE  SPACE=FIRE', AnsiColor.White);

    this.door.sendAnsi(this.gfx.render(), this.currentUserId);
  }

  private gameLoop(): void {
    if (!this.gameRunning) return;

    this.update();
    this.render();

    setTimeout(() => this.gameLoop(), 100);
  }

  public start(): void {
    this.door.start();
  }
}

const game = new SpaceShooter();
game.start();
