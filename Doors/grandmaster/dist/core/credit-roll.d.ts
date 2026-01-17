/**
 * Credit Roll System
 *
 * Invisible challenge at the end of Master mode
 * - Triggered at level 999
 * - TGM3: Total roll time is based on performance, approx 60-90 seconds
 * - Must clear 32 lines to qualify for GM rank
 * - Pieces become invisible AFTER locking
 * - Active piece remains visible but becomes "ghostly" in Master roll
 */
/**
 * Credit roll state
 */
export interface CreditRollState {
    active: boolean;
    startTime: number | null;
    duration: number;
    timeRemaining: number;
    linesCleared: number;
    linesRequired: number;
    qualified: boolean;
}
/**
 * Fade stage for invisible pieces
 */
export type FadeStage = 'full' | 'bright' | 'medium' | 'faint' | 'invisible';
/**
 * Credit Roll Manager
 *
 * Handles the invisible challenge at game end
 */
export declare class CreditRollManager {
    private state;
    constructor();
    /**
     * Start credit roll
     * @param level Starting level (999 for Master, 1300 for Shirase)
     */
    start(level: number): void;
    /**
     * Update credit roll timer
     */
    update(deltaTime: number): void;
    /**
     * Record lines cleared during credit roll
     */
    addLines(count: number): void;
    /**
     * End credit roll
     */
    end(): void;
    /**
     * Check if credit roll is active
     */
    isActive(): boolean;
    /**
     * Check if player qualified (cleared enough lines)
     */
    isQualified(): boolean;
    /**
     * Get current state
     */
    getState(): CreditRollState;
    /**
     * Get fade stage for piece based on lock time
     * Authentic TGM3: Pieces fade out completely in 72 frames (~1.2s)
     */
    getFadeStage(lockTime: number): FadeStage;
    /**
     * Get opacity for fade stage (0.0 - 1.0)
     */
    getOpacity(stage: FadeStage): number;
    /**
     * Reset credit roll
     */
    reset(): void;
}
/**
 * Invisible piece manager
 *
 * Handles piece visibility during credit roll and bone blocks
 */
export declare class InvisiblePieceManager {
    /**
     * Check if current piece should be invisible (active piece)
     * TGM3: Active piece is VISIBLE during Master roll, but board is INVISIBLE
     */
    shouldActivePieceBeInvisible(): boolean;
    /**
     * Should board cells be invisible
     */
    shouldBoardBeInvisible(active: boolean): boolean;
    /**
     * Get visibility level for active piece (0.0 - 1.0)
     */
    getPieceVisibility(active: boolean): number;
    /**
     * Get visibility level for ghost piece (0.0 - 1.0)
     */
    getGhostVisibility(active: boolean): number;
    /**
     * Should show bone blocks (S13+ grades)
     */
    shouldShowBoneBlocks(grade: string): boolean;
}
//# sourceMappingURL=credit-roll.d.ts.map