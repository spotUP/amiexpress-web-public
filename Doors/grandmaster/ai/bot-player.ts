/**
 * AI Bot Player
 *
 * Simulates an AI player for testing multiplayer and CPU battles
 */

import type { GameEngine } from '../core/game';
import { PlacementSearch, type PlacementGrid } from './placement-search';
import type { Board, Piece, PieceType } from '../core/types';
import { getGhostY, cloneBoard, placePiece, getCompleteLines, clearLines, countHoles, getBumpiness, getBoardHeight, getColumnHeight } from '../core/board';

/**
 * Bot difficulty level (1-10)
 */
export type BotDifficulty = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

/**
 * Piece placement evaluation
 */
interface PlacementEvaluation {
  x: number;
  rotation: number;
  score: number;
}

/**
 * AI Bot Player
 */
export class BotPlayer {
  /** Shared board evaluator - see ai/placement-search.ts. */
  private search = new PlacementSearch();

  private difficulty: BotDifficulty;
  private thinkDelay: number;  // Milliseconds between moves
  private errorRate: number;   // Probability of making a bad move (0-1)
  private lastMove: number = 0;
  private targetPlacement: PlacementEvaluation | null = null;
  private lastEngine: GameEngine | null = null;
  private targetHold: boolean = false;
  /**
   * Identity of the piece the current targetPlacement was computed for.
   * The plan used to be cleared only by hardDrop(); now that the bot lets
   * the piece fall, it needs to notice a new piece spawning instead.
   */
  private plannedPieceKey: string | null = null;

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

  constructor(difficulty: BotDifficulty = 5) {
    this.difficulty = difficulty;

    // Configure bot behavior based on difficulty
    // Difficulty 1: Beginner (slow, high error rate)
    // Difficulty 5: Intermediate (moderate speed, some errors)
    // Difficulty 10: Expert (fast, near-perfect play)
    this.thinkDelay = Math.max(50, 500 - difficulty * 45);  // 455ms to 50ms
    this.errorRate = Math.max(0, (11 - difficulty) / 20);   // 0.5 to 0.05
  }

  /**
   * Update bot AI (called every frame)
   */
  update(deltaTime: number, engine: GameEngine): void {
    // Store engine reference for piece manager access during evaluation
    this.lastEngine = engine;

    const now = Date.now();
    if (now - this.lastMove < this.thinkDelay) {
      return;  // Not time to move yet
    }

    const gameState = engine.getState();
    if (!gameState.currentPiece || gameState.status !== 'playing') {
      return;
    }

    // Drop the plan as soon as a new piece spawns. Previously the only thing
    // that cleared targetPlacement was the hard drop at the end of
    // executeMoves(); with the piece now falling under gravity, that no
    // longer fires on every placement.
    const pieceKey = `${gameState.piecesPlaced}:${gameState.currentPiece.type}`;
    if (pieceKey !== this.plannedPieceKey) {
      this.targetPlacement = null;
      this.plannedPieceKey = pieceKey;
    }

    // Calculate best placement if we don't have one
    if (!this.targetPlacement) {
      this.targetPlacement = this.evaluateBestPlacement(
        gameState.board,
        gameState.currentPiece
      );
    }

    // Execute moves to reach target placement
    if (this.targetPlacement) {
      this.executeMoves(engine, gameState.currentPiece, this.targetPlacement);
    }

    this.lastMove = now;
  }

  /**
   * Evaluate best placement for current piece
   */
  private evaluateBestPlacement(
    board: Board,
    piece: Piece
  ): PlacementEvaluation {
    const engine = this.lastEngine;
    if (!engine) {
      return { x: piece.x, rotation: piece.rotation, score: -Infinity };
    }

    const gameState = engine.getState();
    const pieceManager = (engine as any).pieceManager;
    
    // Evaluate current piece
    let best = this.findBestMove(board, piece.type, pieceManager);
    
    // Evaluate hold piece if available and we haven't held this turn
    if (gameState.canHold) {
      const holdType = gameState.holdPiece || gameState.nextQueue[0];
      const holdBest = this.findBestMove(board, holdType, pieceManager);
      
      // If holding is better, target holding (represented by a special flag or score)
      if (holdBest.score > best.score + 10) { // Small bias to avoid excessive holding
        this.targetHold = true;
        return holdBest;
      }
    }

    this.targetHold = false;
    return best;
  }

  /**
   * Find best move for a specific piece type
   */
  private findBestMove(board: Board, type: PieceType, pieceManager: any): PlacementEvaluation {
    // The search and the evaluation live in ai/placement-search.ts, shared
    // with the TetriNET bot, which had no evaluator of its own at all.
    this.search.setDifficulty(this.difficulty);
    return this.search.findBest(
      board as unknown as PlacementGrid,
      (rotation: number) => pieceManager.getShape(type, rotation as 0 | 1 | 2 | 3) ?? null
    );
  }

  /**
   * Execute moves to reach target placement
   */
  private executeMoves(
    engine: GameEngine,
    piece: Piece,
    target: PlacementEvaluation
  ): void {
    // If we decided to hold, do it immediately
    if (this.targetHold) {
      engine.hold();
      this.targetHold = false;
      this.targetPlacement = null;
      return;
    }

    // Alignment speed and drop style are SEPARATE concerns.
    //
    // They used to be conflated under one `instantMove` flag: below
    // difficulty 8 the bot applied a single rotation OR a single one-column
    // move per think tick (~275ms at difficulty 5) and returned. That was
    // survivable only because it finished with a hard drop, which lands the
    // piece in the aligned column however long the shuffle took. Once the
    // piece was left to fall under gravity instead, that slow shuffle became
    // a race the bot lost - gravity locked the piece before it reached
    // target.x, so it played into the wrong column and buried itself in
    // holes (reported live 2026-08-25).
    //
    // So: always finish rotating and moving in one tick (the piece is at the
    // top of the board with room to spare), and let difficulty decide only
    // how the piece DESCENDS.
    const slamDown = this.difficulty >= 8;

    // 1. Rotate all the way to the target orientation.
    let guard = 4;
    while (piece.rotation !== target.rotation && guard-- > 0) {
      const rotationDiff = (target.rotation - piece.rotation + 4) % 4;
      const rotated = rotationDiff === 3 ? engine.rotate(-1) : engine.rotate(1);
      // A rotation the engine rejects (wall kick failure) would otherwise
      // spin this loop forever against an unchanged piece.
      if (!rotated) break;
    }

    // 2. Move all the way to the target column.
    if (piece.x !== target.x) {
      const dir = target.x > piece.x ? 1 : -1;
      let steps = Math.abs(target.x - piece.x);
      while (steps-- > 0) {
        if (!engine.move(dir)) break;  // blocked - take what we got
      }
    }

    // 3. Descend. Only the top difficulties slam it down; everyone else
    // soft-drops a row at a time so the opponent's board actually ANIMATES
    // instead of the piece materialising at the bottom.
    if (slamDown) {
      engine.hardDrop();
      this.targetPlacement = null;
    } else {
      // The engine's own gravity and lock handling finish the placement,
      // which spawns the next piece and invalidates the plan via the
      // piece-key check in update().
      engine.softDrop();
    }
  }

  /**
   * Reset bot state
   */
  reset(): void {
    this.targetPlacement = null;
    this.lastMove = 0;
  }

  /**
   * Set difficulty
   */
  setDifficulty(difficulty: BotDifficulty): void {
    this.difficulty = difficulty;
    this.thinkDelay = Math.max(50, 500 - difficulty * 45);
    this.errorRate = Math.max(0, (11 - difficulty) / 20);
  }

  /**
   * Get difficulty
   */
  getDifficulty(): BotDifficulty {
    return this.difficulty;
  }
}

/**
 * Bot player factory
 */
export class BotPlayerFactory {
  /**
   * Create a bot with difficulty level
   */
  static create(difficulty: BotDifficulty): BotPlayer {
    return new BotPlayer(difficulty);
  }

  /**
   * Create a random difficulty bot
   */
  static createRandom(): BotPlayer {
    const difficulty = (Math.floor(Math.random() * 10) + 1) as BotDifficulty;
    return new BotPlayer(difficulty);
  }

  /**
   * Get difficulty name
   */
  static getDifficultyName(difficulty: BotDifficulty): string {
    const names = [
      'Beginner',    // 1
      'Novice',      // 2
      'Amateur',     // 3
      'Intermediate',// 4
      'Skilled',     // 5
      'Advanced',    // 6
      'Expert',      // 7
      'Master',      // 8
      'Grandmaster', // 9
      'God',         // 10
    ];
    return names[difficulty - 1];
  }

  /**
   * Get bot names by difficulty
   */
  static getBotName(difficulty: BotDifficulty): string {
    const names: Record<BotDifficulty, string[]> = {
      1: ['Newbie', 'Rookie', 'Trainee'],
      2: ['Scout', 'Learner', 'Student'],
      3: ['Cadet', 'Apprentice', 'Junior'],
      4: ['Soldier', 'Practitioner', 'Regular'],
      5: ['Sergeant', 'Specialist', 'Veteran'],
      6: ['Captain', 'Professional', 'Elite'],
      7: ['Major', 'Expert', 'Ace'],
      8: ['Colonel', 'Master', 'Legend'],
      9: ['General', 'Grandmaster', 'Titan'],
      10: ['Commander', 'God', 'Supreme'],
    };

    const pool = names[difficulty];
    return pool[Math.floor(Math.random() * pool.length)];
  }
}
