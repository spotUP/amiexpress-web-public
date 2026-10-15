/**
 * Rollback Netcode
 *
 * Implements rollback netcode for handling server corrections:
 * - Misprediction detection
 * - State restoration from snapshots
 * - Input replay after rollback
 * - Server state reconciliation
 */

import type { GameState } from '../core/types';
import type { PredictedInput, PredictionSnapshot } from './prediction';
import type { SyncPacket, FullStatePacket, DeltaStatePacket } from './sync';
import { GameEngine } from '../core/game';
import { PredictionManager, InputReplayer } from './prediction';

/**
 * Rollback reason
 */
export type RollbackReason =
  | 'state_mismatch'      // Server state differs from prediction
  | 'input_rejected'      // Server rejected an input
  | 'desync_detected'     // Desync detected in validation
  | 'correction_needed';  // Server sent explicit correction

/**
 * Rollback event
 */
export interface RollbackEvent {
  reason: RollbackReason;
  serverFrame: number;
  clientFrame: number;
  inputId: number;
  timestamp: number;
  deltaSize: number;      // How far we rolled back
  replayCount: number;    // How many inputs replayed
}

/**
 * Mismatch details
 */
export interface StateMismatch {
  field: string;
  serverValue: any;
  clientValue: any;
}

/**
 * Rollback configuration
 */
export interface RollbackConfig {
  mismatchThreshold: number;    // Max acceptable diff (default: 0)
  maxRollbackFrames: number;    // Max frames to roll back (default: 60)
  enableValidation: boolean;    // Validate all fields (default: true)
  logMismatches: boolean;       // Log mismatch details (default: true)
  autoCorrect: boolean;         // Auto-correct on mismatch (default: true)
}

/**
 * Rollback netcode manager
 */
export class RollbackManager {
  private config: RollbackConfig;
  private engine: GameEngine;
  private predictionManager: PredictionManager;
  private rollbackHistory: RollbackEvent[] = [];
  private lastRollbackTime: number = 0;
  private totalRollbacks: number = 0;
  private totalMismatches: number = 0;

  constructor(
    engine: GameEngine,
    predictionManager: PredictionManager,
    config?: Partial<RollbackConfig>
  ) {
    this.engine = engine;
    this.predictionManager = predictionManager;
    this.config = {
      mismatchThreshold: config?.mismatchThreshold ?? 0,
      maxRollbackFrames: config?.maxRollbackFrames || 60,
      enableValidation: config?.enableValidation ?? true,
      logMismatches: config?.logMismatches ?? true,
      autoCorrect: config?.autoCorrect ?? true,
    };
  }

  /**
   * Handle server state update
   */
  handleServerUpdate(packet: SyncPacket, currentFrame: number): boolean {
    if (packet.type === 'input_ack') {
      // Input was confirmed, no rollback needed
      return false;
    }

    const serverState = this.extractState(packet);
    const clientState = this.engine.getState();

    // Detect mismatches
    const mismatches = this.detectMismatches(serverState, clientState);

    if (mismatches.length > 0) {
      this.totalMismatches++;

      if (this.config.logMismatches) {
        console.warn('[Rollback] State mismatch detected:', {
          frame: packet.frame,
          mismatches: mismatches.map(m => m.field),
        });
      }

      if (this.config.autoCorrect) {
        return this.performRollback(
          serverState,
          packet.frame,
          currentFrame,
          'state_mismatch'
        );
      }
    }

    return false;
  }

  /**
   * Perform rollback to server state
   */
  private performRollback(
    serverState: GameState,
    serverFrame: number,
    clientFrame: number,
    reason: RollbackReason
  ): boolean {
    // Find snapshot to roll back to
    const snapshot = this.predictionManager.getSnapshot(serverFrame);
    if (!snapshot) {
      console.error('[Rollback] No snapshot found for frame', serverFrame);
      // Force accept server state
      this.forceServerState(serverState);
      return true;
    }

    // Calculate rollback distance
    const deltaFrames = clientFrame - serverFrame;
    if (deltaFrames > this.config.maxRollbackFrames) {
      console.warn('[Rollback] Rollback too large, forcing server state');
      this.forceServerState(serverState);
      return true;
    }

    // Get unconfirmed inputs to replay
    const unconfirmedInputs = this.predictionManager.getUnconfirmedInputs();

    // Restore server state
    this.restoreState(serverState);

    // Replay unconfirmed inputs
    if (unconfirmedInputs.length > 0) {
      InputReplayer.replay(this.engine, unconfirmedInputs);
    }

    // Record rollback event
    const event: RollbackEvent = {
      reason,
      serverFrame,
      clientFrame,
      inputId: snapshot.inputId,
      timestamp: Date.now(),
      deltaSize: deltaFrames,
      replayCount: unconfirmedInputs.length,
    };

    this.rollbackHistory.push(event);
    this.totalRollbacks++;
    this.lastRollbackTime = Date.now();

    // Trim history (keep last 100)
    if (this.rollbackHistory.length > 100) {
      this.rollbackHistory.shift();
    }

    return true;
  }

  /**
   * Detect state mismatches
   */
  private detectMismatches(
    serverState: GameState,
    clientState: GameState
  ): StateMismatch[] {
    const mismatches: StateMismatch[] = [];

    if (!this.config.enableValidation) {
      return mismatches;
    }

    // Compare primitive fields
    this.comparePrimitive(mismatches, 'score', serverState.score, clientState.score);
    this.comparePrimitive(mismatches, 'level', serverState.level, clientState.level);
    this.comparePrimitive(mismatches, 'lines', serverState.lines, clientState.lines);
    this.comparePrimitive(mismatches, 'grade', serverState.grade, clientState.grade);
    this.comparePrimitive(mismatches, 'combo', serverState.combo, clientState.combo);
    this.comparePrimitive(mismatches, 'backToBack', serverState.backToBack, clientState.backToBack);
    this.comparePrimitive(mismatches, 'gravity', serverState.gravity, clientState.gravity);

    // Compare current piece
    if (!this.piecesEqual(serverState.currentPiece, clientState.currentPiece)) {
      mismatches.push({
        field: 'currentPiece',
        serverValue: serverState.currentPiece,
        clientValue: clientState.currentPiece,
      });
    }

    // Compare hold piece
    if (serverState.holdPiece !== clientState.holdPiece) {
      mismatches.push({
        field: 'holdPiece',
        serverValue: serverState.holdPiece,
        clientValue: clientState.holdPiece,
      });
    }

    // Compare next queue
    if (!this.arraysEqual(serverState.nextQueue, clientState.nextQueue)) {
      mismatches.push({
        field: 'nextQueue',
        serverValue: serverState.nextQueue,
        clientValue: clientState.nextQueue,
      });
    }

    // Compare board (expensive, only if other mismatches found)
    if (mismatches.length > 0) {
      if (!this.boardsEqual(serverState.board, clientState.board)) {
        mismatches.push({
          field: 'board',
          serverValue: 'DIFFERENT',
          clientValue: 'DIFFERENT',
        });
      }
    }

    return mismatches;
  }

  /**
   * Compare primitive field
   */
  private comparePrimitive(
    mismatches: StateMismatch[],
    field: string,
    serverValue: any,
    clientValue: any
  ): void {
    if (serverValue !== clientValue) {
      const diff = Math.abs(
        (typeof serverValue === 'number' ? serverValue : 0) -
        (typeof clientValue === 'number' ? clientValue : 0)
      );

      if (diff > this.config.mismatchThreshold) {
        mismatches.push({ field, serverValue, clientValue });
      }
    }
  }

  /**
   * Compare two pieces
   */
  private piecesEqual(a: any, b: any): boolean {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return (
      a.type === b.type &&
      a.x === b.x &&
      a.y === b.y &&
      a.rotation === b.rotation
    );
  }

  /**
   * Compare two arrays
   */
  private arraysEqual<T>(a: T[], b: T[]): boolean {
    if (a.length !== b.length) return false;
    return a.every((val, idx) => val === b[idx]);
  }

  /**
   * Compare two boards
   */
  private boardsEqual(a: any, b: any): boolean {
    if (a.width !== b.width || a.height !== b.height) return false;

    for (let y = 0; y < a.height; y++) {
      for (let x = 0; x < a.width; x++) {
        const cellA = a.grid[y][x];
        const cellB = b.grid[y][x];
        if (cellA.filled !== cellB.filled || cellA.color !== cellB.color) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Extract state from sync packet
   */
  private extractState(packet: SyncPacket): GameState {
    if (packet.type === 'full_state') {
      return (packet as FullStatePacket).state;
    }

    if (packet.type === 'delta_state') {
      const delta = (packet as DeltaStatePacket).delta;
      const currentState = this.engine.getState();
      return {
        ...currentState,
        ...delta,
      };
    }

    return this.engine.getState();
  }

  /**
   * Restore game state
   */
  private restoreState(state: GameState): void {
    // This is a simplified version
    // In reality, GameEngine would need a setState() method
    // For now, we assume the engine can accept state updates
    // This will be implemented in the integration phase
    Object.assign(this.engine.getState(), state);
  }

  /**
   * Force accept server state (no rollback)
   */
  private forceServerState(state: GameState): void {
    this.restoreState(state);
    this.predictionManager.reset();
  }

  /**
   * Get recent rollback events
   */
  getRecentRollbacks(count: number = 10): RollbackEvent[] {
    return this.rollbackHistory.slice(-count);
  }

  /**
   * Get rollback stats
   */
  getStats(): {
    totalRollbacks: number;
    totalMismatches: number;
    recentRollbacks: number;
    averageDelta: number;
    averageReplay: number;
    lastRollback: number | null;
  } {
    const recent = this.rollbackHistory.slice(-10);
    const avgDelta = recent.length > 0
      ? recent.reduce((sum, e) => sum + e.deltaSize, 0) / recent.length
      : 0;
    const avgReplay = recent.length > 0
      ? recent.reduce((sum, e) => sum + e.replayCount, 0) / recent.length
      : 0;

    return {
      totalRollbacks: this.totalRollbacks,
      totalMismatches: this.totalMismatches,
      recentRollbacks: recent.length,
      averageDelta: avgDelta,
      averageReplay: avgReplay,
      lastRollback: this.lastRollbackTime || null,
    };
  }

  /**
   * Get mismatch rate
   */
  getMismatchRate(): number {
    if (this.rollbackHistory.length === 0) return 0;
    return this.totalMismatches / this.rollbackHistory.length;
  }

  /**
   * Reset rollback state
   */
  reset(): void {
    this.rollbackHistory = [];
    this.lastRollbackTime = 0;
    this.totalRollbacks = 0;
    this.totalMismatches = 0;
  }

  /**
   * Check if recently rolled back
   */
  hasRecentRollback(withinMs: number = 1000): boolean {
    if (!this.lastRollbackTime) return false;
    return Date.now() - this.lastRollbackTime < withinMs;
  }
}

/**
 * Desync detector
 */
export class DesyncDetector {
  private checksumHistory: Array<{ frame: number; checksum: number }> = [];
  private maxHistory: number = 100;

  /**
   * Calculate state checksum
   */
  calculateChecksum(state: GameState): number {
    // Simple checksum: sum of all numeric values
    let sum = 0;
    sum += state.score;
    sum += state.level * 1000;
    sum += state.lines * 100;
    sum += state.combo * 10;
    sum += state.backToBack ? 1 : 0;

    // Add piece positions
    if (state.currentPiece) {
      sum += state.currentPiece.x * 7;
      sum += state.currentPiece.y * 13;
      sum += state.currentPiece.rotation * 17;
    }

    // Add board checksum (sample)
    for (let y = 0; y < Math.min(5, state.board.height); y++) {
      for (let x = 0; x < state.board.width; x++) {
        if (state.board.grid[y][x].filled) {
          sum += (y * state.board.width + x) * 23;
        }
      }
    }

    return sum % 1000000;
  }

  /**
   * Record checksum
   */
  record(frame: number, state: GameState): void {
    const checksum = this.calculateChecksum(state);
    this.checksumHistory.push({ frame, checksum });

    if (this.checksumHistory.length > this.maxHistory) {
      this.checksumHistory.shift();
    }
  }

  /**
   * Verify checksum against server
   */
  verify(frame: number, serverChecksum: number): boolean {
    const record = this.checksumHistory.find(r => r.frame === frame);
    if (!record) return true; // No record, assume OK

    return record.checksum === serverChecksum;
  }

  /**
   * Get checksum for frame
   */
  getChecksum(frame: number): number | null {
    const record = this.checksumHistory.find(r => r.frame === frame);
    return record ? record.checksum : null;
  }

  /**
   * Clear history
   */
  clear(): void {
    this.checksumHistory = [];
  }
}
