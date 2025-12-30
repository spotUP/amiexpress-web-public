/**
 * Zoo Keeper - Stampede Stage Logic
 * Jump over charging animals on escalators to reach the top for an extra life
 */

import {
  ZooKeeperData,
  Animal,
  AnimalType,
  Direction
} from './types';
import {
  GAME_AREA,
  STAMPEDE_STAGE,
  ANIMAL_STATS,
  JUMP_SCORES,
  CHARS,
  COLORS
} from './constants';

type RenderCallback = (content: string) => void;

/**
 * Stampede Stage Game Engine
 */
export class StampedeStageGame {
  private data: ZooKeeperData;
  private renderCallback: RenderCallback;
  private waveTimer: number = 0;
  private animalIdCounter: number = 0;

  constructor(data: ZooKeeperData, renderCallback: RenderCallback) {
    this.data = data;
    this.renderCallback = renderCallback;
  }

  /**
   * Initialize stampede stage
   */
  init(): void {
    const d = this.data;
    const ss = d.stampedeStage;
    const cfg = STAMPEDE_STAGE;

    // Reset Zeke at bottom of escalator
    d.zeke.x = 40;
    d.zeke.y = GAME_AREA.bottom - 2;
    d.zeke.isJumping = false;
    d.zeke.jumpFrame = 0;

    // Reset stampede data
    ss.escalatorSpeed = cfg.escalatorSpeed;
    ss.chargingAnimals = [];
    ss.zekelY = GAME_AREA.bottom - 2;
    ss.jumpedAnimals = 0;

    this.animalIdCounter = 0;
    this.waveTimer = 0;

    this.render();
  }

  /**
   * Main update loop
   */
  update(): void {
    const d = this.data;
    const ss = d.stampedeStage;

    if (d.state !== 'stampede') return;

    // Move Zeke up the escalator (automatic)
    if (!d.zeke.isJumping && d.zeke.y > GAME_AREA.top + 2) {
      // Slow automatic ascent
      if (d.frameCount % 10 === 0) {
        d.zeke.y--;
      }
    }

    // Spawn animal waves
    this.waveTimer++;
    if (this.waveTimer >= STAMPEDE_STAGE.animalWaveInterval / 33) {
      this.spawnWave();
      this.waveTimer = 0;
    }

    // Update animals
    this.updateAnimals();

    // Check collisions
    this.checkCollisions();

    // Update jump
    if (d.zeke.isJumping) {
      this.updateJump();
    }

    // Check if reached top
    if (d.zeke.y <= GAME_AREA.top + 2) {
      this.stageComplete();
      return;
    }

    d.frameCount++;
    this.render();
  }

  /**
   * Spawn a wave of charging animals
   */
  private spawnWave(): void {
    const d = this.data;
    const ss = d.stampedeStage;

    // Spawn from top, charging down
    const availableTypes: AnimalType[] = ['elephant', 'camel', 'rhino'];
    if (d.level >= 3) availableTypes.push('moose');
    if (d.level >= 5) availableTypes.push('lion');

    for (let i = 0; i < STAMPEDE_STAGE.animalsPerWave; i++) {
      const type = availableTypes[Math.floor(Math.random() * availableTypes.length)];
      const stats = ANIMAL_STATS[type];

      const animal: Animal = {
        id: ++this.animalIdCounter,
        type,
        x: 20 + Math.random() * 40,  // Random x position
        y: GAME_AREA.top + 1,
        dx: (Math.random() - 0.5) * 2,  // Slight horizontal drift
        dy: 1 + (stats.speed / 5),  // Speed based on animal type
        escaped: true,  // Mark as "escaped" to distinguish from caged
        targetWallX: 0,
        targetWallY: 0,
        attackTimer: 0
      };

      ss.chargingAnimals.push(animal);
    }
  }

  /**
   * Update charging animals
   */
  private updateAnimals(): void {
    const ss = this.data.stampedeStage;
    const toRemove: number[] = [];

    for (let i = 0; i < ss.chargingAnimals.length; i++) {
      const animal = ss.chargingAnimals[i];

      // Move down toward Zeke
      animal.y += animal.dy * 0.3;
      animal.x += animal.dx * 0.1;

      // Bounce off sides
      if (animal.x < 10 || animal.x > 70) {
        animal.dx = -animal.dx;
      }

      // Remove if off screen
      if (animal.y > GAME_AREA.bottom) {
        toRemove.push(i);
      }
    }

    // Remove off-screen animals
    for (let i = toRemove.length - 1; i >= 0; i--) {
      ss.chargingAnimals.splice(toRemove[i], 1);
    }
  }

  /**
   * Check collisions with animals
   */
  private checkCollisions(): void {
    const d = this.data;
    const ss = d.stampedeStage;

    for (const animal of ss.chargingAnimals) {
      const dx = Math.abs(animal.x - d.zeke.x);
      const dy = Math.abs(animal.y - d.zeke.y);

      if (dx < 2 && dy < 2) {
        if (d.zeke.isJumping && d.zeke.jumpFrame >= 3 && d.zeke.jumpFrame <= 8) {
          // Successfully jumped over
          ss.jumpedAnimals++;
          const points = JUMP_SCORES[Math.min(ss.jumpedAnimals, 11)] || 500;
          d.score += points;

          // Mark this animal as jumped (remove it)
          animal.y = GAME_AREA.bottom + 10;  // Move off screen
        } else if (!d.zeke.isJumping) {
          // Hit by animal
          this.hitByAnimal();
          return;
        }
      }
    }
  }

  /**
   * Zeke hit by charging animal
   */
  private hitByAnimal(): void {
    const d = this.data;
    const ss = d.stampedeStage;

    d.lives--;
    ss.jumpedAnimals = 0;  // Reset combo

    if (d.lives <= 0) {
      d.state = 'gameover';
    } else {
      // Reset to bottom
      d.zeke.y = GAME_AREA.bottom - 2;
      d.zeke.isJumping = false;
      ss.chargingAnimals = [];
    }
  }

  /**
   * Handle direction input (limited in stampede)
   */
  handleDirection(dir: Direction): void {
    const d = this.data;

    // Can only move left/right on escalator
    if (dir === 'left') {
      d.zeke.x = Math.max(15, d.zeke.x - 3);
    } else if (dir === 'right') {
      d.zeke.x = Math.min(65, d.zeke.x + 3);
    }
  }

  /**
   * Handle jump input
   */
  handleJump(): void {
    const d = this.data;
    if (d.zeke.isJumping) return;

    d.zeke.isJumping = true;
    d.zeke.jumpFrame = 0;
  }

  /**
   * Update jump animation
   */
  private updateJump(): void {
    const d = this.data;

    d.zeke.jumpFrame++;

    // Quick jump - 12 frames total
    if (d.zeke.jumpFrame <= 6) {
      // Rising - move up extra
      d.zeke.y -= 2;
    } else if (d.zeke.jumpFrame <= 12) {
      // Falling - move down (but escalator still moving up)
      d.zeke.y++;
    } else {
      // Jump complete
      d.zeke.isJumping = false;
      d.zeke.jumpFrame = 0;
    }

    // Clamp to valid range
    d.zeke.y = Math.max(GAME_AREA.top + 2, Math.min(GAME_AREA.bottom - 2, d.zeke.y));
  }

  /**
   * Stage complete - reached top
   */
  private stageComplete(): void {
    const d = this.data;
    const ss = d.stampedeStage;

    // Extra life for completing stampede
    if (STAMPEDE_STAGE.extraLifeAtTop) {
      d.lives++;
    }

    // Bonus for jumped animals
    d.score += ss.jumpedAnimals * 100;

    // Advance to next level
    d.round = 1;
    d.level++;

    d.state = 'stageTransition';
    d.transitionMessage = 'ZOO STAGE';
    d.transitionTimer = 60;
  }

  /**
   * Render the stampede stage
   */
  render(): void {
    const d = this.data;
    const ss = d.stampedeStage;
    const lines: string[] = [];

    // Create render buffer
    const buffer: string[][] = [];
    for (let y = 0; y < GAME_AREA.height; y++) {
      buffer[y] = [];
      for (let x = 0; x < GAME_AREA.width; x++) {
        buffer[y][x] = ' ';
      }
    }

    // Draw escalator (diagonal lines)
    const escLeft = 15;
    const escRight = 65;
    for (let y = 0; y < GAME_AREA.height; y++) {
      // Left rail
      buffer[y][escLeft] = '|';
      // Right rail
      buffer[y][escRight] = '|';

      // Steps (alternating pattern)
      const stepOffset = (y + Math.floor(d.frameCount / 5)) % 3;
      for (let x = escLeft + 1; x < escRight; x++) {
        if (stepOffset === 0) {
          buffer[y][x] = '=';
        } else if (stepOffset === 1) {
          buffer[y][x] = '-';
        }
      }
    }

    // Draw "EXTRA LIFE" banner at top
    const bannerY = 1;
    const banner = 'EXTRA LIFE!';
    const bannerStart = 40 - Math.floor(banner.length / 2);
    for (let i = 0; i < banner.length; i++) {
      buffer[bannerY][bannerStart + i] = banner[i];
    }

    // Draw charging animals
    for (const animal of ss.chargingAnimals) {
      const stats = ANIMAL_STATS[animal.type];
      const screenY = Math.floor(animal.y) - GAME_AREA.top;
      const screenX = Math.floor(animal.x);

      if (screenY >= 0 && screenY < buffer.length && screenX >= 0 && screenX < GAME_AREA.width) {
        buffer[screenY][screenX] = stats.char;
      }
    }

    // Draw Zeke
    const zekeScreenY = d.zeke.y - GAME_AREA.top;
    if (zekeScreenY >= 0 && zekeScreenY < buffer.length) {
      const zekeChar = d.zeke.isJumping ? '^' : CHARS.zeke;
      buffer[zekeScreenY][Math.floor(d.zeke.x)] = zekeChar;
    }

    // Draw jump combo counter
    if (ss.jumpedAnimals > 0) {
      const comboText = `x${ss.jumpedAnimals}`;
      for (let i = 0; i < comboText.length; i++) {
        buffer[2][70 + i] = comboText[i];
      }
    }

    // Convert buffer to tagged string
    for (let y = 0; y < buffer.length; y++) {
      let line = '';
      for (let x = 0; x < buffer[y].length; x++) {
        const char = buffer[y][x];

        if (char === CHARS.zeke || char === '^') {
          line += `{${COLORS.zeke}-fg}${char}{/}`;
        } else if (char === '|') {
          line += `{gray-fg}${char}{/}`;
        } else if (char === '=' || char === '-') {
          line += `{white-fg}${char}{/}`;
        } else if (/[ESCRML]/.test(char)) {
          const animalType = Object.entries(ANIMAL_STATS).find(([, s]) => s.char === char);
          if (animalType) {
            line += `{${animalType[1].color}-fg}${char}{/}`;
          } else {
            line += char;
          }
        } else if (/[EXTRALIFE!x0-9]/.test(char)) {
          line += `{yellow-fg}${char}{/}`;
        } else {
          line += char;
        }
      }
      lines.push(line);
    }

    this.renderCallback(lines.join('\n'));
  }
}
