/**
 * TetriNET Special Effects
 *
 * Implements all 16 special block effects that can be used on boards.
 * Effects are applied to TetriNET boards and modify their state.
 */

import type { TetriNetBoard, TetriNetCell } from './tetrinet-board';
import { cloneTetriNetBoard, clearAllSpecialBlocks, addGarbageLines } from './tetrinet-board';
import type { SpecialType } from './specials';

/**
 * Result of applying a special effect
 */
export interface EffectResult {
  success: boolean;
  message: string;
  linesAffected?: number;
  cellsAffected?: number;
}

/**
 * Apply Add Line effect - adds a garbage line to the board
 */
export function applyAddLine(board: TetriNetBoard, holeColumn?: number): EffectResult {
  addGarbageLines(board, 1, holeColumn);
  return {
    success: true,
    message: 'Added 1 garbage line',
    linesAffected: 1,
  };
}

/**
 * Apply Clear Line effect - removes the bottom line
 */
export function applyClearLine(board: TetriNetBoard): EffectResult {
  // Find the lowest line with blocks
  let lowestLine = -1;
  for (let y = board.height - 1; y >= 0; y--) {
    for (let x = 0; x < board.width; x++) {
      if (board.grid[y][x].filled) {
        lowestLine = y;
        break;
      }
    }
    if (lowestLine >= 0) break;
  }

  if (lowestLine < 0) {
    return {
      success: false,
      message: 'No lines to clear',
      linesAffected: 0,
    };
  }

  // Clear the line and shift down
  for (let y = lowestLine; y > 0; y--) {
    board.grid[y] = board.grid[y - 1];
  }

  // Create empty top row
  board.grid[0] = [];
  for (let x = 0; x < board.width; x++) {
    board.grid[0][x] = {
      filled: false,
      color: null,
      locked: false,
      special: undefined,
    };
  }

  return {
    success: true,
    message: 'Cleared bottom line',
    linesAffected: 1,
  };
}

/**
 * Apply Nuke effect - clears the entire board
 */
export function applyNuke(board: TetriNetBoard): EffectResult {
  let cellsCleared = 0;

  for (let y = 0; y < board.height; y++) {
    for (let x = 0; x < board.width; x++) {
      if (board.grid[y][x].filled) {
        cellsCleared++;
        board.grid[y][x] = {
          filled: false,
          color: null,
          locked: false,
          special: undefined,
        };
      }
    }
  }

  return {
    success: true,
    message: 'NUKED! Board cleared',
    cellsAffected: cellsCleared,
  };
}

/**
 * Apply Random Clear effect - removes 10-25% of random blocks
 */
export function applyRandomClear(board: TetriNetBoard): EffectResult {
  // Find all filled cells
  const filledCells: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < board.height; y++) {
    for (let x = 0; x < board.width; x++) {
      if (board.grid[y][x].filled) {
        filledCells.push({ x, y });
      }
    }
  }

  if (filledCells.length === 0) {
    return {
      success: false,
      message: 'No blocks to clear',
      cellsAffected: 0,
    };
  }

  // Calculate 10-25% to clear
  const percentage = 0.10 + Math.random() * 0.15;
  const countToClear = Math.max(1, Math.floor(filledCells.length * percentage));

  // Shuffle and clear random cells
  for (let i = filledCells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [filledCells[i], filledCells[j]] = [filledCells[j], filledCells[i]];
  }

  for (let i = 0; i < countToClear; i++) {
    const { x, y } = filledCells[i];
    board.grid[y][x] = {
      filled: false,
      color: null,
      locked: false,
      special: undefined,
    };
  }

  return {
    success: true,
    message: `Cleared ${countToClear} random blocks`,
    cellsAffected: countToClear,
  };
}

/**
 * Apply Switch Fields effect - swaps two boards
 * Returns the boards with swapped contents
 */
export function applySwitchFields(
  board1: TetriNetBoard,
  board2: TetriNetBoard
): { board1: TetriNetBoard; board2: TetriNetBoard; result: EffectResult } {
  // Clone both boards
  const temp1 = cloneTetriNetBoard(board1);
  const temp2 = cloneTetriNetBoard(board2);

  // Swap grid contents
  for (let y = 0; y < board1.height; y++) {
    for (let x = 0; x < board1.width; x++) {
      board1.grid[y][x] = temp2.grid[y][x];
      board2.grid[y][x] = temp1.grid[y][x];
    }
  }

  return {
    board1,
    board2,
    result: {
      success: true,
      message: 'Fields switched!',
    },
  };
}

/**
 * Apply Clear Specials effect - removes all special blocks from board
 */
export function applyClearSpecials(board: TetriNetBoard): EffectResult {
  const cleared = clearAllSpecialBlocks(board);

  return {
    success: true,
    message: `Cleared ${cleared} special blocks`,
    cellsAffected: cleared,
  };
}

/**
 * Apply Gravity effect - blocks fall to fill holes
 */
export function applyGravity(board: TetriNetBoard): EffectResult {
  let cellsMoved = 0;

  // Process each column
  for (let x = 0; x < board.width; x++) {
    // Collect all filled cells in this column
    const filledCells: TetriNetCell[] = [];
    for (let y = 0; y < board.height; y++) {
      if (board.grid[y][x].filled) {
        filledCells.push({ ...board.grid[y][x] });
      }
    }

    // Clear the column
    for (let y = 0; y < board.height; y++) {
      if (board.grid[y][x].filled) {
        cellsMoved++;
      }
      board.grid[y][x] = {
        filled: false,
        color: null,
        locked: false,
        special: undefined,
      };
    }

    // Place cells at bottom
    let targetY = board.height - 1;
    for (let i = filledCells.length - 1; i >= 0; i--) {
      board.grid[targetY][x] = filledCells[i];
      targetY--;
    }
  }

  return {
    success: true,
    message: 'Gravity applied - holes filled',
    cellsAffected: cellsMoved,
  };
}

/**
 * Apply Quake effect - shift rows randomly left/right
 */
export function applyQuake(board: TetriNetBoard): EffectResult {
  let rowsAffected = 0;

  for (let y = 0; y < board.height; y++) {
    // Check if row has any blocks
    let hasBlocks = false;
    for (let x = 0; x < board.width; x++) {
      if (board.grid[y][x].filled) {
        hasBlocks = true;
        break;
      }
    }

    if (!hasBlocks) continue;

    // Random shift -2 to +2
    const shift = Math.floor(Math.random() * 5) - 2;
    if (shift === 0) continue;

    rowsAffected++;

    // Save the row
    const originalRow = [...board.grid[y]];

    // Apply shift with wrapping
    for (let x = 0; x < board.width; x++) {
      let srcX = x - shift;
      // Wrap around
      while (srcX < 0) srcX += board.width;
      while (srcX >= board.width) srcX -= board.width;
      board.grid[y][x] = originalRow[srcX];
    }
  }

  return {
    success: true,
    message: `Quake! ${rowsAffected} rows shifted`,
    linesAffected: rowsAffected,
  };
}

/**
 * Apply Block Bomb effect - detonate cells marked as bombs
 * In TetriNET, bomb blocks explode in a cross pattern
 */
export function applyBlockBomb(board: TetriNetBoard): EffectResult {
  // Find all bomb blocks (block_bomb special cells)
  const bombs: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < board.height; y++) {
    for (let x = 0; x < board.width; x++) {
      if (board.grid[y][x].special === 'block_bomb') {
        bombs.push({ x, y });
      }
    }
  }

  if (bombs.length === 0) {
    // No bombs - create an explosion at a random filled cell
    const filledCells: Array<{ x: number; y: number }> = [];
    for (let y = 0; y < board.height; y++) {
      for (let x = 0; x < board.width; x++) {
        if (board.grid[y][x].filled) {
          filledCells.push({ x, y });
        }
      }
    }

    if (filledCells.length > 0) {
      const randomCell = filledCells[Math.floor(Math.random() * filledCells.length)];
      bombs.push(randomCell);
    }
  }

  let cellsCleared = 0;

  // Explode each bomb in a cross pattern (3x3 area)
  for (const bomb of bombs) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = bomb.x + dx;
        const y = bomb.y + dy;

        if (x >= 0 && x < board.width && y >= 0 && y < board.height) {
          if (board.grid[y][x].filled) {
            cellsCleared++;
            board.grid[y][x] = {
              filled: false,
              color: null,
              locked: false,
              special: undefined,
            };
          }
        }
      }
    }
  }

  return {
    success: true,
    message: `BOOM! ${cellsCleared} blocks destroyed`,
    cellsAffected: cellsCleared,
  };
}

/**
 * Apply Clear Column effect - removes a random column
 */
export function applyClearColumn(board: TetriNetBoard): EffectResult {
  // Pick a random column
  const column = Math.floor(Math.random() * board.width);
  let cellsCleared = 0;

  for (let y = 0; y < board.height; y++) {
    if (board.grid[y][column].filled) {
      cellsCleared++;
      board.grid[y][column] = {
        filled: false,
        color: null,
        locked: false,
        special: undefined,
      };
    }
  }

  return {
    success: true,
    message: `Cleared column ${column + 1}`,
    cellsAffected: cellsCleared,
  };
}

/**
 * Apply Zebra Field effect - fill board with alternating pattern
 */
export function applyZebraField(board: TetriNetBoard): EffectResult {
  let cellsFilled = 0;

  for (let y = 4; y < board.height; y++) {  // Start from visible area
    for (let x = 0; x < board.width; x++) {
      // Alternating pattern
      const shouldFill = (x + y) % 2 === 0;

      if (shouldFill && !board.grid[y][x].filled) {
        cellsFilled++;
        board.grid[y][x] = {
          filled: true,
          color: 'I',  // Gray color
          locked: true,
          special: undefined,
        };
      } else if (!shouldFill && board.grid[y][x].filled) {
        board.grid[y][x] = {
          filled: false,
          color: null,
          locked: false,
          special: undefined,
        };
      }
    }
  }

  return {
    success: true,
    message: 'Zebra pattern applied!',
    cellsAffected: cellsFilled,
  };
}

/**
 * Apply Left Gravity effect - blocks shift left instead of down
 */
export function applyLeftGravity(board: TetriNetBoard): EffectResult {
  let cellsMoved = 0;

  // Process each row
  for (let y = 0; y < board.height; y++) {
    // Collect all filled cells in this row
    const filledCells: TetriNetCell[] = [];
    for (let x = 0; x < board.width; x++) {
      if (board.grid[y][x].filled) {
        filledCells.push({ ...board.grid[y][x] });
        cellsMoved++;
      }
    }

    // Clear the row
    for (let x = 0; x < board.width; x++) {
      board.grid[y][x] = {
        filled: false,
        color: null,
        locked: false,
        special: undefined,
      };
    }

    // Place cells at left side
    for (let i = 0; i < filledCells.length; i++) {
      board.grid[y][i] = filledCells[i];
    }
  }

  return {
    success: true,
    message: 'Left gravity applied',
    cellsAffected: cellsMoved,
  };
}

/**
 * Apply a special effect by type
 */
export function applySpecialEffect(
  type: SpecialType,
  targetBoard: TetriNetBoard,
  sourceBoard?: TetriNetBoard
): EffectResult {
  switch (type) {
    case 'add_line':
      return applyAddLine(targetBoard);
    case 'clear_line':
      return applyClearLine(targetBoard);
    case 'nuke':
      return applyNuke(targetBoard);
    case 'random_clear':
      return applyRandomClear(targetBoard);
    case 'switch':
      if (sourceBoard) {
        const result = applySwitchFields(targetBoard, sourceBoard);
        return result.result;
      }
      return { success: false, message: 'Switch requires two boards' };
    case 'clear_specials':
      return applyClearSpecials(targetBoard);
    case 'gravity':
      return applyGravity(targetBoard);
    case 'quake':
      return applyQuake(targetBoard);
    case 'block_bomb':
      return applyBlockBomb(targetBoard);
    case 'clear_column':
      return applyClearColumn(targetBoard);
    case 'zebra':
      return applyZebraField(targetBoard);
    case 'left_gravity':
      return applyLeftGravity(targetBoard);

    // Continuous effects - these don't modify boards directly
    case 'immunity':
    case 'darkness':
    case 'confusion':
    case 'mutation':
      return { success: true, message: `${type} effect started` };

    default:
      return { success: false, message: `Unknown effect: ${type}` };
  }
}
