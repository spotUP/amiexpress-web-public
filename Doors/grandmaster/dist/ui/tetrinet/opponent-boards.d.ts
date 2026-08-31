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
    /** Panel label. Defaults to the in-game one. */
    label?: string;
    /** Tile size. Defaults suit the in-game side panel. */
    boardWidth?: number;
    boardHeight?: number;
    /** Tiles per row. Defaults to three, as the side panel uses. */
    perRow?: number;
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
    private perRow;
    /** True while a single opponent is being shown at full size. */
    private solo;
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
     * The lone opponent, drawn at full size across the whole panel.
     *
     * No inner border and no name strip: the panel's own frame is the only
     * frame, and the name goes in its label. That is what buys the 22 rows a
     * full field needs - an inner border plus a name row leaves only 19, which
     * is why the tiled layout has to scale at all.
     */
    private createFullBoard;
    /** Usable space inside the panel's border. */
    private innerSize;
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