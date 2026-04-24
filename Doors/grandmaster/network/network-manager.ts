/**
 * Network Manager
 *
 * Wraps SDK NetworkEngine for GRANDMASTER multiplayer
 * Includes state sync, client prediction, and rollback netcode
 */

import { NetworkEngine } from '@amiexpress/bbs-door-sdk/engines/network/network-engine';
import { EventEmitter } from 'events';
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
export class GrandmasterNetworkManager extends EventEmitter {
  private network: NetworkEngine;
  private matchState: MatchState | null = null;
  private localPlayerId: string | null = null;
  private localPlayerName: string = 'Player';
  private localPlayerNumericId: number = 0;
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
    super();
    this.network = new NetworkEngine();
    // Get player info from session
    this.localPlayerId = bbsSession.user?.id || `player-${Date.now()}`;
    this.localPlayerName = bbsSession.user?.username || 'Player';
    // Generate a stable numeric ID from user ID for SDK lobby system
    this.localPlayerNumericId = typeof bbsSession.user?.id === 'number'
      ? bbsSession.user.id
      : this.hashStringToNumber(this.localPlayerId || 'unknown');

    // Connect via in-process broker for BBS multiplayer
    const nodeId = bbsSession.bbsSession?.nodeNumber ?? bbsSession.nodeNumber ?? 1;
    this.network.connectBroker({
      playerId: this.localPlayerNumericId,
      playerName: this.localPlayerName,
      nodeId,
    });

    this.setupEventListeners();
  }

  /**
   * Generate a stable numeric hash from a string ID
   */
  private hashStringToNumber(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Setup network event listeners
   * Hooks into SDK lobby system events to keep matchState in sync
   */
  private setupEventListeners(): void {
    const lobby = this.network.lobby;

    // Lobby created - sync initial state
    lobby.on('lobby:created', () => {
      this.syncMatchStateFromLobby();
    });

    // Lobby joined - sync state
    lobby.on('lobby:joined', () => {
      this.syncMatchStateFromLobby();
    });

    // Lobby updated - resync
    lobby.on('lobby:updated', () => {
      this.syncMatchStateFromLobby();
    });

    // Player joined lobby
    lobby.on('player:joined', () => {
      this.syncMatchStateFromLobby();
    });

    // Player left lobby
    lobby.on('player:left', (player: any) => {
      const playerId = String(player?.id ?? player);
      this.opponentStates.delete(playerId);
      this.syncMatchStateFromLobby();
    });

    // Player ready state changed
    lobby.on('player:ready', () => {
      this.syncMatchStateFromLobby();
    });

    // Game starting
    lobby.on('game:starting', () => {
      if (this.matchState) {
        this.matchState.status = 'countdown';
      }
    });

    // Game started
    lobby.on('game:start', () => {
      if (this.matchState) {
        this.matchState.status = 'playing';
        this.matchState.startTime = Date.now();
      }
    });

    // Game update from opponent (via broker)
    const socket = this.network.connection.getSocket();
    if (socket) {
      socket.on('game:update', (update: GameUpdate) => {
        // Update opponent state
        const existing = this.opponentStates.get(update.playerId);
        if (existing) {
          existing.board = update.board;
          existing.level = update.level;
          existing.grade = update.grade;
        }
        this.updateCallbacks.forEach(cb => cb(update));
      });

      socket.on('game:attack', (attack: AttackPacket) => {
        this.attackCallbacks.forEach(cb => cb(attack));
      });
    }

    // Match finished
    this.network.on('match:finished', (winnerId: string) => {
      if (this.matchState) {
        this.matchState.status = 'finished';
        this.matchState.winner = winnerId;
      }
    });
  }

  /**
   * Sync matchState from SDK lobby.current
   * Translates LobbyPlayer (numeric ID) to PlayerInfo (string ID)
   */
  private syncMatchStateFromLobby(): void {
    const lobby = this.network.lobby.current;
    if (!lobby) return;

    const players: PlayerInfo[] = lobby.players.map(p => ({
      id: String(p.id),
      name: p.username,
      rank: 1,
      rating: 1000,
      ready: p.ready,
      isBot: false,
    }));

    const prevPlayerCount = this.matchState?.players.length ?? 0;

    if (this.matchState) {
      this.matchState.players = players;
      this.matchState.matchId = lobby.id;
    } else {
      this.matchState = {
        mode: (lobby.settings?.mode as MultiplayerMode) || 'versus_1v1',
        matchId: lobby.id,
        players,
        status: lobby.state === 'playing' ? 'playing' : lobby.state === 'countdown' || lobby.state === 'starting' ? 'countdown' : 'waiting',
        startTime: null,
        winner: null,
      };
    }

    // Update opponent states for non-local players
    for (const p of lobby.players) {
      const pid = String(p.id);
      if (pid !== this.localPlayerId && !this.opponentStates.has(pid)) {
        this.opponentStates.set(pid, {
          id: pid,
          name: p.username,
          board: {
            width: 10,
            height: 20,
            grid: Array(20).fill(null).map(() => Array(10).fill(0)),
          },
          level: 1,
          grade: '9',
          alive: true,
        });
      }
    }

    // Emit events so the lobby adapter can update the UI
    if (players.length > prevPlayerCount) {
      const newPlayers = players.slice(prevPlayerCount);
      for (const p of newPlayers) {
        this.emit('player:joined', p);
      }
    }
    this.emit('lobby:updated');

    console.log(`[GrandmasterNetworkManager] syncMatchState: ${players.length} players in lobby ${lobby.id}`);
  }

  /**
   * Join matchmaking queue
   * Uses atomic broker matchmaking to find or create a lobby
   */
  async joinQueue(mode: MultiplayerMode): Promise<void> {
    console.log(`[GrandmasterNetworkManager] joinQueue called, mode=${mode}, localPlayerId=${this.localPlayerId}`);

    const modeMaxPlayers: Record<string, number> = {
      versus_1v1: 2,
      team_2v2: 4,
      battle_royale: 99,
    };

    const lobby = await this.network.lobby.matchmake({
      name: 'GRANDMASTER Match',
      maxPlayers: modeMaxPlayers[mode] || 2,
      isPrivate: false,
      settings: { mode, customRules: {} },
    }, mode);

    console.log(`[GrandmasterNetworkManager] Matchmaking result: lobby=${lobby.id}, players=${lobby.players.length}`);
  }

  /**
   * Leave matchmaking queue
   */
  async leaveQueue(): Promise<void> {
    await this.network.leaveQueue();
  }

  /**
   * Create custom lobby via SDK broker
   */
  async createLobby(mode: MultiplayerMode, isPrivate: boolean = false): Promise<string> {
    console.log(`[GrandmasterNetworkManager] createLobby called, mode=${mode}, localPlayerId=${this.localPlayerId}`);

    const lobby = await this.network.createLobby({
      name: 'GRANDMASTER Match',
      maxPlayers: mode === 'battle_royale' ? 99 : mode === 'team_2v2' ? 4 : 2,
      isPrivate,
      settings: { mode, customRules: {} },
    });

    console.log(`[GrandmasterNetworkManager] Lobby created: ${lobby.id}, players: ${lobby.players.length}`);
    return lobby.id;
  }

  /**
   * Join lobby by ID
   */
  async joinLobby(lobbyId: string): Promise<void> {
    console.log(`[GrandmasterNetworkManager] joinLobby called, lobbyId=${lobbyId}`);
    await this.network.joinLobby(lobbyId);
    // matchState will be synced via lobby:joined event handler
  }

  /**
   * Leave current lobby
   */
  async leaveLobby(): Promise<void> {
    console.log(`[GrandmasterNetworkManager] leaveLobby called`);
    await this.network.leaveLobby();
    this.matchState = null;
    this.opponentStates.clear();
  }

  /**
   * List available lobbies
   */
  async listLobbies(): Promise<Array<{ id: string; name: string; players: number; maxPlayers: number; mode: string }>> {
    const lobbies = await this.network.lobby.listLobbies();
    return lobbies.map(l => ({
      id: l.id,
      name: l.name,
      players: l.players.length,
      maxPlayers: l.maxPlayers,
      mode: l.settings?.mode || 'unknown',
    }));
  }

  /**
   * Set ready status in lobby
   */
  async setReady(ready: boolean): Promise<void> {
    // Update local state
    if (this.matchState && this.localPlayerId) {
      const localPlayer = this.matchState.players.find(p => p.id === this.localPlayerId);
      if (localPlayer) {
        localPlayer.ready = ready;
        console.log(`[GrandmasterNetworkManager] setReady: ${ready} for ${this.localPlayerId}`);
      }
    }
    this.network.setReady(ready);
  }

  /**
   * Start match (host only)
   * Uses SDK lobby system's countdown mechanism
   */
  async startMatch(): Promise<void> {
    console.log(`[GrandmasterNetworkManager] startMatch called`);
    this.network.lobby.startCountdown(3);
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
   * Subscribe to network engine events (forwarded, not local)
   */
  onNetwork(event: string, callback: (...args: any[]) => void): void {
    this.network.on(event, callback);
  }

  /**
   * Emit to network engine (forwarded to broker)
   */
  emitNetwork(event: string, ...args: any[]): void {
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
