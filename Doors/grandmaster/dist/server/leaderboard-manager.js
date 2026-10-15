"use strict";
/**
 * Leaderboard Manager
 *
 * Handles persistent storage and retrieval of high scores
 * - Per-mode leaderboards
 * - Global rankings
 * - Historical tracking
 * - Anti-cheat integration
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LeaderboardManager = void 0;
const connection_1 = require("./database/connection");
const leaderboard_repository_1 = require("./database/leaderboard-repository");
/**
 * Leaderboard manager with persistent storage
 */
class LeaderboardManager {
    constructor() {
        this.entries = new Map();
        this.userBests = new Map();
        const db = (0, connection_1.getDatabase)().getDb();
        this.repository = new leaderboard_repository_1.LeaderboardRepository(db);
        // Load existing entries from database
        this.loadFromDatabase();
    }
    /**
     * Submit a score to the leaderboard
     */
    async submitScore(userId, username, result, validation, replayId) {
        const entry = {
            id: this.generateEntryId(userId, result),
            userId,
            username,
            mode: result.mode,
            score: result.score,
            level: result.level,
            grade: result.grade,
            lines: result.linesCleared,
            time: result.time,
            finesseRate: result.finesseRate,
            finesseErrors: result.finesseErrors,
            timestamp: Date.now(),
            validationScore: validation.score,
            flags: validation.flags,
            replayId,
        };
        // Only accept if validation score is acceptable
        if (validation.score < 50) {
            throw new Error('Score rejected: validation failed');
        }
        // Store entry
        this.entries.set(entry.id, entry);
        // Update user best
        const isPersonalBest = this.updateUserBest(entry);
        // Calculate rank
        const rank = this.calculateRank(entry);
        const isTopTen = rank <= 10;
        // Persist to database (in real implementation)
        await this.persistEntry(entry);
        return { rank, isPersonalBest, isTopTen };
    }
    /**
     * Get leaderboard entries
     */
    getLeaderboard(query = {}) {
        let results = Array.from(this.entries.values());
        // Filter by mode
        if (query.mode) {
            results = results.filter(e => e.mode === query.mode);
        }
        // Filter by user
        if (query.userId) {
            results = results.filter(e => e.userId === query.userId);
        }
        // Filter by validation score
        if (query.minValidationScore !== undefined) {
            results = results.filter(e => e.validationScore >= query.minValidationScore);
        }
        // Filter by date range
        if (query.startDate) {
            results = results.filter(e => e.timestamp >= query.startDate);
        }
        if (query.endDate) {
            results = results.filter(e => e.timestamp <= query.endDate);
        }
        // Sort by score (descending)
        results.sort((a, b) => b.score - a.score);
        // Apply limit and offset
        const offset = query.offset || 0;
        const limit = query.limit || 100;
        return results.slice(offset, offset + limit);
    }
    /**
     * Get user's personal best for a mode
     */
    getUserBest(userId, mode) {
        const userBests = this.userBests.get(userId);
        if (!userBests)
            return null;
        return userBests.get(mode) || null;
    }
    /**
     * Get user's rank in a mode
     */
    getUserRank(userId, mode) {
        const best = this.getUserBest(userId, mode);
        if (!best)
            return null;
        return this.calculateRank(best);
    }
    /**
     * Get leaderboard statistics
     */
    getStats(mode) {
        let entries = Array.from(this.entries.values());
        if (mode) {
            entries = entries.filter(e => e.mode === mode);
        }
        if (entries.length === 0) {
            return {
                totalEntries: 0,
                uniquePlayers: 0,
                averageScore: 0,
                averageLevel: 0,
                highestGrade: '9',
                fastestTime: null,
            };
        }
        const uniquePlayers = new Set(entries.map(e => e.userId)).size;
        const totalScore = entries.reduce((sum, e) => sum + e.score, 0);
        const totalLevel = entries.reduce((sum, e) => sum + e.level, 0);
        const averageScore = totalScore / entries.length;
        const averageLevel = totalLevel / entries.length;
        // Find highest grade
        const gradeRanks = {
            '9': 0, '8': 1, '7': 2, '6': 3, '5': 4, '4': 5, '3': 6, '2': 7, '1': 8,
            'S1': 9, 'S2': 10, 'S3': 11, 'S4': 12, 'S5': 13, 'S6': 14, 'S7': 15, 'S8': 16, 'S9': 17,
            'S10': 18, 'S11': 19, 'S12': 20, 'S13': 21,
            'm1': 22, 'm2': 23, 'm3': 24, 'm4': 25, 'm5': 26, 'm6': 27, 'm7': 28, 'm8': 29, 'm9': 30,
            'M': 31, 'MK': 32, 'MV': 33, 'MO': 34, 'GM': 35, 'GMM': 36,
        };
        const highestGrade = entries.reduce((highest, e) => {
            const currentRank = gradeRanks[e.grade] ?? 0;
            const highestRank = gradeRanks[highest] ?? 0;
            return currentRank > highestRank ? e.grade : highest;
        }, '9');
        // Find fastest time (for completed games)
        const completedGames = entries.filter(e => e.time !== null);
        const fastestTime = completedGames.length > 0
            ? Math.min(...completedGames.map(e => e.time))
            : null;
        return {
            totalEntries: entries.length,
            uniquePlayers,
            averageScore: Math.floor(averageScore),
            averageLevel: Math.floor(averageLevel),
            highestGrade,
            fastestTime,
        };
    }
    /**
     * Update user's best score for a mode
     */
    updateUserBest(entry) {
        if (!this.userBests.has(entry.userId)) {
            this.userBests.set(entry.userId, new Map());
        }
        const userBests = this.userBests.get(entry.userId);
        const currentBest = userBests.get(entry.mode);
        if (!currentBest || entry.score > currentBest.score) {
            userBests.set(entry.mode, entry);
            return true;
        }
        return false;
    }
    /**
     * Calculate rank for an entry
     */
    calculateRank(entry) {
        const modeEntries = this.getLeaderboard({ mode: entry.mode, minValidationScore: 50 });
        const rank = modeEntries.findIndex(e => e.id === entry.id);
        return rank === -1 ? modeEntries.length + 1 : rank + 1;
    }
    /**
     * Generate unique entry ID
     */
    generateEntryId(userId, result) {
        const timestamp = Date.now();
        return `${userId}_${result.mode}_${timestamp}`;
    }
    /**
     * Persist entry to database
     */
    async persistEntry(entry) {
        this.repository.insert(entry);
    }
    /**
     * Load entries from database
     */
    async loadFromDatabase() {
        const entries = this.repository.query({ limit: 10000 }); // Load all
        // Populate in-memory cache
        this.entries.clear();
        this.userBests.clear();
        for (const entry of entries) {
            this.entries.set(entry.id, entry);
            this.updateUserBest(entry);
        }
    }
    /**
     * Export leaderboard data
     */
    exportData(mode) {
        const entries = this.getLeaderboard({ mode, limit: 1000 });
        return JSON.stringify(entries, null, 2);
    }
    /**
     * Import leaderboard data
     */
    importData(data) {
        try {
            const entries = JSON.parse(data);
            let imported = 0;
            for (const entry of entries) {
                this.entries.set(entry.id, entry);
                this.updateUserBest(entry);
                imported++;
            }
            return imported;
        }
        catch (error) {
            throw new Error(`Failed to import data: ${error}`);
        }
    }
    /**
     * Clear all entries (dangerous!)
     */
    clearAll() {
        this.entries.clear();
        this.userBests.clear();
        this.repository.deleteAll();
    }
    /**
     * Remove entries for a specific user
     */
    removeUserEntries(userId) {
        const removed = this.repository.deleteByUser(userId);
        // Update in-memory cache
        for (const [id, entry] of this.entries) {
            if (entry.userId === userId) {
                this.entries.delete(id);
            }
        }
        this.userBests.delete(userId);
        return removed;
    }
}
exports.LeaderboardManager = LeaderboardManager;
//# sourceMappingURL=leaderboard-manager.js.map