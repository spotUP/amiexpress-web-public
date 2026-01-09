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
import { PieceManager, getPieceCells } from '../pieces';
import {
  checkCollision,
  placePiece,
  getGhostY,
  getCompleteLines,
  isTopOut,
} from '../board';
import type { TetriNetBoard, TetriNetCell } from './tetrinet-board';
import {
  createTetriNetBoard,
  clearLinesWithSpecials,
  addRandomSpecials,
  addGarbageLines,
  encodeBoard,
  cloneTetriNetBoard,
} from './tetrinet-board';
import type { SpecialType } from './specials';
import { selectRandomSpecial, getSpecialsForRule, isContinuous } from './specials';
import { SpecialInventory } from './inventory';
import { ContinuousEffectManager, isContinuousEffect } from './continuous-effects';
import { SuddenDeathManager } from './sudden-death';
import { applySpecialEffect } from './special-effects';
import type { TetriNetGameOptions } from './game-rules';
import { getDefaultOptions, getGarbageToSend, getSpecialsToGenerate, getLevelSpeed, getLevelFromLines } from './game-rules';

/**
 * TetriNET game state
 */
export interface TetriNetGameState {
  board: TetriNetBoard;
  currentPiece: Piece | null;
  holdPiece: PieceType | null;
  canHold: boolean;
  nextQueue: PieceType[];

  // Stats
  level: number;
  lines: number;
  score: number;

  // TetriNET specific
  inventory: SpecialType[];
  activeEffects: string[];

  // Game status
  status: 'ready' | 'countdown' | 'playing' | 'paused' | 'gameover' | 'won';
  startTime: number | null;
  endTime: number | null;
}

/**
 * TetriNET Game Engine
 */
export class TetriNetEngine {
  private board: TetriNetBoard;
  private currentPiece: Piece | null = null;
  private holdPiece: PieceType | null = null;
  private canHold: boolean = true;
  private nextQueue: PieceType[] = [];

  private pieceManager: PieceManager;
  private settings: PlayerSettings;
  private options: TetriNetGameOptions;

  private inventory: SpecialInventory;
  private effectManager: ContinuousEffectManager;
  private suddenDeath: SuddenDeathManager;

  // Stats
  private level: number = 0;
  private lines: number = 0;
  private score: number = 0;

  // Timing
  private status: 'ready' | 'countdown' | 'playing' | 'paused' | 'gameover' | 'won' = 'ready';
  private startTime: number | null = null;
  private endTime: number | null = null;
  private lastUpdate: number = 0;
  private dropTimer: number = 0;
  private lockTimer: number = 0;
  private isOnGround: boolean = false;

  // Callbacks
  private onSpecialUsedCallbacks: Array<(special: SpecialType, targetId: string | null) => void> = [];
  private onLinesAddedCallbacks: Array<(count: number) => void> = [];
  private onGameOverCallbacks: Array<() => void> = [];
  private onBoardUpdateCallbacks: Array<(board: TetriNetBoard) => void> = [];

  constructor(settings: PlayerSettings, options?: Partial<TetriNetGameOptions>) {
    this.settings = settings;
    this.options = { ...getDefaultOptions('extended'), ...options };
    this.pieceManager = new PieceManager(settings.rotationSystem);
    this.board = createTetriNetBoard(10, 24);

    this.inventory = new SpecialInventory(this.options.inventorySize);
    this.effectManager = new ContinuousEffectManager();
    this.suddenDeath = new SuddenDeathManager(
      this.options.delayBeforeSuddenDeath,
      this.options.suddenDeathTick
    );

    // Fill initial queue
    this.nextQueue = this.pieceManager.fillQueue(settings.previewCount);
  }

  /**
   * Start the game
   */
  start(): void {
    this.status = 'playing';
    this.startTime = Date.now();
    this.lastUpdate = Date.now();
    this.level = this.options.startingLevel;
    this.suddenDeath.start();
    this.spawnPiece();
  }

  /**
   * Pause the game
   */
  pause(): void {
    if (this.status === 'playing') {
      this.status = 'paused';
    }
  }

  /**
   * Resume the game
   */
  resume(): void {
    if (this.status === 'paused') {
      this.status = 'playing';
      this.lastUpdate = Date.now();
    }
  }

  /**
   * Update game state
   */
  update(deltaTime: number): void {
    if (this.status !== 'playing') {
      return;
    }

    // Update continuous effects
    this.effectManager.update();

    // Update sudden death
    const suddenDeathLines = this.suddenDeath.update();
    if (suddenDeathLines > 0) {
      this.addGarbage(suddenDeathLines);
    }

    // Update drop timer
    this.dropTimer += deltaTime;
    const dropInterval = getLevelSpeed(this.level);

    // Auto-drop piece
    while (this.dropTimer >= dropInterval) {
      this.dropTimer -= dropInterval;
      if (this.currentPiece && !this.movePieceDown()) {
        // Piece can't move down - start/continue lock timer
        this.isOnGround = true;
      }
    }

    // Lock timer
    if (this.isOnGround && this.currentPiece) {
      this.lockTimer += deltaTime;
      if (this.lockTimer >= this.settings.lockDelay) {
        this.lockPiece();
      }
    }
  }

  /**
   * Spawn a new piece
   */
  private spawnPiece(): void {
    let pieceType = this.nextQueue.shift()!;

    // If mutation is active, randomize the piece
    if (this.effectManager.hasMutation()) {
      const allTypes: PieceType[] = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];
      pieceType = allTypes[Math.floor(Math.random() * allTypes.length)];
      this.effectManager.onPiecePlaced();
    }

    // Add new piece to queue
    this.nextQueue.push(this.pieceManager.getRandomPiece());

    // Create piece at spawn position
    this.currentPiece = {
      type: pieceType,
      rotation: 0,
      x: 3,  // Center spawn
      y: 2,  // Spawn above visible area
    };

    // Check for game over (can't spawn)
    const shape = this.pieceManager.getShape(pieceType, 0);
    if (checkCollision(this.board, shape, this.currentPiece.x, this.currentPiece.y)) {
      this.gameOver();
      return;
    }

    // Reset lock state
    this.isOnGround = false;
    this.lockTimer = 0;
    this.canHold = true;
  }

  /**
   * Move piece left or right
   */
  move(direction: -1 | 1): boolean {
    if (!this.currentPiece || this.status !== 'playing') {
      return false;
    }

    // Confusion reverses controls
    const actualDirection = this.effectManager.hasConfusion() ? -direction : direction;

    const shape = this.pieceManager.getShape(this.currentPiece.type, this.currentPiece.rotation);
    const newX = this.currentPiece.x + actualDirection;

    if (!checkCollision(this.board, shape, newX, this.currentPiece.y)) {
      this.currentPiece.x = newX;

      // Reset lock timer if on ground
      if (this.isOnGround) {
        this.lockTimer = 0;
      }

      return true;
    }

    return false;
  }

  /**
   * Rotate piece
   */
  rotate(direction: 1 | -1): boolean {
    if (!this.currentPiece || this.status !== 'playing') {
      return false;
    }

    const newRotation = ((this.currentPiece.rotation + direction + 4) % 4) as 0 | 1 | 2 | 3;
    const shape = this.pieceManager.getShape(this.currentPiece.type, newRotation);

    // Try basic rotation
    if (!checkCollision(this.board, shape, this.currentPiece.x, this.currentPiece.y)) {
      this.currentPiece.rotation = newRotation;
      if (this.isOnGround) {
        this.lockTimer = 0;
      }
      return true;
    }

    // Try wall kicks
    const kicks = this.pieceManager.getKicks(
      this.currentPiece.type,
      this.currentPiece.rotation,
      newRotation
    );

    for (const [kickX, kickY] of kicks) {
      const newX = this.currentPiece.x + kickX;
      const newY = this.currentPiece.y + kickY;

      if (!checkCollision(this.board, shape, newX, newY)) {
        this.currentPiece.x = newX;
        this.currentPiece.y = newY;
        this.currentPiece.rotation = newRotation;
        if (this.isOnGround) {
          this.lockTimer = 0;
        }
        return true;
      }
    }

    return false;
  }

  /**
   * Soft drop (faster descent)
   */
  softDrop(): boolean {
    return this.movePieceDown();
  }

  /**
   * Hard drop (instant drop and lock)
   */
  hardDrop(): void {
    if (!this.currentPiece || this.status !== 'playing') {
      return;
    }

    const shape = this.pieceManager.getShape(this.currentPiece.type, this.currentPiece.rotation);
    const ghostY = getGhostY(this.board, shape, this.currentPiece.x, this.currentPiece.y);

    // Add score for hard drop distance
    const dropDistance = ghostY - this.currentPiece.y;
    this.score += dropDistance * 2;

    // Move to ghost position and lock
    this.currentPiece.y = ghostY;
    this.lockPiece();
  }

  /**
   * Hold piece
   */
  hold(): boolean {
    if (!this.currentPiece || !this.canHold || this.status !== 'playing') {
      return false;
    }

    const currentType = this.currentPiece.type;

    if (this.holdPiece) {
      // Swap with held piece
      this.currentPiece = {
        type: this.holdPiece,
        rotation: 0,
        x: 3,
        y: 2,
      };
    } else {
      // Spawn new piece
      this.spawnPiece();
    }

    this.holdPiece = currentType;
    this.canHold = false;
    this.isOnGround = false;
    this.lockTimer = 0;

    return true;
  }

  /**
   * Move piece down one row
   */
  private movePieceDown(): boolean {
    if (!this.currentPiece) {
      return false;
    }

    const shape = this.pieceManager.getShape(this.currentPiece.type, this.currentPiece.rotation);
    const newY = this.currentPiece.y + 1;

    if (!checkCollision(this.board, shape, this.currentPiece.x, newY)) {
      this.currentPiece.y = newY;
      this.isOnGround = false;
      this.lockTimer = 0;
      return true;
    }

    this.isOnGround = true;
    return false;
  }

  /**
   * Lock piece in place
   */
  private lockPiece(): void {
    if (!this.currentPiece) {
      return;
    }

    const shape = this.pieceManager.getShape(this.currentPiece.type, this.currentPiece.rotation);

    // Place piece on board
    placePiece(this.board, shape, this.currentPiece.x, this.currentPiece.y, this.currentPiece.type);

    // Check for line clears
    const completedLines = getCompleteLines(this.board);

    if (completedLines.length > 0) {
      // Collect specials from cleared lines
      const collectedSpecials = clearLinesWithSpecials(this.board, completedLines);

      // Add collected specials to inventory
      for (const special of collectedSpecials) {
        this.inventory.add(special);
      }

      // Generate new specials based on lines cleared
      if (!this.options.noSpecials) {
        const specialsToGen = getSpecialsToGenerate(completedLines.length, this.options);
        if (specialsToGen > 0) {
          const availableSpecials = getSpecialsForRule(this.options.rule === 'extended' ? 'extended' : 'standard');
          for (let i = 0; i < specialsToGen; i++) {
            const special = selectRandomSpecial(availableSpecials);
            this.inventory.add(special);
          }
        }
      }

      // Update stats
      this.lines += completedLines.length;
      this.score += this.calculateLineScore(completedLines.length);
      this.level = getLevelFromLines(this.lines, this.options.startingLevel);

      // Calculate garbage to send
      const garbageToSend = getGarbageToSend(completedLines.length, this.options.classicStyleMultiplayer);
      if (garbageToSend > 0) {
        for (const callback of this.onLinesAddedCallbacks) {
          callback(garbageToSend);
        }
      }
    }

    // Notify board update
    for (const callback of this.onBoardUpdateCallbacks) {
      callback(this.board);
    }

    // Check for top out
    if (isTopOut(this.board)) {
      this.gameOver();
      return;
    }

    // Spawn next piece
    this.spawnPiece();
  }

  /**
   * Calculate score for line clears
   */
  private calculateLineScore(lineCount: number): number {
    const baseScores = [0, 100, 300, 500, 800];
    return (baseScores[lineCount] || 800) * (this.level + 1);
  }

  /**
   * Use a special from inventory
   */
  useSpecial(targetId?: string): SpecialType | null {
    if (this.status !== 'playing') {
      return null;
    }

    const special = this.inventory.use();
    if (!special) {
      return null;
    }

    // Check if it's a continuous effect
    if (isContinuousEffect(special)) {
      if (special === 'immunity') {
        // Immunity is used on self
        this.effectManager.startEffect('immunity');
      }
      // Other continuous effects are applied to target via network
    }

    // Notify callbacks
    for (const callback of this.onSpecialUsedCallbacks) {
      callback(special, targetId ?? null);
    }

    return special;
  }

  /**
   * Apply incoming special from opponent
   */
  applyIncomingSpecial(special: SpecialType, senderId: string): void {
    // Check immunity
    if (this.effectManager.hasImmunity() && special !== 'immunity') {
      return;  // Blocked by immunity
    }

    // Check if it's a continuous effect
    if (isContinuousEffect(special)) {
      this.effectManager.startEffect(special, senderId);
      return;
    }

    // Apply instant effect
    applySpecialEffect(special, this.board);

    // Notify board update
    for (const callback of this.onBoardUpdateCallbacks) {
      callback(this.board);
    }
  }

  /**
   * Add garbage lines to board
   */
  addGarbage(lineCount: number, holeColumn?: number): void {
    addGarbageLines(this.board, lineCount, holeColumn);

    // Notify board update
    for (const callback of this.onBoardUpdateCallbacks) {
      callback(this.board);
    }

    // Check for top out
    if (isTopOut(this.board)) {
      this.gameOver();
    }
  }

  /**
   * Game over
   */
  private gameOver(): void {
    this.status = 'gameover';
    this.endTime = Date.now();
    this.suddenDeath.stop();

    for (const callback of this.onGameOverCallbacks) {
      callback();
    }
  }

  /**
   * Mark as won
   */
  win(): void {
    this.status = 'won';
    this.endTime = Date.now();
    this.suddenDeath.stop();
  }

  // ===== Getters =====

  getState(): TetriNetGameState {
    return {
      board: this.board,
      currentPiece: this.currentPiece,
      holdPiece: this.holdPiece,
      canHold: this.canHold,
      nextQueue: [...this.nextQueue],
      level: this.level,
      lines: this.lines,
      score: this.score,
      inventory: this.inventory.getAll(),
      activeEffects: this.effectManager.getActiveEffectTypes(),
      status: this.status,
      startTime: this.startTime,
      endTime: this.endTime,
    };
  }

  getBoard(): TetriNetBoard {
    return this.board;
  }

  getEncodedBoard(): string {
    return encodeBoard(this.board);
  }

  getCurrentPiece(): Piece | null {
    return this.currentPiece;
  }

  getInventory(): SpecialInventory {
    return this.inventory;
  }

  getEffectManager(): ContinuousEffectManager {
    return this.effectManager;
  }

  getSuddenDeath(): SuddenDeathManager {
    return this.suddenDeath;
  }

  getLevel(): number {
    return this.level;
  }

  getLines(): number {
    return this.lines;
  }

  getScore(): number {
    return this.score;
  }

  getStatus(): string {
    return this.status;
  }

  getPieceShape(type: PieceType, rotation: 0 | 1 | 2 | 3): number[][] {
    return this.pieceManager.getShape(type, rotation);
  }

  getGhostY(): number | null {
    if (!this.currentPiece) {
      return null;
    }
    const shape = this.pieceManager.getShape(this.currentPiece.type, this.currentPiece.rotation);
    return getGhostY(this.board, shape, this.currentPiece.x, this.currentPiece.y);
  }

  // Hide next queue if darkness active
  getVisibleNextQueue(): PieceType[] {
    if (this.effectManager.hasDarkness()) {
      return [];  // Hidden
    }
    return [...this.nextQueue];
  }

  // ===== Callbacks =====

  onSpecialUsed(callback: (special: SpecialType, targetId: string | null) => void): () => void {
    this.onSpecialUsedCallbacks.push(callback);
    return () => {
      const index = this.onSpecialUsedCallbacks.indexOf(callback);
      if (index >= 0) this.onSpecialUsedCallbacks.splice(index, 1);
    };
  }

  onLinesAdded(callback: (count: number) => void): () => void {
    this.onLinesAddedCallbacks.push(callback);
    return () => {
      const index = this.onLinesAddedCallbacks.indexOf(callback);
      if (index >= 0) this.onLinesAddedCallbacks.splice(index, 1);
    };
  }

  onGameOver(callback: () => void): () => void {
    this.onGameOverCallbacks.push(callback);
    return () => {
      const index = this.onGameOverCallbacks.indexOf(callback);
      if (index >= 0) this.onGameOverCallbacks.splice(index, 1);
    };
  }

  onBoardUpdate(callback: (board: TetriNetBoard) => void): () => void {
    this.onBoardUpdateCallbacks.push(callback);
    return () => {
      const index = this.onBoardUpdateCallbacks.indexOf(callback);
      if (index >= 0) this.onBoardUpdateCallbacks.splice(index, 1);
    };
  }
}
