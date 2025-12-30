/**
 * Donkey Kong - Game Engine
 * 1981 Nintendo arcade classic
 */

import {
  DonkeyKongData,
  Player,
  Barrel,
  FireBall,
  Girder,
  Ladder,
  Direction,
} from './types';
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  GRAVITY,
  JUMP_POWER,
  PLAYER_SPEED,
  CLIMB_SPEED,
  MAX_FALL_SPEED,
  BARREL_SPEED,
  FIREBALL_SPEED,
  HAMMER_DURATION,
  BARREL_SPAWN_RATE,
  FIREBALL_SPAWN_RATE,
  BONUS_DECREMENT,
  BONUS_INTERVAL,
  RESPAWN_TIME,
  INVINCIBLE_TIME,
  SCORES,
  SPRITES,
  getStageData,
} from './constants';

export class DonkeyKongGame {
  private data: DonkeyKongData;
  private renderCallback: (content: string) => void;
  private onGameOver: () => void;
  private onStageComplete: () => void;

  constructor(
    data: DonkeyKongData,
    renderCallback: (content: string) => void,
    onGameOver: () => void,
    onStageComplete: () => void
  ) {
    this.data = data;
    this.renderCallback = renderCallback;
    this.onGameOver = onGameOver;
    this.onStageComplete = onStageComplete;
  }

  initStage(): void {
    const { stage, data: stageData } = getStageData(this.data.level, this.data.stageIndex);
    this.data.stage = stage;

    // Copy stage layout
    this.data.girders = stageData.girders.map(g => ({ ...g }));
    this.data.ladders = stageData.ladders.map(l => ({ ...l }));
    this.data.rivets = stageData.rivets.map(r => ({ ...r }));
    this.data.hammers = stageData.hammers.map(h => ({ ...h }));
    this.data.elevators = stageData.elevators.map(e => ({ ...e }));
    this.data.conveyors = stageData.conveyors.map(c => ({ ...c }));

    this.data.paulineX = stageData.paulineX;
    this.data.paulineY = stageData.paulineY;
    this.data.dkX = stageData.dkX;
    this.data.dkY = stageData.dkY;

    // Reset player
    this.data.player = {
      x: stageData.startX,
      y: stageData.startY,
      vx: 0,
      vy: 0,
      direction: 'right',
      isJumping: false,
      isOnGround: true,
      isClimbing: false,
      climbFrame: 0,
      walkFrame: 0,
      hasHammer: false,
      hammerTimer: 0,
      hammerFrame: 0,
      isAlive: true,
      respawnTimer: 0,
      invincibleTimer: INVINCIBLE_TIME,
    };

    // Clear hazards
    this.data.barrels = [];
    this.data.fireBalls = [];
    this.data.springs = [];
    this.data.barrelIdCounter = 0;
    this.data.fireballIdCounter = 0;
    this.data.springIdCounter = 0;

    // Reset timers
    this.data.dkFrame = 0;
    this.data.dkThrowTimer = BARREL_SPAWN_RATE;
    this.data.bonusTimer = 5000;
    this.data.jumpScore = 0;

    this.render();
  }

  update(): void {
    if (this.data.state !== 'playing') return;

    this.data.frameCount++;

    // Update bonus timer
    if (this.data.frameCount % BONUS_INTERVAL === 0 && this.data.bonusTimer > 0) {
      this.data.bonusTimer -= BONUS_DECREMENT;
    }

    // DK behavior
    this.updateDK();

    // Update player
    this.updatePlayer();

    // Update barrels
    this.updateBarrels();

    // Update fireballs
    this.updateFireballs();

    // Update elevators
    this.updateElevators();

    // Check collisions
    this.checkCollisions();

    // Check stage complete (rivets stage or reached Pauline)
    if (this.checkStageComplete()) {
      this.data.score += this.data.bonusTimer;
      this.data.state = 'stageComplete';
      this.onStageComplete();
      return;
    }

    this.render();
  }

  private updateDK(): void {
    // Animate DK
    this.data.dkFrame = (this.data.dkFrame + 1) % 4;

    // Spawn barrels on barrel stage
    if (this.data.stage === 'barrels' || this.data.stage === 'conveyors') {
      this.data.dkThrowTimer--;
      if (this.data.dkThrowTimer <= 0) {
        this.spawnBarrel();
        this.data.dkThrowTimer = BARREL_SPAWN_RATE - (this.data.level * 10);
        if (this.data.dkThrowTimer < 60) this.data.dkThrowTimer = 60;
      }
    }

    // Spawn fireballs on rivets stage
    if (this.data.stage === 'rivets') {
      if (this.data.frameCount % FIREBALL_SPAWN_RATE === 0 && this.data.fireBalls.length < 4) {
        this.spawnFireball();
      }
    }
  }

  private spawnBarrel(): void {
    const isBlue = Math.random() < 0.1 + this.data.level * 0.05;

    this.data.barrels.push({
      id: this.data.barrelIdCounter++,
      x: this.data.dkX + 2,
      y: this.data.dkY + 1,
      vx: BARREL_SPEED,
      vy: 0,
      type: isBlue ? 'blue' : 'normal',
      isRolling: true,
      onLadder: false,
      direction: 'right',
      frame: 0,
    });
  }

  private spawnFireball(): void {
    // Spawn from oil barrel at bottom or from DK
    const spawnY = 19;
    const spawnX = Math.random() < 0.5 ? 2 : 28;

    this.data.fireBalls.push({
      id: this.data.fireballIdCounter++,
      x: spawnX,
      y: spawnY,
      vx: this.data.player.x > spawnX ? FIREBALL_SPEED : -FIREBALL_SPEED,
      vy: 0,
      direction: this.data.player.x > spawnX ? 'right' : 'left',
      isClimbing: false,
      frame: 0,
      aiTimer: 30,
    });
  }

  private updatePlayer(): void {
    const player = this.data.player;

    if (!player.isAlive) {
      if (player.respawnTimer > 0) {
        player.respawnTimer--;
        if (player.respawnTimer === 0) {
          player.isAlive = true;
          player.invincibleTimer = INVINCIBLE_TIME;
          // Respawn at start
          const { data: stageData } = getStageData(this.data.level, this.data.stageIndex);
          player.x = stageData.startX;
          player.y = stageData.startY;
          player.vx = 0;
          player.vy = 0;
          player.isClimbing = false;
          player.hasHammer = false;
        }
      }
      return;
    }

    if (player.invincibleTimer > 0) {
      player.invincibleTimer--;
    }

    // Hammer timer
    if (player.hasHammer) {
      player.hammerTimer--;
      player.hammerFrame = (player.hammerFrame + 1) % 4;
      if (player.hammerTimer <= 0) {
        player.hasHammer = false;
      }
    }

    if (player.isClimbing) {
      // Climbing physics
      player.vx = 0;
      // Can only climb on ladders
      const onLadder = this.isOnLadder(player.x, player.y);
      if (!onLadder) {
        player.isClimbing = false;
      }
    } else {
      // Normal physics
      // Apply gravity
      player.vy += GRAVITY;
      if (player.vy > MAX_FALL_SPEED) player.vy = MAX_FALL_SPEED;

      // Conveyor effect
      for (const conveyor of this.data.conveyors) {
        if (player.y === conveyor.y - 1 &&
            player.x >= conveyor.x && player.x < conveyor.x + conveyor.width) {
          player.vx += conveyor.direction === 'right' ? 0.1 : -0.1;
        }
      }
    }

    // Update position
    player.x += player.vx;
    player.y += player.vy;

    // Platform collision
    if (!player.isClimbing) {
      player.isOnGround = false;
      this.handleGirderCollision(player);
    }

    // Screen bounds
    if (player.x < 0) player.x = 0;
    if (player.x >= GAME_WIDTH - 1) player.x = GAME_WIDTH - 2;

    // Fall death
    if (player.y >= GAME_HEIGHT) {
      this.killPlayer();
      return;
    }

    // Friction
    if (!player.isClimbing) {
      player.vx *= 0.8;
      if (Math.abs(player.vx) < 0.01) player.vx = 0;
    }

    // Check hammer pickup
    for (const hammer of this.data.hammers) {
      if (!hammer.isCollected) {
        const dist = Math.abs(player.x - hammer.x) + Math.abs(player.y - hammer.y);
        if (dist < 2) {
          hammer.isCollected = true;
          player.hasHammer = true;
          player.hammerTimer = HAMMER_DURATION;
        }
      }
    }

    // Check rivet removal
    for (const rivet of this.data.rivets) {
      if (!rivet.isRemoved) {
        const dist = Math.abs(player.x - rivet.x) + Math.abs(player.y - rivet.y);
        if (dist < 2) {
          rivet.isRemoved = true;
          this.data.score += SCORES.rivet;
        }
      }
    }

    // Animation
    if (player.isClimbing) {
      player.climbFrame = (player.climbFrame + 1) % 2;
    } else if (Math.abs(player.vx) > 0.05) {
      player.walkFrame = (player.walkFrame + 1) % 4;
    }
  }

  private handleGirderCollision(player: Player): void {
    for (const girder of this.data.girders) {
      if (player.x >= girder.x && player.x < girder.x + girder.width) {
        // Calculate girder Y at player X position
        const relX = player.x - girder.x;
        const girderY = girder.y - relX * girder.slope;

        // Landing on girder
        if (player.y >= girderY - 1.5 && player.y < girderY + 0.5 && player.vy >= 0) {
          player.y = girderY - 1;
          player.vy = 0;
          player.isOnGround = true;
          player.isJumping = false;
        }
      }
    }
  }

  private isOnLadder(x: number, y: number): boolean {
    for (const ladder of this.data.ladders) {
      if (ladder.isBroken) continue;
      if (Math.abs(x - ladder.x) < 1) {
        if (y >= ladder.y - ladder.height && y <= ladder.y + 1) {
          return true;
        }
      }
    }
    return false;
  }

  private updateBarrels(): void {
    for (const barrel of this.data.barrels) {
      // Check if on ladder and should go down
      if (!barrel.onLadder) {
        const onLadder = this.checkBarrelOnLadder(barrel);
        if (onLadder && Math.random() < 0.3) {
          barrel.onLadder = true;
          barrel.vx = 0;
        }
      }

      if (barrel.onLadder) {
        // Fall down ladder
        barrel.vy = BARREL_SPEED * 0.8;
        barrel.y += barrel.vy;

        // Check if reached bottom of ladder
        const stillOnLadder = this.checkBarrelOnLadder(barrel);
        if (!stillOnLadder) {
          barrel.onLadder = false;
          barrel.vy = 0;
          barrel.vx = Math.random() > 0.5 ? BARREL_SPEED : -BARREL_SPEED;
        }
      } else {
        // Rolling on girder
        barrel.vy += GRAVITY;
        if (barrel.vy > MAX_FALL_SPEED) barrel.vy = MAX_FALL_SPEED;

        barrel.x += barrel.vx;
        barrel.y += barrel.vy;

        // Girder collision and direction change
        for (const girder of this.data.girders) {
          if (barrel.x >= girder.x && barrel.x < girder.x + girder.width) {
            const relX = barrel.x - girder.x;
            const girderY = girder.y - relX * girder.slope;

            if (barrel.y >= girderY - 1 && barrel.y < girderY + 1 && barrel.vy >= 0) {
              barrel.y = girderY - 1;
              barrel.vy = 0;

              // Follow slope
              barrel.vx = barrel.direction === 'right'
                ? BARREL_SPEED + girder.slope * 0.2
                : -BARREL_SPEED + girder.slope * 0.2;
            }
          }
        }

        // Wall bounce
        if (barrel.x <= 0 || barrel.x >= GAME_WIDTH - 1) {
          barrel.direction = barrel.direction === 'right' ? 'left' : 'right';
          barrel.vx = -barrel.vx;
        }
      }

      // Remove if fell off screen
      if (barrel.y > GAME_HEIGHT + 2) {
        this.data.barrels = this.data.barrels.filter(b => b.id !== barrel.id);
        continue;
      }

      // Animation
      barrel.frame = (barrel.frame + 1) % 4;
    }
  }

  private checkBarrelOnLadder(barrel: Barrel): boolean {
    for (const ladder of this.data.ladders) {
      if (ladder.isBroken) continue;
      if (Math.abs(barrel.x - ladder.x) < 1.5) {
        if (barrel.y >= ladder.y - ladder.height && barrel.y <= ladder.y) {
          return true;
        }
      }
    }
    return false;
  }

  private updateFireballs(): void {
    for (const fireball of this.data.fireBalls) {
      fireball.aiTimer--;

      // AI: chase player
      if (fireball.aiTimer <= 0) {
        fireball.aiTimer = 30 + Math.floor(Math.random() * 30);

        if (!fireball.isClimbing) {
          // Check if should climb
          const canClimb = this.isOnLadder(fireball.x, fireball.y);
          if (canClimb && Math.random() < 0.3) {
            const shouldGoUp = this.data.player.y < fireball.y;
            if (shouldGoUp) {
              fireball.isClimbing = true;
              fireball.vy = -FIREBALL_SPEED * 0.8;
              fireball.vx = 0;
            }
          } else {
            // Chase horizontally
            fireball.direction = this.data.player.x > fireball.x ? 'right' : 'left';
            fireball.vx = fireball.direction === 'right' ? FIREBALL_SPEED : -FIREBALL_SPEED;
          }
        }
      }

      if (fireball.isClimbing) {
        fireball.y += fireball.vy;

        // Check if should stop climbing
        if (!this.isOnLadder(fireball.x, fireball.y)) {
          fireball.isClimbing = false;
          fireball.vy = 0;
          fireball.vx = this.data.player.x > fireball.x ? FIREBALL_SPEED : -FIREBALL_SPEED;
        }
      } else {
        // Normal movement
        fireball.vy += GRAVITY;
        if (fireball.vy > MAX_FALL_SPEED * 0.5) fireball.vy = MAX_FALL_SPEED * 0.5;

        fireball.x += fireball.vx;
        fireball.y += fireball.vy;

        // Girder collision
        for (const girder of this.data.girders) {
          if (fireball.x >= girder.x && fireball.x < girder.x + girder.width) {
            const relX = fireball.x - girder.x;
            const girderY = girder.y - relX * girder.slope;

            if (fireball.y >= girderY - 1 && fireball.y < girderY + 1 && fireball.vy >= 0) {
              fireball.y = girderY - 1;
              fireball.vy = 0;
            }
          }
        }

        // Wall bounce
        if (fireball.x <= 0 || fireball.x >= GAME_WIDTH - 1) {
          fireball.vx = -fireball.vx;
          fireball.direction = fireball.direction === 'right' ? 'left' : 'right';
        }
      }

      // Animation
      fireball.frame = (fireball.frame + 1) % 4;
    }
  }

  private updateElevators(): void {
    for (const elevator of this.data.elevators) {
      // Move elevator
      if (elevator.direction === 'up') {
        elevator.y -= 0.1;
        if (elevator.y < 8) elevator.y = 8 + elevator.height;
      } else {
        elevator.y += 0.1;
        if (elevator.y > 8 + elevator.height) elevator.y = 8;
      }

      // Check if player is on elevator
      const player = this.data.player;
      if (Math.abs(player.x - elevator.x) < 2 &&
          Math.abs(player.y - (elevator.y - 1)) < 1 &&
          player.vy >= 0) {
        player.y = elevator.y - 1;
        player.vy = elevator.direction === 'up' ? -0.1 : 0.1;
        player.isOnGround = true;
      }
    }
  }

  private checkCollisions(): void {
    const player = this.data.player;
    if (!player.isAlive || player.invincibleTimer > 0) return;

    // Player vs barrels
    for (const barrel of this.data.barrels) {
      const dist = Math.sqrt(
        Math.pow(player.x - barrel.x, 2) + Math.pow(player.y - barrel.y, 2)
      );

      if (dist < 1.5) {
        if (player.hasHammer) {
          // Smash barrel
          this.data.score += SCORES.barrel;
          this.data.barrels = this.data.barrels.filter(b => b.id !== barrel.id);
        } else {
          this.killPlayer();
          return;
        }
      }

      // Jump over barrel bonus
      if (!barrel.onLadder && player.isJumping && player.y < barrel.y - 1 &&
          Math.abs(player.x - barrel.x) < 2) {
        if (this.data.jumpScore === 0) {
          this.data.jumpScore = SCORES.jump;
          this.data.score += SCORES.jump;
        }
      }
    }

    // Reset jump score when landing
    if (player.isOnGround) {
      this.data.jumpScore = 0;
    }

    // Player vs fireballs
    for (const fireball of this.data.fireBalls) {
      const dist = Math.sqrt(
        Math.pow(player.x - fireball.x, 2) + Math.pow(player.y - fireball.y, 2)
      );

      if (dist < 1.5) {
        if (player.hasHammer) {
          this.data.score += SCORES.fireball;
          this.data.fireBalls = this.data.fireBalls.filter(f => f.id !== fireball.id);
        } else {
          this.killPlayer();
          return;
        }
      }
    }
  }

  private checkStageComplete(): boolean {
    // Rivets stage: all rivets removed
    if (this.data.stage === 'rivets') {
      return this.data.rivets.every(r => r.isRemoved);
    }

    // Other stages: reach Pauline
    const player = this.data.player;
    const dist = Math.abs(player.x - this.data.paulineX) + Math.abs(player.y - this.data.paulineY);
    return dist < 3;
  }

  private killPlayer(): void {
    this.data.player.isAlive = false;
    this.data.player.hasHammer = false;
    this.data.lives--;

    if (this.data.lives <= 0) {
      this.data.state = 'gameover';
      this.onGameOver();
    } else {
      this.data.player.respawnTimer = RESPAWN_TIME;
    }
  }

  handleMove(direction: Direction): void {
    if (this.data.state !== 'playing') return;
    const player = this.data.player;
    if (!player.isAlive) return;

    if (!player.isClimbing) {
      player.vx = direction === 'left' ? -PLAYER_SPEED : PLAYER_SPEED;
      player.direction = direction;
    }
  }

  handleClimb(direction: 'up' | 'down'): void {
    if (this.data.state !== 'playing') return;
    const player = this.data.player;
    if (!player.isAlive) return;

    const onLadder = this.isOnLadder(player.x, player.y);

    if (direction === 'up') {
      if (onLadder) {
        player.isClimbing = true;
        player.vy = -CLIMB_SPEED;
        player.vx = 0;
      }
    } else {
      // Check if ladder below
      const ladderBelow = this.isOnLadder(player.x, player.y + 1);
      if (ladderBelow || player.isClimbing) {
        player.isClimbing = true;
        player.vy = CLIMB_SPEED;
        player.vx = 0;
      }
    }
  }

  handleJump(): void {
    if (this.data.state !== 'playing') return;
    const player = this.data.player;
    if (!player.isAlive) return;

    if (player.isOnGround && !player.isJumping && !player.isClimbing) {
      player.vy = JUMP_POWER;
      player.isJumping = true;
      player.isOnGround = false;
    }
  }

  render(): void {
    const buffer: string[][] = [];

    // Initialize buffer
    for (let y = 0; y < GAME_HEIGHT; y++) {
      buffer[y] = [];
      for (let x = 0; x < GAME_WIDTH; x++) {
        buffer[y][x] = ' ';
      }
    }

    // Draw girders
    for (const girder of this.data.girders) {
      for (let x = girder.x; x < girder.x + girder.width && x < GAME_WIDTH; x++) {
        const relX = x - girder.x;
        const y = Math.floor(girder.y - relX * girder.slope);
        if (x >= 0 && y >= 0 && y < GAME_HEIGHT) {
          buffer[y][x] = SPRITES.girder;
        }
      }
    }

    // Draw ladders
    for (const ladder of this.data.ladders) {
      for (let y = ladder.y - ladder.height; y <= ladder.y; y++) {
        if (ladder.x >= 0 && ladder.x < GAME_WIDTH && y >= 0 && y < GAME_HEIGHT) {
          buffer[y][ladder.x] = ladder.isBroken ? SPRITES.ladderBroken : SPRITES.ladder;
        }
      }
    }

    // Draw rivets
    for (const rivet of this.data.rivets) {
      if (!rivet.isRemoved && rivet.x >= 0 && rivet.x < GAME_WIDTH && rivet.y >= 0 && rivet.y < GAME_HEIGHT) {
        buffer[rivet.y][rivet.x] = SPRITES.rivet;
      }
    }

    // Draw hammers
    for (const hammer of this.data.hammers) {
      if (!hammer.isCollected && hammer.x >= 0 && hammer.x < GAME_WIDTH && hammer.y >= 0 && hammer.y < GAME_HEIGHT) {
        buffer[hammer.y][hammer.x] = SPRITES.hammer;
      }
    }

    // Draw elevators
    for (const elevator of this.data.elevators) {
      const ey = Math.floor(elevator.y);
      if (elevator.x >= 0 && elevator.x < GAME_WIDTH && ey >= 0 && ey < GAME_HEIGHT) {
        buffer[ey][elevator.x] = SPRITES.elevator;
        if (elevator.x + 1 < GAME_WIDTH) buffer[ey][elevator.x + 1] = ']';
      }
    }

    // Draw conveyors
    for (const conveyor of this.data.conveyors) {
      for (let x = conveyor.x; x < conveyor.x + conveyor.width && x < GAME_WIDTH; x++) {
        if (x >= 0 && conveyor.y >= 0 && conveyor.y < GAME_HEIGHT) {
          buffer[conveyor.y][x] = conveyor.direction === 'right' ? '>' : '<';
        }
      }
    }

    // Draw Pauline
    if (this.data.paulineY >= 0 && this.data.paulineY < GAME_HEIGHT &&
        this.data.paulineX >= 0 && this.data.paulineX < GAME_WIDTH) {
      buffer[this.data.paulineY][this.data.paulineX] = SPRITES.pauline;
    }

    // Draw DK
    if (this.data.dkY >= 0 && this.data.dkY < GAME_HEIGHT &&
        this.data.dkX >= 0 && this.data.dkX < GAME_WIDTH) {
      buffer[this.data.dkY][this.data.dkX] = SPRITES.dk;
      if (this.data.dkX + 1 < GAME_WIDTH) buffer[this.data.dkY][this.data.dkX + 1] = SPRITES.dk;
    }

    // Draw barrels
    for (const barrel of this.data.barrels) {
      const bx = Math.floor(barrel.x);
      const by = Math.floor(barrel.y);
      if (bx >= 0 && bx < GAME_WIDTH && by >= 0 && by < GAME_HEIGHT) {
        buffer[by][bx] = barrel.type === 'blue' ? SPRITES.blueBarrel : SPRITES.barrel;
      }
    }

    // Draw fireballs
    for (const fireball of this.data.fireBalls) {
      const fx = Math.floor(fireball.x);
      const fy = Math.floor(fireball.y);
      if (fx >= 0 && fx < GAME_WIDTH && fy >= 0 && fy < GAME_HEIGHT) {
        buffer[fy][fx] = SPRITES.fireball;
      }
    }

    // Draw player
    const player = this.data.player;
    if (player.isAlive && (player.invincibleTimer === 0 || this.data.frameCount % 4 < 2)) {
      const px = Math.floor(player.x);
      const py = Math.floor(player.y);
      if (px >= 0 && px < GAME_WIDTH && py >= 0 && py < GAME_HEIGHT) {
        let sprite: string;
        if (player.hasHammer) {
          sprite = SPRITES.playerHammer;
        } else if (player.isClimbing) {
          sprite = SPRITES.playerClimb;
        } else {
          sprite = SPRITES.player;
        }
        buffer[py][px] = sprite;
      }
    }

    // Build output with colors (double width)
    let output = '';
    for (let y = 0; y < GAME_HEIGHT; y++) {
      for (let x = 0; x < GAME_WIDTH; x++) {
        const char = buffer[y][x];
        let colored: string;

        if (char === SPRITES.girder || char === '>' || char === '<') {
          colored = `{red-fg}${char}${char}{/}`;
        } else if (char === SPRITES.ladder) {
          colored = `{cyan-fg}${char}${char}{/}`;
        } else if (char === SPRITES.ladderBroken) {
          colored = `{gray-fg}${char}${char}{/}`;
        } else if (char === SPRITES.player || char === SPRITES.playerClimb) {
          colored = `{cyan-fg}${char}${char}{/}`;
        } else if (char === SPRITES.playerHammer) {
          colored = `{yellow-fg}${char}${char}{/}`;
        } else if (char === SPRITES.barrel) {
          colored = `{yellow-fg}${char}${char}{/}`;
        } else if (char === SPRITES.blueBarrel) {
          colored = `{blue-fg}${char}${char}{/}`;
        } else if (char === SPRITES.fireball) {
          colored = `{red-fg}${char}${char}{/}`;
        } else if (char === SPRITES.dk) {
          colored = `{yellow-fg}${char}${char}{/}`;
        } else if (char === SPRITES.pauline) {
          colored = `{magenta-fg}${char}${char}{/}`;
        } else if (char === SPRITES.rivet) {
          colored = `{yellow-fg}${char}${char}{/}`;
        } else if (char === SPRITES.hammer) {
          colored = `{white-fg}${char}${char}{/}`;
        } else if (char === SPRITES.elevator || char === ']') {
          colored = `{green-fg}${char}${char}{/}`;
        } else {
          colored = '  ';
        }
        output += colored;
      }
      if (y < GAME_HEIGHT - 1) output += '\n';
    }

    this.renderCallback(output);
  }
}
