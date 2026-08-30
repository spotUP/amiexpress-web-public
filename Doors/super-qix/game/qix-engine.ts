/**
 * Super Qix - Core Game Engine
 * Main game logic and state management
 */

import {
  SuperQixData,
  GameState,
  CellState,
  Point,
  Direction,
  DrawSpeed,
  Stix,
  ClaimResult
} from './types';
import {
  FIELD_WIDTH,
  FIELD_HEIGHT,
  FIELD_OFFSET_X,
  FIELD_OFFSET_Y,
  GAME_TICK_MS,
  STARTING_LIVES,
  DEFAULT_TARGET_PERCENT,
  EXTRA_LIFE_PERCENT,
  FAST_DRAW_BASE_POINTS,
  SLOW_DRAW_BASE_POINTS,
  POINTS_PER_BONUS_PERCENT,
  BONUS_PERCENT_START,
  CHARS,
  BG_COLORS,
  CELL_WIDTH,
  getLevelConfig,
  DEFAULT_HIGHSCORES,
  FUSE_START_DELAY
} from './constants';
import { DrawingSystem } from './drawing';
import { EnemySystem } from './enemies';
import { PowerUpSystem } from './powerups';

type RenderCallback = (content: string) => void;

/**
 * Main game engine for Super Qix
 */
export class QixEngine {
  private data: SuperQixData;
  private renderCallback: RenderCallback;
  private drawingSystem: DrawingSystem;
  private enemySystem: EnemySystem;
  private powerUpSystem: PowerUpSystem;
  private lastMoveTime: number = 0;

  constructor(data: SuperQixData, renderCallback: RenderCallback) {
    this.data = data;
    this.renderCallback = renderCallback;
    this.drawingSystem = new DrawingSystem(data);
    this.enemySystem = new EnemySystem(data);
    this.powerUpSystem = new PowerUpSystem(data);
  }

  /**
   * Initialize a new level
   */
  initLevel(levelNum: number): void {
    const d = this.data;
    const config = getLevelConfig(levelNum);

    d.level = levelNum;
    d.claimedPercent = 0;
    d.targetPercent = config.targetPercent;
    d.scoreMultiplier = 1;
    d.levelWord = config.word;
    d.collectedLetters = [];
    d.activeEffects = [];
    d.levelStartTime = Date.now();
    d.stopTimer = 0;

    // Initialize playfield
    d.fieldWidth = FIELD_WIDTH;
    d.fieldHeight = FIELD_HEIGHT;
    d.field = this.createField();

    // Initialize border path for Sparx patrol
    d.borderPath = this.createBorderPath();

    // Reset marker to bottom center of border
    d.marker = {
      x: Math.floor(FIELD_WIDTH / 2),
      y: FIELD_HEIGHT - 1,
      isDrawing: false,
      drawSpeed: null,
      hasShield: false,
      speedBoost: false,
      speedBoostTimer: 0
    };

    // Clear stix
    d.currentStix = null;
    d.fuse = null;

    // Spawn enemies
    this.enemySystem.initLevel(config);

    // Clear power-ups
    d.powerUps = [];
    d.powerUpIdCounter = 0;

    this.render();
  }

  /**
   * Create initial field with borders
   */
  private createField(): CellState[][] {
    const field: CellState[][] = [];

    for (let y = 0; y < FIELD_HEIGHT; y++) {
      field[y] = [];
      for (let x = 0; x < FIELD_WIDTH; x++) {
        // Border on edges
        if (x === 0 || x === FIELD_WIDTH - 1 || y === 0 || y === FIELD_HEIGHT - 1) {
          field[y][x] = 'border';
        } else {
          field[y][x] = 'unclaimed';
        }
      }
    }

    return field;
  }

  /**
   * Create border path for Sparx patrol
   */
  private createBorderPath(): Point[] {
    const path: Point[] = [];

    // Top edge (left to right)
    for (let x = 0; x < FIELD_WIDTH; x++) {
      path.push({ x, y: 0 });
    }
    // Right edge (top to bottom)
    for (let y = 1; y < FIELD_HEIGHT; y++) {
      path.push({ x: FIELD_WIDTH - 1, y });
    }
    // Bottom edge (right to left)
    for (let x = FIELD_WIDTH - 2; x >= 0; x--) {
      path.push({ x, y: FIELD_HEIGHT - 1 });
    }
    // Left edge (bottom to top)
    for (let y = FIELD_HEIGHT - 2; y > 0; y--) {
      path.push({ x: 0, y });
    }

    return path;
  }

  /**
   * Main update loop
   */
  update(): void {
    const d = this.data;

    if (d.state !== 'playing') return;

    const now = Date.now();
    d.frameCount++;

    // Update active effects
    this.powerUpSystem.updateEffects();

    // Update enemies
    this.enemySystem.update();

    // Update fuse if drawing and stopped
    if (d.marker.isDrawing && d.currentStix) {
      d.stopTimer += GAME_TICK_MS;
      if (d.stopTimer > FUSE_START_DELAY) {
        this.enemySystem.updateFuse(d.currentStix.points);
      }
    }

    // Check collisions
    if (this.checkCollisions()) {
      // Player died
      this.handleDeath();
      return;
    }

    // Check power-up collection
    this.powerUpSystem.checkCollection(d.marker);

    // Check level complete
    if (d.claimedPercent >= d.targetPercent) {
      this.levelComplete();
      return;
    }

    // Check word complete (auto-complete level)
    if (this.checkWordComplete()) {
      d.score += 10000;  // Word bonus
      d.claimedPercent = 100;
      this.levelComplete();
      return;
    }

    this.render();
  }

  /**
   * Handle direction input
   */
  handleDirection(dir: Direction): void {
    const d = this.data;
    const now = Date.now();

    // Rate limit movement
    const moveDelay = d.marker.speedBoost ? 25 : 50;
    if (now - this.lastMoveTime < moveDelay) return;
    this.lastMoveTime = now;

    // Calculate next position
    let nextX = d.marker.x;
    let nextY = d.marker.y;

    switch (dir) {
      case 'up': nextY--; break;
      case 'down': nextY++; break;
      case 'left': nextX--; break;
      case 'right': nextX++; break;
    }

    // Bounds check
    if (nextX < 0 || nextX >= FIELD_WIDTH || nextY < 0 || nextY >= FIELD_HEIGHT) {
      return;
    }

    const nextCell = d.field[nextY][nextX];

    if (d.marker.isDrawing && d.currentStix) {
      // Drawing mode - can move into unclaimed or back to border/claimed
      if (nextCell === 'unclaimed') {
        // Extend stix
        if (this.drawingSystem.extendStix({ x: nextX, y: nextY })) {
          d.marker.x = nextX;
          d.marker.y = nextY;
          d.stopTimer = 0;  // Reset fuse timer
        }
      } else if (nextCell === 'border' || nextCell === 'claimed') {
        // Complete stix - claim area
        const result = this.drawingSystem.completeStix({ x: nextX, y: nextY });
        if (result.success) {
          d.marker.x = nextX;
          d.marker.y = nextY;
          d.marker.isDrawing = false;
          d.marker.drawSpeed = null;
          d.currentStix = null;
          d.fuse = null;
          d.stopTimer = 0;

          // Award points
          if (result.points) {
            d.score += result.points;
          }
          if (result.percent) {
            d.claimedPercent += result.percent;
          }

          // Spawn power-up chance
          this.powerUpSystem.trySpawnPowerUp();

          // Update border path for Sparx, then re-anchor existing Sparx to
          // it - the rebuilt array reorders points, so a stale pathIndex
          // would otherwise teleport a Sparx onto the marker's landing cell.
          d.borderPath = this.updateBorderPath();
          this.enemySystem.reanchorBorderPositions();
        }
      } else if (nextCell === 'stix') {
        // Can't cross own stix - die!
        this.handleDeath();
        return;
      }
    } else {
      // Not drawing - can only move on border or claimed area
      if (nextCell === 'border' || nextCell === 'claimed') {
        d.marker.x = nextX;
        d.marker.y = nextY;
      }
      // If trying to move into unclaimed without drawing, stay put
    }
  }

  /**
   * Start drawing (slow)
   */
  handleSlowDraw(): void {
    this.startDrawing('slow');
  }

  /**
   * Start drawing (fast)
   */
  handleFastDraw(): void {
    this.startDrawing('fast');
  }

  /**
   * Start drawing in the current direction
   */
  private startDrawing(speed: DrawSpeed): void {
    const d = this.data;

    if (d.marker.isDrawing) return;

    // Must be on border or claimed area to start drawing
    const currentCell = d.field[d.marker.y][d.marker.x];
    if (currentCell !== 'border' && currentCell !== 'claimed') return;

    d.marker.isDrawing = true;
    d.marker.drawSpeed = speed;
    d.currentStix = {
      points: [{ x: d.marker.x, y: d.marker.y }],
      speed,
      startTime: Date.now()
    };
    d.stopTimer = 0;
  }

  /**
   * Stop drawing (release key)
   */
  handleStopDraw(): void {
    // Drawing continues until you return to safe area
    // This method is called when draw key is released
    // Fuse mechanic will start if stopped
  }

  /**
   * Update border path to include claimed area edges
   */
  private updateBorderPath(): Point[] {
    const d = this.data;
    const path: Point[] = [];
    const visited = new Set<string>();

    // Find all border and claimed edge cells
    for (let y = 0; y < FIELD_HEIGHT; y++) {
      for (let x = 0; x < FIELD_WIDTH; x++) {
        const cell = d.field[y][x];
        if (cell === 'border') {
          path.push({ x, y });
        } else if (cell === 'claimed') {
          // Check if adjacent to unclaimed (edge of claimed area)
          const neighbors = [
            { x: x - 1, y },
            { x: x + 1, y },
            { x, y: y - 1 },
            { x, y: y + 1 }
          ];
          for (const n of neighbors) {
            if (n.x >= 0 && n.x < FIELD_WIDTH && n.y >= 0 && n.y < FIELD_HEIGHT) {
              if (d.field[n.y][n.x] === 'unclaimed') {
                const key = `${x},${y}`;
                if (!visited.has(key)) {
                  visited.add(key);
                  path.push({ x, y });
                }
                break;
              }
            }
          }
        }
      }
    }

    return path;
  }

  /**
   * Check all collisions
   */
  private checkCollisions(): boolean {
    const d = this.data;

    // Check Qix collision (only while drawing)
    if (d.marker.isDrawing && d.currentStix) {
      if (this.enemySystem.checkQixCollision(d.marker, d.currentStix.points)) {
        if (d.marker.hasShield) {
          d.marker.hasShield = false;
          return false;  // Shield saved us
        }
        return true;
      }
    }

    // Check Sparx collision (always)
    if (this.enemySystem.checkSparxCollision(d.marker)) {
      if (d.marker.hasShield) {
        d.marker.hasShield = false;
        return false;
      }
      return true;
    }

    // Check Fuse collision (while drawing)
    if (d.fuse && d.fuse.active) {
      if (this.enemySystem.checkFuseCollision(d.marker)) {
        return true;  // Fuse always kills
      }
    }

    return false;
  }

  /**
   * Handle player death
   */
  private handleDeath(): void {
    const d = this.data;

    d.lives--;

    // Clear current stix
    if (d.currentStix) {
      for (const point of d.currentStix.points) {
        if (d.field[point.y][point.x] === 'stix') {
          d.field[point.y][point.x] = 'unclaimed';
        }
      }
    }
    d.currentStix = null;
    d.marker.isDrawing = false;
    d.marker.drawSpeed = null;
    d.fuse = null;
    d.stopTimer = 0;

    if (d.lives <= 0) {
      d.state = 'gameover';
    } else {
      // Reset marker to safe position
      d.marker.x = Math.floor(FIELD_WIDTH / 2);
      d.marker.y = FIELD_HEIGHT - 1;
    }

    this.render();
  }

  /**
   * Check if word is complete
   */
  private checkWordComplete(): boolean {
    const d = this.data;
    if (!d.levelWord) return false;

    const needed = d.levelWord.split('');
    return needed.every(letter => d.collectedLetters.includes(letter));
  }

  /**
   * Level complete
   */
  private levelComplete(): void {
    const d = this.data;

    // Bonus for percentage above target
    if (d.claimedPercent > BONUS_PERCENT_START) {
      const bonusPercent = d.claimedPercent - BONUS_PERCENT_START;
      d.score += bonusPercent * POINTS_PER_BONUS_PERCENT;
    }

    // Extra life for 98%+
    if (d.claimedPercent >= EXTRA_LIFE_PERCENT) {
      d.lives++;
    }

    d.state = 'levelTransition';
    d.transitionMessage = `LEVEL ${d.level} COMPLETE!`;
    d.transitionTimer = 90;  // 3 seconds at 30fps

    this.render();
  }

  /**
   * Advance to next level
   */
  advanceLevel(): void {
    const d = this.data;
    d.level++;
    this.initLevel(d.level);
    d.state = 'playing';
  }

  /**
   * Main render function
   */
  render(): void {
    const d = this.data;
    const lines: string[] = [];

    // Render buffer holds a glyph plus its own fg/bg, painted directly per
    // layer - not a char code looked up afterwards. Terrain cells share the
    // same space glyph (border/unclaimed/claimed/stix are all blocks), so a
    // char->color lookup can no longer tell them apart; bg is now what
    // carries the meaning.
    type Cell = { ch: string; fg?: string; bg?: string };
    const buffer: Cell[][] = [];
    for (let y = 0; y < FIELD_HEIGHT; y++) {
      buffer[y] = [];
      for (let x = 0; x < FIELD_WIDTH; x++) {
        buffer[y][x] = { ch: ' ', bg: BG_COLORS.unclaimed };
      }
    }

    // Draw field
    for (let y = 0; y < FIELD_HEIGHT; y++) {
      for (let x = 0; x < FIELD_WIDTH; x++) {
        const cell = d.field[y][x];
        switch (cell) {
          case 'border':
            buffer[y][x] = { ch: ' ', bg: BG_COLORS.border };
            break;
          case 'unclaimed':
            buffer[y][x] = { ch: ' ', bg: BG_COLORS.unclaimed };
            break;
          case 'claimed':
            buffer[y][x] = { ch: ' ', bg: BG_COLORS.claimed };
            break;
          case 'stix': {
            const slow = d.currentStix?.speed === 'slow';
            buffer[y][x] = { ch: ' ', bg: slow ? BG_COLORS.stixSlow : BG_COLORS.stixFast };
            break;
          }
        }
      }
    }

    // Draw current stix
    if (d.currentStix) {
      const slow = d.currentStix.speed === 'slow';
      const bg = slow ? BG_COLORS.stixSlow : BG_COLORS.stixFast;
      for (const point of d.currentStix.points) {
        if (point.y >= 0 && point.y < FIELD_HEIGHT && point.x >= 0 && point.x < FIELD_WIDTH) {
          buffer[point.y][point.x] = { ch: ' ', bg };
        }
      }
    }

    // Draw Qix
    for (const qix of d.qixList) {
      const char = d.frameCount % 2 === 0 ? CHARS.qix : CHARS.qixAlt;
      const qx = Math.floor(qix.x);
      const qy = Math.floor(qix.y);
      if (qy >= 0 && qy < FIELD_HEIGHT && qx >= 0 && qx < FIELD_WIDTH) {
        buffer[qy][qx] = { ch: char, fg: 'white', bg: BG_COLORS.qix };
      }
      // Draw segments
      for (const seg of qix.segments) {
        const sx = Math.floor(seg.x);
        const sy = Math.floor(seg.y);
        if (sy >= 0 && sy < FIELD_HEIGHT && sx >= 0 && sx < FIELD_WIDTH) {
          buffer[sy][sx] = { ch: CHARS.qix, fg: 'white', bg: BG_COLORS.qix };
        }
      }
    }

    // Draw Sparx
    for (const sparx of d.sparxList) {
      const sx = Math.floor(sparx.x);
      const sy = Math.floor(sparx.y);
      if (sy >= 0 && sy < FIELD_HEIGHT && sx >= 0 && sx < FIELD_WIDTH) {
        const isSuper = sparx.isSuper;
        buffer[sy][sx] = {
          ch: isSuper ? CHARS.superSparx : CHARS.sparx,
          fg: isSuper ? 'yellow' : 'white',
          bg: isSuper ? BG_COLORS.superSparx : BG_COLORS.sparx
        };
      }
    }

    // Draw Fuse
    if (d.fuse && d.fuse.active) {
      const fx = Math.floor(d.fuse.x);
      const fy = Math.floor(d.fuse.y);
      if (fy >= 0 && fy < FIELD_HEIGHT && fx >= 0 && fx < FIELD_WIDTH) {
        const char = d.frameCount % 2 === 0 ? CHARS.fuse : CHARS.fuseHead;
        buffer[fy][fx] = { ch: char, fg: 'black', bg: BG_COLORS.fuse };
      }
    }

    // Draw power-ups
    for (const powerUp of d.powerUps) {
      if (!powerUp.collected) {
        const px = Math.floor(powerUp.x);
        const py = Math.floor(powerUp.y);
        if (py >= 0 && py < FIELD_HEIGHT && px >= 0 && px < FIELD_WIDTH) {
          buffer[py][px] = { ch: powerUp.letter || CHARS.powerUp, fg: 'white', bg: BG_COLORS.powerUp };
        }
      }
    }

    // Draw marker
    const mx = d.marker.x;
    const my = d.marker.y;
    if (my >= 0 && my < FIELD_HEIGHT && mx >= 0 && mx < FIELD_WIDTH) {
      const drawing = d.marker.isDrawing;
      buffer[my][mx] = {
        ch: drawing ? CHARS.markerDrawing : CHARS.marker,
        fg: 'black',
        bg: drawing ? BG_COLORS.markerDrawing : BG_COLORS.marker
      };
    }

    // Convert buffer to tagged string.
    //
    // Each logical cell is painted CELL_WIDTH characters wide so that a cell
    // is as wide as it is tall on screen (see CELL_WIDTH in constants.ts).
    // A glyph occupies the first column of its cell and the remainder is
    // padded with spaces carrying the same colours, so the block stays solid.
    for (let y = 0; y < buffer.length; y++) {
      let line = '';
      for (let x = 0; x < buffer[y].length; x++) {
        const { ch, fg, bg } = buffer[y][x];
        let cellStr = ch + ' '.repeat(CELL_WIDTH - 1);
        if (fg) cellStr = `{${fg}-fg}${cellStr}{/${fg}-fg}`;
        if (bg) cellStr = `{${bg}-bg}${cellStr}{/${bg}-bg}`;
        line += cellStr;
      }
      lines.push(line);
    }

    this.renderCallback(lines.join('\n'));
  }
}
