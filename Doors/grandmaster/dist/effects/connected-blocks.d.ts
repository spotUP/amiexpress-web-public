/**
 * Connected Block Rendering System
 *
 * Implements 8-direction adjacency detection and box-drawing character rendering
 * for connected blocks of the same color. Creates visual continuity similar to
 * classic Tetris games.
 *
 * Uses cached adjacency data for performance (~2ms per frame when cache valid).
 */
import type { Board } from '../core/types';
/**
 * Connected Block Renderer
 *
 * Calculates adjacency and renders box-drawing characters for connected blocks.
 * Caches adjacency data to avoid recalculation when board unchanged.
 */
export declare class ConnectedBlockRenderer {
    private cache;
    private boardHash;
    private enabled;
    /**
     * Enable or disable connected block rendering
     */
    setEnabled(enabled: boolean): void;
    /**
     * Check if enabled
     */
    isEnabled(): boolean;
    /**
     * Update cache for current board state
     *
     * Call this once per frame before rendering. Only recalculates if board changed.
     *
     * @param board - Game board
     */
    updateCache(board: Board): void;
    /**
     * Calculate adjacency for all cells
     *
     * Builds a map of cell positions to adjacency bit flags.
     * Only cells of the same color are considered adjacent.
     */
    private calculateAdjacency;
    /**
     * Check if cell at position has same color as reference
     *
     * @param board - Game board
     * @param x - Cell X position
     * @param y - Cell Y position
     * @param color - Reference color
     * @returns true if cell filled and same color
     */
    private isSameColor;
    /**
     * Get adjacency data for a cell
     *
     * @param x - Cell X position
     * @param y - Cell Y position
     * @returns Adjacency bit flags, or 0 if not cached
     */
    getAdjacency(x: number, y: number): number;
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
    getConnectedChar(x: number, y: number, color: string): string;
    /**
     * Convert adjacency bitmask to box-drawing character
     *
     * Uses 4-way orthogonal connections (N, S, E, W).
     * Diagonal connections (NE, SE, SW, NW) are ignored for simplicity.
     *
     * @param adjacency - Adjacency bit flags
     * @returns Box-drawing character (or solid block if no pattern)
     */
    private getBoxDrawingChar;
    /**
     * Hash board state for cache invalidation
     *
     * Creates a string hash of filled cell positions and colors.
     * Used to detect when board has changed and cache needs refresh.
     *
     * @param board - Game board
     * @returns Hash string
     */
    private hashBoard;
    /**
     * Clear cache (useful for board reset)
     */
    clear(): void;
    /**
     * Get cache size (for debugging/monitoring)
     */
    getCacheSize(): number;
}
//# sourceMappingURL=connected-blocks.d.ts.map