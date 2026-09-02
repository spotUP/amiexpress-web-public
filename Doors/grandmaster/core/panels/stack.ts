/**
 * The Stack: one player's board, and the frame loop that advances it.
 * Ported from common/engine/Stack.lua (@ c80668e).
 *
 * SCOPE. This is the solo engine - board, rise, swap, matching, game over.
 * Garbage, rollback, replay input and the puzzle win conditions arrive with
 * later phases and are marked where they attach. The plan calls for splitting
 * this across three files because Stack.lua is ~1800 lines; at the subset
 * implemented here that would mean inventing a large structural interface to
 * pass the stack to its own helpers, which reads worse than it solves. The
 * seam to split on when garbage lands is rise/physics/board, and the size hook
 * blocks at 2000 lines long before that becomes a surprise.
 *
 * THE FRAME. run() is one frame and nothing else is. Order inside it is not
 * arbitrary - three orderings are load-bearing:
 *
 *  1. `wasToppedOut` is sampled at the START of runPhysics, before anything
 *     moves. Stop time and the death check both read that snapshot, not the
 *     live state, so a match made on the frame you top out still pays out at
 *     the generous danger rate.
 *
 *  2. A swap INPUT is queued and executes at the start of the NEXT frame,
 *     before matching. So a swap the player makes on frame N is matched on
 *     frame N+1 - which is why a queued swap also locks the rise.
 *
 *  3. checkMatches runs BEFORE updatePanels. Matching therefore sees the board
 *     as it was left by the previous frame, and the +1 on a match timer exists
 *     to pay for that.
 *
 * DISPLACEMENT. The stack does not rise a row at a time; it rises in 16ths of
 * a row, and a new row is only committed when displacement reaches 0. The rise
 * timer accumulates a FRACTIONAL number of frames per 16th from the speed
 * table, which is why that table must not be rounded.
 */

import { Panel, PanelGrid } from './panel';
import type { LevelData } from './level-data';
import { SpeedIncreaseMode } from './level-data';
import {
  SPEED_TO_RISE_TIME,
  PANELS_TO_NEXT_SPEED,
  DT_SPEED_INCREASE,
  DISPLACEMENT_PER_ROW,
  SCORE_PER_PANEL,
  SCORE_PER_MANUAL_RAISE,
  MAX_SCORE,
} from './consts';
import { checkMatches, MatchableStack, Coordinate } from './check-matches';
import type { GeneratorSource } from './generator-source';

export const BOARD_WIDTH = 6;
export const BOARD_HEIGHT = 12;

/** Which way the cursor is being pushed this frame. */
export type CursorDirection = 'up' | 'down' | 'left' | 'right' | null;

/** Behaviour switches that game modes vary. */
export interface StackBehaviours {
  /** Does the stack rise on its own? Puzzle mode says no. */
  passiveRaise: boolean;
  /** May the player push the stack up? */
  allowManualRaise: boolean;
}

export function defaultBehaviours(): StackBehaviours {
  return { passiveRaise: true, allowManualRaise: true };
}

export interface StackOptions {
  levelData: LevelData;
  panelSource: GeneratorSource;
  behaviours?: Partial<StackBehaviours>;
  /** Stop time the board starts with, for puzzles that grant it. */
  startingStopTime?: number;
}

export class Stack implements MatchableStack {
  readonly width = BOARD_WIDTH;
  readonly height = BOARD_HEIGHT;

  levelData: LevelData;
  behaviours: StackBehaviours;
  panelSource: GeneratorSource;

  /** panels[row][column]; row 0 is the dimmed incoming row, columns from 1. */
  panels: PanelGrid = [];
  private panelsCreatedCount = 0;

  clock = 0;
  /** Frames of actual play; stops while the game has not started. */
  stopWatch = 0;
  stopWatchIsRunning = true;

  // --- rise ---
  /** 16ths of a row until the next row is committed. */
  displacement = DISPLACEMENT_PER_ROW;
  riseTimer: number;
  riseLock = false;
  hasRisen = false;
  speed: number;
  nextSpeedIncreaseClock = DT_SPEED_INCREASE;
  panelsToSpeedup = 0;

  // --- manual raise ---
  manualRaise = false;
  manualRaiseYet = false;
  preventManualRaise = false;

  // --- timers ---
  stopTime: number;
  preStopTime = 0;
  shakeTime = 0;
  prevShakeTime = 0;
  shakeTimeOnFrame = 0;
  peakShakeTime = 0;

  // --- state ---
  health: number;
  wasToppedOut = false;
  chainCounter = 0;
  score = 0;
  panelsCleared = 0;
  metalPanelsQueued = 0;
  swapCount = 0;
  gameOverClock = -1;

  nActivePanels = 0;
  nPrevActivePanels = 0;
  swappingPanelCount = 0;

  // --- cursor ---
  curRow = 0;
  curCol = 1;
  topCurRow: number;
  cursorDirection: CursorDirection = null;
  swapThisFrame = false;

  queuedSwapRow = 0;
  queuedSwapColumn = 0;

  /** Optional observers, for sound and effects. */
  onMatched?: MatchableStack['onMatched'];
  onNewRow?: () => void;
  onPanelPop?: (panel: Panel) => void;
  onPanelLand?: (panel: Panel) => void;
  onGameOver?: () => void;

  constructor(options: StackOptions) {
    this.levelData = options.levelData;
    this.behaviours = { ...defaultBehaviours(), ...options.behaviours };
    this.panelSource = options.panelSource.clone(this);

    this.speed = this.levelData.startingSpeed;
    if (this.levelData.speedIncreaseMode === SpeedIncreaseMode.TIME_INTERVAL) {
      this.nextSpeedIncreaseClock = DT_SPEED_INCREASE;
    } else {
      this.panelsToSpeedup = PANELS_TO_NEXT_SPEED[this.speed];
    }

    this.health = this.levelData.maxHealth;
    this.riseTimer = SPEED_TO_RISE_TIME[this.speed];
    this.stopTime = options.startingStopTime ?? 0;
    this.topCurRow = this.behaviours.passiveRaise ? this.height - 1 : this.height;

    for (let row = 0; row <= this.height; row++) {
      this.panels[row] = [];
      for (let col = 1; col <= this.width; col++) this.createPanelAt(row, col);
    }
  }

  createPanelAt(row: number, column: number): Panel {
    const panel = new Panel(
      row, column, this.panelsCreatedCount++, this.levelData.frameConstants,
    );
    panel.onPop = () => this.handlePop(panel);
    panel.onPopped = () => this.handlePopped();
    panel.onLand = () => this.handleLand(panel);
    this.panels[row][column] = panel;
    return panel;
  }

  /**
   * Fill the opening board.
   *
   * One more row than the board is tall, because a new row spawns in row 0 and
   * we want the bottom of the starting board to end up in row 1. The cursor is
   * pushed back down after each row so it does not ride up with the stack.
   */
  startingState(): void {
    const rowCount = 7; // GeneratorSource:getStartingBoardHeight
    for (let i = 1; i <= rowCount + 1; i++) {
      this.newRow();
      this.curRow -= 1;
    }
    this.curRow = Math.max(1, this.curRow);
  }

  // --- queries ---

  /** Is any panel occupying the top row? */
  isToppedOut(): boolean {
    for (let col = 1; col <= this.width; col++) {
      if (this.panels[this.height][col].dangerous()) return true;
    }
    return false;
  }

  /**
   * Two frames of hysteresis, deliberately: a board counts as active for one
   * frame after the last panel settles, which stops the rise from resuming for
   * a single frame between two links of a chain.
   */
  hasActivePanels(): boolean {
    return this.nActivePanels > 0 || this.nPrevActivePanels > 0;
  }

  hasFallingGarbage(): boolean {
    const top = Math.min(this.height + 3, this.panels.length - 1);
    for (let row = top; row >= 1; row--) {
      if (!this.panels[row]) continue;
      for (let col = 1; col <= this.width; col++) {
        const panel = this.panels[row][col];
        if (panel && panel.isGarbage && panel.state === 'falling') return true;
      }
    }
    return false;
  }

  hasChainingPanels(): boolean {
    // Row 0 can never chain: those panels are dimmed.
    for (let row = 1; row < this.panels.length; row++) {
      for (let col = 1; col <= this.width; col++) {
        const panel = this.panels[row][col];
        if (panel && panel.chaining && panel.color !== 0) return true;
      }
    }
    return false;
  }

  swapQueued(): boolean {
    return this.queuedSwapColumn !== 0 && this.queuedSwapRow !== 0;
  }

  gameEnded(): boolean {
    return this.gameOverClock >= 0;
  }

  // --- one frame ---

  run(): void {
    if (this.stopWatchIsRunning) this.runPhysics();

    // Phase 3: what the player asked for this frame.
    this.applyCursorDirection(this.cursorDirection);

    if (this.swapThisFrame) {
      const left = this.panels[this.curRow][this.curCol];
      const right = this.panels[this.curRow][this.curCol + 1];
      this.tryQueueSwap(left, right);
    }

    this.handleManualRaise();

    if (this.stopWatchIsRunning) this.stopWatch += 1;
    this.clock += 1;

    // Input is consumed; the caller sets it again for the next frame.
    this.cursorDirection = null;
    this.swapThisFrame = false;
  }

  private runPhysics(): void {
    // Sampled before anything moves; stop time and the death check read this.
    this.wasToppedOut = this.isToppedOut();

    this.decrementInvincibilityTimers();
    this.updateRiseLock();
    this.updateSpeed();

    if (this.behaviours.passiveRaise) {
      if (this.advancePassiveRaise()) {
        if (this.checkGameOver()) this.setGameOver();
      }
    }

    if (!this.wasToppedOut && !this.hasFallingGarbage()) {
      this.health = this.levelData.maxHealth;
    }

    if (this.displacement % DISPLACEMENT_PER_ROW !== 0) {
      this.topCurRow = this.height - 1;
    }

    // The swap the player asked for last frame happens now, before matching.
    if (this.swapQueued()) {
      this.swap(this.queuedSwapRow, this.queuedSwapColumn);
      this.queuedSwapColumn = 0;
      this.queuedSwapRow = 0;
    }

    checkMatches(this);
    this.updatePanels();
    this.updateActivePanelCount();

    // No chaining panels left anywhere means the chain is over.
    if (this.chainCounter !== 0 && !this.hasChainingPanels()) {
      this.chainCounter = 0;
    }

    this.removeExtraRows();

    if (this.checkGameOver()) this.setGameOver();
  }

  private updatePanels(): void {
    this.shakeTimeOnFrame = 0;
    for (let row = 1; row < this.panels.length; row++) {
      for (let col = 1; col <= this.width; col++) {
        this.panels[row][col].update(this.panels);
      }
    }
  }

  private updateActivePanelCount(): void {
    this.nPrevActivePanels = this.nActivePanels;
    const { count, swapping } = this.getActivePanelCount();
    this.nActivePanels = count;
    this.swappingPanelCount = swapping;
  }

  /**
   * Panels doing something. Note `landing` does NOT count as active - a landing
   * panel's twelve bounce frames must not hold the stack still.
   */
  private getActivePanelCount(): { count: number; swapping: number } {
    let count = 0;
    let swapping = 0;
    for (let row = 1; row <= this.height; row++) {
      for (let col = 1; col <= this.width; col++) {
        const panel = this.panels[row][col];
        if (panel.isGarbage) {
          if (panel.state !== 'normal') count += 1;
        } else if (panel.color !== 0 && panel.state !== 'normal' && panel.state !== 'landing') {
          count += 1;
          if (panel.state === 'swapping') swapping += 1;
        }
      }
    }
    return { count, swapping };
  }

  private decrementInvincibilityTimers(): void {
    this.prevShakeTime = this.shakeTime;
    this.shakeTime = Math.max(this.shakeTime - 1, this.shakeTimeOnFrame);
    if (this.shakeTime === 0) this.peakShakeTime = 0;

    // Stop time does NOT tick while pre-stop remains. Pre-stop covers the clear
    // animation; stop time is the reward that begins once it finishes.
    if (this.preStopTime !== 0) {
      this.preStopTime -= 1;
    } else if (this.stopTime !== 0) {
      this.stopTime -= 1;
    }
  }

  private updateRiseLock(): void {
    const previousRiseLock = this.riseLock;
    if (this.swapQueued()) this.riseLock = true;
    else if (this.shakeTime > 0) this.riseLock = true;
    else if (this.hasActivePanels()) this.riseLock = true;
    else this.riseLock = false;

    if (previousRiseLock && !this.riseLock) this.preventManualRaise = false;
  }

  private updateSpeed(): void {
    if (this.levelData.speedIncreaseMode === SpeedIncreaseMode.TIME_INTERVAL) {
      if (this.clock === this.nextSpeedIncreaseClock) {
        this.speed = Math.min(this.speed + 1, 99);
        this.nextSpeedIncreaseClock += DT_SPEED_INCREASE;
      }
    } else if (this.panelsToSpeedup <= 0) {
      this.speed = Math.min(this.speed + 1, 99);
      this.panelsToSpeedup += PANELS_TO_NEXT_SPEED[this.speed];
    }
  }

  /**
   * The automatic rise.
   *
   * Returns true if the rise was allowed to proceed this frame, which is the
   * caller's cue to test for death - because being topped out during a rise is
   * what drains health, and nothing else does.
   */
  private advancePassiveRaise(): boolean {
    if (this.manualRaise) {
      // Finishes a raise begun on the PREVIOUS frame, and so may ignore the
      // rise lock. The new row is deferred to here so the stack is guaranteed
      // not to have been topped out at the start of the frame.
      if (this.displacement === 0 && this.hasRisen) {
        this.topCurRow = this.height;
        this.newRow();
      }
      return false;
    }

    if (!this.riseLock && this.stopTime === 0) {
      if (this.isToppedOut()) {
        this.health -= 1;
      } else {
        this.riseTimer -= 1;
        if (this.riseTimer <= 0) {
          this.displacement -= 1;
          if (this.displacement === 0) {
            this.preventManualRaise = false;
            this.topCurRow = this.height;
            this.newRow();
          }
          this.riseTimer += SPEED_TO_RISE_TIME[this.speed];
        }
      }
      return true;
    }
    return false;
  }

  /**
   * The player pushing the stack up.
   *
   * Manual raise DUMPS all accumulated stop time - pushing while a big chain's
   * reward is still running throws that reward away. The final 16th is
   * deliberately deferred to passive raise on the next frame, so a raise cannot
   * commit a row on the same frame it tops the stack out.
   */
  private handleManualRaise(): void {
    if (!this.behaviours.allowManualRaise || !this.manualRaise) return;

    if (!this.riseLock) {
      this.stopTime = 0;
      if (this.wasToppedOut) {
        if (this.checkGameOver()) this.setGameOver();
      } else {
        this.hasRisen = true;
        this.displacement -= 1;
        if (this.displacement === 1) {
          if (!this.preventManualRaise) this.addScore(SCORE_PER_MANUAL_RAISE);
          this.manualRaise = false;
          this.riseTimer = 1;
          this.preventManualRaise = true;
        }
        this.manualRaiseYet = true;
      }
    } else if (!this.manualRaiseYet) {
      // Rise-locked before the raise ever moved: it is cancelled outright.
      this.manualRaise = false;
    } else if (this.hasFallingGarbage()) {
      // Falling garbage may top the stack out, and resuming the raise once the
      // shake runs out would then be instant death with stop time still in hand.
      this.manualRaise = false;
    }
  }

  /** Commit a new row at the bottom, pushing everything up one. */
  newRow(): void {
    const panels = this.panels;

    if (this.curRow !== 0) {
      this.curRow = Math.max(1, Math.min(this.curRow + 1, this.topCurRow));
    }
    if (this.queuedSwapRow > 0) this.queuedSwapRow += 1;

    const stackHeight = panels.length;
    panels[stackHeight] = [];
    const { colors, metalPanelsQueued } = this.panelSource.nextRowColors(
      this, this.metalPanelsQueued,
    );
    this.metalPanelsQueued = metalPanelsQueued;
    for (let col = 1; col <= this.width; col++) {
      const panel = this.createPanelAt(stackHeight, col);
      panel.color = colors[col - 1];
      panel.state = 'dimmed';
    }

    // Switching each panel down one refreshes its row/column bookkeeping.
    for (let row = stackHeight; row >= 1; row--) {
      for (let col = this.width; col >= 1; col--) {
        Panel.switch(panels[row][col], panels[row - 1][col], panels);
      }
    }

    // The row created at the top is now row 0; the old row 0 is in play at row
    // 1 and must lose its dimmed state HERE - checkMatches runs before the
    // panel update, so those panels have to be matchable already.
    for (let col = 1; col <= this.width; col++) {
      panels[1][col].state = 'normal';
      panels[1][col].stateChanged = true;
    }

    this.displacement = DISPLACEMENT_PER_ROW;
    this.onNewRow?.();
  }

  /** Drop empty rows above the playfield so the grid does not grow forever. */
  private removeExtraRows(): void {
    for (let row = this.panels.length - 1; row > this.height; row--) {
      const rowPanels = this.panels[row];
      let empty = true;
      for (let col = 1; col <= this.width; col++) {
        if (rowPanels[col].color !== 0) { empty = false; break; }
      }
      if (!empty) break;
      this.panels.pop();
    }
  }

  // --- input ---

  applyCursorDirection(direction: CursorDirection): void {
    if (!direction) return;
    if (direction === 'up') this.curRow = Math.min(this.curRow + 1, this.topCurRow);
    else if (direction === 'down') this.curRow = Math.max(this.curRow - 1, 1);
    else if (direction === 'left') this.curCol = Math.max(this.curCol - 1, 1);
    else if (direction === 'right') this.curCol = Math.min(this.curCol + 1, this.width - 1);
  }

  /**
   * Ask for a swap. It does not happen now - it is queued for the next frame.
   */
  tryQueueSwap(panel1: Panel, panel2: Panel): boolean {
    if (!this.canSwap(panel1, panel2)) return false;
    this.swapCount += 1;
    // By convention the queued column is the LEFT panel.
    this.queuedSwapColumn = Math.min(panel1.column, panel2.column);
    this.queuedSwapRow = panel1.row;
    return true;
  }

  canSwap(panel1: Panel, panel2: Panel): boolean {
    if (Math.abs(panel1.column - panel2.column) !== 1 || panel1.row !== panel2.row) return false;
    // No swapping on the first frame of a game.
    if (this.clock <= 1) return false;
    if (panel1.color === 0 && panel2.color === 0) return false;
    if (!panel1.allowsSwap() || !panel2.allowsSwap()) return false;

    const row = panel1.row;
    let panelAbove1: Panel | undefined;
    let panelAbove2: Panel | undefined;

    if (row < this.height) {
      panelAbove1 = this.panels[row + 1][panel1.column];
      panelAbove2 = this.panels[row + 1][panel2.column];
      // Nothing above the cursor may be hovering.
      if (panelAbove1.state === 'hovering' || panelAbove2.state === 'hovering') return false;
    }

    // If one side of the cursor is air, a swap in progress directly above or
    // below that spans air and not-air would produce an inconsistent board.
    if (panel1.color === 0 || panel2.color === 0) {
      if (panelAbove1 && panelAbove2
        && panelAbove1.state === 'swapping' && panelAbove2.state === 'swapping'
        && (panelAbove1.color === 0 || panelAbove2.color === 0)
        && (panelAbove1.color !== 0 || panelAbove2.color !== 0)) {
        return false;
      }
      if (row > 1) {
        const panelBelow1 = this.panels[row - 1][panel1.column];
        const panelBelow2 = this.panels[row - 1][panel2.column];
        if (panelBelow1.state === 'swapping' && panelBelow2.state === 'swapping'
          && (panelBelow1.color === 0 || panelBelow2.color === 0)
          && (panelBelow1.color !== 0 || panelBelow2.color !== 0)) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Perform the swap.
   *
   * `dontSwap` is set immediately afterwards for any panel that is now going to
   * fall, or any gap that now has a panel above it: those swaps cannot be taken
   * back, because the board is already committed to moving.
   */
  swap(row: number, col: number): void {
    const panels = this.panels;
    let leftPanel = panels[row][col];
    let rightPanel = panels[row][col + 1];
    leftPanel.startSwap(true);
    rightPanel.startSwap(false);
    Panel.switch(leftPanel, rightPanel, panels);
    [leftPanel, rightPanel] = [rightPanel, leftPanel];

    if (row !== 1) {
      if (leftPanel.color !== 0
        && (panels[row - 1][col].color === 0 || panels[row - 1][col].state === 'falling')) {
        leftPanel.dontSwap = true;
      }
      if (rightPanel.color !== 0
        && (panels[row - 1][col + 1].color === 0
          || panels[row - 1][col + 1].state === 'falling')) {
        rightPanel.dontSwap = true;
      }
    }

    if (row !== this.height) {
      if (leftPanel.color === 0 && panels[row + 1][col].color !== 0) leftPanel.dontSwap = true;
      if (rightPanel.color === 0 && panels[row + 1][col + 1].color !== 0) {
        rightPanel.dontSwap = true;
      }
    }
  }

  // --- scoring and life ---

  addScore(amount: number): void {
    this.score += amount;
    if (this.score > MAX_SCORE) this.score = MAX_SCORE;
  }

  private handlePop(panel: Panel): void {
    if (!panel.isGarbage) {
      this.addScore(SCORE_PER_PANEL);
      this.panelsCleared += 1;
      if (this.panelsCleared % this.levelData.shockFrequency === 0) {
        this.metalPanelsQueued = Math.min(
          this.metalPanelsQueued + 1, this.levelData.shockCap,
        );
      }
    }
    this.onPanelPop?.(panel);
  }

  private handlePopped(): void {
    this.panelsToSpeedup -= 1;
  }

  private handleLand(panel: Panel): void {
    this.onPanelLand?.(panel);
  }

  /**
   * Health reaching zero ends the game, but only once the stack has stopped
   * shaking - garbage landing must not kill on the frame it arrives.
   */
  checkGameOver(): boolean {
    if (this.gameEnded()) return false;
    return this.health <= 0 && this.shakeTime <= 0;
  }

  setGameOver(): void {
    this.gameOverClock = this.clock;
    this.onGameOver?.();
  }

  /** The origin of the last attack graphic, for the renderer. */
  lastMatchOrigin: Coordinate | null = null;
}
