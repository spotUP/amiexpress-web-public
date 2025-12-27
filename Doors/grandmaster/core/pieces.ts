/**
 * Tetris Piece Definitions and Rotation Systems
 *
 * Supports:
 * - SRS (Super Rotation System) - Modern standard
 * - ARS (Arika Rotation System) - TGM classic
 * - NRS (Nintendo Rotation System) - Retro NES
 * - BARS (Bombliss Arika) - Hybrid
 */

import type { PieceType, RotationData, RotationSystem, KickTable } from './types';

// ============================================================================
// Piece Colors (for rendering)
// ============================================================================

export const PIECE_COLORS: Record<PieceType, string> = {
  I: 'cyan',
  O: 'yellow',
  T: 'magenta',
  S: 'green',
  Z: 'red',
  J: 'blue',
  L: 'white',
};

// ============================================================================
// SRS Rotation Data
// ============================================================================

const SRS_SHAPES: Record<PieceType, number[][][]> = {
  I: [
    // 0°
    [[0, 0, 0, 0],
     [1, 1, 1, 1],
     [0, 0, 0, 0],
     [0, 0, 0, 0]],
    // 90°
    [[0, 0, 1, 0],
     [0, 0, 1, 0],
     [0, 0, 1, 0],
     [0, 0, 1, 0]],
    // 180°
    [[0, 0, 0, 0],
     [0, 0, 0, 0],
     [1, 1, 1, 1],
     [0, 0, 0, 0]],
    // 270°
    [[0, 1, 0, 0],
     [0, 1, 0, 0],
     [0, 1, 0, 0],
     [0, 1, 0, 0]],
  ],
  O: [
    // All rotations identical
    [[0, 1, 1, 0],
     [0, 1, 1, 0],
     [0, 0, 0, 0],
     [0, 0, 0, 0]],
    [[0, 1, 1, 0],
     [0, 1, 1, 0],
     [0, 0, 0, 0],
     [0, 0, 0, 0]],
    [[0, 1, 1, 0],
     [0, 1, 1, 0],
     [0, 0, 0, 0],
     [0, 0, 0, 0]],
    [[0, 1, 1, 0],
     [0, 1, 1, 0],
     [0, 0, 0, 0],
     [0, 0, 0, 0]],
  ],
  T: [
    // 0°
    [[0, 1, 0, 0],
     [1, 1, 1, 0],
     [0, 0, 0, 0],
     [0, 0, 0, 0]],
    // 90°
    [[0, 1, 0, 0],
     [0, 1, 1, 0],
     [0, 1, 0, 0],
     [0, 0, 0, 0]],
    // 180°
    [[0, 0, 0, 0],
     [1, 1, 1, 0],
     [0, 1, 0, 0],
     [0, 0, 0, 0]],
    // 270°
    [[0, 1, 0, 0],
     [1, 1, 0, 0],
     [0, 1, 0, 0],
     [0, 0, 0, 0]],
  ],
  S: [
    // 0°
    [[0, 1, 1, 0],
     [1, 1, 0, 0],
     [0, 0, 0, 0],
     [0, 0, 0, 0]],
    // 90°
    [[0, 1, 0, 0],
     [0, 1, 1, 0],
     [0, 0, 1, 0],
     [0, 0, 0, 0]],
    // 180°
    [[0, 0, 0, 0],
     [0, 1, 1, 0],
     [1, 1, 0, 0],
     [0, 0, 0, 0]],
    // 270°
    [[1, 0, 0, 0],
     [1, 1, 0, 0],
     [0, 1, 0, 0],
     [0, 0, 0, 0]],
  ],
  Z: [
    // 0°
    [[1, 1, 0, 0],
     [0, 1, 1, 0],
     [0, 0, 0, 0],
     [0, 0, 0, 0]],
    // 90°
    [[0, 0, 1, 0],
     [0, 1, 1, 0],
     [0, 1, 0, 0],
     [0, 0, 0, 0]],
    // 180°
    [[0, 0, 0, 0],
     [1, 1, 0, 0],
     [0, 1, 1, 0],
     [0, 0, 0, 0]],
    // 270°
    [[0, 1, 0, 0],
     [1, 1, 0, 0],
     [1, 0, 0, 0],
     [0, 0, 0, 0]],
  ],
  J: [
    // 0°
    [[1, 0, 0, 0],
     [1, 1, 1, 0],
     [0, 0, 0, 0],
     [0, 0, 0, 0]],
    // 90°
    [[0, 1, 1, 0],
     [0, 1, 0, 0],
     [0, 1, 0, 0],
     [0, 0, 0, 0]],
    // 180°
    [[0, 0, 0, 0],
     [1, 1, 1, 0],
     [0, 0, 1, 0],
     [0, 0, 0, 0]],
    // 270°
    [[0, 1, 0, 0],
     [0, 1, 0, 0],
     [1, 1, 0, 0],
     [0, 0, 0, 0]],
  ],
  L: [
    // 0°
    [[0, 0, 1, 0],
     [1, 1, 1, 0],
     [0, 0, 0, 0],
     [0, 0, 0, 0]],
    // 90°
    [[0, 1, 0, 0],
     [0, 1, 0, 0],
     [0, 1, 1, 0],
     [0, 0, 0, 0]],
    // 180°
    [[0, 0, 0, 0],
     [1, 1, 1, 0],
     [1, 0, 0, 0],
     [0, 0, 0, 0]],
    // 270°
    [[1, 1, 0, 0],
     [0, 1, 0, 0],
     [0, 1, 0, 0],
     [0, 0, 0, 0]],
  ],
};

// SRS Wall Kick Data (5 tests per rotation)
const SRS_KICKS: Record<string, KickTable> = {
  // JLSTZ pieces
  'JLSTZ_0->1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  'JLSTZ_1->0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  'JLSTZ_1->2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  'JLSTZ_2->1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  'JLSTZ_2->3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  'JLSTZ_3->2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  'JLSTZ_3->0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  'JLSTZ_0->3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],

  // I piece (different kicks)
  'I_0->1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  'I_1->0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  'I_1->2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  'I_2->1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  'I_2->3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  'I_3->2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  'I_3->0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  'I_0->3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],

  // O piece (no kicks)
  'O_0->1': [[0, 0]],
  'O_1->0': [[0, 0]],
  'O_1->2': [[0, 0]],
  'O_2->1': [[0, 0]],
  'O_2->3': [[0, 0]],
  'O_3->2': [[0, 0]],
  'O_3->0': [[0, 0]],
  'O_0->3': [[0, 0]],
};

// ============================================================================
// ARS (Arika Rotation System) - TGM Classic
// ============================================================================

const ARS_SHAPES: Record<PieceType, number[][][]> = {
  // ARS uses same shapes as SRS for most pieces
  I: SRS_SHAPES.I,
  O: SRS_SHAPES.O,
  T: SRS_SHAPES.T,
  S: SRS_SHAPES.S,
  Z: SRS_SHAPES.Z,
  J: SRS_SHAPES.J,
  L: SRS_SHAPES.L,
};

// ARS Wall Kicks (simpler than SRS)
const ARS_KICKS: Record<string, KickTable> = {
  // ARS has minimal wall kicks - only basic shifts
  'JLSTZ_0->1': [[0, 0], [-1, 0], [1, 0]],
  'JLSTZ_1->0': [[0, 0], [1, 0], [-1, 0]],
  'JLSTZ_1->2': [[0, 0], [1, 0], [-1, 0]],
  'JLSTZ_2->1': [[0, 0], [-1, 0], [1, 0]],
  'JLSTZ_2->3': [[0, 0], [1, 0], [-1, 0]],
  'JLSTZ_3->2': [[0, 0], [-1, 0], [1, 0]],
  'JLSTZ_3->0': [[0, 0], [-1, 0], [1, 0]],
  'JLSTZ_0->3': [[0, 0], [1, 0], [-1, 0]],

  // I piece
  'I_0->1': [[0, 0], [-1, 0], [1, 0]],
  'I_1->0': [[0, 0], [1, 0], [-1, 0]],
  'I_1->2': [[0, 0], [1, 0], [-1, 0]],
  'I_2->1': [[0, 0], [-1, 0], [1, 0]],
  'I_2->3': [[0, 0], [1, 0], [-1, 0]],
  'I_3->2': [[0, 0], [-1, 0], [1, 0]],
  'I_3->0': [[0, 0], [-1, 0], [1, 0]],
  'I_0->3': [[0, 0], [1, 0], [-1, 0]],

  // O piece (no kicks)
  'O_0->1': [[0, 0]],
  'O_1->0': [[0, 0]],
  'O_1->2': [[0, 0]],
  'O_2->1': [[0, 0]],
  'O_2->3': [[0, 0]],
  'O_3->2': [[0, 0]],
  'O_3->0': [[0, 0]],
  'O_0->3': [[0, 0]],
};

// ============================================================================
// NRS (Nintendo Rotation System) - Classic NES Tetris
// ============================================================================

const NRS_SHAPES: Record<PieceType, number[][][]> = {
  I: [
    // 0° - Horizontal
    [[0, 0, 0, 0],
     [1, 1, 1, 1],
     [0, 0, 0, 0],
     [0, 0, 0, 0]],
    // 90° - Vertical
    [[0, 1, 0, 0],
     [0, 1, 0, 0],
     [0, 1, 0, 0],
     [0, 1, 0, 0]],
    // 180° - Same as 0°
    [[0, 0, 0, 0],
     [1, 1, 1, 1],
     [0, 0, 0, 0],
     [0, 0, 0, 0]],
    // 270° - Same as 90°
    [[0, 1, 0, 0],
     [0, 1, 0, 0],
     [0, 1, 0, 0],
     [0, 1, 0, 0]],
  ],
  O: SRS_SHAPES.O, // Same as SRS
  T: SRS_SHAPES.T, // Same as SRS
  S: SRS_SHAPES.S, // Same as SRS
  Z: SRS_SHAPES.Z, // Same as SRS
  J: SRS_SHAPES.J, // Same as SRS
  L: SRS_SHAPES.L, // Same as SRS
};

// NRS has NO wall kicks - pure rotation
const NRS_KICKS: Record<string, KickTable> = {
  'JLSTZ_0->1': [[0, 0]],
  'JLSTZ_1->0': [[0, 0]],
  'JLSTZ_1->2': [[0, 0]],
  'JLSTZ_2->1': [[0, 0]],
  'JLSTZ_2->3': [[0, 0]],
  'JLSTZ_3->2': [[0, 0]],
  'JLSTZ_3->0': [[0, 0]],
  'JLSTZ_0->3': [[0, 0]],
  'I_0->1': [[0, 0]],
  'I_1->0': [[0, 0]],
  'I_1->2': [[0, 0]],
  'I_2->1': [[0, 0]],
  'I_2->3': [[0, 0]],
  'I_3->2': [[0, 0]],
  'I_3->0': [[0, 0]],
  'I_0->3': [[0, 0]],
  'O_0->1': [[0, 0]],
  'O_1->0': [[0, 0]],
  'O_1->2': [[0, 0]],
  'O_2->1': [[0, 0]],
  'O_2->3': [[0, 0]],
  'O_3->2': [[0, 0]],
  'O_3->0': [[0, 0]],
  'O_0->3': [[0, 0]],
};

// ============================================================================
// BARS (Big Arika Rotation System) - Hybrid
// ============================================================================

const BARS_SHAPES: Record<PieceType, number[][][]> = {
  // BARS uses SRS shapes
  I: SRS_SHAPES.I,
  O: SRS_SHAPES.O,
  T: SRS_SHAPES.T,
  S: SRS_SHAPES.S,
  Z: SRS_SHAPES.Z,
  J: SRS_SHAPES.J,
  L: SRS_SHAPES.L,
};

// BARS has moderate wall kicks (between ARS and SRS)
const BARS_KICKS: Record<string, KickTable> = {
  // JLSTZ pieces - 3 tests
  'JLSTZ_0->1': [[0, 0], [-1, 0], [-1, 1]],
  'JLSTZ_1->0': [[0, 0], [1, 0], [1, -1]],
  'JLSTZ_1->2': [[0, 0], [1, 0], [1, -1]],
  'JLSTZ_2->1': [[0, 0], [-1, 0], [-1, 1]],
  'JLSTZ_2->3': [[0, 0], [1, 0], [1, 1]],
  'JLSTZ_3->2': [[0, 0], [-1, 0], [-1, -1]],
  'JLSTZ_3->0': [[0, 0], [-1, 0], [-1, -1]],
  'JLSTZ_0->3': [[0, 0], [1, 0], [1, 1]],

  // I piece - 4 tests
  'I_0->1': [[0, 0], [-2, 0], [1, 0], [-2, -1]],
  'I_1->0': [[0, 0], [2, 0], [-1, 0], [2, 1]],
  'I_1->2': [[0, 0], [-1, 0], [2, 0], [-1, 2]],
  'I_2->1': [[0, 0], [1, 0], [-2, 0], [1, -2]],
  'I_2->3': [[0, 0], [2, 0], [-1, 0], [2, 1]],
  'I_3->2': [[0, 0], [-2, 0], [1, 0], [-2, -1]],
  'I_3->0': [[0, 0], [1, 0], [-2, 0], [1, -2]],
  'I_0->3': [[0, 0], [-1, 0], [2, 0], [-1, 2]],

  // O piece (no kicks)
  'O_0->1': [[0, 0]],
  'O_1->0': [[0, 0]],
  'O_1->2': [[0, 0]],
  'O_2->1': [[0, 0]],
  'O_2->3': [[0, 0]],
  'O_3->2': [[0, 0]],
  'O_3->0': [[0, 0]],
  'O_0->3': [[0, 0]],
};

// ============================================================================
// Rotation System Data
// ============================================================================

export class PieceManager {
  private rotationSystem: RotationSystem;

  constructor(rotationSystem: RotationSystem = 'SRS') {
    this.rotationSystem = rotationSystem;
  }

  /**
   * Get piece shape at specified rotation
   */
  getShape(type: PieceType, rotation: 0 | 1 | 2 | 3): number[][] {
    switch (this.rotationSystem) {
      case 'SRS':
        return SRS_SHAPES[type][rotation];
      case 'ARS':
        return ARS_SHAPES[type][rotation];
      case 'NRS':
        return NRS_SHAPES[type][rotation];
      case 'BARS':
        return BARS_SHAPES[type][rotation];
      default:
        return SRS_SHAPES[type][rotation];
    }
  }

  /**
   * Get wall kick offsets for rotation
   */
  getKicks(type: PieceType, fromRotation: number, toRotation: number): KickTable {
    const piece = (type === 'I') ? 'I' : (type === 'O') ? 'O' : 'JLSTZ';
    const key = `${piece}_${fromRotation}->${toRotation}`;

    switch (this.rotationSystem) {
      case 'SRS':
        return SRS_KICKS[key] || [[0, 0]];
      case 'ARS':
        return ARS_KICKS[key] || [[0, 0]];
      case 'NRS':
        return NRS_KICKS[key] || [[0, 0]];
      case 'BARS':
        return BARS_KICKS[key] || [[0, 0]];
      default:
        return SRS_KICKS[key] || [[0, 0]];
    }
  }

  /**
   * Get spawn position for piece type
   */
  getSpawnPosition(type: PieceType, boardWidth: number): { x: number; y: number } {
    // Standard SRS spawn: centered horizontally, top of playfield
    const x = Math.floor((boardWidth - 4) / 2);
    const y = type === 'I' ? -1 : 0;  // I piece spawns higher
    return { x, y };
  }

  /**
   * Generate random piece using 7-bag randomizer
   */
  private bag: PieceType[] = [];

  getRandomPiece(): PieceType {
    if (this.bag.length === 0) {
      this.bag = this.shuffle(['I', 'O', 'T', 'S', 'Z', 'J', 'L']);
    }
    return this.bag.pop()!;
  }

  /**
   * Fill initial queue
   */
  fillQueue(count: number): PieceType[] {
    const queue: PieceType[] = [];
    for (let i = 0; i < count; i++) {
      queue.push(this.getRandomPiece());
    }
    return queue;
  }

  /**
   * Shuffle array (Fisher-Yates)
   */
  private shuffle<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Get piece color for rendering
   */
  getPieceColor(type: PieceType): string {
    return PIECE_COLORS[type];
  }
}

/**
 * Get occupied cells for a piece
 */
export function getPieceCells(
  shape: number[][],
  x: number,
  y: number
): Array<{ x: number; y: number }> {
  const cells: Array<{ x: number; y: number }> = [];

  for (let row = 0; row < shape.length; row++) {
    for (let col = 0; col < shape[row].length; col++) {
      if (shape[row][col]) {
        cells.push({
          x: x + col,
          y: y + row,
        });
      }
    }
  }

  return cells;
}
