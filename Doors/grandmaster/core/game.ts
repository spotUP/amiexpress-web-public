/**
 * Core Game Engine
 *
 * Manages game state, piece movement, scoring, and game loop
 */

import type { GameState, GameMode, PlayerSettings, Piece, PieceType, GameResult } from './types';
import { PieceManager, getPieceCells } from './pieces';
import { SectionManager } from './sections';
import { GradeManager } from './grading';
import { getSpeedParams } from './gravity';
import {
  createBoard,
  checkCollision,
  placePiece,
  getGhostY,
  getCompleteLines,
  clearLines,
  isTopOut,
  isPerfectClear,
} from './board';
import type { AttackManager } from '../network/attack-system';
import { FinesseEvaluator } from './finesse';
import { ReplayRecorder, type Replay } from '../server/replay-manager';

export class GameEngine {
  private state: GameState;
  private pieceManager: PieceManager;
  private settings: PlayerSettings;
  private sectionManager: SectionManager;
  private gradeManager: GradeManager;
  private attackManager?: AttackManager;  // Optional for multiplayer
  private finesseEvaluator: FinesseEvaluator;
  private recorder?: ReplayRecorder;  // Optional replay recording

  // Game loop
  private lastUpdate: number = 0;
  private frameAccumulator: number = 0;
  private readonly TARGET_FPS = 60;
  private readonly FRAME_TIME = 1000 / this.TARGET_FPS;

  // Gravity accumulator for fractional gravity values
  private gravityAccumulator: number = 0;

  // Credit roll pause tracking
  private pauseTime: number | null = null;

  constructor(mode: GameMode, settings: PlayerSettings, attackManager?: AttackManager) {
    this.settings = settings;
    this.pieceManager = new PieceManager(settings.rotationSystem);
    this.sectionManager = new SectionManager();
    this.gradeManager = new GradeManager();
    this.finesseEvaluator = new FinesseEvaluator();
    this.attackManager = attackManager;
    this.state = this.createInitialState(mode);
  }

  /**
   * Create initial game state
   */
  private createInitialState(mode: GameMode): GameState {
    // Get initial speed parameters for level 0
    const speedParams = getSpeedParams(0, mode);

    return {
      mode,
      board: createBoard(10, 24),
      currentPiece: null,
      holdPiece: null,
      canHold: true,
      nextQueue: this.pieceManager.fillQueue(this.settings.previewCount),

      level: 0,
      lines: 0,
      score: 0,
      grade: '9',
      combo: 0,
      backToBack: false,

      // T-Spin tracking
      lastMove: null,
      lastTSpin: null,

      gravity: speedParams.gravity,
      lockDelay: (speedParams.lockDelay / 60) * 1000,  // Convert frames to ms
      lockDelayRemaining: (speedParams.lockDelay / 60) * 1000,
      lockResets: 0,
      areRemaining: speedParams.are,

      pendingIRS: 0,
      pendingIHS: false,

      section: 0,
      sectionTime: 0,
      sectionLines: 0,
      internalGrade: 0,

      creditRollActive: false,
      creditRollTimeRemaining: 180000,  // 3 minutes in ms
      creditRollStartTime: null,

      status: 'ready',
      startTime: null,
      endTime: null,
    };
  }

  /**
   * Start the game
   */
  start(): void {
    this.state.status = 'playing';
    this.state.startTime = Date.now();
    this.sectionManager.reset();
    this.gradeManager.reset();  // Reset grade to 9
    this.state.section = 0;
    this.state.sectionTime = 0;
    this.state.grade = '9';     // Initialize grade
    this.spawnPiece();
  }

  /**
   * Spawn new piece
   */
  private spawnPiece(): void {
    const pieceType = this.state.nextQueue.shift()!;
    this.state.nextQueue.push(this.pieceManager.getRandomPiece());

    const spawnPos = this.pieceManager.getSpawnPosition(pieceType, this.state.board.width);

    // Determine if piece should be invisible
    let invisible = false;
    if (this.state.creditRollActive) {
      // Credit roll: ALL pieces invisible
      invisible = true;
    } else {
      // Normal play: Bone block probability
      const boneChance = this.getBoneBlockChance(this.state.grade);
      if (Math.random() < boneChance) {
        invisible = true;
      }
    }

    // Apply IRS (Initial Rotation System)
    let initialRotation: 0 | 1 | 2 | 3 = 0;
    if (this.state.pendingIRS !== 0) {
      // Apply rotation based on pending input
      if (this.state.pendingIRS > 0) {
        initialRotation = 1;  // Clockwise
      } else {
        initialRotation = 3;  // Counter-clockwise
      }
    }

    this.state.currentPiece = {
      type: pieceType,
      rotation: initialRotation,
      x: spawnPos.x,
      y: spawnPos.y,
      invisible,
    };

    this.state.canHold = true;
    this.state.lockDelayRemaining = this.state.lockDelay;
    this.state.lockResets = 0;

    // Reset gravity accumulator for new piece
    this.gravityAccumulator = 0;

    // Reset T-Spin tracking for new piece
    this.state.lastMove = null;
    this.state.lastTSpin = null;

    // Check if piece can spawn (game over if not)
    const shape = this.pieceManager.getShape(pieceType, initialRotation);
    if (checkCollision(this.state.board, shape, spawnPos.x, spawnPos.y)) {
      this.state.status = 'gameover';
      this.state.endTime = Date.now();
      return;
    }

    // Apply IHS (Initial Hold System)
    const shouldHold = this.state.pendingIHS;

    // Reset IRS/IHS pending flags
    this.state.pendingIRS = 0;
    this.state.pendingIHS = false;

    // Execute hold if IHS was pending
    if (shouldHold && this.state.canHold) {
      this.hold();
    }
  }

  /**
   * Update game state (called every frame)
   */
  update(deltaTime: number): void {
    if (this.state.status !== 'playing') return;

    this.frameAccumulator += deltaTime;

    while (this.frameAccumulator >= this.FRAME_TIME) {
      this.frameAccumulator -= this.FRAME_TIME;
      this.updateFrame();
    }
  }

  /**
   * Update single frame
   */
  private updateFrame(): void {
    if (!this.state.currentPiece) {
      // During ARE (Appearance Delay), count down frames
      this.state.areRemaining--;
      if (this.state.areRemaining <= 0) {
        this.spawnPiece();
      }
      return;
    }

    // Apply gravity
    this.applyGravity();

    // Update credit roll timer
    if (this.state.creditRollActive) {
      this.updateCreditRoll(this.FRAME_TIME);
    }

    // Check for credit roll trigger
    this.checkCreditRollTrigger();

    // Update lock delay if piece is grounded
    if (this.isPieceGrounded()) {
      this.state.lockDelayRemaining -= this.FRAME_TIME;
      if (this.state.lockDelayRemaining <= 0) {
        this.lockPiece();
      }
    } else {
      // Reset lock delay if not grounded
      this.state.lockDelayRemaining = this.state.lockDelay;
    }

    // Update section state from SectionManager
    this.state.section = this.sectionManager.getCurrentSection();
    this.state.sectionTime = this.sectionManager.getCurrentSectionTime() * 1000; // Convert to ms

    // Update replay recorder
    if (this.recorder) {
      this.recorder.updateFrame();
      this.recorder.recordSnapshot(this.state);
    }
  }

  /**
   * Apply gravity to current piece
   */
  private applyGravity(): void {
    if (!this.state.currentPiece) return;

    const piece = this.state.currentPiece;
    const shape = this.pieceManager.getShape(piece.type, piece.rotation);

    // Accumulate gravity (supports fractional values < 1.0)
    this.gravityAccumulator += this.state.gravity;

    // Calculate how many rows to drop
    const dropAmount = Math.floor(this.gravityAccumulator);

    if (dropAmount > 0) {
      // Move piece down by dropAmount
      for (let i = 0; i < dropAmount; i++) {
        if (!checkCollision(this.state.board, shape, piece.x, piece.y + 1)) {
          piece.y++;
        } else {
          break;
        }
      }

      // Subtract the integer part from accumulator
      this.gravityAccumulator -= dropAmount;
    }
  }

  /**
   * Check if piece is on ground
   */
  private isPieceGrounded(): boolean {
    if (!this.state.currentPiece) return false;

    const piece = this.state.currentPiece;
    const shape = this.pieceManager.getShape(piece.type, piece.rotation);

    return checkCollision(this.state.board, shape, piece.x, piece.y + 1);
  }

  /**
   * Move piece left/right
   */
  move(direction: -1 | 1): boolean {
    if (!this.state.currentPiece || this.state.status !== 'playing') return false;

    const piece = this.state.currentPiece;
    const shape = this.pieceManager.getShape(piece.type, piece.rotation);
    const newX = piece.x + direction;

    if (!checkCollision(this.state.board, shape, newX, piece.y)) {
      piece.x = newX;
      this.state.lastMove = 'move';
      this.finesseEvaluator.trackMovement(piece, false);  // Track horizontal movement
      this.resetLockDelay();

      // Record input for replay
      if (this.recorder) {
        this.recorder.recordInput(direction < 0 ? 'move_left' : 'move_right', piece.type);
      }

      return true;
    }

    return false;
  }

  /**
   * Rotate piece
   */
  rotate(direction: 1 | -1): boolean {
    if (!this.state.currentPiece || this.state.status !== 'playing') return false;

    const piece = this.state.currentPiece;
    const newRotation = ((piece.rotation + direction + 4) % 4) as 0 | 1 | 2 | 3;
    const newShape = this.pieceManager.getShape(piece.type, newRotation);

    // Try rotation with wall kicks
    const kicks = this.pieceManager.getKicks(piece.type, piece.rotation, newRotation);

    for (const [offsetX, offsetY] of kicks) {
      const testX = piece.x + offsetX;
      const testY = piece.y + offsetY;

      if (!checkCollision(this.state.board, newShape, testX, testY)) {
        piece.rotation = newRotation;
        piece.x = testX;
        piece.y = testY;
        this.state.lastMove = 'rotate';
        this.finesseEvaluator.trackMovement(piece, true);  // Track rotation
        this.resetLockDelay();

        // Record input for replay
        if (this.recorder) {
          this.recorder.recordInput(direction > 0 ? 'rotate_cw' : 'rotate_ccw', piece.type);
        }

        return true;
      }
    }

    return false;
  }

  /**
   * Soft drop (faster gravity)
   */
  softDrop(): boolean {
    if (!this.state.currentPiece || this.state.status !== 'playing') return false;

    const piece = this.state.currentPiece;
    const shape = this.pieceManager.getShape(piece.type, piece.rotation);

    if (!checkCollision(this.state.board, shape, piece.x, piece.y + 1)) {
      piece.y++;
      this.state.score += 1;  // Soft drop points
      this.state.lastMove = 'drop';

      // Record input for replay
      if (this.recorder) {
        this.recorder.recordInput('soft_drop', piece.type);
      }

      return true;
    }

    return false;
  }

  /**
   * Hard drop (instant lock)
   */
  hardDrop(): void {
    if (!this.state.currentPiece || this.state.status !== 'playing') return;

    const piece = this.state.currentPiece;
    const shape = this.pieceManager.getShape(piece.type, piece.rotation);
    const ghostY = getGhostY(this.state.board, shape, piece.x, piece.y);

    const dropDistance = ghostY - piece.y;
    this.state.score += dropDistance * 2;  // Hard drop points

    piece.y = ghostY;
    this.state.lastMove = 'drop';

    // Record input for replay
    if (this.recorder) {
      this.recorder.recordInput('hard_drop', piece.type);
    }

    this.lockPiece();
  }

  /**
   * Hold current piece
   */
  hold(): boolean {
    if (!this.state.currentPiece || !this.state.canHold || this.state.status !== 'playing') {
      return false;
    }

    const currentType = this.state.currentPiece.type;

    if (this.state.holdPiece) {
      // Swap with held piece
      const heldType = this.state.holdPiece;
      this.state.holdPiece = currentType;

      const spawnPos = this.pieceManager.getSpawnPosition(heldType, this.state.board.width);
      // Held pieces lose bone block status when swapped back
      this.state.currentPiece = {
        type: heldType,
        rotation: 0,
        x: spawnPos.x,
        y: spawnPos.y,
        invisible: false,
      };
    } else {
      // First hold
      this.state.holdPiece = currentType;
      this.spawnPiece();
    }

    this.state.canHold = false;

    // Record input for replay
    if (this.recorder) {
      this.recorder.recordInput('hold', currentType);
    }

    return true;
  }

  /**
   * Set pending IRS (Initial Rotation System) input
   * Only works during ARE (when no piece is active)
   */
  setIRS(direction: -1 | 0 | 1): boolean {
    // IRS only works when no current piece (during ARE)
    if (this.state.currentPiece !== null) {
      return false;
    }

    this.state.pendingIRS = direction;

    // Record input for replay
    if (this.recorder) {
      this.recorder.recordInput(direction > 0 ? 'irs_cw' : 'irs_ccw');
    }

    return true;
  }

  /**
   * Set pending IHS (Initial Hold System) input
   * Only works during ARE (when no piece is active)
   */
  setIHS(): boolean {
    // IHS only works when no current piece (during ARE)
    if (this.state.currentPiece !== null) {
      return false;
    }

    this.state.pendingIHS = true;

    // Record input for replay
    if (this.recorder) {
      this.recorder.recordInput('ihs');
    }

    return true;
  }

  /**
   * Detect T-Spin using the 3-corner rule
   * Returns 'full' for T-Spin, 'mini' for T-Spin Mini, or 'none'
   */
  private detectTSpin(): 'full' | 'mini' | 'none' {
    const piece = this.state.currentPiece;

    // Must be a T-piece
    if (!piece || piece.type !== 'T') return 'none';

    // Last move must have been a rotation
    if (this.state.lastMove !== 'rotate') return 'none';

    // Get the center position of the T-piece
    // T-piece center is at [1,1] in its 3x3 bounding box
    const centerX = piece.x + 1;
    const centerY = piece.y + 1;

    // Check the 4 corners around the center
    const corners = [
      { x: centerX - 1, y: centerY - 1 },  // Top-left
      { x: centerX + 1, y: centerY - 1 },  // Top-right
      { x: centerX - 1, y: centerY + 1 },  // Bottom-left
      { x: centerX + 1, y: centerY + 1 },  // Bottom-right
    ];

    // Count filled corners
    let filledCorners = 0;
    const board = this.state.board;

    for (const corner of corners) {
      // Out of bounds counts as filled
      if (corner.x < 0 || corner.x >= board.width ||
          corner.y < 0 || corner.y >= board.height) {
        filledCorners++;
        continue;
      }

      // Check if cell is filled
      if (board.grid[corner.y][corner.x].filled) {
        filledCorners++;
      }
    }

    // 3-corner rule: at least 3 corners must be filled
    if (filledCorners >= 3) {
      // Check if it's a mini T-Spin (T facing away from wall)
      // Full T-Spin: both front corners filled
      // Mini T-Spin: only back corners filled

      // Determine front corners based on rotation
      let frontCorners: typeof corners;
      switch (piece.rotation) {
        case 0: // T facing up
          frontCorners = [corners[0], corners[1]];  // Top corners
          break;
        case 1: // T facing right
          frontCorners = [corners[1], corners[3]];  // Right corners
          break;
        case 2: // T facing down
          frontCorners = [corners[2], corners[3]];  // Bottom corners
          break;
        case 3: // T facing left
          frontCorners = [corners[0], corners[2]];  // Left corners
          break;
      }

      // Count front corners filled
      let frontFilled = 0;
      for (const corner of frontCorners) {
        if (corner.x < 0 || corner.x >= board.width ||
            corner.y < 0 || corner.y >= board.height ||
            board.grid[corner.y][corner.x].filled) {
          frontFilled++;
        }
      }

      // Full T-Spin if both front corners filled, otherwise Mini
      return frontFilled >= 2 ? 'full' : 'mini';
    }

    return 'none';
  }

  /**
   * Lock piece to board
   */
  private lockPiece(): void {
    if (!this.state.currentPiece) return;

    const piece = this.state.currentPiece;
    const shape = this.pieceManager.getShape(piece.type, piece.rotation);

    // Detect T-Spin before placing piece
    const tSpin = this.detectTSpin();
    this.state.lastTSpin = tSpin;

    // Place piece on board with timestamp for credit roll fade
    const lockTime = Date.now();
    this.placePieceWithTimestamp(shape, piece.x, piece.y, piece.type, lockTime);

    // Evaluate finesse for this placement
    const hadFinesse = this.finesseEvaluator.evaluatePlacement(piece);

    // Check for line clears
    const clearedLines = getCompleteLines(this.state.board);
    const lineCount = clearedLines.length;

    if (lineCount > 0) {
      // Clear lines
      clearLines(this.state.board, clearedLines);

      // Update stats
      this.state.lines += lineCount;
      this.state.combo++;

      // Level progression (TGM3 style: +1 per line)
      this.state.level += lineCount;

      // Update speed parameters based on new level
      const speedParams = getSpeedParams(this.state.level, this.state.mode);
      this.state.gravity = speedParams.gravity;
      this.state.lockDelay = (speedParams.lockDelay / 60) * 1000;  // Convert frames to ms

      // Scoring
      let baseScore = this.calculateLineScore(lineCount);

      // T-Spin scoring bonuses
      if (tSpin === 'full') {
        // T-Spin bonuses (standard scoring)
        if (lineCount === 1) baseScore = 800;    // T-Spin Single
        else if (lineCount === 2) baseScore = 1200;  // T-Spin Double
        else if (lineCount === 3) baseScore = 1600;  // T-Spin Triple
      } else if (tSpin === 'mini') {
        // T-Spin Mini bonuses
        if (lineCount === 1) baseScore = 200;    // T-Spin Mini Single
        else if (lineCount === 2) baseScore = 400;   // T-Spin Mini Double
      }

      // Back-to-back bonus (T-Spins and Tetrises)
      const isBackToBackAction = tSpin !== 'none' || lineCount === 4;
      if (isBackToBackAction && this.state.backToBack) {
        baseScore = Math.floor(baseScore * 1.5);  // 50% bonus
      }
      this.state.backToBack = isBackToBackAction;

      this.state.score += baseScore * (this.state.level + 1);

      // Check for perfect clear
      const perfectClear = isPerfectClear(this.state.board);
      if (perfectClear) {
        this.state.score += 10000 * (this.state.level + 1);
      }

      // Process attack (multiplayer)
      if (this.attackManager) {
        this.attackManager.processLineClear(
          lineCount,
          tSpin,
          this.state.combo,
          this.state.backToBack,
          perfectClear
        );
      }

      // Award grade points for line clear
      const isTSpin = tSpin !== 'none';
      this.gradeManager.awardPoints(lineCount, this.state.combo, this.state.level, isTSpin);
      this.state.grade = this.gradeManager.getGrade();
      this.state.internalGrade = this.gradeManager.getInternalGrade();

      // Track section completion
      const sectionResult = this.sectionManager.update(this.state.level, lineCount);
      if (sectionResult !== null) {
        // Section just completed!
        this.state.lastSectionResult = sectionResult;
      }
    } else {
      // No lines cleared, reset combo
      this.state.combo = 0;
    }

    // Check for game over
    if (isTopOut(this.state.board)) {
      this.state.status = 'gameover';
      this.state.endTime = Date.now();
      return;
    }

    // Apply grade decay (happens after every piece)
    this.gradeManager.applyDecay(this.state.level);
    this.state.grade = this.gradeManager.getGrade();
    this.state.internalGrade = this.gradeManager.getInternalGrade();

    // Apply incoming garbage (multiplayer)
    if (this.attackManager) {
      this.attackManager.applyGarbage(this.state.board);
    }

    // Reset ARE delay for next piece
    const speedParams = getSpeedParams(this.state.level, this.state.mode);
    this.state.areRemaining = speedParams.are;

    // Spawn next piece (will happen after ARE delay)
    this.state.currentPiece = null;
  }

  /**
   * Calculate score for line clear
   */
  private calculateLineScore(lines: number): number {
    const SCORES = [0, 100, 300, 500, 800];  // 0, single, double, triple, tetris
    return SCORES[lines] || 0;
  }

  /**
   * Reset lock delay (when piece moves/rotates)
   */
  private resetLockDelay(): void {
    if (this.state.lockResets < 15) {  // TGM3 limit
      this.state.lockDelayRemaining = this.state.lockDelay;
      this.state.lockResets++;
    }
  }

  /**
   * Get current game state
   */
  getState(): GameState {
    return this.state;
  }

  /**
   * Get game result
   */
  getResult(): GameResult {
    const time = this.state.endTime && this.state.startTime
      ? this.state.endTime - this.state.startTime
      : null;

    const finesseStats = this.finesseEvaluator.getStats();

    return {
      mode: this.state.mode,
      score: this.state.score,
      level: this.state.level,
      lines: this.state.lines,
      linesCleared: this.state.lines,
      grade: this.state.grade,
      time,
      combo: this.state.combo,
      tetrisCount: 0,  // TODO: Track
      tSpinCount: 0,   // TODO: Track
      perfectClears: 0, // TODO: Track
      completed: this.state.status === 'complete',
      finesseRate: 1 - finesseStats.errorRate,
      finesseErrors: finesseStats.finesseErrors,
    };
  }

  /**
   * Get bone block probability for current grade
   */
  private getBoneBlockChance(grade: string): number {
    // No bone blocks before S13
    if (!this.gradeManager.isGradeAtLeast('S13')) {
      return 0;
    }

    // Grade tier probabilities
    const BONE_PROBABILITIES: Record<string, number> = {
      'S13': 0.20,
      'm1': 0.30, 'm2': 0.30, 'm3': 0.30,
      'm4': 0.40, 'm5': 0.40, 'm6': 0.40,
      'm7': 0.50, 'm8': 0.50, 'm9': 0.50,
      'M': 0.60, 'MK': 0.60,
      'MV': 0.70, 'MO': 0.70,
      'GM': 0.80,
    };

    return BONE_PROBABILITIES[grade] || 0;
  }

  /**
   * Check if M grade reached and trigger credit roll
   */
  private checkCreditRollTrigger(): void {
    // Only trigger once
    if (this.state.creditRollActive) return;

    // Check if grade qualifies for M rank
    if (this.gradeManager.isQualifiedForM()) {
      this.startCreditRoll();
    }
  }

  /**
   * Start credit roll mode
   */
  private startCreditRoll(): void {
    this.state.creditRollActive = true;
    this.state.creditRollStartTime = Date.now();
    this.state.creditRollTimeRemaining = 180000;  // 3 minutes
  }

  /**
   * Update credit roll timer and check completion
   */
  private updateCreditRoll(deltaTime: number): void {
    this.state.creditRollTimeRemaining -= deltaTime;

    // Credit roll completed successfully!
    if (this.state.creditRollTimeRemaining <= 0) {
      this.completeCreditRoll();
    }
  }

  /**
   * Complete credit roll and award GMM
   */
  private completeCreditRoll(): void {
    this.state.grade = 'GMM';
    this.state.status = 'complete';
    this.state.endTime = Date.now();
  }

  /**
   * Place piece with lock timestamp for credit roll fade
   */
  private placePieceWithTimestamp(
    shape: number[][],
    x: number,
    y: number,
    pieceType: PieceType,
    lockTime: number
  ): void {
    const board = this.state.board;

    for (let row = 0; row < shape.length; row++) {
      for (let col = 0; col < shape[row].length; col++) {
        if (shape[row][col]) {
          const boardX = x + col;
          const boardY = y + row;

          if (boardY >= 0 && boardY < board.height) {
            board.grid[boardY][boardX] = {
              filled: true,
              color: pieceType,
              locked: true,
              lockTime,
            };
          }
        }
      }
    }
  }

  /**
   * Pause game
   */
  pause(): void {
    if (this.state.status === 'playing') {
      this.state.status = 'paused';
      // Store pause time for credit roll timer preservation
      if (this.state.creditRollActive) {
        this.pauseTime = Date.now();
      }
    }
  }

  /**
   * Resume game
   */
  resume(): void {
    if (this.state.status === 'paused') {
      this.state.status = 'playing';
      // Adjust credit roll timer for pause duration (no penalty)
      if (this.state.creditRollActive && this.pauseTime) {
        const pauseDuration = Date.now() - this.pauseTime;
        this.state.creditRollTimeRemaining += pauseDuration;
        this.pauseTime = null;
      }
    }
  }

  /**
   * Start replay recording
   */
  startRecording(userId: string, username: string, seed?: number): void {
    this.recorder = new ReplayRecorder(userId, username, this.state.mode, seed);
  }

  /**
   * Stop and finalize replay recording
   */
  finalizeRecording(): Replay | null {
    if (!this.recorder) return null;
    return this.recorder.finalize(this.state);
  }

  /**
   * Check if currently recording
   */
  isRecording(): boolean {
    return this.recorder !== undefined;
  }
}
