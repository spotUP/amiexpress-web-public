/**
 * Network Manager
 *
 * Wraps SDK NetworkEngine for GRANDMASTER multiplayer
 * Includes state sync, client prediction, and rollback netcode
 */

import { NetworkEngine } from '@amiexpress/bbs-door-sdk/engines/network/network-engine';
import type { GameState, GameMode, Board } from '../core/types';
import type { OpponentState } from '../ui/minimap';
import { StateSyncManager, StateInterpolator, type SyncPacket } from './sync';
import { PredictionManager, InputEncoder, type InputType } from './prediction';
import { RollbackManager } from './rollback';
import type { GameEngine } from '../core/game';

/**
 * Multiplayer game mode
 */
export type MultiplayerMode = 'versus_1v1' | 'team_2v2' | 'battle_royale';

/**
 * Match state
 */
export interface MatchState {
  mode: MultiplayerMode;
  matchId: string;
  players: PlayerInfo[];
  status: 'waiting' | 'countdown' | 'playing' | 'finished';
  startTime: number | null;
  winner: string | null;
}

/**
 * Player info
 */
export interface PlayerInfo {
  id: string;
  name: string;
  rank: number;
  rating: number;
  ready: boolean;
  isBot?: boolean;  // Is this a bot player?
  botDifficulty?: number;  // Bot difficulty (1-10)
}

/**
 * Game update packet
 */
export interface GameUpdate {
  playerId: string;
  timestamp: number;
  board: Board;
  level: number;
  score: number;
  grade: string;
  combo: number;
  attacking: boolean;
}

/**
 * Attack packet
 */
export interface AttackPacket {
  from: string;
  to: string | null;  // null = random opponent
  lines: number;
  type: 'single' | 'double' | 'triple' | 'tetris' | 'tspin' | 'perfect_clear';
  combo: number;
  backToBack: boolean;
}

/**
 * Grandmaster Network Manager
 */
export class GrandmasterNetworkManager {
  private network: NetworkEngine;
  private matchState: MatchState | null = null;
  private localPlayerId: string | null = null;
  private opponentStates: Map<string, OpponentState> = new Map();
  private updateCallbacks: Set<(update: GameUpdate) => void> = new Set();
  private attackCallbacks: Set<(attack: AttackPacket) => void> = new Set();

  // Netcode systems (optional, for competitive multiplayer)
  private syncManager: StateSyncManager | null = null;
  private predictionManager: PredictionManager | null = null;
  private rollbackManager: RollbackManager | null = null;
  private interpolator: StateInterpolator | null = null;
  private gameEngine: GameEngine | null = null;

  constructor(bbsSession: any) {
    this.network = new NetworkEngine(bbsSession.socket);
    this.setupEventListeners();
  }

  /**
   * Setup network event listeners
   */
  private setupEventListeners(): void {
    // Player joined match
    this.network.on('player:joined', (player: PlayerInfo) => {
      if (this.matchState) {
        this.matchState.players.push(player);
      }
    });

    // Player left match
    this.network.on('player:left', (playerId: string) => {
      if (this.matchState) {
        this.matchState.players = this.matchState.players.filter(p => p.id !== playerId);
      }
      this.opponentStates.delete(playerId);
    });

    // Game update from opponent
    this.network.on('game:update', (update: GameUpdate) => {
      // Update opponent state
      const existing = this.opponentStates.get(update.playerId);
      if (existing) {
        existing.board = update.board;
        existing.level = update.level;
        existing.grade = update.grade;
      }

      // Notify callbacks
      this.updateCallbacks.forEach(cb => cb(update));
    });

    // Attack received
    this.network.on('game:attack', (attack: AttackPacket) => {
      this.attackCallbacks.forEach(cb => cb(attack));
    });

    // Match started
    this.network.on('match:started', () => {
      if (this.matchState) {
        this.matchState.status = 'playing';
        this.matchState.startTime = Date.now();
      }
    });

    // Match finished
    this.network.on('match:finished', (winnerId: string) => {
      if (this.matchState) {
        this.matchState.status = 'finished';
        this.matchState.winner = winnerId;
      }
    });
  }

  /**
   * Join matchmaking queue
   */
  async joinQueue(mode: MultiplayerMode): Promise<void> {
    await this.network.joinQueue({
      gameMode: mode,
    });
  }

  /**
   * Leave matchmaking queue
   */
  async leaveQueue(): Promise<void> {
    await this.network.leaveQueue();
  }

  /**
   * Create custom lobby
   */
  async createLobby(mode: MultiplayerMode, isPrivate: boolean = false): Promise<string> {
    const lobby = await this.network.createLobby({
      name: 'GRANDMASTER Match',
      maxPlayers: mode === 'battle_royale' ? 99 : mode === 'team_2v2' ? 4 : 2,
      isPrivate,
    });

    return lobby.id;
  }

  /**
   * Join lobby by ID
   */
  async joinLobby(lobbyId: string): Promise<void> {
    await this.network.joinLobby(lobbyId);
  }

  /**
   * Set ready status in lobby
   */
  async setReady(ready: boolean): Promise<void> {
    this.network.setReady(ready);
  }

  /**
   * Start match (host only)
   * Note: In a full implementation, this would be handled server-side
   */
  async startMatch(): Promise<void> {
    // Emit a custom event that the server would handle
    this.network.emit('match:start', {});
  }

  /**
   * Send game state update
   */
  sendUpdate(gameState: GameState): void {
    if (!this.localPlayerId) return;

    const update: GameUpdate = {
      playerId: this.localPlayerId,
      timestamp: Date.now(),
      board: gameState.board,
      level: gameState.level,
      score: gameState.score,
      grade: gameState.grade,
      combo: gameState.combo,
      attacking: gameState.combo > 0,
    };

    this.network.emit('game:update', update);
  }

  /**
   * Send attack to opponent(s)
   */
  sendAttack(attack: AttackPacket): void {
    this.network.emit('game:attack', attack);
  }

  /**
   * Get current opponent states
   */
  getOpponents(): OpponentState[] {
    return Array.from(this.opponentStates.values());
  }

  /**
   * Subscribe to game updates
   */
  onUpdate(callback: (update: GameUpdate) => void): () => void {
    this.updateCallbacks.add(callback);
    return () => this.updateCallbacks.delete(callback);
  }

  /**
   * Subscribe to attacks
   */
  onAttack(callback: (attack: AttackPacket) => void): () => void {
    this.attackCallbacks.add(callback);
    return () => this.attackCallbacks.delete(callback);
  }

  /**
   * Get match state
   */
  getMatchState(): MatchState | null {
    return this.matchState;
  }

  /**
   * Subscribe to network events
   */
  on(event: string, callback: (...args: any[]) => void): void {
    this.network.on(event, callback);
  }

  /**
   * Emit network event
   */
  emit(event: string, ...args: any[]): void {
    this.network.emit(event, ...args);
  }

  /**
   * Enable competitive netcode (prediction + rollback)
   * Call this before starting a competitive match
   */
  enableNetcode(engine: GameEngine): void {
    this.gameEngine = engine;
    this.syncManager = new StateSyncManager();
    this.predictionManager = new PredictionManager(engine);
    this.rollbackManager = new RollbackManager(engine, this.predictionManager);
    this.interpolator = new StateInterpolator();

    // Setup sync packet listeners
    this.network.on('state:sync', (packet: SyncPacket) => {
      this.handleSyncPacket(packet);
    });

    // Setup input acknowledgments
    this.network.on('input:ack', (data: { inputId: number; serverFrame: number }) => {
      this.predictionManager?.onInputAck(data.inputId, data.serverFrame);
    });
  }

  /**
   * Disable netcode (back to simple state sync)
   */
  disableNetcode(): void {
    this.syncManager = null;
    this.predictionManager = null;
    this.rollbackManager = null;
    this.interpolator = null;
    this.gameEngine = null;
  }

  /**
   * Handle player input with prediction
   */
  handleInput(inputType: InputType, timestamp: number): void {
    if (!this.predictionManager) {
      // No prediction, ignore
      return;
    }

    // Add to prediction buffer
    const inputId = this.predictionManager.addInput(inputType, timestamp);

    // Send to server
    const input = this.predictionManager.getInput(inputId);
    if (input) {
      const encoded = InputEncoder.encode(input);
      this.network.emit('game:input', { input: encoded });
    }
  }

  /**
   * Process predictions (call every frame)
   */
  processPredictions(currentTime: number): void {
    if (!this.predictionManager) return;

    // Apply pending inputs
    this.predictionManager.processPendingInputs(currentTime);

    // Create snapshot
    this.predictionManager.createSnapshot();
  }

  /**
   * Handle sync packet from server
   */
  private handleSyncPacket(packet: SyncPacket): void {
    if (!this.syncManager || !this.rollbackManager || !this.interpolator) return;

    // Add to interpolation buffer
    if (packet.type === 'full_state') {
      this.interpolator.addState(packet.state, packet.timestamp);
    } else if (packet.type === 'delta_state') {
      const currentState = this.gameEngine?.getState();
      if (currentState) {
        const newState = this.syncManager.applySyncPacket(packet, currentState);
        this.interpolator.addState(newState, packet.timestamp);
      }
    }

    // Check for rollback
    const currentFrame = this.syncManager.getFrame();
    this.rollbackManager.handleServerUpdate(packet, currentFrame);
  }

  /**
   * Send state sync (server only)
   */
  sendStateSync(state: GameState, currentTime: number): void {
    if (!this.syncManager) return;

    if (this.syncManager.shouldSync(currentTime)) {
      const packet = this.syncManager.createSyncPacket(state, currentTime);
      this.network.emit('state:sync', packet);
    }
  }

  /**
   * Get interpolated state for rendering
   */
  getInterpolatedState(currentTime: number): GameState | null {
    if (!this.interpolator) return null;
    return this.interpolator.getInterpolatedState(currentTime);
  }

  /**
   * Get netcode stats
   */
  getNetcodeStats(): {
    sync: any;
    prediction: any;
    rollback: any;
  } | null {
    if (!this.syncManager || !this.predictionManager || !this.rollbackManager) {
      return null;
    }

    return {
      sync: {
        frame: this.syncManager.getFrame(),
      },
      prediction: this.predictionManager.getStats(),
      rollback: this.rollbackManager.getStats(),
    };
  }

  /**
   * Is netcode enabled?
   */
  isNetcodeEnabled(): boolean {
    return this.syncManager !== null;
  }

  /**
   * Disconnect
   */
  disconnect(): void {
    this.network.disconnect();
  }
}
