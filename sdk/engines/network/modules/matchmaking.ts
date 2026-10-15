/**
 * Matchmaking Engine Module
 *
 * Skill-based matchmaking with:
 * - Multiple queue types (ranked, casual, custom)
 * - Skill-based matching (ELO, Glicko-2 support)
 * - Queue priority and wait time balancing
 * - Party/group matchmaking
 * - Region-based matching
 * - Match found notifications
 */

import { EventEmitter } from 'events';
import type {
  MatchmakingConfig,
  MatchmakingResult,
  MatchFound,
  QueueStatus,
  QueueType,
  PlayerSkill,
  MatchedPlayer,
  RankTier,
  IMatchmakingEngine,
} from '../types';
import type { ConnectionManager } from './connection';

// Default skill values
const DEFAULT_SKILL: PlayerSkill = {
  rating: 1500,
  uncertainty: 350,
  volatility: 0.06,
  peakRating: 1500,
  gamesPlayed: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  winRate: 0,
  streak: 0,
};

// Rank tiers
const RANK_TIERS: RankTier[] = [
  { name: 'Bronze', minRating: 0, maxRating: 1199, color: '#CD7F32' },
  { name: 'Silver', minRating: 1200, maxRating: 1399, color: '#C0C0C0' },
  { name: 'Gold', minRating: 1400, maxRating: 1599, color: '#FFD700' },
  { name: 'Platinum', minRating: 1600, maxRating: 1799, color: '#00CED1' },
  { name: 'Diamond', minRating: 1800, maxRating: 1999, color: '#B9F2FF' },
  { name: 'Master', minRating: 2000, maxRating: 2199, color: '#9400D3' },
  { name: 'Grandmaster', minRating: 2200, color: '#FF4500' },
];

// Glicko-2 constants
const GLICKO2 = {
  TAU: 0.5,
  EPSILON: 0.000001,
  SCALE: 173.7178,
};

/**
 * Matchmaking Engine
 *
 * Handles queue management, skill-based matching, and party coordination.
 */
export class MatchmakingEngine extends EventEmitter implements IMatchmakingEngine {
  readonly name = 'matchmaking';

  private connection: ConnectionManager;
  private _status: QueueStatus;
  private _skill: PlayerSkill | null = null;
  private currentMatch: MatchFound | null = null;
  private queueStartTime = 0;
  private statusUpdateInterval?: NodeJS.Timeout;
  private _setupSocket: any = null;  // Track which socket handlers are bound to

  constructor(connection: ConnectionManager) {
    super();
    this.connection = connection;
    this._status = this.createInitialStatus();
    this.setupEventHandlers();
  }

  /**
   * Create initial queue status
   */
  private createInitialStatus(): QueueStatus {
    return {
      inQueue: false,
      searchTime: 0,
      skillRange: 100,
    };
  }

  /**
   * Get current queue status
   */
  get status(): QueueStatus {
    return { ...this._status };
  }

  /**
   * Initialize matchmaking engine
   */
  async init(): Promise<void> {
    // Bind socket event handlers now that connection exists
    this.setupEventHandlers();
    // Load player skill on init
    try {
      this._skill = await this.getSkill();
    } catch (error) {
      this._skill = { ...DEFAULT_SKILL };
    }
  }

  /**
   * Setup socket event handlers.
   * Public so NetworkEngine can rebind after broker/socket is injected.
   * Guards against double-registration on the same socket instance.
   */
  setupEventHandlers(): void {
    const socket = this.connection.getSocket();
    if (!socket || socket === this._setupSocket) return;
    this._setupSocket = socket;

    socket.on('matchmaking:queued', (status: QueueStatus) => {
      this._status = status;
      this._status.inQueue = true;
      this.queueStartTime = Date.now();
      this.startStatusUpdates();
      this.emit('matchmaking:queued', status);
    });

    socket.on('matchmaking:update', (status: QueueStatus) => {
      this._status = { ...this._status, ...status };
      this.emit('matchmaking:update', this._status);
    });

    socket.on('matchmaking:found', (match: MatchFound) => {
      this.currentMatch = match;
      this.emit('matchmaking:found', match);
    });

    socket.on('matchmaking:player_accepted', (playerId: number) => {
      if (this.currentMatch) {
        this.currentMatch.accepted.push(playerId);
        this.emit('matchmaking:accepted', playerId);
      }
    });

    socket.on('matchmaking:player_declined', (playerId: number) => {
      if (this.currentMatch) {
        this.currentMatch.declined.push(playerId);
        this.emit('matchmaking:declined', playerId);
      }
    });

    socket.on('matchmaking:ready', (result: MatchmakingResult) => {
      this.stopStatusUpdates();
      this._status.inQueue = false;
      this.currentMatch = null;
      this.emit('matchmaking:ready', result);
    });

    socket.on('matchmaking:cancelled', (reason: string) => {
      this.stopStatusUpdates();
      this._status.inQueue = false;
      this.currentMatch = null;
      this.emit('matchmaking:cancelled', reason);
    });

    socket.on('matchmaking:skill_update', (skill: PlayerSkill) => {
      this._skill = skill;
      this.emit('skill:updated', skill);
    });
  }

  /**
   * Join matchmaking queue
   */
  async joinQueue(config: MatchmakingConfig): Promise<void> {
    if (this._status.inQueue) {
      throw new Error('Already in queue');
    }

    return new Promise((resolve, reject) => {
      const socket = this.connection.getSocket();
      if (!socket?.connected) {
        reject(new Error('Not connected'));
        return;
      }

      socket.emit('matchmaking:join', config, (response: { success: boolean; status?: QueueStatus; error?: string }) => {
        if (response.success) {
          this._status = response.status || { ...this._status, inQueue: true };
          this.queueStartTime = Date.now();
          this.startStatusUpdates();
          resolve();
        } else {
          reject(new Error(response.error || 'Failed to join queue'));
        }
      });
    });
  }

  /**
   * Leave matchmaking queue
   */
  leaveQueue(): void {
    if (!this._status.inQueue) return;

    const socket = this.connection.getSocket();
    if (socket?.connected) {
      socket.emit('matchmaking:leave');
    }

    this.stopStatusUpdates();
    this._status = this.createInitialStatus();
    this.currentMatch = null;
    this.emit('matchmaking:left');
  }

  /**
   * Accept found match
   */
  acceptMatch(): void {
    if (!this.currentMatch) return;

    const socket = this.connection.getSocket();
    if (socket?.connected) {
      socket.emit('matchmaking:accept');
    }
  }

  /**
   * Decline found match
   */
  declineMatch(): void {
    if (!this.currentMatch) return;

    const socket = this.connection.getSocket();
    if (socket?.connected) {
      socket.emit('matchmaking:decline');
    }

    this.currentMatch = null;
  }

  /**
   * Get player skill rating
   */
  async getSkill(playerId?: number): Promise<PlayerSkill> {
    return new Promise((resolve, reject) => {
      const socket = this.connection.getSocket();
      if (!socket?.connected) {
        resolve(this._skill || { ...DEFAULT_SKILL });
        return;
      }

      socket.emit('matchmaking:get_skill', { playerId }, (response: { success: boolean; skill?: PlayerSkill; error?: string }) => {
        if (response.success && response.skill) {
          if (!playerId) {
            this._skill = response.skill;
          }
          resolve(response.skill);
        } else {
          reject(new Error(response.error || 'Failed to get skill'));
        }
      });
    });
  }

  /**
   * Get local player's cached skill
   */
  getLocalSkill(): PlayerSkill {
    return this._skill || { ...DEFAULT_SKILL };
  }

  /**
   * Get rank tier for a rating
   */
  getRankTier(rating?: number): RankTier {
    const r = rating ?? this._skill?.rating ?? 1500;
    for (let i = RANK_TIERS.length - 1; i >= 0; i--) {
      if (r >= RANK_TIERS[i].minRating) {
        return RANK_TIERS[i];
      }
    }
    return RANK_TIERS[0];
  }

  /**
   * Get all rank tiers
   */
  getAllRankTiers(): RankTier[] {
    return [...RANK_TIERS];
  }

  /**
   * Calculate expected score (ELO)
   */
  calculateExpectedScore(playerRating: number, opponentRating: number): number {
    return 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
  }

  /**
   * Calculate new ELO rating
   */
  calculateNewRating(
    currentRating: number,
    expectedScore: number,
    actualScore: number,
    kFactor: number = 32
  ): number {
    return Math.round(currentRating + kFactor * (actualScore - expectedScore));
  }

  /**
   * Update skill after match (Glicko-2)
   */
  updateSkillAfterMatch(
    result: 'win' | 'loss' | 'draw',
    opponentRating: number,
    opponentRD: number
  ): PlayerSkill {
    if (!this._skill) {
      this._skill = { ...DEFAULT_SKILL };
    }

    const score = result === 'win' ? 1 : result === 'loss' ? 0 : 0.5;

    // Simplified Glicko-2 update
    const mu = (this._skill.rating - 1500) / GLICKO2.SCALE;
    const phi = this._skill.uncertainty / GLICKO2.SCALE;
    const sigma = this._skill.volatility || 0.06;

    const muJ = (opponentRating - 1500) / GLICKO2.SCALE;
    const phiJ = opponentRD / GLICKO2.SCALE;

    // Calculate E (expected score)
    const g = 1 / Math.sqrt(1 + 3 * phiJ * phiJ / (Math.PI * Math.PI));
    const E = 1 / (1 + Math.exp(-g * (mu - muJ)));

    // Calculate v (variance)
    const v = 1 / (g * g * E * (1 - E));

    // Calculate delta
    const delta = v * g * (score - E);

    // Update volatility (simplified)
    const newSigma = sigma; // Full Glicko-2 volatility update is complex

    // Update phi (RD)
    const phiStar = Math.sqrt(phi * phi + newSigma * newSigma);
    const newPhi = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);

    // Update mu (rating)
    const newMu = mu + newPhi * newPhi * g * (score - E);

    // Convert back to rating scale
    const newRating = Math.round(newMu * GLICKO2.SCALE + 1500);
    const newRD = Math.round(newPhi * GLICKO2.SCALE);

    // Update skill object
    this._skill = {
      ...this._skill,
      rating: newRating,
      uncertainty: Math.max(30, Math.min(350, newRD)),
      volatility: newSigma,
      peakRating: Math.max(this._skill.peakRating, newRating),
      gamesPlayed: this._skill.gamesPlayed + 1,
      wins: this._skill.wins + (result === 'win' ? 1 : 0),
      losses: this._skill.losses + (result === 'loss' ? 1 : 0),
      draws: this._skill.draws + (result === 'draw' ? 1 : 0),
      winRate: (this._skill.wins + (result === 'win' ? 1 : 0)) / (this._skill.gamesPlayed + 1),
      streak: result === 'win'
        ? (this._skill.streak >= 0 ? this._skill.streak + 1 : 1)
        : result === 'loss'
          ? (this._skill.streak <= 0 ? this._skill.streak - 1 : -1)
          : 0,
      tier: this.getRankTier(newRating),
    };

    return this._skill;
  }

  /**
   * Start periodic status updates
   */
  private startStatusUpdates(): void {
    this.stopStatusUpdates();

    this.statusUpdateInterval = setInterval(() => {
      if (this._status.inQueue) {
        this._status.searchTime = Date.now() - this.queueStartTime;

        // Expand skill range over time
        const waitMinutes = this._status.searchTime / 60000;
        this._status.skillRange = Math.min(500, 100 + waitMinutes * 50);

        this.emit('matchmaking:update', this._status);
      }
    }, 1000);
  }

  /**
   * Stop status updates
   */
  private stopStatusUpdates(): void {
    if (this.statusUpdateInterval) {
      clearInterval(this.statusUpdateInterval);
      this.statusUpdateInterval = undefined;
    }
  }

  /**
   * Get estimated wait time based on current players
   */
  async getEstimatedWaitTime(queueType: QueueType, gameMode: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const socket = this.connection.getSocket();
      if (!socket?.connected) {
        resolve(60000); // Default 1 minute
        return;
      }

      socket.emit('matchmaking:estimate_wait', { queueType, gameMode }, (response: { success: boolean; estimatedWait?: number; error?: string }) => {
        if (response.success) {
          resolve(response.estimatedWait || 60000);
        } else {
          resolve(60000);
        }
      });
    });
  }

  /**
   * Get queue population
   */
  async getQueuePopulation(queueType: QueueType, gameMode: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const socket = this.connection.getSocket();
      if (!socket?.connected) {
        resolve(0);
        return;
      }

      socket.emit('matchmaking:queue_population', { queueType, gameMode }, (response: { success: boolean; count?: number; error?: string }) => {
        if (response.success) {
          resolve(response.count || 0);
        } else {
          resolve(0);
        }
      });
    });
  }

  /**
   * Get match quality estimate
   */
  calculateMatchQuality(players: MatchedPlayer[]): number {
    if (players.length < 2) return 0;

    const ratings = players.map(p => p.skill.rating);
    const avgRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    const maxDiff = Math.max(...ratings.map(r => Math.abs(r - avgRating)));

    // Quality is inversely proportional to skill spread
    // 100 = perfect match, 0 = very unbalanced
    const quality = Math.max(0, 100 - maxDiff / 3);
    return Math.round(quality);
  }

  /**
   * Dispose of matchmaking engine
   */
  dispose(): void {
    this.leaveQueue();
    this.stopStatusUpdates();
    this.removeAllListeners();
  }
}

export default MatchmakingEngine;
