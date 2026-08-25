/**
 * TetriNET Game Engine
 *
 * Extended game engine for TetriNET mode with:
 * - Special block inventory
 * - Continuous effects (immunity, darkness, confusion, mutation)
 * - Sudden death mechanic
 * - TetriNET-style gameplay
 */
import type { PlayerSettings, Piece, PieceType } from '../types';
import type { TetriNetBoard } from './tetrinet-board';
import type { SpecialType } from './specials';
import { SpecialInventory } from './inventory';
import { ContinuousEffectManager } from './continuous-effects';
import { SuddenDeathManager } from './sudden-death';
import type { TetriNetGameOptions } from './game-rules';
/**
 * TetriNET game state
 */
export interface TetriNetGameState {
    board: TetriNetBoard;
    currentPiece: Piece | null;
    holdPiece: PieceType | null;
    canHold: boolean;
    nextQueue: PieceType[];
    level: number;
    lines: number;
    score: number;
    combo: number;
    inventory: SpecialType[];
    activeEffects: string[];
    status: 'ready' | 'countdown' | 'playing' | 'paused' | 'gameover' | 'won';
    startTime: number | null;
    endTime: number | null;
}
/**
 * TetriNET Game Engine
 */
export declare class TetriNetEngine {
    private board;
    private currentPiece;
    private holdPiece;
    private canHold;
    private nextQueue;
    private settings;
    private options;
    private inventory;
    private effectManager;
    private suddenDeath;
    private level;
    private lines;
    private score;
    private combo;
    private lineCount;
    private slines;
    private llines;
    private status;
    private startTime;
    private endTime;
    private lastUpdate;
    private dropTimer;
    private downCount;
    private spawnDelayRemaining;
    private rngState;
    private useSeededRng;
    private onSpecialUsedCallbacks;
    private onLinesAddedCallbacks;
    private onGameOverCallbacks;
    private onBoardUpdateCallbacks;
    constructor(settings: PlayerSettings, options?: Partial<TetriNetGameOptions>);
    /**
     * Start the game
     */
    start(): void;
    /**
     * Pause the game
     */
    pause(): void;
    /**
     * Resume the game
     */
    resume(): void;
    /**
     * Update game state
     */
    update(deltaTime: number): void;
    /**
     * Spawn a new piece
     */
    private spawnPiece;
    /**
     * Move piece left or right
     */
    move(direction: -1 | 1): boolean;
    /**
     * Rotate piece
     */
    rotate(direction: 1 | -1): boolean;
    /**
     * Soft drop (faster descent)
     */
    softDrop(): boolean;
    /**
     * Hard drop (instant drop and lock)
     */
    hardDrop(): void;
    /**
     * Hold the current piece, swapping in whatever was held before.
     *
     * This was a stub that returned false, and spawnPiece() set canHold to
     * FALSE on every spawn, so the bound key did nothing under any
     * circumstances. Hold is a local house rule (options.allowHold): a real
     * TetriNET server's other clients do not have it.
     *
     * One hold per piece, as everywhere else in the genre - otherwise a
     * player can swap back and forth for ever and never place anything.
     */
    hold(): boolean;
    /**
     * Move piece down one row
     */
    private movePieceDown;
    /**
     * Lock piece in place
     */
    private lockPiece;
    /**
     * Calculate score for line clears
     */
    private calculateLineScore;
    /**
     * Use a special from inventory
     */
    useSpecial(targetId?: string): SpecialType | null;
    /**
     * Throw the first special away without using it.
     *
     * The reference client binds this to D; TetriNET inventories are small
     * (10 by default) and a useless special blocks the ones behind it.
     */
    discardSpecial(): SpecialType | null;
    /**
     * Apply incoming special from opponent
     */
    applyIncomingSpecial(special: SpecialType, senderId: string, sourceBoard?: TetriNetBoard): void;
    /**
     * Add garbage lines to board
     */
    addGarbage(lineCount: number, lineType?: 'addline' | 'classic'): void;
    /**
     * Game over
     */
    private gameOver;
    private getDropInterval;
    private getRandomPieceType;
    private getRandomRotation;
    private getRandomSpecial;
    private nextRandom;
    private blockObstructed;
    private getClassicLinesToSend;
    /**
     * Mark as won
     */
    win(): void;
    private scheduleNextPieceSpawn;
    getState(): TetriNetGameState;
    getBoard(): TetriNetBoard;
    getEncodedBoard(): string;
    getCurrentPiece(): Piece | null;
    getInventory(): SpecialInventory;
    getEffectManager(): ContinuousEffectManager;
    getSuddenDeath(): SuddenDeathManager;
    getLevel(): number;
    getLines(): number;
    getScore(): number;
    getStatus(): string;
    getPieceShape(type: PieceType, rotation: 0 | 1 | 2 | 3): number[][];
    /** Whether this game shares one averaged level across the table. */
    usesAverageLevels(): boolean;
    /**
     * Adopt the table's average level.
     *
     * TetriNET's "average levels" option makes every player climb together
     * rather than at their own pace. The option was parsed off the `newgame`
     * message and stored, and then nothing ever read it - so a server that
     * asked for averaged levels got per-player levels anyway.
     */
    applyAverageLevel(average: number): void;
    /** Whether the local hold house rule is on (see options.allowHold). */
    isHoldEnabled(): boolean;
    getGhostY(): number | null;
    getVisibleNextQueue(): PieceType[];
    onSpecialUsed(callback: (special: SpecialType, targetId: string | null) => void): () => void;
    onLinesAdded(callback: (count: number) => void): () => void;
    onGameOver(callback: () => void): () => void;
    onBoardUpdate(callback: (board: TetriNetBoard) => void): () => void;
}
//# sourceMappingURL=tetrinet-engine.d.ts.map