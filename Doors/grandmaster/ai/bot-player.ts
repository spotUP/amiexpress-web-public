/**
 * AI Bot Player
 *
 * Simulates an AI player for testing multiplayer and CPU battles
 */

import type { GameEngine } from '../core/game';
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
    let best: PlacementEvaluation = { x: 0, rotation: 0, score: -Infinity };

    for (let rotation = 0; rotation < 4; rotation++) {
      const shape = pieceManager.getShape(type, rotation as 0 | 1 | 2 | 3);
      if (!shape) continue;

      // Determine horizontal range
      let minX = 0;
      let maxX = board.width;
      
      // Calculate shape bounds
      let leftBound = 4, rightBound = 0;
      for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[r].length; c++) {
          if (shape[r][c]) {
            leftBound = Math.min(leftBound, c);
            rightBound = Math.max(rightBound, c);
          }
        }
      }

      for (let x = -leftBound; x < board.width - rightBound; x++) {
        const score = this.evaluatePosition(board, type, x, rotation, shape);
        if (score > best.score) {
          best = { x, rotation, score };
        }
      }
    }
    return best;
  }

  /**
   * Evaluate a specific piece placement by simulating it
   */
  private evaluatePosition(
    board: Board,
    pieceType: PieceType,
    x: number,
    rotation: number,
    shape: number[][]
  ): number {
    const testBoard = cloneBoard(board);
    const ghostY = getGhostY(testBoard, shape, x, 0);

    // Validity check
    for (let row = 0; row < shape.length; row++) {
      for (let col = 0; col < shape[row].length; col++) {
        if (shape[row][col]) {
          const by = ghostY + row;
          if (by < 0) return -Infinity; // Spawn area collision
        }
      }
    }

    // Place and count lines
    placePiece(testBoard, shape, x, ghostY, pieceType);
    const clearedLines = getCompleteLines(testBoard);
    const lineCount = clearedLines.length;
    if (lineCount > 0) clearLines(testBoard, clearedLines);

    // Heuristic Weights (Dellacherie-inspired)
    let score = 0;

    // 1. Landing Height (lower is better)
    // The height of the piece's bottom after placement
    const landingHeight = board.height - ghostY;
    score -= landingHeight * 4;

    // 2. Rows Eliminated
    if (lineCount === 4) score += 800;
    else if (lineCount === 3) score += 400;
    else if (lineCount === 2) score += 200;
    else if (lineCount === 1) score += 50;

    // 3. Holes (extremely bad)
    const holes = countHoles(testBoard);
    score -= holes * 400;

    // 4. Blocked Holes (holes with blocks above them)
    // Already partially covered by countHoles, but we can double down
    
    // 5. Bumpiness
    const bumpiness = getBumpiness(testBoard);
    score -= bumpiness * 15;

    // 6. Aggregate Height (sum of all column heights)
    let aggregateHeight = 0;
    const colHeights: number[] = [];
    for (let cx = 0; cx < testBoard.width; cx++) {
      const h = getColumnHeight(testBoard, cx);
      colHeights.push(h);
      aggregateHeight += h;
    }
    score -= aggregateHeight * 2;

    // 7. Well Penalty (Avoid deep wells unless they are for Tetrises)
    // A well is an empty column surrounded by higher columns
    let wells = 0;
    for (let cx = 0; cx < testBoard.width; cx++) {
      const leftH = cx > 0 ? colHeights[cx-1] : testBoard.height;
      const rightH = cx < testBoard.width - 1 ? colHeights[cx+1] : testBoard.height;
      const h = colHeights[cx];
      const depth = Math.min(leftH, rightH) - h;
      if (depth > 2) {
        // Only allow one deep well (usually for Tetris)
        wells += (depth - 2);
      }
    }
    score -= wells * 10;

    // Difficulty scaling
    if (this.difficulty < 10) {
        // Add random noise based on difficulty
        score += (Math.random() - 0.5) * (11 - this.difficulty) * 50;
    }

    return score;
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

    // High difficulty bots move instantly
    const instantMove = this.difficulty >= 8;

    // 1. Handle rotation
    if (piece.rotation !== target.rotation) {
      const rotationDiff = (target.rotation - piece.rotation + 4) % 4;
      if (rotationDiff === 1) {
        engine.rotate(1);  // CW
      } else if (rotationDiff === 3) {
        engine.rotate(-1);  // CCW
      } else if (rotationDiff === 2) {
        engine.rotate(1);  // CW twice
        if (instantMove) engine.rotate(1);
      }
      if (!instantMove) return; // Wait for next frame for realism on lower difficulties
    }

    // 2. Handle horizontal movement
    if (piece.x !== target.x) {
        const diff = target.x - piece.x;
        const dir = diff > 0 ? 1 : -1;
        
        if (instantMove) {
            // Move all the way to target
            for (let i = 0; i < Math.abs(diff); i++) {
                engine.move(dir);
            }
        } else {
            engine.move(dir);
            return;
        }
    }

    // 3. Final placement.
    //
    // Only the top difficulties slam the piece down. Everyone else soft-drops
    // it one row at a time so the opponent's board actually ANIMATES: this
    // used to call hardDrop() unconditionally, so from the player's side a
    // piece simply materialised at the bottom of the AI's field with nothing
    // visible in between (reported live 2026-08-25).
    if (piece.x === target.x && piece.rotation === target.rotation) {
        if (instantMove) {
            engine.hardDrop();
            this.targetPlacement = null;
        } else {
            // Returns false once the piece can fall no further; the engine's
            // own gravity/lock handling then locks it, which also spawns the
            // next piece and invalidates the plan above.
            engine.softDrop();
        }
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
