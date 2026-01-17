"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReplayManager = exports.ReplayRecorder = void 0;
const connection_1 = require("./database/connection");
const replay_repository_1 = require("./database/replay-repository");
const user_repository_1 = require("./database/user-repository");
/**
 * Replay recording session
 */
class ReplayRecorder {
    constructor(userId, username, mode, seed) {
        this.userId = userId;
        this.username = username;
        this.mode = mode;
        this.seed = seed;
        this.inputs = [];
        this.snapshots = [];
        this.frameCount = 0;
        this.lastSnapshotFrame = 0;
        this.snapshotInterval = 300; // Every 300 frames (~5 seconds at 60fps)
        this.startTime = Date.now();
    }
    /**
     * Record an input action
     */
    recordInput(action, piece) {
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
    recordSnapshot(state) {
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
                nextPieces: state.nextQueue.slice(0, 5), // Only store first 5
                board: this.captureBoard(state),
            });
            this.lastSnapshotFrame = this.frameCount;
        }
    }
    /**
     * Update frame counter
     */
    updateFrame() {
        this.frameCount++;
    }
    /**
     * Capture minimal board state
     */
    captureBoard(state) {
        const board = [];
        for (let y = 0; y < state.board.height; y++) {
            const row = [];
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
    finalize(finalState) {
        const metadata = {
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
            version: '1.0.0', // Grandmaster version
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
    generateReplayId() {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 10);
        return `${this.userId}_${this.mode}_${timestamp}_${random}`;
    }
    /**
     * Convert to validator format
     */
    toValidatorFormat() {
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
exports.ReplayRecorder = ReplayRecorder;
/**
 * Replay manager with storage and playback
 */
class ReplayManager {
    constructor() {
        this.replays = new Map();
        const db = (0, connection_1.getDatabase)().getDb();
        this.repository = new replay_repository_1.ReplayRepository(db);
        this.userRepository = new user_repository_1.UserRepository(db);
    }
    /**
     * Store a replay
     */
    async storeReplay(replay) {
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
    async getReplay(replayId) {
        // Check memory cache
        let replay = this.replays.get(replayId);
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
    async getUserReplays(userId, mode, limit = 50) {
        return await this.repository.getUserReplays(userId, mode, limit);
    }
    /**
     * Get top replays for a mode
     */
    async getTopReplays(mode, limit = 20) {
        return await this.repository.getTopReplays(mode, limit);
    }
    /**
     * Verify replay integrity
     */
    async verifyReplay(replayId) {
        const replay = await this.getReplay(replayId);
        if (!replay) {
            return { valid: false, errors: ['Replay not found'], warnings: [] };
        }
        const errors = [];
        const warnings = [];
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
    async deleteReplay(replayId) {
        this.replays.delete(replayId);
        return this.repository.delete(replayId);
    }
    /**
     * Export replay as JSON
     */
    exportReplay(replay) {
        const decompressed = this.decompressReplay(replay);
        return JSON.stringify(decompressed, null, 2);
    }
    /**
     * Import replay from JSON
     */
    importReplay(data) {
        const replay = JSON.parse(data);
        // Validate structure
        if (!replay.metadata || !replay.inputs || !replay.snapshots) {
            throw new Error('Invalid replay format');
        }
        return replay;
    }
    /**
     * Compress replay (simple delta encoding for now)
     */
    compressReplay(replay) {
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
    decompressReplay(replay) {
        if (!replay.compressed)
            return replay;
        // Decompress if needed
        return {
            ...replay,
            compressed: false,
        };
    }
    /**
     * Persist replay to database
     */
    async persistReplay(replay) {
        // Ensure user exists before inserting replay (FK constraint)
        this.userRepository.ensureUser(replay.metadata.userId, replay.metadata.username);
        await this.repository.insert(replay);
    }
    /**
     * Load replay from database
     */
    async loadReplay(replayId) {
        return await this.repository.get(replayId);
    }
    /**
     * Get storage statistics
     */
    getStats() {
        return this.repository.getStats();
    }
    /**
     * Cleanup old replays
     */
    async cleanupOldReplays(maxAge) {
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
exports.ReplayManager = ReplayManager;
//# sourceMappingURL=replay-manager.js.map