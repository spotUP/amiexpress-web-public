/**
 * Minimap Renderer
 *
 * Battle Royale opponent visualization.
 * Two modes driven by opponent count:
 *
 *   Bucket mode  (≤ BUCKET_THRESHOLD opponents):
 *     Each player = a narrow vertical bar that fills from the bottom as
 *     their stack grows.  Color changes green → yellow → red by danger.
 *
 *   Text list mode  (> BUCKET_THRESHOLD opponents):
 *     Ranked leaderboard showing name, level, and stack height.
 */
import type { Board } from '../core/types';
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
 * Minimap configuration (kept for backward-compat; only compact flag is used)
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
 * MinimapRenderer — renders the battle-royale opponent panel.
 */
export declare class MinimapRenderer {
    private config;
    constructor(config?: Partial<MinimapConfig>);
    /**
     * Render opponents into `container`.
     * Switches between bucket bars and text list automatically.
     */
    renderBuckets(container: any, opponents: OpponentState[]): void;
    /** Rows the stack occupies (0 = empty board, board.height = topped out). */
    private stackHeight;
    /** Color string based on fill fraction (0–1). */
    private dangerColor;
    /**
     * Bucket bar mode — up to BUCKET_THRESHOLD players as vertical bars.
     *
     * Layout (container content, tags enabled):
     *   Row  0     : 3-char names, space-separated
     *   Rows 1-18  : bar fill (full blocks from bottom up)
     *   Row 19     : level numbers
     */
    private buildBuckets;
    /**
     * Text list mode — ranked leaderboard for large lobbies.
     *
     * Format (41 chars wide):
     *   # Name       Lv Ht
     *   ─────────────────────
     *   1 Opponent1  05  12
     *   ...
     */
    private buildTextList;
    /**
     * Update minimap configuration
     */
    setConfig(config: Partial<MinimapConfig>): void;
}
/**
 * Opponent Tracker — manages live opponent states.
 */
export declare class OpponentTracker {
    private opponents;
    updateOpponent(id: string, state: Partial<OpponentState>): void;
    removeOpponent(id: string): void;
    getOpponents(): OpponentState[];
    getAliveOpponents(): OpponentState[];
    getTargetingOpponents(): OpponentState[];
    clear(): void;
    count(): number;
    aliveCount(): number;
}
//# sourceMappingURL=minimap.d.ts.map