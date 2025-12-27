/**
 * Credit Roll System
 *
 * Invisible challenge at the end of Master mode
 * - Triggered at level 999
 * - 60-second duration
 * - Must clear 32 lines to qualify for M→GM
 * - Pieces fade to invisible after lock
 */

/**
 * Credit roll state
 */
export interface CreditRollState {
  active: boolean;
  startTime: number | null;
  duration: number;  // milliseconds
  timeRemaining: number;
  linesCleared: number;
  linesRequired: number;
  qualified: boolean;  // Did player pass the challenge?
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
export class CreditRollManager {
  private state: CreditRollState;

  constructor() {
    this.state = {
      active: false,
      startTime: null,
      duration: 60000,  // 60 seconds
      timeRemaining: 60000,
      linesCleared: 0,
      linesRequired: 32,  // TGM3 requirement
      qualified: false,
    };
  }

  /**
   * Start credit roll
   */
  start(): void {
    this.state.active = true;
    this.state.startTime = Date.now();
    this.state.timeRemaining = this.state.duration;
    this.state.linesCleared = 0;
    this.state.qualified = false;
  }

  /**
   * Update credit roll timer
   */
  update(deltaTime: number): void {
    if (!this.state.active || !this.state.startTime) {
      return;
    }

    // Update timer
    const elapsed = Date.now() - this.state.startTime;
    this.state.timeRemaining = Math.max(0, this.state.duration - elapsed);

    // Check if time ran out
    if (this.state.timeRemaining <= 0) {
      this.end();
    }
  }

  /**
   * Record lines cleared during credit roll
   */
  addLines(count: number): void {
    if (!this.state.active) {
      return;
    }

    this.state.linesCleared += count;

    // Check if qualified
    if (this.state.linesCleared >= this.state.linesRequired) {
      this.state.qualified = true;
    }
  }

  /**
   * End credit roll
   */
  end(): void {
    this.state.active = false;
  }

  /**
   * Check if credit roll is active
   */
  isActive(): boolean {
    return this.state.active;
  }

  /**
   * Check if player qualified (cleared enough lines)
   */
  isQualified(): boolean {
    return this.state.qualified;
  }

  /**
   * Get current state
   */
  getState(): CreditRollState {
    return { ...this.state };
  }

  /**
   * Get fade stage for piece based on lock time
   */
  getFadeStage(lockTime: number): FadeStage {
    if (!this.state.active) {
      return 'full';
    }

    const elapsed = Date.now() - lockTime;

    // Fade progression (in milliseconds)
    if (elapsed < 200) return 'full';      // Just locked
    if (elapsed < 500) return 'bright';    // Fading...
    if (elapsed < 1000) return 'medium';   // More faded
    if (elapsed < 1500) return 'faint';    // Almost gone
    return 'invisible';                     // Fully invisible
  }

  /**
   * Get opacity for fade stage (0.0 - 1.0)
   */
  getOpacity(stage: FadeStage): number {
    switch (stage) {
      case 'full': return 1.0;
      case 'bright': return 0.8;
      case 'medium': return 0.6;
      case 'faint': return 0.3;
      case 'invisible': return 0.0;
    }
  }

  /**
   * Reset credit roll
   */
  reset(): void {
    this.state = {
      active: false,
      startTime: null,
      duration: 60000,
      timeRemaining: 60000,
      linesCleared: 0,
      linesRequired: 32,
      qualified: false,
    };
  }
}

/**
 * Invisible piece manager
 *
 * Handles piece visibility during credit roll
 */
export class InvisiblePieceManager {
  private creditRoll: CreditRollManager;

  constructor(creditRollManager: CreditRollManager) {
    this.creditRoll = creditRollManager;
  }

  /**
   * Check if current piece should be invisible
   */
  shouldPieceBeInvisible(): boolean {
    return this.creditRoll.isActive();
  }

  /**
   * Get visibility level for active piece (0.0 - 1.0)
   */
  getPieceVisibility(): number {
    if (!this.creditRoll.isActive()) {
      return 1.0;
    }

    // In credit roll, active piece is faintly visible
    return 0.3;
  }

  /**
   * Get visibility level for ghost piece (0.0 - 1.0)
   */
  getGhostVisibility(): number {
    if (!this.creditRoll.isActive()) {
      return 0.5;  // Normal ghost visibility
    }

    // In credit roll, ghost is barely visible
    return 0.1;
  }

  /**
   * Should show bone blocks (S13+ grades)
   */
  shouldShowBoneBlocks(grade: string): boolean {
    // Bone blocks appear at S13+ grades
    return grade === 'S13' || grade.startsWith('m') || grade.startsWith('M') || grade === 'GM';
  }
}
