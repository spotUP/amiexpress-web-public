/**
 * Board Management
 *
 * Handles:
 * - Collision detection
 * - Line clearing
 * - Piece placement
 * - Ghost piece calculation
 */

import type { Board, Cell, Piece, PieceType } from './types';
import { getPieceCells } from './pieces';

/**
 * Create empty board
 */
export function createBoard(width: number = 10, height: number = 24): Board {
  const grid: Cell[][] = [];

  for (let y = 0; y < height; y++) {
    grid[y] = [];
    for (let x = 0; x < width; x++) {
      grid[y][x] = {
        filled: false,
        color: null,
        locked: false,
        lockTime: undefined,
      };
    }
  }

  return { width, height, grid };
}

/**
 * Check if piece collides with board
 */
export function checkCollision(
  board: Board,
  shape: number[][],
  x: number,
  y: number
): boolean {
  for (let row = 0; row < shape.length; row++) {
    for (let col = 0; col < shape[row].length; col++) {
      if (shape[row][col]) {
        const boardX = x + col;
        const boardY = y + row;

        // Out of bounds
        if (boardX < 0 || boardX >= board.width || boardY >= board.height) {
          return true;
        }

        // Above board (valid during spawn)
        if (boardY < 0) {
          continue;
        }

        // Collision with locked cell
        if (board.grid[boardY][boardX].filled) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Place piece on board (lock it in)
 */
export function placePiece(
  board: Board,
  shape: number[][],
  x: number,
  y: number,
  pieceType: PieceType
): void {
  for (let row = 0; row < shape.length; row++) {
    for (let col = 0; col < shape[row].length; col++) {
      if (shape[row][col]) {
        const boardX = x + col;
        const boardY = y + row;

        if (boardY >= 0 && boardY < board.height) {
          board.grid[boardY][boardX] = {
            filled: true,
            color: pieceType,
            locked: true,
            lockTime: Date.now(),  // Track when piece was locked for visual effects
          };
        }
      }
    }
  }
}

/**
 * Get ghost piece Y position (hard drop preview)
 */
export function getGhostY(
  board: Board,
  shape: number[][],
  x: number,
  startY: number
): number {
  let y = startY;

  while (!checkCollision(board, shape, x, y + 1)) {
    y++;
  }

  return y;
}

/**
 * Check for complete lines and return their indices
 */
export function getCompleteLines(board: Board): number[] {
  const completeLines: number[] = [];

  for (let y = 0; y < board.height; y++) {
    let complete = true;
    for (let x = 0; x < board.width; x++) {
      if (!board.grid[y][x].filled) {
        complete = false;
        break;
      }
    }
    if (complete) {
      completeLines.push(y);
    }
  }

  return completeLines;
}

/**
 * Clear completed lines from board
 */
export function clearLines(board: Board, lines: number[]): void {
  // Sort lines from top to bottom
  const sorted = [...lines].sort((a, b) => a - b);

  // Remove lines
  for (const lineY of sorted) {
    board.grid.splice(lineY, 1);
  }

  // Add new empty lines at top
  for (let i = 0; i < lines.length; i++) {
    const newLine: Cell[] = [];
    for (let x = 0; x < board.width; x++) {
      newLine.push({
        filled: false,
        color: null,
        locked: false,
        lockTime: undefined,
      });
    }
    board.grid.unshift(newLine);
  }
}

/**
 * Check if board is topped out (game over)
 */
export function isTopOut(board: Board): boolean {
  // Check top 4 rows for any locked cells
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < board.width; x++) {
      if (board.grid[y][x].filled && board.grid[y][x].locked) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Check if perfect clear (all cells empty)
 */
export function isPerfectClear(board: Board): boolean {
  for (let y = 0; y < board.height; y++) {
    for (let x = 0; x < board.width; x++) {
      if (board.grid[y][x].filled) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Get board height (highest filled cell)
 */
export function getBoardHeight(board: Board): number {
  for (let y = 0; y < board.height; y++) {
    for (let x = 0; x < board.width; x++) {
      if (board.grid[y][x].filled) {
        return board.height - y;
      }
    }
  }
  return 0;
}

/**
 * Get column height
 */
export function getColumnHeight(board: Board, x: number): number {
  for (let y = 0; y < board.height; y++) {
    if (board.grid[y][x].filled) {
      return board.height - y;
    }
  }
  return 0;
}

/**
 * Count holes in board (empty cell with filled cell above)
 */
export function countHoles(board: Board): number {
  let holes = 0;

  for (let x = 0; x < board.width; x++) {
    let foundBlock = false;
    for (let y = 0; y < board.height; y++) {
      if (board.grid[y][x].filled) {
        foundBlock = true;
      } else if (foundBlock) {
        holes++;
      }
    }
  }

  return holes;
}

/**
 * Get bumpiness (sum of height differences between adjacent columns)
 */
export function getBumpiness(board: Board): number {
  let bumpiness = 0;

  for (let x = 0; x < board.width - 1; x++) {
    bumpiness += Math.abs(
      getColumnHeight(board, x) - getColumnHeight(board, x + 1)
    );
  }

  return bumpiness;
}

/**
 * Add garbage lines to bottom of board
 */
export function addGarbage(board: Board, lines: number, holePosition: number): void {
  // Remove top lines to make space
  board.grid.splice(0, lines);

  // Add garbage lines at bottom
  for (let i = 0; i < lines; i++) {
    const garbageLine: Cell[] = [];
    for (let x = 0; x < board.width; x++) {
      if (x === holePosition) {
        garbageLine.push({
          filled: false,
          color: null,
          locked: false,
          lockTime: undefined,
        });
      } else {
        garbageLine.push({
          filled: true,
          color: 'Z',  // Gray garbage blocks
          locked: true,
          lockTime: Date.now(),
        });
      }
    }
    board.grid.push(garbageLine);
  }
}

/**
 * Clone board for simulation
 */
export function cloneBoard(board: Board): Board {
  return {
    width: board.width,
    height: board.height,
    grid: board.grid.map(row => row.map(cell => ({ ...cell }))),
  };
}
