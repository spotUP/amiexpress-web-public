/**
 * Player Presence Module
 *
 * Online status and activity tracking with:
 * - Presence states (online, away, busy, invisible, offline)
 * - Activity tracking (in menu, in game, spectating)
 * - Rich presence (show current game/room)
 * - Auto-away detection
 * - Presence broadcasting and subscriptions
 */
import { EventEmitter } from 'events';
// Default presence configuration
const DEFAULT_CONFIG = {
    autoAway: true,
    autoAwayTimeout: 300000, // 5 minutes
    showActivity: true,
    showGame: true,
    allowInvites: true,
};
/**
 * Presence Manager
 *
 * Manages player online status and activity visibility.
 */
export class PresenceManager extends EventEmitter {
    constructor(connection, config = {}) {
        super();
        this.name = 'presence';
        this._self = null;
        this.subscriptions = new Set();
        this.presenceCache = new Map();
        this.lastActivity = Date.now();
        this.connection = connection;
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.setupEventHandlers();
    }
    /**
     * Get self presence
     */
    get self() {
        return this._self;
    }
    /**
     * Initialize presence manager
     */
    async init() {
        this.startAutoAway();
    }
    /**
     * Setup socket event handlers
     */
    setupEventHandlers() {
        const socket = this.connection.getSocket();
        if (!socket)
            return;
        socket.on('presence:update', (presence) => {
            this.presenceCache.set(presence.playerId, presence);
            if (this._self && presence.playerId === this._self.playerId) {
                this._self = presence;
            }
            this.emit('presence:update', presence);
        });
        socket.on('presence:offline', (playerId) => {
            const presence = this.presenceCache.get(playerId);
            if (presence) {
                presence.status = 'offline';
                presence.lastSeen = new Date();
                this.emit('presence:update', presence);
            }
        });
        socket.on('presence:batch', (updates) => {
            for (const presence of updates) {
                this.presenceCache.set(presence.playerId, presence);
                this.emit('presence:update', presence);
            }
        });
    }
    /**
     * Set own status
     */
    setStatus(status) {
        if (!this._self) {
            this._self = this.createDefaultPresence();
        }
        this._self.status = status;
        this.broadcastPresence();
    }
    /**
     * Set own activity
     */
    setActivity(activity) {
        if (!this._self) {
            this._self = this.createDefaultPresence();
        }
        this._self.activity = activity;
        this.broadcastPresence();
    }
    /**
     * Set custom status message
     */
    setCustomStatus(status) {
        if (!this._self) {
            this._self = this.createDefaultPresence();
        }
        this._self.customStatus = status;
        this.broadcastPresence();
    }
    /**
     * Set game activity
     */
    setGameActivity(game, details, partySize, partyMax) {
        if (!this.config.showGame)
            return;
        this.setActivity({
            type: 'in-game',
            game,
            details,
            partySize,
            partyMax,
            startedAt: new Date(),
        });
    }
    /**
     * Set lobby activity
     */
    setLobbyActivity(roomName, details) {
        this.setActivity({
            type: 'in-lobby',
            room: roomName,
            details,
            startedAt: new Date(),
        });
    }
    /**
     * Set spectating activity
     */
    setSpectatingActivity(game, roomName) {
        this.setActivity({
            type: 'spectating',
            game,
            room: roomName,
            startedAt: new Date(),
        });
    }
    /**
     * Clear activity (go idle)
     */
    clearActivity() {
        this.setActivity({
            type: 'idle',
            startedAt: new Date(),
        });
    }
    /**
     * Get presence for a player
     */
    async getPresence(playerId) {
        // Check cache first
        const cached = this.presenceCache.get(playerId);
        if (cached && Date.now() - cached.lastSeen.getTime() < 30000) {
            return cached;
        }
        return new Promise((resolve, reject) => {
            const socket = this.connection.getSocket();
            if (!socket?.connected) {
                resolve(cached || null);
                return;
            }
            socket.emit('presence:get', { playerId }, (response) => {
                if (response.success && response.presence) {
                    this.presenceCache.set(playerId, response.presence);
                    resolve(response.presence);
                }
                else {
                    resolve(cached || null);
                }
            });
        });
    }
    /**
     * Get multiple presences
     */
    async getPresences(playerIds) {
        return new Promise((resolve, reject) => {
            const socket = this.connection.getSocket();
            if (!socket?.connected) {
                const result = new Map();
                for (const id of playerIds) {
                    const cached = this.presenceCache.get(id);
                    if (cached)
                        result.set(id, cached);
                }
                resolve(result);
                return;
            }
            socket.emit('presence:get_batch', { playerIds }, (response) => {
                const result = new Map();
                if (response.success && response.presences) {
                    for (const presence of response.presences) {
                        this.presenceCache.set(presence.playerId, presence);
                        result.set(presence.playerId, presence);
                    }
                }
                resolve(result);
            });
        });
    }
    /**
     * Subscribe to presence updates for players
     */
    subscribe(playerIds) {
        const newIds = playerIds.filter(id => !this.subscriptions.has(id));
        if (newIds.length === 0)
            return;
        for (const id of newIds) {
            this.subscriptions.add(id);
        }
        const socket = this.connection.getSocket();
        if (socket?.connected) {
            socket.emit('presence:subscribe', { playerIds: newIds });
        }
    }
    /**
     * Unsubscribe from presence updates
     */
    unsubscribe(playerIds) {
        const removedIds = playerIds.filter(id => this.subscriptions.has(id));
        if (removedIds.length === 0)
            return;
        for (const id of removedIds) {
            this.subscriptions.delete(id);
        }
        const socket = this.connection.getSocket();
        if (socket?.connected) {
            socket.emit('presence:unsubscribe', { playerIds: removedIds });
        }
    }
    /**
     * Broadcast own presence to server
     */
    broadcastPresence() {
        if (!this._self)
            return;
        const socket = this.connection.getSocket();
        if (socket?.connected) {
            socket.emit('presence:update', this._self);
        }
    }
    /**
     * Create default presence
     */
    createDefaultPresence() {
        return {
            playerId: 0, // Will be set by server
            username: '',
            status: 'online',
            activity: {
                type: 'idle',
            },
            lastSeen: new Date(),
            platform: 'web',
        };
    }
    /**
     * Record activity (for auto-away)
     */
    recordActivity() {
        this.lastActivity = Date.now();
        if (this._self?.status === 'away') {
            this.setStatus('online');
        }
    }
    /**
     * Start auto-away timer
     */
    startAutoAway() {
        if (!this.config.autoAway)
            return;
        this.stopAutoAway();
        this.awayTimer = setInterval(() => {
            if (this._self?.status === 'online') {
                const idle = Date.now() - this.lastActivity;
                if (idle >= this.config.autoAwayTimeout) {
                    this.setStatus('away');
                }
            }
        }, 30000); // Check every 30 seconds
    }
    /**
     * Stop auto-away timer
     */
    stopAutoAway() {
        if (this.awayTimer) {
            clearInterval(this.awayTimer);
            this.awayTimer = undefined;
        }
    }
    /**
     * Configure presence manager
     */
    configure(config) {
        this.config = { ...this.config, ...config };
        if (config.autoAway !== undefined) {
            this.stopAutoAway();
            if (config.autoAway) {
                this.startAutoAway();
            }
        }
    }
    /**
     * Get all subscribed player IDs
     */
    getSubscriptions() {
        return Array.from(this.subscriptions);
    }
    /**
     * Get cached presence
     */
    getCached(playerId) {
        return this.presenceCache.get(playerId);
    }
    /**
     * Clear presence cache
     */
    clearCache() {
        this.presenceCache.clear();
    }
    /**
     * Dispose of presence manager
     */
    dispose() {
        this.stopAutoAway();
        this.subscriptions.clear();
        this.presenceCache.clear();
        this._self = null;
        this.removeAllListeners();
    }
}
export default PresenceManager;
