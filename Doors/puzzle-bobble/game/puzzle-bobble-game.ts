/**
 * Puzzle Bobble (Bust-A-Move) - Game Engine
 * 1994 Taito bubble-matching puzzle game
 */

import {
  PuzzleBobbleData,
  GridBubble,
  ShootingBubble,
  BubbleColor,
} from './types';
import {
  GRID_WIDTH,
  GRID_HEIGHT,
  BUBBLE_SPEED,
  ANGLE_INCREMENT,
  MIN_ANGLE,
  MAX_ANGLE,
  SHOOTER_Y,
  MIN_MATCH,
  COMBO_WINDOW,
  SCORES,
  BUBBLE_CHARS,
  BUBBLE_TERM_COLORS,
  getLevelConfig,
  getColorsForLevel,
  generateLevelPattern,
} from './constants';

export class PuzzleBobbleGame {
  private data: PuzzleBobbleData;
  private renderCallback: (content: string) => void;
  private onGameOver: () => void;
  private onLevelComplete: () => void;

  constructor(
    data: PuzzleBobbleData,
    renderCallback: (content: string) => void,
    onGameOver: () => void,
    onLevelComplete: () => void
  ) {
    this.data = data;
    this.renderCallback = renderCallback;
    this.onGameOver = onGameOver;
    this.onLevelComplete = onLevelComplete;
  }

  initLevel(): void {
    const config = getLevelConfig(this.data.level);
    this.data.colorsInPlay = getColorsForLevel(this.data.level);

    // Initialize grid from pattern
    const pattern = generateLevelPattern(this.data.level);
    this.data.grid = [];
    this.data.gridOffset = 0;

    for (let row = 0; row < GRID_HEIGHT; row++) {
      this.data.grid[row] = [];
      for (let col = 0; col < GRID_WIDTH; col++) {
        if (row < pattern.length && pattern[row][col]) {
          this.data.grid[row][col] = {
            x: col,
            y: row,
            color: pattern[row][col]!,
            isPopping: false,
            popFrame: 0,
            isFalling: false,
            fallVy: 0,
          };
        } else {
          this.data.grid[row][col] = null;
        }
      }
    }

    // Initialize shooter
    this.data.shooter = {
      x: GRID_WIDTH / 2,
      y: SHOOTER_Y,
      angle: 90,
      currentBubble: this.getRandomColor(),
      nextBubble: this.getRandomColor(),
    };

    this.data.shootingBubble = null;
    this.data.ceilingTimer = 0;
    this.data.ceilingInterval = config.ceilingDropInterval;
    this.data.combo = 0;
    this.data.lastMatchTime = 0;
    this.data.bubblesCleared = 0;

    this.render();
  }

  private getRandomColor(): BubbleColor {
    // Only use colors that are still in play
    const colorsOnGrid = this.getColorsOnGrid();
    const available = colorsOnGrid.length > 0 ? colorsOnGrid : this.data.colorsInPlay;
    return available[Math.floor(Math.random() * available.length)];
  }

  private getColorsOnGrid(): BubbleColor[] {
    const colors = new Set<BubbleColor>();
    for (const row of this.data.grid) {
      for (const cell of row) {
        if (cell && !cell.isPopping && !cell.isFalling) {
          colors.add(cell.color);
        }
      }
    }
    return Array.from(colors);
  }

  update(): void {
    if (this.data.state !== 'playing') return;

    this.data.frameCount++;

    // Update shooting bubble
    if (this.data.shootingBubble?.isActive) {
      this.updateShootingBubble();
    }

    // Update popping/falling bubbles
    this.updateBubbleAnimations();

    // Ceiling timer
    if (!this.data.shootingBubble?.isActive) {
      this.data.ceilingTimer++;
      if (this.data.ceilingTimer >= this.data.ceilingInterval) {
        this.dropCeiling();
        this.data.ceilingTimer = 0;
      }
    }

    // Check for level complete
    if (this.isGridEmpty()) {
      this.data.score += SCORES.levelClear;
      if (this.data.bubblesCleared > 0) {
        this.data.score += SCORES.perfectClear;
      }
      this.data.state = 'levelComplete';
      this.onLevelComplete();
      return;
    }

    // Check for game over (bubbles reached shooter)
    if (this.checkGameOver()) {
      this.data.state = 'gameover';
      this.onGameOver();
      return;
    }

    this.render();
  }

  private updateShootingBubble(): void {
    const bubble = this.data.shootingBubble!;

    bubble.x += bubble.vx;
    bubble.y += bubble.vy;

    // Wall bounce
    if (bubble.x <= 0 || bubble.x >= GRID_WIDTH - 1) {
      bubble.vx = -bubble.vx;
      bubble.x = Math.max(0, Math.min(GRID_WIDTH - 1, bubble.x));
    }

    // Check collision with grid bubbles
    const collision = this.checkBubbleCollision(bubble);
    if (collision) {
      this.placeBubble(bubble, collision.row, collision.col);
      return;
    }

    // Check collision with ceiling
    if (bubble.y <= this.data.gridOffset) {
      const col = Math.round(bubble.x);
      this.placeBubble(bubble, 0, Math.max(0, Math.min(GRID_WIDTH - 1, col)));
    }
  }

  private checkBubbleCollision(bubble: ShootingBubble): { row: number; col: number } | null {
    for (let row = 0; row < this.data.grid.length; row++) {
      for (let col = 0; col < this.data.grid[row].length; col++) {
        const cell = this.data.grid[row][col];
        if (!cell || cell.isPopping || cell.isFalling) continue;

        // Offset for even/odd rows
        const offsetX = row % 2 === 1 ? 0.5 : 0;
        const cellX = col + offsetX;
        const cellY = row + this.data.gridOffset;

        const dist = Math.sqrt(
          Math.pow(bubble.x - cellX, 2) + Math.pow(bubble.y - cellY, 2)
        );

        if (dist < 1.5) {
          // Find best empty neighbor
          return this.findPlacementSpot(row, col, bubble.x, bubble.y);
        }
      }
    }
    return null;
  }

  private findPlacementSpot(hitRow: number, hitCol: number, bubbleX: number, bubbleY: number): { row: number; col: number } {
    const isOffsetRow = hitRow % 2 === 1;

    // Get all neighbor positions
    const neighbors = this.getNeighborPositions(hitRow, hitCol);

    // Find the closest empty neighbor
    let bestSpot = { row: hitRow, col: hitCol };
    let bestDist = Infinity;

    for (const [nRow, nCol] of neighbors) {
      if (nRow >= 0 && nRow < GRID_HEIGHT && nCol >= 0 && nCol < GRID_WIDTH) {
        if (!this.data.grid[nRow]?.[nCol]) {
          const offsetX = nRow % 2 === 1 ? 0.5 : 0;
          const dist = Math.sqrt(
            Math.pow(bubbleX - (nCol + offsetX), 2) +
            Math.pow(bubbleY - (nRow + this.data.gridOffset), 2)
          );
          if (dist < bestDist) {
            bestDist = dist;
            bestSpot = { row: nRow, col: nCol };
          }
        }
      }
    }

    return bestSpot;
  }

  private getNeighborPositions(row: number, col: number): [number, number][] {
    const isOffset = row % 2 === 1;

    if (isOffset) {
      return [
        [row - 1, col], [row - 1, col + 1],
        [row, col - 1], [row, col + 1],
        [row + 1, col], [row + 1, col + 1],
      ];
    } else {
      return [
        [row - 1, col - 1], [row - 1, col],
        [row, col - 1], [row, col + 1],
        [row + 1, col - 1], [row + 1, col],
      ];
    }
  }

  private placeBubble(bubble: ShootingBubble, row: number, col: number): void {
    // Create grid bubble
    this.data.grid[row][col] = {
      x: col,
      y: row,
      color: bubble.color,
      isPopping: false,
      popFrame: 0,
      isFalling: false,
      fallVy: 0,
    };

    // Deactivate shooting bubble
    this.data.shootingBubble = null;

    // Check for matches
    const matches = this.findMatches(row, col, bubble.color);

    if (matches.length >= MIN_MATCH) {
      // Pop matching bubbles
      for (const [mRow, mCol] of matches) {
        const cell = this.data.grid[mRow][mCol];
        if (cell) {
          cell.isPopping = true;
          cell.popFrame = 0;
        }
      }

      // Check combo
      if (this.data.frameCount - this.data.lastMatchTime < COMBO_WINDOW) {
        this.data.combo++;
      } else {
        this.data.combo = 1;
      }
      this.data.lastMatchTime = this.data.frameCount;

      // Score
      const baseScore = matches.length * SCORES.bubblePop;
      const comboBonus = this.data.combo > 1 ? SCORES[`combo${Math.min(this.data.combo, 5)}` as keyof typeof SCORES] || 0 : 0;
      this.data.score += baseScore + (comboBonus as number);
      this.data.bubblesCleared += matches.length;

      // Find and drop disconnected bubbles
      setTimeout(() => this.dropDisconnectedBubbles(), 200);
    }

    // Load next bubble
    this.data.shooter.currentBubble = this.data.shooter.nextBubble;
    this.data.shooter.nextBubble = this.getRandomColor();
  }

  private findMatches(startRow: number, startCol: number, color: BubbleColor): [number, number][] {
    const matches: [number, number][] = [];
    const visited = new Set<string>();

    const explore = (row: number, col: number) => {
      const key = `${row},${col}`;
      if (visited.has(key)) return;

      if (row < 0 || row >= GRID_HEIGHT || col < 0 || col >= GRID_WIDTH) return;

      const cell = this.data.grid[row]?.[col];
      if (!cell || cell.isPopping || cell.isFalling || cell.color !== color) return;

      visited.add(key);
      matches.push([row, col]);

      // Explore neighbors
      const neighbors = this.getNeighborPositions(row, col);
      for (const [nRow, nCol] of neighbors) {
        explore(nRow, nCol);
      }
    };

    explore(startRow, startCol);
    return matches;
  }

  private dropDisconnectedBubbles(): void {
    // Find all bubbles connected to the ceiling
    const connected = new Set<string>();

    // BFS from top row
    const queue: [number, number][] = [];

    for (let col = 0; col < GRID_WIDTH; col++) {
      if (this.data.grid[0]?.[col] && !this.data.grid[0][col]!.isPopping) {
        queue.push([0, col]);
        connected.add(`0,${col}`);
      }
    }

    while (queue.length > 0) {
      const [row, col] = queue.shift()!;
      const neighbors = this.getNeighborPositions(row, col);

      for (const [nRow, nCol] of neighbors) {
        const key = `${nRow},${nCol}`;
        if (connected.has(key)) continue;

        const cell = this.data.grid[nRow]?.[nCol];
        if (cell && !cell.isPopping && !cell.isFalling) {
          connected.add(key);
          queue.push([nRow, nCol]);
        }
      }
    }

    // Mark disconnected bubbles as falling
    let droppedCount = 0;
    for (let row = 0; row < GRID_HEIGHT; row++) {
      for (let col = 0; col < GRID_WIDTH; col++) {
        const key = `${row},${col}`;
        const cell = this.data.grid[row][col];

        if (cell && !cell.isPopping && !connected.has(key)) {
          cell.isFalling = true;
          cell.fallVy = 0;
          droppedCount++;
        }
      }
    }

    if (droppedCount > 0) {
      this.data.score += droppedCount * SCORES.bubbleDrop;
      this.data.bubblesCleared += droppedCount;
    }
  }

  private updateBubbleAnimations(): void {
    for (let row = 0; row < this.data.grid.length; row++) {
      for (let col = 0; col < this.data.grid[row].length; col++) {
        const cell = this.data.grid[row][col];
        if (!cell) continue;

        if (cell.isPopping) {
          cell.popFrame++;
          if (cell.popFrame > 10) {
            this.data.grid[row][col] = null;
          }
        }

        if (cell.isFalling) {
          cell.fallVy += 0.2;
          cell.y += cell.fallVy;

          if (cell.y > SHOOTER_Y + 2) {
            this.data.grid[row][col] = null;
          }
        }
      }
    }
  }

  private dropCeiling(): void {
    this.data.gridOffset += 0.5;

    // Check if any bubble is now too low
    if (this.checkGameOver()) {
      this.data.state = 'gameover';
      this.onGameOver();
    }
  }

  private isGridEmpty(): boolean {
    for (const row of this.data.grid) {
      for (const cell of row) {
        if (cell && !cell.isPopping && !cell.isFalling) {
          return false;
        }
      }
    }
    return true;
  }

  private checkGameOver(): boolean {
    const dangerLine = SHOOTER_Y - 2;

    for (let row = 0; row < this.data.grid.length; row++) {
      for (const cell of this.data.grid[row]) {
        if (cell && !cell.isPopping && !cell.isFalling) {
          const actualY = row + this.data.gridOffset;
          if (actualY >= dangerLine) {
            return true;
          }
        }
      }
    }
    return false;
  }

  handleAim(direction: 'left' | 'right'): void {
    if (this.data.state !== 'playing') return;
    if (this.data.shootingBubble?.isActive) return;

    if (direction === 'left') {
      this.data.shooter.angle = Math.min(MAX_ANGLE, this.data.shooter.angle + ANGLE_INCREMENT);
    } else {
      this.data.shooter.angle = Math.max(MIN_ANGLE, this.data.shooter.angle - ANGLE_INCREMENT);
    }

    this.render();
  }

  handleShoot(): void {
    if (this.data.state !== 'playing') return;
    if (this.data.shootingBubble?.isActive) return;

    const angleRad = (this.data.shooter.angle * Math.PI) / 180;
    const vx = Math.cos(angleRad) * BUBBLE_SPEED;
    const vy = -Math.sin(angleRad) * BUBBLE_SPEED;

    this.data.shootingBubble = {
      x: this.data.shooter.x,
      y: this.data.shooter.y - 1,
      vx,
      vy,
      color: this.data.shooter.currentBubble,
      isActive: true,
    };
  }

  render(): void {
    let output = '';

    // Draw grid
    const displayRows = GRID_HEIGHT;

    for (let row = 0; row < displayRows; row++) {
      const isOffset = row % 2 === 1;
      const offsetStr = isOffset ? ' ' : '';

      output += offsetStr;

      for (let col = 0; col < GRID_WIDTH; col++) {
        const cell = this.data.grid[row]?.[col];

        if (cell && !cell.isFalling) {
          if (cell.isPopping) {
            output += '{white-fg}**{/}';
          } else {
            const char = BUBBLE_CHARS[cell.color];
            const color = BUBBLE_TERM_COLORS[cell.color];
            output += `{${color}-fg}(${char}){/}`;
          }
        } else {
          output += ' . ';
        }
      }
      output += '\n';
    }

    // Draw shooting bubble in flight
    if (this.data.shootingBubble?.isActive) {
      // Just show position indicator
      const sb = this.data.shootingBubble;
      output += `\n{cyan-fg}Bubble at: ${sb.x.toFixed(1)}, ${sb.y.toFixed(1)}{/}\n`;
    }

    // Draw shooter
    const angleIndicator = this.getAngleIndicator();
    output += '\n';
    output += `{white-fg}${angleIndicator}{/}\n`;

    // Current and next bubble
    const currentChar = BUBBLE_CHARS[this.data.shooter.currentBubble];
    const currentColor = BUBBLE_TERM_COLORS[this.data.shooter.currentBubble];
    const nextChar = BUBBLE_CHARS[this.data.shooter.nextBubble];
    const nextColor = BUBBLE_TERM_COLORS[this.data.shooter.nextBubble];

    output += `{${currentColor}-fg}[${currentChar}]{/} <- NEXT: {${nextColor}-fg}[${nextChar}]{/}\n`;

    // Ceiling warning
    const ceilingProgress = Math.floor((this.data.ceilingTimer / this.data.ceilingInterval) * 100);
    if (ceilingProgress > 70) {
      output += `{red-fg}CEILING: ${ceilingProgress}%{/}\n`;
    }

    this.renderCallback(output);
  }

  private getAngleIndicator(): string {
    const angle = this.data.shooter.angle;
    const normalizedAngle = Math.floor((angle - MIN_ANGLE) / (MAX_ANGLE - MIN_ANGLE) * 10);

    let indicator = '          ^          ';
    const spaces = ' '.repeat(10 - normalizedAngle);
    const pointer = '^';

    return `[${spaces}${pointer}${' '.repeat(normalizedAngle)}]`;
  }
}
