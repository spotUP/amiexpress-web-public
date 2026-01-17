/**
 * Minimap Renderer
 *
 * Compact opponent board visualization using single-character blocks
 * Optimized for Battle Royale mode (up to 99 players)
 */
import type { Board } from '../core/types';
import type { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import type { Box } from '@amiexpress/bbs-door-sdk/engines/ui/blessed/widgets/box';
/**
 * Opponent state for minimap
 */
export interface OpponentState {
    id: string;
    name: string;
    board: Board;
    level: number;
    grade: string;
    alive: boolean;
    targeting?: boolean;
    rank?: number;
}
/**
 * Minimap configuration
 */
export interface MinimapConfig {
    width: number;
    height: number;
    showName: boolean;
    showLevel: boolean;
    showGrade: boolean;
    compact: boolean;
}
/**
 * Minimap Renderer
 *
 * Renders opponent boards in compact single-character format
 */
export declare class MinimapRenderer {
    private config;
    constructor(config?: Partial<MinimapConfig>);
    /**
     * Render a single opponent minimap
     */
    renderMinimap(opponent: OpponentState): string;
    /**
     * Render multiple opponent minimaps in a grid layout
     */
    renderMinimapGrid(parent: Screen | Box, opponents: OpponentState[], maxVisible?: number): void;
    /**
     * Render Battle Royale HUD with rank and alive count
     */
    renderBattleRoyaleHUD(screen: Screen, rank: number, aliveCount: number, totalPlayers: number): void;
    /**
     * Get ANSI color for piece type (single character display)
     */
    private getPieceColor;
    /**
     * Update minimap configuration
     */
    setConfig(config: Partial<MinimapConfig>): void;
}
/**
 * Opponent Tracker
 *
 * Manages opponent states for minimap display
 */
export declare class OpponentTracker {
    private opponents;
    /**
     * Add or update opponent
     */
    updateOpponent(id: string, state: Partial<OpponentState>): void;
    /**
     * Remove opponent
     */
    removeOpponent(id: string): void;
    /**
     * Get all opponents
     */
    getOpponents(): OpponentState[];
    /**
     * Get alive opponents
     */
    getAliveOpponents(): OpponentState[];
    /**
     * Get opponents targeting you
     */
    getTargetingOpponents(): OpponentState[];
    /**
     * Clear all opponents
     */
    clear(): void;
    /**
     * Get opponent count
     */
    count(): number;
    /**
     * Get alive count
     */
    aliveCount(): number;
}
//# sourceMappingURL=minimap.d.ts.map