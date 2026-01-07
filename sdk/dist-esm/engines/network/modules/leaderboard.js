/**
 * Leaderboards & Stats Module
 *
 * Rankings, statistics, and achievements with:
 * - Global, friends, and seasonal leaderboards
 * - Player statistics tracking
 * - Achievement system
 * - Match history
 */
import { EventEmitter } from 'events';
/**
 * Leaderboard Manager
 *
 * Manages leaderboards, player statistics, and achievements.
 */
export class LeaderboardManager extends EventEmitter {
    constructor(connection) {
        super();
        this.name = 'leaderboard';
        this.leaderboardCache = new Map();
        this.statsCache = new Map();
        this.achievementsCache = new Map();
        this.cacheTimeout = 60000; // 1 minute cache
        this.connection = connection;
        this.setupEventHandlers();
    }
    /**
     * Initialize leaderboard manager
     */
    async init() {
        // Nothing to initialize
    }
    /**
     * Setup socket event handlers
     */
    setupEventHandlers() {
        const socket = this.connection.getSocket();
        if (!socket)
            return;
        socket.on('leaderboard:updated', (data) => {
            // Invalidate cache
            const cacheKey = `${data.type}:${data.gameMode || 'default'}`;
            this.leaderboardCache.delete(cacheKey);
            this.emit('leaderboard:updated', data);
        });
        socket.on('achievement:unlocked', (achievement) => {
            this.emit('achievement:unlocked', achievement);
        });
        socket.on('achievement:progress', (data) => {
            this.emit('achievement:progress', data.achievementId, data.progress);
        });
        socket.on('stats:updated', (stats) => {
            this.statsCache.set(stats.playerId, { data: stats, timestamp: Date.now() });
            this.emit('stats:updated', stats);
        });
    }
    /**
     * Get leaderboard
     */
    async getLeaderboard(query) {
        const cacheKey = `${query.type}:${query.gameMode || 'default'}:${query.season || 0}:${query.offset || 0}`;
        // Check cache
        const cached = this.leaderboardCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data;
        }
        return new Promise((resolve, reject) => {
            const socket = this.connection.getSocket();
            if (!socket?.connected) {
                reject(new Error('Not connected'));
                return;
            }
            socket.emit('leaderboard:get', query, (response) => {
                if (response.success && response.leaderboard) {
                    this.leaderboardCache.set(cacheKey, {
                        data: response.leaderboard,
                        timestamp: Date.now(),
                    });
                    resolve(response.leaderboard);
                }
                else {
                    reject(new Error(response.error || 'Failed to get leaderboard'));
                }
            });
        });
    }
    /**
     * Get player's rank in leaderboard
     */
    async getPlayerRank(playerId, type = 'global') {
        return new Promise((resolve, reject) => {
            const socket = this.connection.getSocket();
            if (!socket?.connected) {
                resolve(null);
                return;
            }
            socket.emit('leaderboard:get_rank', { playerId, type }, (response) => {
                if (response.success) {
                    resolve(response.entry || null);
                }
                else {
                    resolve(null);
                }
            });
        });
    }
    /**
     * Get leaderboard around player
     */
    async getLeaderboardAroundPlayer(playerId, type = 'global', range = 5) {
        return new Promise((resolve, reject) => {
            const socket = this.connection.getSocket();
            if (!socket?.connected) {
                resolve([]);
                return;
            }
            socket.emit('leaderboard:get_around', { playerId, type, range }, (response) => {
                if (response.success && response.entries) {
                    resolve(response.entries);
                }
                else {
                    resolve([]);
                }
            });
        });
    }
    /**
     * Get player statistics
     */
    async getStats(playerId) {
        // Check cache
        if (playerId !== undefined) {
            const cached = this.statsCache.get(playerId);
            if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
                return cached.data;
            }
        }
        return new Promise((resolve, reject) => {
            const socket = this.connection.getSocket();
            if (!socket?.connected) {
                reject(new Error('Not connected'));
                return;
            }
            socket.emit('stats:get', { playerId }, (response) => {
                if (response.success && response.stats) {
                    this.statsCache.set(response.stats.playerId, {
                        data: response.stats,
                        timestamp: Date.now(),
                    });
                    resolve(response.stats);
                }
                else {
                    reject(new Error(response.error || 'Failed to get stats'));
                }
            });
        });
    }
    /**
     * Get achievements
     */
    async getAchievements(playerId) {
        const id = playerId ?? 0;
        // Check cache
        const cached = this.achievementsCache.get(id);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data;
        }
        return new Promise((resolve, reject) => {
            const socket = this.connection.getSocket();
            if (!socket?.connected) {
                reject(new Error('Not connected'));
                return;
            }
            socket.emit('achievements:get', { playerId }, (response) => {
                if (response.success && response.categories) {
                    this.achievementsCache.set(id, {
                        data: response.categories,
                        timestamp: Date.now(),
                    });
                    resolve(response.categories);
                }
                else {
                    reject(new Error(response.error || 'Failed to get achievements'));
                }
            });
        });
    }
    /**
     * Get single achievement
     */
    async getAchievement(achievementId, playerId) {
        const categories = await this.getAchievements(playerId);
        for (const category of categories) {
            const achievement = category.achievements.find(a => a.id === achievementId);
            if (achievement) {
                return achievement;
            }
        }
        return null;
    }
    /**
     * Unlock achievement (local notification, server validates)
     */
    unlockAchievement(achievementId) {
        const socket = this.connection.getSocket();
        if (socket?.connected) {
            socket.emit('achievements:unlock', { achievementId });
        }
    }
    /**
     * Update achievement progress
     */
    updateAchievementProgress(achievementId, progress) {
        const socket = this.connection.getSocket();
        if (socket?.connected) {
            socket.emit('achievements:progress', { achievementId, progress });
        }
    }
    /**
     * Get match history
     */
    async getMatchHistory(playerId, limit = 20) {
        return new Promise((resolve, reject) => {
            const socket = this.connection.getSocket();
            if (!socket?.connected) {
                resolve([]);
                return;
            }
            socket.emit('matches:history', { playerId, limit }, (response) => {
                if (response.success && response.matches) {
                    resolve(response.matches);
                }
                else {
                    resolve([]);
                }
            });
        });
    }
    /**
     * Get specific match details
     */
    async getMatch(matchId) {
        return new Promise((resolve, reject) => {
            const socket = this.connection.getSocket();
            if (!socket?.connected) {
                resolve(null);
                return;
            }
            socket.emit('matches:get', { matchId }, (response) => {
                if (response.success && response.match) {
                    resolve(response.match);
                }
                else {
                    resolve(null);
                }
            });
        });
    }
    /**
     * Submit match result (for host/server)
     */
    async submitMatchResult(result) {
        return new Promise((resolve, reject) => {
            const socket = this.connection.getSocket();
            if (!socket?.connected) {
                reject(new Error('Not connected'));
                return;
            }
            socket.emit('matches:submit', result, (response) => {
                if (response.success) {
                    resolve();
                }
                else {
                    reject(new Error(response.error || 'Failed to submit match result'));
                }
            });
        });
    }
    /**
     * Get top players for a specific stat
     */
    async getTopPlayers(stat, limit = 10) {
        return new Promise((resolve, reject) => {
            const socket = this.connection.getSocket();
            if (!socket?.connected) {
                resolve([]);
                return;
            }
            socket.emit('leaderboard:top_by_stat', { stat, limit }, (response) => {
                if (response.success && response.entries) {
                    resolve(response.entries);
                }
                else {
                    resolve([]);
                }
            });
        });
    }
    /**
     * Compare stats with another player
     */
    async compareStats(otherPlayerId) {
        return new Promise((resolve, reject) => {
            const socket = this.connection.getSocket();
            if (!socket?.connected) {
                resolve(null);
                return;
            }
            socket.emit('stats:compare', { otherPlayerId }, (response) => {
                if (response.success && response.self && response.other) {
                    resolve({ self: response.self, other: response.other });
                }
                else {
                    resolve(null);
                }
            });
        });
    }
    /**
     * Clear cache
     */
    clearCache() {
        this.leaderboardCache.clear();
        this.statsCache.clear();
        this.achievementsCache.clear();
    }
    /**
     * Dispose of leaderboard manager
     */
    dispose() {
        this.clearCache();
        this.removeAllListeners();
    }
}
export default LeaderboardManager;
