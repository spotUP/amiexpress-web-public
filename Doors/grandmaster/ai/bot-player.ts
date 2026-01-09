/**
 * AI Bot Player
 *
 * Simulates an AI player for testing multiplayer and CPU battles
 */

import type { GameEngine } from '../core/game';
import type { Board, Piece, PieceType } from '../core/types';
import { getGhostY, cloneBoard, placePiece, getCompleteLines, clearLines, countHoles, getBumpiness, getBoardHeight } from '../core/board';

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

    // Get piece shapes from the engine
    const engine = this.lastEngine;
    if (!engine) {
      return bestEvaluation;
    }

    const pieceManager = (engine as any).pieceManager;
    if (!pieceManager) {
      return bestEvaluation;
    }

    // Try all rotations
    for (let rotation = 0; rotation < 4; rotation++) {
      const shape = pieceManager.getShape(piece.type, rotation as 0 | 1 | 2 | 3);
      if (!shape) continue;

      // Calculate piece width for this rotation
      let pieceWidth = 0;
      for (let row = 0; row < shape.length; row++) {
        for (let col = 0; col < shape[row].length; col++) {
          if (shape[row][col]) {
            pieceWidth = Math.max(pieceWidth, col + 1);
          }
        }
      }

      // Try all valid x positions
      for (let x = -2; x < board.width; x++) {
        const score = this.evaluatePosition(board, piece.type, x, rotation, shape, pieceManager);

        if (score > bestEvaluation.score) {
          bestEvaluation = { x, rotation, score };
        }
      }
    }

    // Apply error rate - sometimes choose a suboptimal move
    if (Math.random() < this.errorRate) {
      bestEvaluation.x += Math.floor(Math.random() * 3) - 1;  // -1, 0, or 1
      bestEvaluation.x = Math.max(-2, Math.min(board.width - 1, bestEvaluation.x));
    }

    return bestEvaluation;
  }

  /**
   * Evaluate a specific piece placement by simulating it
   */
  private evaluatePosition(
    board: Board,
    pieceType: PieceType,
    x: number,
    rotation: number,
    shape: number[][],
    pieceManager: any
  ): number {
    // Clone the board to simulate placement
    const testBoard = cloneBoard(board);

    // Find the drop position (ghost Y)
    const ghostY = getGhostY(testBoard, shape, x, 0);

    // Check if this position is even valid
    let valid = true;
    for (let row = 0; row < shape.length && valid; row++) {
      for (let col = 0; col < shape[row].length && valid; col++) {
        if (shape[row][col]) {
          const bx = x + col;
          const by = ghostY + row;
          if (bx < 0 || bx >= board.width || by >= board.height) {
            valid = false;
          }
        }
      }
    }

    if (!valid) {
      return -Infinity;
    }

    // Place the piece on the test board
    placePiece(testBoard, shape, x, ghostY, pieceType);

    // Check for line clears
    const clearedLines = getCompleteLines(testBoard);
    const lineCount = clearedLines.length;
    if (lineCount > 0) {
      clearLines(testBoard, clearedLines);
    }

    // Evaluate the resulting board state
    let score = 0;

    // Big bonus for line clears (especially Tetrises)
    if (lineCount === 4) {
      score += 1000;  // Tetris bonus
    } else if (lineCount === 3) {
      score += 300;   // Triple
    } else if (lineCount === 2) {
      score += 150;   // Double
    } else if (lineCount === 1) {
      score += 50;    // Single
    }

    // Penalize holes heavily
    const holes = countHoles(testBoard);
    score -= holes * 50;

    // Penalize bumpiness (height differences between columns)
    const bumpiness = getBumpiness(testBoard);
    score -= bumpiness * 3;

    // Penalize high stacks
    const height = getBoardHeight(testBoard);
    score -= height * 2;

    // Prefer lower placements
    score += ghostY * 0.5;

    // Difficulty scaling - higher difficulty weights line clears more
    score *= (this.difficulty / 5);

    return score;
  }

  // Store reference to engine for piece manager access
  private lastEngine: GameEngine | null = null;

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
