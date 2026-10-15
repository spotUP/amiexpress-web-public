/**
 * Connected Block Rendering System
 *
 * Implements 8-direction adjacency detection and box-drawing character rendering
 * for connected blocks of the same color. Creates visual continuity similar to
 * classic Tetris games.
 *
 * Uses cached adjacency data for performance (~2ms per frame when cache valid).
 */

import type { Board, PieceType } from '../core/types';

/**
 * Direction bit flags for 8-way adjacency detection
 */
enum Direction {
  N  = 1 << 0, // North (up)
  NE = 1 << 1, // North-East
  E  = 1 << 2, // East (right)
  SE = 1 << 3, // South-East
  S  = 1 << 4, // South (down)
  SW = 1 << 5, // South-West
  W  = 1 << 6, // West (left)
  NW = 1 << 7  // North-West
}

/**
 * Connected Block Renderer
 *
 * Calculates adjacency and renders box-drawing characters for connected blocks.
 * Caches adjacency data to avoid recalculation when board unchanged.
 */
export class ConnectedBlockRenderer {
  private cache: Map<string, number> = new Map();
  private boardHash: string = '';
  private enabled: boolean = false;

  /**
   * Enable or disable connected block rendering
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.cache.clear();
      this.boardHash = '';
    }
  }

  /**
   * Check if enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Update cache for current board state
   *
   * Call this once per frame before rendering. Only recalculates if board changed.
   *
   * @param board - Game board
   */
  updateCache(board: Board): void {
    if (!this.enabled) return;

    const newHash = this.hashBoard(board);
    if (newHash === this.boardHash) {
      return; // No change, use cached data
    }

    this.calculateAdjacency(board);
    this.boardHash = newHash;
  }

  /**
   * Calculate adjacency for all cells
   *
   * Builds a map of cell positions to adjacency bit flags.
   * Only cells of the same color are considered adjacent.
   */
  private calculateAdjacency(board: Board): void {
    this.cache.clear();

    for (let y = 0; y < board.height; y++) {
      for (let x = 0; x < board.width; x++) {
        const cell = board.grid[y][x];
        if (!cell.filled) continue;

        const color = cell.color;
        let adjacency = 0;

        // Check 8 directions (orthogonal + diagonal)
        if (this.isSameColor(board, x, y - 1, color)) adjacency |= Direction.N;
        if (this.isSameColor(board, x + 1, y - 1, color)) adjacency |= Direction.NE;
        if (this.isSameColor(board, x + 1, y, color)) adjacency |= Direction.E;
        if (this.isSameColor(board, x + 1, y + 1, color)) adjacency |= Direction.SE;
        if (this.isSameColor(board, x, y + 1, color)) adjacency |= Direction.S;
        if (this.isSameColor(board, x - 1, y + 1, color)) adjacency |= Direction.SW;
        if (this.isSameColor(board, x - 1, y, color)) adjacency |= Direction.W;
        if (this.isSameColor(board, x - 1, y - 1, color)) adjacency |= Direction.NW;

        this.cache.set(`${x},${y}`, adjacency);
      }
    }
  }

  /**
   * Check if cell at position has same color as reference
   *
   * @param board - Game board
   * @param x - Cell X position
   * @param y - Cell Y position
   * @param color - Reference color
   * @returns true if cell filled and same color
   */
  private isSameColor(board: Board, x: number, y: number, color: PieceType | null): boolean {
    if (x < 0 || x >= board.width || y < 0 || y >= board.height) {
      return false; // Out of bounds
    }

    const cell = board.grid[y][x];
    return cell.filled && cell.color === color;
  }

  /**
   * Get adjacency data for a cell
   *
   * @param x - Cell X position
   * @param y - Cell Y position
   * @returns Adjacency bit flags, or 0 if not cached
   */
  getAdjacency(x: number, y: number): number {
    if (!this.enabled) return 0;
    return this.cache.get(`${x},${y}`) || 0;
  }

  /**
   * Get connected block character for a cell
   *
   * Returns a box-drawing character based on adjacency pattern.
   * Falls back to solid block (██) if no connections.
   *
   * @param x - Cell X position
   * @param y - Cell Y position
   * @param color - Cell color (for blessed tag)
   * @returns Blessed-tagged box-drawing character
   */
  getConnectedChar(x: number, y: number, color: string): string {
    if (!this.enabled) {
      return `{${color}-fg}██{/${color}-fg}`;
    }

    const adjacency = this.getAdjacency(x, y);
    const char = this.getBoxDrawingChar(adjacency);
    return `{${color}-fg}${char}{/${color}-fg}`;
  }

  /**
   * Convert adjacency bitmask to box-drawing character
   *
   * Uses 4-way orthogonal connections (N, S, E, W).
   * Diagonal connections (NE, SE, SW, NW) are ignored for simplicity.
   *
   * @param adjacency - Adjacency bit flags
   * @returns Box-drawing character (or solid block if no pattern)
   */
  private getBoxDrawingChar(adjacency: number): string {
    // Extract orthogonal connections only
    const hasN = !!(adjacency & Direction.N);
    const hasS = !!(adjacency & Direction.S);
    const hasE = !!(adjacency & Direction.E);
    const hasW = !!(adjacency & Direction.W);

    // Build connection key (e.g., "NS" for vertical, "EW" for horizontal)
    let key = '';
    if (hasN) key += 'N';
    if (hasS) key += 'S';
    if (hasE) key += 'E';
    if (hasW) key += 'W';

    // Map to box-drawing characters
    const charMap: Record<string, string> = {
      // Single connections (dead ends)
      'N': '╨',    // Up
      'S': '╥',    // Down
      'E': '╞',    // Right
      'W': '╡',    // Left

      // Two connections (straight lines and corners)
      'NS': '║',   // Vertical
      'EW': '═',   // Horizontal
      'NE': '╚',   // Up-Right corner
      'NW': '╝',   // Up-Left corner
      'SE': '╔',   // Down-Right corner
      'SW': '╗',   // Down-Left corner

      // Three connections (T-junctions)
      'NSE': '╠',  // T pointing right
      'NSW': '╣',  // T pointing left
      'NEW': '╩',  // T pointing up
      'SEW': '╦',  // T pointing down

      // Four connections (cross)
      'NSEW': '╬',

      // Fallback
      'NONE': '██'
    };

    return charMap[key] || charMap['NONE'];
  }

  /**
   * Hash board state for cache invalidation
   *
   * Creates a string hash of filled cell positions and colors.
   * Used to detect when board has changed and cache needs refresh.
   *
   * @param board - Game board
   * @returns Hash string
   */
  private hashBoard(board: Board): string {
    let hash = '';
    for (let y = 0; y < board.height; y++) {
      for (let x = 0; x < board.width; x++) {
        const cell = board.grid[y][x];
        if (cell.filled) {
          hash += `${x},${y}:${cell.color};`;
        }
      }
    }
    return hash;
  }

  /**
   * Clear cache (useful for board reset)
   */
  clear(): void {
    this.cache.clear();
    this.boardHash = '';
  }

  /**
   * Get cache size (for debugging/monitoring)
   */
  getCacheSize(): number {
    return this.cache.size;
  }
}
