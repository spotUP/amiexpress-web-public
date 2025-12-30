/**
 * Galaga - Game Engine
 * Core game logic for the 1981 Namco space shooter
 */

import {
  GalagaData,
  Alien,
  AlienType,
  AlienState,
  Bullet,
  Explosion,
  Star,
  Position,
} from './types';
import {
  GAME_AREA_WIDTH,
  GAME_AREA_HEIGHT,
  PLAYER_Y,
  PLAYER_SPEED,
  MAX_PLAYER_BULLETS,
  PLAYER_BULLET_SPEED,
  ENEMY_BULLET_SPEED,
  FORMATION_ROWS,
  FORMATION_COLS,
  FORMATION_START_Y,
  FORMATION_SPACING_X,
  FORMATION_SPACING_Y,
  FORMATION_SWAY_AMOUNT,
  FORMATION_LAYOUT,
  SCORES,
  COLORS,
  DIVE_PATHS,
  getStageConfig,
  GAME_TICK_MS,
} from './constants';

export class GalagaGame {
  private data: GalagaData;
  private renderCallback: (content: string) => void;
  private lastDiveTime: number = 0;
  private heldKeys: Set<string> = new Set();

  constructor(data: GalagaData, onRender: (content: string) => void) {
    this.data = data;
    this.renderCallback = onRender;
  }

  /**
   * Initialize a new stage
   */
  initStage(): void {
    const config = getStageConfig(this.data.stage);

    // Reset player
    this.data.player = {
      x: GAME_AREA_WIDTH / 2,
      y: PLAYER_Y,
      isDead: false,
      deathFrame: 0,
      hasDualFighter: false,
      isCaptured: false,
    };

    // Clear entities
    this.data.aliens = [];
    this.data.bullets = [];
    this.data.explosions = [];

    // Initialize formation
    this.data.formation = [];
    for (let row = 0; row < FORMATION_ROWS; row++) {
      this.data.formation[row] = [];
      for (let col = 0; col < FORMATION_COLS; col++) {
        this.data.formation[row][col] = {
          x: col * FORMATION_SPACING_X + 10,
          y: row * FORMATION_SPACING_Y + FORMATION_START_Y,
          occupied: false,
          alienId: null,
        };
      }
    }

    this.data.formationOffset = 0;
    this.data.formationDirection = 1;
    this.data.isChallengingStage = config.isChallengingStage;
    this.data.challengingKills = 0;
    this.data.challengingTotal = 40;

    // Spawn aliens
    this.spawnFormation();

    // Initialize stars
    this.initStars();

    this.render();
  }

  /**
   * Spawn aliens into formation
   */
  private spawnFormation(): void {
    for (let row = 0; row < FORMATION_ROWS; row++) {
      for (let col = 0; col < FORMATION_COLS; col++) {
        const type = FORMATION_LAYOUT[row]?.[col];
        if (type) {
          const slot = this.data.formation[row][col];
          const alien: Alien = {
            id: this.data.alienIdCounter++,
            type,
            state: 'formation',
            x: slot.x,
            y: slot.y,
            formationX: col,
            formationY: row,
            health: type === 'boss' ? 2 : 1,
            diveProgress: 0,
            divePath: [],
            divePathIndex: 0,
            capturedFighter: false,
            tractorBeamActive: false,
          };
          this.data.aliens.push(alien);
          slot.occupied = true;
          slot.alienId = alien.id;
        }
      }
    }
  }

  /**
   * Initialize star field
   */
  private initStars(): void {
    this.data.stars = [];
    for (let i = 0; i < 30; i++) {
      this.data.stars.push({
        x: Math.random() * GAME_AREA_WIDTH,
        y: Math.random() * GAME_AREA_HEIGHT,
        speed: 0.2 + Math.random() * 0.3,
        brightness: Math.floor(Math.random() * 3),
      });
    }
  }

  /**
   * Handle key down
   */
  handleKeyDown(key: string): void {
    this.heldKeys.add(key);
    if (key === 'fire' || key === 'space') {
      this.shoot();
    }
  }

  /**
   * Handle key up
   */
  handleKeyUp(key: string): void {
    this.heldKeys.delete(key);
  }

  /**
   * Shoot bullet
   */
  private shoot(): void {
    if (this.data.player.isDead || this.data.player.isCaptured) return;

    // Count player bullets
    const playerBullets = this.data.bullets.filter(b => !b.isEnemy);
    if (playerBullets.length >= MAX_PLAYER_BULLETS) return;

    this.data.shotsFired++;

    // Create bullet(s)
    if (this.data.player.hasDualFighter) {
      // Dual fighter shoots two bullets
      this.data.bullets.push({
        id: this.data.bulletIdCounter++,
        x: this.data.player.x - 1,
        y: this.data.player.y - 1,
        dy: PLAYER_BULLET_SPEED,
        isEnemy: false,
      });
      this.data.bullets.push({
        id: this.data.bulletIdCounter++,
        x: this.data.player.x + 1,
        y: this.data.player.y - 1,
        dy: PLAYER_BULLET_SPEED,
        isEnemy: false,
      });
    } else {
      this.data.bullets.push({
        id: this.data.bulletIdCounter++,
        x: this.data.player.x,
        y: this.data.player.y - 1,
        dy: PLAYER_BULLET_SPEED,
        isEnemy: false,
      });
    }
  }

  /**
   * Main game update
   */
  update(): void {
    const now = Date.now();
    this.data.lastUpdateTime = now;
    this.data.frameCount++;

    // Handle continuous movement
    if (this.heldKeys.has('left')) {
      this.data.player.x = Math.max(1, this.data.player.x - PLAYER_SPEED);
    }
    if (this.heldKeys.has('right')) {
      this.data.player.x = Math.min(GAME_AREA_WIDTH - 2, this.data.player.x + PLAYER_SPEED);
    }

    // Update death animation
    if (this.data.player.isDead) {
      this.data.player.deathFrame++;
      if (this.data.player.deathFrame >= 30) {
        this.respawnPlayer();
      }
      this.render();
      return;
    }

    // Update stars
    this.updateStars();

    // Update formation sway
    this.updateFormation();

    // Update aliens
    this.updateAliens();

    // Update bullets
    this.updateBullets();

    // Update explosions
    this.updateExplosions();

    // Check for stage completion
    this.checkStageComplete();

    // Trigger alien dives
    this.triggerDives();

    // Check collisions
    this.checkCollisions();

    this.render();
  }

  /**
   * Update star field
   */
  private updateStars(): void {
    for (const star of this.data.stars) {
      star.y += star.speed;
      if (star.y >= GAME_AREA_HEIGHT) {
        star.y = 0;
        star.x = Math.random() * GAME_AREA_WIDTH;
      }
    }
  }

  /**
   * Update formation position (sway)
   */
  private updateFormation(): void {
    this.data.formationOffset += 0.1 * this.data.formationDirection;
    if (Math.abs(this.data.formationOffset) >= FORMATION_SWAY_AMOUNT) {
      this.data.formationDirection *= -1;
    }

    // Update alien positions in formation
    for (const alien of this.data.aliens) {
      if (alien.state === 'formation') {
        const slot = this.data.formation[alien.formationY]?.[alien.formationX];
        if (slot) {
          alien.x = slot.x + this.data.formationOffset;
          alien.y = slot.y;
        }
      }
    }
  }

  /**
   * Update all aliens
   */
  private updateAliens(): void {
    const config = getStageConfig(this.data.stage);

    for (const alien of this.data.aliens) {
      if (alien.state === 'diving') {
        // Follow dive path
        if (alien.divePathIndex < alien.divePath.length) {
          const target = alien.divePath[alien.divePathIndex];
          const startX = alien.formationX * FORMATION_SPACING_X + 10;
          const startY = alien.formationY * FORMATION_SPACING_Y + FORMATION_START_Y;

          alien.x = startX + target.x + this.data.formationOffset;
          alien.y = startY + target.y;

          alien.diveProgress += config.alienSpeed;
          if (alien.diveProgress >= 1) {
            alien.divePathIndex++;
            alien.diveProgress = 0;

            // Enemy shooting during dive
            if (!this.data.isChallengingStage && Math.random() < 0.1) {
              this.data.bullets.push({
                id: this.data.bulletIdCounter++,
                x: alien.x,
                y: alien.y + 1,
                dy: ENEMY_BULLET_SPEED * config.bulletSpeed,
                isEnemy: true,
              });
            }
          }
        }

        // Return to formation if dive complete or off screen
        if (alien.divePathIndex >= alien.divePath.length || alien.y > GAME_AREA_HEIGHT) {
          if (this.data.isChallengingStage) {
            // In challenging stage, aliens that exit are removed
            alien.state = 'dead';
          } else {
            alien.state = 'returning';
          }
        }
      } else if (alien.state === 'returning') {
        // Move back to formation position
        const slot = this.data.formation[alien.formationY]?.[alien.formationX];
        if (slot) {
          const targetX = slot.x + this.data.formationOffset;
          const targetY = slot.y;
          const dx = targetX - alien.x;
          const dy = targetY - alien.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 1) {
            alien.state = 'formation';
            alien.x = targetX;
            alien.y = targetY;
          } else {
            alien.x += (dx / dist) * config.alienSpeed;
            alien.y += (dy / dist) * config.alienSpeed;
          }
        }
      }
    }

    // Remove dead aliens
    this.data.aliens = this.data.aliens.filter(a => a.state !== 'dead');
  }

  /**
   * Update bullets
   */
  private updateBullets(): void {
    for (const bullet of this.data.bullets) {
      bullet.y += bullet.dy;
    }

    // Remove off-screen bullets
    this.data.bullets = this.data.bullets.filter(
      b => b.y >= 0 && b.y < GAME_AREA_HEIGHT
    );
  }

  /**
   * Update explosions
   */
  private updateExplosions(): void {
    for (const exp of this.data.explosions) {
      exp.frame++;
    }
    this.data.explosions = this.data.explosions.filter(e => e.frame < e.maxFrames);
  }

  /**
   * Trigger alien dive attacks
   */
  private triggerDives(): void {
    if (this.data.isChallengingStage) return;

    const config = getStageConfig(this.data.stage);
    const now = Date.now();

    if (now - this.lastDiveTime < config.diveFrequency) return;

    // Find aliens in formation that can dive
    const formationAliens = this.data.aliens.filter(a => a.state === 'formation');
    if (formationAliens.length === 0) return;

    // Pick random alien to dive
    const alien = formationAliens[Math.floor(Math.random() * formationAliens.length)];
    this.startDive(alien);
    this.lastDiveTime = now;
  }

  /**
   * Start an alien diving
   */
  private startDive(alien: Alien): void {
    alien.state = 'diving';
    alien.diveProgress = 0;
    alien.divePathIndex = 0;

    // Choose path based on position
    const pathKey = alien.x < GAME_AREA_WIDTH / 2 ? 'swoopRight' : 'swoopLeft';
    alien.divePath = DIVE_PATHS[pathKey];
  }

  /**
   * Check all collisions
   */
  private checkCollisions(): void {
    // Player bullets vs aliens
    for (const bullet of this.data.bullets.filter(b => !b.isEnemy)) {
      for (const alien of this.data.aliens) {
        if (alien.state === 'dead') continue;

        const dx = Math.abs(bullet.x - alien.x);
        const dy = Math.abs(bullet.y - alien.y);

        if (dx < 2 && dy < 1) {
          // Hit!
          alien.health--;

          if (alien.health <= 0) {
            this.killAlien(alien);
            this.data.shotsHit++;
          }

          // Remove bullet
          bullet.y = -100;
        }
      }
    }

    // Enemy bullets vs player
    if (!this.data.player.isDead && !this.data.player.isCaptured) {
      for (const bullet of this.data.bullets.filter(b => b.isEnemy)) {
        const dx = Math.abs(bullet.x - this.data.player.x);
        const dy = Math.abs(bullet.y - this.data.player.y);

        if (dx < 2 && dy < 1) {
          this.killPlayer();
          bullet.y = 100;
        }
      }

      // Aliens vs player
      for (const alien of this.data.aliens) {
        if (alien.state === 'diving' || alien.state === 'returning') {
          const dx = Math.abs(alien.x - this.data.player.x);
          const dy = Math.abs(alien.y - this.data.player.y);

          if (dx < 2 && dy < 1) {
            this.killPlayer();
            this.killAlien(alien);
          }
        }
      }
    }
  }

  /**
   * Kill an alien
   */
  private killAlien(alien: Alien): void {
    const wasFormationed = alien.state === 'formation';
    alien.state = 'dead';

    // Score based on alien type and state
    let points = 0;
    switch (alien.type) {
      case 'bee':
        points = wasFormationed ? SCORES.bee : SCORES.beeSwoop;
        break;
      case 'butterfly':
        points = wasFormationed ? SCORES.butterfly : SCORES.butterflySwoop;
        break;
      case 'boss':
        points = alien.capturedFighter ? SCORES.bossKillWithFighter : SCORES.bossKill;
        if (alien.capturedFighter && !this.data.player.hasDualFighter) {
          // Rescue captured fighter!
          this.data.player.hasDualFighter = true;
          this.data.score += SCORES.dualFighter;
        }
        break;
    }
    this.data.score += points;

    if (this.data.isChallengingStage) {
      this.data.challengingKills++;
    }

    // Create explosion
    this.data.explosions.push({
      id: this.data.explosionIdCounter++,
      x: alien.x,
      y: alien.y,
      frame: 0,
      maxFrames: 10,
    });

    // Clear formation slot
    const slot = this.data.formation[alien.formationY]?.[alien.formationX];
    if (slot) {
      slot.occupied = false;
      slot.alienId = null;
    }
  }

  /**
   * Kill player
   */
  private killPlayer(): void {
    if (this.data.player.isDead) return;

    this.data.player.isDead = true;
    this.data.player.deathFrame = 0;

    if (this.data.player.hasDualFighter) {
      // Lose dual fighter first
      this.data.player.hasDualFighter = false;
    } else {
      this.data.lives--;
    }

    // Create explosion
    this.data.explosions.push({
      id: this.data.explosionIdCounter++,
      x: this.data.player.x,
      y: this.data.player.y,
      frame: 0,
      maxFrames: 15,
    });
  }

  /**
   * Respawn player
   */
  private respawnPlayer(): void {
    if (this.data.lives <= 0) {
      this.data.state = 'gameover';
      return;
    }

    this.data.player.isDead = false;
    this.data.player.deathFrame = 0;
    this.data.player.x = GAME_AREA_WIDTH / 2;
    this.data.player.y = PLAYER_Y;
  }

  /**
   * Check if stage is complete
   */
  private checkStageComplete(): void {
    const liveAliens = this.data.aliens.filter(a => a.state !== 'dead');

    if (liveAliens.length === 0) {
      if (this.data.isChallengingStage) {
        // Challenging stage bonus
        if (this.data.challengingKills === this.data.challengingTotal) {
          this.data.score += SCORES.challengingPerfect;
        } else {
          this.data.score += this.data.challengingKills * SCORES.challengingBonus;
        }
      }

      this.data.state = 'stageComplete';
      setTimeout(() => {
        this.data.stage++;
        this.initStage();
        this.data.state = 'playing';
      }, 2000);
    }
  }

  /**
   * Render the game
   */
  render(): void {
    // Create render buffer
    const buffer: string[][] = [];
    for (let y = 0; y < GAME_AREA_HEIGHT; y++) {
      buffer[y] = [];
      for (let x = 0; x < GAME_AREA_WIDTH; x++) {
        buffer[y][x] = ' ';
      }
    }

    // Render stars
    for (const star of this.data.stars) {
      const x = Math.floor(star.x);
      const y = Math.floor(star.y);
      if (x >= 0 && x < GAME_AREA_WIDTH && y >= 0 && y < GAME_AREA_HEIGHT) {
        buffer[y][x] = star.brightness === 0 ? '.' : star.brightness === 1 ? '+' : '*';
      }
    }

    // Render aliens
    for (const alien of this.data.aliens) {
      if (alien.state === 'dead') continue;
      const x = Math.floor(alien.x);
      const y = Math.floor(alien.y);
      if (x >= 0 && x < GAME_AREA_WIDTH && y >= 0 && y < GAME_AREA_HEIGHT) {
        let char = 'w';
        switch (alien.type) {
          case 'bee': char = 'w'; break;
          case 'butterfly': char = 'M'; break;
          case 'boss': char = alien.capturedFighter ? '@' : '@'; break;
        }
        buffer[y][x] = char;
      }
    }

    // Render bullets
    for (const bullet of this.data.bullets) {
      const x = Math.floor(bullet.x);
      const y = Math.floor(bullet.y);
      if (x >= 0 && x < GAME_AREA_WIDTH && y >= 0 && y < GAME_AREA_HEIGHT) {
        buffer[y][x] = bullet.isEnemy ? '.' : '|';
      }
    }

    // Render explosions
    for (const exp of this.data.explosions) {
      const x = Math.floor(exp.x);
      const y = Math.floor(exp.y);
      if (x >= 0 && x < GAME_AREA_WIDTH && y >= 0 && y < GAME_AREA_HEIGHT) {
        const chars = ['*', '+', 'o', '.'];
        const charIndex = Math.floor(exp.frame / 3) % chars.length;
        buffer[y][x] = chars[charIndex];
      }
    }

    // Render player
    if (!this.data.player.isDead && !this.data.player.isCaptured) {
      const px = Math.floor(this.data.player.x);
      const py = this.data.player.y;
      if (this.data.player.hasDualFighter) {
        if (px > 0) buffer[py][px - 1] = '^';
        buffer[py][px] = 'A';
        if (px < GAME_AREA_WIDTH - 1) buffer[py][px + 1] = '^';
      } else {
        buffer[py][px] = 'A';
      }
    }

    // Convert to colored output
    const lines: string[] = [];
    for (let y = 0; y < GAME_AREA_HEIGHT; y++) {
      let line = '';
      for (let x = 0; x < GAME_AREA_WIDTH; x++) {
        const char = buffer[y][x];
        if (char === 'A' || char === '^') {
          line += `{cyan-fg}${char}{/}`;
        } else if (char === 'w') {
          line += `{yellow-fg}${char}{/}`;
        } else if (char === 'M') {
          line += `{red-fg}${char}{/}`;
        } else if (char === '@') {
          line += `{green-fg}${char}{/}`;
        } else if (char === '|') {
          line += `{white-fg}${char}{/}`;
        } else if (char === '*' || char === '+' || char === 'o') {
          line += `{yellow-fg}${char}{/}`;
        } else if (char === '.') {
          line += `{gray-fg}${char}{/}`;
        } else {
          line += char;
        }
      }
      lines.push(line);
    }

    this.renderCallback(lines.join('\n'));
  }
}
