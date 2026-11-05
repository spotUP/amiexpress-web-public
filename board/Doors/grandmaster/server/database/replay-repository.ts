/**
 * Replay Repository
 *
 * Database operations for replay data
 */

import type { Database } from 'better-sqlite3';
import type { Replay, ReplayMetadata } from '../replay-manager';
import type { GameMode } from '../../core/types';
import * as zlib from 'zlib';

export class ReplayRepository {
  constructor(private db: Database) {}

  /**
   * Insert replay
   */
  async insert(replay: Replay): Promise<void> {
    // Compress input and snapshot data
    const inputsData = await this.compress(JSON.stringify(replay.inputs));
    const snapshotsData = await this.compress(JSON.stringify(replay.snapshots));

    const stmt = this.db.prepare(`
      INSERT INTO gm_replays (
        replay_id, user_id, username, mode, duration, version, seed,
        final_score, final_level, final_grade, final_lines,
        inputs_data, snapshots_data, compressed, input_count, snapshot_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      replay.metadata.id,
      replay.metadata.userId,
      replay.metadata.username,
      replay.metadata.mode,
      replay.metadata.duration,
      replay.metadata.version,
      replay.metadata.seed || null,
      replay.metadata.finalScore,
      replay.metadata.finalLevel,
      replay.metadata.finalGrade,
      replay.metadata.finalLines,
      inputsData,
      snapshotsData,
      1, // compressed = true
      replay.inputs.length,
      replay.snapshots.length
    );
  }

  /**
   * Get replay by ID
   */
  async get(replayId: string): Promise<Replay | null> {
    const stmt = this.db.prepare('SELECT * FROM gm_replays WHERE replay_id = ?');
    const row = stmt.get(replayId) as any;

    if (!row) return null;

    return await this.rowToReplay(row);
  }

  /**
   * Get replays for a user
   */
  async getUserReplays(
    userId: string,
    mode?: GameMode,
    limit: number = 50
  ): Promise<ReplayMetadata[]> {
    let sql = 'SELECT * FROM gm_replays WHERE user_id = ?';
    const params: any[] = [userId];

    if (mode) {
      sql += ' AND mode = ?';
      params.push(mode);
    }

    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];

    return rows.map(row => this.rowToMetadata(row));
  }

  /**
   * Get top replays for a mode
   */
  async getTopReplays(mode: GameMode, limit: number = 20): Promise<ReplayMetadata[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM gm_replays
      WHERE mode = ?
      ORDER BY final_score DESC
      LIMIT ?
    `);

    const rows = stmt.all(mode, limit) as any[];
    return rows.map(row => this.rowToMetadata(row));
  }

  /**
   * Delete replay
   */
  delete(replayId: string): boolean {
    const stmt = this.db.prepare('DELETE FROM gm_replays WHERE replay_id = ?');
    const result = stmt.run(replayId);
    return result.changes > 0;
  }

  /**
   * Delete old replays
   */
  deleteOlderThan(maxAge: number): number {
    const cutoff = Math.floor((Date.now() - maxAge) / 1000);
    const stmt = this.db.prepare('DELETE FROM gm_replays WHERE created_at < ?');
    const result = stmt.run(cutoff);
    return result.changes;
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
    const stmt = this.db.prepare(`
      SELECT
        COUNT(*) as total_replays,
        SUM(input_count) as total_inputs,
        SUM(snapshot_count) as total_snapshots,
        AVG(input_count) as avg_inputs,
        AVG(snapshot_count) as avg_snapshots,
        MIN(created_at) as oldest,
        MAX(created_at) as newest
      FROM gm_replays
    `);

    const result = stmt.get() as any;

    return {
      totalReplays: result.total_replays || 0,
      totalInputs: result.total_inputs || 0,
      totalSnapshots: result.total_snapshots || 0,
      averageInputsPerReplay: result.avg_inputs || 0,
      averageSnapshotsPerReplay: result.avg_snapshots || 0,
      oldestReplay: result.oldest ? result.oldest * 1000 : null,
      newestReplay: result.newest ? result.newest * 1000 : null,
    };
  }

  /**
   * Compress data with gzip
   */
  private compress(data: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      zlib.gzip(Buffer.from(data), (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  }

  /**
   * Decompress data with gzip
   */
  private decompress(data: Buffer): Promise<string> {
    return new Promise((resolve, reject) => {
      zlib.gunzip(data, (err, result) => {
        if (err) reject(err);
        else resolve(result.toString());
      });
    });
  }

  /**
   * Convert database row to Replay
   */
  private async rowToReplay(row: any): Promise<Replay> {
    const inputsJson = await this.decompress(row.inputs_data);
    const snapshotsJson = await this.decompress(row.snapshots_data);

    return {
      metadata: this.rowToMetadata(row),
      inputs: JSON.parse(inputsJson),
      snapshots: JSON.parse(snapshotsJson),
      compressed: row.compressed === 1,
    };
  }

  /**
   * Convert database row to ReplayMetadata
   */
  private rowToMetadata(row: any): ReplayMetadata {
    return {
      id: row.replay_id,
      userId: row.user_id,
      username: row.username,
      mode: row.mode,
      timestamp: row.created_at * 1000, // Convert to milliseconds
      duration: row.duration,
      finalScore: row.final_score,
      finalLevel: row.final_level,
      finalGrade: row.final_grade,
      finalLines: row.final_lines,
      seed: row.seed,
      version: row.version,
    };
  }
}
