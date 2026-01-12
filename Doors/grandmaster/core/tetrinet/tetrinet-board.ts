/**
 * TetriNET Board Extensions
 *
 * Extended board and cell types that support special blocks.
 * TetriNET cells can contain special blocks that are collected when lines clear.
 */

import type { Board, Cell, PieceType } from '../types';
import { createBoard } from '../board';
import type { SpecialType } from './specials';
import { SPECIALS, selectRandomSpecial, getSpecialsForRule } from './specials';

/**
 * Extended cell type that can contain a special block
 */
export interface TetriNetCell extends Cell {
  special?: SpecialType;  // Optional special block in this cell
}

/**
 * Extended board type with TetriNet cells
 */
export interface TetriNetBoard extends Board {
  grid: TetriNetCell[][];
}

/**
 * Create an empty TetriNET board
 */
export function createTetriNetBoard(width: number = 12, height: number = 22): TetriNetBoard {
  const baseBoard = createBoard(width, height);
  return baseBoard as TetriNetBoard;
}

/**
 * Place a special block at a specific cell
 */
export function placeSpecialBlock(
  board: TetriNetBoard,
  x: number,
  y: number,
  special: SpecialType
): boolean {
  if (x < 0 || x >= board.width || y < 0 || y >= board.height) {
    return false;
  }

  const cell = board.grid[y][x];
  if (!cell.filled) {
    return false;  // Can only place special on filled cells
  }

  cell.special = special;
  return true;
}

/**
 * Remove special from a cell
 */
export function removeSpecialBlock(
  board: TetriNetBoard,
  x: number,
  y: number
): SpecialType | null {
  if (x < 0 || x >= board.width || y < 0 || y >= board.height) {
    return null;
  }

  const cell = board.grid[y][x];
  const special = cell.special;
  cell.special = undefined;
  return special ?? null;
}

/**
 * Get special at a cell
 */
export function getSpecialAt(
  board: TetriNetBoard,
  x: number,
  y: number
): SpecialType | null {
  if (x < 0 || x >= board.width || y < 0 || y >= board.height) {
    return null;
  }
  return board.grid[y][x].special ?? null;
}

/**
 * Find all special blocks on the board
 */
export function findSpecialBlocks(
  board: TetriNetBoard
): Array<{ x: number; y: number; special: SpecialType }> {
  const specials: Array<{ x: number; y: number; special: SpecialType }> = [];

  for (let y = 0; y < board.height; y++) {
    for (let x = 0; x < board.width; x++) {
      const special = board.grid[y][x].special;
      if (special) {
        specials.push({ x, y, special });
      }
    }
  }

  return specials;
}

/**
 * Count special blocks on the board
 */
export function countSpecialBlocks(board: TetriNetBoard): number {
  let count = 0;

  for (let y = 0; y < board.height; y++) {
    for (let x = 0; x < board.width; x++) {
      if (board.grid[y][x].special) {
        count++;
      }
    }
  }

  return count;
}

/**
 * Remove all special blocks from the board
 */
export function clearAllSpecialBlocks(board: TetriNetBoard): number {
  let cleared = 0;

  for (let y = 0; y < board.height; y++) {
    for (let x = 0; x < board.width; x++) {
      if (board.grid[y][x].special) {
        board.grid[y][x].special = undefined;
        cleared++;
      }
    }
  }

  return cleared;
}

/**
 * Clear lines and collect specials from cleared cells
 * Returns the collected specials
 */
export function clearLinesWithSpecials(
  board: TetriNetBoard,
  lines: number[]
): SpecialType[] {
  const collectedSpecials: SpecialType[] = [];

  // Collect specials from cleared lines
  for (const lineY of lines) {
    for (let x = 0; x < board.width; x++) {
      const special = board.grid[lineY][x].special;
      if (special) {
        collectedSpecials.push(special);
      }
    }
  }

  // Remove cleared lines (shift down)
  const sortedLines = [...lines].sort((a, b) => b - a);  // Sort descending
  for (const lineY of sortedLines) {
    // Move all rows above down by one
    for (let y = lineY; y > 0; y--) {
      board.grid[y] = board.grid[y - 1];
    }
    // Create new empty row at top
    board.grid[0] = [];
    for (let x = 0; x < board.width; x++) {
      board.grid[0][x] = {
        filled: false,
        color: null,
        locked: false,
        special: undefined,
      };
    }
  }

  return collectedSpecials;
}

/**
 * Add random specials to the board based on lines cleared
 * This is called after placing a piece to distribute special blocks
 */
export function addRandomSpecials(
  board: TetriNetBoard,
  count: number,
  rule: 'classic' | 'standard' | 'extended' = 'extended'
): SpecialType[] {
  const availableSpecials = getSpecialsForRule(rule);
  if (availableSpecials.length === 0 || count <= 0) {
    return [];
  }

  return addSpecialsToField(board, count, availableSpecials);
}

/**
 * Add garbage lines to the bottom of the board
 */
export function addGarbageLines(
  board: TetriNetBoard,
  lineCount: number,
  lineType: 'addline' | 'classic' = 'addline'
): boolean {
  const colorMap: PieceType[] = ['I', 'J', 'L', 'O', 'S'];

  for (let i = 0; i < lineCount; i++) {
    // Check top row for any blocks (top out)
    for (let x = 0; x < board.width; x++) {
      if (board.grid[0][x].filled) {
        return true;
      }
    }

    // Shift all rows up by one
    for (let y = 0; y < board.height - 1; y++) {
      board.grid[y] = board.grid[y + 1];
    }

    // Generate a random line at the bottom
    const y = board.height - 1;
    board.grid[y] = [];
    const hole = Math.floor(Math.random() * board.width);
    for (let x = 0; x < board.width; x++) {
      const value = lineType === 'classic'
        ? (Math.floor(Math.random() * 5) + 1)
        : Math.floor(Math.random() * 6);

      if (x === hole) {
        board.grid[y][x] = {
          filled: false,
          color: null,
          locked: false,
          special: undefined,
        };
      } else if (value === 0) {
        board.grid[y][x] = {
          filled: false,
          color: null,
          locked: false,
          special: undefined,
        };
      } else {
        board.grid[y][x] = {
          filled: true,
          color: colorMap[value - 1] ?? 'I',
          locked: true,
          special: undefined,
        };
      }
    }
  }

  return false;
}

/**
 * Encode board for network transmission (TetriNET format)
 * 0 = empty, 1-7 = piece colors, 8+ = specials
 */
export function encodeBoard(board: TetriNetBoard): string {
  const PIECE_CODES: Record<PieceType, number> = {
    I: 1, J: 2, L: 3, O: 4, S: 5, T: 6, Z: 7,
  };

  const SPECIAL_CODES: Record<SpecialType, number> = {
    add_line: 8,
    clear_line: 9,
    nuke: 10,
    random_clear: 11,
    switch: 12,
    clear_specials: 13,
    gravity: 14,
    quake: 15,
    block_bomb: 16,
    clear_column: 17,
    immunity: 18,
    darkness: 19,
    confusion: 20,
    mutation: 21,
    zebra: 22,
    left_gravity: 23,
  };

  let encoded = '';

  for (let y = 0; y < board.height; y++) {
    for (let x = 0; x < board.width; x++) {
      const cell = board.grid[y][x];
      let code = 0;

      if (cell.filled) {
        if (cell.special) {
          code = SPECIAL_CODES[cell.special] ?? 8;
        } else if (cell.color) {
          code = PIECE_CODES[cell.color] ?? 1;
        } else {
          code = 1;  // Default filled
        }
      }

      // Encode as hex character (0-9, a-n)
      encoded += code.toString(36);
    }
  }

  return encoded;
}

/**
 * Decode board from network transmission
 */
export function decodeBoard(encoded: string, width: number = 12, height: number = 22): TetriNetBoard {
  const PIECE_COLORS: PieceType[] = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];

  const SPECIAL_TYPES: SpecialType[] = [
    'add_line', 'clear_line', 'nuke', 'random_clear', 'switch',
    'clear_specials', 'gravity', 'quake', 'block_bomb', 'clear_column',
    'immunity', 'darkness', 'confusion', 'mutation', 'zebra', 'left_gravity',
  ];

  const board = createTetriNetBoard(width, height);

  let i = 0;
  for (let y = 0; y < height && i < encoded.length; y++) {
    for (let x = 0; x < width && i < encoded.length; x++) {
      const code = parseInt(encoded[i], 36);
      i++;

      if (code === 0) {
        // Empty cell
        board.grid[y][x] = {
          filled: false,
          color: null,
          locked: false,
          special: undefined,
        };
      } else if (code >= 1 && code <= 7) {
        // Piece color
        board.grid[y][x] = {
          filled: true,
          color: PIECE_COLORS[code - 1],
          locked: true,
          special: undefined,
        };
      } else if (code >= 8) {
        // Special block
        const specialIndex = code - 8;
        board.grid[y][x] = {
          filled: true,
          color: 'I',  // Default color for special cells
          locked: true,
          special: SPECIAL_TYPES[specialIndex] ?? 'add_line',
        };
      }
    }
  }

  return board;
}

export function addSpecialsToField(
  board: TetriNetBoard,
  count: number,
  availableSpecials: SpecialType[],
  pickSpecial?: () => SpecialType
): SpecialType[] {
  if (count <= 0 || availableSpecials.length === 0) {
    return [];
  }

  const added: SpecialType[] = [];
  for (let i = 0; i < count; i++) {
    const special = pickSpecial ? pickSpecial() : selectRandomSpecial(availableSpecials);

    // Count non-special filled cells
    const normalCells: Array<{ x: number; y: number }> = [];
    for (let y = 0; y < board.height; y++) {
      for (let x = 0; x < board.width; x++) {
        const cell = board.grid[y][x];
        if (cell.filled && !cell.special) {
          normalCells.push({ x, y });
        }
      }
    }

    if (normalCells.length === 0) {
      // Drop a special near the top of a random column
      let placed = false;
      for (let attempt = 0; attempt < 20; attempt++) {
        const col = Math.floor(Math.random() * board.width);
        let y = 0;
        for (; y < board.height; y++) {
          if (board.grid[y][col].filled) {
            break;
          }
        }

        if (y === board.height || !board.grid[y][col].special) {
          const targetY = y - 1;
          if (targetY >= 0) {
            board.grid[targetY][col] = {
              filled: true,
              color: 'I',
              locked: true,
              special,
            };
            added.push(special);
            placed = true;
            break;
          }
        }
      }
      if (!placed) {
        break;
      }
    } else {
      const pick = normalCells[Math.floor(Math.random() * normalCells.length)];
      placeSpecialBlock(board, pick.x, pick.y, special);
      added.push(special);
    }
  }

  return added;
}

/**
 * Clone a TetriNET board
 */
export function cloneTetriNetBoard(board: TetriNetBoard): TetriNetBoard {
  const newBoard: TetriNetBoard = {
    width: board.width,
    height: board.height,
    grid: [],
  };

  for (let y = 0; y < board.height; y++) {
    newBoard.grid[y] = [];
    for (let x = 0; x < board.width; x++) {
      const cell = board.grid[y][x];
      newBoard.grid[y][x] = {
        filled: cell.filled,
        color: cell.color,
        locked: cell.locked,
        lockTime: cell.lockTime,
        special: cell.special,
      };
    }
  }

  return newBoard;
}

/**
 * Get display character for a cell (for rendering)
 */
export function getCellDisplay(cell: TetriNetCell): string {
  if (!cell.filled) {
    return '  ';
  }

  if (cell.special) {
    const special = SPECIALS[cell.special];
    return `{${special.color}-fg}${special.char}{/${special.color}-fg}`;
  }

  const colors: Record<PieceType, string> = {
    I: 'cyan',
    J: 'blue',
    L: 'white',
    O: 'yellow',
    S: 'green',
    T: 'magenta',
    Z: 'red',
  };

  const color = cell.color ? colors[cell.color] : 'gray';
  return `{${color}-fg}[][]{/${color}-fg}`.slice(0, -1);  // Just "[]"
}
