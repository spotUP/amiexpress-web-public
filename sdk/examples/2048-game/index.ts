/**
 * 2048 Game - Classic ncurses-style puzzle game using neo-blessed
 *
 * Port of the popular 2048 sliding tile puzzle game to BBS doors.
 * Uses neo-blessed for the terminal UI with smooth animations and
 * colorful tile rendering.
 *
 * How to play:
 * - Use arrow keys to slide tiles
 * - Combine tiles with the same number
 * - Reach 2048 to win!
 * - Game over when no moves are possible
 *
 * Features:
 * - Full game logic
 * - Smooth tile animations
 * - Score tracking
 * - High score persistence
 * - Colorful UI
 * - Undo functionality
 */

import { Door, UIEngine } from '@amiexpress/bbs-door-sdk';
import * as fs from 'fs';
import * as path from 'path';

const door = new Door({
  name: '2048 Game',
  version: '1.0.0',
  author: 'AmiExpress SDK',
  description: 'Classic 2048 sliding tile puzzle game',
});

// Game state
type Grid = number[][];

interface GameState {
  grid: Grid;
  score: number;
  bestScore: number;
  gameOver: boolean;
  won: boolean;
}

// Tile colors based on value
const TILE_COLORS: { [key: number]: { bg: string; fg: string } } = {
  0: { bg: 'black', fg: 'white' },
  2: { bg: 'white', fg: 'black' },
  4: { bg: 'yellow', fg: 'black' },
  8: { bg: 'blue', fg: 'white' },
  16: { bg: 'magenta', fg: 'white' },
  32: { bg: 'red', fg: 'white' },
  64: { bg: 'cyan', fg: 'black' },
  128: { bg: 'green', fg: 'white' },
  256: { bg: 'brightyellow', fg: 'black' },
  512: { bg: 'brightblue', fg: 'white' },
  1024: { bg: 'brightmagenta', fg: 'white' },
  2048: { bg: 'brightred', fg: 'white' },
  4096: { bg: 'brightcyan', fg: 'black' },
};

class Game2048 {
  private state: GameState;
  private previousState: GameState | null = null;
  private highScorePath: string;

  constructor(highScorePath: string) {
    this.highScorePath = highScorePath;
    this.state = {
      grid: this.createEmptyGrid(),
      score: 0,
      bestScore: this.loadHighScore(),
      gameOver: false,
      won: false,
    };
    this.addRandomTile();
    this.addRandomTile();
  }

  private createEmptyGrid(): Grid {
    return Array(4)
      .fill(0)
      .map(() => Array(4).fill(0));
  }

  private loadHighScore(): number {
    try {
      if (fs.existsSync(this.highScorePath)) {
        return parseInt(fs.readFileSync(this.highScorePath, 'utf-8'));
      }
    } catch (err) {
      console.error('Error loading high score:', err);
    }
    return 0;
  }

  private saveHighScore(): void {
    try {
      const dir = path.dirname(this.highScorePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.highScorePath, this.state.bestScore.toString());
    } catch (err) {
      console.error('Error saving high score:', err);
    }
  }

  private addRandomTile(): void {
    const emptyCells: [number, number][] = [];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (this.state.grid[r][c] === 0) {
          emptyCells.push([r, c]);
        }
      }
    }

    if (emptyCells.length > 0) {
      const [r, c] = emptyCells[Math.floor(Math.random() * emptyCells.length)];
      this.state.grid[r][c] = Math.random() < 0.9 ? 2 : 4;
    }
  }

  private saveState(): void {
    this.previousState = JSON.parse(JSON.stringify(this.state));
  }

  public undo(): boolean {
    if (this.previousState) {
      this.state = JSON.parse(JSON.stringify(this.previousState));
      this.previousState = null;
      return true;
    }
    return false;
  }

  private compress(row: number[]): number[] {
    return row.filter(x => x !== 0).concat(Array(4).fill(0)).slice(0, 4);
  }

  private merge(row: number[]): { row: number[]; score: number } {
    let score = 0;
    const compressed = this.compress(row);
    const result = [...compressed];

    for (let i = 0; i < 3; i++) {
      if (result[i] !== 0 && result[i] === result[i + 1]) {
        result[i] *= 2;
        result[i + 1] = 0;
        score += result[i];

        if (result[i] === 2048) {
          this.state.won = true;
        }
      }
    }

    return { row: this.compress(result), score };
  }

  private rotateGrid(times: number): void {
    for (let t = 0; t < times; t++) {
      const newGrid: Grid = this.createEmptyGrid();
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
          newGrid[c][3 - r] = this.state.grid[r][c];
        }
      }
      this.state.grid = newGrid;
    }
  }

  public move(direction: 'up' | 'down' | 'left' | 'right'): boolean {
    this.saveState();

    const rotations = { up: 3, down: 1, left: 0, right: 2 };
    this.rotateGrid(rotations[direction]);

    let moved = false;
    let addedScore = 0;

    for (let r = 0; r < 4; r++) {
      const original = [...this.state.grid[r]];
      const { row, score } = this.merge(this.state.grid[r]);
      this.state.grid[r] = row;
      addedScore += score;

      if (JSON.stringify(original) !== JSON.stringify(row)) {
        moved = true;
      }
    }

    this.rotateGrid(4 - rotations[direction]);

    if (moved) {
      this.state.score += addedScore;
      if (this.state.score > this.state.bestScore) {
        this.state.bestScore = this.state.score;
        this.saveHighScore();
      }
      this.addRandomTile();
      this.checkGameOver();
    } else {
      // Restore state if no move happened
      this.previousState = null;
    }

    return moved;
  }

  private checkGameOver(): void {
    // Check if any moves are possible
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (this.state.grid[r][c] === 0) {
          return; // Empty cell exists
        }
        if (c < 3 && this.state.grid[r][c] === this.state.grid[r][c + 1]) {
          return; // Horizontal merge possible
        }
        if (r < 3 && this.state.grid[r][c] === this.state.grid[r + 1][c]) {
          return; // Vertical merge possible
        }
      }
    }

    this.state.gameOver = true;
  }

  public getState(): GameState {
    return this.state;
  }

  public reset(): void {
    this.state = {
      grid: this.createEmptyGrid(),
      score: 0,
      bestScore: this.loadHighScore(),
      gameOver: false,
      won: false,
    };
    this.previousState = null;
    this.addRandomTile();
    this.addRandomTile();
  }
}

door.onConnect(async (user: any) => {
  console.log(`User ${user.name} connected to 2048 Game`);

  const highScorePath = path.join(__dirname, 'highscore.txt');
  const game = new Game2048(highScorePath);

  // Create UI engine
  const ui = new UIEngine({
    width: 80,
    height: 24,
    smartCSR: true,
    enableMouse: false,
    enableKeys: true,
  });

  const renderGame = () => {
    ui.clear();

    const state = game.getState();

    // Title bar
    ui.createBox({
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      content: '{center}{bold}2048 GAME{/bold}\n{center}Combine tiles to reach 2048!{/center}',
      tags: true,
      style: {
        fg: 'white',
        bg: 'blue',
      },
    });

    // Score panel
    ui.createBox({
      top: 3,
      left: 2,
      width: 20,
      height: 5,
      border: { type: 'line' },
      label: ' Score ',
      content: `{center}{bold}{yellow-fg}${state.score}{/yellow-fg}{/bold}{/center}`,
      tags: true,
      style: {
        border: { fg: 'yellow' },
      },
    });

    // Best score panel
    ui.createBox({
      top: 3,
      left: 24,
      width: 20,
      height: 5,
      border: { type: 'line' },
      label: ' Best ',
      content: `{center}{bold}{green-fg}${state.bestScore}{/green-fg}{/bold}{/center}`,
      tags: true,
      style: {
        border: { fg: 'green' },
      },
    });

    // Game board
    const boardTop = 9;
    const boardLeft = 10;
    const tileWidth = 10;
    const tileHeight = 4;

    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const value = state.grid[r][c];
        const colors = TILE_COLORS[value] || TILE_COLORS[0];

        const x = boardLeft + c * (tileWidth + 1);
        const y = boardTop + r * (tileHeight + 1);

        ui.createBox({
          top: y,
          left: x,
          width: tileWidth,
          height: tileHeight,
          content: value > 0 ? `{center}{bold}${value}{/bold}{/center}` : '',
          tags: true,
          border: { type: 'line' },
          style: {
            fg: colors.fg,
            bg: colors.bg,
            border: { fg: 'cyan' },
          },
        });
      }
    }

    // Controls panel
    ui.createBox({
      top: 9,
      left: 56,
      width: 22,
      height: 12,
      border: { type: 'line' },
      label: ' Controls ',
      content:
        '{cyan-fg}Arrow Keys:{/cyan-fg}\n' +
        '  Move tiles\n\n' +
        '{cyan-fg}[U]{/cyan-fg} Undo\n' +
        '{cyan-fg}[N]{/cyan-fg} New Game\n' +
        '{cyan-fg}[Q]{/cyan-fg} Quit\n\n' +
        '{yellow-fg}Combine tiles\n' +
        'to reach 2048!{/yellow-fg}',
      tags: true,
      style: {
        border: { fg: 'yellow' },
      },
    });

    // Game status
    if (state.won && !state.gameOver) {
      ui.createBox({
        top: 'center',
        left: 'center',
        width: 40,
        height: 8,
        border: { type: 'line' },
        label: ' YOU WON! ',
        content: '{center}{bold}{green-fg}Congratulations!{/green-fg}{/bold}\n\n' +
          `{center}Final Score: {yellow-fg}${state.score}{/yellow-fg}\n\n` +
          '{center}Press {cyan-fg}N{/cyan-fg} for new game\n' +
          '{center}or {cyan-fg}Q{/cyan-fg} to quit{/center}',
        tags: true,
        style: {
          fg: 'white',
          bg: 'black',
          border: { fg: 'green' },
        },
      });
    } else if (state.gameOver) {
      ui.createBox({
        top: 'center',
        left: 'center',
        width: 40,
        height: 8,
        border: { type: 'line' },
        label: ' GAME OVER ',
        content: '{center}{bold}{red-fg}No more moves!{/red-fg}{/bold}\n\n' +
          `{center}Final Score: {yellow-fg}${state.score}{/yellow-fg}\n\n` +
          '{center}Press {cyan-fg}N{/cyan-fg} for new game\n' +
          '{center}or {cyan-fg}Q{/cyan-fg} to quit{/center}',
        tags: true,
        style: {
          fg: 'white',
          bg: 'black',
          border: { fg: 'red' },
        },
      });
    }

    // Status bar
    ui.createBox({
      bottom: 0,
      left: 0,
      width: '100%',
      height: 1,
      content: ` Player: ${user.name} | Use arrow keys to move | Q to quit `,
      style: {
        fg: 'white',
        bg: 'blue',
      },
    });

    ui.render();
  };

  // Initial render
  renderGame();

  // Keyboard controls
  ui.onKey(['up', 'k'], () => {
    if (!game.getState().gameOver) {
      game.move('up');
      renderGame();
    }
  });

  ui.onKey(['down', 'j'], () => {
    if (!game.getState().gameOver) {
      game.move('down');
      renderGame();
    }
  });

  ui.onKey(['left', 'h'], () => {
    if (!game.getState().gameOver) {
      game.move('left');
      renderGame();
    }
  });

  ui.onKey(['right', 'l'], () => {
    if (!game.getState().gameOver) {
      game.move('right');
      renderGame();
    }
  });

  ui.onKey(['u', 'U'], () => {
    if (game.undo()) {
      renderGame();
    }
  });

  ui.onKey(['n', 'N'], () => {
    game.reset();
    renderGame();
  });

  ui.onKey(['q', 'Q', 'escape'], () => {
    ui.destroy();
    door.disconnect(user.id);
  });
});

door.onDisconnect((user: any) => {
  console.log(`User ${user.name} disconnected from 2048 Game`);
});

door.start();
console.log('2048 Game door started!');
