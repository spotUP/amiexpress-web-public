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
import type {
  PlayerPresence,
  PlayerStatus,
  PlayerActivity,
  ActivityType,
  PresenceConfig,
  IPresenceManager,
} from '../types';
import type { ConnectionManager } from './connection';

// Default presence configuration
const DEFAULT_CONFIG: Required<PresenceConfig> = {
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
export class PresenceManager extends EventEmitter implements IPresenceManager {
  readonly name = 'presence';

  private connection: ConnectionManager;
  private config: Required<PresenceConfig>;
  private _self: PlayerPresence | null = null;
  private subscriptions: Set<number> = new Set();
  private presenceCache: Map<number, PlayerPresence> = new Map();
  private lastActivity = Date.now();
  private awayTimer?: NodeJS.Timeout;

  constructor(connection: ConnectionManager, config: Partial<PresenceConfig> = {}) {
    super();
    this.connection = connection;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.setupEventHandlers();
  }

  /**
   * Get self presence
   */
  get self(): PlayerPresence | null {
    return this._self;
  }

  /**
   * Initialize presence manager
   */
  async init(): Promise<void> {
    this.startAutoAway();
  }

  /**
   * Setup socket event handlers
   */
  private setupEventHandlers(): void {
    const socket = this.connection.getSocket();
    if (!socket) return;

    socket.on('presence:update', (presence: PlayerPresence) => {
      this.presenceCache.set(presence.playerId, presence);

      if (this._self && presence.playerId === this._self.playerId) {
        this._self = presence;
      }

      this.emit('presence:update', presence);
    });

    socket.on('presence:offline', (playerId: number) => {
      const presence = this.presenceCache.get(playerId);
      if (presence) {
        presence.status = 'offline';
        presence.lastSeen = new Date();
        this.emit('presence:update', presence);
      }
    });

    socket.on('presence:batch', (updates: PlayerPresence[]) => {
      for (const presence of updates) {
        this.presenceCache.set(presence.playerId, presence);
        this.emit('presence:update', presence);
      }
    });
  }

  /**
   * Set own status
   */
  setStatus(status: PlayerStatus): void {
    if (!this._self) {
      this._self = this.createDefaultPresence();
    }

    this._self.status = status;
    this.broadcastPresence();
  }

  /**
   * Set own activity
   */
  setActivity(activity: PlayerActivity): void {
    if (!this._self) {
      this._self = this.createDefaultPresence();
    }

    this._self.activity = activity;
    this.broadcastPresence();
  }

  /**
   * Set custom status message
   */
  setCustomStatus(status: string): void {
    if (!this._self) {
      this._self = this.createDefaultPresence();
    }

    this._self.customStatus = status;
    this.broadcastPresence();
  }

  /**
   * Set game activity
   */
  setGameActivity(game: string, details?: string, partySize?: number, partyMax?: number): void {
    if (!this.config.showGame) return;

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
  setLobbyActivity(roomName: string, details?: string): void {
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
  setSpectatingActivity(game: string, roomName?: string): void {
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
  clearActivity(): void {
    this.setActivity({
      type: 'idle',
      startedAt: new Date(),
    });
  }

  /**
   * Get presence for a player
   */
  async getPresence(playerId: number): Promise<PlayerPresence | null> {
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

      socket.emit('presence:get', { playerId }, (response: { success: boolean; presence?: PlayerPresence; error?: string }) => {
        if (response.success && response.presence) {
          this.presenceCache.set(playerId, response.presence);
          resolve(response.presence);
        } else {
          resolve(cached || null);
        }
      });
    });
  }

  /**
   * Get multiple presences
   */
  async getPresences(playerIds: number[]): Promise<Map<number, PlayerPresence>> {
    return new Promise((resolve, reject) => {
      const socket = this.connection.getSocket();
      if (!socket?.connected) {
        const result = new Map<number, PlayerPresence>();
        for (const id of playerIds) {
          const cached = this.presenceCache.get(id);
          if (cached) result.set(id, cached);
        }
        resolve(result);
        return;
      }

      socket.emit('presence:get_batch', { playerIds }, (response: { success: boolean; presences?: PlayerPresence[]; error?: string }) => {
        const result = new Map<number, PlayerPresence>();
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
  subscribe(playerIds: number[]): void {
    const newIds = playerIds.filter(id => !this.subscriptions.has(id));
    if (newIds.length === 0) return;

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
  unsubscribe(playerIds: number[]): void {
    const removedIds = playerIds.filter(id => this.subscriptions.has(id));
    if (removedIds.length === 0) return;

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
  private broadcastPresence(): void {
    if (!this._self) return;

    const socket = this.connection.getSocket();
    if (socket?.connected) {
      socket.emit('presence:update', this._self);
    }
  }

  /**
   * Create default presence
   */
  private createDefaultPresence(): PlayerPresence {
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
  recordActivity(): void {
    this.lastActivity = Date.now();

    if (this._self?.status === 'away') {
      this.setStatus('online');
    }
  }

  /**
   * Start auto-away timer
   */
  private startAutoAway(): void {
    if (!this.config.autoAway) return;

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
  private stopAutoAway(): void {
    if (this.awayTimer) {
      clearInterval(this.awayTimer);
      this.awayTimer = undefined;
    }
  }

  /**
   * Configure presence manager
   */
  configure(config: Partial<PresenceConfig>): void {
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
  getSubscriptions(): number[] {
    return Array.from(this.subscriptions);
  }

  /**
   * Get cached presence
   */
  getCached(playerId: number): PlayerPresence | undefined {
    return this.presenceCache.get(playerId);
  }

  /**
   * Clear presence cache
   */
  clearCache(): void {
    this.presenceCache.clear();
  }

  /**
   * Dispose of presence manager
   */
  dispose(): void {
    this.stopAutoAway();
    this.subscriptions.clear();
    this.presenceCache.clear();
    this._self = null;
    this.removeAllListeners();
  }
}

export default PresenceManager;
