/**
 * TetriNET Opponent Boards Display
 *
 * Shows mini-boards for up to 5 opponents in a grid layout.
 * Each mini-board shows:
 * - Scaled representation of their field (6x10 blocks)
 * - Player name and level
 * - Dead/alive status with visual indicator
 */
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { TetriNetBoard } from '../../core/tetrinet/tetrinet-board';
/**
 * Opponent board data
 */
export interface OpponentBoardData {
    id: string;
    name: string;
    board: TetriNetBoard;
    level: number;
    alive: boolean;
    hasImmunity: boolean;
}
/**
 * Opponent Boards options
 */
export interface OpponentBoardsOptions {
    parent: Screen;
    top: number | string;
    left: number | string;
    width?: number;
    height?: number;
    maxOpponents?: number;
}
/**
 * Opponent Boards component
 */
export declare class OpponentBoards {
    private container;
    private miniBoards;
    private maxOpponents;
    private boardWidth;
    private boardHeight;
    constructor(options: OpponentBoardsOptions);
    /**
     * Update all opponent boards
     */
    updateBoards(opponents: OpponentBoardData[]): void;
    /**
     * Update a single opponent's board
     */
    updateSingleBoard(opponent: OpponentBoardData, index: number): void;
    /**
     * Create a mini-board widget
     */
    private createMiniBoard;
    /**
     * Render a mini-board with scaled content
     */
    private renderMiniBoard;
    /**
     * Render board scaled to mini size
     * Full board is 12x22, mini is 12x8 (every 3 rows -> 1 row)
     */
    private renderScaledBoard;
    /**
     * Get color for cell based on special or piece color
     */
    private getCellColor;
    /**
     * Show attack animation on opponent
     */
    showAttackAnimation(targetId: string, type: 'attack' | 'immunity'): void;
    /**
     * Mark opponent as dead
     */
    markDead(id: string): void;
    /**
     * Get container element
     */
    getElement(): any;
    /**
     * Destroy all widgets
     */
    destroy(): void;
}
//# sourceMappingURL=opponent-boards.d.ts.map