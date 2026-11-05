"use strict";
/**
 * Replay Repository
 *
 * Database operations for replay data
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReplayRepository = void 0;
const zlib = __importStar(require("zlib"));
class ReplayRepository {
    constructor(db) {
        this.db = db;
    }
    /**
     * Insert replay
     */
    async insert(replay) {
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
        stmt.run(replay.metadata.id, replay.metadata.userId, replay.metadata.username, replay.metadata.mode, replay.metadata.duration, replay.metadata.version, replay.metadata.seed || null, replay.metadata.finalScore, replay.metadata.finalLevel, replay.metadata.finalGrade, replay.metadata.finalLines, inputsData, snapshotsData, 1, // compressed = true
        replay.inputs.length, replay.snapshots.length);
    }
    /**
     * Get replay by ID
     */
    async get(replayId) {
        const stmt = this.db.prepare('SELECT * FROM gm_replays WHERE replay_id = ?');
        const row = stmt.get(replayId);
        if (!row)
            return null;
        return await this.rowToReplay(row);
    }
    /**
     * Get replays for a user
     */
    async getUserReplays(userId, mode, limit = 50) {
        let sql = 'SELECT * FROM gm_replays WHERE user_id = ?';
        const params = [userId];
        if (mode) {
            sql += ' AND mode = ?';
            params.push(mode);
        }
        sql += ' ORDER BY created_at DESC LIMIT ?';
        params.push(limit);
        const stmt = this.db.prepare(sql);
        const rows = stmt.all(...params);
        return rows.map(row => this.rowToMetadata(row));
    }
    /**
     * Get top replays for a mode
     */
    async getTopReplays(mode, limit = 20) {
        const stmt = this.db.prepare(`
      SELECT * FROM gm_replays
      WHERE mode = ?
      ORDER BY final_score DESC
      LIMIT ?
    `);
        const rows = stmt.all(mode, limit);
        return rows.map(row => this.rowToMetadata(row));
    }
    /**
     * Delete replay
     */
    delete(replayId) {
        const stmt = this.db.prepare('DELETE FROM gm_replays WHERE replay_id = ?');
        const result = stmt.run(replayId);
        return result.changes > 0;
    }
    /**
     * Delete old replays
     */
    deleteOlderThan(maxAge) {
        const cutoff = Math.floor((Date.now() - maxAge) / 1000);
        const stmt = this.db.prepare('DELETE FROM gm_replays WHERE created_at < ?');
        const result = stmt.run(cutoff);
        return result.changes;
    }
    /**
     * Get storage statistics
     */
    getStats() {
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
        const result = stmt.get();
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
    compress(data) {
        return new Promise((resolve, reject) => {
            zlib.gzip(Buffer.from(data), (err, result) => {
                if (err)
                    reject(err);
                else
                    resolve(result);
            });
        });
    }
    /**
     * Decompress data with gzip
     */
    decompress(data) {
        return new Promise((resolve, reject) => {
            zlib.gunzip(data, (err, result) => {
                if (err)
                    reject(err);
                else
                    resolve(result.toString());
            });
        });
    }
    /**
     * Convert database row to Replay
     */
    async rowToReplay(row) {
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
    rowToMetadata(row) {
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
exports.ReplayRepository = ReplayRepository;
//# sourceMappingURL=replay-repository.js.map