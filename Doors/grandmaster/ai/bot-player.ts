/**
 * AI Bot Player
 *
 * Simulates an AI player for testing multiplayer and CPU battles
 */

import type { GameEngine } from '../core/game';
import type { Board, Piece, PieceType } from '../core/types';
import { getGhostY } from '../core/board';

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
  private difficulty: BotDifficulty;
  private thinkDelay: number;  // Milliseconds between moves
  private errorRate: number;   // Probability of making a bad move (0-1)
  private lastMove: number = 0;
  private targetPlacement: PlacementEvaluation | null = null;

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
    const now = Date.now();
    if (now - this.lastMove < this.thinkDelay) {
      return;  // Not time to move yet
    }

    const gameState = engine.getState();
    if (!gameState.currentPiece || gameState.status !== 'playing') {
      return;
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
    let bestEvaluation: PlacementEvaluation = {
      x: piece.x,
      rotation: piece.rotation,
      score: -Infinity,
    };

    // Try all rotations
    for (let rotation = 0; rotation < 4; rotation++) {
      // Try all x positions
      for (let x = 0; x < board.width; x++) {
        const score = this.evaluatePosition(board, piece.type, x, rotation);

        if (score > bestEvaluation.score) {
          bestEvaluation = { x, rotation, score };
        }
      }
    }

    // Apply error rate - sometimes choose a suboptimal move
    if (Math.random() < this.errorRate) {
      bestEvaluation.x += Math.floor(Math.random() * 3) - 1;  // -1, 0, or 1
      bestEvaluation.x = Math.max(0, Math.min(board.width - 1, bestEvaluation.x));
    }

    return bestEvaluation;
  }

  /**
   * Evaluate a specific piece placement
   */
  private evaluatePosition(
    board: Board,
    pieceType: PieceType,
    x: number,
    rotation: number
  ): number {
    // Simplified evaluation heuristic
    // Real implementation would simulate placement and evaluate board state

    let score = 0;

    // Prefer center columns (less extreme = better)
    const centerDistance = Math.abs(x - board.width / 2);
    score -= centerDistance * 2;

    // Prefer placements that create flat top
    score += this.evaluateFlatTop(board);

    // Avoid creating holes
    score -= this.countHoles(board) * 10;

    // Prefer lower placements (higher y = lower on screen)
    score += this.evaluateHeight(board);

    // Bonus for completing lines
    score += this.evaluateLineClears(board) * 50;

    // Difficulty scaling - higher difficulty makes better decisions
    score *= (this.difficulty / 5);

    return score;
  }

  /**
   * Evaluate board for flat top
   */
  private evaluateFlatTop(board: Board): number {
    const heights: number[] = [];

    for (let x = 0; x < board.width; x++) {
      let height = 0;
      for (let y = 0; y < board.height; y++) {
        if (board.grid[y][x].filled) {
          height = board.height - y;
          break;
        }
      }
      heights.push(height);
    }

    // Calculate variance (lower = flatter)
    const avg = heights.reduce((a, b) => a + b, 0) / heights.length;
    const variance = heights.reduce((sum, h) => sum + Math.pow(h - avg, 2), 0) / heights.length;

    return -variance;  // Negative because lower variance is better
  }

  /**
   * Count holes in board
   */
  private countHoles(board: Board): number {
    let holes = 0;

    for (let x = 0; x < board.width; x++) {
      let foundBlock = false;
      for (let y = 0; y < board.height; y++) {
        if (board.grid[y][x].filled) {
          foundBlock = true;
        } else if (foundBlock) {
          holes++;
        }
      }
    }

    return holes;
  }

  /**
   * Evaluate average height
   */
  private evaluateHeight(board: Board): number {
    let totalHeight = 0;

    for (let x = 0; x < board.width; x++) {
      for (let y = 0; y < board.height; y++) {
        if (board.grid[y][x].filled) {
          totalHeight += board.height - y;
          break;
        }
      }
    }

    // Prefer lower average height
    return -(totalHeight / board.width);
  }

  /**
   * Evaluate potential line clears
   */
  private evaluateLineClears(board: Board): number {
    let lineClears = 0;

    for (let y = 0; y < board.height; y++) {
      let filled = 0;
      for (let x = 0; x < board.width; x++) {
        if (board.grid[y][x].filled) {
          filled++;
        }
      }
      if (filled === board.width) {
        lineClears++;
      }
    }

    return lineClears;
  }

  /**
   * Execute moves to reach target placement
   */
  private executeMoves(
    engine: GameEngine,
    piece: Piece,
    target: PlacementEvaluation
  ): void {
    // Rotate to target rotation
    if (piece.rotation !== target.rotation) {
      const rotationDiff = (target.rotation - piece.rotation + 4) % 4;
      if (rotationDiff === 1) {
        engine.rotate(1);  // CW
      } else if (rotationDiff === 3) {
        engine.rotate(-1);  // CCW
      } else if (rotationDiff === 2) {
        engine.rotate(1);  // CW twice
        return;  // Need another frame
      }
      return;  // Give rotation time to complete
    }

    // Move to target x
    if (piece.x < target.x) {
      engine.move(1);  // Right
    } else if (piece.x > target.x) {
      engine.move(-1);  // Left
    } else {
      // At target position - hard drop
      engine.hardDrop();
      this.targetPlacement = null;  // Clear target for next piece
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
