/**
 * Replay Manager
 *
 * Handles recording, storage, and playback of game replays
 * - Input recording (every action with timestamp)
 * - State snapshots (periodic game state for verification)
 * - Compression (efficient storage)
 * - Validation integration
 * - Replay playback
 */

import type { GameMode, GameState, Piece, PieceType } from '../core/types';
import type { ReplayData } from './game-validator';
import { getDatabase } from './database/connection';
import { ReplayRepository } from './database/replay-repository';
import { UserRepository } from './database/user-repository';

/**
 * Input action types
 */
export type InputAction =
  | 'move_left'
  | 'move_right'
  | 'rotate_cw'
  | 'rotate_ccw'
  | 'soft_drop'
  | 'hard_drop'
  | 'hold'
  | 'irs_cw'
  | 'irs_ccw'
  | 'ihs';

/**
 * Recorded input with timestamp
 */
export interface ReplayInput {
  timestamp: number;
  frame: number;
  action: InputAction;
  piece?: PieceType;  // Which piece was active
}

/**
 * Game state snapshot for verification
 */
export interface ReplaySnapshot {
  timestamp: number;
  frame: number;
  level: number;
  lines: number;
  score: number;
  grade: string;
  combo: number;
  backToBack: boolean;
  holdPiece: PieceType | null;
  nextPieces: PieceType[];
  board: Array<Array<{ filled: boolean; color?: string }>>;
}

/**
 * Complete replay metadata
 */
export interface ReplayMetadata {
  id: string;
  userId: string;
  username: string;
  mode: GameMode;
  timestamp: number;
  duration: number;
  finalScore: number;
  finalLevel: number;
  finalGrade: string;
  finalLines: number;
  seed?: number;  // RNG seed for deterministic playback
  version: string;  // Game version
}

/**
 * Full replay data structure
 */
export interface Replay {
  metadata: ReplayMetadata;
  inputs: ReplayInput[];
  snapshots: ReplaySnapshot[];
  compressed?: boolean;
}

/**
 * Replay recording session
 */
export class ReplayRecorder {
  private inputs: ReplayInput[] = [];
  private snapshots: ReplaySnapshot[] = [];
  private startTime: number;
  private frameCount: number = 0;
  private lastSnapshotFrame: number = 0;
  private snapshotInterval: number = 300;  // Every 300 frames (~5 seconds at 60fps)

  constructor(
    private userId: string,
    private username: string,
    private mode: GameMode,
    private seed?: number
  ) {
    this.startTime = Date.now();
  }

  /**
   * Record an input action
   */
  recordInput(action: InputAction, piece?: PieceType): void {
    this.inputs.push({
      timestamp: Date.now() - this.startTime,
      frame: this.frameCount,
      action,
      piece,
    });
  }

  /**
   * Record a state snapshot (called periodically)
   */
  recordSnapshot(state: GameState): void {
    if (this.frameCount - this.lastSnapshotFrame >= this.snapshotInterval) {
      this.snapshots.push({
        timestamp: Date.now() - this.startTime,
        frame: this.frameCount,
        level: state.level,
        lines: state.lines,
        score: state.score,
        grade: state.grade,
        combo: state.combo,
        backToBack: state.backToBack,
        holdPiece: state.holdPiece,
        nextPieces: state.nextQueue.slice(0, 5),  // Only store first 5
        board: this.captureBoard(state),
      });
      this.lastSnapshotFrame = this.frameCount;
    }
  }

  /**
   * Update frame counter
   */
  updateFrame(): void {
    this.frameCount++;
  }

  /**
   * Capture minimal board state
   */
  private captureBoard(state: GameState): Array<Array<{ filled: boolean; color?: string }>> {
    const board: Array<Array<{ filled: boolean; color?: string }>> = [];
    for (let y = 0; y < state.board.height; y++) {
      const row: Array<{ filled: boolean; color?: string }> = [];
      for (let x = 0; x < state.board.width; x++) {
        const cell = state.board.grid[y][x];
        row.push({
          filled: cell.filled,
          color: cell.filled && cell.color ? cell.color : undefined,
        });
      }
      board.push(row);
    }
    return board;
  }

  /**
   * Finalize and create replay object
   */
  finalize(finalState: GameState): Replay {
    const metadata: ReplayMetadata = {
      id: this.generateReplayId(),
      userId: this.userId,
      username: this.username,
      mode: this.mode,
      timestamp: this.startTime,
      duration: Date.now() - this.startTime,
      finalScore: finalState.score,
      finalLevel: finalState.level,
      finalGrade: finalState.grade,
      finalLines: finalState.lines,
      seed: this.seed,
      version: '1.0.0',  // Grandmaster version
    };

    return {
      metadata,
      inputs: this.inputs,
      snapshots: this.snapshots,
      compressed: false,
    };
  }

  /**
   * Generate unique replay ID
   */
  private generateReplayId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    return `${this.userId}_${this.mode}_${timestamp}_${random}`;
  }

  /**
   * Convert to validator format
   */
  toValidatorFormat(): ReplayData {
    return {
      inputs: this.inputs.map(inp => ({
        timestamp: inp.timestamp,
        action: inp.action,
      })),
      states: this.snapshots.map(snap => ({
        timestamp: snap.timestamp,
        level: snap.level,
        lines: snap.lines,
        score: snap.score,
        grade: snap.grade,
      })),
    };
  }
}

/**
 * Replay manager with storage and playback
 */
export class ReplayManager {
  private replays: Map<string, Replay> = new Map();
  private repository: ReplayRepository;
  private userRepository: UserRepository;

  constructor() {
    const db = getDatabase().getDb();
    this.repository = new ReplayRepository(db);
    this.userRepository = new UserRepository(db);
  }

  /**
   * Store a replay
   */
  async storeReplay(replay: Replay): Promise<string> {
    // Optionally compress large replays
    if (replay.inputs.length > 1000 && !replay.compressed) {
      replay = this.compressReplay(replay);
    }

    // Store in memory
    this.replays.set(replay.metadata.id, replay);

    // Persist to database (placeholder)
    await this.persistReplay(replay);

    return replay.metadata.id;
  }

  /**
   * Retrieve a replay
   */
  async getReplay(replayId: string): Promise<Replay | null> {
    // Check memory cache
    let replay: Replay | null | undefined = this.replays.get(replayId);
    if (replay) {
      return this.decompressReplay(replay);
    }

    // Load from database (placeholder)
    replay = await this.loadReplay(replayId);
    if (replay) {
      this.replays.set(replayId, replay);
      return this.decompressReplay(replay);
    }

    return null;
  }

  /**
   * Get replays for a user
   */
  async getUserReplays(
    userId: string,
    mode?: GameMode,
    limit: number = 50
  ): Promise<ReplayMetadata[]> {
    return await this.repository.getUserReplays(userId, mode, limit);
  }

  /**
   * Get top replays for a mode
   */
  async getTopReplays(
    mode: GameMode,
    limit: number = 20
  ): Promise<ReplayMetadata[]> {
    return await this.repository.getTopReplays(mode, limit);
  }

  /**
   * Verify replay integrity
   */
  async verifyReplay(replayId: string): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const replay = await this.getReplay(replayId);
    if (!replay) {
      return { valid: false, errors: ['Replay not found'], warnings: [] };
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for missing data
    if (replay.inputs.length === 0) {
      errors.push('No inputs recorded');
    }

    if (replay.snapshots.length === 0) {
      warnings.push('No state snapshots recorded');
    }

    // Check timestamp consistency
    for (let i = 1; i < replay.inputs.length; i++) {
      if (replay.inputs[i].timestamp < replay.inputs[i - 1].timestamp) {
        errors.push(`Input timestamps not monotonic at index ${i}`);
      }
    }

    // Check snapshot consistency
    for (let i = 1; i < replay.snapshots.length; i++) {
      const prev = replay.snapshots[i - 1];
      const curr = replay.snapshots[i];

      if (curr.score < prev.score) {
        errors.push(`Score decreased from ${prev.score} to ${curr.score}`);
      }

      if (curr.lines < prev.lines) {
        errors.push(`Lines decreased from ${prev.lines} to ${curr.lines}`);
      }

      if (curr.level < prev.level) {
        warnings.push(`Level decreased from ${prev.level} to ${curr.level}`);
      }
    }

    // Check duration vs timestamps
    const lastInput = replay.inputs[replay.inputs.length - 1];
    if (lastInput && Math.abs(lastInput.timestamp - replay.metadata.duration) > 1000) {
      warnings.push('Duration mismatch with last input timestamp');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Delete a replay
   */
  async deleteReplay(replayId: string): Promise<boolean> {
    this.replays.delete(replayId);
    return this.repository.delete(replayId);
  }

  /**
   * Export replay as JSON
   */
  exportReplay(replay: Replay): string {
    const decompressed = this.decompressReplay(replay);
    return JSON.stringify(decompressed, null, 2);
  }

  /**
   * Import replay from JSON
   */
  importReplay(data: string): Replay {
    const replay = JSON.parse(data) as Replay;

    // Validate structure
    if (!replay.metadata || !replay.inputs || !replay.snapshots) {
      throw new Error('Invalid replay format');
    }

    return replay;
  }

  /**
   * Compress replay (simple delta encoding for now)
   */
  private compressReplay(replay: Replay): Replay {
    // For now, just mark as compressed
    // In production, implement delta encoding for inputs and RLE for board states
    return {
      ...replay,
      compressed: true,
    };
  }

  /**
   * Decompress replay
   */
  private decompressReplay(replay: Replay): Replay {
    if (!replay.compressed) return replay;

    // Decompress if needed
    return {
      ...replay,
      compressed: false,
    };
  }

  /**
   * Persist replay to database
   */
  private async persistReplay(replay: Replay): Promise<void> {
    // Ensure user exists before inserting replay (FK constraint)
    this.userRepository.ensureUser(replay.metadata.userId, replay.metadata.username);
    await this.repository.insert(replay);
  }

  /**
   * Load replay from database
   */
  private async loadReplay(replayId: string): Promise<Replay | null> {
    return await this.repository.get(replayId);
  }

  /**
   * Get storage statistics
   */
  getStats(): {
    totalReplays: number;
    totalInputs: number;
    totalSnapshots: number;
    averageInputsPerReplay: number;
    averageSnapshotsPerReplay: number;
    oldestReplay: number | null;
    newestReplay: number | null;
  } {
    return this.repository.getStats();
  }

  /**
   * Cleanup old replays
   */
  async cleanupOldReplays(maxAge: number): Promise<number> {
    const removed = this.repository.deleteOlderThan(maxAge);

    // Clear from cache
    const now = Date.now();
    for (const [id, replay] of this.replays) {
      if (now - replay.metadata.timestamp > maxAge) {
        this.replays.delete(id);
      }
    }

    return removed;
  }
}
