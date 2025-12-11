"use strict";
/**
 * Space Shooter - Simple BBS Door Game
 * Demonstrates GraphicsEngine and basic game loop
 */
Object.defineProperty(exports, "__esModule", { value: true });
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
class SpaceShooter {
    constructor() {
        this.enemies = [];
        this.bullets = [];
        this.score = 0;
        this.gameRunning = false;
        this.currentUserId = 0;
        this.door = new bbs_door_sdk_1.Door({
            name: 'Space Shooter',
            version: '1.0.0',
            author: 'AmiExpress Team',
        });
        this.gfx = new bbs_door_sdk_1.GraphicsEngine({ width: 80, height: 24 });
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
    startGame() {
        this.gameRunning = true;
        this.spawnEnemies();
        this.gameLoop();
    }
    spawnEnemies() {
        for (let i = 0; i < 5; i++) {
            this.enemies.push({
                x: Math.floor(Math.random() * 70) + 5,
                y: Math.floor(Math.random() * 8) + 2,
                active: true,
            });
        }
    }
    handleInput(key) {
        if (!this.gameRunning)
            return;
        if (key === 'ArrowLeft' && this.player.x > 1) {
            this.player.x -= 2;
        }
        else if (key === 'ArrowRight' && this.player.x < 78) {
            this.player.x += 2;
        }
        else if (key === ' ') {
            // Fire bullet
            this.bullets.push({
                x: this.player.x,
                y: this.player.y - 1,
                active: true,
            });
        }
        else if (key === 'q' || key === 'Q') {
            this.gameRunning = false;
            this.door.disconnect(this.currentUserId);
        }
    }
    update() {
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
            if (!bullet.active)
                return;
            this.enemies.forEach((enemy) => {
                if (!enemy.active)
                    return;
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
    render() {
        this.gfx.clear(bbs_door_sdk_1.AnsiColor.Black);
        // Draw HUD
        this.gfx.drawText(2, 0, `SCORE: ${this.score.toString().padStart(6, '0')}`, bbs_door_sdk_1.AnsiColor.Yellow);
        this.gfx.drawText(30, 0, `LIVES: ${this.player.lives}`, bbs_door_sdk_1.AnsiColor.Green);
        this.gfx.drawText(60, 0, 'Q=QUIT', bbs_door_sdk_1.AnsiColor.White);
        // Draw player
        this.gfx.drawChar(this.player.x, this.player.y, '^', bbs_door_sdk_1.AnsiColor.Cyan);
        // Draw enemies
        this.enemies.forEach((enemy) => {
            if (enemy.active) {
                this.gfx.drawChar(enemy.x, enemy.y, 'V', bbs_door_sdk_1.AnsiColor.Red);
            }
        });
        // Draw bullets
        this.bullets.forEach((bullet) => {
            if (bullet.active) {
                this.gfx.drawChar(bullet.x, bullet.y, '|', bbs_door_sdk_1.AnsiColor.Yellow);
            }
        });
        // Instructions
        this.gfx.drawText(25, 23, 'ARROWS=MOVE  SPACE=FIRE', bbs_door_sdk_1.AnsiColor.White);
        this.door.sendAnsi(this.gfx.render(), this.currentUserId);
    }
    gameLoop() {
        if (!this.gameRunning)
            return;
        this.update();
        this.render();
        setTimeout(() => this.gameLoop(), 100);
    }
    start() {
        this.door.start();
    }
}
const game = new SpaceShooter();
game.start();
