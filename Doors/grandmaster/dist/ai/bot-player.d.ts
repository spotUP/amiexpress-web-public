/**
 * AI Bot Player
 *
 * Simulates an AI player for testing multiplayer and CPU battles
 */
import type { GameEngine } from '../core/game';
/**
 * Bot difficulty level (1-10)
 */
export type BotDifficulty = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
/**
 * AI Bot Player
 */
export declare class BotPlayer {
    private difficulty;
    private thinkDelay;
    private errorRate;
    private lastMove;
    private targetPlacement;
    private lastEngine;
    private targetHold;
    /**
     * Identity of the piece the current targetPlacement was computed for.
     * The plan used to be cleared only by hardDrop(); now that the bot lets
     * the piece fall, it needs to notice a new piece spawning instead.
     */
    private plannedPieceKey;
    /**
     * Reusable occupancy grid for placement evaluation.
     *
     * Evaluation used to cloneBoard() for EVERY candidate placement - ~80 per
     * think (2 pieces x 4 rotations x ~10 columns), each allocating 240 fresh
     * Cell objects, i.e. ~19,000 allocations per think. With three bots
     * thinking 20x/second that is roughly a million allocations per second on
     * the same event loop that renders the game, and the resulting GC pauses
     * surface as frame hitches. A single Uint8Array reused across every
     * candidate removes the allocation entirely; only occupancy matters for
     * the heuristics, never cell colour.
     */
    private scratch;
    private scratchW;
    private scratchH;
    /** Column heights, recomputed per candidate into a reused array. */
    private colHeights;
    constructor(difficulty?: BotDifficulty);
    /**
     * Update bot AI (called every frame)
     */
    update(deltaTime: number, engine: GameEngine): void;
    /**
     * Evaluate best placement for current piece
     */
    private evaluateBestPlacement;
    /**
     * Find best move for a specific piece type
     */
    private findBestMove;
    /**
     * Evaluate a specific piece placement by simulating it
     */
    private evaluatePosition;
    /**
     * Execute moves to reach target placement
     */
    private executeMoves;
    /**
     * Reset bot state
     */
    reset(): void;
    /**
     * Set difficulty
     */
    setDifficulty(difficulty: BotDifficulty): void;
    /**
     * Get difficulty
     */
    getDifficulty(): BotDifficulty;
}
/**
 * Bot player factory
 */
export declare class BotPlayerFactory {
    /**
     * Create a bot with difficulty level
     */
    static create(difficulty: BotDifficulty): BotPlayer;
    /**
     * Create a random difficulty bot
     */
    static createRandom(): BotPlayer;
    /**
     * Get difficulty name
     */
    static getDifficultyName(difficulty: BotDifficulty): string;
    /**
     * Get bot names by difficulty
     */
    static getBotName(difficulty: BotDifficulty): string;
}
//# sourceMappingURL=bot-player.d.ts.map